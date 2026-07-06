/**
 * core/apply-profile-to-pi.ts — apply a Pilot profile to pi's actual
 * settings (v0.5.5+).
 *
 * Closes the historical "orphan active.json" gap: previously Pilot
 * wrote `~/.pilot/active.json` when you activated a profile, but pi
 * never read that file. The profile name lived in a Pilot-only
 * diary that didn't change pi's runtime behavior.
 *
 * This module is the real fix:
 *   - Reads the named profile's TOML (model / thinking / team)
 *   - Reads pi's current `~/.pi/agent/settings.json` (or starts
 *     from a sensible empty baseline if it doesn't exist)
 *   - Merges the profile into pi's settings:
 *       defaultModel + defaultProvider → pi's `defaultModel` / `defaultProvider`
 *       thinking                       → pi's `defaultThinkingLevel`
 *       team                           → expanded as `packages[]` entries
 *   - Calls `writeSettings` (with proper-lockfile + backup) so pi's
 *     next launch picks up the changes.
 *
 * The merge is **additive for packages**: existing packages stay,
 * new ones from the profile's `team` get appended (deduplicated by
 * source string). This avoids clobbering a user's hand-installed
 * packs when they activate a profile.
 *
 * Scope is always `global` for now — pi's project-scope settings
 * live in `<cwd>/.pi/settings.json` and require trust acceptance,
 * which is a different workflow.
 */

import { readSettings } from "./settings.js";
import { writeSettings } from "./settings-write.js";
import {
  type PiPackageSource,
  type PiSettings,
  type PiThinkingLevel,
  packageSourceOf,
} from "./types.js";

export interface ApplyProfileToPiReport {
  ok: boolean;
  profileName: string;
  path: string;
  /** What fields changed in pi's settings. */
  changes: {
    defaultProvider?: { before: string | undefined; after: string };
    defaultModel?: { before: string | undefined; after: string };
    defaultThinkingLevel?: {
      before: PiThinkingLevel | undefined;
      after: PiThinkingLevel;
    };
    /** Number of new packages appended (deduplicated). */
    packagesAdded: number;
  };
  message: string;
  error?: string;
}

/** Profile shape — the fields we actually consume from the TOML. */
export interface PilotProfileShape {
  name: string;
  /** "anthropic" / "openai" / etc. — required when model is set. */
  provider?: string | undefined;
  /** Model identifier — e.g. "claude-opus-4-6". */
  model?: string | undefined;
  /** Thinking level — maps directly to pi's `defaultThinkingLevel`. */
  thinking?: PiThinkingLevel | undefined;
  /** Pack sources to install — strings (npm:/git:/file:) or `PackageSource` objects. */
  packs?: Array<string | PiPackageSource> | undefined;
}

/**
 * Append `incoming` packages to `existing`, deduplicating by source
 * string. Preserves order of `existing` and only appends new entries.
 */
function mergePackages(
  existing: PiPackageSource[] | undefined,
  incoming: PiPackageSource[] | undefined,
): { merged: PiPackageSource[]; added: number } {
  const out = existing ? [...existing] : [];
  const seen = new Set(out.map(packageSourceOf));
  let added = 0;
  if (incoming) {
    for (const p of incoming) {
      const key = packageSourceOf(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
      added++;
    }
  }
  return { merged: out, added };
}

/**
 * Apply a profile to pi's global settings.json.
 *
 * Idempotent: re-applying the same profile is a no-op once it's
 * already in settings. Does NOT touch pi's in-memory state — pi
 * picks up the changes on next launch (which is the right time
 * to swap model + packages anyway).
 */
export async function applyProfileToPi(
  profile: PilotProfileShape,
  home?: string,
): Promise<ApplyProfileToPiReport> {
  const existing = (await readSettings(home)) ?? {};
  const next: PiSettings = { ...existing };

  const changes: ApplyProfileToPiReport["changes"] = { packagesAdded: 0 };

  // ── defaultProvider + defaultModel ────────────────────────────
  // Pi stores provider and model as TWO separate fields. Pilot's
  // profile has `provider` (optional) + `model` (optional). If only
  // model is set, leave the existing provider alone — better to
  // assume the user's provider pairing than guess.
  if (profile.model) {
    const afterModel = profile.model;
    if (existing.defaultModel !== afterModel) {
      changes.defaultModel = {
        before: existing.defaultModel,
        after: afterModel,
      };
    }
    next.defaultModel = afterModel;

    if (profile.provider) {
      const afterProvider = profile.provider;
      if (existing.defaultProvider !== afterProvider) {
        changes.defaultProvider = {
          before: existing.defaultProvider,
          after: afterProvider,
        };
      }
      next.defaultProvider = afterProvider;
    }
  }

  // ── defaultThinkingLevel ──────────────────────────────────────
  if (profile.thinking) {
    const afterLevel = profile.thinking;
    if (existing.defaultThinkingLevel !== afterLevel) {
      changes.defaultThinkingLevel = {
        before: existing.defaultThinkingLevel,
        after: afterLevel,
      };
    }
    next.defaultThinkingLevel = afterLevel;
  }

  // ── packages (additive merge) ─────────────────────────────────
  const incomingPkgs = profile.packs as PiPackageSource[] | undefined;
  const { merged, added } = mergePackages(existing.packages, incomingPkgs);
  if (added > 0) {
    changes.packagesAdded = added;
    next.packages = merged;
  }

  // ── write ─────────────────────────────────────────────────────
  const report = await writeSettings(next, home);
  if (!report.ok) {
    return {
      ok: false,
      profileName: profile.name,
      path: report.path,
      changes,
      message: report.message,
      ...(report.error ? { error: report.error } : {}),
    };
  }

  // Build a human-readable summary of what changed.
  const changed: string[] = [];
  if (changes.defaultProvider) {
    changed.push(
      `defaultProvider: ${changes.defaultProvider.before ?? "(unset)"} → ${changes.defaultProvider.after}`,
    );
  }
  if (changes.defaultModel) {
    changed.push(
      `defaultModel: ${changes.defaultModel.before ?? "(unset)"} → ${changes.defaultModel.after}`,
    );
  }
  if (changes.defaultThinkingLevel) {
    changed.push(
      `defaultThinkingLevel: ${changes.defaultThinkingLevel.before ?? "(unset)"} → ${changes.defaultThinkingLevel.after}`,
    );
  }
  if (changes.packagesAdded > 0) {
    changed.push(`packages added: ${changes.packagesAdded}`);
  }

  return {
    ok: true,
    profileName: profile.name,
    path: report.path,
    changes,
    message:
      changed.length === 0
        ? `profile "${profile.name}" already matches pi's settings (no changes)`
        : `applied profile "${profile.name}" to pi: ${changed.join("; ")}`,
  };
}
