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
    InvalidText,
    InvalidFormat,
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
    validate_subject(subject)?;
    if html.trim().is_empty() || html.len() > 256 * 1024 || html.contains('\0') {
        return Err(ValidationError::InvalidHtml);
    }
    if !html.contains(UNSUBSCRIBE_PLACEHOLDER) {
        return Err(ValidationError::MissingUnsubscribeLink);
    }
    Ok(())
}

/// 在完整文档与片段格式间共享主题限制。 / Share subject limits across document and fragment formats.
pub fn validate_subject(subject: &str) -> Result<(), ValidationError> {
    if subject.trim().is_empty()
        || subject.chars().count() > 160
        || subject.chars().any(char::is_control)
    {
        return Err(ValidationError::InvalidSubject);
    }
    Ok(())
}

/// 显式区分旧完整文档与新版片段；缺省保留旧 API 语义。
/// Explicitly distinguish legacy full documents from the new fragment; omission preserves the old API contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CampaignFormat {
    Document,
    AtelierFragmentV1,
}

impl CampaignFormat {
    /// 解析公开格式名，不猜测 HTML 内容。 / Parse the public format name without guessing from HTML.
    pub fn parse(value: Option<&str>) -> Result<Self, ValidationError> {
        match value.unwrap_or("document") {
            "document" => Ok(Self::Document),
            "atelier-fragment-v1" => Ok(Self::AtelierFragmentV1),
            _ => Err(ValidationError::InvalidFormat),
        }
    }
}

/// 校验由共享外壳包装的可信管理员 HTML 片段和手写纯文本。
/// Validate a trusted-admin HTML fragment and authored text before the common shell wraps them.
///
/// 这是编写约束而非 HTML 清洗器；真实的退订占位符只由外壳追加。
/// This is an authoring contract, not an HTML sanitizer; only the shell appends unsubscribe placeholders.
pub fn validate_fragment(fragment: &str, text: &str) -> Result<(), ValidationError> {
    let lower = fragment.to_ascii_lowercase();
    if fragment.trim().is_empty()
        || fragment.len() > 256 * 1024
        || fragment.contains('\0')
        || fragment.contains(UNSUBSCRIBE_PLACEHOLDER)
        || ["<!doctype", "<html", "<head", "<body", "<script", "<form"]
            .iter()
            .any(|tag| lower.contains(tag))
    {
        return Err(ValidationError::InvalidHtml);
    }
    if text.trim().chars().count() < 40
        || text.len() > 16 * 1024
        || text
            .chars()
            .any(|ch| ch == '\0' || (ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t'))
        || text.contains(UNSUBSCRIBE_PLACEHOLDER)
        || !has_canonical_https_link(text)
    {
        return Err(ValidationError::InvalidText);
    }
    Ok(())
}

/// 校验可选的旧文档纯文本模板；未提供时保留既有发送回退。
/// Validate an optional legacy-document text template; absence preserves the old send fallback.
pub fn validate_document_text(text: &str) -> Result<(), ValidationError> {
    if text.trim().is_empty()
        || text.len() > 16 * 1024
        || text.contains('\0')
        || !text.contains(UNSUBSCRIBE_PLACEHOLDER)
    {
        return Err(ValidationError::InvalidText);
    }
    Ok(())
}

/// 只认可带具体内容路径的 HTTPS 正文地址，避免把首页当作内容 CTA。
/// Require an HTTPS URL with a content path, rather than treating a homepage as the canonical CTA.
fn has_canonical_https_link(text: &str) -> bool {
    text.split_whitespace().any(|word| {
        let candidate = word
            .trim_matches(|ch: char| matches!(ch, '<' | '>' | '(' | ')' | '，' | '。' | ',' | '.'));
        let Ok(url) = url::Url::parse(candidate) else {
            return false;
        };
        url.scheme() == "https"
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() != "/"
    })
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
    fn explicit_format_preserves_document_default_and_rejects_unknown() {
        assert_eq!(CampaignFormat::parse(None), Ok(CampaignFormat::Document));
        assert_eq!(
            CampaignFormat::parse(Some("document")),
            Ok(CampaignFormat::Document)
        );
        assert_eq!(
            CampaignFormat::parse(Some("atelier-fragment-v1")),
            Ok(CampaignFormat::AtelierFragmentV1)
        );
        assert_eq!(
            CampaignFormat::parse(Some("atelier-fragment-v2")),
            Err(ValidationError::InvalidFormat)
        );
    }

    #[test]
    fn fragment_requires_substantive_text_and_content_link() {
        let text = "A newly published essay about computing and writing. Read the complete essay: https://atelier.moesegfault.dev/zh/essays/real-item/";
        assert_eq!(
            validate_fragment("<h1>New essay</h1><p>Why it matters.</p>", text),
            Ok(())
        );
        for invalid in [
            "<html><p>Hi</p></html>",
            "<!DOCTYPE html><p>Hi</p>",
            "<SCRIPT src='x'></SCRIPT>",
            "<form></form>",
            "<p>{{unsubscribe_url}}</p>",
        ] {
            assert_eq!(
                validate_fragment(invalid, text),
                Err(ValidationError::InvalidHtml),
                "{invalid}"
            );
        }
        assert_eq!(
            validate_fragment("<h1>New essay</h1>", "See https://atelier.moesegfault.dev/"),
            Err(ValidationError::InvalidText)
        );
        assert_eq!(
            validate_fragment("<h1>New essay</h1>", &text.replace("https://", "http://")),
            Err(ValidationError::InvalidText)
        );
        assert_eq!(
            validate_fragment("<h1>New essay</h1>", &text.replace("real-item/", "")),
            Ok(())
        );
        assert_eq!(
            validate_fragment(
                "<h1>New essay</h1>",
                &text.replace(
                    "https://atelier.moesegfault.dev/zh/essays/real-item/",
                    "https://atelier.moesegfault.dev/"
                )
            ),
            Err(ValidationError::InvalidText)
        );
    }

    #[test]
    fn authored_document_text_requires_unsubscribe_template() {
        assert_eq!(
            validate_document_text("Read more\n{{unsubscribe_url}}"),
            Ok(())
        );
        assert_eq!(
            validate_document_text("Read more"),
            Err(ValidationError::InvalidText)
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
