// src/i18n/ui.ts

export const languages = {
  en: "English",
  zh: "中文",
};

export const defaultLang = "zh";

export const ui = {
  en: {
    "404.title": "Oops, This Page Wandered Off",
    "404.link.home": "Back to Home",

    "home.page_title": "Atelier | Writing and Articrafts",
    "home.greeting": "Notes in progress. Work made with care.",
    "home.intro":
      "Thoughts take shape in the Blog; work ready to share, together with its notes and files, lives in Articrafts.",
    "home.empty_writing": "Nothing new here just yet.",
    "home.empty_articrafts": "The next piece will appear when it is ready.",
    "home.materials_title": "Recurring threads",

    "blog.title": "Writing Archive",
    "blog.description":
      "Essays, technical notes, and ideas worked through in public, kept in the order they were written.",
  },
  zh: {
    "404.title": "哎呀，这页跑丢啦",
    "404.link.home": "回到首页",

    "home.page_title": "Atelier｜写作与 Articrafts",
    "home.greeting": "写下还在生长的想法，也收好认真做出的作品。",
    "home.intro":
      "想法在 Blog 里慢慢成形；整理好的作品，连同说明与文件，收在 Articrafts。",
    "home.empty_writing": "这里暂时还没有新文章。",
    "home.empty_articrafts": "下一件作品整理好后，就会出现在这里。",
    "home.materials_title": "反复出现的线索",

    "blog.title": "文章归档",
    "blog.description":
      "这里按时间收着文章、技术笔记，以及那些在公开写作里慢慢想清楚的事情。",
  },
} as const;
