import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** @brief 构建产物目录 (build output directory) / Directory containing the static build output. */
const OUTPUT_DIRECTORY = process.env.BUILD_OUTPUT_DIRECTORY
  ? resolve(process.env.BUILD_OUTPUT_DIRECTORY)
  : join(process.cwd(), "dist");

/** @brief 站点规范来源 (canonical origin) / Canonical site origin. */
const SITE_ORIGIN = "https://blog.moesegfault.dev";

/** @brief PDF.js 静态资源的锁定目录 (pinned PDF.js asset directory) / Pinned PDF.js static-asset directory. */
const PDFJS_ASSET_DIRECTORY = join("_pdfjs", "6.2.108");

/**
 * @brief 断言构建产物条件 (build-output assertion) / Assert a condition about the build output.
 * @param condition 待验证的条件 (condition to validate) / Condition to validate.
 * @param message 失败时的可操作信息 (actionable failure message) / Actionable failure message.
 * @return 无返回值 / No return value.
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @brief 读取 UTF-8 构建文件 (read UTF-8 build file) / Read a UTF-8 build file.
 * @param relativePath 相对 dist 的路径 (path relative to dist) / Path relative to dist.
 * @return 文件内容 / File contents.
 */
function readOutputFile(relativePath) {
  const path = join(OUTPUT_DIRECTORY, relativePath);
  assert(existsSync(path), `Missing build artifact: ${relativePath}`);
  return readFileSync(path, "utf8");
}

/**
 * @brief 收集某种语言的文章 HTML (article HTML files) / Collect article HTML files for a locale.
 * @param locale 语言目录 (locale directory) / Locale directory.
 * @return 相对 dist 的文章文件路径 / Article-file paths relative to dist.
 */
function getArticleFiles(locale) {
  const directory = join(OUTPUT_DIRECTORY, locale, "blog");
  assert(existsSync(directory), `Missing article directory: ${locale}/blog`);

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(locale, "blog", entry.name, "index.html"));
}

/**
 * @brief 解析页面中的 JSON-LD (page JSON-LD) / Parse the first JSON-LD script in a page.
 * @param html 静态页面 HTML (static page HTML) / Static page HTML.
 * @param relativePath 页面相对路径 (relative page path) / Relative page path.
 * @return 已解析的 JSON-LD 对象 / Parsed JSON-LD object.
 */
function parseJsonLd(html, relativePath) {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  assert(match, `Missing JSON-LD: ${relativePath}`);
  return JSON.parse(match[1]);
}

/**
 * @brief 验证文章输出的最低 SEO 合约 (article SEO contract) / Verify the minimum SEO contract for an article.
 * @param relativePath 文章相对路径 (relative article path) / Relative article path.
 * @param locale 文章语言 (article locale) / Article locale.
 * @return 无返回值 / No return value.
 */
function verifyArticle(relativePath, locale) {
  const html = readOutputFile(relativePath);
  const nonEmptyH1 = /<h1(?:\s[^>]*)?>\s*\S[\s\S]*?<\/h1>/.test(html);
  assert(nonEmptyH1, `Article has no non-empty H1: ${relativePath}`);
  assert(
    /<meta name="description" content="[^"]+">/.test(html),
    `Article has no description: ${relativePath}`,
  );
  assert(
    /<link rel="canonical" href="https:\/\/blog\.moesegfault\.dev\//.test(html),
    `Article has no absolute canonical: ${relativePath}`,
  );
  assert(
    /<meta property="article:published_time" content="[^"]+">/.test(html),
    `Article has no publication date: ${relativePath}`,
  );

  const jsonLd = parseJsonLd(html, relativePath);
  const graph = jsonLd["@graph"];
  assert(Array.isArray(graph), `Article JSON-LD has no graph: ${relativePath}`);
  assert(
    graph.some((item) => item?.["@type"] === "BlogPosting"),
    `Article JSON-LD has no BlogPosting: ${relativePath}`,
  );
  assert(
    graph.some((item) => item?.["@type"] === "BreadcrumbList"),
    `Article JSON-LD has no BreadcrumbList: ${relativePath}`,
  );
  assert(
    html.includes(
      `<link rel="alternate" hreflang="${locale}" href="${SITE_ORIGIN}/${locale}/blog/`,
    ),
    `Article is missing its self hreflang: ${relativePath}`,
  );
  const xDefault = html.match(
    /<link rel="alternate" hreflang="x-default" href="([^"]+)">/,
  );
  assert(
    !xDefault || xDefault[1].startsWith(`${SITE_ORIGIN}/zh/blog/`),
    `Article x-default does not target the Chinese counterpart: ${relativePath}`,
  );
}

