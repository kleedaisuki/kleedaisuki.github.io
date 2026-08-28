import type { BlogLocale } from "./localized-blog";

/** @brief 站点的稳定身份信息 (site identity) / Stable identity information for the site. */
export const SITE = {
  url: "https://atelier.moesegfault.dev",
  name: "Atelier",
  authorName: "kleedaisuki",
  authorUrl: "https://me.moesegfault.dev",
  defaultDescription: {
    zh: "Klee 的 Atelier：文章、作品、研究与持续生长的想法。",
    en: "Klee's Atelier for writing, artifacts, research, and ideas in progress.",
  },
} as const;

/** @brief 可序列化的 JSON-LD 原子值 (JSON-LD scalar value) / Scalar value that can appear in JSON-LD. */
export type JsonLdScalar = string | number | boolean | null;

/** @brief 可序列化的 JSON-LD 值 (JSON-LD value) / Value that can appear in JSON-LD. */
export type JsonLdValue = JsonLdScalar | JsonLdObject | JsonLdValue[];

/** @brief JSON-LD 对象结构 (JSON-LD object) / JSON-LD object shape. */
export interface JsonLdObject {
  [key: string]: JsonLdValue | undefined;
}

/** @brief 文章结构化数据所需的输入 (article schema input) / Input used to build article structured data. */
export interface BlogPostingInput {
  url: string;
  archiveUrl: string;
  locale: BlogLocale;
  title: string;
  description: string;
  publishedAt: Date;
  modifiedAt?: Date;
  tags?: string[];
  homeName: string;
  archiveName: string;
}

/** @brief 博客归档结构化数据所需的输入 (blog schema input) / Input used to build blog structured data. */
export interface BlogSchemaInput {
  url: string;
  locale: BlogLocale;
  name: string;
  description: string;
}

/** @brief Atelier 索引中的作品摘要 (Atelier collection item) / Work summary listed by the Atelier collection. */
export interface AtelierCollectionItem {
  url: string;
  name: string;
  description: string;
}

/** @brief Atelier 索引结构化数据输入 (Atelier collection schema input) / Input for Atelier collection structured data. */
export interface AtelierCollectionSchemaInput {
  url: string;
  locale: BlogLocale;
  name: string;
  description: string;
  items: readonly AtelierCollectionItem[];
}

/** @brief Atelier 作品结构化数据输入 (Atelier work schema input) / Input for Atelier work structured data. */
export interface AtelierWorkSchemaInput {
  url: string;
  atelierUrl: string;
  locale: BlogLocale;
  name: string;
  description: string;
  publishedAt: Date;
  modifiedAt?: Date;
  tags?: readonly string[];
  license?: string;
  repository?: string;
  atelierName?: string;
  homeName?: string;
}

/**
 * @brief 构造站内绝对 URL (absolute URL) / Build an absolute URL on this site.
 * @param path 以斜杠开头的站内路径 (root-relative path) / Root-relative site path.
 * @return 可用于 canonical、feed 和结构化数据的绝对 URL / Absolute URL for canonicals, feeds, and structured data.
 */
export function getAbsoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}

/**
 * @brief 构造文章的稳定路径 (post path) / Build a stable post path.
 * @param locale 文章语言 (post locale) / Post locale.
 * @param slug 已发布文章的 slug / Published post slug.
 * @return 带尾部斜杠的站内文章路径 / Root-relative post path with a trailing slash.
 */
export function getPostPath(locale: BlogLocale, slug: string): string {
  return `/${locale}/blog/${encodeURIComponent(slug)}/`;
}

/**
 * @brief 映射结构化数据语言代码 (structured-data language) / Map a site locale to a structured-data language tag.
 * @param locale 站点语言 (site locale) / Site locale.
 * @return BCP 47 语言标签 / BCP 47 language tag.
 */
export function getLanguageTag(locale: BlogLocale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

/**
 * @brief 映射 Open Graph 语言代码 (Open Graph locale) / Map a site locale to an Open Graph locale.
 * @param locale 站点语言 (site locale) / Site locale.
 * @return Open Graph 使用的语言标签 / Language tag used by Open Graph.
 */
export function getOpenGraphLocale(locale: BlogLocale): string {
  return locale === "zh" ? "zh_CN" : "en_US";
}

/**
 * @brief 安全序列化 JSON-LD (safe JSON-LD serialization) / Safely serialize JSON-LD for an HTML script element.
 * @param value 结构化数据对象 (structured data) / Structured-data value.
 * @return 不会意外结束 script 标签的 JSON 文本 / JSON text that cannot accidentally close a script element.
 * @note 前端内容可包含 `<`；必须转义它以避免 `</script>` 注入 (script injection)。
 */
export function serializeJsonLd(value: JsonLdValue): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * @brief 生成站点与作者 JSON-LD (website JSON-LD) / Create WebSite and Person JSON-LD.
 * @param locale 当前首页语言 (home-page locale) / Locale of the home page.
 * @return 可嵌入首页的 JSON-LD 图 (JSON-LD graph) / JSON-LD graph for a home page.
 */
export function createWebSiteJsonLd(locale: BlogLocale): JsonLdObject {
  const homeUrl = getAbsoluteUrl(`/${locale}/`);
  const personId = `${SITE.url}/#person`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        url: homeUrl,
        name: SITE.name,
        description: SITE.defaultDescription[locale],
        inLanguage: getLanguageTag(locale),
        author: { "@id": personId },
      },
      {
        "@type": "Person",
        "@id": personId,
        name: SITE.authorName,
        url: SITE.authorUrl,
        sameAs: [SITE.authorUrl],
      },
    ],
  };
}

