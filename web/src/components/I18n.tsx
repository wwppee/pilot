"use client";

/**
 * <I18nProvider> + <T> + useT()
 *
 * Client-side runtime for the i18n system. Layout is a server component
 * (it can read Accept-Language), but the user-visible language toggle
 * is interactive — so the toggle + the reactive re-render of `<T>` lives
 * in this client island.
 *
 * Flow:
 *   server: layout.tsx reads Accept-Language → passes initialLocale to
 *           <I18nProvider initialLocale="zh">
 *   client: <I18nProvider> reads localStorage["pilot-locale"] on mount
 *           (overriding the server-provided initial if user has chosen
 *           explicitly); exposes setLocale() via context.
 *   anywhere: <T k="..." params={...} /> renders the current locale,
 *             or useT() returns the t function for inline strings.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  format,
  readStoredLocale,
  translate,
  writeStoredLocale,
  type Locale,
} from "../lib/i18n";

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}

interface I18nProviderProps {
  initialLocale: Locale;
  children: ReactNode;
}

export function I18nProvider({ initialLocale, children }: I18nProviderProps) {
  // First render: use the server-provided locale (no flicker).
  // After mount: read localStorage and switch if the user has chosen.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored && stored !== locale) {
      setLocaleState(stored);
      // Sync the html lang attribute for assistive tech + browser font fallback.
      if (typeof document !== "undefined") {
        document.documentElement.lang = stored;
      }
    }
    // We only want to run this on mount; intentionally empty deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

interface TProps {
  k: string;
  params?: Record<string, string | number>;
}

/**
 * Drop-in replacement for inline strings.
 *
 * ```tsx
 * <h1><T k="home.h1" /></h1>
 * <p><T k="packages.subtitle" params={{ n: 5 }} /></p>
 * ```
 */
export function T({ k, params }: TProps) {
  const { t } = useI18n();
  // `params` is an object; if you forget to pass it the underlying
  // translator is a no-op, but force a stable signature for clarity.
  return <>{params ? t(k, params) : t(k)}</>;
}

/**
 * Static rendering helper for server components — looks up the dict
 * directly without subscribing to the client context. Useful for
 * server-rendered text that won't change after hydration.
 */
export function renderT(
  locale: Locale,
  k: string,
  params?: Record<string, string | number>,
) {
  return format(translate(locale, k, params), undefined);
}
