/**
 * GlossaryTerm — inline jargon tooltips.
 *
 * v0.5.18: dotted-underline jargon with canonical definition as
 * title (hover) + aria-label.
 *
 * v0.5.22: takes a `locale` prop. The glossary data is bilingual
 * (en + zh); the term picks the right language at render time.
 * Kept as a plain (non-client) component so server components
 * like the dashboard's StatCards can use it.
 */

import { shortFor, definitionFor, type GlossaryKey } from "@/lib/glossary";
import type { Locale } from "@/lib/i18n";

interface GlossaryTermProps {
  /** Term id — see web/src/lib/glossary.ts. */
  term: GlossaryKey;
  /**
   * Locale to render. Required so the same component works in
   * server contexts (negotiated from request headers) and in
   * client contexts (from useI18n).
   */
  locale: Locale;
  /** Override the displayed term text (defaults to the glossary's
   * canonical "short" form for the active locale). */
  children?: React.ReactNode;
  /** Visual style: underline (default) or plain. */
  variant?: "underline" | "plain";
}

export function GlossaryTerm({
  term,
  locale,
  children,
  variant = "underline",
}: GlossaryTermProps) {
  const short = shortFor(term, locale);
  const def = definitionFor(term, locale);
  const cls =
    variant === "underline"
      ? "underline decoration-dotted underline-offset-2 cursor-help"
      : "cursor-help";
  return (
    <span className={cls} title={def} aria-label={`${short}: ${def}`}>
      {children ?? short}
    </span>
  );
}
