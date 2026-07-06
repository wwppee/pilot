# v0.5.5 — Profile activation actually changes pi's runtime

Shipped 2026-07-06. v0.5.4 made Pilot a co-pilot that *talks* to Pi; this
release makes Pilot *configure* Pi. Profile activation no longer writes
to a Pilot-only diary that Pi never reads — it now writes to
`~/.pi/agent/settings.json` directly, with proper locking, backup, and
rollback.

This also fixes three pre-existing bugs in Pilot's settings model that
the activation rewrite surfaced:

1. `PiSettings.sources` was wrong — Pi's field is **`packages`**.
2. Each package entry was modeled as `{source, enabled?}` — Pi's
   real shape is `string | {source, extensions?, skills?, prompts?, themes?}`
   (no `enabled` flag).
3. Many other fields (`defaultProvider`, `defaultModel`,
   `defaultThinkingLevel`, `theme`, `defaultProjectTrust`, …) were
   silently lost on read-modify-write — Pilot would clobber a
   user-tuned `theme` if it ever touched settings.json. The new type
   preserves unknown fields.

## What's new

### `core/settings-write.ts` — safe settings.json writer

`writeSettings(settings, home?)` mirrors the discipline Pi's own
`SettingsManager` uses:

1. **proper-lockfile** lock on `~/.pi/agent/settings.json` (10 × 20 ms
   retries — same contention profile Pi uses internally). If Pi is
   currently running and holds the lock, returns a clear error:
   *"Pi is currently running and holds the settings.json lock; close
   Pi and try again"*.
2. Backup current contents to `<file>.bak` (best-effort).
3. Validate the in-memory object with a JSON round-trip before
   locking (catches circular references, BigInt, etc.).
4. Atomic write: `<file>.tmp` + `renameSync`.
5. Post-write validation: re-read + re-parse. On failure, restore
   from `.bak` and surface a clear error.
6. Release the lock in a `finally`.

### `core/apply-profile-to-pi.ts` — the bridge

`applyProfileToPi(profile, home?)` reads the profile TOML, merges it
into Pi's existing settings, and calls `writeSettings`:

