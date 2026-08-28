import { type CollectionEntry, getCollection } from "astro:content";
import type { BlogLocale } from "../lib/localized-blog";
import { getAtelierPath, getAtelierText } from "../lib/atelier";
import { getAbsoluteUrl, getPostPath, SITE } from "../lib/seo";

/** @brief LLM 导航文档中的语言分组 (LLM navigation locale) / Locale metadata for the LLM navigation document. */
interface LlmLocaleSection {
  locale: BlogLocale;
  heading: string;
  archiveLabel: string;
  feedLabel: string;
}

/** @brief LLM 导航页支持的语言分组 (LLM navigation locales) / Supported locale sections for the LLM navigation page. */
const LLM_LOCALE_SECTIONS: readonly LlmLocaleSection[] = [
  {
    locale: "zh",
    heading: "Chinese articles (canonical HTML)",
    archiveLabel: "Chinese archive",
    feedLabel: "Chinese RSS feed",
  },
  {
    locale: "en",
    heading: "English articles (canonical HTML)",
    archiveLabel: "English archive",
    feedLabel: "English RSS feed",
  },
];

/**
 * @brief 转义 Markdown 链接标题 (Markdown link-label escaping) / Escape a Markdown link label.
 * @param value 原始标题 (raw title) / Raw title.
 * @return 可安全放入 Markdown 方括号的标题 / Title safe for Markdown square brackets.
 */
function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

/**
 * @brief 规范化摘要空白 (summary whitespace normalization) / Normalize whitespace in a summary.
 * @param value 原始摘要 (raw summary) / Raw summary.
 * @return 单行机器可读摘要 / Single-line machine-readable summary.
 */
function normalizeSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * @brief 格式化一条文章索引项 (article index entry) / Format one article index entry.
 * @param post 已发布文章 (published post) / Published post.
 * @return Markdown 格式的 canonical 文章链接 / Markdown canonical article link.
 */
function formatPostEntry(post: CollectionEntry<"blog">): string {
  const { data } = post;
  const url = getAbsoluteUrl(getPostPath(data.locale, data.slug));
  const title = escapeMarkdownLinkLabel(data.title);
  return `- [${title}](${url}): ${normalizeSummary(data.description)}`;
}

/**
 * @brief 格式化一条 Atelier 索引项 (Atelier index entry) / Format one Atelier work entry.
 * @param work 已发布的 Atelier 作品 / Published Atelier work.
 * @param locale 目标语言 / Target locale.
 * @return Markdown 格式的规范详情页链接 / Markdown canonical detail-page link.
 */
function formatAtelierEntry(
  work: CollectionEntry<"atelier">,
  locale: BlogLocale,
): string {
  const url = getAbsoluteUrl(getAtelierPath(locale, work.data.slug));
  return `- [${escapeMarkdownLinkLabel(getAtelierText(work.data.title, locale))}](${url}): ${normalizeSummary(getAtelierText(work.data.summary, locale))}`;
}

/**
 * @brief 构建面向 LLM 的站点导航 (LLM navigation) / Build concise site navigation for LLMs and agents.
 * @return 根目录 llms.txt 的静态响应 / Static response for the root llms.txt file.
 * @note 该文件是补充发现入口，不替代 canonical HTML、RSS、sitemap 或 robots.txt。
 */
export async function GET(): Promise<Response> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  const works = await getCollection("atelier", ({ data }) => !data.draft);
  const lines = [
    `# ${SITE.name}`,
    "",
    "> A bilingual digital atelier for writing, artifacts, research, and ideas in progress.",
    "",
    "The canonical HTML pages listed below are the source of record. Use the language-specific URL that matches the request; published translations are linked with hreflang in the HTML.",
    "",
    "## Start here",
    `- [Chinese home](${getAbsoluteUrl("/zh/")})`,
    `- [English home](${getAbsoluteUrl("/en/")})`,
    `- [Chinese Articrafts](${getAbsoluteUrl("/zh/articrafts/")}): Shared artifacts with a Chinese interface.`,
    `- [English Articrafts](${getAbsoluteUrl("/en/articrafts/")}): The same artifacts with an English interface.`,
    `- [About the author](${SITE.authorUrl})`,
    `- [All-language RSS feed](${getAbsoluteUrl("/rss.xml")})`,
    `- [XML sitemap](${getAbsoluteUrl("/sitemap-index.xml")})`,
    "",
  ];

  const sortedWorks = works.sort(
    (left, right) =>
      right.data.published.valueOf() - left.data.published.valueOf(),
  );
  for (const locale of ["zh", "en"] as const) {
    lines.push(`## ${locale === "zh" ? "Chinese" : "English"} Articrafts`);
    lines.push(
      `- [Articrafts index](${getAbsoluteUrl(`/${locale}/articrafts/`)}): Documents, source code, and downloadable releases.`,
    );
    lines.push(
      ...sortedWorks.map((work) => formatAtelierEntry(work, locale)),
      "",
    );
  }

  for (const section of LLM_LOCALE_SECTIONS) {
    const localePosts = posts
      .filter((post) => post.data.locale === section.locale)
      .sort(
        (left, right) => right.data.date.valueOf() - left.data.date.valueOf(),
      );

    lines.push(`## ${section.heading}`);
    lines.push(
      `- [${section.archiveLabel}](${getAbsoluteUrl(`/${section.locale}/blog/`)})`,
    );
    lines.push(
      `- [${section.feedLabel}](${getAbsoluteUrl(`/${section.locale}/rss.xml`)})`,
    );
    lines.push(...localePosts.map(formatPostEntry), "");
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
