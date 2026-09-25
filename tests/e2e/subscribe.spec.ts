import { expect, test } from "@playwright/test";

/** @brief 订阅表单的双语、静态 HTML 和客户端增强合约 (subscription form contract) / Verify localized static markup and progressive enhancement. */
test("subscription form is rendered in static HTML and submits a typed JSON request", async ({ page }) => {
  await page.route("**/api/subscribe", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["content-type"]).toContain("application/json");
    expect(request.postDataJSON()).toEqual({ email: "klee@example.com", locale: "zh" });
    await route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.goto("/zh/");
  const form = page.locator("[data-subscribe-form]");
  await expect(form).toHaveAttribute("method", "post");
  await expect(form).toHaveAttribute("action", "/api/subscribe");
  await expect(form.locator('input[name="locale"]')).toHaveValue("zh");
  await form.locator('input[name="email"]').fill("klee@example.com");
  await form.locator('button[type="submit"]').click();
  await expect(form.locator("[data-subscribe-status]")).toContainText("请求已收到");
  await expect(form.locator('input[name="email"]')).toHaveValue("");
});

/** @brief API 失败不清除地址，也不泄漏服务器内部细节 (failure behavior) / Keep the address on failure without exposing server details. */
test("subscription failure remains retryable", async ({ page }) => {
  await page.route("**/api/subscribe", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"internal"}' });
  });

  await page.goto("/en/");
  const form = page.locator("[data-subscribe-form]");
  await expect(form.locator('input[name="locale"]')).toHaveValue("en");
  await form.locator('input[name="email"]').fill("klee@example.com");
  await form.locator('button[type="submit"]').click();
  await expect(form.locator("[data-subscribe-status]")).toContainText("try again later");
  await expect(form.locator('input[name="email"]')).toHaveValue("klee@example.com");
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
});

/** @brief 无脚本访问仍保留原生表单 (no-script fallback) / The form remains usable as native HTML without JavaScript. */
test("subscription form has a native no-JavaScript path", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/en/");
    const form = page.locator("[data-subscribe-form]");
    await expect(form).toHaveAttribute("method", "post");
    await expect(form).toHaveAttribute("action", "/api/subscribe");
    await expect(form.locator('input[name="email"]')).toHaveAttribute("required", "");
  } finally {
    await context.close();
  }
});
