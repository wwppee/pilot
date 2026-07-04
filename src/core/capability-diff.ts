/**
 * core/capability-diff.ts — pure diff between two Capabilities.
 *
 * v0.5.1: answers "what's the difference between these two absorbed
 * Capabilities?". Useful when upgrading a package (re-absorb creates
 * a new Capability) or when comparing an L1-referenced version
 * against an L2-wrapped upgrade.
 *
 * Pure function — no fs side-effects. The caller (service / server)
 * is responsible for loading the two Capabilities from disk first
 * (via existing `readCapability` from core/capability.ts).
 *
 * ## Status semantics (re-uses `DiffStatus` from core/avatar.ts)
 *
 *   - `match`   — both sides have the same value
 *   - `drift`   — both sides have values but they differ
 *   - `missing` — A has it, B doesn't (would lose this in a merge)
 *   - `extra`   — B has it, A doesn't (would gain this in a merge)
 *   - `equal`   — A === B overall (every field is `match`)
 *
 * For arrays (sources / conflicts / requires / inspiredBy / tags):
 * set-style comparison. Objects inside arrays (CapabilitySource)
 * are matched by their `ref` field — sources with the same `ref`
 * are considered "the same source", even if `type` or `mode`
 * changed. Mismatched source detail is surfaced via
 * `sourceRefDiffs[]`.
 *
 * `eval` is special-cased: three-state (both absent / only A /
 * only B / both present). When both present, compares `score`,
 * `fixtureCount`, and `lastRun`.
 *
 * `id` is intentionally NOT diffed — it's the identity field. The
 * UI should always show both ids clearly so the user knows which
 * is which.
 */

import type { Capability, CapabilitySource } from "./capability.js";
import type { DiffStatus } from "./avatar.js";

// Re-use the DiffStatus vocabulary from avatar so UI color-coding
// stays consistent across the two diff surfaces.
export type { DiffStatus };

// ─── Per-field diff shapes ────────────────────────────────────

export interface ScalarDiff<T> {
  status: DiffStatus;
  a: T | undefined;
  b: T | undefined;
}

export interface SetDiff<T> {
  status: DiffStatus;
  a: T[];
  b: T[];
}

export interface SourceDetail {
  ref: string;
  status: DiffStatus;
  /** A-side source when present, undefined when only B has this ref. */
  a?: CapabilitySource;
  /** B-side source when present, undefined when only A has this ref. */
  b?: CapabilitySource;
}

export interface CapabilityDiff {
  aId: string;
  bId: string;
  /** Per-scalar field. */
  title: ScalarDiff<string>;
  type: ScalarDiff<Capability["type"]>;
  description: ScalarDiff<string>;
  /** Whole-array sources compared ref-by-ref. */
  sources: SetDiff<string>;
  /** Per-source details when refs disagree. */
  sourceDetails: SourceDetail[];
  /** Artifacts: each list compared set-style. */
  artifacts: {
    extensions: SetDiff<string>;
    skills: SetDiff<string>;
    prompts: SetDiff<string>;
    themes: SetDiff<string>;
  };
  /** Eval present/absent mismatch surfaces here. */
  eval:
    | {
        status: "match" | "drift";
        a: NonNullable<Capability["eval"]>;
        b: NonNullable<Capability["eval"]>;
      }
    | { status: "missing"; a: NonNullable<Capability["eval"]> }
    | { status: "extra"; b: NonNullable<Capability["eval"]> }
    | { status: "match"; note: "both absent" };
  /** Compatibility: both lists compared set-style. */
  compatibility: {
    conflicts: SetDiff<string>;
    requires: SetDiff<string>;
  };
  /** Metadata lists compared set-style. */
  metadata: {
    inspiredBy: SetDiff<string>;
    tags: SetDiff<string>;
    createdAt: ScalarDiff<string>;
    updatedAt: ScalarDiff<string>;
  };
  /** True when every diffable field is `match` (id is excluded — it's identity). */
  equal: boolean;
}

// ─── Pure diff function ──────────────────────────────────────

