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

/// 生成双语 HTML 和纯文本确认信。 / Build localized HTML and plain-text confirmation content.
fn confirmation_content(locale: Locale, confirm_url: &str) -> (&'static str, String, String) {
    let (subject, lead, action, note) = match locale {
        Locale::Zh => (
            "确认订阅 Atelier 更新",
            "我们收到了订阅 Atelier 更新的请求。请确认你的邮箱：",
            "确认订阅",
            "如果不是你提出的请求，可以忽略这封邮件。",
        ),
        Locale::En => (
            "Confirm your Atelier subscription",
            "We received a request to subscribe to Atelier updates. Confirm your email:",
            "Confirm subscription",
            "If you did not request this, you can ignore this email.",
        ),
    };
    let safe_url = escape_html(confirm_url);
    let html = format!("<p>{lead}</p><p><a href=\"{safe_url}\">{action}</a></p><p>{note}</p>");
    let text = format!("{lead}\n{confirm_url}\n\n{note}");
    (subject, html, text)
}

/// 向一位已确认且仍订阅的用户发送管理员编辑的 HTML 更新。 / Send editable HTML to one confirmed, active subscriber.
///
/// `html` 必须含 `{{unsubscribe_url}}`，由此函数替换为该收件人专属的 HTTPS 链接。
/// `html` must contain `{{unsubscribe_url}}`, replaced here with this recipient's HTTPS URL.
/// 调用方须检查同意状态，并在发送前后持久化结果；此函数不负责群发重试。
/// The caller must check consent and persist send state; this function does not retry broadcasts.
///
/// # Example / 示例
/// ```ignore
/// let html = r#"<p>New article</p><a href="{{unsubscribe_url}}">Unsubscribe</a>"#;
/// send_update(&env, "reader@example.com", "New article", html, "https://atelier.moesegfault.dev/api/unsubscribe?token=...").await?;
/// ```
pub async fn send_update(
    env: &Env,
    recipient: &str,
    subject: &str,
    html: &str,
    unsubscribe_url: &str,
) -> Result<()> {
    let recipient = valid_recipient(recipient)?;
    validate_campaign(subject, html).map_err(|_| Error::RustError("invalid campaign".into()))?;
    let rendered = render_campaign_html(html, unsubscribe_url)
        .map_err(|_| Error::RustError("invalid campaign unsubscribe URL".into()))?;
    let text = update_text(subject, html, unsubscribe_url);
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
        let (en_subject, en_html, en_text) = confirmation_content(Locale::En, url);
        assert!(en_subject.contains("Confirm"));
        assert!(en_html.contains("Confirm subscription"));
        assert!(en_text.contains("ignore this email"));
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
