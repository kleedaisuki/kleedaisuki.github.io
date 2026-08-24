import { defineConfig, devices } from "@playwright/test";

/** @brief 本地预览服务器地址 (local preview server origin). */
const baseURL = "http://127.0.0.1:4321";

/** @brief 微信 Android 内置浏览器标识 (WeChat Android in-app browser user agent). */
const wechatAndroidUserAgent =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP4A.250105.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.56";

/** @brief 微信 iOS 内置浏览器标识 (WeChat iOS in-app browser user agent). */
const wechatIosUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22C152 MicroMessenger/8.0.56";

/**
 * @brief 浏览器兼容端到端测试配置 (cross-browser end-to-end test configuration).
 * @note 默认 CI 项目覆盖三种浏览器引擎、两种移动设备和两个 in-app 环境；Chrome/Edge 品牌项目由 test:e2e:branded 显式运行。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm preview --host 127.0.0.1 --port 4321",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 14"] } },
    {
      name: "wechat-android",
      use: {
        browserName: "chromium",
        userAgent: wechatAndroidUserAgent,
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "wechat-ios",
      use: {
        ...devices["iPhone 13"],
        userAgent: wechatIosUserAgent,
        viewport: { width: 375, height: 560 },
      },
    },
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
});
