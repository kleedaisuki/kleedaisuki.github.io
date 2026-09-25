# Cloudflare migration validation record

Status: local verification, successful GitHub Actions deploy and DNS cutover, deployed `workers.dev` preview, and independent read-only canonical-domain smoke on 2026-09-25. **Real email delivery, paid-plan entitlement, and worldwide DNS propagation are not established by these results.**

## Independent contracts and environment

The published site before migration used Astro static HTML, `zh`/`en` routes, a warm light palette (`#fff6ea`, `#4b2a1e`, `#e66a3f`) and dark palette (`#21130f`, `#f6e7dc`, `#f27a50`), a two-column desktop homepage that stacks on mobile, and crawlable content without JavaScript. These expectations were taken from the existing site CSS, markup, and public route contracts, not inferred from the new Worker code. The regression test is `tests/e2e/migration-contract.spec.ts`.

Local environment: Windows PowerShell, Node 26.8.2, pnpm 11.17.0 via `corepack.cmd`, Playwright 1.62.1, Wrangler 4.140.0. The globally installed `pnpm.ps1` shim is broken on this host; a repository-local `.temp/pnpm.cmd` wrapper for `corepack.cmd pnpm` was used so Playwright's preview server could start. Test and Wrangler state stayed under `.temp/` and `.cache/`.

## Checks and observations

| Check | Exact command or workflow | Observed result | Scope limit |
| --- | --- | --- | --- |
| Visual/SSG/subscription browser contracts | `playwright test tests/e2e/migration-contract.spec.ts tests/e2e/subscribe.spec.ts --project=chromium --project=webkit --project=mobile-chromium --project=mobile-webkit` (with `.temp` first on `PATH`) | 24/24 passed: exact theme tokens, desktop/mobile geometry, raw crawler HTML with canonical and navigation, no-JS blog, subscription form success/failure/native fallback. | Form success/failure uses intercepted API responses; it does not prove D1 or email. Firefox was not run by this validator. |
| Full existing plus new browser suite | `playwright test --project=chromium --project=webkit --project=mobile-chromium --project=mobile-webkit` (same local PATH setup) | 48 passed, 4 skipped. Existing tests additionally cover navigation, overflow, theme toggle, restricted storage, checksums, and responsive PDF reader. | Four source-viewer checks are intentionally skipped because no source release is published. Firefox and in-app projects were not run by this validator. |
| SEO output | `node scripts/verify-seo-output.mjs` | Passed. | Local SSG output, not live origin. |
| Articrafts build fixture | `corepack.cmd pnpm verify:atelier` | Fixture build, artifact assertions and SEO verifier passed. | The script must run via pnpm; direct `node` fails because `npm_execpath` is absent. |
| Asset inventory | `Get-ChildItem dist -Recurse -File` plus byte totals | 798 files, 23.81 MiB total; largest file 2.65 MiB. | Current content set only; recheck on growth. |
| Local Worker runtime | `wrangler dev --local --persist-to .cache/validator-wrangler --port 8792 --var ATELIER_NOTIFY_TOKEN:validator-token --show-interactive-dev-session false`; then `wrangler d1 migrations apply DB --local --persist-to .cache/validator-wrangler` | Rust/Wasm built and Worker started with configured bindings; migration 0001 applied successfully. | Local simulator, not Cloudflare production account. |
| Worker route smoke | HTTP GET `/api/health`, `/zh/`, `/en/blog/`, `/llms.txt`, `/sitemap-index.xml`, `/missing-validator-path/` | Statuses respectively 200, 200, 200, 200, 200, 404. API health has `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. Chromium rendered Worker-served `/zh/` with hero and subscription form, and no page error. | Not a full browser matrix against Wrangler. |
| Safe admin draft | POST `/api/admin/notify` with local bearer token, valid HTML containing `{{unsubscribe_url}}`, `send:false`; GET `/api/admin/status?id=validator-draft`; edit same draft; inspect local D1 | Valid create/edit 200, status `draft`, all delivery counts zero, edited subject persisted. Missing unsubscribe placeholder 400; unauthenticated status request 401. | No `send:true`, no public subscribe, no actual email. |

## GitHub Actions release and DNS activation

| Evidence | Observed result | Limit |
| --- | --- | --- |
| [Deploy Action 36132611731](https://github.com/kleedaisuki/kleedaisuki.github.io/actions/runs/36132611731), `main` push | Workflow succeeded: 84 end-to-end browser tests passed, 7 skipped; remote D1 migration applied; Worker version `de9e3e28-faa4-4b3e-8e0b-38cca6918b18` deployed. The changed notification manifest was accepted with `send:false`; remote D1 campaign remained `draft`. | Proves that this revision's CI/deploy path and safe draft path ran. It does not prove `send:true`, scheduled dispatch, provider acceptance, or recipient delivery. |
| [Manual cutover Action 36133244601](https://github.com/kleedaisuki/kleedaisuki.github.io/actions/runs/36133244601), `activate` from `main` | Succeeded: exact existing CNAME was switched to `proxied: true` at 12:08:45 UTC; canonical page and Worker health checks converged at 12:13:46 UTC. | The Action's sampled checks and the independent canonical smoke below show the Worker route functioning from tested vantage points, not globally complete DNS propagation. Rollback path was not exercised. |

## Deployed preview smoke (read-only)

Target: `https://atelier-moesegfault.moesegfault.workers.dev` after the root agent deployed it and migrated remote D1. This verifies actual Cloudflare routing and static assets, not only local Wrangler. No subscription, admin send, or mail request was made against the remote Worker.

