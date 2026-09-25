//! 更新邮件的纯领域规则，不依赖 Worker 运行时。 / Pure update-mail rules independent of the Worker runtime.

/// 退订链接占位符；每封群发邮件都必须将其替换为收件人专属链接。
/// Unsubscribe-link placeholder; replace it with a recipient-specific URL before sending.
pub const UNSUBSCRIBE_PLACEHOLDER: &str = "{{unsubscribe_url}}";

/// 输入验证错误；错误信息不包含用户提交的邮件地址或 HTML。
/// Input-validation error; its message never contains submitted addresses or HTML.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationError {
    InvalidEmail,
    InvalidLocale,
    InvalidSubject,
    InvalidHtml,
    MissingUnsubscribeLink,
    InvalidUnsubscribeUrl,
}

/// 邮件界面语言，仅支持现有站点公开的两种语言。
/// Message locale, restricted to the two languages exposed by the site.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Locale {
    Zh,
    En,
}

impl Locale {
    /// 返回公开 URL 和数据库中使用的稳定语言代码。 / Return the stable URL and database language code.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
        }
    }
}

/// 验证并规范化邮件地址，用于订阅去重。 / Validate and normalize an address for subscription deduplication.
///
/// 本服务有意只接受保守的 ASCII dot-atom 地址；不声称实现完整 RFC 5322 或 SMTPUTF8。
/// This deliberately accepts conservative ASCII dot-atom addresses, not all of RFC 5322 or SMTPUTF8.
/// 大小写归一化是本服务的账户身份规则；它可能合并理论上区分大小写的邮箱。
/// Case folding is this service's subscriber-identity rule; it can merge theoretically case-sensitive mailboxes.
pub fn normalize_email(input: &str) -> Result<String, ValidationError> {
    let address = input;
    if address.is_empty() || address.len() > 254 || !address.is_ascii() {
        return Err(ValidationError::InvalidEmail);
    }

    let (local, domain) = address
        .split_once('@')
        .ok_or(ValidationError::InvalidEmail)?;
    if local.is_empty() || local.len() > 64 || domain.is_empty() || domain.len() > 253 {
        return Err(ValidationError::InvalidEmail);
    }
    if local.starts_with('.')
        || local.ends_with('.')
        || local.contains("..")
        || !local.bytes().all(|ch| {
            ch.is_ascii_alphanumeric()
                || matches!(
                    ch,
                    b'!' | b'#'
                        | b'$'
                        | b'%'
                        | b'&'
                        | b'\''
                        | b'*'
                        | b'+'
                        | b'-'
                        | b'/'
                        | b'='
                        | b'?'
                        | b'^'
                        | b'_'
                        | b'`'
                        | b'{'
                        | b'|'
                        | b'}'
                        | b'~'
                        | b'.'
                )
        })
    {
        return Err(ValidationError::InvalidEmail);
    }
    if !domain.contains('.')
        || domain.split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || label.starts_with('-')
                || label.ends_with('-')
                || !label
                    .bytes()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-')
        })
    {
        return Err(ValidationError::InvalidEmail);
    }
    Ok(address.to_ascii_lowercase())
}

/// 验证公开的语言代码，不默默回退到另一种语言。 / Validate a public locale without silently switching languages.
pub fn normalize_locale(input: &str) -> Result<Locale, ValidationError> {
    match input {
        "zh" => Ok(Locale::Zh),
        "en" => Ok(Locale::En),
        _ => Err(ValidationError::InvalidLocale),
    }
}

/// 验证管理员编辑的群发 HTML 模板及主题。 / Validate an administrator-authored broadcast HTML template and subject.
///
/// HTML 是可信管理员内容，不在此清洗；不得把用户输入直接拼入模板。
/// HTML is trusted administrator content and is not sanitized here; never concatenate user input into it.
/// 主题最多 160 个字符且不得包含控制字符；HTML 最多 256 KiB，并须包含退订占位符。
/// Subject is at most 160 characters with no controls; HTML is at most 256 KiB and needs the unsubscribe placeholder.
pub fn validate_campaign(subject: &str, html: &str) -> Result<(), ValidationError> {
    if subject.trim().is_empty()
        || subject.chars().count() > 160
        || subject.chars().any(char::is_control)
    {
        return Err(ValidationError::InvalidSubject);
    }
    if html.trim().is_empty() || html.len() > 256 * 1024 || html.contains('\0') {
        return Err(ValidationError::InvalidHtml);
    }
    if !html.contains(UNSUBSCRIBE_PLACEHOLDER) {
        return Err(ValidationError::MissingUnsubscribeLink);
    }
    Ok(())
}

