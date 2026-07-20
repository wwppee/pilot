"use client";

/**
 * <LanguageSwitcher> — small "EN | 中" pill button group in the header.
 *
 * Reads/writes localStorage["pilot-locale"] via the I18nProvider context.
 * Marked aria-current="true" on the active option so screen readers
 * announce the current language.
 *
 * v0.9.14: inactive button visibility. The previous version used
 * `background: transparent` + `color: var(--text-muted)` for the
 * non-selected locale, which was effectively invisible on the
 * dark theme (transparent on dark bg + dim muted text = the
 * inactive option disappeared). User reading the header only saw
 * the active button and assumed there was nothing to switch to.
 *
 * Fix: give the inactive button a subtle text-tinted background
 * and use `--text` (not `--text-muted`) for the foreground. The
 * accent / non-accent contrast still reads as "current vs other"
 * but the inactive option stays visible.
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
              // v0.9.14: subtle text-tinted bg + full --text
              // color for inactive. Previously `transparent` +
              // `--text-muted` made the non-active option
              // disappear on dark themes (user feedback).
              background: active
                ? "var(--accent)"
                : "color-mix(in srgb, var(--text) 8%, transparent)",
              color: active ? "var(--bg)" : "var(--text)",
              fontWeight: active ? 600 : 500,
            }}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
