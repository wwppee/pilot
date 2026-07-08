import type { ReactNode } from "react";
import { translate } from "../lib/i18n";

/**
 * Translate a key with named placeholder values that may themselves be
 * `ReactNode` (typically `<code>`, `<a>`, etc.).
 *
 * The key template looks like `"Run {cmd} in any project to populate {dir}."`.
 * Pass matching `{ cmd: <code>pi</code>, dir: <code>~/.pi/agent/</code> }` and
 * the component substitutes the ReactNode values into the right spots.
 *
 * Plain `{name}` placeholders without a matching value pass through
 * literally so missing entries are visible.
 *
 * v0.5.12 — replaces inline-English hints in `tools`, `usage`,
 * `capabilities`, `context`, `sessions` EmptyState components.
 */
export function RichT({
  locale,
  k,
  values,
}: {
  locale: "en" | "zh";
  k: string;
  values?: Record<string, ReactNode>;
}): ReactNode {
  const template = translate(locale, k);
  // Split template by `{name}` placeholders. Plain text segments
  // become strings; placeholder segments look up `values[name]`.
  const parts = template.split(/(\{[^}]+\})/g);
  return (
    <>
      {parts.map((part: string, i: number) => {
        const m = part.match(/^\{([^}]+)\}$/);
        if (m) {
          const name = m[1];
          if (name && values && name in values) {
            return <span key={i}>{values[name]}</span>;
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
