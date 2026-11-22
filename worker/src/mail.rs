//! Cloudflare Email Service 出站适配器。 / Outbound adapter for Cloudflare Email Service.
//!
//! 每次仅向一个收件人发送；订阅资格、去重与重试由调用方持久化管理。
//! Send to one recipient at a time; callers persist consent, deduplication, and retry state.

use js_sys::{JsString, Object, Reflect};
use worker::{Env, Error, Result, SendEmailBuilder};

use crate::domain::{
    escape_html, normalize_email, render_campaign_html, validate_campaign, Locale,
};

/// 经 Cloudflare Email Service 验证的固定发件地址。 / Fixed sender verified with Cloudflare Email Service.
const SENDER: &str = "atelier@moesegfault.dev";

/// 用于出站邮件的 Worker 绑定名称。 / Worker binding name used for outbound messages.
const EMAIL_BINDING: &str = "EMAIL";

/// 向订阅申请者发送确认邮件，不会因此激活订阅。 / Send a confirmation message without activating the subscription.
///
/// `confirm_url` 必须是服务端生成的 HTTPS 链接；链接会在 HTML 中转义，纯文本中原样显示。
/// `confirm_url` must be a server-generated HTTPS link; it is HTML-escaped and shown verbatim in text.
///
/// # Example / 示例
/// ```ignore
/// send_confirmation(&env, "reader@example.com", Locale::Zh, "https://atelier.moesegfault.dev/api/confirm?token=...").await?;
/// ```
pub async fn send_confirmation(
    env: &Env,
    email: &str,
    locale: Locale,
    confirm_url: &str,
) -> Result<()> {
    let recipient = valid_recipient(email)?;
    if !valid_https_url(confirm_url) {
        return Err(Error::RustError("invalid confirmation URL".into()));
    }
    let (subject, html, text) = confirmation_content(locale, confirm_url);
    send(env, &recipient, subject, &html, &text, None).await
}

/// 生成本地化的 HTML 和纯文本确认信。 / Build localized HTML and plain-text confirmation content.
fn confirmation_content(locale: Locale, confirm_url: &str) -> (&'static str, String, String) {
    let (subject, action, note) = match locale {
        Locale::Zh => (
            "确认订阅 Atelier 更新",
            "确认订阅",
            "链接将在 24 小时后失效。如果不是你提出的请求，忽略这封邮件即可。",
        ),
        Locale::En => (
            "Confirm your Atelier subscription",
            "Confirm subscription",
            "This link expires in 24 hours. If you did not make this request, ignore this email.",
        ),
    };
    let safe_url = escape_html(confirm_url);
    let body = format!(
        "<h1 style=\"margin:0 0 24px;color:#221315;font-size:28px;line-height:1.25;font-weight:600;\">{subject}</h1>\
         <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:0 0 24px;border-collapse:separate;\"><tr><td class=\"action\" bgcolor=\"#bf2029\" style=\"border-radius:6px;background-color:#bf2029;\"><a href=\"{safe_url}\" style=\"display:inline-block;padding:12px 20px;color:#fffdf9;font-size:16px;line-height:1.25;font-weight:500;text-decoration:none;\">{action}</a></td></tr></table>\
         <p style=\"margin:0;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;\"><a href=\"{safe_url}\" style=\"color:#795a4d;text-decoration:underline;\">{safe_url}</a></p>"
    );
    let html = render_shell(subject, locale.as_str(), &body, note);
    let text = format!("{subject}\n\n{action}: {confirm_url}\n\n{note}");
    (subject, html, text)
}

/// 将编辑的发布片段固定为完整 MIME 快照。 / Freeze an authored update fragment as complete MIME templates.
///
/// 片段和正文须为可信管理员编辑，不能含退订占位符；调用方在入库前验证此契约。
/// Fragment and text must be trusted admin content without the unsubscribe placeholder;
/// callers validate that contract before storing the snapshots.
///
/// # Example / 示例
/// ```ignore
/// let (html, text) = render_update_snapshot(
///     "Atelier｜A new article",
///     "<h1>A new article</h1><p>Summary</p>",
///     "A new article\nSummary\nhttps://atelier.moesegfault.dev/en/blog/example/",
/// );
/// ```
pub fn render_update_snapshot(subject: &str, fragment: &str, text_body: &str) -> (String, String) {
    const UNSUBSCRIBE: &str = "退订工坊更新 / Unsubscribe from Atelier updates";
    let footer = format!(
        "<a href=\"{{{{unsubscribe_url}}}}\" style=\"color:#795a4d;text-decoration:underline;\">{UNSUBSCRIBE}</a>"
    );
    let html = render_shell(subject, "zh-CN", fragment, &footer);
    let text = format!(
        "{}\n\n{UNSUBSCRIBE}: {{{{unsubscribe_url}}}}",
        text_body.trim_end()
    );
    (html, text)
}