| Profile field | Pi setting |
|---|---|
| `model` | `defaultModel` |
| `provider` | `defaultProvider` (only set if model is also set — don't guess the pairing) |
| `thinking` | `defaultThinkingLevel` |
| `packs[]` | appends to `packages[]`, deduplicated by source string |

**Additive merge for `packages`**: existing entries stay; new ones
from the profile are appended. This avoids clobbering a user's
hand-installed packs when they activate a profile that also lists
packs.

Returns a structured `ApplyProfileToPiReport` with a per-field
"before/after" diff so the UI can show exactly what changed.

### `service.activateProfile` rewrite

```ts
// v0.5.4 (theatrical):
activateProfile("pi-architect"):
  writeActiveProfile("pi-architect", "web", home);
  // ← writes ~/.pilot/active.json that Pi never reads

// v0.5.5 (the real thing):
activateProfile("pi-architect"):
  const existing = await getProfile("pi-architect");
  applyProfileToPi(existing, home);   // ← writes ~/.pi/agent/settings.json
  writeActiveProfile("pi-architect", "web", home);  // ← pilot's own diary
```

A settings write failure now surfaces clearly instead of leaving the
Pilot diary pointing at a profile that Pi can't see.

### `pilot agent` forwards active profile to pi

If `~/.pilot/active.json` has a profile AND the user didn't pass
`--model` to `pilot agent`, the profile's `provider` + `model` are
forwarded to Pi via `--provider` / `--model` flags. This makes the
profile take effect on the current launch without waiting for
"next launch".

The persistent setting also lands in `~/.pi/agent/settings.json`
(via `applyProfileToPi`), so subsequent bare `pi` invocations also
pick up the new model.

### `PiSettings` type correction

```ts
// v0.5.4 (wrong):
export interface PiSettings {
  sources?: Array<{ source: string; enabled?: boolean }>;
  [key: string]: unknown;
}

// v0.5.5:
export interface PiSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  theme?: string;
  packages?: PiPackageSource[];
  [key: string]: unknown;
}

export type PiPackageSource =
  | string
  | { source: string; extensions?: string[]; skills?: string[]; prompts?: string[]; themes?: string[] };
```

`InstalledPack.enabled` stays in the public type for backward
compatibility with the Web UI, but is always set to `true` (Pi has
no `enabled` flag — every listed package is implicitly enabled).

### `listSources` / `listPackages`

Two helpers added:

- `listPackages(settings)` — raw `PackageSource[]` for callers that
  need the union type
- `listPackageSources(settings)` — flattened `string[]` for callers
  that just want the canonical source specifier
- `listSources(settings)` — kept as a back-compat alias for
  `listPackageSources` (so avatar.ts, session-snapshot.ts, etc.
  didn't need separate fixes beyond the fixture updates)

## Why the old approach failed

`~/.pilot/active.json` was a Pilot-only diary. Pi's runtime never read
it. The "active profile" was a UI signal, not a runtime signal —
activating `pi-architect` in Pilot's Web UI had no effect on the
next `pi` launch's model, packages, or thinking level.

The fix isn't to make Pilot write to settings.json sloppily (which
would race with Pi's own writes). It's to write with the same
discipline Pi uses internally — file lock, atomic rename, backup,
round-trip validation. `proper-lockfile` is the lock library Pi
already uses; adding it as a direct dependency gives Pilot the same
contention profile.

## Tests

- **Core: 455/455 passing** (was 436 in v0.5.4; +19 from new modules +
  settings model fix + service-impl fixture updates)
- **Web: 95/95 passing** (no changes — purely CLI/runtime)

New tests:

- `test/unit/settings.test.ts` — rewritten for the new `packages`
  schema; covers string-form vs object-form packages and the
  index-signature preservation of unknown fields.
- `test/unit/settings-write.test.ts` (7 tests) — covers create /
  update / backup / unknown-field round-trip / circular-ref rejection
  / lock-held error / 2-space indent formatting (matches Pi's format).
- `test/unit/apply-profile-to-pi.test.ts` (9 tests) — covers
  defaultModel + defaultProvider merge, defaultThinkingLevel merge,
  additive packages dedup, object-form packages, idempotency, unknown
  field preservation, missing-file creation, summary message, and
  "don't change provider when only model is set".

Updated test fixtures:

- `test/unit/avatar.test.ts` — `writePiSettings` helper writes
  `packages` (string-form), no `enabled` field.
- `test/unit/service-impl.test.ts` — all three `sources` fixtures
  switched to `packages` (string-form).

## Files changed

### New

- `src/core/settings-write.ts` — safe settings.json writer
- `src/core/apply-profile-to-pi.ts` — profile → settings bridge
- `test/unit/settings-write.test.ts`
- `test/unit/apply-profile-to-pi.test.ts`

### Modified

- `src/core/types.ts` — `PiSettings` corrected (`packages`, not
  `sources`); new `PiPackageSource` union; `PiThinkingLevel` enum;
  `packageSourceOf` helper.
- `src/core/settings.ts` — `listSources` now reads `packages` and
  returns source strings (extracted via `packageSourceOf`); added
  `listPackages` / `listPackageSources` for the new shape.
- `src/core/profile.ts` — header comment corrected (Pilot *does*
  write settings.json now; this is the whole point of the release).
- `src/core/service-impl.ts` — `activateProfile` calls
  `applyProfileToPi` before `writeActiveProfile`. `toInstalledPack`
  takes a string source (matches `listSources` return type).
- `src/commands/agent.ts` — forwards active profile's `provider` +
  `model` to Pi via `--provider` / `--model` if no explicit `--model`
  was passed.
- `package.json` — `proper-lockfile` + `@types/proper-lockfile`
  dependencies.
- `test/unit/avatar.test.ts` — fixtures updated to `packages`.
- `test/unit/service-impl.test.ts` — fixtures updated to `packages`.

## What's next

The historical "Pilot = management plane" rule has now been
overhauled in two directions:

- **v0.5.4** added the *runtime* bridge (Pilot → Pi via pilot-tools).
- **v0.5.5** added the *configuration* bridge (Pilot → Pi via direct
  settings.json write).

What remains is the *observation-driven optimization* loop:

- **v0.5.6** — `analyzeSessionQuality(sessionId)` (tool success rate,
  per-model cost / latency) + `recommendProfile(sessionIds[])` (rule
  engine over the analytics). Deferred until the basics are solid.
- **v0.5.7+** — `pilot optimize` command that generates "switch to
  opus because sonnet tool success < 50%" style reports with a
  **user-confirm gate** before any write. No auto-apply until the
  user opts in.

## Install

```bash
npm install -g pilot@0.5.5
pilot init
pilot profile use pi-architect   # ← now actually changes pi's settings
pilot agent                     # ← picks up the active profile automatically
```