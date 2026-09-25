# Local validation: unified Atelier email, 2026-09-26

## Scope and expected behavior

The intended journey is a recognizable Atelier confirmation email and publication update, without changing established consent routes or resending old campaigns. New issues use an editable HTML fragment and plain-text sibling. `send:false` must persist a draft and create no deliveries; omitted `format` must continue to accept a complete legacy document, and queued IDs must be immutable. The additive `campaigns.text` migration must preserve old rows. Confirmation/update layouts should fit 320 px and 600 px widths. These expectations come from [the design spec](atelier-email-design.md), [template contract](email-template-architecture.md), and the existing `/api/admin/notify` workflow, not just implementation assertions.

All checks below used only local Wrangler/D1 and synthetic addresses or preview-only HTML. **No live email was sent and no remote deployment was performed.** The browser screenshots do not establish Gmail or Outlook rendering.

## Commands, environment, observations

Windows PowerShell, Node 26.8.2, Wrangler 4.140.0, local Rust toolchain; local D1 persistence under `.cache/email-unification-qa`, preview artifacts under `.temp`. To reproduce the integration path:

```powershell
node --test tests/notification-dispatch.test.mjs
cargo test --manifest-path worker/Cargo.toml --locked
./node_modules/.bin/wrangler.cmd d1 migrations apply DB --local --persist-to .cache/email-unification-qa
./node_modules/.bin/wrangler.cmd dev --local --persist-to .cache/email-unification-qa --port 8788 --var 'ATELIER_NOTIFY_TOKEN:qa-only-local-token'
# In a second shell while Wrangler runs:
node .temp/email-unification-smoke.mjs
python .temp/email-unification-db-check.py
python .temp/email-unification-migration.py
node --test tests/email-layout.test.mjs
```

The local smoke harness is `.temp/email-unification-smoke.mjs`; it posts the checked-in `notifications/atelier-update.json` + HTML/text, with `send:false`, then probes missing auth, unknown format, missing text, invalid fragment root, insecure text URL, idempotent draft replay, and an empty-list legacy `send:true` replay/immutable 409 path. It is intentionally not a production workflow script. The D1 inspection harness is `.temp/email-unification-db-check.py`. The migration rehearsal applies `0001_init.sql`, inserts a queued legacy campaign and pending delivery, then applies `0002_campaign_text.sql` in `.cache/email-unification-migration-fixture.sqlite`.

| Claim | Observed local result |
| --- | --- |
| CI authoring selection/validation | 10 Node tests passed; text-only edits select the referencing manifest, and the checked-in sample retains `send:false`. |
| Rust template/API contracts | 21 regular Rust unit tests passed; preview writer is intentionally ignored by default. |
| New draft API | `POST /api/admin/notify` returned 200 `{status:"draft",queued:false}` twice; status showed zero pending/sent. Negative inputs returned 401 or 400 as appropriate. |
| Frozen new snapshot | Local D1 row contained a complete HTML document with one unsubscribe placeholder and authored text with one placeholder; both contained the specific 420-configuration summary. After source-shell update, re-posting `send:false` updated the draft snapshot from 3340 to 3423 HTML characters. |
| Legacy compatibility | Omitted-format complete HTML remained byte-identical in D1 with `text=NULL`. Empty-list `send:true` queued once; identical replay reported `queued:false`; changed subject returned 409. D1 `deliveries` count stayed 0. |
| Additive migration | The pre-existing queued campaign, `text=NULL`, and pending delivery survived `0002_campaign_text.sql` unchanged in the local SQLite rehearsal. |
| Canonical destination | Local static-assets route `/zh/articrafts/jacobi-svd-locality-kernel-policy/` returned HTTP 200 `text/html`. |
| Browser width | `node --test tests/email-layout.test.mjs` passed. It uses the Rust preview writer with the actual checked-in long URL. Independent Playwright screenshots at 320 and 600 CSS px measured `scrollWidth=clientWidth` for both confirmation and update: 320/320 and 600/600. |

The first 320 px update screenshot **failed** at 328/320, exposing a real shell min-content overflow. A proposed fixed-layout shell passed its own preview, but a D1 extraction still failed because that draft was a snapshot made *before* the shell change. Restarting local Wrangler to load the rebuilt Worker and re-posting the editable `send:false` draft updated the snapshot; the independent screenshot then passed 320/320. This matters operationally: changing shell code alone does not alter stored campaigns, deliberately so for queued immutability. The new automated `tests/email-layout.test.mjs` makes the actual authored long-URL case reproducible without a live send.

Visual inspection of `.temp/email-update-320.png` and `.temp/email-confirmation-320.png` found the same paper/ink/vermilion frame, `A/ Atelier` mark, `MAILROOM / 邮件室` eyebrow, legible CTA, visible raw content/confirmation URL, and distinct appropriate footers. At 320 px the long article URL wraps; no content is clipped in Chromium. This is **browser preview evidence only**, not mail-client evidence.

## Verdict and limits

**Local pass for the no-send draft, legacy storage/API compatibility, additive migration, content parity, and browser-width requirement.** This does not verify recipient-client rendering, dark-mode behavior, MIME delivery by Cloudflare Email Service, or a production D1 migration. A controlled received-message check in Gmail/Outlook remains necessary before a newly styled `send:true` publication is sent broadly. Old already-queued campaigns should not be rewrapped or resent as a styling test.
