/**
 * Hint — inline expandable help text.
 *
 * v0.5.18: beginner-friendly guidance pattern. Renders a small
 * italic "what is this?" line that expands on click to reveal a
 * longer explanation. Use for jargon / context / next steps.
 *
 * Pattern: <Hint>What's a session? ...</Hint>
 *
 * Server-component safe (no "use client"). Pure JSX.
 */

"use client";

import { useState, type ReactNode } from "react";

interface HintProps {
  /** Short label shown when collapsed. Default: "What is this?" */
  summary?: ReactNode;
  /** Body shown when expanded. */
  children: ReactNode;
  /** Initial state — default collapsed. */
  defaultOpen?: boolean;
}

export function Hint({
  summary = "What is this?",
  children,
  defaultOpen = false,
}: HintProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[var(--text-muted)] hover:text-[var(--text)] italic focus:outline-none focus:underline"
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} {summary}
      </button>
      {open && (
        <div className="mt-2 text-[var(--text-muted)] leading-relaxed pl-3 border-l-2 border-[var(--border)]">
          {children}
        </div>
      )}
    </div>
  );
}
