# v0.4.12 — Closing the CRUD gaps

**v0.4.12 is the user-journey completion release.** A deep audit
of how Pilot actually gets used (not what features exist — what
people *do* day-to-day) identified four P0/P1 gaps that made the
"管了但不能用" (managed-but-not-usable) pattern. v0.4.12 closes
all of them.

The audit found that:

1. **Profile 配置完了不能用** — no way to mark a profile as "the
   one pi will use on next session" (had to set `PI_PROFILE` env
   var by hand).
2. **包安装完了不能卸** — `installPack` existed, `uninstallPack`
   didn't. Either CLI or Web UI. The only way to remove a pack
   was `rm -rf ~/.pi/agent/extensions/<name>` by hand.
3. **Web UI 不能创建 policy** — list and edit existed; create was
   CLI-only.
4. **Dashboard 空状态没引导** — fresh-install users saw 0/0/0/0
   with no hint where to start.

Each gap shipped in its own commit, fully tested. Plus Dashboard
empty-state quick-start to make sure users actually find the
newly-available actions.

## What's in v0.4.12

### #3 — Profile activation (the biggest gap)

`~/.pilot/active.json` — a small JSON pointer separate from the
profile TOML — records "the user's currently active profile."

```json
{
  "name": "pi-architect",
  "activatedAt": "2026-07-04T21:10:00Z",
  "source": "web"
}
```

- **Core**: read / write / clear, atomic write (tmp + rename),
  mkdir-recursive on first write (works even without `pilot init`).
- **Server**: `GET /profiles/active`, `POST /profiles/:name/activate`,
  `DELETE /profiles/active`. The activate endpoint refuses to set a
  pointer to a profile whose TOML doesn't exist (no silent ghost
  profiles).
- **CLI**: `pilot profile use <name>`, `pilot profile unset`,
  `pilot profile current`. `pilot profile ls` now highlights the
  active one with a green star and adds an "active" tag.
- **Web UI**:
  - `<ActiveProfileBadge>` in the header (server component) — green
    pill with the active profile name, click jumps to /profiles.
  - `<ActivateProfileButton>` on every profile card — either shows
    the green "Active ✓" badge (no action) or an "Activate" button
    that POSTs and reloads the page.
  - /profiles page has an active-profile banner at the top with the
    active profile name + source + activation timestamp.

### #7 — Pack uninstall (CRUD completion)

- `PilotService.uninstallPack(name)` — gates on whether the pack
  is installed (clear error on typo), then delegates to `pi uninstall`.
- `POST /packs/uninstall` server route — body shape `{ name }`.
- `pilot pack uninstall <name>` CLI subcommand.
- `/packages/[name]` page: new Uninstall section below Install
  (separated by a border, only shown when the pack is enabled),
  uses the new `<UninstallButton>` client island with a confirm
  dialog and `useFormStatus`-driven pending state.

### #9 — Create policy from the Web UI

- New `<NewPolicyCard>` section on /policy with kebab-case name
  input + 3 starter templates:
  - **safe-bash** (default): block destructive shell patterns,
    require approval for risky tools.
  - **readonly**: deny every tool that mutates (bash/write/edit).
  - **empty**: blank starter.
- Server action `createPolicyForm` → `setPolicy(name, template)`
  → redirect to `/policy/<name>/edit?created=1` so users land
  ready to refine.
- Browser-side pattern validation (kebab-case) before hitting
  the server.

### #20 — Dashboard empty-state quick-start

When the dashboard would render four near-empty sections (0 sessions,
0 packs, 0 profiles, 0 capabilities), show a 3-card welcome grid:

1. **Create a profile** → /profiles
2. **Install a pack** → /packages
3. **Create a policy** → /policy

Cards have a subtle gradient + accent left border so the empty
state stands out without being noisy. Auto-hide as soon as the
user has any data anywhere.

## Architecture notes

- **`~/.pilot/active.json` is intentionally separate** from
  `~/.pilot/profiles/<name>.toml`. The TOML is the profile
  definition; active.json is session state ("which one is in
  effect right now"). Pi never reads active.json.
- **`PilotService.activateProfile` refuses ghost profiles**: if
  the user passes a name whose TOML doesn't exist, the service
  throws (no silent pointer to a non-existent definition). This
  prevents the worst drift bug — "pi is using a profile that
  doesn't exist anymore."
- **Server actions use `pilotWithCsrf`** (the CSRF-aware fetch
  helper), not the bare `api` client — so form submissions carry
  the auth token + CSRF cookie/header pair.
- **Atomic file writes** (tmp + rename) for `active.json` so a
  crash mid-write can't leave a half-written file.
- **i18n-first** — every new user-visible string has a key in both
  en + zh dicts; the 20-test i18n suite catches missing keys.

## Verification

- core tsc --noEmit: 0 errors
- core vitest: 281/281 pass (was 270; +11 new profile-state tests)
- web tsc --noEmit: 0 errors
- web vitest: 70/70 pass
- web build: clean (Turbopack)
- TypeScript strict 0 errors across the whole repo

## Files changed

**Core**:
- `src/core/profile-state.ts` (new)
- `src/core/service.ts` — interface additions
- `src/core/service-impl.ts` — implementations
- `src/server/server.ts` — 3 new routes (profiles/active, activate, uninstall)
- `src/commands/profile.ts` — use/unset/current + active highlighting
- `src/commands/pack.ts` — uninstall subcommand
- `test/unit/profile-state.test.ts` (new)

**Web**:
- `web/src/components/ActiveProfileBadge.tsx` (new)
- `web/src/components/ActivateProfileButton.tsx` (new)
- `web/src/components/UninstallButton.tsx` (new)
- `web/src/lib/actions.ts` — uninstallPack, setPolicy, createPolicyForm
- `web/src/lib/pilot.ts` + `pilot-browser.ts` — API surface
- `web/src/lib/types.ts` — ActiveProfile type
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` — 22 new keys
- `web/src/app/layout.tsx` — header badge
- `web/src/app/profiles/page.tsx` — active banner + Activate button
- `web/src/app/profiles/[name]/page.tsx` — delete-confirm i18n
- `web/src/app/packages/[name]/page.tsx` — Uninstall section
- `web/src/app/policy/page.tsx` — NewPolicyCard + 3 templates
- `web/src/app/page.tsx` — EmptyState detection + 3-card quick-start