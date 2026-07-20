"use client";

/**
 * <I18nProvider> + <T> + useT()
 *
 * Client-side runtime for the i18n system. Layout is a server component
 * (it can read cookies + Accept-Language), but the user-visible language
 * toggle is interactive — so the toggle + the reactive re-render of
 * `<T>` lives in this client island.
 *
 * Flow (v0.9.15.1):
 *   server: layout.tsx reads the `pilot-locale` cookie (set by
 *           writeStoredLocale on every user toggle) → falls back to
 *           Accept-Language → passes initialLocale to <I18nProvider>
 *   client: <I18nProvider> initial render matches SSR (no mismatch).
 *           setLocale() updates state + writes BOTH localStorage
 *           AND the cookie so the next SSR matches.
 *           Cross-tab sync: window 'storage' event.
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
import { format, translate, writeStoredLocale, type Locale } from "../lib/i18n";

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
  // The server reads the `pilot-locale` cookie set by
  // writeStoredLocale() (v0.9.15.1), so SSR and the client's
  // first render agree — no hydration mismatch, no broken
  // event handlers in React 18 StrictMode dev.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    // v0.9.15.1: cross-tab sync only. SSR now matches the
    // user's persisted locale (via cookie), so we no longer
    // need to re-read localStorage on mount — that path was
    // the hydration-mismatch source. Listen for the browser's
    // `storage` event so an EN/zh switch in one tab updates
    // other tabs. Functional updater avoids capturing `locale`
    // in the closure.
    const handleStorage = (e: StorageEvent) => {
      const next = e.newValue;
      if (e.key !== "pilot-locale" || !next) return;
      setLocaleState((prev) => {
        if (next === prev) return prev;
        if (typeof document !== "undefined") {
          document.documentElement.lang = next;
        }
        return next as Locale;
      });
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
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