/// `src/lib/pixel/hearth.ts` 的一帧定格；邮件不能运行模拟。
/// One settled frame of `src/lib/pixel/hearth.ts`; mail cannot run the simulation.
const EMBERS: [&str; 14] = [
    ".................ggg.g.............",
    "..............g.......ggggggg.g.g.g",
    ".............g.....g.g.............",
    "..................g.g.fgffffffg.g..",
    "....................gggfgggf.g.....",
    "........g.g.g..g......ggfgfff......",
    ".g.....g...g........gfgggfgf.......",
    "....g.g.ggg.g...g.ggfgfffffg.......",
    ".......ggg..........gggfff.g.g.....",
    "......ffggggf.g....fgffffffgfggg...",
    "......gggfgg.g.....ggffffhffgf.....",
    "g.g.ggfgffggg.g.g.gggfffhfhffgggg.g",
    ".g.g.ggfgfgfgg.g.ggfgffhfhffgfgg.g.",
    "g.ggg.ggfffgg.ggggggffhhhhhffgggg.g",
];

/// 以纯色单元格绘制余烬，屏蔽图片时仍然可见。 / Draw embers as plain cells, so they survive blocked images.
fn render_embers() -> String {
    EMBERS.iter().fold(String::new(), |rows, row| {
        let cells: String = row.chars().map(ember_cell).collect();
        rows + "<tr height=\"7\">" + &cells + "</tr>"
    })
}

fn ember_cell(tone: char) -> &'static str {
    match tone {
        'g' => "<td width=\"7\" bgcolor=\"#d13e2a\"></td>",
        'f' => "<td width=\"7\" bgcolor=\"#ff9c4f\"></td>",
        'h' => "<td width=\"7\" bgcolor=\"#fae19c\"></td>",
        's' => "<td width=\"7\" bgcolor=\"#fffdf9\"></td>",
        _ => "<td width=\"7\"></td>",
    }
}

/// 仅作增强：不支持的客户端保留浅色。内联底色的链接是主按钮。
/// Enhancement only; other clients keep the light palette. A link with an inline background is a primary action.
const DARK_STYLE: &str = "@media (prefers-color-scheme:dark){\
.page{background-color:#100708!important}\
.card{background-color:#160b0c!important;border-color:#322829!important}\
.rule{border-color:#322829!important}\
.card h1,.card h2,.card strong{color:#fffdf9!important}\
.card p{color:#f3e6d8!important}\
.card a{color:#ff6a5c!important}\
.card .action{background-color:#ff6a5c!important}\
.card .action a{color:#160b0c!important}\
.card a[style*=background]{background-color:#ff6a5c!important;color:#160b0c!important}\
.band{background-color:#77131d!important}\
.foot,.foot a{color:#c3a698!important}}";

/// 渲染轻量邮件表格外壳，正文和页脚由调用方提供。 / Render the shared table shell around caller-owned body and footer.
fn render_shell(subject: &str, lang: &str, body: &str, footer: &str) -> String {
    let title = escape_html(subject);
    let embers = render_embers();
    // Word-based Outlook gives an empty cell a full line of text, so it gets the plain band instead.
    format!(
        "<!doctype html><html lang=\"{lang}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light dark\"><meta name=\"supported-color-schemes\" content=\"light dark\"><title>{title}</title><style>{DARK_STYLE}</style></head>\
         <body class=\"page\" style=\"margin:0;padding:0;background-color:#fdf7ec;color:#4b312a;font-family:Geist,Inter,'Helvetica Neue',Arial,'PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;\">\
         <table class=\"page\" role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"width:100%;table-layout:fixed;border-collapse:collapse;background-color:#fdf7ec;\"><tr><td align=\"center\" style=\"padding:24px 16px;\">\
         <table class=\"card\" role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;background-color:#fffdf9;border:1px solid #e5e1dd;\">\
         <tr><td class=\"band\" align=\"right\" bgcolor=\"#bf2029\" style=\"padding:20px 0 0;background-color:#bf2029;\">\
         <div align=\"left\" style=\"padding:0 24px 8px;color:#fffdf9;font-size:32px;line-height:1;font-weight:600;letter-spacing:-1px;\">Atelier</div>\
         <!--[if !mso]><!--><table role=\"presentation\" aria-hidden=\"true\" cellpadding=\"0\" cellspacing=\"1\" border=\"0\" style=\"border-collapse:separate;font-size:0;line-height:0;\">{embers}</table><!--<![endif]--></td></tr>\
         <tr><td style=\"padding:32px 24px;color:#4b312a;font-size:16px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;\">{body}</td></tr>\
         <tr><td class=\"rule foot\" style=\"padding:16px 24px;border-top:1px solid #e5e1dd;color:#795a4d;font-size:13px;line-height:1.6;\">{footer}</td></tr>\
         </table></td></tr></table></body></html>"
    )
}

