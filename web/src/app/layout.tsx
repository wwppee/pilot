import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { api } from "@/lib/pilot";
import { negotiateLocale, type Locale } from "@/lib/i18n";
import { I18nProvider, T } from "@/components/I18n";
import { renderT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

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

export const metadata: Metadata = {
  title: "Pilot — pi.dev management plane",
  description: "Local dashboard for pi sessions, packs, profiles, and stats.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
};

const NAV_KEYS = [
  { href: "/", labelKey: "nav.dashboard" as const },
  { href: "/packages", labelKey: "nav.packages" as const },
  { href: "/sessions", labelKey: "nav.sessions" as const },
  { href: "/usage", labelKey: "nav.usage" as const },
  { href: "/tools", labelKey: "nav.tools" as const },
  { href: "/context", labelKey: "nav.context" as const },
  { href: "/policy", labelKey: "nav.policy" as const },
  { href: "/compose", labelKey: "nav.compose" as const },
  { href: "/profiles", labelKey: "nav.profiles" as const },
  { href: "/capabilities", labelKey: "nav.capabilities" as const },
];

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

  // Negotiate locale: Accept-Language header takes priority.
  // The I18nProvider's client-side effect will override this with
  // localStorage["pilot-locale"] if the user has explicitly chosen.
  let acceptLanguage: string | null = null;
  try {
    const h = await headers();
    acceptLanguage = h.get("accept-language");
  } catch {
    /* headers() not available in static generation */
  }
  const locale: Locale = negotiateLocale(acceptLanguage);

  // Pre-render static strings server-side so we don't depend on the
  // client provider for SSR output (avoids layout shift).
  const skipToMain = renderT(locale, "skip.toMain");
  const navAriaLabel = renderT(locale, "nav.ariaLabel");
  const brandAria = renderT(locale, "brand.ariaHome");
  const serverUpText = renderT(locale, "server.up", { version });
  const serverDownText = renderT(locale, "server.down");
  const footerCopy = renderT(locale, "footer.copy", { version });
  const footerEndpoint = renderT(locale, "footer.endpoint");

  return (
    <html
      lang={locale}
      className={`${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <I18nProvider initialLocale={locale}>
          {/* Skip link: invisible until focused. Lets keyboard users jump
              straight to main content instead of tabbing through nav. */}
          <a href="#main-content" className="skip-link">
            {skipToMain}
          </a>

          <div className="min-h-screen flex flex-col">
            <header
              className="border-b border-[var(--border)] bg-[var(--surface)]"
              role="banner"
            >
              <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6">
                <Link
                  href="/"
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: "var(--text)" }}
                  aria-label={brandAria}
                >
                  🛰 <T k="brand.name" />
                </Link>
                <nav
                  className="flex gap-4 text-sm"
                  role="navigation"
                  aria-label={navAriaLabel}
                >
                  {NAV_KEYS.map((item) => {
                    const active =
                      item.href === "/"
                        ? currentPath === "/"
                        : currentPath === item.href ||
                          currentPath.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="text-[var(--text-muted)] hover:text-[var(--text)]"
                        aria-current={active ? "page" : undefined}
                        data-active={active ? "true" : undefined}
                      >
                        <T k={item.labelKey} />
                      </Link>
                    );
                  })}
                </nav>
                <div className="ml-auto flex items-center gap-3">
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
