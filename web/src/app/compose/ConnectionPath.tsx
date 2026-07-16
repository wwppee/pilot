/**
 * ConnectionPath.tsx — one connection line as an SVG <g>.
 *
 * v0.6.7: split out of `ComposeBoard.tsx` so the main file
 * stops crossing 2700 lines. Reads the from/to block's position
 * + dimensions from the blocks array and draws a cubic bezier
 * between the right edge of `from` and the left edge of `to`.
 * Block dimensions are pinned to the ComposeBlockView styles
 * (220×80-ish) — if those change, update BLOCK_W / BLOCK_H below.
 *
 * v0.6.9: also renders the inline label (paint-order: stroke
 * halo for readability over the line) and the arrow head via
 * `markerEnd`. The arrow <defs> live in `ComposeBoard.tsx`
 * (single source of truth, so adding a new marker is a one-line
 * change in the SVG overlay).
 */

import type { ComposeBlock, ComposeConnection } from "../../lib/types";

// v0.6.11: exported so `ComposeBoard.tsx` can use the same
// constants for the in-flight connection ghost line (which
// re-derives the handle anchor from `from.x + BLOCK_W`).
export const BLOCK_W = 220;
export const BLOCK_H = 80;

export function ConnectionPath({
  connection,
  blocks,
  selected,
  onSelect,
}: {
  connection: ComposeConnection;
  blocks: ComposeBlock[];
  selected: boolean;
  onSelect: () => void;
}) {
  const from = blocks.find((b) => b.id === connection.from);
  const to = blocks.find((b) => b.id === connection.to);
  if (!from || !to) return null;
  const x1 = from.x + BLOCK_W;
  const y1 = from.y + BLOCK_H / 2;
  const x2 = to.x;
  const y2 = to.y + BLOCK_H / 2;
  // v0.6.20: routing style. "curve" (the v0.6.19 default) draws
  // a smooth cubic bezier; "orthogonal" draws a 3-segment
  // right-angle polyline (right → up/down → right). Both are
  // expressed as a single SVG `<path>` so the v0.6.18 marker
  // logic (markerStart / markerEnd) keeps working — the
  // orthogonal case's last segment is still horizontal, so the
  // `orient="auto-start-reverse"` marker on `markerEnd` lands
  // pointing right (toward `to`) exactly like the curve case.
  //
  // For degenerate cases (y1 === y2) the orthogonal path is
  // just a single horizontal line — we skip the vertical
  // segment so the SVG stays clean.
  const route = connection.route ?? "curve";
  const path =
    route === "orthogonal"
      ? y1 === y2
        ? `M ${x1} ${y1} L ${x2} ${y2}`
        : `M ${x1} ${y1} L ${(x1 + x2) / 2} ${y1} L ${(x1 + x2) / 2} ${y2} L ${x2} ${y2}`
      : (() => {
          const dx = Math.max(Math.abs(x2 - x1) / 2, 60);
          return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        })();
  // v0.6.9: the cubic bezier collapses to a straight-line midpoint
  // because the two control points share Y with their endpoints.
  // v0.6.20: orthogonal routing puts the elbow at the same (midX,
  // midY) point, so the label position is unchanged across the two
  // routing styles — the user sees the label in the same place
  // whether the line curves through the midpoint or elbows at it.
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - 6;
  // v0.6.18: dir drives which end(s) get the arrow head.
  // Default to "forward" so v1-v3 connections (missing the
  // field) render exactly the same as they did in v0.6.17.
  const dir = connection.dir ?? "forward";
  const markerId = selected
    ? "compose-arrow-selected"
    : "compose-arrow-default";
  // orient="auto-start-reverse" on the marker definition makes
  // it mirror its shape at marker-start automatically, so the
  // same id can be used for both ends without redefining a
  // separate "left-pointing" marker.
  //
  // v0.6.19: per-edge color override. The line + arrow head
  // both consume `currentColor` (set on this `<g>`), so we
  // thread the user-picked color through `style.color` rather
  // than touching the stroke attribute. That way the same
  // marker definition is reused without per-color cloning.
  // Missing `color` → `currentColor` (no inline style) → the
  // parent <svg> style takes over, which is the theme accent.
  const style: React.CSSProperties = { cursor: "pointer" };
  if (connection.color) {
    style.color = connection.color;
  }
  return (
    <g
      data-connection-id={connection.id}
      data-selected={selected}
      data-kind={connection.kind ?? ""}
      data-dir={dir}
      data-route={route}
      data-has-color={connection.color ? "1" : "0"}
      className="compose-connection-path"
      onClick={onSelect}
      style={style}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={selected ? 2.5 : 1.5}
        opacity={selected ? 1 : 0.6}
        markerStart={
          dir === "backward" || dir === "bidirectional"
            ? `url(#${markerId})`
            : undefined
        }
        markerEnd={
          dir === "forward" || dir === "bidirectional"
            ? `url(#${markerId})`
            : undefined
        }
      />
      {connection.label ? (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          className="compose-connection-label"
          data-testid="compose-connection-label"
        >
          {connection.label}
        </text>
      ) : null}
    </g>
  );
}