/// 向一位已确认且仍订阅的用户发送管理员编辑的 HTML 更新。 / Send editable HTML to one confirmed, active subscriber.
///
/// `html` 必须含 `{{unsubscribe_url}}`，由此函数替换为该收件人专属的 HTTPS 链接。
/// `html` must contain `{{unsubscribe_url}}`, replaced here with this recipient's HTTPS URL.
/// `text_template` 为 None 时保留旧通知的简要纯文本回退；Some 时原样替换纯文本链接。
/// None preserves the legacy terse text fallback; Some substitutes the raw URL in authored text.
/// 调用方须检查同意状态，并在发送前后持久化结果；此函数不负责群发重试。
/// The caller must check consent and persist send state; this function does not retry broadcasts.
///
/// # Example / 示例
/// ```ignore
/// let html = r#"<p>New article</p><a href="{{unsubscribe_url}}">Unsubscribe</a>"#;
/// send_update(&env, "reader@example.com", "New article", html, None, "https://atelier.moesegfault.dev/api/unsubscribe?token=...").await?;
/// ```
pub async fn send_update(
    env: &Env,
    recipient: &str,
    subject: &str,
    html: &str,
    text_template: Option<&str>,
    unsubscribe_url: &str,
) -> Result<()> {
    let recipient = valid_recipient(recipient)?;
    validate_campaign(subject, html).map_err(|_| Error::RustError("invalid campaign".into()))?;
    let rendered = render_campaign_html(html, unsubscribe_url)
        .map_err(|_| Error::RustError("invalid campaign unsubscribe URL".into()))?;
    let text = if let Some(template) = text_template {
        render_update_text(template, unsubscribe_url)?
    } else {
        update_text(subject, html, unsubscribe_url)
    };
    send(
        env,
        &recipient,
        subject,
        &rendered,
        &text,
        Some(unsubscribe_url),
    )
    .await
}

/// 仅在纯文本中原样替换 HTTPS 链接，不进行 HTML 转义。 / Substitute the raw HTTPS URL only in the text alternative.
fn render_update_text(template: &str, unsubscribe_url: &str) -> Result<String> {
    if !valid_https_url(unsubscribe_url) || !template.contains("{{unsubscribe_url}}") {
        return Err(Error::RustError(
            "invalid campaign text or unsubscribe URL".into(),
        ));
    }
    Ok(template.replace("{{unsubscribe_url}}", unsubscribe_url))
}

/// 使用原生绑定发送多部分邮件。 / Send a multipart email through the native binding.
async fn send(
    env: &Env,
    recipient: &str,
    subject: &str,
    html: &str,
    text: &str,
    unsubscribe_url: Option<&str>,
) -> Result<()> {
    let binding = env.send_email(EMAIL_BINDING)?;
    let builder = SendEmailBuilder::builder(SENDER, recipient, subject)
        .html(html)
        .text(text);
    let message = if let Some(url) = unsubscribe_url {
        let headers = unsubscribe_headers(url)?;
        builder.headers(&headers).build()
    } else {
        builder.build()
    };
    binding.send_with_builder(&message).await?;
    Ok(())
}

/// 为订阅通知设置 RFC 8058 一键退订头；确认信不设置。 / Add RFC 8058 one-click headers only to subscription updates.
fn unsubscribe_headers(url: &str) -> Result<Object<JsString>> {
    let headers: Object<JsString> = Object::new_typed();
    for (name, value) in unsubscribe_header_pairs(url) {
        Reflect::set(&headers, &name.into(), &value.into()).map_err(Error::from)?;
    }
    Ok(headers)
}

