import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** @brief 构建产物目录 (build output directory) / Directory containing the static build output. */
const OUTPUT_DIRECTORY = join(process.cwd(), "dist");

/** @brief 站点规范来源 (canonical origin) / Canonical site origin. */
const SITE_ORIGIN = "https://blog.moesegfault.dev";

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
  readOutputFile("rss.xml");
}

assert(existsSync(OUTPUT_DIRECTORY), "Build output is missing; run pnpm build first");
verifySitemap();
verifyDiscoveryEntries();

for (const locale of ["zh", "en"]) {
  const articleFiles = getArticleFiles(locale);
  assert(articleFiles.length > 0, `No ${locale} articles were built`);
  articleFiles.forEach((relativePath) => verifyArticle(relativePath, locale));
}

console.log("SEO build-output verification passed.");
