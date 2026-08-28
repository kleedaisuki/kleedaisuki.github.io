import { describe, expect, it } from "vitest";
import {
  createAtelierCollectionJsonLd,
  createAtelierWorkJsonLd,
  createBlogPostingJsonLd,
  getAbsoluteUrl,
  getPostPath,
  serializeJsonLd,
} from "./seo";

describe("SEO helpers", () => {
  it("builds encoded canonical post paths", () => {
    expect(getPostPath("zh", "图 灵 / notes")).toBe(
      "/zh/blog/%E5%9B%BE%20%E7%81%B5%20%2F%20notes/",
    );
    expect(getAbsoluteUrl("/en/")).toBe("https://atelier.moesegfault.dev/en/");
  });

  it("emits visible article facts in the BlogPosting graph", () => {
    const url = getAbsoluteUrl("/zh/blog/test/");
    const data = createBlogPostingJsonLd({
      url,
      archiveUrl: getAbsoluteUrl("/zh/blog/"),
      locale: "zh",
      title: "测试文章",
      description: "这是一篇测试摘要。",
      publishedAt: new Date("2026-05-03T00:00:00.000Z"),
      tags: ["测试"],
      homeName: "首页",
      archiveName: "博客",
    });
    const graph = data["@graph"] as Array<Record<string, unknown>>;
    const article = graph[0];

    expect(article).toMatchObject({
      "@type": "BlogPosting",
      headline: "测试文章",
      description: "这是一篇测试摘要。",
      datePublished: "2026-05-03T00:00:00.000Z",
      inLanguage: "zh-CN",
      keywords: ["测试"],
    });
  });

  it("escapes script-closing text before embedding JSON-LD", () => {
    const serialized = serializeJsonLd({
      "@context": "https://schema.org",
      headline: "</script><script>alert(1)</script>",
    });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });

  it("describes a localized Articrafts view as a collection page", () => {
    const url = getAbsoluteUrl("/en/articrafts/");
    const data = createAtelierCollectionJsonLd({
      url,
      locale: "en",
      name: "Articrafts",
      description: "Published documents and source code.",
      items: [
        {
          url: getAbsoluteUrl("/en/articrafts/example/"),
          name: "Example",
          description: "An example work.",
        },
      ],
    });
    const graph = data["@graph"] as Array<Record<string, unknown>>;

    expect(graph[0]).toMatchObject({
      "@type": "CollectionPage",
      inLanguage: "en",
      mainEntity: { "@type": "ItemList", numberOfItems: 1 },
    });
  });

  it("describes an Articrafts detail as a CreativeWork with breadcrumbs", () => {
    const url = getAbsoluteUrl("/en/articrafts/example/");
    const data = createAtelierWorkJsonLd({
      url,
      atelierUrl: getAbsoluteUrl("/en/articrafts/"),
      locale: "en",
      name: "Example",
      description: "An example work.",
      publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      tags: ["source"],
      license: "MIT",
    });
    const graph = data["@graph"] as Array<Record<string, unknown>>;

    expect(graph[0]).toMatchObject({
      "@type": "CreativeWork",
      inLanguage: "en",
      datePublished: "2026-08-24T00:00:00.000Z",
      keywords: ["source"],
      license: "MIT",
    });
    expect(graph[1]).toMatchObject({ "@type": "BreadcrumbList" });
    expect(
      (graph[1].itemListElement as Array<Record<string, unknown>>)[0],
    ).toMatchObject({ item: getAbsoluteUrl("/en/") });
  });

  it("localizes Chinese Articrafts schemas and their home breadcrumb", () => {
    /** @brief 中文作品目录的绝对地址 / Absolute URL of the Chinese Articrafts catalogue. */
    const collectionUrl = getAbsoluteUrl("/zh/articrafts/");
    /** @brief 中文作品目录结构化数据 / Structured data for the Chinese Articrafts catalogue. */
    const collection = createAtelierCollectionJsonLd({
      url: collectionUrl,
      locale: "zh",
      name: "Articrafts",
      description: "已发布的文档与源代码。",
      items: [],
    });
    /** @brief 中文作品目录结构化数据图 / Structured-data graph for the Chinese Articrafts catalogue. */
    const collectionGraph = collection["@graph"] as Array<
      Record<string, unknown>
    >;

    expect(collectionGraph[0]).toMatchObject({
      "@type": "CollectionPage",
      inLanguage: "zh-CN",
    });

    /** @brief 中文作品详情的绝对地址 / Absolute URL of the Chinese Articrafts detail. */
    const workUrl = getAbsoluteUrl("/zh/articrafts/example/");
    /** @brief 中文作品详情结构化数据 / Structured data for the Chinese Articrafts detail. */
    const work = createAtelierWorkJsonLd({
      url: workUrl,
      atelierUrl: collectionUrl,
      locale: "zh",
      name: "示例",
      description: "一个示例作品。",
      publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      homeName: "首页",
    });
    /** @brief 中文作品详情结构化数据图 / Structured-data graph for the Chinese Articrafts detail. */
    const workGraph = work["@graph"] as Array<Record<string, unknown>>;

    expect(workGraph[0]).toMatchObject({
      "@type": "CreativeWork",
      inLanguage: "zh-CN",
    });
    expect(
      (workGraph[1].itemListElement as Array<Record<string, unknown>>)[0],
    ).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "首页",
      item: getAbsoluteUrl("/zh/"),
    });
  });
});
