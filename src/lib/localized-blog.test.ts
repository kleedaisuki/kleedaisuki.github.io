import { describe, expect, it } from "vitest";
import { getPairedSlug, type LocalizedBlogPost } from "./localized-blog";

/** @brief 构造双语文章夹具 (fixture) / Create bilingual post fixtures. */
function post(
  locale: "zh" | "en",
  slug: string,
  pair?: string,
): LocalizedBlogPost {
  return { data: { locale, slug, pair } };
}

describe("getPairedSlug", () => {
  it("returns the current slug when the target locale is unchanged", () => {
    expect(
      getPairedSlug([post("zh", "你好", "hello")], "zh", "你好", "zh"),
    ).toBe("你好");
  });

  it("uses an existing forward pair", () => {
    const posts = [post("zh", "你好", "hello"), post("en", "hello", "你好")];

    expect(getPairedSlug(posts, "zh", "你好", "en")).toBe("hello");
  });

  it("returns null when the current post has no pairing metadata", () => {
    const posts = [post("zh", "你好"), post("en", "hello", "你好")];

    expect(getPairedSlug(posts, "zh", "你好", "en")).toBeNull();
  });

  it("uses a reverse pair when the configured slug no longer exists", () => {
    const posts = [
      post("zh", "你好", "removed-slug"),
      post("en", "hello", "你好"),
    ];

    expect(getPairedSlug(posts, "zh", "你好", "en")).toBe("hello");
  });

  it("preserves the configured target when a pair has not been published", () => {
    const posts = [post("zh", "你好", "hello")];

    expect(getPairedSlug(posts, "zh", "你好", "en")).toBe("hello");
  });
});
