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

    "home.greeting": "Hello hello, welcome!",
    "home.intro":
      "This is where I keep notes from coding, math, and all the little things I learn along the way. If you're curious too, come explore with me.",
    "home.recent_posts": "Fresh Notes",

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

    "home.greeting": "欢迎来这里玩呀！",
    "home.intro":
      "这里放着我写代码、学数学，还有一路上记下来的小发现。要是你也喜欢折腾计算机、读点有意思的东西，那就一起逛逛吧。",
    "home.recent_posts": "最近写的东西",

    "blog.title": "文章归档",
    "blog.description":
      "这里收着我写下来的笔记、想法，还有一些认真折腾后的记录。",
  },
} as const;
