import { getCollection } from "astro:content";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { BlogLocale } from "./localized-blog";
import { getPostPath } from "./seo";

/** @brief RSS 条目数据 (RSS item data) / Data required by the Astro RSS renderer. */
export interface RssItem {
  title: string;
  description: string;
  pubDate: Date;
  link: string;
  content: string;
  categories?: string[];
}

/**
 * @brief 将 Markdown 转为 RSS HTML (Markdown-to-RSS HTML) / Convert Markdown into HTML for an RSS item.
 * @param markdown 原始 Markdown 正文 (raw Markdown body) / Raw Markdown body.
 * @return RSS CDATA 中使用的 HTML / HTML for the RSS CDATA body.
 */
async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);
  return String(file);
}

/**
 * @brief 生成 RSS 条目 (RSS items) / Build RSS items for all posts or one locale.
 * @param locale 可选的语言过滤器 (optional locale filter) / Optional locale filter.
 * @return 按发布时间倒序排列的完整条目 / Complete items sorted by publication date descending.
 */
export async function buildRssItems(locale?: BlogLocale): Promise<RssItem[]> {
  const posts = await getCollection(
    "blog",
    ({ data }) => !data.draft && (!locale || data.locale === locale),
  );

  return Promise.all(
    posts
      .sort(
        (left, right) => right.data.date.valueOf() - left.data.date.valueOf(),
      )
      .map(async (post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link: getPostPath(post.data.locale, post.data.slug),
        content: await markdownToHtml(post.body ?? ""),
        categories: post.data.tags,
      })),
  );
}
