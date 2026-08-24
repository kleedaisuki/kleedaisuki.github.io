import { expect, type Page, test } from "@playwright/test";

/** @brief 已知可公开访问的 PDF 阅读器路径 (known public PDF-reader path). */
const pdfReaderPath =
  "/zh/atelier/jacobi-svd-locality-kernel-policy/1.0.0/read/paper/";

/** @brief E2E 使用的稳定 GitHub 用户响应 (stable GitHub user response used by E2E). */
const githubProfileFixture = {
  login: "kleedaisuki",
  name: "kleedaisuki",
  avatar_url: "/favicon.svg",
  html_url: "https://github.com/kleedaisuki",
  followers: 42,
  following: 7,
  public_repos: 5,
};

/** @brief E2E 使用的稳定 GitHub 仓库响应 (stable GitHub repository response used by E2E). */
const githubRepositoriesFixture = [
  {
    name: "runtime-compatibility-fixture",
    html_url: "https://github.com/kleedaisuki/runtime-compatibility-fixture",
    description: "Deterministic browser-test data.",
    language: "TypeScript",
    stargazers_count: 8,
  },
];

/**
 * @brief 隔离 GitHub 公共 API，避免浏览器矩阵共享匿名配额 (isolate the GitHub public API from shared anonymous-rate limits).
 * @param page 当前 Playwright 页面 (current Playwright page).
 * @return 无返回值 (no return value).
 */
async function mockGitHubApi(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.github\.com\/users\/kleedaisuki(?:\/repos(?:\?.*)?)?$/, async (route) => {
    /** @brief 当前 GitHub API 请求 URL (current GitHub API request URL). */
    const url = new URL(route.request().url());
    /** @brief 与请求端点对应的固定响应体 (fixture body matching the requested endpoint). */
    const body = url.pathname.endsWith("/repos")
      ? githubRepositoriesFixture
      : githubProfileFixture;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/**
 * @brief 等待页面排版稳定并检查根文档无水平溢出 (wait for stable layout and assert no document-level horizontal overflow).
 * @param page 当前 Playwright 页面 (current Playwright page).
 * @return 无返回值 (no return value).
 */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts?.ready);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
      }),
    )
    .toBeLessThanOrEqual(1);
}

/**
 * @brief 禁用 Web Storage 以模拟受限 in-app 环境 (disable Web Storage to emulate a restricted in-app environment).
 * @param page 当前 Playwright 页面 (current Playwright page).
 * @return 无返回值 (no return value).
 */
async function disableWebStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem", "clear"] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => {
          throw new DOMException("Storage unavailable", "SecurityError");
        },
      });
    }
  });
}

/**
 * @brief 从已发布作品中寻找首个源码深链 (find the first advertised source deep link).
 * @param page 当前 Playwright 页面 (current Playwright page).
 * @return 源码 URL；没有发布源码时返回 null (source URL, or null when no source release is published).
 */
async function findPublishedSourceUrl(page: Page): Promise<string | null> {
  await page.goto("/zh/atelier/");
  const detailUrls = await page
    .locator('a[href^="/zh/atelier/"]')
    .evaluateAll((links) => [...new Set(links.map((link) => (link as HTMLAnchorElement).href))]);
  expect(detailUrls.length, "Atelier 应至少发布一个作品详情链接").toBeGreaterThan(0);

    for (const detailUrl of detailUrls) {
    /** @brief 作品详情静态响应 (static work-detail response). */
    const response = await page.request.get(detailUrl);
    expect(response.ok(), `作品详情应可访问：${detailUrl}`).toBeTruthy();
    /** @brief 详情页中首个源码链接匹配 (first source-link match in the detail page). */
    const sourceMatch = (await response.text()).match(/href="([^"]*\/source\/[^"]*)"/);
    if (sourceMatch?.[1]) return new URL(sourceMatch[1], detailUrl).toString();
  }

  return null;
}

/** @brief 按页面隔离的运行时错误集合 (runtime errors isolated by Playwright page). */
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  /** @brief 当前页面捕获的运行时错误 (runtime errors captured for the current page). */
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  await mockGitHubApi(page);
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
});

test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page) ?? [], "页面不应产生 pageerror 或 console.error").toEqual([]);
  runtimeErrors.delete(page);
});

test("核心页面在当前 viewport 下没有水平溢出", async ({ page }) => {
  for (const path of ["/zh/", "/en/about/", "/zh/blog/", "/zh/atelier/"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("主题切换同步 DOM 状态且可重复操作", async ({ page }) => {
  await page.goto("/zh/");
  const root = page.locator("html");
  const toggle = page.locator("[data-theme-toggle]");
  const initialTheme = await root.getAttribute("data-theme");

  await toggle.click();
  await expect(root).not.toHaveAttribute("data-theme", initialTheme ?? "");
  await toggle.click();
  await expect(root).toHaveAttribute("data-theme", initialTheme ?? "light");
});

test("localStorage 不可用时仍能渲染、切换主题并完成根语言跳转", async ({ page }) => {
  await disableWebStorage(page);
  await page.goto("/zh/");
  await expect(page.locator("main")).toBeVisible();
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /^(light|dark)$/);

  await page.goto("/?lang=en");
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("主导航保持语言分区并到达目标页", async ({ page }) => {
  await page.goto("/en/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/en\/about\/$/);
  await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/en/about/",
  );
});

test("PDF 阅读器在窄且短的 viewport 中加载并保留工具栏", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await page.goto(pdfReaderPath);
  const reader = page.locator("[data-pdf-reader]");
  await expect(reader).toHaveClass(/pdf-reader--ready/, { timeout: 45_000 });
  await expect(page.getByRole("toolbar")).toBeVisible();
  await expect(page.locator("[data-page-count]")).not.toHaveText("—");
  await expect(page.locator("[data-viewer-container]")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("已发布源码页可导航、显示目录和源码且不溢出", async ({ page }) => {
  const sourceUrl = await findPublishedSourceUrl(page);
  test.skip(sourceUrl === null, "当前内容集没有发布源码；发布首个 source release 后自动启用本合同。");

  await page.goto(sourceUrl ?? "/zh/atelier/");
  await expect(page.locator("[data-source-viewer]")).toBeVisible();
  await expect(page.locator(".source-tree-shell")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
