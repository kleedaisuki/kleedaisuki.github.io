import { expect, type Page, test } from "@playwright/test";

/** @brief 已知可公开访问的 PDF 阅读器路径 (known public PDF-reader path). */
const pdfReaderPath =
  "/zh/articrafts/jacobi-svd-locality-kernel-policy/1.0.0/read/paper/";
/** @brief 已知包含本地制品校验和的详情页 (known detail page containing local artifact checksums). */
const atelierDetailPath = "/zh/articrafts/cinder-cuda-tensor-library/1.0.0/";

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
  await page.goto("/zh/articrafts/");
  const detailUrls = await page
    .locator('a[href^="/zh/articrafts/"]')
    .evaluateAll((links) => [...new Set(links.map((link) => (link as HTMLAnchorElement).href))]);
  expect(detailUrls.length, "Articrafts 应至少发布一个作品详情链接").toBeGreaterThan(0);

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
  for (const path of ["/zh/", "/en/", "/zh/blog/", "/zh/articrafts/"]) {
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

test("主导航保持栏目顺序并将 About 暴露为作者外链", async ({ page }) => {
  await page.goto("/en/");
  const links = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link");
  await expect(links).toHaveText(["Atelier", "Blog", "Articrafts", "About ↗"]);
  await expect(links.last()).toHaveAttribute("href", "https://me.moesegfault.dev");
  await expect(links.last()).toHaveAttribute("rel", "me external");
});

test("制品校验和在手机端局部横滑且不撑宽页面", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(atelierDetailPath);
  const checksum = page.locator(".file-item__checksum code").first();
  await expect(checksum).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const widths = await checksum.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(widths.scroll).toBeGreaterThan(widths.client);
  await checksum.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => checksum.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("PDF 阅读器在移动端保留全部核心控件并响应旋转", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await page.goto(pdfReaderPath);
  const reader = page.locator("[data-pdf-reader]");
  await expect(reader).toHaveClass(/pdf-reader--ready/, { timeout: 45_000 });
  const toolbar = page.getByRole("toolbar");
  const stage = page.locator("[data-viewer-container]");
  const pdfPage = page.locator(".pdfViewer .page").first();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[data-action="zoom-out"]')).toBeVisible();
  await expect(toolbar.locator('[data-action="zoom-in"]')).toBeVisible();
  await expect(page.locator("[data-page-count]")).not.toHaveText("—");
  await expect(stage).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const portraitPageWidth = await pdfPage.evaluate((element) => element.clientWidth);
  const portraitStageHeight = await stage.evaluate((element) => element.clientHeight);
  expect(portraitStageHeight).toBeGreaterThan(300);
  /** @brief PDF 页面是否完整处于阅读舞台内 (whether the PDF page is fully inside the reader stage). */
  const pageFitsStage = () =>
    page.evaluate(() => {
      const stageElement = document.querySelector<HTMLElement>("[data-viewer-container]");
      const pageElement = document.querySelector<HTMLElement>(".pdfViewer .page");
      if (!stageElement || !pageElement) return false;
      const stageBounds = stageElement.getBoundingClientRect();
      const pageBounds = pageElement.getBoundingClientRect();
      return (
        pageBounds.left >= stageBounds.left - 2 &&
        pageBounds.right <= stageBounds.right + 2 &&
        pageBounds.width <= stageBounds.width + 2
      );
    });
  await expect.poll(pageFitsStage).toBe(true);

  const originalLink = toolbar.locator('a[target="_blank"]');
  await originalLink.evaluate((element) =>
    element.scrollIntoView({ block: "nearest", inline: "end" }),
  );
  await expect
    .poll(() =>
      originalLink.evaluate((element) => {
        const item = element.getBoundingClientRect();
        const controls = element.parentElement?.getBoundingClientRect();
        return Boolean(controls && item.left >= controls.left - 1 && item.right <= controls.right + 1);
      }),
    )
    .toBe(true);

  await page.setViewportSize({ width: 640, height: 360 });
  await expect
    .poll(() => pdfPage.evaluate((element) => element.clientWidth))
    .toBeGreaterThan(portraitPageWidth + 100);
  await expect.poll(pageFitsStage).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test("已发布源码页可导航、显示目录和源码且不溢出", async ({ page }) => {
  const sourceUrl = await findPublishedSourceUrl(page);
  test.skip(sourceUrl === null, "当前内容集没有发布源码；发布首个 source release 后自动启用本合同。");

  await page.goto(sourceUrl ?? "/zh/articrafts/");
  await expect(page.locator("[data-source-viewer]")).toBeVisible();
  await expect(page.locator(".source-tree-shell")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
