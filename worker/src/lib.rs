//! Atelier 的 Cloudflare Worker：订阅状态和邮件通知，不接管静态页面。
//! Atelier Cloudflare Worker: consent and update mail, not static page rendering.

mod domain;
mod mail;
mod store;

use domain::{escape_html, normalize_email, normalize_locale, validate_campaign};
use futures_util::StreamExt;
use getrandom::fill;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use store::{CampaignWrite, Store, SubscribeOutcome};
use worker::*;

/// 确认令牌有效期。 / Confirmation token lifetime.
const CONFIRM_TTL_MS: i64 = 24 * 60 * 60 * 1000;
/// 定时触发单批大小。 / Bounded scheduled batch size.
const SEND_BATCH_SIZE: i32 = 20;
/// 租约过期后结果视为未知。 / Treat expired leases as ambiguous.
const SEND_LEASE_MS: i64 = 2 * 60 * 1000;
/// 明确被拒绝的邮件最多自动重试五次。 / Explicitly rejected mail is retried at most five times.
const MAX_SEND_ATTEMPTS: i64 = 5;

/// 将平台明确拒绝与结果不明分开处理。 / Separate explicit provider rejection from ambiguous outcomes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MailFailure {
    Retry { delay_ms: i64, reason: &'static str },
    Skip,
    Unknown,
}

/// 订阅表单字段。 / Native or JSON subscription fields.
#[derive(Deserialize)]
struct SubscribeInput {
    email: String,
    locale: String,
}

/// CI 创建的可编辑 HTML 通知。 / CI-authored editable HTML notification.
#[derive(Deserialize)]
struct NotifyInput {
    id: String,
    subject: String,
    html: String,
    send: bool,
}

/// 公开页面由 Cloudflare Static Assets 直接提供，Rust 只处理 API。
/// Static Assets serves public pages directly; Rust handles only API requests.
#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    match (req.method(), path.as_str()) {
        (Method::Get, "/api/health") => {
            json_reply(200, json!({ "ok": true, "service": "atelier-worker" }))
        }
        (Method::Post, "/api/subscribe") => subscribe(req, env).await,
        (Method::Get, "/api/confirm") => confirmation_page(req, env).await,
        (Method::Post, "/api/confirm") => confirm(req, env).await,
        (Method::Get, "/api/unsubscribe") => unsubscribe_page(req),
        (Method::Post, "/api/unsubscribe") => unsubscribe(req, env).await,
        (Method::Post, "/api/admin/notify") => notify(req, env).await,
        (Method::Get, "/api/admin/status") => campaign_status(req, env).await,
        _ => Response::error("Not found", 404),
    }
}

/// 定时处理小批量邮件，不使正文页面依赖 D1 或发件服务。
/// Dispatch bounded mail batches without making published pages depend on D1 or email.
#[event(scheduled)]
pub async fn scheduled(_event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    if let Err(error) = dispatch(&env).await {
        console_error!("Atelier mail dispatch failed: {}", error);
    }
}

/// 双重确认申请；所有已有地址得到相同公开答复。
/// Double-opt-in request; prior subscriber state is not disclosed.
async fn subscribe(mut req: Request, env: Env) -> Result<Response> {
    let is_json = content_type(&req)?.starts_with("application/json");
    if !allowed_origin(&req)? || !allow_subscription(&req, &env).await? {
        return subscribe_reply(is_json, 429, false);
    }
    let payload = match read_subscribe_input(&mut req, is_json).await {
        Ok(input) => input,
        Err(_) => return subscribe_reply(is_json, 400, false),
    };
    let (email, locale) = match (
        normalize_email(&payload.email),
        normalize_locale(&payload.locale),
    ) {
        (Ok(email), Ok(locale)) => (email, locale),
        _ => return subscribe_reply(is_json, 400, false),
    };
    let token = random_token()?;
    let token_hash = hash_token(&token);
    let unsubscribe_token = random_token()?;
    let now = now_ms();
    let store = Store::new(env.d1("DB")?);
    let outcome = store
        .subscribe_pending(
            &email,
            locale.as_str(),
            &token_hash,
            now + CONFIRM_TTL_MS,
            &unsubscribe_token,
            now,
        )
        .await?;
    if outcome != SubscribeOutcome::PendingCreated {
        return subscribe_reply(is_json, 202, true);
    }
    let confirm_url = format!("https://atelier.moesegfault.dev/api/confirm?token={token}");
    if mail::send_confirmation(&env, &email, locale, &confirm_url)
        .await
        .is_err()
    {
        store.expire_pending(&token_hash, now_ms()).await?;
        return subscribe_reply(is_json, 503, false);
    }
    subscribe_reply(is_json, 202, true)
}

