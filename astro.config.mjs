// astro.config.mjs
import { defineConfig } from 'astro/config'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export default defineConfig({
	site: 'https://www.kleedaisuki.com',
	trailingSlash: 'always',
	markdown: {
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			langAlias: { prompt: 'markdown' }
		},
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex],
	},
})

