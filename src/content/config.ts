import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// 明确告诉 Astro：我的内容集合就叫 blog，位置在 src/content/blog
const blog = defineCollection({
    // 支持多语言目录：src/content/blog/zh/** 与 src/content/blog/en/**
    loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
    schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        date: z.coerce.date(),              // 字符串强转为 Date
        locale: z.enum(["zh", "en"]),
        slug: z.string(),                    // 允许中英不同 slug
        tags: z.array(z.string()).optional(),
        pair: z.string().optional(), 
    }),
});

export const collections = { blog };
