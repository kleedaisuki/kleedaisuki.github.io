import rss from "@astrojs/rss";
import { buildRssItems } from "../../lib/rss";

/**
 * @brief 生成中文 RSS 源 (Chinese RSS feed) / Generate the Chinese-language RSS feed.
 * @param ctx Astro 端点上下文 (Astro endpoint context) / Astro endpoint context.
 * @return 中文文章的 RSS 响应 / RSS response containing Chinese posts.
 */
export async function GET(ctx) {
  return rss({
    title: "@kleedaisuki（中文）",
    description: "kleedaisuki 的编程、数学、研究与思考笔记。",
    site: new URL("/zh/", ctx.site),
    customData: "<language>zh-CN</language>",
    items: await buildRssItems("zh"),
  });
}
