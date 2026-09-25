import { expect, test } from "@playwright/test";

/**
 * @brief 迁移前已发布主题色 / Published palette before the Workers migration.
 * @note 这是独立的用户可见合同，不从当前样式表读取期望值 / These are independent user-facing expectations, not values parsed from the current stylesheet.
 */
const palette = {
  light: { background: "#fff6ea", text: "#4b2a1e", accent: "#e66a3f" },
  dark: { background: "#21130f", text: "#f6e7dc", accent: "#f27a50" },
} as const;

/**
 * @brief 读取实际渲染后的语义主题色 / Read computed semantic theme colors after rendering.
 * @param page Playwright 页面 / Playwright page.
 * @returns 三个稳定的主题令牌 / Three stable theme tokens.
 */
async function renderedPalette(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      background: styles.getPropertyValue("--bg-color").trim().toLowerCase(),
      text: styles.getPropertyValue("--text-color").trim().toLowerCase(),
      accent: styles.getPropertyValue("--accent-color").trim().toLowerCase(),
    };
  });
}

test("迁移保留明暗主题色和桌面双栏门厅", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/zh/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("html").evaluate((root) => (root.dataset.theme = "light"));
  expect(await renderedPalette(page)).toEqual(palette.light);

  const hero = page.locator(".studio-hero");
  const copy = hero.locator(".studio-hero__copy");
  const process = hero.locator(".studio-process");
  const doors = page.locator(".studio-doors .studio-door");
  await expect(hero).toBeVisible();
  await expect(doors).toHaveCount(2);
  const [copyBox, processBox, blogBox, workBox] = await Promise.all([
    copy.boundingBox(), process.boundingBox(), doors.nth(0).boundingBox(), doors.nth(1).boundingBox(),
  ]);
  expect(copyBox && processBox && copyBox.x + copyBox.width < processBox.x).toBeTruthy();
  expect(blogBox && workBox && blogBox.x + blogBox.width < workBox.x).toBeTruthy();
  expect(blogBox && workBox && Math.abs(blogBox.y - workBox.y) < 2).toBeTruthy();

  await page.locator("html").evaluate((root) => (root.dataset.theme = "dark"));
  expect(await renderedPalette(page)).toEqual(palette.dark);
});

test("迁移保留手机单栏和正文阅读宽度", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/");
  const doors = page.locator(".studio-doors .studio-door");
  const first = await doors.nth(0).boundingBox();
  const second = await doors.nth(1).boundingBox();
  expect(first && second && second.y > first.y + first.height - 2).toBeTruthy();
  const main = await page.locator("main").boundingBox();
  expect(main && main.x >= 0 && main.x + main.width <= 390).toBeTruthy();
});

test("无需执行 JavaScript 即可向搜索爬虫提供可索引正文", async ({ request, browser }) => {
  const bot = await request.get("/zh/", {
    headers: { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
  });
  expect(bot.ok()).toBeTruthy();
  const html = await bot.text();
  expect(html).toMatch(/<html\s+lang="zh"/);
  expect(html).toMatch(/<main\b[^>]*>[\s\S]*?<h1>Atelier<\/h1>/);
  expect(html).toMatch(/<a\b[^>]*href="\/zh\/blog\/"/);
  expect(html).toMatch(/<a\b[^>]*href="\/zh\/articrafts\/"/);
  expect(html).toMatch(/<link\b[^>]*rel="canonical"[^>]*href="https:\/\/atelier\.moesegfault\.dev\/zh\/"/);

  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/zh/blog/");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main a[href^='/zh/blog/']").first()).toBeVisible();
  } finally {
    await context.close();
  }
});
