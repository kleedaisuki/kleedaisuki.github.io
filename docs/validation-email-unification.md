# Validation and release record: unified Atelier email, 2026-09-26

## Scope and expected behavior

The intended journey is a recognizable Atelier confirmation email and publication update, without changing established consent routes or resending old campaigns. New issues use an editable HTML fragment and plain-text sibling. `send:false` must persist a draft and create no deliveries; omitted `format` must continue to accept a complete legacy document, and queued IDs must be immutable. The additive `campaigns.text` migration must preserve old rows. Confirmation/update layouts should fit 320 px and 600 px widths. These expectations come from [the design spec](atelier-email-design.md), [template contract](email-template-architecture.md), and the existing `/api/admin/notify` workflow, not just implementation assertions.

The local checks below used Wrangler/D1, synthetic addresses, and preview-only HTML; **they sent no live email**. A later, separate production deployment/no-send observation is recorded after the local results. Neither browser screenshots nor remote draft persistence establish Gmail or Outlook rendering.

## Commands, environment, observations

Windows PowerShell, Node 26.8.2, Wrangler 4.140.0, local Rust toolchain; local D1 persistence under `.cache/email-unification-qa`, preview artifacts under `.temp`. To reproduce the integration path:

```powershell
node --test tests/notification-dispatch.test.mjs
cargo test --manifest-path worker/Cargo.toml --locked
node --test tests/email-layout.test.mjs
./node_modules/.bin/wrangler.cmd d1 migrations apply DB --local --persist-to .cache/email-unification-repro
./node_modules/.bin/wrangler.cmd dev --local --persist-to .cache/email-unification-repro --port 8788 --var 'ATELIER_NOTIFY_TOKEN:qa-only-local-token'
```

The original exploratory HTTP and SQLite harnesses lived under ignored `.temp/` and are **not retained in Git**. The committed Node tests above cover the authoring/selection and browser-width contracts. To repeat the core HTTP/D1 checks without the discarded harnesses, use a **fresh** local persistence directory (as above) so there are no confirmed subscribers, leave Wrangler running in the first shell, and execute the following in a second PowerShell shell. This uses synthetic records and only `send:false` for the new fragment; the legacy `send:true` check has an empty recipient list. Never substitute the production Worker URL/token.

```powershell
$base = 'http://127.0.0.1:8788'
$headers = @{ Authorization = 'Bearer qa-only-local-token' }
$manifest = Get-Content notifications/atelier-update.json -Raw | ConvertFrom-Json
$draft = @{
  id = 'qa-new-fragment-repro'
  subject = $manifest.subject
  format = 'atelier-fragment-v1'
  html = Get-Content notifications/atelier-update.html -Raw
  text = Get-Content notifications/atelier-update.txt -Raw
  send = $false
} | ConvertTo-Json -Compress
Invoke-RestMethod "$base/api/admin/notify" -Method Post -Headers $headers -ContentType 'application/json' -Body $draft
Invoke-RestMethod "$base/api/admin/notify" -Method Post -Headers $headers -ContentType 'application/json' -Body $draft
Invoke-RestMethod "$base/api/admin/status?id=qa-new-fragment-repro" -Headers $headers
# Expected: draft both times, queued:false, all delivery counts zero.
```

Inspect the persisted full snapshots, not just the API response:

```powershell
./node_modules/.bin/wrangler.cmd d1 execute DB --local --persist-to .cache/email-unification-repro --command "SELECT status, length(html) AS html_chars, length(text) AS text_chars, instr(html, '{{unsubscribe_url}}') AS html_link, instr(text, '{{unsubscribe_url}}') AS text_link FROM campaigns WHERE id='qa-new-fragment-repro'"
./node_modules/.bin/wrangler.cmd d1 execute DB --local --persist-to .cache/email-unification-repro --command "SELECT count(*) AS delivery_count FROM deliveries WHERE campaign_id='qa-new-fragment-repro'"
```

The HTML should be a complete document and both text and HTML should contain the issue summary and one unsubscribe placeholder. For the legacy path, first verify the fresh local D1 has zero confirmed subscribers; **stop if it does not**, or `send:true` could queue mail to them.

```powershell
./node_modules/.bin/wrangler.cmd d1 execute DB --local --persist-to .cache/email-unification-repro --command "SELECT count(*) AS confirmed_count FROM subscribers WHERE status='confirmed'"
$legacy = @{
  id = 'qa-legacy-repro'
  subject = 'Legacy fixture'
  html = '<!doctype html><html><body><p>Legacy content</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>'
  send = $true
} | ConvertTo-Json -Compress
Invoke-RestMethod "$base/api/admin/notify" -Method Post -Headers $headers -ContentType 'application/json' -Body $legacy
Invoke-RestMethod "$base/api/admin/notify" -Method Post -Headers $headers -ContentType 'application/json' -Body $legacy
Invoke-RestMethod "$base/api/admin/status?id=qa-legacy-repro" -Headers $headers
./node_modules/.bin/wrangler.cmd d1 execute DB --local --persist-to .cache/email-unification-repro --command "SELECT status, text IS NULL AS legacy_text_null, count(*) AS rows FROM campaigns WHERE id='qa-legacy-repro' GROUP BY status, text"
./node_modules/.bin/wrangler.cmd d1 execute DB --local --persist-to .cache/email-unification-repro --command "SELECT count(*) AS delivery_count FROM deliveries WHERE campaign_id='qa-legacy-repro'"
# Expected: first post queues, identical replay has queued:false, text=NULL, zero deliveries.
# Change only the subject and POST again; expected HTTP 409, no new delivery.
$changed = $legacy | ConvertFrom-Json
$changed.subject = 'Changed after queue'
try {
  Invoke-RestMethod "$base/api/admin/notify" -Method Post -Headers $headers -ContentType 'application/json' -Body ($changed | ConvertTo-Json -Compress)
  throw 'Expected immutable campaign to return HTTP 409'
} catch {
  if ([int]$_.Exception.Response.StatusCode -ne 409) { throw }
}
```

