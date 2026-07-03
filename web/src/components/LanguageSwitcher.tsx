"use client";

/**
 * <LanguageSwitcher> — small "EN | 中" pill button group in the header.
 *
 * Reads/writes localStorage["pilot-locale"] via the I18nProvider context.
 * Marked aria-current="true" on the active option so screen readers
 * announce the current language.
 */

import { useI18n } from "./I18n";
import { LOCALES, type Locale } from "../lib/i18n";

const LABELS: Record<Locale, string> = {
  en: "EN",
  zh: "中",
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex rounded border border-[var(--border)] text-xs overflow-hidden"
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            aria-current={active ? "true" : undefined}
            lang={code}
            className="px-2 py-1 transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--bg)" : "var(--text-muted)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
