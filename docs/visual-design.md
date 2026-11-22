# Visual design

The site uses [moeSegFault Style](https://style.moesegfault.dev/) v0.2.0 for color, lines, type, and controls, and
adds its own pixel figures and page layout. This note records what the parts mean and why they work the way they
do. Delivery and hosting live in `frontend-delivery.md` and `cloudflare-performance.md`.

## Concept

Atelier is a workshop with a fire in it. Everything drawn on the site is a fact about the work, not decoration
that could be swapped for any other site's:

| Figure | What it shows | Code |
| --- | --- | --- |
| Hearth (home) | Publication history. Each piece warms the days after it; the fire burns on that curve. Each spark links to one piece. | `src/lib/pixel/{hearth,timeline,sparks}.ts`, `components/pixel/Hearth.astro` |
| Plate (works) | A Chladni figure: sand on a vibrating plate gathers along its still lines. The slug picks the two modes. | `src/lib/pixel/plate.ts`, `components/pixel/Plate.astro` |
| Fuse (articles) | Reading progress, burning along the header edge. | `.fuse` in `src/styles/global.css` |
| Dissolve (theme) | One theme replaces the other in 8×8 Bayer order. | `src/lib/pixel/dissolve.ts` |
| Burning 404 | The status code as fuel. `0x194` is 404 in hexadecimal. | `components/NotFoundPage.astro` |

One 8×8 Bayer matrix (`dither.ts`) supplies every threshold, so all figures share one grain.

## Rules

- **Roles, not colors.** Host CSS reads `--moe-*` semantic tokens. Raw palette values appear only in pixel figures.
- **Host CSS is unlayered.** The library lives in `moe.*` cascade layers, so host rules win without `!important`.
  The single exception overrides an inline `view-transition-name` during the theme dissolve.
- **Two crimson surfaces per page at most.** `data-moe-surface="brand"` carries its own contrast-checked tokens.
- **Hairlines, not shadows.** `.page` is one centered column between two frame lines; `.bleed` breaks out of it.
- **Nothing moves without meaning.** A hearth that nobody touches draws no frames. Reduced motion keeps the still
  SVG and never creates the canvas.
- **Layout explains.** Text that a position, shape, or control already conveys is removed; accessible names stay.
  Examples: the home sections carry the spark's shape, so the fire needs no legend; the navigation shows the section,
  so pages have no breadcrumbs; dates sort a list, so nothing is labeled "published" or "latest".

## Mechanisms worth knowing before changing them

**Hearth.** The simulation has no DOM and no clock. The build runs it for `SETTLE` steps and writes the frame as
SVG; the browser replays the same seeded steps from the same packed fuel, so the canvas replaces the SVG without a
jump. Both sides must therefore start from `unpackFuel(packFuel(fuel))`, because packing quantizes. Any frame is a
valid resting picture, which is why the loop can simply stop. The home hearth shows the newest 48 pieces; the grid
has no room for more sparks, and the archives list everything.

**Touch.** A stroke fans the fire by its speed. Holding feeds it gently and releasing spends what was gathered; each
column gains a random share, because equal shares make a flat flame front. Other code warms the fire with a bubbling
`hearth:stoke` event in viewport coordinates and needs no reference to the stage.

**One piece, two places.** A spark and its list row share `data-piece`. Touching either sets `data-active` on both
and warms the fire there. Only the spark shows a label, since the row is already its own.

**Plates.** Line width comes from `|height| / slope`, the first-order distance to the nearest still line, so steep
and shallow crossings get equally thick lines. Only modes with `n + m ≤ 5` are allowed: higher ones have lines
closer together than a 48-cell grid can draw, and the figure turns into noise.

**Sliding indicators.** `.slider` groups and the language switch draw one anchored pseudo-element that moves between
items. Where `anchor-scope` is missing each item paints its own mark. The navigation mark also carries a view
transition name, so it slides across documents. The language thumb must not have one: it would paint above its label.

**Button outcomes.** Subscribe and copy buttons show progress and result in the space of their label, and a
visually hidden or visible status says the same in words. Copy buttons stay hidden until their script runs.

**Phrases.** Browsers may break Chinese between any two characters. `Phrases.astro` puts `<wbr>` at word boundaries
from `Intl.Segmenter`, and `word-break: keep-all` removes all other break points in titles. `TERMS` in
`phrases.ts` lists words the dictionary gets wrong.

**Pixel paths.** A run of equal cells is one path segment and a dash pattern restores the gaps. This keeps the home
hearth to about 7 KiB of compressed HTML.

**Theme.** `data-moe-theme` drives the library. `data-theme`, the `site-theme` storage key, and
`[data-theme-toggle]` predate this design and stay, because the Worker's mail pages and visitors' stored
preferences depend on them.

**Mail.** `worker/src/mail.rs` repeats the palette as literals; see [the mail design](atelier-email-design.md).

**Mail action pages.** `public/action.css` repeats the needed roles as literals because the Worker's HTML cannot
load fingerprinted bundles. Class names are a contract with `worker/src/lib.rs`.

## Decisions

**Vendored style release.** See `src/vendor/moesegfault-style/v0.2.0/PROVENANCE.md`. To upgrade, add a sibling
directory and repoint the imports in `global.css`.

**System fonts for Chinese.** `@fontsource/noto-sans-sc` contributed 204 `@font-face` blocks that blocked the first
render. Geist covers Latin; Chinese uses the platform's own face. Geist also contains curly quotes and dashes,
which Chinese sets full width, so a `unicode-range` face routes that punctuation to the CJK font.

**MathML.** KaTeX's HTML output was rendered without KaTeX's stylesheet, so formulas were broken. Every browser in
`browserslist` supports MathML, which needs neither CSS nor fonts.

**Shiki CSS variables.** One theme of `--astro-code-*` variables replaces two inline palettes and the `!important`
rules that switched them.

## Measurements

Local builds on 2026-11-22, `gzip -9`, KB = 1000 bytes. "Before" is commit `c6aa095`.

| Render-blocking transfer | Before | After |
| --- | ---: | ---: |
| `/zh/` CSS | 103.0 KB | 17.6 KB |
| `/zh/` HTML | 7.6 KB | 14.7 KB |
| `/zh/blog/2025-08-22-1-zh/` CSS | 102.8 KB | 15.5 KB |
| `/zh/blog/2025-08-22-1-zh/` HTML | 8.4 KB | 8.7 KB |

The home page also loads 6.3 KB (uncompressed) of module script. These are byte counts, not paint timings; no
browser trace or field data has been recorded.

## Verification

Checked on 2026-11-22:

- 103 built pages at 320, 390, 768, 1024, and 1440 px in Chromium: no horizontal overflow, no console errors.
- Text contrast on six representative pages in both themes: 4.5:1, or 3:1 from 24 px, with no failures.
- Playwright suites: `chromium`, `mobile-chromium`, `wechat-android`, `firefox`.

Not checked: WebKit (`webkit`, `mobile-webkit`, `wechat-ios`), because the workstation lacks its system libraries;
CI covers it. Firefox has no scroll-driven animations yet, so it shows no fuse.
