// src/i18n/ui.ts

export const languages = {
    en: "English",
    zh: "中文",
};

export const defaultLang = "zh";

export const ui = {
    en: {
        // --- 404 Page: World-Line Anomaly Scenario ---
        "404.title": "World-Line Not Found",
        "404.command.nav": "$ request_path",
        "404.error": "Error: This coordinate points to a collapsed world-line.",
        "404.message":
            "System Message: Page has collapsed due to entropy overload, or has been shifted to another phase by an unknown observer.",
        "404.suggestion": "Execute emergency return protocol to a safe coordinate:",
        "404.command.home": "$ warp_return --to /base/en",
        "404.link.home": "Return to Command Base",

        // --- Homepage: Welcome to the Sea of Consciousness ---
        "home.greeting": "Connection Established, Observer.",
        "home.intro":
            "Code is my magic circle; math is the monolith to truth. These are the observation records of a nocturnal creature wandering the Sea of CS, resonating with the universal Turing machine.",
        "home.recent_posts": "Recent Observation Logs",

        // --- About Page: Operator Profile ---
        "about.title": "Operator Profile",
        "about.matrix_title": "Personality Matrix",
        "about.datalink_title": "Live Tactical Datalink (GitHub)",
        "about.stats_followers": "Adherents (Followers)",
        "about.stats_repos": "Spell Repositories (Repos)",
        "about.repos_title": "Recent Spell Deployments",

        "blog.title": "Observation Log Archive",
        "blog.description": "A collection of decoded runes, tactical analyses, and resonance records with the universal Turing machine.",
    },
    zh: {
        // --- 404页面：世界线异常事态 ---
        "404.title": "当前世界线不存在",
        "404.command.nav": "$ 请求路径",
        "404.error": "错误：该坐标指向一条已坍缩的世界线",
        "404.message":
            "系统消息：当前页面因熵值过载而坍缩，或被未知的观测者移动到了其他相位。",
        "404.suggestion": "执行紧急回溯指令，返回安全坐标点：",
        "404.command.home": "$ warp_return --to /base/zh",
        "404.link.home": "返回作战本阵",

        // --- 首页：欢迎来到精神海域 ---
        "home.greeting": "观测者，欢迎连接至我的精神海域。",
        "home.intro":
            "代码是我的魔法阵，数学是通往真理的石碑。这里是一个徘徊在CS之海的夜行性生物，与宇宙图灵机共振的观测记录。",
        "home.recent_posts": "近期观测日志",

        "about.title": "适格者档案",
        "about.matrix_title": "人格矩阵",
        "about.datalink_title": "实时战术数据链 (GitHub)",
        "about.stats_followers": "信徒 (Followers)",
        "about.stats_repos": "咒式仓库 (Repos)",
        "about.repos_title": "近期咒式部署", "blog.title": "观测日志归档",
        "blog.description": "这里收藏着所有已解析的符文、战术分析以及和宇宙图灵机共振的记录。",
    },
} as const;