/**
 * @brief 验证站点地图内容 (sitemap content) / Verify sitemap content.
 * @return 无返回值 / No return value.
 */
function verifySitemap() {
  const index = readOutputFile("sitemap-index.xml");
  const sitemapPaths = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname.replace(/^\//, ""),
  );
  assert(sitemapPaths.length > 0, "Sitemap index contains no sitemap files");

  const sitemap = sitemapPaths.map(readOutputFile).join("\n");
  assert(
    !sitemap.includes(`<loc>${SITE_ORIGIN}/</loc>`),
    "The noindex root redirect must not appear in the sitemap",
  );
  assert(
    sitemap.includes(`<loc>${SITE_ORIGIN}/zh/</loc>`),
    "Sitemap is missing the Chinese home page",
  );
  assert(
    sitemap.includes(`<loc>${SITE_ORIGIN}/en/</loc>`),
    "Sitemap is missing the English home page",
  );
  assert(
    sitemap.includes(`<loc>${SITE_ORIGIN}/atelier/</loc>`),
    "Sitemap is missing the Atelier collection",
  );
  assert(
    !/<loc>[^<]*\/atelier\/[^<]+\/(?:read|reader|source|raw)(?:\/|<)/.test(
      sitemap,
    ),
    "Sitemap includes an Atelier reader, source, or raw-resource route",
  );
}

/**
 * @brief 提取 Atelier 能力页面链接 (extract Atelier capability links) / Extract linked Atelier reader and source pages.
 * @param html Atelier 详情页 HTML / Atelier detail-page HTML.
 * @return 去重后的站内能力页面路径 / Deduplicated site-local capability page paths.
 */
function getAtelierCapabilityPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const pathname = new URL(match[1], SITE_ORIGIN).pathname;
    if (
      /^\/atelier\/[^/]+\/(?:[^/]+\/)?(?:read|reader|source)(?:\/|$)/.test(
        pathname,
      )
    ) {
      paths.add(pathname);
    }
  }
  return [...paths];
}

/**
 * @brief 将站点目录路径映射到静态 HTML (map a site directory URL to static HTML) / Map a site directory URL to its generated HTML file.
 * @param pathname 以斜杠开头的页面路径 / Root-relative page pathname.
 * @return 相对 dist 的 index.html 路径 / Path to index.html relative to dist.
 */
function pageOutputPath(pathname) {
  return join(pathname.replace(/^\/+|\/+$/g, ""), "index.html");
}

/**
 * @brief 验证 Atelier 独立内容域 (Atelier standalone-content contract) / Verify the standalone Atelier output contract.
 * @return 无返回值 / No return value.
 * @note 正式空态没有详情目录；此时索引页本身即为完整有效产物。
 */
