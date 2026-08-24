# 浏览器兼容性合同

## 支持范围

本站面向现代、持续更新的浏览器，不兼容 Internet Explorer、旧 EdgeHTML、旧版 Android WebView 或其他停止更新的实现。

| 层级 | 合同 |
| --- | --- |
| CSS 构建 | `package.json#browserslist` 固定为 Chrome/Edge 128、Firefox 134、Safari/iOS Safari 18.2 及以上；PostCSS + Autoprefixer 仅补充这些目标仍需要的前缀 |
| JavaScript 构建 | Vite 使用相同的四引擎最低版本合同，不注入旧浏览器 polyfill |
| 桌面自动化 | Playwright 捆绑的 Chromium、Firefox、WebKit |
| 移动自动化 | Pixel 7/Chromium 与 iPhone 14/WebKit 设备模拟 |
| in-app 自动化 | 微信 Android WebView 风格 UA（360×640）与微信 iOS WKWebView 风格 UA（375×560） |
| 品牌 smoke | 本机已安装的 Google Chrome 与 Microsoft Edge Stable；不作为默认 CI 门禁 |

Browserslist 是 CSS 工具共享的唯一目标源；Autoprefixer 不提供 JavaScript polyfill，也不启用 IE Grid 转换。Playwright 的移动和 in-app 项目模拟 viewport、触控、设备比例与 UA，但不会把 Chromium 变成某个厂商定制 WebView，也不会复现宿主 App 的导航栏、键盘、权限和生命周期。

最低版本由当前 `pdfjs-dist` 现代构建使用的 `Promise.try()` 决定；该 API 分别从 Chrome/Edge 128、Firefox 134、Safari/iOS Safari 18.2 可用。本站不切换到 PDF.js legacy build，因此升级 PDF.js 时必须复核其现代入口使用的 Web API，并同步提升此合同。

## 运行方式

```shell
pnpm test:e2e
pnpm test:e2e:branded
```

`test:e2e` 与 `test:e2e:branded` 都会先生成静态站点，再用 `astro preview` 验证部署形态。品牌测试需要机器上已有 Chrome 和 Edge；默认 CI 使用 Playwright 固定版本所配套的浏览器二进制，以减少宿主机更新造成的随机失败。

端到端测试（end-to-end test, E2E）捕获未处理的 `pageerror` 与 `console.error`，并覆盖：文档级水平溢出、主题切换、Web Storage 不可用时的渲染与根语言跳转、站内导航、PDF 加载与窄短 viewport 工具栏，以及已发布源码页。若内容库暂时没有源码 release，源码合同会明确 skip，并在首个源码链接发布后自动执行。

## 真机与 in-app smoke 矩阵

自动化不能替代真机。重要版式或 PDF.js 升级发布前，按下表做短流程 smoke test：打开首页，切换主题，进入 Blog/Atelier，打开 PDF，滚动与缩放，前后台切换一次，再通过返回按钮回到作品页。

| 平台 | 容器 | 建议覆盖 |
| --- | --- | --- |
| Android 当前稳定版 | Chrome、Edge | 小屏手机与常规手机各一台 |
| Android 当前稳定版 | 微信、支付宝、QQ | 宿主内打开链接；检查顶部/底部栏占高和返回行为 |
| iOS 当前稳定版 | Safari、Edge | 小屏 iPhone 与刘海/灵动岛机型各一台 |
| iOS 当前稳定版 | 微信、QQ、微博 | 检查 WKWebView viewport、PDF 手势、前后台恢复 |
| Android/iOS | 横屏 | 首页、长代码、PDF 工具栏各一次 |
| Android/iOS | 输入法弹出 | PDF 查找框与页面输入框，检查 visual viewport 缩短后的可操作性 |

记录 OS、宿主 App 版本、设备、方向、是否出现系统键盘以及失败 URL。真机发现的问题应先归约为可复现的 viewport/UA/交互序列，再加入 Playwright，避免长期依赖人工记忆。

## 维护规则

- 更新 Playwright 时同步运行 `pnpm exec playwright install`，并在三引擎和两个移动项目通过后合并。
- Browserslist 与 Vite 保持同一组固定的现代最低版本；提升基线时同步更新两处并跑完整矩阵，不为停止更新的实现增加条件分支。
- 新增页面时至少加入无水平溢出路径；新增依赖 Web API 时，在 localStorage 不可用等真实降级路径中保持页面可渲染和核心导航可用。
- Chrome/Edge 品牌 smoke 用于发现品牌二进制、媒体能力或企业环境差异；默认 CI 仍以固定 Playwright 浏览器保证可复现性。
