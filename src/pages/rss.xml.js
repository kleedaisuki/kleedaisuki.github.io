import rss from "@astrojs/rss";
import { buildRssItems } from "../lib/rss";

export async function GET(ctx) {
  const items = await buildRssItems();
  return rss({
    title: "@kleedaisuki",
    description: "notes & research",
    site: new URL("/zh/", ctx.site),
    items,
  });
}
