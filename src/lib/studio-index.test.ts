import { describe, expect, it } from "vitest";
import type { StudioPost, StudioWork } from "./studio-index";
import {
  getRecentStudioPosts,
  getRecentStudioWorks,
  getStudioMaterials,
} from "./studio-index";

/**
 * @brief 构造首页单测用博客条目 / Build a blog entry for homepage unit tests.
 * @param slug 条目标识 / Entry slug.
 * @param locale 条目语言 / Entry locale.
 * @param date 发布日期 / Publication date.
 * @param tags 内容标签 / Content tags.
 * @param draft 是否为草稿 / Whether this entry is a draft.
 * @return 最小可用博客条目 / Minimal usable blog entry.
 */
function post(
  slug: string,
  locale: "zh" | "en",
  date: string,
  tags: string[] = [],
  draft = false,
): StudioPost {
  return {
    id: slug,
    collection: "blog",
    data: {
      title: slug,
      description: slug,
      date: new Date(date),
      draft,
      locale,
      slug,
      tags,
    },
  } as StudioPost;
}

/**
 * @brief 构造首页单测用作品条目 / Build an Articrafts entry for homepage unit tests.
 * @param slug 条目标识 / Entry slug.
 * @param published 首次发布日期 / Initial publication date.
 * @param release 可选的版本发布日期 / Optional release date.
 * @param tags 内容标签 / Content tags.
 * @param draft 是否为草稿 / Whether this entry is a draft.
 * @return 最小可用作品条目 / Minimal usable Articrafts entry.
 */
function work(
  slug: string,
  published: string,
  release?: string,
  tags: string[] = [],
  draft = false,
): StudioWork {
  return {
    id: slug,
    collection: "atelier",
    data: {
      draft,
      slug,
      title: slug,
      summary: slug,
      published: new Date(published),
      tags,
      releases: release
        ? [{ version: "1", date: new Date(release), files: [] }]
        : [],
    },
  } as StudioWork;
}

describe("studio homepage index", () => {
  it("keeps writing locale-specific and sorts it independently", () => {
    /** @brief 混合语言及草稿的测试文章 / Test posts mixing locales and draft state. */
    const posts = [
      post("older", "en", "2026-01-01"),
      post("newer", "en", "2026-03-01"),
      post("zh", "zh", "2026-04-01"),
      post("draft", "en", "2026-05-01", [], true),
    ];
    expect(getRecentStudioPosts(posts, "en", 2).map(({ id }) => id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("uses release activity for Articrafts and handles empty input", () => {
    /** @brief 带不同活动日期的测试作品 / Test works with distinct activity dates. */
    const works = [
      work("recent-release", "2025-01-01", "2026-04-01"),
      work("recent-publish", "2026-03-01"),
    ];
    expect(getRecentStudioWorks(works).map(({ id }) => id)).toEqual([
      "recent-release",
      "recent-publish",
    ]);
    expect(getRecentStudioPosts([], "zh")).toEqual([]);
    expect(getRecentStudioWorks([])).toEqual([]);
  });

  it("derives materials only from published real-content tags", () => {
    /** @brief 用于标签统计的测试文章 / Test posts used for tag aggregation. */
    const posts = [
      post("one", "en", "2026-01-01", ["C++", "HPC"]),
      post("two", "en", "2026-03-01", ["hpc", "Agents"]),
      post("draft", "en", "2026-05-01", ["Hidden"], true),
    ];
    /** @brief 用于标签统计的测试作品 / Test works used for tag aggregation. */
    const works = [work("made", "2026-04-01", undefined, ["CUDA", "C++"])];
    expect(getStudioMaterials(posts, works, 3)).toEqual(["C++", "HPC", "CUDA"]);
    expect(getStudioMaterials([], [])).toEqual([]);
  });
});
