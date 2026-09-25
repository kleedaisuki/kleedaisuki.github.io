# Atelier email template architecture: a compatibility-preserving path

Status: design implemented in the current source tree on 2026-09-26; **remote migration/deployment and received-client rendering are not established by this document**. This note preserves the rationale and implementation contract for subscription-confirmation/update/action-page consistency. Product language and colors are defined in [atelier-email-design.md](atelier-email-design.md); email-client evidence is in [email-client-compatibility.md](email-client-compatibility.md). The change does not alter Cloudflare's bounce `Return-Path`, consent state, or already-sent mail.

### Implemented source snapshot

[`worker/src/mail.rs`](../worker/src/mail.rs) now renders a shared confirmation/update mail shell, with a substantive localized confirmation text part and a fixed update footer in HTML and text. [`worker/src/domain.rs`](../worker/src/domain.rs) and the protected Worker API accept explicit `atelier-fragment-v1` input while omitted/`document` retains legacy full-document behavior. [`worker/migrations/0002_campaign_text.sql`](../worker/migrations/0002_campaign_text.sql) adds nullable `campaigns.text`; Rust stores complete HTML/text snapshots before queueing and uses the old text fallback for `NULL` legacy rows. [`scripts/dispatch-notifications.mjs`](../scripts/dispatch-notifications.mjs) handles optional `format`/`text_file` and selects referencing manifests on text-only edits. [`notifications/atelier-update.json`](../notifications/atelier-update.json) is a new-format **`send:false` draft** with issue-specific HTML fragment and authored text. These are code/artifact observations, not proof that the new template has been sent or rendered correctly by real mail clients.

## Current ownership and hard constraints

| State / workflow | Current owner | Compatibility requirement |
| --- | --- | --- |
| Subscribe/confirm/unsubscribe and generated per-recipient URLs | Rust `worker/src/lib.rs`, `worker/src/store.rs`, `worker/src/mail.rs`; D1 `subscribers` | Keep GET as review page and POST as state change; keep token/expiry, status, List-Unsubscribe/one-click, and subscriber rows unchanged. |
| Action-page visual language | `worker/src/lib.rs::render_action_html`, `public/action.css` | Keep URL/form behavior, public website layout and established paper/ink/vermilion theme. Align wording and visual details, not the underlying route or consent contract. |
| Update authoring and send gate | `notifications/*.json` + sibling `.html` and optional `.txt`; `scripts/dispatch-notifications.mjs`; `.github/workflows/deploy.yml` | Admin edits issue content, `send:false` is a draft, only changed manifests dispatch on a main push, `send:true` queues once. Existing IDs and already queued campaigns remain immutable. |
| Campaign snapshot | D1 `campaigns(id, subject, html, text, status, ...)`; `deliveries` | Already queued complete HTML/text is frozen; legacy `text=NULL` rows remain valid. No rewrapping, resend, or historical rewrite on deployment. |

