// src/i18n/t.ts
import en from "./en";
import zh from "./zh";

export type Locale = "zh" | "en";
export const locales: Locale[] = ["zh", "en"];

export function asLocale(input?: string): Locale {
  const s = (input ?? "").toLowerCase();
  return s.startsWith("en") ? "en" : "zh";
}

const dict = { en, zh } as const;

export function t(key: keyof typeof en, locale: Locale): string {
  return (dict[locale] as any)?.[key] ?? (dict.zh as any)?.[key] ?? String(key);
}