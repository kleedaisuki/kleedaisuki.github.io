# Frontend delivery on Cloudflare Workers

## Scope and decision

The existing Astro build already emits static HTML for the bilingual site and its public content. Keep that SSG contract when adding a Rust API Worker: the Worker serves prebuilt assets, while only `/api/*` needs dynamic code. This preserves the existing layout, CSS palette, canonical URLs, no-JavaScript content access, RSS, sitemap, and `llms.txt`. Do not convert public pages into an SPA merely to support email subscriptions.

The new home-page subscription section follows the existing sections without altering their CSS rules. Its visible content is generated as HTML. Native `method="post"`/`action="/api/subscribe"` works when JavaScript is disabled; a small TypeScript Astro script enhances it into a JSON `POST` with accessible inline status. The server accepts both JSON and URL-encoded input. A successful JSON request returns a generic non-enumerating 2xx response. The frontend does not infer whether an address is already subscribed.

## Platform and discoverability evidence

| Evidence | Consequence here |
| --- | --- |
| [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) uploads Worker code and static assets as one deployment; unmatched assets can fall through to the Worker. | Deploy `dist/` with the Rust Worker, routing `/api/*` to the dynamic handler while retaining static HTML. |
| [Cloudflare HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) defaults to `auto-trailing-slash`: `folder/index.html` is served at `/folder/`, and `/folder` redirects to it. | Astro's existing directory-format output and slash-terminated canonical links are compatible. Avoid an SPA fallback that would turn unknown content URLs into `200` shell pages. |
| [Cloudflare static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/) supports `_headers` and default revalidation with ETags; custom static headers do not apply to Worker-generated API responses. | `public/_headers` grants one-year immutable browser caching only to hashed Astro bundles and explicitly versioned PDF.js and Articrafts assets. Dynamic API responses require their own headers. |
| [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) notes that server/prerendered HTML is useful for users and crawlers, and some bots do not execute JavaScript. | Keep titles, descriptions, content, links, canonical, hreflang and structured data in the initial HTML. The subscription script is optional enhancement only. |
| [Google canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/canonicalization) treats canonical annotations and sitemaps as signals rather than guarantees. | Verify production HTTP status, redirects and canonical path agree; inspect actual indexing after deployment instead of claiming SEO success from build output alone. |

## Verification and limitations

- `astro check`: 60 files, zero errors/warnings/hints (2026-09-25 local run).
- `astro build`: 97 static pages emitted; `scripts/verify-seo-output.mjs` passed.
- `tests/e2e/subscribe.spec.ts`: Chromium, WebKit, mobile Chromium/WebKit, WeChat-like Android/iOS projects passed. Tests verify static form markup, JSON request shape, success and failure behavior, and no-JavaScript form presence.
- Local Firefox remained unverified: after installing Playwright Firefox v1538, Windows launch failed with `browserType.launch: spawn UNKNOWN` before page execution. This is an environment/browser startup failure, not evidence of a frontend failure. CI should run the project's standard browser matrix.
- The large PDF.js reader client bundle reported by Vite (about 607 kB before gzip) is existing behavior, not introduced by the subscription section. Because it is loaded on reader pages rather than site-wide, optimize only after a measured reader workload or deploy-size constraint warrants it.

## Acceptance checks after production deployment

1. Fetch `/zh/` and `/en/` without running JavaScript; confirm content and native form are in returned HTML.
2. Fetch a published article and work page; confirm `200`, correct canonical/hreflang, JSON-LD, and no SPA shell.
3. Fetch an unknown URL; confirm genuine `404`, not a `200` fallback.
4. Fetch `/robots.txt`, `/sitemap-index.xml`, `/rss.xml`, and `/llms.txt` from the canonical domain.
5. Submit the form with and without JavaScript; confirm generic success, rate-limit/error recovery, and no address enumeration. Check the actual sender domain separately; the HTML copy alone cannot prove mail delivery.
