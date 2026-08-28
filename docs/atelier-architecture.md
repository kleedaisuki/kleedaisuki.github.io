# Atelier：产品语义与内容架构

> 状态基线：2026-08-28。本文区分“当前实现”与“未来方向”；后者不是已交付能力，也不构成数据迁移承诺。

## 1. 产品定义

`atelier.moesegfault.dev` 是整个站点的名称与规范来源（canonical origin），不是把传统博客换一个域名。Atelier 表示一间持续工作的数字工坊：写作、制作过程和可交付制品可以并存，但具有不同的发布语义。

| 名称 | 产品语义 | 当前入口 |
| --- | --- | --- |
| **Atelier** | 全站及其首页；负责呈现近期活动，并把不同形态的工作组织成一个整体 | `/{locale}/` |
| **Blog** | 有明确作者、发布日期和阅读顺序的长篇写作；时间线在这里有意义 | `/{locale}/blog/` |
| **Articrafts** | 论文、代码、报告、数据和实验输出等可复现、可下载、带版本的制品 | `/{locale}/articrafts/` |
| **About** | 作者身份与个人资料，不属于本仓库的内容所有权 | [me.moesegfault.dev](https://me.moesegfault.dev) |

这种划分借鉴数字花园（digital garden）的“拓扑优先于时间线、持续生长、内容形态混合与独立所有”原则，但不把 Blog 强行改造成无日期笔记，也不把所有页面包装成同一种“文章”。参见 Maggie Appleton 的一手论述：[A Brief History & Ethos of the Digital Garden](https://maggieappleton.com/garden-history)。

### Made / Making / Materials

这三个词是跨栏目组织信息的观察维度，而不是三个必须新增的路由或数据库表：

- **Made（已制成）**：读者首先看到可命名、可引用的结果。Articrafts 的稳定作品页始终指向最新发布结果，历史结果由版本 URL 保留。
- **Making（制作中）**：说明问题、方法、取舍和演化。它可以表现为 Blog 写作、作品的制作说明、修订日期和发布注记；不得伪装成已经验证的制品。
- **Materials（材料）**：支撑结果的论文、源码、数据、归档和其他下载项。材料属于某个作品的某个版本，以清单表达，而不是作为散落的附件。

页面可以同时呈现三者。例如，一项研究工作的结果属于 Made，方法札记属于 Making，PDF、源码与数据属于 Materials。这样能保留关系而不抹平各自的生命周期。

## 2. 当前公开信息架构

`{locale}` 当前为 `zh` 或 `en`。下表中的“公开”表示可直接访问；并非每条工具型或历史型 URL 都应进入搜索索引。

| 路由 | 当前职责 |
| --- | --- |
| `/` | 根据显式或浏览器语言偏好进入本地化首页；无 JavaScript 时提供语言链接 |
| `/{locale}/` | Atelier 首页 |
| `/{locale}/blog/` | 本语言 Blog 归档 |
| `/{locale}/blog/{slug}/` | Blog 正文；成对翻译仍是两个各自拥有正文的条目 |
| `/articrafts/` | Articrafts 的语言选择入口 |
| `/{locale}/articrafts/` | 双语共享制品的本地化目录 |
| `/{locale}/articrafts/{slug}/` | 作品稳定页，展示最新发布版本 |
| `/{locale}/articrafts/{slug}/{version}/` | 指定历史版本的详情页 |
| `…/{version}/read/{asset}/` | PDF 阅读器；原始文件仍是基础访问方式 |
| `…/{version}/source/{path}/` | 构建期生成的源码浏览页 |
| `…/{version}/raw/{path}`、`…/{version}/source.zip` | 单文件与完整源码下载端点 |
| `/atelier-assets/{slug}/{version}/{path}` | 版本化发布文件 |
| `/rss.xml`、`/{locale}/rss.xml`、`/sitemap-*.xml`、`/llms.txt` | 发现与机器读取入口 |

About 只是一条指向 `https://me.moesegfault.dev` 的普通外链；本项目不创建 `/about/` 镜像。旧域名 `blog.moesegfault.dev` 及其旧路由不在本次架构的兼容范围内。

## 3. 内容所有权与不变量

[Astro 内容集合（Content Collections）](https://docs.astro.build/en/guides/content-collections/)用于在构建期验证内容形状；集合模式是内容契约，不是页面组件的临时参数。

| 所有者 | 规范来源 | 不变量 |
| --- | --- | --- |
| Blog 条目 | `src/content/blog/{locale}/` | 每个语言条目拥有自己的标题、摘要与正文；`slug` 决定公开路径，`pair` 只表达翻译对应关系 |
| Articrafts 实体与发布清单 | `src/content/atelier/` | 一个实体由中英文界面共享；可见文本显式本地化；`releases[]` 是版本与材料的权威清单 |
| 发布二进制材料 | `public/atelier-assets/{slug}/{version}/` | 路径同时携带作品与版本身份；已发布版本不就地替换，变化产生新版本 |
| 可浏览源码 | `src/atelier/{slug}/{version}/source/` | 构建期生成浏览页、原始文件端点和确定性 ZIP；它从属于相同发布版本 |
| UI 文案与呈现 | `src/i18n/`、`src/components/`、`src/pages/` | 只拥有界面和组合逻辑，不复制内容事实 |
| 作者资料 | `me.moesegfault.dev` | 外部站点拥有；本仓库只保存链接 |

结构化数据（structured data）应映射上述事实，而不是反过来驱动领域模型。当前 Blog 使用文章语义，Articrafts 以 [`CreativeWork`](https://schema.org/CreativeWork) 为共同上界，并可按真实制品类型逐步细化；不得声明清单中不存在的作者、版本、许可或关系。

## 4. 交付原则：静态 HTML 优先

当前站点由 Astro 构建为静态 HTML。其边界遵循 Astro 的[岛屿架构（islands architecture）](https://docs.astro.build/en/concepts/islands/)：正文、目录、导航、版本记录与下载链接首先是完整 HTML，客户端 JavaScript 只增强需要交互的局部功能。

渐进增强（progressive enhancement）的验收规则如下：

1. 禁用 JavaScript 后，Blog 与 Articrafts 的主要内容、跨页导航和原始材料下载仍可用。
2. 主题、筛选、复制、源码高亮和 PDF 阅读器不得成为访问原始内容的唯一入口；PDF.js 阅读器是增强层。
3. 新交互优先使用原生 HTML/CSS；确需脚本时按功能边界加载，不引入全站单页应用（single-page application）运行时。
4. 若未来采用 Astro [视图过渡（view transitions）](https://docs.astro.build/en/guides/view-transitions/)，它只能改善导航连续性，不能改变 URL、焦点语义或无脚本行为。

## 5. 可访问性与性能目标

这些是持续验收目标，不表示本文已经完成独立合规认证或现场性能测量。

### 可访问性

- 以 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) **AA** 为最低目标，覆盖键盘操作、可见焦点、文本对比度、触控目标和状态反馈；新增准则概览见 WAI 的 [What’s New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)。
- 使用语义化的 `header`、`nav`、`main`、`aside`、`footer`、标题层级和列表，使页面结构可由浏览器与辅助技术共同理解；实践依据见 WAI [Page Structure Tutorial](https://www.w3.org/WAI/tutorials/page-structure/)。
- 双语页面必须设置准确的文档语言与替代语言链接；动画尊重 `prefers-reduced-motion`，信息不只通过颜色、动效或视觉位置传达。
- 自动化检查只负责回归；键盘、屏幕阅读器、缩放与移动端阅读仍需人工抽查。

### 性能

- 首屏语义内容由静态 HTML 提供，不等待客户端水合（hydration）或数据请求。
- Blog、首页与 Articrafts 目录不因装饰性功能引入 UI 框架运行时；脚本成本按交互模块单独归属和复核。
- 图片与字体避免阻塞正文；非首屏资源延后加载，并为媒体保留尺寸以抑制布局偏移。
- 发布前以真实构建产物记录页面体积和核心网页指标（Core Web Vitals）基线；后续改变必须与该基线比较，而不是仅依赖开发服务器体感。

## 6. 后续扩展边界

### 可在现有模型内扩展

- 新增作品类型、材料 MIME 类型或阅读器时，先扩充 Articrafts 的材料能力映射；不要为每种文件复制一套作品模型。
- 只有当内容具有不同的所有权、生命周期或公开路径时才新增集合。仅为首页增加一个分区，不足以成为新集合的理由。
- Blog 与 Articrafts 可通过显式、稳定的标识建立关联；标签仍是描述元数据，不自动升级为本体或路由层级。
- 若确有动态能力，保留静态规范页，把动态部分隔离为可替换增强层。

### 未来研究方向（未实现）

当前模型仍以文档和显式关联为主。两类研究提示了可能的演化方向，但尚不足以直接采用：

1. Chan 等人的 [Steps Towards an Infrastructure for Scholarly Synthesis](https://arxiv.org/abs/2407.20666) 研究论点—证据—修辞关系组成的论述图（discourse graph），并报告了基于超文本笔记用户的研究性部署。未来可评估将 Blog 论证、实验结果与 Articrafts 材料连接为细粒度关系；前提是作者维护成本和读者收益得到验证。
2. Bernard 等人的 [PKG API: A Tool for Personal Knowledge Graph Management](https://arxiv.org/abs/2402.07540) 提出基于 RDF 的个人知识图谱（personal knowledge graph）客户端与服务接口。未来可用它审视机器可读导出、来源追踪和跨工具互操作，但这不意味着当前应引入图数据库、RDF 写作流程或自动生成关系。

任何图谱化、个性化或客户端应用化方案，都必须先证明它改善 Atelier 的发现、理解或复现任务；否则保持显式链接、类型化内容集合与静态页面这一较小系统。
