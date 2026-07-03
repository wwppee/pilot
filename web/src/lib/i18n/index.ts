import { LOCALES, type Locale } from "./types";
import enDict from "./dict.en";
import zhDict from "./dict.zh";

export { LOCALES };
export type { Locale };
export type { Dict } from "./types";

const DICTS = {
  en: enDict,
  zh: zhDict,
} as const;

/**
 * Format a template with named placeholders: "pilot server · v{version}".
 *
 * Missing keys are passed through as `{key}` so incomplete translations
 * are visible instead of silently rendering empty strings.
 */
export function format(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}

/**
 * Pure lookup with formatting. No React. Useful in tests and
 * in client components via the `useT()` hook.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = DICTS[locale];
  const raw = (dict as unknown as Record<string, string>)[key];
  if (raw === undefined) {
    // Fallback to English so a missing zh key still shows *something*.
    const fallback = (enDict as unknown as Record<string, string>)[key];
    if (fallback === undefined) {
      // Last resort: render the key itself so the bug is visible.
      return `[missing:${locale}:${key}]`;
    }
    return format(fallback, params);
  }
  return format(raw, params);
}

/**
 * Negotiate a locale from an Accept-Language header value.
 *
 * Picks the first locale from the header that we support.
 * Falls back to `en` if nothing matches (e.g. `ja-JP, ko-KR`).
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return "en";
  const candidates = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...rest] = part.trim().split(";");
      const qMatch = rest.join(";").match(/q=([\d.]+)/);
      const q = qMatch ? parseFloat(qMatch[1] ?? "1") : 1;
      return { tag: (tag ?? "").toLowerCase(), q };
    })
    .filter((c) => c.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    // exact match: "zh" or "en"
    if (LOCALES.includes(tag as Locale)) {
      return tag as Locale;
    }
    // language part of regional tag: "zh-cn" → "zh"
    const lang = tag.split("-")[0];
    if (lang && LOCALES.includes(lang as Locale)) {
      return lang as Locale;
    }
  }
  return "en";
}

/**
 * Read the user's persisted preference from localStorage.
 * Safe to call from server (returns null then).
 */
export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem("pilot-locale");
    if (v && LOCALES.includes(v as Locale)) return v as Locale;
  } catch {
    // localStorage may throw in private mode / disabled cookies.
  }
  return null;
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("pilot-locale", locale);
  } catch {
    // ignore
  }
}

/**
 * Server-side rendering helper for static strings (attributes,
 * `<title>`, etc.) that can't be children of the `<T>` component.
 *
 * Equivalent to `translate(locale, key, params)` but re-exported here
 * so server components don't need to import from the client island.
 */
export const renderT = translate;
