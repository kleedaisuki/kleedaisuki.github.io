import type { CollectionEntry } from "astro:content";
import type { AtelierLocale } from "../i18n/atelier";
import { getAtelierActivityDate } from "./atelier";

/** @brief 首页展示的博客条目 / Blog entry displayed on the studio homepage. */
export type StudioPost = CollectionEntry<"blog">;

/** @brief 首页展示的 Articrafts 条目 / Articrafts entry displayed on the studio homepage. */
export type StudioWork = CollectionEntry<"atelier">;

/** @brief 可用于归纳工作材料的带标签内容 / Tagged content used to derive workshop materials. */
interface TaggedStudioItem {
  tags?: readonly string[];
  activity: Date;
}

/** @brief 标签在真实内容中的使用统计 / Usage statistics for a tag in real content. */
interface TagUsage {
  label: string;
  count: number;
  latestActivity: number;
}

/**
 * @brief 选取当前语言最近发布的文章 / Select the newest published posts for one locale.
 * @param posts 全部博客条目 / All blog entries.
 * @param locale 首页语言 / Homepage locale.
 * @param limit 最大展示数量 / Maximum number of entries to display.
 * @return 日期降序排列的公开文章 / Published posts ordered by descending date.
 */
export function getRecentStudioPosts(
  posts: readonly StudioPost[],
  locale: AtelierLocale,
  limit = 3,
): StudioPost[] {
  return posts
    .filter((post) => post.data.locale === locale && !post.data.draft)
    .toSorted(
      (left, right) => right.data.date.getTime() - left.data.date.getTime(),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * @brief 选取最近活动的公开作品 / Select published works with the newest activity.
 * @param works 全部 Articrafts 条目 / All Articrafts entries.
 * @param limit 最大展示数量 / Maximum number of entries to display.
 * @return 活动时间降序排列的作品 / Works ordered by descending activity time.
 */
export function getRecentStudioWorks(
  works: readonly StudioWork[],
  limit = 3,
): StudioWork[] {
  return works
    .filter((work) => !work.data.draft)
    .toSorted(
      (left, right) =>
        getWorkActivity(right).getTime() - getWorkActivity(left).getTime(),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * @brief 从真实文章与作品标签归纳工作材料 / Derive workshop materials from real post and work tags.
 * @param posts 当前语言的公开文章 / Published posts in the current locale.
 * @param works 公开 Articrafts 作品 / Published Articrafts works.
 * @param limit 最大标签数量 / Maximum number of tags.
 * @return 按使用次数、最近活动与名称稳定排序的标签 / Tags stably ranked by use, recency, and name.
 * @note 大小写不同但文本相同的标签会合并 / Tags differing only in case are merged.
 */
export function getStudioMaterials(
  posts: readonly StudioPost[],
  works: readonly StudioWork[],
  limit = 8,
): string[] {
  /** @brief 可归纳标签的全部公开内容 / All published content eligible for tag aggregation. */
  const items: TaggedStudioItem[] = [
    ...posts
      .filter((post) => !post.data.draft)
      .map((post) => ({ tags: post.data.tags, activity: post.data.date })),
    ...works
      .filter((work) => !work.data.draft)
      .map((work) => ({
        tags: work.data.tags,
        activity: getWorkActivity(work),
      })),
  ];
  /** @brief 以规范化名称索引的标签统计 / Tag statistics indexed by normalized name. */
  const usage = new Map<string, TagUsage>();

  for (const item of items) {
    for (const rawTag of item.tags ?? []) {
      /** @brief 去除首尾空白后的原始展示名 / Display label with surrounding whitespace removed. */
      const label = rawTag.trim();
      if (!label) continue;
      /** @brief 用于大小写无关合并的规范键 / Normalized key for case-insensitive merging. */
      const key = label.toLocaleLowerCase("en");
      /** @brief 此标签此前的统计 / Existing statistics for this tag. */
      const previous = usage.get(key);
      usage.set(key, {
        label: previous?.label ?? label,
        count: (previous?.count ?? 0) + 1,
        latestActivity: Math.max(
          previous?.latestActivity ?? Number.NEGATIVE_INFINITY,
          item.activity.getTime(),
        ),
      });
    }
  }

  return [...usage.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.latestActivity - left.latestActivity ||
        left.label.localeCompare(right.label, "en"),
    )
    .slice(0, Math.max(0, limit))
    .map(({ label }) => label);
}

/**
 * @brief 取得作品最近活动时间 / Get a work's latest activity time.
 * @param work Articrafts 条目 / Articrafts entry.
 * @return 发布、更新或版本中的最近日期 / Latest publication, update, or release date.
 */
export function getStudioWorkActivity(work: StudioWork): Date {
  return getWorkActivity(work);
}

/**
 * @brief 内部统一计算作品活动时间 / Internally compute a work's activity date.
 * @param work Articrafts 条目 / Articrafts entry.
 * @return 作品最近活动时间 / Latest activity date for the work.
 */
function getWorkActivity(work: StudioWork): Date {
  return getAtelierActivityDate(
    work.data.published,
    work.data.updated,
    work.data.releases,
  );
}
