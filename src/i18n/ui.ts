// src/i18n/ui.ts

export const languages = {
  en: "English",
  zh: "中文",
};

export const defaultLang = "zh";

export const ui = {
  en: {
    "404.title": "Oops, This Page Wandered Off",
    "404.command.nav": "$ open_this_page",
    "404.error":
      "Error: This path doesn't lead to the page you're looking for.",
    "404.message":
      "It may have moved somewhere else, or maybe it's hiding for a little while.",
    "404.suggestion": "Let's head back to the homepage:",
    "404.command.home": "$ cd /en/home",
    "404.link.home": "Back to Home",

    "home.page_title": "Atelier | Writing and Articrafts",
    "home.kicker": "An editorial workshop",
    "home.greeting": "Ideas in motion. Things made with care.",
    "home.intro":
      "Here, ideas take shape through writing, finished work lands in Articrafts, and recurring materials and practices connect the two.",
    "home.process_label": "How the atelier works",
    "home.making_label": "In the making",
    "home.making_text":
      "Questions, arguments, and field notes take shape at the writing desk.",
    "home.made_label": "Made here",
    "home.made_text":
      "Reports, code, and other finished pieces are released from the worktable.",
    "home.materials_label": "Materials in use",
    "home.materials_text":
      "Methods and recurring subjects travel between both sides of the atelier.",
    "home.explore_label": "Explore the atelier",
    "home.writing_desk": "The writing desk",
    "home.worktable": "The worktable",
    "home.blog_intro":
      "Essays, technical notes, and ideas worked through in public.",
    "home.articrafts_intro":
      "Made things you can inspect, read, download, and put to use.",
    "home.enter_blog": "Enter Blog",
    "home.enter_articrafts": "Enter Articrafts",
    "home.on_tables": "On the tables",
    "home.recent_title": "Recently from the atelier",
    "home.recent_intro":
      "Writing and Articrafts move on independent tracks. Here is a small selection from each.",
    "home.recent_writing": "Latest writing",
    "home.recent_articrafts": "Latest Articrafts",
    "home.view_all": "View all",
    "home.empty_writing": "The writing desk is clear for the next idea.",
    "home.empty_articrafts": "The worktable is ready for the next release.",
    "home.materials_title": "Practices and subjects on the bench",
    "home.materials_intro":
      "A compact index drawn from the tags on published writing and Articrafts—not a separate taxonomy.",

    "blog.title": "Blog Archive",
    "blog.description":
      "A collection of notes, ideas, and things I figured out after plenty of tinkering.",
  },
  zh: {
    "404.title": "哎呀，这页跑丢啦",
    "404.command.nav": "$ 打开这个地址",
    "404.error": "错误：这条路没有通到目标页面。",
    "404.message": "这个页面可能搬家了，也可能悄悄躲起来啦。",
    "404.suggestion": "先回首页看看吧：",
    "404.command.home": "$ cd /zh/home",
    "404.link.home": "回到首页",

    "home.page_title": "Atelier｜写作与 Articrafts",
    "home.kicker": "一间编辑工坊",
    "home.greeting": "让想法继续生长，也让作品认真落地。",
    "home.intro":
      "在这里，思考于写作中成形，完成的作品以 Articrafts 落地，反复使用的材料与方法则串起两者。",
    "home.process_label": "Atelier 的工作方式",
    "home.making_label": "正在成形",
    "home.making_text": "问题、论证与沿途笔记，在写作桌上逐渐获得形状。",
    "home.made_label": "在此制成",
    "home.made_text": "报告、代码与其他完成品，从工作台上正式发布。",
    "home.materials_label": "手边材料",
    "home.materials_text": "方法与反复出现的主题，在 Atelier 的两侧来回流动。",
    "home.explore_label": "探索 Atelier",
    "home.writing_desk": "写作桌",
    "home.worktable": "作品台",
    "home.blog_intro": "文章、技术笔记，以及在公开写作中逐步想清楚的事情。",
    "home.articrafts_intro": "可以检查、阅读、下载并真正拿来使用的制成品。",
    "home.enter_blog": "进入 Blog",
    "home.enter_articrafts": "进入 Articrafts",
    "home.on_tables": "台面近况",
    "home.recent_title": "Atelier 最近在做什么",
    "home.recent_intro":
      "写作与 Articrafts 各自前进；这里从两条轨道分别取来少量近作。",
    "home.recent_writing": "最近写作",
    "home.recent_articrafts": "最近 Articrafts",
    "home.view_all": "查看全部",
    "home.empty_writing": "写作桌已经清空，正等着下一个想法。",
    "home.empty_articrafts": "作品台已经备好，正等着下一次发布。",
    "home.materials_title": "工作台上的实践与主题",
    "home.materials_intro":
      "这些线索直接归纳自已经发布的写作与 Articrafts 标签，而不是另造一套分类。",

    "blog.title": "文章归档",
    "blog.description":
      "这里收着我写下来的笔记、想法，还有一些认真折腾后的记录。",
  },
} as const;
