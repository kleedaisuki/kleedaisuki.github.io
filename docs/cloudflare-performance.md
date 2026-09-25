# Canonical Cloudflare site: HTTP and source-level performance audit

Status: sampled on 2026-09-25 UTC after the canonical Worker Route cutover. This is **not** a Core Web Vitals or controlled user-experience measurement. The Chrome DevTools MCP prerequisite for a trace was unavailable, so no FCP, LCP, INP, CLS, TBT, or Lighthouse score is claimed. The existing [migration validation record](cloudflare-validation.md) covers separate browser layout checks.

## Workload, scope, and reproducibility

The relevant workload is a first visit to the Chinese homepage, a repeat visit after a deploy, and a crawler fetching public pages without executing JavaScript. The desired properties are crawlable initial HTML, small/quick critical resources, efficient repeat requests, fresh incremental SSG releases, and no theme/layout change. This audit samples `https://atelier.moesegfault.dev`; it does not infer global edge latency from one location.

The local host was Windows, Node 26.8.2 and curl 8.21.0, with a local HTTPS proxy visible as `127.0.0.1` to curl. Raw probe output and helper scripts were retained only in ignored `.cache/` and `.temp/`; they are **not required** to reproduce the findings. From a fresh checkout, build the current assets and use these PowerShell commands (the hashed CSS filename may change in a later build):

```powershell
corepack.cmd pnpm build
$origin = 'https://atelier.moesegfault.dev'
$html = Get-Content dist/zh/index.html -Raw
$cssPaths = [regex]::Matches($html, 'href="(/_astro/[^" ]+\.css)"') | ForEach-Object { $_.Groups[1].Value }
$mainCss = Get-Content (Join-Path dist ($cssPaths[0].TrimStart('/'))) -Raw
$faces = [regex]::Matches($mainCss, '@font-face\s*\{[^}]*\}')
[pscustomobject]@{
  HtmlBytes = (Get-Item dist/zh/index.html).Length
  Stylesheets = $cssPaths.Count
  MainCssBytes = [Text.Encoding]::UTF8.GetByteCount($mainCss)
  FontFaces = $faces.Count
  FontFaceBytes = ($faces | ForEach-Object { [Text.Encoding]::UTF8.GetByteCount($_.Value) } | Measure-Object -Sum).Sum
}
foreach ($path in @('/zh/', $cssPaths[0], $cssPaths[1])) {
  curl.exe --compressed -sS -o NUL -w 'status=%{http_code} ttfb=%{time_starttransfer}s downloaded=%{size_download}B\n' "$origin$path"
  curl.exe -sS -I "$origin$path" | Select-String 'HTTP/|Content-Type:|Cache-Control:|CF-Cache-Status:|ETag:'
}
$cssHeaders = curl.exe -sS -I "$origin$($cssPaths[0])"
$etag = ($cssHeaders | Select-String '^ETag: (.+)$').Matches.Groups[1].Value
curl.exe -sS -I -H "If-None-Match: $etag" "$origin$($cssPaths[0])" | Select-String 'HTTP/1.1 304'
$botHtml = (curl.exe -sS -A 'Googlebot/2.1 (+http://www.google.com/bot.html)' "$origin/zh/") -join ''
@('<main', '<h1', 'rel="canonical"', 'hreflang="en"', 'application/ld+json') | ForEach-Object {
  "$_ : $($botHtml.Contains($_))"
}
"noindex : $($botHtml.Contains('noindex'))"
curl.exe -sS -o NUL -w 'missing_status=%{http_code}\n' "$origin/missing-perf-audit-path/"
```

The transfer-size spot check used three curl requests per resource; the table below reports representative values, not precision guarantees. These wall times are affected by client/proxy path and cache state; **they are not browser paint times or representative production percentiles**.

## Observations

