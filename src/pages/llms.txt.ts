import { getCollection, type CollectionEntry } from "astro:content";
import type { BlogLocale } from "../lib/localized-blog";
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
 * @brief 构建面向 LLM 的站点导航 (LLM navigation) / Build concise site navigation for LLMs and agents.
 * @return 根目录 llms.txt 的静态响应 / Static response for the root llms.txt file.
 * @note 该文件是补充发现入口，不替代 canonical HTML、RSS、sitemap 或 robots.txt。
 */
export async function GET(): Promise<Response> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  const lines = [
    `# ${SITE.name}`,
    "",
    "> A bilingual personal site with notes on programming, mathematics, research, and ideas.",
    "",
    "The canonical HTML pages listed below are the source of record. Use the language-specific URL that matches the request; published translations are linked with hreflang in the HTML.",
    "",
    "## Start here",
    `- [Chinese home](${getAbsoluteUrl("/zh/")})`,
    `- [English home](${getAbsoluteUrl("/en/")})`,
    `- [Author on GitHub](${SITE.authorUrl})`,
    `- [All-language RSS feed](${getAbsoluteUrl("/rss.xml")})`,
    `- [XML sitemap](${getAbsoluteUrl("/sitemap-index.xml")})`,
    "",
  ];

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
