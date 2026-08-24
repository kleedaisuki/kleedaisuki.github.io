// src/i18n/t.ts
import en from "./en";
import zh from "./zh";

export type Locale = "zh" | "en";

/**
 * @brief 规范化界面语言 (normalize interface locale) / Normalize an interface locale.
 * @param input Astro 或调用方提供的语言值 / Locale value supplied by Astro or a caller.
 * @return 支持的站点语言 / Supported site locale.
 */
export function asLocale(input?: string): Locale {
  const s = (input ?? "").toLowerCase();
  return s.startsWith("en") ? "en" : "zh";
}

const dict = { en, zh } as const;

/**
 * @brief 读取本地化界面文案 (read localized interface copy) / Read localized interface copy.
 * @param key 文案键 / Translation key.
 * @param locale 目标界面语言 / Target interface locale.
 * @return 对应语言的界面文案 / Interface copy in the requested locale.
 */
export function t(key: keyof typeof en, locale: Locale): string {
  return dict[locale][key] ?? dict.zh[key] ?? String(key);
}
