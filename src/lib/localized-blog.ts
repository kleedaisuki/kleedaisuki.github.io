/** @brief 支持双语跳转的博客语言类型 (blog locale) / Blog locale used for bilingual navigation. */
export type BlogLocale = "zh" | "en";

/** @brief 双语文章跳转所需的最小文章数据 (post data) / Minimal post data for bilingual navigation. */
export interface LocalizedBlogPost {
  data: {
    locale: BlogLocale;
    slug: string;
    pair?: string;
  };
}

/** @brief 已发布文章的语言替代项 (published language alternate) / A published language alternate for a post. */
export interface PublishedBlogAlternate {
  locale: BlogLocale;
  slug: string;
}

/**
 * @brief 获取目标语言的配对文章 slug (paired slug) / Get a target locale's paired post slug.
 * @param posts 可见文章集合 (visible posts) / Visible post collection.
 * @param currentLocale 当前文章语言 (current locale) / Current post locale.
 * @param currentSlug 当前文章 slug (current slug) / Current post slug.
 * @param targetLocale 目标文章语言 (target locale) / Target post locale.
 * @return 目标文章 slug；不存在配对信息时返回 null / Target slug, or null when no pairing exists.
 */
export function getPairedSlug(
  posts: readonly LocalizedBlogPost[],
  currentLocale: BlogLocale,
  currentSlug: string,
  targetLocale: BlogLocale,
): string | null {
  if (currentLocale === targetLocale) return currentSlug;

  const currentPost = posts.find(
    (post) =>
      post.data.locale === currentLocale && post.data.slug === currentSlug,
  );
  const pairedSlug = currentPost?.data.pair;
  if (!pairedSlug) return null;

  const directMatch = posts.find(
    (post) =>
      post.data.locale === targetLocale && post.data.slug === pairedSlug,
  );
  if (directMatch) return pairedSlug;

  const reverseMatch = posts.find(
    (post) =>
      post.data.locale === targetLocale && post.data.pair === currentSlug,
  );
  return reverseMatch?.data.slug ?? pairedSlug;
}

/**
 * @brief 获取实际已发布的语言替代项 (published alternates) / Get only language alternates that are actually published.
 * @param posts 可见文章集合 (visible posts) / Visible post collection.
 * @param currentLocale 当前文章语言 (current locale) / Current post locale.
 * @param currentSlug 当前文章 slug (current slug) / Current post slug.
 * @return 仅包含存在页面的语言与 slug / Locales and slugs whose pages exist.
 * @note 未发布的译文绝不能生成 hreflang 或语言切换链接 (language-switch link)。
 */
export function getPublishedAlternates(
  posts: readonly LocalizedBlogPost[],
  currentLocale: BlogLocale,
  currentSlug: string,
): PublishedBlogAlternate[] {
  const locales: readonly BlogLocale[] = ["zh", "en"];

  return locales.flatMap((targetLocale) => {
    const targetSlug = getPairedSlug(
      posts,
      currentLocale,
      currentSlug,
      targetLocale,
    );
    if (!targetSlug) return [];

    const isPublished = posts.some(
      (post) =>
        post.data.locale === targetLocale && post.data.slug === targetSlug,
    );
    return isPublished ? [{ locale: targetLocale, slug: targetSlug }] : [];
  });
}
