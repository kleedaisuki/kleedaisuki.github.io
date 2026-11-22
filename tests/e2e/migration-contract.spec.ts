import { expect, test } from "@playwright/test";

/**
 * @brief moeSegFault Style v0.2.0 已发布主题色 / Palette published by moeSegFault Style v0.2.0.
 * @note 这是独立的用户可见合同，不从当前样式表读取期望值 / These are independent user-facing expectations, not values parsed from the current stylesheet.
 */
const palette = {
  light: { background: "rgb(255, 253, 249)", text: "rgb(75, 49, 42)", hero: "rgb(191, 32, 41)" },
  dark: { background: "rgb(22, 11, 12)", text: "rgb(243, 230, 216)", hero: "rgb(119, 19, 29)" },
} as const;

/**
 * @brief 读取访客实际看到的颜色 / Read the colors a visitor actually sees.
 * @param page Playwright 页面 / Playwright page.
 * @returns 页面、正文与首屏颜色 / Page, text, and hero colors.
 */
async function renderedPalette(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    hero: getComputedStyle(document.querySelector(".studio-hero") as Element).backgroundColor,
  }));
}

test("明暗主题色和桌面双栏门厅", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/zh/");
  await page.evaluate(() => document.fonts.ready);
  expect(await renderedPalette(page)).toEqual(palette.light);

  const doors = page.locator(".studio-doors .studio-door");
  await expect(doors).toHaveCount(2);
  const [titleBox, leadBox, blogBox, workBox] = await Promise.all([
    page.locator(".studio-hero h1").boundingBox(),
    page.locator(".studio-hero__lead").boundingBox(),
    doors.nth(0).boundingBox(),
    doors.nth(1).boundingBox(),
  ]);
  expect(titleBox && leadBox && titleBox.x + titleBox.width <= leadBox.x).toBeTruthy();
  expect(blogBox && workBox && blogBox.x + blogBox.width <= workBox.x + 1).toBeTruthy();
  expect(blogBox && workBox && Math.abs(blogBox.y - workBox.y) < 2).toBeTruthy();

  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => renderedPalette(page)).toEqual(palette.dark);
});

test("首屏火焰由真实作品点燃，并尊重减弱动态偏好", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh/");
  await expect(page.locator(".hearth__still")).toBeVisible();
  await expect(page.locator(".hearth__stage")).toHaveCount(0);
  for (const href of await page.locator(".spark").evaluateAll((sparks) => sparks.map((spark) => spark.getAttribute("href")))) {
    expect(href).toMatch(/^\/zh\/(blog|articrafts)\//);
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect(page.locator(".hearth__stage")).toHaveCount(1);
});

test("火星与对应列表行互相点亮，只有火星需要标题", async ({ page, isMobile }) => {
  test.skip(isMobile, "触屏没有悬停 / Touch screens have no hover");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh/");
  const row = page.locator(".studio-door .row-link").first();
  const piece = await row.getAttribute("data-piece");
  const spark = page.locator(`.spark[data-piece="${piece}"]`);
  const label = page.locator("[data-spark-label]");

  await row.hover();
  await expect(spark).toHaveAttribute("data-active", "");
  await expect(label).toBeHidden();

  await spark.dispatchEvent("pointerover");
  await page.locator(".studio-hero h1").hover();
  await expect(spark).not.toHaveAttribute("data-active", "");
  await spark.dispatchEvent("pointerover");
  await expect(row).toHaveAttribute("data-active", "");
  await expect(label).toBeVisible();
  await expect(label).toContainText((await row.locator("h3").textContent()) ?? "");
});

test("手机单栏和正文阅读宽度", async ({ page }) => {
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
