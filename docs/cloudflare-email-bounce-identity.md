# Cloudflare Email Sending bounce identity and Outlook display

Status: source-based investigation, 2026-09-26. No delivered message headers were available; this note does not claim a particular Outlook rendering cause was observed.

## Local evidence and expected transport identity

`worker/src/mail.rs` constructs confirmation and update messages with `SendEmailBuilder::builder("atelier@moesegfault.dev", recipient, subject)`. It does not supply a `Sender` or `Return-Path` header. Cloudflare's [header reference](https://developers.cloudflare.com/email-service/reference/headers/) says Email Service itself sets `Return-Path` to its bounce processor and rejects attempts to override that platform-controlled header. Its [domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/) places bounce MX and sending SPF on `cf-bounce.moesegfault.dev`. Therefore `bounces@cf-bounce.moesegfault.dev` in a delivered message's `Return-Path` is consistent with expected Cloudflare bounce handling, not evidence that the application's visible author (`From`) changed or that another person accessed the mailbox. The exact bounce local part has not been verified against this received message.

These fields must not be conflated:

| Identity | Purpose | Expected here |
| --- | --- | --- |
| RFC 5322 `From` | Message author shown as the principal sender in a mail client. | `atelier@moesegfault.dev` from application API field. |
| SMTP `MAIL FROM` / delivered `Return-Path` | Envelope reverse path for non-delivery reports; SPF authenticates this domain. | Cloudflare's `cf-bounce.moesegfault.dev` bounce processor. |
| RFC 5322 `Sender` | Agent actually transmitting on an author's behalf when distinct from `From`; separate from envelope sender. | Not set by this Worker. Whether Cloudflare or an intermediary added it requires received headers. |

[RFC 5322 §3.6.2](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6.2) distinguishes `From` (author) from `Sender` (transmitting agent). [Microsoft Graph](https://learn.microsoft.com/en-us/graph/outlook-send-mail-from-other-user) and [Exchange EWS](https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/delegate-access-and-ews-in-exchange) associate Outlook's explicit “on behalf of” presentation with differing `from` and `sender` identities. Thus a UI label naming the bounce address is not, by itself, proof that Outlook used only `Return-Path`; inspect the delivered `Sender` field before attributing that precise UI behavior. A mail client's wording may also differ from its underlying RFC fields.

## Authentication interpretation

Cloudflare publishes SPF on `cf-bounce.moesegfault.dev` and a DKIM selector `cf-bounce._domainkey.moesegfault.dev` for Email Sending ([domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)). SPF authenticates the envelope domain, not the visible `From` directly. [RFC 7489 §3.1](https://www.rfc-editor.org/rfc/rfc7489.html#section-3.1) considers `cf-bounce.moesegfault.dev` and `moesegfault.dev` aligned under relaxed SPF alignment because they share the organizational domain. They are not aligned under strict `aspf=s`; in that case, a passing DKIM signature aligned with `moesegfault.dev` could still satisfy DMARC. Merely seeing the bounce address does not establish SPF, DKIM, or DMARC failure, nor explain spam placement. Authentication must be read from the recipient's `Authentication-Results` and `DKIM-Signature` headers.

## Discriminating, safe next check

For the received confirmation message, inspect or share a **redacted header excerpt** containing `From`, `Sender` (including whether absent), `Return-Path`, `Authentication-Results` (`spf`, `dkim`, `dmarc`, `smtp.mailfrom`, `header.from`, `header.d`), and `DKIM-Signature` `d=`/`s=` only. Do not share message body, confirmation URL/token, recipient address, full `Received` chain, or full `Message-ID`.

* `From: atelier@...` plus `Return-Path: ...@cf-bounce...` and no `Sender` supports ordinary bounce plumbing. If Outlook still displays explicit “on behalf of,” the precise UI trigger remains unverified.
* `Sender: bounces@cf-bounce...` would explain Outlook's wording more directly and show a transport-added message-header identity, not just an envelope return path.
* `From` rewritten to the bounce address would contradict the intended author identity and merit provider-side investigation.
* `dmarc=fail`, or both SPF and DKIM failing/unaligned, would be evidence of a real authentication or DNS problem. `dmarc=pass` supports authentication but does not guarantee inbox placement.

No configuration change is justified solely by the bounce identity. In particular, attempting to set `Return-Path` in the Worker would be rejected by Cloudflare's Email Service.