| Probe | Observation |
| --- | --- |
| `Invoke-WebRequest` GET `/api/health`, `/zh/`, `/en/`, `/zh/blog/`, `/zh/rss.xml`, `/sitemap-index.xml`, `/llms.txt` | All returned 200 with expected JSON, HTML, XML or plain-text content types. Health response has `Cache-Control: no-store`. |
| GET `/missing-validator-path/` | Returned 404, not an SPA shell or soft-404 status. |
| Googlebot-UA GET `/zh/`, `/en/`, `/zh/blog/2026-08-24-1-zh/` | Each 200 response body contains `<main>`, `<h1>`, canonical link, English hreflang, and JSON-LD without executing JavaScript. `/zh/` canonical remains `https://atelier.moesegfault.dev/zh/`, the intended final origin, rather than preview origin. |
| Read-only Playwright Chromium probe (desktop 1280×900 and mobile 390×844; procedure below) | Both returned 200, displayed `Atelier` heading and original `#fff6ea` background / `#e66a3f` accent, no document overflow and no page errors. Desktop door cards share y=705 and occupy separate columns; mobile cards share x=10 and stack at y=865/1169. Full-page screenshots were visually inspected locally with no evident clipping; they are **not** retained in version control. |
| One-shot navigation timing snapshot from the same remote Chromium run | Desktop: response end 369 ms, DOMContentLoaded 882 ms, 31 resource entries; mobile: response end 349 ms, DOMContentLoaded 639 ms, 31 resource entries. Wall times include `networkidle` and fonts (2454/1658 ms). These are uncontrolled smoke measurements, **not** Core Web Vitals or evidence of performance improvement. |

To reproduce the browser probe, launch Playwright Chromium, create separate pages at the two viewports above, and navigate to the preview `/zh/` with `waitUntil: "networkidle"`. Await `document.fonts.ready`; inspect `main h1`, `html[lang]`, `link[rel=canonical]`, computed root `--bg-color` and `--accent-color`, `document.documentElement.scrollWidth - clientWidth`, and the two `.studio-door` bounding boxes. Capture `pageerror` events and read `performance.getEntriesByType("navigation")[0]` for response-end and DOMContentLoaded timings. Any screenshots should be written to repository-local ignored `.cache/` and inspected locally, not committed as golden images. This procedure is a smoke comparison; the committed `tests/e2e/migration-contract.spec.ts` is the repeatable regression gate.

## Canonical-domain cutover smoke (read-only)

Target: `https://atelier.moesegfault.dev`, after the successful [manual cutover Action](https://github.com/kleedaisuki/kleedaisuki.github.io/actions/runs/36133244601). These are independent direct requests to the canonical hostname, not merely the Action's checks or preview hostname. Each sampled response carried a Cloudflare `CF-Ray` header ending in `-LAX`; `/api/health` returned `{"ok":true,"service":"atelier-worker"}` with `no-store` and `X-Robots-Tag: noindex, nofollow`. The Cloudflare header plus Rust health result support that the canonical route reached the new Worker from this vantage point, not that DNS propagated globally.

| Probe | Observation |
| --- | --- |
| PowerShell `Invoke-WebRequest -SkipHttpErrorCheck` GET `/api/health`, `/zh/`, `/en/`, `/zh/blog/2026-08-24-1-zh/`, `/zh/articrafts/cinder-cuda-tensor-library/1.0.0/`, `/zh/rss.xml`, `/sitemap-index.xml`, `/llms.txt` | All 200. HTML pages, RSS/sitemap XML and `llms.txt` text had matching content types. Public HTML used `Cache-Control: public, must-revalidate, max-age=0`; health used `no-store`. |
| GET `/missing-validator-path/` | 404 HTML, not a crawlable 200 shell. |
| Googlebot-UA raw GET of `/zh/`, `/en/`, the representative blog post and versioned Articrafts detail | All 200, with `<main>`, `<h1>`, canonical link, English hreflang and JSON-LD in the response body. The three home/blog pages had no `noindex`; the **versioned Articrafts detail did have `noindex`**, consistent with the existing policy excluding version URLs from sitemap. A separate GET of its stable work URL `/zh/articrafts/cinder-cuda-tensor-library/` returned 200 without `noindex` and with a matching canonical URL. |
| Chromium browser at 1280×900 and 390×900, `/zh/` with `networkidle` and fonts ready | Both 200, `main h1` = `Atelier`, no page errors or horizontal overflow. Light theme retained `#fff6ea` background / `#e66a3f` accent; clicking the toggle produced `#21130f` / `#f27a50`. Door coordinates were desktop `[50,705]` and `[652,705]`, mobile `[10,865]` and `[10,1169]`, confirming desktop columns and mobile stacking. |

## Issues and boundaries

- Wrangler 4.130.0 initially could not start a Worker configured with compatibility date `2026-09-25` because its bundled workerd supported only through `2026-09-15`. Upgrading the pinned Wrangler/workerd dependency to 4.140.0 resolved this; no date override was needed in the passing run.
- The existing PDF.js client build emits a chunk-size warning (`PdfReader` about 607 kB before gzip), but the interactive reader is a lazy enhancement, not a dependency of initial HTML. This is a performance watch item, not a failed regression here.
- Real subscription, confirmation, unsubscribe, Cloudflare Email Sending paid entitlement and arbitrary-recipient eligibility, consent-state transitions in remote D1, and cron dispatch require separate evidence. The remote `send:false` draft is established, but cannot establish email acceptance/delivery. Canonical-domain read-only smoke does not prove globally completed DNS propagation.

Verdict: **CI deployment, remote D1 draft, DNS proxy cutover, local compatibility, preview and sampled canonical-domain reading/search routes verified; real mail delivery, paid entitlement, and global DNS propagation remain unverified by this record**.
