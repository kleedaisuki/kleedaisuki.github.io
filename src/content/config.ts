import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/** @brief 博客内容集合 / Blog content collection. */
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    locale: z.enum(["zh", "en"]),
    slug: z.string(),
    tags: z.array(z.string()).optional(),
    pair: z.string().optional(),
  }),
});

/** @brief Atelier 文件描述模式 / Atelier file descriptor schema. */
const atelierFile = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  mediaType: z.string().optional(),
  description: z.string().optional(),
  size: z.number().nonnegative().optional(),
  checksum: z.string().optional(),
});

/** @brief 可共享实体的本地化文本 / Localized text for a shared artifact entity. */
const atelierText = z.union([
  z.string(),
  z.object({ zh: z.string(), en: z.string() }),
]);

/** @brief Atelier 发布版本模式 / Atelier release schema. */
const atelierRelease = z.object({
  version: z.string(),
  date: z.coerce.date(),
  notes: z.string().optional(),
  files: z.array(atelierFile).default([]),
});

/** @brief 共享制品实体的 Atelier 内容集合 / Atelier collection of shared artifact entities. */
const atelier = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/atelier" }),
  schema: z.object({
    draft: z.boolean().default(false),
    slug: z.string(),
    title: atelierText,
    summary: atelierText,
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    license: z.string().optional(),
    repository: z.string().url().optional(),
    relatedPost: z.string().optional(),
    cover: z.string().optional(),
    releases: z.array(atelierRelease).default([]),
  }),
});

/** @brief Astro 可发现的全部内容集合 / All Astro-discoverable content collections. */
export const collections = { blog, atelier };
