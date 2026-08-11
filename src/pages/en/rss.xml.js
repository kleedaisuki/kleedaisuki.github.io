import rss from "@astrojs/rss";
import { buildRssItems } from "../../lib/rss";

/**
 * @brief 生成英文 RSS 源 (English RSS feed) / Generate the English-language RSS feed.
 * @param ctx Astro 端点上下文 (Astro endpoint context) / Astro endpoint context.
 * @return 英文文章的 RSS 响应 / RSS response containing English posts.
 */
export async function GET(ctx) {
  return rss({
    title: "@kleedaisuki (English)",
    description:
      "Notes by kleedaisuki on programming, mathematics, research, and ideas.",
    site: new URL("/en/", ctx.site),
    customData: "<language>en-US</language>",
    items: await buildRssItems("en"),
  });
}