/// GET 仅显示表单，邮件预取器不能擅自确认。 / GET only renders a form, so mail prefetchers cannot confirm.
async fn confirmation_page(req: Request, env: Env) -> Result<Response> {
    let token = query_token(&req);
    let valid = if let Some(ref token) = token {
        Store::new(env.d1("DB")?)
            .get_pending_by_token_hash(&hash_token(token), now_ms())
            .await?
            .is_some()
    } else {
        false
    };
    let Some(token) = token.filter(|_| valid) else {
        return action_page(
            400,
            "链接无效或已过期",
            "This link is invalid or expired.",
            None,
        );
    };
    action_page(
        200,
        "确认订阅 Atelier 更新",
        "Confirm your Atelier subscription",
        Some(("/api/confirm", &token, "确认订阅 / Confirm subscription")),
    )
}

/// POST 消耗一次性令牌并激活订阅。 / POST consumes a one-time token to activate consent.
async fn confirm(mut req: Request, env: Env) -> Result<Response> {
    let Some(token) = form_or_query_token(&mut req).await? else {
        return action_page(400, "链接无效", "Invalid link.", None);
    };
    let activated = Store::new(env.d1("DB")?)
        .confirm(&hash_token(&token), now_ms())
        .await?
        .is_some();
    if !activated {
        return action_page(
            400,
            "链接无效或已过期",
            "This link is invalid or expired.",
            None,
        );
    }
    action_page(200, "订阅已确认", "Subscription confirmed.", None)
}

/// GET 只展示退订表单，防止邮件扫描器误触发。 / GET only shows an opt-out form to avoid scanner-triggered changes.
fn unsubscribe_page(req: Request) -> Result<Response> {
    let Some(token) = query_token(&req) else {
        return action_page(400, "链接无效", "Invalid link.", None);
    };
    action_page(
        200,
        "退订 Atelier 更新",
        "Unsubscribe from Atelier updates",
        Some(("/api/unsubscribe", &token, "确认退订 / Unsubscribe")),
    )
}

/// 接受浏览器和 RFC 8058 一键退订 POST，不要求登录或验证码。
/// Accept browser and RFC 8058 one-click POST without login or CAPTCHA.
async fn unsubscribe(mut req: Request, env: Env) -> Result<Response> {
    let Some(token) = form_or_query_token(&mut req).await? else {
        return action_page(400, "链接无效", "Invalid link.", None);
    };
    Store::new(env.d1("DB")?)
        .unsubscribe(&token, now_ms())
        .await?;
    action_page(
        200,
        "退订请求已处理",
        "Your unsubscribe request has been processed.",
        None,
    )
}

/// CI 草稿可编辑；明确 send=true 才将当时已确认订阅者入队。
/// CI drafts are editable; only explicit send=true snapshots confirmed subscribers.
async fn notify(mut req: Request, env: Env) -> Result<Response> {
    if !authorized(&req, &env)? {
        return Response::error("Unauthorized", 401);
    }
    let Some(body) = read_body(&mut req, 300_000).await? else {
        return Response::error("Payload too large", 413);
    };
    let Ok(input) = serde_json::from_str::<NotifyInput>(&body) else {
        return Response::error("Invalid JSON", 400);
    };
    if !valid_campaign_id(&input.id) || validate_campaign(&input.subject, &input.html).is_err() {
        return Response::error("Invalid campaign", 400);
    }
    let store = Store::new(env.d1("DB")?);
    let written = store
        .upsert_draft(&input.id, &input.subject, &input.html, now_ms())
        .await?;
    if written == CampaignWrite::Conflict {
        return Response::error("Campaign is immutable", 409);
    }
    let queued = if input.send {
        store.enqueue(&input.id, now_ms()).await?
    } else {
        false
    };
    let status = if queued || written == CampaignWrite::AlreadyQueued {
        "queued"
    } else {
        "draft"
    };
    json_reply(
        200,
        json!({ "id": input.id, "status": status, "queued": queued }),
    )
}

