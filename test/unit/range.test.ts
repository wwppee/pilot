/**
 * Tests for src/server/range.ts.
 *
 * v0.9.16: parseRange extracted from server.ts.
 * `?range=` can be "today" / "lastDays" / "all" or
 * anything else (fallback to "lastDays 7d"). The
 * `days` query param only applies when
 * `range=lastDays` and is clamped to > 0.
 *
 * What we lock:
 *   - each valid value returns the matching
 *     StatsRange kind
 *   - invalid / empty values fall back to 7d
 *     (so a typo or stale query doesn't silently
 *     switch the user to "all time")
 *   - days <= 0 is treated as missing (defaults
 *     to 7) rather than e.g. days: 0
 */

import { describe, it, expect } from "vitest";
import { parseRange } from "../../src/server/range.js";

describe("parseRange", () => {
  it("returns kind: 'today' for 'today'", () => {
    expect(parseRange("today")).toEqual({ kind: "today" });
  });

  it("returns kind: 'all' for 'all'", () => {
    expect(parseRange("all")).toEqual({ kind: "all" });
  });

  it("returns kind: 'lastDays' with the given days for 'lastDays'", () => {
    expect(parseRange("lastDays", 30)).toEqual({
      kind: "lastDays",
      days: 30,
    });
  });

  it("defaults days to 7 when range=lastDays and days is missing", () => {
    expect(parseRange("lastDays")).toEqual({ kind: "lastDays", days: 7 });
  });

  it("defaults days to 7 when range=lastDays and days <= 0", () => {
    expect(parseRange("lastDays", 0)).toEqual({ kind: "lastDays", days: 7 });
    expect(parseRange("lastDays", -3)).toEqual({ kind: "lastDays", days: 7 });
  });

  it("falls back to 7-day window for unknown range values", () => {
    // A typo like 'weekly' or 'day' must NOT switch
    // the user to "all time" — that would be a big
    // data dump on what looks like a 7-day request.
    expect(parseRange("weekly")).toEqual({ kind: "lastDays", days: 7 });
    expect(parseRange("")).toEqual({ kind: "lastDays", days: 7 });
  });
});