function verifyAtelier() {
  const indexPath = join("atelier", "index.html");
  const index = readOutputFile(indexPath);
  assert(/<html lang="en"/.test(index), "Atelier must declare English as its document language");
  assert(!index.includes('hreflang='), "Atelier must not emit hreflang alternates");
  assert(
    !/rel="alternate" type="application\/rss\+xml"/.test(index),
    "Atelier must not emit a localized RSS alternate",
  );
  assert(!index.includes('class="lang-switch"'), "Atelier must not render a language switcher");
  assert(/<h1[^>]*>\s*Klee(?:’|&#39;|')s Atelier\s*<\/h1>/.test(index), "Atelier has no visible catalogue H1");
  const collectionJsonLd = parseJsonLd(index, indexPath);
  const collectionGraph = collectionJsonLd["@graph"];
  assert(
    Array.isArray(collectionGraph) &&
      collectionGraph.some((item) => item?.["@type"] === "CollectionPage"),
    "Atelier JSON-LD has no CollectionPage",
  );

  const atelierDirectory = join(OUTPUT_DIRECTORY, "atelier");
  const workDirectories = readdirSync(atelierDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(atelierDirectory, entry.name, "index.html")),
    )
    .map((entry) => entry.name);

  if (workDirectories.length === 0) {
    assert(
      index.includes("The atelier is being prepared."),
      "The empty Atelier catalogue has no intentional empty state",
    );
  }

  for (const slug of workDirectories) {
    const workDirectory = join(atelierDirectory, slug);
    const detailPaths = [join("atelier", slug, "index.html")];
    detailPaths.push(
      ...readdirSync(workDirectory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            existsSync(join(workDirectory, entry.name, "index.html")),
        )
        .map((entry) => join("atelier", slug, entry.name, "index.html")),
    );

    for (const detailPath of detailPaths) {
      const detail = readOutputFile(detailPath);
      const detailJsonLd = parseJsonLd(detail, detailPath);
      const detailGraph = detailJsonLd["@graph"];
      assert(
        Array.isArray(detailGraph) &&
          detailGraph.some((item) => item?.["@type"] === "CreativeWork") &&
          detailGraph.some((item) => item?.["@type"] === "BreadcrumbList"),
        `Atelier detail JSON-LD is incomplete: ${detailPath}`,
      );
      assert(!detail.includes('hreflang='), `Atelier detail emits hreflang: ${detailPath}`);
      assert(
        !detail.includes('class="lang-switch"'),
        `Atelier detail renders a language switcher: ${detailPath}`,
      );

      for (const capabilityPath of getAtelierCapabilityPaths(detail)) {
        const capabilityOutput = pageOutputPath(capabilityPath);
        const capability = readOutputFile(capabilityOutput);
        assert(
          /<meta name="robots" content="[^"]*noindex[^"]*">/.test(capability),
          `Atelier capability page is not noindex: ${capabilityOutput}`,
        );
      }
    }
  }
}

/**
 * @brief 验证 PDF.js 辅助资源布局 (PDF.js auxiliary asset layout) / Verify the copied PDF.js resource layout.
 * @return 无返回值 / No return value.
 */
function verifyPdfJsAssets() {
  const representativeAssets = {
    cmaps: "78-EUC-H.bcmap",
    standard_fonts: "FoxitDingbats.pfb",
    wasm: "jbig2.wasm",
    iccs: "CGATS001Compat-v2-micro.icc",
    images: "altText_add.svg",
  };

  for (const [directory, representativeAsset] of Object.entries(representativeAssets)) {
    const relativePath = join(PDFJS_ASSET_DIRECTORY, directory);
    const absolutePath = join(OUTPUT_DIRECTORY, relativePath);
    assert(existsSync(absolutePath), `Missing PDF.js asset directory: ${relativePath}`);
    assert(
      readdirSync(absolutePath).length > 0,
      `PDF.js asset directory is empty: ${relativePath}`,
    );
    assert(
      existsSync(join(absolutePath, representativeAsset)),
      `PDF.js asset has an unexpected nested path: ${join(relativePath, representativeAsset)}`,
    );
  }
}

/**
 * @brief 验证首页与 agent 入口 (home and agent entries) / Verify home pages and agent-discovery entries.
 * @return 无返回值 / No return value.
 */
function verifyDiscoveryEntries() {
  for (const locale of ["zh", "en"]) {
    const home = readOutputFile(join(locale, "index.html"));
    assert(
      /<h1[^>]*>\S[\s\S]*?<\/h1>/.test(home),
      `Home page has no server-rendered H1: ${locale}`,
    );
    assert(
      /<link rel="alternate" type="application\/rss\+xml"/.test(home),
      `Home page has no RSS discovery link: ${locale}`,
    );
    parseJsonLd(home, `${locale}/index.html`);
    readOutputFile(join(locale, "rss.xml"));
  }

  const llms = readOutputFile("llms.txt");
  assert(llms.includes(`${SITE_ORIGIN}/zh/blog/`), "llms.txt is missing the Chinese archive");
  assert(llms.includes(`${SITE_ORIGIN}/en/blog/`), "llms.txt is missing the English archive");
  assert(llms.includes(`${SITE_ORIGIN}/atelier/`), "llms.txt is missing Atelier");
  readOutputFile("rss.xml");
}

/**
 * @brief 验证本地化 404 路由 (localized 404 routes) / Verify localized 404 routes.
 * @return 无返回值 / No return value.
 * @note 通用 404 已显示两种语言的回首页入口，不能再生成会落入第二个 404 的语言切换链接。
 */
function verifyNotFoundRoutes() {
  const genericNotFound = readOutputFile("404.html");
  assert(
    !genericNotFound.includes('class="lang-switch"'),
    "Generic 404 must not render a redundant language switcher",
  );

  for (const locale of ["zh", "en"]) {
    const notFound = readOutputFile(join(locale, "404", "index.html"));
    assert(
      notFound.includes(`href="/${locale}/"`),
      `Localized 404 has no direct home link: ${locale}`,
    );
  }
}

assert(existsSync(OUTPUT_DIRECTORY), "Build output is missing; run pnpm build first");
verifySitemap();
verifyDiscoveryEntries();
verifyNotFoundRoutes();
verifyAtelier();
verifyPdfJsAssets();

for (const locale of ["zh", "en"]) {
  const articleFiles = getArticleFiles(locale);
  assert(articleFiles.length > 0, `No ${locale} articles were built`);
  articleFiles.forEach((relativePath) => verifyArticle(relativePath, locale));
}

console.log("SEO build-output verification passed.");
