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
  const dx = Math.max(Math.abs(x2 - x1) / 2, 60);
  const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  // v0.6.9: the cubic bezier collapses to a straight-line midpoint
  // because the two control points share Y with their endpoints.
  // We nudge the text up a few pixels so it doesn't overlap the
  // line itself.
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - 6;
  return (
    <g
      data-connection-id={connection.id}
      data-selected={selected}
      data-kind={connection.kind ?? ""}
      className="compose-connection-path"
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={selected ? 2.5 : 1.5}
        opacity={selected ? 1 : 0.6}
        markerEnd={`url(#${selected ? "compose-arrow-selected" : "compose-arrow-default"})`}
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