| Contract or resource | Observed HTTP/build evidence | Interpretation and limit |
| --- | --- | --- |
| SSG and bot HTML | `dist/zh/index.html` is 20,172 bytes uncompressed and the canonical `/zh/` is `200 text/html`; a Googlebot-UA GET contained `<main>`, `<h1>`, canonical, English `hreflang`, and JSON-LD, with no `noindex`. A nonexistent URL returned `404`. | Essential content/metadata do not depend on JavaScript execution. This establishes fetchability, **not** indexing or search rank. [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) favors pre-rendered content for bots that cannot execute JavaScript. |
| Static edge and freshness | `/zh/` reported `CF-Cache-Status: HIT` on the sampled edge and `Cache-Control: public, max-age=0, must-revalidate`. Other sampled public HTML, feed, sitemap, and `llms.txt` had the same revalidation policy. `/api/health` instead had `no-store`. | The SSG/static-asset configuration aligns with freshness after CI deploys; a cache HIT does not by itself prove a latency benefit. The HTTP HTML response had no `ETag` on GET or identity-encoded HEAD in this sample, although the feed and CSS did. Do not assume HTML conditional `304` revalidation here. [Cloudflare's static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/) describe default revalidation and `_headers` overrides. |
| Critical homepage styles | HTML references **two** external `<link rel="stylesheet">` resources in `<head>`; no external blocking script tag. `/_astro/index.BopfOZ4J.css` is 250,437 bytes uncompressed, ~100,116 bytes transferred with curl compression; `/_astro/index.CB5yZYX3.css` is 11,517 bytes uncompressed, ~2,490 bytes transferred. Homepage HTML transferred ~7,454 bytes in the same curl setup. | The first stylesheet dominates the measured HTML+CSS transfer (~91% of ~110 KiB), before any font files. Stylesheets normally block initial rendering, but the actual paint delay is **unknown** without a browser trace. [web.dev's CSS rendering explanation](https://web.dev/articles/critical-rendering-path/render-blocking-css) describes the mechanism. |
| Font declarations and asset scope | Build inspection found **204 `@font-face` blocks**, occupying 236,101 of 250,437 bytes in the large CSS file (~94%); `src/styles/fonts.css` imports Noto Sans SC 400/700. The built CSS has no residual `@import`, so there is no CSS-import network chain. The homepage HTML does not reference the large PDF reader bundle. | Font declaration generation is the leading source of critical CSS bytes. This does **not** mean 204 font files download: `unicode-range` and text/glyph demand determine actual requests. The PDF reader's ~607 KiB JS is a page-specific watch item, not a homepage critical-path regression. |
| Immutable bundle caching | Both sampled `/_astro/*` stylesheets returned `Cache-Control: public, max-age=31536000, immutable` and `ETag`; a conditional request for the large stylesheet returned `304`. | Hashed bundle names make long browser caching safe for unchanged assets; this is the right trade-off for incremental deployment. See `public/_headers` and [Cloudflare's fingerprinted-asset example](https://developers.cloudflare.com/workers/static-assets/headers/). |

Seven sequential Node-fetch repeat GETs of `/zh/` after the first sample ranged from 275 to 971 ms (median 279 ms), all `CF-Cache-Status: HIT`; the first sample was 1,936 ms. Curl's three cached HTML requests reported 1.25, 0.38, and 0.37 s TTFB. Their spread and the local proxy make them unsuitable for claims about user-visible gains or regressions. The CSS curl samples likewise ranged from ~0.49 to 0.74 s total after an earlier Node-fetch cold sample of 5.38 s; this suggests cache/network variance, not a stable CSS latency estimate.

## Judgment and next decision

**No production change is justified by this audit alone.** The positive evidence is strong for SSG/crawler compatibility, actual `404` behavior, and immutable hashed asset caching. The concrete performance *candidate* is the large render-blocking font-declaration stylesheet, not the Rust API or the lazy PDF reader. Arbitrarily delaying fonts or extracting CSS could alter text metrics and the preserved layout; raising HTML `max-age` could make newly published pages stale. Neither is a low-risk fix without real browser measurements.

If performance becomes a release concern, run a controlled desktop/mobile browser trace or field RUM measurement, recording LCP element, loaded font subsets, CSS request/parse cost, TTFB, CLS, and cache state. Compare the existing build against an isolated font-declaration reduction or noncritical-style split with the same page/content/theme, including repeat navigation and Chinese glyph coverage. [Google's field measurement guidance](https://web.dev/articles/vitals-field-measurement-best-practices) cautions that measurement code itself must not perturb load and interaction behavior. Only adopt a change if it improves the target workload without visual or compatibility regression.