export function diffCapability(a: Capability, b: Capability): CapabilityDiff {
  const title = scalar(a.title, b.title);
  const type = scalar(a.type, b.type);
  const description = scalar(a.description, b.description);

  const sources = setDiff(
    a.sources.map((s) => s.ref),
    b.sources.map((s) => s.ref),
  );

  // Per-source detail — same `ref` but different fields? Diverge.
  const sourceDetails = diffSources(a.sources, b.sources);

  const artifacts = {
    extensions: setDiff(
      a.artifacts.extensions ?? [],
      b.artifacts.extensions ?? [],
    ),
    skills: setDiff(a.artifacts.skills ?? [], b.artifacts.skills ?? []),
    prompts: setDiff(a.artifacts.prompts ?? [], b.artifacts.prompts ?? []),
    themes: setDiff(a.artifacts.themes ?? [], b.artifacts.themes ?? []),
  };

  const evalDiff = diffEval(a.eval, b.eval);

  const compatibility = {
    conflicts: setDiff(a.compatibility.conflicts, b.compatibility.conflicts),
    requires: setDiff(a.compatibility.requires, b.compatibility.requires),
  };

  const metadata = {
    inspiredBy: setDiff(
      a.metadata.inspiredBy ?? [],
      b.metadata.inspiredBy ?? [],
    ),
    tags: setDiff(a.metadata.tags ?? [], b.metadata.tags ?? []),
    createdAt: scalar(a.metadata.createdAt, b.metadata.createdAt),
    updatedAt: scalar(a.metadata.updatedAt, b.metadata.updatedAt),
  };

  // `equal` = every diffable field is `match`. Note: missing/extra on
  // a field where neither side has content still counts as match
  // (setDiff handles `[]` vs `[]` correctly).
  const equal =
    title.status === "match" &&
    type.status === "match" &&
    description.status === "match" &&
    sources.status === "match" &&
    sourceDetails.every((d) => d.status === "match") &&
    artifacts.extensions.status === "match" &&
    artifacts.skills.status === "match" &&
    artifacts.prompts.status === "match" &&
    artifacts.themes.status === "match" &&
    evalDiff.status === "match" &&
    compatibility.conflicts.status === "match" &&
    compatibility.requires.status === "match" &&
    metadata.inspiredBy.status === "match" &&
    metadata.tags.status === "match" &&
    metadata.createdAt.status === "match" &&
    metadata.updatedAt.status === "match";

  return {
    aId: a.id,
    bId: b.id,
    title,
    type,
    description,
    sources,
    sourceDetails,
    artifacts,
    eval: evalDiff,
    compatibility,
    metadata,
    equal,
  };
}

// ─── Internal helpers ─────────────────────────────────────────

/** Scalar diff. Same shape as AvatarDiffField but exported from this module. */
function scalar<T>(a: T | undefined, b: T | undefined): ScalarDiff<T> {
  let status: DiffStatus;
  if (a === undefined && b === undefined) status = "match";
  else if (a === undefined) status = "extra";
  else if (b === undefined) status = "missing";
  else status = a === b ? "match" : "drift";
  return { status, a, b };
}

/** Set-style diff. Same semantics as Avatar's diffSet. */
function setDiff<T>(a: T[], b: T[]): SetDiff<T> {
  const sa = new Set(a);
  const sb = new Set(b);

  if (sa.size === sb.size && [...sa].every((x) => sb.has(x))) {
    return { status: "match", a, b };
  }

  const onlyA = [...sa].filter((x) => !sb.has(x));
  const onlyB = [...sb].filter((x) => !sa.has(x));

  if (onlyA.length > 0 && onlyB.length === 0) {
    return { status: "missing", a, b };
  }
  if (onlyA.length === 0 && onlyB.length > 0) {
    return { status: "extra", a, b };
  }
  return { status: "drift", a, b };
}

/** Per-source diff. Match when a.ref === b.ref AND type/mode match. */
function diffSources(
  a: CapabilitySource[],
  b: CapabilitySource[],
): SourceDetail[] {
  const refs = new Set([...a.map((s) => s.ref), ...b.map((s) => s.ref)]);
  const details: SourceDetail[] = [];
  for (const ref of refs) {
    const aSrc = a.find((s) => s.ref === ref);
    const bSrc = b.find((s) => s.ref === ref);
    let status: DiffStatus;
    if (aSrc && !bSrc) status = "missing";
    else if (!aSrc && bSrc) status = "extra";
    else if (aSrc && bSrc) {
      status =
        aSrc.type === bSrc.type && aSrc.mode === bSrc.mode ? "match" : "drift";
    } else {
      status = "match"; // unreachable
    }
    details.push({
      ref,
      status,
      ...(aSrc ? { a: aSrc } : {}),
      ...(bSrc ? { b: bSrc } : {}),
    });
  }
  // Stable order: match first, then missing, then extra, then drift.
  const order: Record<DiffStatus, number> = {
    match: 0,
    drift: 1,
    missing: 2,
    extra: 3,
  };
  return details.sort(
    (x, y) => order[x.status] - order[y.status] || x.ref.localeCompare(y.ref),
  );
}

/**
 * Three-state diff for `eval`: the optional eval block is special
 * because its presence is itself the meaningful signal — a
 * Capability without eval is "untested", not "score=0".
 */
function diffEval(
  a: Capability["eval"],
  b: Capability["eval"],
): CapabilityDiff["eval"] {
  if (a === undefined && b === undefined) {
    return { status: "match", note: "both absent" };
  }
  if (a !== undefined && b === undefined) {
    return { status: "missing", a };
  }
  if (a === undefined && b !== undefined) {
    return { status: "extra", b };
  }
  // Both present — compare fields.
  const sameScore = a!.score === b!.score;
  const sameFixtures = a!.fixtureCount === b!.fixtureCount;
  const sameRun = a!.lastRun === b!.lastRun;
  return {
    status: sameScore && sameFixtures && sameRun ? "match" : "drift",
    a: a!,
    b: b!,
  };
}