/// 返回活动投递计数，供 CI 和人工核对 unknown 状态；不泄露订阅地址。
/// Expose delivery counts for CI and manual reconciliation without exposing recipient addresses.
async fn campaign_status(req: Request, env: Env) -> Result<Response> {
    if !authorized(&req, &env)? {
        return Response::error("Unauthorized", 401);
    }
    let id = req
        .url()?
        .query_pairs()
        .find(|(key, _)| key == "id")
        .map(|(_, value)| value.into_owned());
    let Some(id) = id.filter(|id| valid_campaign_id(id)) else {
        return Response::error("Invalid campaign ID", 400);
    };
    let Some(status) = Store::new(env.d1("DB")?).campaign_status(&id).await? else {
        return Response::error("Not found", 404);
    };
    json_reply(
        200,
        json!({
            "id": status.id, "status": status.status, "pending": status.pending,
            "sending": status.sending, "sent": status.sent, "failed": status.failed,
            "unknown": status.unknown, "skipped": status.skipped
        }),
    )
}

/// 每封邮件前重查同意，使用独占租约并避免不确定结果的自动重发。
/// Recheck consent per message, use a lease, and avoid automatic retries after ambiguous outcomes.
async fn dispatch(env: &Env) -> Result<()> {
    let store = Store::new(env.d1("DB")?);
    store.mark_unknown_stale(now_ms()).await?;
    // 中文：逐封领取，失败时不会把尚未尝试的整批邮件遗留在 sending 状态。
    // English: Claim one at a time so a failure cannot strand unattempted mail as sending.
    for _ in 0..SEND_BATCH_SIZE {
        let now = now_ms();
        let Some(item) = store
            .claim_batch(1, now, now + SEND_LEASE_MS)
            .await?
            .into_iter()
            .next()
        else {
            break;
        };
        let Some(subscriber) = store.get_confirmed_by_email(&item.email).await? else {
            store
                .mark_skipped(&item.campaign_id, &item.email, item.lease_expires_at)
                .await?;
            continue;
        };
        let unsubscribe_url = format!(
            "https://atelier.moesegfault.dev/api/unsubscribe?token={}",
            subscriber.unsubscribe_token
        );
        let sent = mail::send_update(
            env,
            &item.email,
            &item.subject,
            &item.html,
            &unsubscribe_url,
        )
        .await;
        if sent.is_ok() {
            store
                .mark_sent(
                    &item.campaign_id,
                    &item.email,
                    item.lease_expires_at,
                    now_ms(),
                )
                .await?;
            continue;
        }
        match classify_mail_failure(&sent.unwrap_err()) {
            MailFailure::Retry { delay_ms, reason } if item.attempts < MAX_SEND_ATTEMPTS => {
                let retry_at = now_ms() + delay_ms;
                store
                    .mark_failed(
                        &item.campaign_id,
                        &item.email,
                        item.lease_expires_at,
                        reason,
                        retry_at,
                    )
                    .await?;
                store.defer_campaign(&item.campaign_id, retry_at).await?;
                break;
            }
            MailFailure::Skip => {
                store
                    .mark_skipped(&item.campaign_id, &item.email, item.lease_expires_at)
                    .await?;
            }
            _ => {
                // 中文：结果不明时保留租约，超时后隔离为 unknown，绝不盲目重发。
                // English: Leave ambiguous mail leased; expiry quarantines it as unknown, never blind-retry.
                console_error!(
                    "Atelier mail send result unknown for campaign {}",
                    item.campaign_id
                );
                break;
            }
        }
    }
    store.complete_campaigns(now_ms()).await?;
    Ok(())
}

