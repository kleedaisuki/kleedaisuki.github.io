// src/i18n/utils.ts

import { ui, defaultLang } from "./ui";

// 这是一个 TypeScript 的小技巧，可以让我们在后续使用 t('...') 的时候，
// 编辑器能自动提示所有可用的 key，非常智能！
export type UIKeys = keyof (typeof ui)[typeof defaultLang];

/**
 * @description 从 URL 中获取当前页面的语言。
 * @param url 当前页面的 URL 对象 (Astro.url)。
 * @returns 'zh' 或 'en'。如果 URL 中没有语言标识，则返回默认语言。
 */
export function getLangFromUrl(url: URL) {
    const [, lang] = url.pathname.split("/");
    if (lang in ui) return lang as keyof typeof ui;
    return defaultLang;
}

/**
 * @description 获取一个特定语言的翻译函数。
 * @param lang 'zh' 或 'en'。
 * @returns 一个函数 t(key)，调用它即可获得翻译后的字符串。
 */
export function useTranslations(lang: keyof typeof ui) {
    return function t(key: UIKeys) {
        // 尝试在当前语言中查找 key。
        // 如果找不到（比如某个翻译漏掉了），则自动回退到默认语言 (defaultLang) 的版本。
        // 这是一个非常稳健的“安全网”设计！
        return ui[lang][key] || ui[defaultLang][key];
    };
}