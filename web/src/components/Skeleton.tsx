/**
 * Skeleton — animated placeholder while async data loads.
 *
 * Uses CSS-only shimmer (no JS, no JS animation libraries). Single
 * pass through `globals.css` defines the animation; component is just
 * styled divs with widths set by props.
 *
 * Three primitives:
 *   - <SkeletonLines /> — vertical stack of "text" rows
 *   - <SkeletonCard /> — surface box (matches `.surface.rounded-lg`)
 *   - <SkeletonRow /> — single horizontal line (table row, list item)
 *
 * Use them as drop-in replacements for "Loading…" text. The reader
 * sees structure immediately; the shimmer tells them data is coming.
 */
import type { CSSProperties } from "react";

interface SkeletonLinesProps {
  /** How many lines to render. Default 3. */
  count?: number;
  /** Last line shorter than the rest (simulates paragraph). */
  ragged?: boolean;
  /** Override the gap (px). */
  gap?: number;
}

export function SkeletonLines({
  count = 3,
  ragged = true,
  gap = 8,
}: SkeletonLinesProps) {
  const widths: string[] = [];
  for (let i = 0; i < count; i++) {
    if (ragged && i === count - 1) {
      widths.push("65%");
    } else if (ragged && i === count - 2) {
      widths.push("88%");
    } else {
      widths.push("100%");
    }
  }
  return (
    <div className="skeleton-stack" style={{ gap }}>
      {widths.map((w, i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{ width: w } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Single block representing a card surface while its data loads. */
export function SkeletonCard({
  lines = 3,
  height,
}: {
  lines?: number;
  height?: number;
}) {
  return (
    <div
      className="surface rounded-lg p-4"
      style={height ? { minHeight: height } : undefined}
    >
      <SkeletonLines count={lines} />
    </div>
  );
}

/** Single row (table / list placeholder). */
export function SkeletonRow({ width = "100%" }: { width?: string }) {
  return (
    <div
      className="skeleton-bar"
      style={{ width, height: "12px" } as CSSProperties}
    />
  );
}
