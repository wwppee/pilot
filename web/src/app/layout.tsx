import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers, cookies } from "next/headers";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { api } from "@/lib/pilot";
import { negotiateLocale, LOCALES, type Locale, translate } from "@/lib/i18n";
import { I18nProvider, T } from "@/components/I18n";
import { NavLinks } from "@/components/NavLinks";
import { renderT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ActiveProfileBadge } from "@/components/ActiveProfileBadge";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// v0.5.10+: <meta> tags are now locale-aware via generateMetadata.
// Previously hardcoded English in metadata — bad for non-en SEO and
// browser tabs in zh users. generateMetadata runs per-request so we
// can pull the negotiated locale.
export async function generateMetadata(): Promise<Metadata> {
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);
  return {
    title: translate(locale, "meta.title"),
    description: translate(locale, "meta.description"),
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0d10",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  let serverOk = false;
  let version = "?";
  try {
    const h = await api.health();
    serverOk = true;
    version = h.version;
  } catch {
    // Pilot server not running — fall back to a "disconnected" state in UI.
    serverOk = false;
  }

  // Read the current pathname from request headers (set by Next.js)
  // to mark the active nav link with `aria-current="page"`.
  let currentPath = "";
  try {
    const h = await headers();
    // x-invoke-path or x-pathname may not exist; fall back to URL.
    currentPath =
      h.get("x-invoke-path") ?? h.get("x-pathname") ?? h.get("next-url") ?? "";
    // next-url is e.g. "/foo?bar"; trim query
    currentPath = currentPath.split("?")[0] ?? "";
  } catch {
    /* headers() not available in static generation */
  }

  // Negotiate locale:
  //   1. `pilot-locale` cookie (v0.9.15.1) — set by writeStoredLocale
  //      on every user toggle. Reading the cookie here means SSR
  //      and the client's first render agree, so there's no
  //      hydration mismatch (which in React 18 StrictMode dev
  //      can break event handler binding — see I18n.tsx).
  //   2. Accept-Language header — first visit, no preference yet.
  //   3. "en" — default.
  let cookieLocale: string | undefined;
  try {
    const c = await cookies();
    cookieLocale = c.get("pilot-locale")?.value;
  } catch {
    /* cookies() not available in static generation */
  }
  let acceptLanguage: string | null = null;
  try {
    const h = await headers();
    acceptLanguage = h.get("accept-language");
  } catch {
    /* headers() not available in static generation */
  }
  const fromCookie = cookieLocale as Locale | undefined;
  const locale: Locale =
    fromCookie && LOCALES.includes(fromCookie)
      ? fromCookie
      : negotiateLocale(acceptLanguage);

  // Pre-render static strings server-side so we don't depend on the
  // client provider for SSR output (avoids layout shift).
  const brandAria = renderT(locale, "brand.ariaHome");
  const serverUpText = renderT(locale, "server.up", { version });
  const serverDownText = renderT(locale, "server.down");
  const footerCopy = renderT(locale, "footer.copy", { version });
  const footerEndpoint = renderT(locale, "footer.endpoint");

  return (
    <html
      lang={locale}
      // v0.9.15.1: suppressHydrationWarning on the html
      // element. The `lang` attribute is set from the
      // server-rendered locale but the client may update
      // `document.documentElement.lang` directly in
      // I18nProvider's setLocale, and Next.js's font CSS
      // variables can differ between SSR + CSR at the
      // very first paint. Telling React not to warn about
      // these two attribute deltas is the canonical way
      // to keep a server-rendered `lang` + client-side
      // locale toggle in sync.
      suppressHydrationWarning
      className={`${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <I18nProvider initialLocale={locale}>
          {/* Skip link + nav aria-label live INSIDE the I18nProvider so
              they re-render when the user toggles language. Previously
              they were pre-rendered server-side and never updated on
              client-side locale change. */}
          {/* Skip link: invisible until focused. Lets keyboard users jump
              straight to main content instead of tabbing through nav. */}
          <a href="#main-content" className="skip-link">
            <T k="skip.toMain" />
          </a>

          <div className="min-h-screen flex flex-col">
            <header
              className="border-b border-[var(--border)] bg-[var(--surface)]"
              role="banner"
            >
              <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6">
                <Link
                  // v1.0.1: brand link now points to /insight.
                  // The root `/` 308-redirects to /insight via
                  // next.config.ts (see "redirects()" there), but
                  // clicking the brand and landing on a redirect
                  // is a small UX papercut — a real <Link href>
                  // skips the redirect hop and keeps history clean.
                  href="/insight"
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: "var(--text)" }}
                  aria-label={brandAria}
                >
                  🛰 <T k="brand.name" />
                </Link>
                <NavLinks currentPath={currentPath} locale={locale} />
                <div className="ml-auto flex items-center gap-3">
                  <ActiveProfileBadge />
                  <LanguageSwitcher />
                  <div
                    className="text-xs text-[var(--text-muted)] flex items-center gap-2"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{
                        background: serverOk
                          ? "var(--accent-2)"
                          : "var(--error)",
                      }}
                      aria-hidden="true"
                    />
                    <span>{serverOk ? serverUpText : serverDownText}</span>
                  </div>
                </div>
              </div>
            </header>
            <main
              id="main-content"
              className="flex-1 mx-auto max-w-6xl w-full px-6 py-8"
              role="main"
              tabIndex={-1}
            >
              {children}
            </main>
            <footer
              className="border-t border-[var(--border)] mt-auto"
              role="contentinfo"
            >
              <div className="mx-auto max-w-6xl px-6 py-3 text-xs text-[var(--text-muted)] flex items-center justify-between">
                <span>{footerCopy}</span>
                <span>
                  {footerEndpoint} <code className="kbd">127.0.0.1:17361</code>
                </span>
              </div>
            </footer>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
