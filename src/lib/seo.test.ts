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
    expect(getAbsoluteUrl("/en/")).toBe("https://blog.moesegfault.dev/en/");
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

  it("describes a localized Atelier view as a collection page", () => {
    const url = getAbsoluteUrl("/en/atelier/");
    const data = createAtelierCollectionJsonLd({
      url,
      name: "Atelier",
      description: "Published documents and source code.",
      items: [
        {
          url: getAbsoluteUrl("/en/atelier/example/"),
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

  it("describes an Atelier detail as a CreativeWork with breadcrumbs", () => {
    const url = getAbsoluteUrl("/en/atelier/example/");
    const data = createAtelierWorkJsonLd({
      url,
      atelierUrl: getAbsoluteUrl("/en/atelier/"),
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
  });
});
