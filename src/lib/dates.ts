import type { Locale } from "@i18n/t";

/** Content dates are calendar days stored at UTC midnight, so they are printed in UTC as well. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