Before this change, confirmation HTML was three bare paragraphs and checked-in update documents used different complete-page designs. The legacy `mail.rs::update_text` fallback discards the actual summary; the new fragment format instead requires authored text. The fallback remains for old `NULL`-text campaigns. This is a source-level distinction; actual new-template rendering in recipient clients remains untested. [RFC 2046 §5.1.4](https://www.rfc-editor.org/rfc/rfc2046.html#section-5.1.4) makes the two MIME parts alternative representations of the same data.

## Chosen model: one shell, two explicit authoring formats, stored snapshots

New updates are **HTML fragments** authored under `notifications/` and wrapped by a small, versioned Rust HTML email shell. The shell owns only the invariant frame: `A/ Atelier`, `MAILROOM / 邮件室`, paper/ink/vermilion colors, width/spacing, and the update footer containing exactly one `{{unsubscribe_url}}` link. The fragment owns issue-specific title, summary, canonical article/work CTA, and optional subordinate context. Confirmation uses that same frame and its transactional footer variant (ignore/expiry, no unsubscribe); it is generated in Rust, not authored as a campaign. The action page continues using `public/action.css`; its labels and hierarchy align with the mail but no website CSS is imported into email.

**Format is explicit rather than guessed from `<!doctype>` or `<html>`**. This avoids fragile parser heuristics and makes a legacy full document an ordinary supported input:

| Manifest `format` | Input | Worker ingest | D1 `campaigns.html` | Text requirement |
| --- | --- | --- | --- | --- |
| omitted / `document` | Existing complete HTML with `{{unsubscribe_url}}` | Validate and store exactly as today | Original full document | Optional `text_file`; old rows without text retain current fallback. |
| `atelier-fragment-v1` | Editable body fragment, **no** document root or unsubscribe placeholder | Validate fragment; wrap in versioned shell with footer | Complete rendered document, snapshotted before queue | Required `text_file` with substantive title/summary/canonical URL; Worker appends the fixed subscription reason and unsubscribe line. |

The version suffix documents the authoring contract, not a runtime renderer registry. Do **not** store only the fragment and render it again at send time: queued messages could change when Worker code changes. Do **not** silently wrap old full documents: their D1 snapshots and previous CI payloads must remain valid. If a future redesign merits `v2`, add it only when needed; never reinterpret `v1` snapshots.

The CI manifest remains `{id, subject, html_file, send}` plus optional `format` and `text_file`. For a new issue, e.g. `format: "atelier-fragment-v1", html_file: "issue.html", text_file: "issue.txt", send: false`. The protected `/api/admin/notify` payload adds optional `format` and `text`; omitted values mean legacy document/no authored text. Unknown formats fail closed. Keep admin API auth and `send` semantics unchanged. `text_file` must be a sibling `.txt`, read only through the validated filename; add `.txt` to changed-file indexing so text-only edits update an unsent draft. Never let a shell/CSS-only change select old `send:true` manifests for redispatch.

At ingest, render the complete HTML and plain text into a campaign snapshot. Add nullable `campaigns.text` (the **template** with `{{unsubscribe_url}}`, not a per-recipient URL) via an additive D1 migration; existing rows get `NULL`. A non-null authored text snapshot participates in draft update and queued-content equality checks alongside subject/HTML. This preserves idempotency: a repeated identical queued payload is accepted without new deliveries; a changed queued payload returns 409. At delivery, replace the placeholder in both parts with the same escaped/appropriate per-recipient HTTPS URL, after the existing current-consent check. For `NULL` text on legacy campaigns, use the existing simple fallback until that campaign is complete; do not claim it is semantically complete. Never store a recipient's tokenized URL in `campaigns` or log it.

`atelier-fragment-v1` validation should reject a document root, `<script>`, `<form>`, and `{{unsubscribe_url}}` in the fragment, require a bounded nonempty text sibling, and check that the authored plain text includes a canonical HTTPS content link. This is a trusted-admin authoring contract and a lint guard, **not** an HTML sanitizer. Existing document validation remains unchanged. Keep the shell's unsubscribe placeholder in a double-quoted `href` and the text placeholder in the fixed footer; preserve existing `List-Unsubscribe`, `List-Unsubscribe-Post`, and `List-Id` headers only for updates. An HTML fragment cannot be trusted to carry all accessibility semantics automatically; review the rendered full message.

### Representative flow

```text
notifications/issue.json + issue.html + issue.txt (send:false)
  -> CI validates sibling paths, format and changed-file set
  -> POST /api/admin/notify (authorized)
  -> Rust renders v1 shell, appends text footer, validates final snapshot
  -> D1 draft {subject, complete_html, complete_text_template}
  -> reviewed manifest send:true; same ID drafts become queued exactly once
  -> scheduler rechecks subscriber confirmed -> substitutes URL in both parts
  -> Email Service sends; delivery state follows current retry/unknown rules
```

## File ownership and implementation record

1. **Pure rendering contract.** `worker/src/mail.rs::render_shell` supplies a compact inline-styled shared frame for generated confirmation and fragment updates; `worker/src/domain.rs` retains separate document and fragment/text validation. The web `action.css` is not imported into mail.
2. **Additive data/API evolution.** Migration `0002_campaign_text.sql` adds nullable `text`. `NotifyInput`, store reads/writes, and send path carry that field. `/api/admin/notify` renders the complete fragment HTML/text **before** draft persistence; queued snapshots are not re-rendered. Existing campaign HTML, delivery rows, subscribers, and tokens are not rewritten. The old Worker remains compatible with the additive column.
3. **CI authoring.** The dispatch script validates explicit formats and sibling text paths; text-only edits select their referencing manifests. The new draft names a published work and canonical URL. Keep it `send:false` through review; never toggle or edit the already-sent `atelier-worker-launch-2026-09-25` campaign to test styling.
4. **Wording/visual integration.** Generated confirmation/update mail uses the shared identity while action pages remain owned by `public/action.css`. Any further home/action-page copy refinement must preserve public layout and POST-only consent semantics. Received-message review is still outstanding.

## Verification and rollout gates

| Gate | Evidence needed |
| --- | --- |
| Rust/unit | Both locales have purpose, correct CTA, expiry/ignore note, escaped HTTPS confirmation URL and substantive plain text; update shell has exactly one human-readable footer unsubscribe link; legacy full HTML is byte-for-byte pass-through before token substitution; fragment wraps once; no double root/footer; stored text and HTML use the same destination. |
| D1/API | Local migration applies to existing fixture data; old `NULL`-text queued row still sends; draft can change all three content fields; queued ID is immutable; repeated identical `send:true` does not enqueue again; `send:false` never queues; current-consent and unknown-outcome behavior unchanged. |
| CI | `.html` and `.txt` edits select only referencing manifest(s); malformed paths/unknown format fail closed; a shared shell code change alone cannot redispatch previous `send:true` campaigns. |
| Visual/MIME | Preview confirmation/update/action page side by side at narrow and desktop widths; inspect delivered `text/html` **and** `text/plain` in Gmail and Outlook variants with light/dark modes and images/CSS suppression. Browser screenshots cannot establish mail-client compatibility. No list-wide or historical resend. |

Apply the additive D1 migration **before** deploying the Worker, as the existing workflow already orders migration then deployment. Cloudflare documents that failed migrations roll back as units, but this does not substitute for a backup and a local rehearsal ([D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)). If the new Worker fails, roll back to the prior Worker: extra nullable `text` is harmless to prior queries. Do not attempt to remove the column or reinterpret queued snapshots during rollback. First deploy with all current `send:true` manifests unchanged, then review and queue one new issue under a fresh ID after recipient-client QA. Mail-client support is fragmented: Gmail supports much CSS but may ignore unsupported properties, so essential layout and colors stay inline and readable without enhancements ([Gmail CSS support](https://developers.google.com/workspace/gmail/design/css)).

## Rejected alternatives and remaining uncertainty

* **Re-author every historical full HTML document now:** breaks the immutability/audit story and may turn a style edit into a resend. A format default preserves those contracts instead.
* **Auto-detect fragment vs full document:** saves one manifest field but creates hidden parsing edge cases and accidental double wrappers. Explicit format is cheaper to reason about.
* **Generate plain text by stripping HTML:** can lose editorial order, link labels, and the real summary; the current link-only fallback demonstrates this risk. Authored sibling text is small, reviewable, and consistent with the MIME alternative contract. Keeping the fallback only for legacy `NULL` rows avoids forcing a rewrite of old queued campaigns.
* **Store only a template version and render on delivery:** allows deployment-time code changes to alter queued mail, contrary to the existing campaign snapshot invariant.
* **Import site CSS or introduce a cross-channel component/template framework:** email clients do not share browser CSS behavior; one tiny Rust shell and a separate existing action stylesheet are less risky than a framework.

Unresolved operational check: whether the exact v1 shell renders acceptably in recipient clients; local browser preview is insufficient. The adversarial case is a classic Outlook or dark-mode client altering the CTA/foreground colors. Inspect received messages before broad dispatch and adjust the small shell on evidence. Academic security research on hidden content in HTML mail reinforces a text-first, no-hidden-copy approach, but does not establish a rendering guarantee or justify a heavyweight sanitizer for this trusted-admin path ([content-concealment study](https://arxiv.org/abs/2410.11169)).
