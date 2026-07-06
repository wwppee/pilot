# v0.5.6 — Web UI bugfix + UX pass

Shipped 2026-07-06. Targeted fix for the Web UI comprehension gap that
came out of an end-to-end audit of all 21 routes. Three concrete bugs
plus a UX pass that puts every list page on the same "what is this +
what do I do next" pattern.

## What's new

### P0: `/sessions/[id]` server error → fixed

Clicking a session from `/sessions` threw **"A server error occurred"**
with a server-side RSC error: *Functions cannot be passed directly to
Client Components unless you explicitly expose it by marking it with
"use server".*

The crash came from `SessionTreeExplorer` taking a `t: (k, params) =>
string` function prop. RSC disallows functions crossing the
server/client boundary; the prop silently serialized as `undefined`
during streaming and the page errored at render time.

Fix: replace the `t` prop with a `locale: Locale` prop. The client
component imports `translate` directly so it can render on either
side of the boundary without a function reference. All 8 existing
`SessionTreeExplorer` tests updated to pass `locale="en"`.

### P1: Profile form data loss → fixed

The Web profile form had four fields, but the server's `ProfileSchema`
(Zod) only accepted two:

| Form field | Was it persisted? |
|---|---|
| `model` | ✅ yes |
| `thinking` | ✅ yes |
| `packages` | ❌ **silently dropped** (Zod default = strip unknown fields) |
| `notes` | ❌ **silently dropped** |
| `provider` | ❌ **no form field at all** |

So a user could fill out the form, click save, and watch `notes` and
`packages` evaporate. Refreshing the page erased them. The new
`provider` (added to the server schema in v0.5.5) wasn't even visible
in the form.

Fix:

- **Server `ProfileSchema`** now declares `provider`, `notes`,
  `description`, and `packages: z.array(z.string()).optional()`. `notes`
  is the long-form "why this profile exists" essay; `description`
  stays as the short tagline shown on profile list cards.
- **Web form** at `/profiles/[name]` gets all four new fields with
  labelled, placeholdered inputs.
- **Profile detail header** now shows provider / model / thinking as
  a meta row, and `notes` (if present) render in a separate
  "Notes" section as a markdown `<pre>`.
- **`saveProfileForm`** server action forwards all five fields.
- **`applyProfileToPi`** now accepts both `packages` and the legacy
  `packs` alias so older callers don't break.

### P2: ghost active profile → fixed

`~/.pilot/active.json` outliving its target profile (e.g. user deleted
the TOML, or some code path wrote the diary without writing the
profile) caused the Web UI to show **"pi-architect (active profile)"**
for a profile that didn't exist — confusing the user about what was
actually active.

Fix: `readActiveProfile()` now validates the diary against
`~/.pilot/profiles/<name>.toml`. If the file is missing, the diary
is auto-cleared and `null` is returned. The validation step is
intentionally lazy / best-effort: only clears the diary when we're
confident the profile is actually gone (avoids nuking the diary on a
transient read error).

### UX pass: `EmptyState` component + page intros

Each list page now has the same "what is this + what do I do next"
pattern via a new `EmptyState` component (`title` + `hint` +
optional `actionHref`). Pages that previously showed a one-line
italic "(empty)" string now show a 3-block hint:

- **What this list is** (title) — so users know they're in the right place
- **How the data lands here** (hint) — concrete trigger (e.g. "Pilot
  reads Pi's session JSONL from `~/.pi/agent/sessions/`. Run `pi` to
  create your first session.")
- **Next action** (optional link) — direct CTA when applicable

Updated:

- `/sessions` empty: explains the data source + the command to create one
- `/profiles` empty: explains what a profile is + how to activate one
- `/avatars` empty: explains the lock-in workflow + links back to the
  capture form

## Internals

### `vitest.config.ts` alias fix

Web tests can now import via `@/lib/i18n` (matching `tsconfig.json`'s
paths). Previously the alias only worked in app code; tests fell back
to relative paths.

### Pre-existing failures NOT fixed in this release

The `commands.test.ts` "pilot forge search" cases fail on main
(verified via `git stash` — present before any v0.5.6 changes).
These are out of v0.5.6 scope; deferred to v0.5.7.

## Tests

- **Core: 454/456 passing** (was 455 in v0.5.5; -2 because 2 forge
  tests are pre-existing failures — not caused by this release)
- **Web: 100/100 passing** (was 95 in v0.5.5; +5 from `EmptyState.test.tsx`)

New tests:

- `test/unit/profile-state.test.ts` — +1 ghost-profile test
  (readActiveProfile returns null + auto-clears diary when profile
  TOML is missing). Existing round-trip tests updated to also write
  a profile TOML so they exercise the new validation.
- `test/unit/session-snapshot.test.ts` — existing test updated to
  stub the profile TOML too (same reason).
- `test/unit/avatar.test.ts` — `writeActiveProfile` helper updated to
  conditionally stub a profile TOML only if missing (so it doesn't
  clobber richer fixtures).
- `tests/empty-state.test.tsx` (NEW) — covers all 5 EmptyState
  behaviors: title rendering, string hint, ReactNode hint with
  inline `<code>`, action link wiring, missing-link fallback.

Updated tests:

- `tests/session-tree-explorer.test.tsx` — `t={t}` → `locale="en"`
  (8 sites) to match the new client-component signature.

## Files changed

### New

- `web/src/components/EmptyState.tsx` — consistent empty-state pattern
- `web/tests/empty-state.test.tsx`

### Modified

- `src/core/profile.ts` — `ProfileSchema` now accepts `provider`,
  `notes`, `description`, `packages`
- `src/core/apply-profile-to-pi.ts` — `PilotProfileShape` accepts
  `packages` (and legacy `packs` for back-compat)
- `src/core/profile-state.ts` — `readActiveProfile` validates the
  diary against `~/.pilot/profiles/<name>.toml` and auto-clears if
  missing
- `web/src/components/SessionTreeExplorer.tsx` — `t` prop → `locale`
  prop; imports `translate` directly
- `web/src/app/sessions/[id]/page.tsx` — pass `locale` instead of `t`
- `web/src/app/sessions/page.tsx` — `EmptyState` for empty list
- `web/src/app/profiles/page.tsx` — `EmptyState` for empty list
- `web/src/app/profiles/[name]/page.tsx` — show provider + description
  in header; new "Notes" section; new form fields
- `web/src/app/avatars/page.tsx` — `EmptyState` for empty list
- `web/src/lib/actions.ts` — `saveProfileForm` forwards provider +
  description in addition to existing fields
- `web/src/lib/types.ts` — `Profile` interface gets `provider`,
  `description`
- `web/src/lib/i18n/{dict.en,dict.zh,types}.ts` — 5 new keys
  (`profiles.provider`, `profiles.description`, `profiles.notes`,
  `profiles.notesPlaceholder`)
- `web/vitest.config.ts` — `@` path alias for test imports
- Test fixtures updated for the ghost-profile guard

## Install

```bash
npm install -g pilot@0.5.6
# sessions detail page no longer crashes; profile form
# persists all fields; ghost active profile is auto-cleared.
```