/// 只对 Cloudflare 明确拒绝的错误安排自动恢复；未知错误保留人工核对。
/// Automatically recover only documented explicit rejections; quarantine unknown outcomes.
fn classify_mail_failure(error: &Error) -> MailFailure {
    match error {
        Error::RateLimitExceeded(_) => MailFailure::Retry {
            delay_ms: 15 * 60 * 1000,
            reason: "rate_limit",
        },
        Error::DailyLimitExceeded(_) => MailFailure::Retry {
            delay_ms: 25 * 60 * 60 * 1000,
            reason: "daily_limit",
        },
        Error::EmailRecipientSuppressed(_) => MailFailure::Skip,
        Error::EmailRecipientNotAllowed(_) => MailFailure::Retry {
            delay_ms: 60 * 60 * 1000,
            reason: "configuration",
        },
        Error::UnknownJsError {
            code: Some(code), ..
        } => match code.as_str() {
            "E_RATE_LIMIT_EXCEEDED" => MailFailure::Retry {
                delay_ms: 15 * 60 * 1000,
                reason: "rate_limit",
            },
            "E_DAILY_LIMIT_EXCEEDED" => MailFailure::Retry {
                delay_ms: 25 * 60 * 60 * 1000,
                reason: "daily_limit",
            },
            "E_SENDER_NOT_VERIFIED"
            | "E_SENDER_DOMAIN_NOT_AVAILABLE"
            | "E_HEADER_NOT_ALLOWED"
            | "E_HEADER_VALUE_INVALID"
            | "E_RECIPIENT_NOT_ALLOWED"
            | "E_VALIDATION_ERROR"
            | "E_CONTENT_TOO_LARGE" => MailFailure::Retry {
                delay_ms: 60 * 60 * 1000,
                reason: "configuration",
            },
            "E_RECIPIENT_SUPPRESSED" | "E_DELIVERY_FAILED" => MailFailure::Skip,
            _ => MailFailure::Unknown,
        },
        _ => MailFailure::Unknown,
    }
}

/// 以流方式限制正文体积，避免先把任意大小的请求读入内存。
/// Stream-limit request bodies instead of allocating unbounded input first.
async fn read_body(req: &mut Request, limit: usize) -> Result<Option<String>> {
    let Ok(mut stream) = req.stream() else {
        return Ok(Some(String::new()));
    };
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if chunk.len() > limit.saturating_sub(bytes.len()) {
            return Ok(None);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8(bytes).ok())
}

/// 读取受限的 JSON 或原生表单正文。 / Read bounded JSON or native form data.
async fn read_subscribe_input(
    req: &mut Request,
    is_json: bool,
) -> std::result::Result<SubscribeInput, ()> {
    let body = read_body(req, 4096).await.map_err(|_| ())?.ok_or(())?;
    if is_json {
        return serde_json::from_str(&body).map_err(|_| ());
    }
    let fields: std::collections::HashMap<String, String> =
        url::form_urlencoded::parse(body.as_bytes())
            .into_owned()
            .collect();
    Ok(SubscribeInput {
        email: fields.get("email").ok_or(())?.clone(),
        locale: fields.get("locale").ok_or(())?.clone(),
    })
}

/// 从表单或 URL 读取令牌；一键退订使用 URL 中的令牌。
/// Read a token from form or URL; one-click opt-out uses the URL token.
async fn form_or_query_token(req: &mut Request) -> Result<Option<String>> {
    if let Some(token) = query_token(req) {
        return Ok(Some(token));
    }
    let Some(body) = read_body(req, 4096).await? else {
        return Ok(None);
    };
    let token = url::form_urlencoded::parse(body.as_bytes())
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.into_owned());
    Ok(token.filter(|value| valid_token(value)))
}

/// 仅接受固定长度的十六进制随机令牌。 / Accept only fixed-length hexadecimal random tokens.
fn query_token(req: &Request) -> Option<String> {
    req.url()
        .ok()?
        .query_pairs()
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.into_owned())
        .filter(|value| valid_token(value))
}

