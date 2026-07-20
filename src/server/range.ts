/**
 * v0.9.16: query range parser extracted from
 * server.ts.
 *
 * `?range=` can be:
 *   - "today"      — local-tz day
 *   - "lastDays"   — last N days (default 7)
 *   - "all"        — all recorded calls
 *   - anything else — fallback to "lastDays 7d"
 *
 * The `days` query param only applies when
 * `range=lastDays` and is clamped to > 0.
 *
 * Pure function (no Fastify) so the stats and
 * usage routes can share it without dragging the
 * whole server.ts into a dependency cycle.
 */
import type { StatsRange } from "../core/stats.js";

export function parseRange(which: string, days?: number): StatsRange {
  switch (which) {
    case "today":
      return { kind: "today" };
    case "lastDays":
      return { kind: "lastDays", days: days && days > 0 ? days : 7 };
    case "all":
      return { kind: "all" };
    default:
      return { kind: "lastDays", days: 7 };
  }
}
