/**
 * GlossaryTerm — inline jargon tooltips.
 *
 * v0.5.18: beginner-friendly guidance. Wrap any technical term
 * (session, capability, avatar, …) so beginners can hover/tap and
 * get a one-line definition. Definitions are sourced from a small
 * shared glossary so the same term always explains the same way.
 *
 * Pattern: <GlossaryTerm term="session" />
 *
 * Server-component safe.
 */

"use client";

import glossary, { type GlossaryKey } from "@/lib/glossary";

interface GlossaryTermProps {
  /** Term id — see web/src/lib/glossary.ts. */
  term: GlossaryKey;
  /** Override the displayed term text (defaults to the glossary's
   * canonical "short" form). */
  children?: React.ReactNode;
  /** Visual style: underline (default) or plain. */
  variant?: "underline" | "plain";
}

export function GlossaryTerm({
  term,
  children,
  variant = "underline",
}: GlossaryTermProps) {
  const entry = glossary[term];
  const cls =
    variant === "underline"
      ? "underline decoration-dotted underline-offset-2 cursor-help"
      : "cursor-help";
  return (
    <span
      className={cls}
      title={entry.definition}
      aria-label={`${entry.short}: ${entry.definition}`}
    >
      {children ?? entry.short}
    </span>
  );
}
