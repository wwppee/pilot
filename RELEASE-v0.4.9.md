# v0.4.9 — Typecheck hotfix + docs sync

**v0.4.9 is the v0.4.8 hotfix.** v0.4.8 shipped with 12 TypeScript
errors that `next build` silently skipped ("Skipping validation of
types"). This release fixes them all and adds a `web tsc --noEmit`
gate to `release.sh` so future releases can't bypass typecheck again.

Also in this release: the docs are finally in sync with reality.
The roadmap now correctly reflects that v0.4.0 → v0.4.8 have all
shipped (the docs were 3 versions behind), and the long-deprecated
`docs/roadmap-v1.0.md` is physically archived to `docs/retired/`.

## What's in v0.4.9

### Typecheck fixes (12 errors)

#### JSX namespace — 9 errors (React 19 removes global `JSX`)

| File | Lines |
|---|---|
| `web/src/app/compose/ComposeBoard.tsx` | 144, 659, 724 |
| `web/src/app/compose/page.tsx` | 41 |
| `web/src/app/policy/page.tsx` | 66, 85, 191 |
| `web/src/app/policy/[name]/edit/PolicyForm.tsx` | 91 |
| `web/src/app/policy/[name]/edit/page.tsx` | 54 |

**Fix**: drop the `: JSX.Element` / `: Promise<JSX.Element>` return
type annotation, let TypeScript infer. In React 19 the `JSX`
namespace is no longer global; explicit return-type annotations must
use `import type { JSX } from "react"` or be removed entirely.

```diff
-export default function ComposePage(): Promise<JSX.Element> {
+export default function ComposePage() {
```

> **Author note** (from user review): this is the **third
> consecutive release** to have the same JSX.Element annotation
> issue (v0.4.2 policy, v0.4.3 policy, v0.4.4 compose). All
> occurrences have now been cleaned up. If you're adding new
> React component files, do **not** write explicit JSX return
> type annotations — let TypeScript infer.

#### Other typecheck — 3 errors

| File | Error | Fix |
|---|---|---|
| `web/src/app/api/pilot/[...path]/route.ts:101` | `exactOptionalPropertyTypes` forbids `body: undefined` | Build `fetchInit` conditionally, only include `body` key when non-null |
| `web/src/app/policy/[name]/edit/PolicyForm.tsx:127` | `ToolPolicyInput.description` type mismatch | Make description explicit `string \| undefined` in `web/src/lib/types.ts` to match zod schema (`z.string().optional()`) |
| `web/src/app/policy/page.tsx:10` | Unused `PolicyDecision` import | Removed |

### `release.sh` — web tsc gate added

```diff
 # ─── TypeScript ─────────────────────────────────────────────
 step "TypeScript check (core)"
 run npx tsc --noEmit
+step "TypeScript check (web)"
+(cd web && run npx tsc --noEmit)
```

This catches the kind of silent regression v0.4.8 shipped with.
Future releases will fail at the preflight step if either core
or web has TypeScript errors.

### Docs sync (4 files)

The roadmap was 3 versions behind reality. v0.4.0 → v0.4.8 had all
shipped but were described as "planned" or "next" in three files.

#### `docs/roadmap.md` — restructured

- Marked v0.1, v0.2 → v0.3.x as **已发** (shipped)
- Restructured v0.4.x into shipped (0.4.0 → 0.4.8) + planned
  (0.4.9 → v1.0)
- Added **"v0.4.x real path"** table comparing what the original
  v3 plan said vs what actually shipped, with the reason for
  each adjustment
- Added **"doc hierarchy"** section linking roadmap-pi-grounded
  as the live v0.4.x source of truth

#### `docs/roadmap-pi-grounded.md` — brought current

This was the original "real" v0.4.x roadmap, but it had only
been kept up-to-date through v0.4.2. Updated:

- 11-toggle table now shows actual shipped status per item
  (5 shipped, 4 planned, 2 deferred)
- "Pilot 已经有的事实" section updated to **2026-07-04 layout**
  (17 core files, 14 CLI commands, 18 web routes)
- New **section 五**: v0.4.2 → v0.4.8 real path with key files
- New **section 六**: v0.4.9 candidates (npm publish auto /
  browser profile edit / block-to-block SVG arrows) — awaiting
  user pick
- New **section 七**: v0.5 → v1.0 condensed plan

#### `docs/roadmap-v1.0.md` → `docs/retired/`

This file was already marked deprecated by
[`docs/v0.4.2-dev-plan.md`](./docs/v0.4.2-dev-plan.md)
(2026-07), but was never physically moved. v0.4.9 finally
archives it to `docs/retired/roadmap-v1.0.md` with a prominent
deprecation banner. The v3 macro spec it described (6-stage
pipeline / Hermes scratch_pad / Tool Selector stage) was based
on assumptions that don't exist in Pi's real data — see
[`docs/retired/macro-spec-audit.md`](./docs/retired/macro-spec-audit.md).

#### `PILOT.md` — added doc pointer

Added `roadmap-pi-grounded.md` to the doc structure table as the
live v0.4.x roadmap source of truth.

## Verification

- ✅ `web tsc --noEmit` — 0 errors
- ✅ `web build` — clean (Turbopack)
- ✅ `web vitest` — 49/49 pass (incl. 23 axe-core a11y tests)
- ✅ `core vitest` — 270/270 pass
- ✅ `release.sh` preflight now includes `web tsc --noEmit`

## Files changed

```
PILOT.md
docs/roadmap.md
docs/roadmap-pi-grounded.md
docs/retired/roadmap-v1.0.md   (renamed from docs/roadmap-v1.0.md)
scripts/release.sh
web/src/app/api/pilot/[...path]/route.ts
web/src/app/compose/ComposeBoard.tsx
web/src/app/compose/page.tsx
web/src/app/policy/[name]/edit/PolicyForm.tsx
web/src/app/policy/[name]/edit/page.tsx
web/src/app/policy/page.tsx
web/src/lib/types.ts
```

## Why this matters

v0.4.8 release had **12 TypeScript errors that I missed** because:

1. `release.sh` only ran `tsc --noEmit` on `core/`, not `web/`
2. `next build` has a "Skipping validation of types" mode that
   passes even with errors

This is a real bug, not just lint. In strict mode with
`exactOptionalPropertyTypes`, the `body: undefined` error in
the pilot proxy would cause **runtime fetch to fail** on GET
requests. It happened to work because the body branch was never
taken on GET, but it's a latent bug that v0.4.9 closes.

User review caught this. v0.4.9 is the result.