/// 将文本转义为 HTML 文本或双引号属性中的安全内容。 / Escape text for HTML text or double-quoted attributes.
pub fn escape_html(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

/// 将可信模板的退订占位符替换为 HTTPS 链接。 / Replace the trusted template's unsubscribe placeholder with an HTTPS URL.
///
/// 模板应把占位符放在带双引号的 `href` 属性里，例如 `<a href="{{unsubscribe_url}}">退订</a>`。
/// Place the placeholder in a double-quoted `href`, e.g. `<a href="{{unsubscribe_url}}">Unsubscribe</a>`.
pub fn render_campaign_html(template: &str, url: &str) -> Result<String, ValidationError> {
    if !template.contains(UNSUBSCRIBE_PLACEHOLDER) {
        return Err(ValidationError::MissingUnsubscribeLink);
    }
    let host = url
        .strip_prefix("https://")
        .and_then(|rest| rest.split(['/', '?', '#']).next());
    if host.unwrap_or_default().is_empty()
        || url
            .chars()
            .any(|ch| ch.is_control() || ch.is_whitespace() || matches!(ch, '@' | '\\'))
    {
        return Err(ValidationError::InvalidUnsubscribeUrl);
    }
    Ok(template.replace(UNSUBSCRIBE_PLACEHOLDER, &escape_html(url)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_normalizes_valid_address() {
        assert_eq!(
            normalize_email("Foo+Tag@Example.COM"),
            Ok("foo+tag@example.com".into())
        );
        assert_eq!(normalize_email("a@sub.example"), Ok("a@sub.example".into()));
    }

    #[test]
    fn email_rejects_malformed_and_unsafe_address() {
        for input in [
            "",
            "a@b",
            "a@@b.co",
            "a..b@c.co",
            ".a@c.co",
            "a.@c.co",
            "a@-c.co",
            "a@c-.co",
            "a@c..co",
            "a b@c.co",
            " a@c.co",
            "a@c.co ",
            "a\nb@c.co",
            "用户@例子.中国",
        ] {
            assert_eq!(
                normalize_email(input),
                Err(ValidationError::InvalidEmail),
                "{input:?}"
            );
        }
        assert_eq!(
            normalize_email(&format!("{}@example.com", "a".repeat(65))),
            Err(ValidationError::InvalidEmail)
        );
        assert_eq!(
            normalize_email(&format!("a@{}.com", "a".repeat(64))),
            Err(ValidationError::InvalidEmail)
        );
    }

    #[test]
    fn locales_are_explicit() {
        assert_eq!(normalize_locale("zh"), Ok(Locale::Zh));
        assert_eq!(normalize_locale("en"), Ok(Locale::En));
        assert_eq!(Locale::Zh.as_str(), "zh");
        assert_eq!(normalize_locale("ZH"), Err(ValidationError::InvalidLocale));
    }

    #[test]
    fn broadcast_needs_bounded_subject_html_and_unsubscribe() {
        let html = r#"<a href="{{unsubscribe_url}}">Unsubscribe</a>"#;
        assert_eq!(validate_campaign("New post", html), Ok(()));
        assert_eq!(
            validate_campaign("\r\nBcc: x", html),
            Err(ValidationError::InvalidSubject)
        );
        assert_eq!(
            validate_campaign(" ", html),
            Err(ValidationError::InvalidSubject)
        );
        assert_eq!(
            validate_campaign(&"x".repeat(161), html),
            Err(ValidationError::InvalidSubject)
        );
        assert_eq!(
            validate_campaign("News", "<p>Hi</p>"),
            Err(ValidationError::MissingUnsubscribeLink)
        );
        assert_eq!(
            validate_campaign(
                "News",
                &format!("{}{{{{unsubscribe_url}}}}", "x".repeat(256 * 1024))
            ),
            Err(ValidationError::InvalidHtml)
        );
    }

    #[test]
    fn html_escaping_and_url_replacement() {
        assert_eq!(escape_html("<&>\"'"), "&lt;&amp;&gt;&quot;&#39;");
        let html = r#"<a href="{{unsubscribe_url}}">Unsubscribe</a>"#;
        assert_eq!(
            render_campaign_html(html, "https://example.com/u?a=1&b=2"),
            Ok(r#"<a href="https://example.com/u?a=1&amp;b=2">Unsubscribe</a>"#.into())
        );
        assert_eq!(
            render_campaign_html(html, "javascript:alert(1)"),
            Err(ValidationError::InvalidUnsubscribeUrl)
        );
    }
}