/// 将专属 HTTPS 链接绑定至邮件列表头。 / Bind the recipient-specific HTTPS URL to list headers.
fn unsubscribe_header_pairs(url: &str) -> [(&'static str, String); 3] {
    [
        ("List-Unsubscribe", format!("<{url}>")),
        ("List-Unsubscribe-Post", "List-Unsubscribe=One-Click".into()),
        (
            "List-Id",
            "Atelier updates <atelier.moesegfault.dev>".into(),
        ),
    ]
}

/// 为纯文本版本提取首个站内文章链接；HTML 正文仍是权威编辑稿。 / Find the first site link for the text alternative; authored HTML remains authoritative.
fn update_text(subject: &str, html: &str, unsubscribe_url: &str) -> String {
    let article = first_site_link(html).unwrap_or("https://atelier.moesegfault.dev/");
    format!("{subject}\n\nRead the update: {article}\n\nUnsubscribe: {unsubscribe_url}")
}

/// 只提取本站 HTTPS 链接，不把退订地址误作文章链接。 / Extract only a site HTTPS link, never the unsubscribe endpoint.
fn first_site_link(html: &str) -> Option<&str> {
    for part in html.split("href=").skip(1) {
        let quote = part.chars().next()?;
        if quote != '"' && quote != '\'' {
            continue;
        }
        let href = part[1..].split(quote).next()?;
        if href.starts_with("https://atelier.moesegfault.dev/")
            && !href.starts_with("https://atelier.moesegfault.dev/api/")
            && !href.contains(['\r', '\n', '<', '>'])
        {
            return Some(href);
        }
    }
    None
}

/// 拒绝格式不安全的地址而不在错误中泄露地址。 / Reject unsafe addresses without echoing them in errors.
fn valid_recipient(address: &str) -> Result<String> {
    normalize_email(address).map_err(|_| Error::RustError("invalid recipient".into()))
}

/// 限定服务端生成的确认链接为 HTTPS，避免邮件中的脚本 URL。 / Require HTTPS for server-generated confirmation links.
fn valid_https_url(url: &str) -> bool {
    let host = url
        .strip_prefix("https://")
        .and_then(|rest| rest.split(['/', '?', '#']).next())
        .unwrap_or_default();
    !host.is_empty()
        && !url
            .chars()
            .any(|ch| ch.is_control() || ch.is_whitespace() || matches!(ch, '@' | '\\'))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 显式生成本地预览供无发信的视觉校验。 / Explicitly write a local preview for visual QA without sending mail.
    #[test]
    #[ignore = "writes a local preview file; run explicitly"]
    fn write_mail_previews() {
        let (_, html, _) = confirmation_content(
            Locale::Zh,
            "https://atelier.moesegfault.dev/api/confirm?token=preview-not-real",
        );
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap();
        let temp = root.join(".temp");
        std::fs::create_dir_all(&temp).unwrap();
        std::fs::write(temp.join("email-confirmation-preview.html"), html).unwrap();
        let fragment =
            std::fs::read_to_string(root.join("notifications/atelier-update.html")).unwrap();
        let body = std::fs::read_to_string(root.join("notifications/atelier-update.txt")).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(root.join("notifications/atelier-update.json")).unwrap(),
        )
        .unwrap();
        let subject = manifest["subject"].as_str().unwrap();
        let (update_html, _) = render_update_snapshot(subject, &fragment, &body);
        std::fs::write(temp.join("email-update-preview.html"), update_html).unwrap();
    }

    #[test]
    fn ember_rows_share_one_width() {
        assert!(EMBERS.iter().all(|row| row.len() == EMBERS[0].len()));
        assert!(EMBERS.concat().chars().all(|tone| ".gfhs".contains(tone)));
    }

    #[test]
    fn confirmation_link_requires_https_without_header_injection() {
        assert!(valid_https_url(
            "https://atelier.moesegfault.dev/api/confirm?token=a&b=2"
        ));
        for url in [
            "http://example.com/confirm",
            "javascript:alert(1)",
            "https:///missing-host",
            "https://example.com/\r\nBcc:attacker@example.com",
            "https://user@example.com/confirm",
        ] {
            assert!(!valid_https_url(url), "{url:?}");
        }
    }

    #[test]
    fn recipient_validation_does_not_include_input_in_error() {
        let error = valid_recipient("private@example.com\nBcc:attacker@example.com").unwrap_err();
        let message = error.to_string();
        assert_eq!(message, "invalid recipient");
        assert!(!message.contains("private@example.com"));
    }

    #[test]
    fn confirmation_is_localized_and_escapes_link_attribute() {
        let url = "https://atelier.moesegfault.dev/api/confirm?a=1&b=2";
        let (zh_subject, zh_html, zh_text) = confirmation_content(Locale::Zh, url);
        assert!(zh_subject.contains("确认"));
        assert!(zh_html.contains("a=1&amp;b=2"));
        assert!(zh_text.contains(url));
        assert!(zh_html.contains("24 小时"));
        assert!(zh_text.contains("24 小时"));
        assert!(zh_html.contains(">Atelier</div>"));
        assert_eq!(zh_html.matches("<!doctype html>").count(), 1);
        assert!(!zh_html.contains("{{unsubscribe_url}}"));
        let (en_subject, en_html, en_text) = confirmation_content(Locale::En, url);
        assert!(en_subject.contains("Confirm"));
        assert!(en_html.contains("Confirm subscription"));
        assert!(en_text.contains("ignore this email"));
        assert!(en_html.contains("24 hours"));
        assert!(en_text.contains("24 hours"));
        assert!(en_html.contains("lang=\"en\""));
        assert!(!en_html.contains("List-Unsubscribe"));
    }

    #[test]
    fn snapshot_wraps_fragment_once_and_adds_single_footer_in_both_parts() {
        let fragment = "<h1>Article title</h1><p>Useful summary.</p><a href=\"https://atelier.moesegfault.dev/en/blog/example/\">Read the article / 阅读文章</a>";
        let authored =
            "Article title\nUseful summary.\nhttps://atelier.moesegfault.dev/en/blog/example/";
        let (html, text) = render_update_snapshot("Atelier｜Article title", fragment, authored);
        assert_eq!(html.matches("<!doctype html>").count(), 1);
        assert_eq!(html.matches(">Atelier</div>").count(), 1);
        assert!(html.contains(fragment));
        assert_eq!(html.matches("{{unsubscribe_url}}").count(), 1);
        assert!(html.contains("href=\"{{unsubscribe_url}}\""));
        assert_eq!(text.matches("{{unsubscribe_url}}").count(), 1);
        assert!(text.contains(authored));
        assert!(text.contains("Unsubscribe from Atelier updates"));
        assert!(html.contains("bgcolor=\"#bf2029\""));
    }

    #[test]
    fn authored_text_substitutes_raw_url_but_legacy_fallback_stays_available() {
        let url = "https://atelier.moesegfault.dev/api/unsubscribe?a=1&b=2";
        let (_, template) = render_update_snapshot(
            "Atelier｜Article",
            "<h1>Article</h1>",
            "Article\nhttps://atelier.moesegfault.dev/en/blog/example/",
        );
        let rendered = render_update_text(&template, url).unwrap();
        assert!(rendered.contains(url));
        assert!(!rendered.contains("&amp;"));
        assert!(!rendered.contains("{{unsubscribe_url}}"));
        assert!(render_update_text(&template, "javascript:alert(1)").is_err());
        assert!(render_update_text("missing placeholder", url).is_err());
    }

    #[test]
    fn update_headers_include_one_click_only_for_updates() {
        let url = "https://atelier.moesegfault.dev/api/unsubscribe?token=abc";
        let headers = unsubscribe_header_pairs(url);
        assert_eq!(headers[0], ("List-Unsubscribe", format!("<{url}>")));
        assert_eq!(
            headers[1],
            ("List-Unsubscribe-Post", "List-Unsubscribe=One-Click".into())
        );
        assert_eq!(
            headers[2],
            (
                "List-Id",
                "Atelier updates <atelier.moesegfault.dev>".into()
            )
        );
    }

    #[test]
    fn text_fallback_links_to_article_when_present() {
        let html = r#"<p>Summary</p><a href="https://atelier.moesegfault.dev/en/blog/example/">Article</a><a href="{{unsubscribe_url}}">Unsubscribe</a>"#;
        let url = "https://atelier.moesegfault.dev/api/unsubscribe?token=abc";
        let text = update_text("An update", html, url);
        assert!(text.contains("https://atelier.moesegfault.dev/en/blog/example/"));
        assert!(text.contains(url));
        assert_eq!(
            first_site_link("<a href='https://evil.example/x'>A</a>"),
            None
        );
    }
}
