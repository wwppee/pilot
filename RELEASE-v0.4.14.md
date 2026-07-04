# v0.4.14 — Forge Web + nav grouping + install feedback

Released 2026-07-05. Tag: `v0.4.14`. Commits: 1 (654b309).

## Highlights

### 1. Forge Web entrypoint (`/forge`)

CLI parity for `pilot forge search|inspect|absorb`, now in the browser:

- **`/forge`** — search npm, results in a grid (kind chip + version + description)
- **`/forge/[name]`** — inspect the parsed `pi` manifest (kind, skills, themes, prompts, commands, keybindings, extension entry) + "Absorb as Capability" form with optional id override
- On success → `/capabilities/[id]?absorbed=1`; on failure (404 / 400 / 422) → i18n'd error banner with code

Implementation: lifted forge logic from `commands/forge.ts` into shared `core/forge.ts` (forgeSearch, forgeInspect, forgeAbsorb, buildCapability, mapKindToType, deriveCapabilityId, isValidCapabilityId). CLI is now a thin wrapper; both surfaces call the same code through `PilotService`. New `ForgeAbsorbError` class with `code` field maps to HTTP status.

### 2. Install feedback (`/packages/[name]`)

Install/uninstall banners now:
- Use i18n keys (`packages.installedToast` / `uninstalledToast`)
- Carry `role="status"` + `aria-live="polite"` for screen-reader announcement
- Show a left accent border for visual scanability
- Include a "View installed packs →" link in the install banner

Error banner also i18n'd with `packages.installError` / `packages.fetchError`. No auto-redirect — explicit navigation feels less surprising (banner + link is the chosen UX).

### 3. Nav grouping (`<NavLinks>`)

Flat 11-item nav restructured into two semantic groups:

- **Inspect** (read-only): Dashboard / Sessions / Usage / Tools / Context / Capabilities
- **Manage** (actions): Packages / Forge / Policy / Compose / Profiles

Each group: `role="group"` + `aria-label` + sr-only label for AT users + small-caps visible label on `≥ sm`. Active link gets `aria-current="page"` + accent color + 600 weight. Visual `•` separator between groups on wide screens.

Active detection: `/` matches only exact `/`; nested paths like `/sessions/abc-123` match their prefix.

## Files added

- `src/core/forge.ts` — shared forge helpers + `ForgeAbsorbError`
- `test/unit/forge.test.ts` — 23 tests
- `web/src/app/forge/page.tsx` — search page
- `web/src/app/forge/[name]/page.tsx` — inspect + absorb page
- `web/tests/nav-links.test.tsx` — 9 RTL tests

## Files modified

- `src/commands/forge.ts` — now thin wrapper around `core/forge.ts`
- `src/core/service.ts` + `src/core/service-impl.ts` — added `forgeSearch` / `forgeInspect` / `forgeAbsorb`
- `src/server/server.ts` — 3 new forge routes
- `web/src/lib/actions.ts` — `forgeAbsorbForm` server action
- `web/src/app/packages/[name]/page.tsx` — i18n'd banners + a11y
- `web/src/components/NavLinks.tsx` — `NAV_KEYS` → `NAV_GROUPS`
- `web/src/lib/{pilot,pilot-browser,types}.ts` — forge API surface
- `web/src/lib/i18n/{dict.en,dict.zh,types}.ts` — 27 new keys

## Tests

- **329/329 core** (was 303; +26: 23 forge unit + 3 forge server routes)
- **87/87 web** (was 78; +9 nav-links RTL)

## Caveats

1. **Forge Web shares the npm rate limit with the CLI.** Each search/inspect hits the registry directly; rapid browsing could trip rate-limiting. No per-query cache (only `readPackManifestCached` per-package).
2. **No auto-redirect after install.** Banner includes a "View installed packs →" link, but the page itself doesn't move. 5-line change if users prefer the redirect.

## What's next (v0.5.0 plan)

- Avatars — base profile diff per project (depends on v0.4.13 snapshot)
- Capability diff — compare two absorbed capabilities
- Replay mode — re-run a session tree against a different model
- Forge L2 eval — run `evals.yaml` against installed capabilities