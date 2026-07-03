import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
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

  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-[var(--border)] bg-[var(--surface)]">
            <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6">
              <Link
                href="/"
                className="text-lg font-semibold tracking-tight"
                style={{ color: "var(--text)" }}
              >
                🛰 pilot
              </Link>
              <nav className="flex gap-4 text-sm">
                <Link
                  href="/"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Dashboard
                </Link>
                <Link
                  href="/packages"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Packages
                </Link>
                <Link
                  href="/sessions"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Sessions
                </Link>
                <Link
                  href="/usage"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Usage
                </Link>
                <Link
                  href="/tools"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Tools
                </Link>
                <Link
                  href="/context"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Context
                </Link>
                <Link
                  href="/policy"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Policy
                </Link>
                <Link
                  href="/compose"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Compose
                </Link>
                <Link
                  href="/profiles"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Profiles
                </Link>
                <Link
                  href="/capabilities"
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Capabilities
                </Link>
              </nav>
              <div className="ml-auto text-xs text-[var(--text-muted)] flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background: serverOk ? "var(--accent-2)" : "var(--error)",
                  }}
                />
                <span>
                  {serverOk
                    ? `pilot server · v${version}`
                    : "server not running"}
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-8">
            {children}
          </main>
          <footer className="border-t border-[var(--border)] mt-auto">
            <div className="mx-auto max-w-6xl px-6 py-3 text-xs text-[var(--text-muted)] flex items-center justify-between">
              <span>
                pilot-web v0.4.4 · reads + policy + compose over pilot server
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
