import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import sanitizeHtml from 'sanitize-html'

async function mdToHtml(md) {
	const file = await unified()
		.use(remarkParse)
		.use(remarkMath)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeKatex)
		.use(rehypeStringify, { allowDangerousHtml: true })
		.process(md)
	return String(file)
}

export async function GET(ctx) {
	const posts = await getCollection('blog', ({ data }) => !data.draft)
	const items = await Promise.all(
		posts
			.sort((a, b) => +new Date(b.data.pubDate) - +new Date(a.data.pubDate))
			.map(async (p) => {
				const html = await mdToHtml(p.body)
				return {
					title: p.data.title,
					description: p.data.description,
					pubDate: p.data.pubDate,
					// ★ 统一用 slug
					link: `/blog/${p.slug}/`,
					content: html,
				}
			})
	)
	return rss({ title: '@kleedaisuki', description: 'notes & research', site: ctx.site, items })
}
