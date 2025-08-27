// src/content.config.ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const blog = defineCollection({
  // 从 ./src/content/blog 目录抓取 .md 文件
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  // 用 Zod 校验每篇文章的 frontmatter
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    updatedDate: z.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
})
