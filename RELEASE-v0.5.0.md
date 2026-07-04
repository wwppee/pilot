# v0.5.0 — Avatars: project-level expected config + diff

Released 2026-07-05. Tag: `v0.5.0`. Commit: 3569d2a.

## Highlights

### Avatars — project-level expected config

A new **Avatar** is the user's "what this project should look like" snapshot. Persisted at `~/.pilot/avatars/<encodedCwd>.json`, one per project cwd. Diff against the current Pilot state shows where the project has drifted.

**Shape:**
```ts
interface Avatar {
  encodedCwd: string;       // pi's base64 encoding of the absolute path
  capturedAt: string;       // ISO timestamp of last write
  profile?: string;         // expected active profile name
  model?: string;           // expected model (denormalized from active profile TOML)
  packSources: string[];    // e.g. ["npm:foo", "npm:bar"]
  extensions: string[];     // expected generated policy extensions
}
```

**Diff statuses (per field):**
- `match` — current matches the Avatar
- `missing` — Avatar wants X, current doesn't have it (needs fixing)
- `extra` — current has X, Avatar doesn't mention it (informational only)
- `drift` — sets disagree on both sides

`clean = true` means nothing needs attention.

### Web UI

- **`/avatars`** — grid + capture form
- **`/avatars/[cwd]`** — diff view with status-colored left borders (green/amber/red/accent)
- Nav: Avatars in Inspect group (12 items total)

### Server surface

- `GET /avatars` · `GET /avatars/current` · `GET /avatars/:cwd` · `GET /avatars/:cwd/diff`
- `POST /avatars/:cwd/capture` · `DELETE /avatars/:cwd`

## Honest caveats

1. **Thinking level omitted** — pi v3 JSONL doesn't record it. Revisit when extension-trace hook lands.
2. **No "apply" yet** — capture/diff/delete wired; "apply Avatar" (re-activate profile, install packs) deferred until we have the L2 wrapping machinery.
3. **Snapshot vs Avatar distinction.** Snapshot = "what was running" (per session, derived from JSONL). Avatar = "what should be running" (per project, captured by user).

## Files added

- `src/core/avatar.ts` — Avatar shape + read/write/delete/list + capture + diff (~280 lines)
- `test/unit/avatar.test.ts` — 18 tests
- `web/src/app/avatars/page.tsx` — list + capture form
- `web/src/app/avatars/[cwd]/page.tsx` — diff view
- `CLAUDE.md` — Chinese-first output rule for future AI agents

## Files modified

- `src/core/service.ts` + `src/core/service-impl.ts` — 6 new service methods
- `src/server/server.ts` — 6 avatar routes
- `test/unit/server.test.ts` — 6 server tests (consolidated into one lifecycle test)
- `web/src/lib/{pilot,pilot-browser,types}.ts` — API surface
- `web/src/lib/actions.ts` — `captureAvatarForm` + `deleteAvatarForm`
- `web/src/components/NavLinks.tsx` — Avatars in Inspect group
- `web/src/lib/i18n/{dict.en,dict.zh,types}.ts` — 24 new keys

## Tests

- **352/352 core** (was 329; +23)
- **87/87 web** (unchanged; nav test updated)

## What's next (v0.5.1+)

- Capability diff — compare two absorbed capabilities
- Replay mode — re-run a session tree against a different model
- Forge L2 eval — run `evals.yaml` against installed capabilities
- "Apply Avatar" — write the Avatar's expected config back