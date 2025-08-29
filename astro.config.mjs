// astro.config.mjs
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";  // 必须是默认导入
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export default defineConfig({
	site: 'https://www.kleedaisuki.com',
	trailingSlash: 'always',
	i18n: {
		locales: ["zh", "en"],
		defaultLocale: "zh",
		routing: {
			prefixDefaultLocale: true,
			redirectToDefaultLocale: false,
		},
	},
	integrations: [
		sitemap({
			i18n: {
				defaultLocale: "zh",
				locales: { zh: "zh", en: "en" }
			}
		})
	],
	markdown: {
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			langAlias: { prompt: 'markdown' }
		},
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex],
	},
	alias: {
		"@styles": "./src/styles",
		"@components": "./src/components",
		"@layouts": "./src/layouts",
		"@i18n": "./src/i18n",
		"@content": "./src/content",
	},
})