/**
 * @brief 生成博客归档 JSON-LD (blog JSON-LD) / Create Blog JSON-LD for an archive page.
 * @param input 归档页面的准确可见信息 (visible archive-page information) / Accurate visible archive-page information.
 * @return 可嵌入归档页的 JSON-LD 图 (JSON-LD graph) / JSON-LD graph for an archive page.
 */
export function createBlogJsonLd(input: BlogSchemaInput): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${input.url}#blog`,
        url: input.url,
        name: input.name,
        description: input.description,
        inLanguage: getLanguageTag(input.locale),
        author: {
          "@type": "Person",
          name: SITE.authorName,
          url: SITE.authorUrl,
        },
      },
    ],
  };
}

/**
 * @brief 生成文章与面包屑 JSON-LD (article JSON-LD) / Create BlogPosting and BreadcrumbList JSON-LD.
 * @param input 页面上可见且准确的文章信息 (visible and accurate article information) / Visible and accurate article information.
 * @return 可嵌入文章页的 JSON-LD 图 (JSON-LD graph) / JSON-LD graph for an article page.
 */
export function createBlogPostingJsonLd(input: BlogPostingInput): JsonLdObject {
  const article: JsonLdObject = {
    "@type": "BlogPosting",
    "@id": `${input.url}#blogposting`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.url,
    },
    headline: input.title,
    name: input.title,
    description: input.description,
    datePublished: input.publishedAt.toISOString(),
    author: {
      "@type": "Person",
      name: SITE.authorName,
      url: SITE.authorUrl,
    },
    isPartOf: {
      "@type": "Blog",
      "@id": `${input.archiveUrl}#blog`,
      url: input.archiveUrl,
      name: input.archiveName,
    },
    inLanguage: getLanguageTag(input.locale),
    url: input.url,
  };

  if (input.modifiedAt) article.dateModified = input.modifiedAt.toISOString();
  if (input.tags && input.tags.length > 0) article.keywords = input.tags;

  return {
    "@context": "https://schema.org",
    "@graph": [
      article,
      {
        "@type": "BreadcrumbList",
        "@id": `${input.url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: input.homeName,
            item: getAbsoluteUrl(`/${input.locale}/`),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: input.archiveName,
            item: input.archiveUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: input.title,
            item: input.url,
          },
        ],
      },
    ],
  };
}

/**
 * @brief 生成 Atelier 索引 JSON-LD (Atelier collection JSON-LD) / Create CollectionPage JSON-LD for Atelier.
 * @param input 索引页及其可见作品信息 / Collection page and its visible work summaries.
 * @return 包含 CollectionPage 与作品列表的 JSON-LD 图 / JSON-LD graph with CollectionPage and its work list.
 */
export function createAtelierCollectionJsonLd(
  input: AtelierCollectionSchemaInput,
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${input.url}#collection`,
        url: input.url,
        name: input.name,
        description: input.description,
        inLanguage: getLanguageTag(input.locale),
        author: {
          "@type": "Person",
          name: SITE.authorName,
          url: SITE.authorUrl,
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: input.items.length,
          itemListElement: input.items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: item.url,
            item: {
              "@type": "CreativeWork",
              "@id": `${item.url}#work`,
              url: item.url,
              name: item.name,
              description: item.description,
            },
          })),
        },
      },
    ],
  };
}

/**
 * @brief 生成 Atelier 作品与面包屑 JSON-LD (Atelier work and breadcrumb JSON-LD) / Create CreativeWork and BreadcrumbList JSON-LD.
 * @param input 详情页上可见且准确的作品信息 / Accurate work facts visible on the detail page.
 * @return 可嵌入详情页的 JSON-LD 图 / JSON-LD graph for an Atelier work page.
 */
export function createAtelierWorkJsonLd(
  input: AtelierWorkSchemaInput,
): JsonLdObject {
  const work: JsonLdObject = {
    "@type": "CreativeWork",
    "@id": `${input.url}#work`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.url,
    },
    url: input.url,
    name: input.name,
    headline: input.name,
    description: input.description,
    datePublished: input.publishedAt.toISOString(),
    inLanguage: getLanguageTag(input.locale),
    author: {
      "@type": "Person",
      name: SITE.authorName,
      url: SITE.authorUrl,
    },
    isPartOf: {
      "@type": "CollectionPage",
      "@id": `${input.atelierUrl}#collection`,
      url: input.atelierUrl,
      name: input.atelierName ?? "Articrafts",
    },
  };

  if (input.modifiedAt) work.dateModified = input.modifiedAt.toISOString();
  if (input.tags && input.tags.length > 0) work.keywords = [...input.tags];
  if (input.license) work.license = input.license;
  if (input.repository) work.codeRepository = input.repository;

  return {
    "@context": "https://schema.org",
    "@graph": [
      work,
      {
        "@type": "BreadcrumbList",
        "@id": `${input.url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: input.homeName ?? "Home",
            item: getAbsoluteUrl(`/${input.locale}/`),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: input.atelierName ?? "Articrafts",
            item: input.atelierUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: input.name,
            item: input.url,
          },
        ],
      },
    ],
  };
}
