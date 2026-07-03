import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { api } from "@/lib/pilot";

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

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/packages", label: "Packages" },
  { href: "/sessions", label: "Sessions" },
  { href: "/usage", label: "Usage" },
  { href: "/tools", label: "Tools" },
  { href: "/context", label: "Context" },
  { href: "/policy", label: "Policy" },
  { href: "/compose", label: "Compose" },
  { href: "/profiles", label: "Profiles" },
  { href: "/capabilities", label: "Capabilities" },
] as const;

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

  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body>
        {/* Skip link: invisible until focused. Lets keyboard users jump
            straight to main content instead of tabbing through nav. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
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
                aria-label="Pilot home"
              >
                🛰 pilot
              </Link>
              <nav
                className="flex gap-4 text-sm"
                role="navigation"
                aria-label="Main"
              >
                {NAV.map((item) => {
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
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div
                className="ml-auto text-xs text-[var(--text-muted)] flex items-center gap-2"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background: serverOk ? "var(--accent-2)" : "var(--error)",
                  }}
                  aria-hidden="true"
                />
                <span>
                  {serverOk
                    ? `pilot server · v${version}`
                    : "server not running"}
                </span>
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
              <span>
                pilot-web v0.4.8 · reads + policy + compose over pilot server
              </span>
              <span>
                server expected at <code className="kbd">127.0.0.1:17361</code>
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