/// 校验令牌的公开编码。 / Validate public token encoding.
fn valid_token(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// 从运行时加密随机源生成 256 位令牌。 / Generate a 256-bit token from the runtime CSPRNG.
fn random_token() -> Result<String> {
    let mut bytes = [0_u8; 32];
    fill(&mut bytes).map_err(|_| Error::RustError("secure randomness unavailable".into()))?;
    Ok(hex::encode(bytes))
}

/// 数据库只保存确认令牌哈希。 / Store only the confirmation-token hash in D1.
fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Unix 毫秒时间。 / Current Unix time in milliseconds.
fn now_ms() -> i64 {
    js_sys::Date::now() as i64
}

/// 拒绝跨站浏览器表单；无 Origin 的 API 客户端仍受限流保护。
/// Reject cross-origin browser forms; API clients without Origin remain rate-limited.
fn allowed_origin(req: &Request) -> Result<bool> {
    let Some(origin) = req.headers().get("origin")? else {
        return Ok(true);
    };
    let Ok(origin) = url::Url::parse(&origin) else {
        return Ok(false);
    };
    Ok(origin.origin() == req.url()?.origin())
}

/// 按来源对确认邮件申请限流，以减轻恶意代填邮箱。
/// Rate-limit confirmation requests by source to reduce subscription abuse.
async fn allow_subscription(req: &Request, env: &Env) -> Result<bool> {
    let ip = req
        .headers()
        .get("cf-connecting-ip")?
        .unwrap_or_else(|| "unknown".into());
    Ok(env
        .rate_limiter("SUBSCRIBE_LIMIT")?
        .limit(hash_token(&ip))
        .await?
        .success)
}

/// 仅 CI 持有管理密钥；前端 TypeScript 不接触发件权限。
/// Only CI holds the admin token; frontend TypeScript never receives sending authority.
fn authorized(req: &Request, env: &Env) -> Result<bool> {
    let expected = env.secret("ATELIER_NOTIFY_TOKEN")?.to_string();
    let supplied = req.headers().get("authorization")?.unwrap_or_default();
    Ok(constant_time_eq(
        expected.as_bytes(),
        supplied
            .strip_prefix("Bearer ")
            .unwrap_or_default()
            .as_bytes(),
    ))
}

/// 比较固定长度密钥的全部字节。 / Compare every byte of fixed-length secrets.
fn constant_time_eq(expected: &[u8], supplied: &[u8]) -> bool {
    if expected.len() != supplied.len() || expected.is_empty() {
        return false;
    }
    expected
        .iter()
        .zip(supplied)
        .fold(0_u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

/// 通知 ID 是稳定、非路径的幂等键。 / Notification IDs are stable, non-path idempotency keys.
fn valid_campaign_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

/// 读取规范化 Content-Type。 / Read normalized Content-Type.
fn content_type(req: &Request) -> Result<String> {
    Ok(req
        .headers()
        .get("content-type")?
        .unwrap_or_default()
        .to_ascii_lowercase())
}

/// 不泄露邮箱是否已订阅：JSON 与无脚本 HTML 返回相同语义。
/// Do not reveal whether an address exists; JSON and no-script HTML share the same semantics.
fn subscribe_reply(is_json: bool, status: u16, ok: bool) -> Result<Response> {
    if is_json {
        return json_reply(status, json!({ "ok": ok }));
    }
    let (zh, en) = if ok {
        (
            "请求已收到，请检查邮箱中的确认邮件（如适用）。",
            "Request received. Check your inbox for a confirmation email if applicable.",
        )
    } else {
        (
            "暂时无法提交，请检查地址或稍后重试。",
            "Could not submit. Check the address or try again later.",
        )
    };
    action_page(status, zh, en, None)
}

/// 返回无缓存、不可索引的 JSON。 / Return no-store, non-indexable JSON.
fn json_reply(status: u16, body: serde_json::Value) -> Result<Response> {
    let mut response = Response::from_json(&body)?.with_status(status);
    api_headers(&mut response)?;
    Ok(response)
}

/// 生成双语操作页，复用 Atelier 配色但不改变公开首页布局。
/// Render a bilingual action page in Atelier's visual language without changing public-page layout.
fn action_page(
    status: u16,
    zh: &str,
    en: &str,
    action: Option<(&str, &str, &str)>,
) -> Result<Response> {
    let form = action
        .map(|(path, token, label)| format!(
            "<form class=\"action-form\" method=\"post\" action=\"{path}\"><input type=\"hidden\" name=\"token\" value=\"{}\"><button type=\"submit\">{label}<span aria-hidden=\"true\"> →</span></button></form>",
            escape_html(token)
        ))
        .unwrap_or_default();
    let html = render_action_html(zh, en, &form);
    let mut response = Response::from_html(html)?.with_status(status);
    api_headers(&mut response)?;
    Ok(response)
}

/// 渲染无令牌外泄的静态操作页；主题引导脚本只恢复既有站点偏好。
/// Render static action HTML without exposing tokens; the tiny theme bootstrap only restores site preference.
fn render_action_html(zh: &str, en: &str, form: &str) -> String {
    const THEME_BOOTSTRAP: &str = r#"try{const theme=localStorage.getItem('site-theme');if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme}catch{}"#;
    let title = escape_html(zh);
    let english = escape_html(en);
    format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>{title} · Atelier</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <script>{THEME_BOOTSTRAP}</script>
  <link rel="stylesheet" href="/action.css">
</head>
<body>
  <div class="action-shell">
    <header class="action-header">
      <a class="action-brand" href="/zh/" aria-label="Atelier 首页">
        <span class="action-brand__mark" aria-hidden="true">A/</span><strong>Atelier</strong>
      </a>
      <p>写作与制作 <span aria-hidden="true">·</span> <span lang="en">Writing &amp; making</span></p>
    </header>
    <main class="action-main">
      <section class="action-card" aria-labelledby="action-title">
        <p class="action-kicker">ATELIER <span aria-hidden="true">/</span> MAILROOM</p>
        <h1 id="action-title">{title}</h1>
        <p class="action-english" lang="en">{english}</p>
        {form}
        <nav class="action-links" aria-label="返回网站 / Return to site">
          <a href="/zh/">返回中文首页 <span aria-hidden="true">↗</span></a>
          <a href="/en/" lang="en">English home <span aria-hidden="true">↗</span></a>
        </nav>
      </section>
    </main>
    <footer class="action-footer">
      <span>写下，也做成</span><span lang="en">written &amp; made here</span>
    </footer>
  </div>
</body>
</html>"#
    )
}

/// 阻止 API 缓存、令牌索引及 Referer 泄漏。
/// Prevent API caching, token indexing, and Referer leakage.
fn api_headers(response: &mut Response) -> Result<()> {
    response.headers_mut().set("cache-control", "no-store")?;
    response
        .headers_mut()
        .set("x-robots-tag", "noindex, nofollow")?;
    response
        .headers_mut()
        .set("referrer-policy", "no-referrer")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_html_uses_site_assets_and_escapes_copy() {
        let html = render_action_html("<确认>", "<Confirm>", "");
        assert!(html.contains("href=\"/action.css\""));
        assert!(html.contains("href=\"/favicon.svg\""));
        assert!(html.contains("content=\"noindex,nofollow\""));
        assert!(html.contains("content=\"no-referrer\""));
        assert!(html.contains("&lt;确认&gt;"));
        assert!(html.contains("&lt;Confirm&gt;"));
        assert!(!html.contains("<style>"));
    }

    #[test]
    fn campaign_ids_are_bounded_and_not_paths() {
        assert!(valid_campaign_id("blog-2026-09.1"));
        assert!(!valid_campaign_id("../escape"));
        assert!(!valid_campaign_id("a/b"));
        assert!(!valid_campaign_id(&"a".repeat(129)));
    }

    #[test]
    fn token_validation_and_hash_are_stable() {
        let token = "a".repeat(64);
        assert!(valid_token(&token));
        assert!(!valid_token("short"));
        assert_eq!(hash_token(&token), hash_token(&token));
        assert_ne!(hash_token(&token), token);
    }

    #[test]
    fn bearer_comparison_rejects_empty_and_modified_values() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
        assert!(!constant_time_eq(b"", b""));
    }

    #[test]
    fn only_explicit_provider_rejections_are_retried_or_skipped() {
        assert_eq!(
            classify_mail_failure(&Error::RateLimitExceeded("limit".into())),
            MailFailure::Retry {
                delay_ms: 900_000,
                reason: "rate_limit"
            }
        );
        assert_eq!(
            classify_mail_failure(&Error::DailyLimitExceeded("quota".into())),
            MailFailure::Retry {
                delay_ms: 90_000_000,
                reason: "daily_limit"
            }
        );
        assert_eq!(
            classify_mail_failure(&Error::EmailRecipientSuppressed("suppressed".into())),
            MailFailure::Skip
        );
        assert_eq!(
            classify_mail_failure(&Error::EmailRecipientNotAllowed("binding policy".into())),
            MailFailure::Retry {
                delay_ms: 3_600_000,
                reason: "configuration"
            }
        );
        assert_eq!(
            classify_mail_failure(&Error::InternalError("ambiguous".into())),
            MailFailure::Unknown
        );
    }
}
