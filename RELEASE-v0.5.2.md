# v0.5.2 — Avatar apply

Released 2026-07-05. Tag: `v0.5.2`. Commit: 7c6ad8f.

## Highlights

### Avatar apply — bring current state into alignment

Closes the loop on Avatars introduced in v0.5.0. `capture` records what the user wanted; `apply` makes it real. The `diff` page still answers "how far off are we?" — now it also has a button that says "make it so".

### What apply does

- Every `packSource` missing from current state → `pi install <source>`. Failures captured per-pack — one bad install doesn't block the rest.
- If `Avatar.profile` differs from current active → `activateProfile`. Skip when already active.
- **Deliberately does NOT touch `extensions`.** Regenerating a policy file is an explicit choice (`pilot policy apply`), not a side effect of "set up the project".

### Report shape

```ts
{
  encodedCwd: string,
  steps: [
    { action: "install-pack", target: "npm:foo", status: "ok" },
    { action: "activate-profile", target: "pi-architect", status: "ok", message: "previously active: pi-quick" },
    { action: "none", target: "npm:bar", status: "skipped", message: "already installed" },
  ],
  installed: ["npm:foo"],
  activated: "pi-architect",
  skipped: ["profile already active: pi-architect"],
  failed: [],
}
```

### Server

- `POST /avatars/:cwd/apply` — 404 when no Avatar exists; otherwise returns the full report.

### Web

- `/avatars/[cwd]` Apply button below the diff fields (with inline `window.confirm`).
- ApplyReportBanner — 4 counters + expandable step list with per-step status colors.
- No-op case surfaces as "Nothing to do — current state already matches this Avatar".

## Files added / modified

- `src/core/avatar.ts` — `applyAvatar` + `AvatarApplyReport` + `AvatarApplyStep`
- `src/core/service.ts` + `src/core/service-impl.ts` — `applyAvatar`
- `src/server/server.ts` — `POST /avatars/:cwd/apply`
- `web/src/app/avatars/[cwd]/page.tsx` — Apply button + report banner
- `web/src/lib/actions.ts` — `applyAvatarForm` server action
- `web/src/lib/{pilot,pilot-browser,types}.ts` — `applyAvatar` API + types
- `web/src/lib/i18n/{dict.en,dict.zh,types}.ts` — 11 new keys

## Tests

- **397/397 core** (was 388; +9)
- **95/95 web** (unchanged)

## Honest caveats

1. **No rollback.** Apply is one-way; re-apply a different Avatar or `pilot profile use <name>` to undo.
2. **`pi install` runs synchronously.** Long installs could time out the server.
3. **No `--dry-run` flag** — apply is destructive. Diff page is the dry-run.

## What's next (v0.5.3+)

- Apply dry-run (`POST /avatars/:cwd/apply?dry=1`)
- Replay mode — re-run a session tree against a different model
- Forge L2 eval — run `evals.yaml` against installed capabilities