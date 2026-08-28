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
    "home.kicker": "A place for writing and making",
    "home.greeting": "Notes in progress. Work made with care.",
    "home.intro":
      "Thoughts take shape in the Blog; work ready to share, together with its notes and files, lives in Articrafts.",
    "home.process_label": "Inside the atelier",
    "home.making_label": "Writing",
    "home.making_text":
      "Questions, arguments, and field notes, worked through in public.",
    "home.made_label": "Making",
    "home.made_text":
      "Papers, code, reports, and experiments, gathered here as they are ready and open to later revision.",
    "home.materials_label": "Recurring threads",
    "home.materials_text":
      "Methods and subjects that return across different pieces.",
    "home.explore_label": "Browse the atelier",
    "home.writing_desk": "Writing",
    "home.worktable": "Work",
    "home.blog_intro":
      "Essays, technical notes, and ideas worked through in public.",
    "home.articrafts_intro":
      "Papers, code, reports, and experiments you can inspect or download, with notes and version history kept alongside them.",
    "home.enter_blog": "Read the Blog",
    "home.enter_articrafts": "Browse Articrafts",
    "home.on_tables": "Recently",
    "home.recent_title": "New writing and work",
    "home.recent_intro": "Recent additions from the Blog and Articrafts.",
    "home.recent_writing": "Recent writing",
    "home.recent_articrafts": "Recent work",
    "home.view_all": "View all",
    "home.empty_writing": "Nothing new here just yet.",
    "home.empty_articrafts": "The next piece will appear when it is ready.",
    "home.materials_title": "Recurring threads",
    "home.materials_intro":
      "A few subjects and methods that recur across the site.",

    "blog.title": "Writing Archive",
    "blog.description":
      "Essays, technical notes, and ideas worked through in public, kept in the order they were written.",
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
    "home.kicker": "写作，也做些东西",
    "home.greeting": "写下还在生长的想法，也收好认真做出的作品。",
    "home.intro":
      "想法在 Blog 里慢慢成形；整理好的作品，连同说明与文件，收在 Articrafts。",
    "home.process_label": "Atelier 里有什么",
    "home.making_label": "写下来",
    "home.making_text": "问题、论证和沿途笔记，先在这里慢慢写下来。",
    "home.made_label": "做出来",
    "home.made_text":
      "论文、代码、报告与实验，整理好后收进 Articrafts，也可以继续修订。",
    "home.materials_label": "反复回到的线索",
    "home.materials_text": "一些方法与主题，会在不同文章和作品之间再次出现。",
    "home.explore_label": "从这里开始",
    "home.writing_desk": "写作",
    "home.worktable": "作品",
    "home.blog_intro": "文章、技术笔记，以及一些逐渐想清楚的事。",
    "home.articrafts_intro":
      "论文、代码、报告与实验：可以查阅、下载，也保留说明与版本记录。",
    "home.enter_blog": "读 Blog",
    "home.enter_articrafts": "看 Articrafts",
    "home.on_tables": "近来",
    "home.recent_title": "最近的写作与作品",
    "home.recent_intro": "Blog 与 Articrafts 的最近更新。",
    "home.recent_writing": "最近写作",
    "home.recent_articrafts": "最近作品",
    "home.view_all": "查看全部",
    "home.empty_writing": "这里暂时还没有新文章。",
    "home.empty_articrafts": "下一件作品整理好后，就会出现在这里。",
    "home.materials_title": "反复出现的线索",
    "home.materials_intro": "这些主题与方法，常在不同文章和作品里再次出现。",

    "blog.title": "文章归档",
    "blog.description":
      "这里按时间收着文章、技术笔记，以及那些在公开写作里慢慢想清楚的事情。",
  },
} as const;