For the additive migration rehearsal, the following uses only Python's `sqlite3` standard library and committed migration files. It creates a **new** repository-local fixture and refuses to overwrite an existing one; use a fresh filename for a second run. This is a SQLite schema/data preservation check, not a substitute for Wrangler's D1 migration test or a remote migration:

```powershell
@'
from pathlib import Path
import sqlite3

p = Path(".cache/email-unification-migration-repro.sqlite")
if p.exists():
    raise SystemExit(f"Refusing to overwrite {p}; use a fresh fixture name")
p.parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(p)
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("worker/migrations/0001_init.sql").read_text(encoding="utf-8"))
db.execute("INSERT INTO subscribers(email,locale,status,confirm_token_hash,confirm_expires_at,unsubscribe_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
           ("legacy@example.test","en","pending","fixture-hash",9999999999999,"fixture-opt-out",1,1))
db.execute("INSERT INTO campaigns(id,subject,html,status,created_at,updated_at) VALUES (?,?,?,?,?,?)",
           ("legacy-fixture","Old subject","<p>Old message</p>","queued",1,1))
db.execute("INSERT INTO deliveries(campaign_id,email,status,available_at) VALUES (?,?,?,?)",
           ("legacy-fixture","legacy@example.test","pending",1))
db.commit()
db.executescript(Path("worker/migrations/0002_campaign_text.sql").read_text(encoding="utf-8"))
assert db.execute("SELECT text IS NULL,html,status FROM campaigns WHERE id='legacy-fixture'").fetchone() == (1,"<p>Old message</p>","queued")
assert db.execute("SELECT status FROM deliveries WHERE campaign_id='legacy-fixture'").fetchone() == ("pending",)
print("Legacy campaign and delivery preserved; new text is NULL")
db.close()
'@ | python -
```

The original smoke harness additionally exercised missing auth, unknown format, missing text, invalid fragment root, and insecure text URL (expected 401/400). Their equivalent validation rules are covered by `tests/notification-dispatch.test.mjs` and Rust unit tests; the one-off endpoint observations in the table below are retained as historical results, not falsely attributed to the durable snippets above.

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

**Local pass for the no-send draft, legacy storage/API compatibility, additive migration, content parity, and browser-width requirement.** The separate production evidence below establishes migration/deployment and a persisted no-send draft, but not recipient-client rendering, dark-mode behavior, or MIME delivery of the new templates. A controlled received-message check in Gmail/Outlook remains necessary before a newly styled `send:true` publication is sent broadly. Old already-queued campaigns should not be rewrapped or resent as a styling test.

## Later production release evidence (2026-09-26)

The first [deploy Action 36177202232](https://github.com/kleedaisuki/kleedaisuki.github.io/actions/runs/36177202232) **successfully applied remote `0002_campaign_text.sql` at 19:06:37 UTC**, then deployed a Worker. The overall Action failed later when the new-format draft POST returned HTTP 400 immediately after deployment; its likely version-skew mechanism, alternatives, and bounded mitigation are recorded in [the incident note](mail-rollout-race.md). A failed workflow does not imply its earlier migration/deploy steps were rolled back. Do not conflate that dispatch failure with this local pass or infer an edge trace from timing alone.

The follow-up [Action 36178715055](https://github.com/kleedaisuki/kleedaisuki.github.io/actions/runs/36178715055) succeeded: 84 browser tests passed, 7 skipped; its remote migration step reported **`No migrations to apply!`**, because 0002 had already been applied by the first Action. It then deployed Worker version `3b80ccce-0724-4730-bff8-83ab7f0e12a7`. CI's changed `send:false` draft was accepted at **19:21:29 UTC**. A remote D1 query showed `atelier-update-draft-2026-09` still `draft`, complete HTML length 3473, text length 689, both containing an unsubscribe placeholder and the 420-configuration summary, with **zero deliveries**. The historical launch campaign remained `complete` with one delivery; no historical replay was observed. Live `/api/health` advertised both `document` and `atelier-fragment-v1` formats; sampled `/zh/` showed the updated subscription copy; an invalid confirmation GET returned the expected 400 mailroom action page. Those are route/SSG/API checks, not proof of a received confirmation/update in any mail client.
