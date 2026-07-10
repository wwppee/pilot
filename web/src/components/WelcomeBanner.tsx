/**
 * WelcomeBanner — dismissible first-visit walkthrough.
 *
 * v0.5.18: beginner-friendly guidance. Shown once per browser
 * (localStorage flag), explains the 3-step flow: Discover →
 * Configure → Use. Each step is a link to the relevant page.
 *
 * Server-component safe (renders nothing on the server if the
 * localStorage flag is set, then the client component takes over).
 *
 * Pattern:
 *   <WelcomeBanner
 *     title="Welcome to Pilot"
 *     steps={[
 *       { href: "/sessions", label: "See past sessions", desc: "..." },
 *     ]}
 *     dismissKey="pilot-welcome-v1"
 *   />
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface WelcomeStep {
  href: string;
  label: string;
  desc: string;
}

interface WelcomeBannerProps {
  /** Headline. */
  title: string;
  /** Body intro line. */
  intro?: string;
  /** Ordered steps. */
  steps: WelcomeStep[];
  /** localStorage key for dismissal state. */
  dismissKey: string;
}

export function WelcomeBanner({
  title,
  intro,
  steps,
  dismissKey,
}: WelcomeBannerProps) {
  // SSR-safe: render nothing until we're on the client, then check
  // localStorage. This avoids hydration mismatch (server can't see
  // localStorage).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(dismissKey) === "1") return;
    } catch {
      /* private mode etc. */
    }
    setVisible(true);
  }, [dismissKey]);

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section
      className="surface rounded-lg p-5 sm:p-6"
      style={{
        borderLeft: "4px solid var(--accent)",
        background:
          "linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%)",
      }}
      role="region"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold mb-1">{title}</h2>
          {intro && (
            <p className="text-sm text-[var(--text-muted)] mb-4">{intro}</p>
          )}
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {steps.map((s, i) => (
              <li
                key={s.href}
                className="surface-2 rounded p-3 flex flex-col gap-1"
              >
                <span
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--accent)" }}
                >
                  Step {i + 1}
                </span>
                <Link
                  href={s.href}
                  className="font-medium hover:underline focus:underline"
                >
                  {s.label}
                </Link>
                <p className="text-xs text-[var(--text-muted)]">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] shrink-0"
          aria-label="Dismiss welcome banner"
        >
          ✕
        </button>
      </div>
    </section>
  );
}
