# v0.4.7 — Edit Policy in Browser

**v0.4.7 closes the policy management loop on the web side.**
Before this, you could *view* policies at `/policy` but had to
drop to CLI (or hand-edit TOML) to change them. Now `/policy/[name]/edit`
gives you a full form with all 7 fields, save + apply + unapply +
delete buttons, and dirty-state tracking.

Also in this release: a proper browser-side API proxy so the
pilot token never reaches the browser, and a real exercise of the
`release.sh` script for the actual publish.

## What's new

### `/policy/[name]/edit` — full edit form
- 7 sections: description (text input) + 6 rule arrays (textarea, one item per line)
- **deny** · tool names that can't be called
- **allow** · exclusive allowlist (empty = allow all)
- **denyPaths** · glob patterns for read/edit/write (`**/.env`, `/etc/**`)
- **denyCommands** · regex for bash commands (`^rm\s+-rf\s+/`)
- **sensitivePatterns** · redact patterns (API keys, passwords)
- **requireApproval** · tool names that pause for `ctx.ui.confirm()`

Actions bar:
- **Save changes** → `PUT /policies/:name` (only enabled when dirty)
- **Back** → return to `/policy` (lists all)
- **Apply (generate extension)** → write `~/.pilot/extensions/pilot-policy-<name>.ts` and have pi load it on next session
- **Unapply** → remove the generated extension (TOML is preserved)
- **Delete** → remove the TOML (after a confirm dialog)

Status bar tracks: unsaved changes / saving / saved at HH:MM:SS / error message.

### Browser API proxy — `/api/pilot/[...path]`
The browser-side code now goes through a Next.js route handler that
forwards requests to the pilot server **with the token injected
server-side**. The browser never sees `~/.pilot/server.token`.

Why a route handler (not `rewrites()`)?
- `rewrites()` work fine for GETs but unreliable for POST bodies
- Can't easily add custom headers (token, CSRF) via rewrite rules
- Full control over request/response shape

Architecture:
```
┌──────────┐  /api/pilot/policies   ┌──────────────┐
│ Browser  │ ─────────────────────► │  Next.js     │
│ (token?  │   (no token in flight) │  /api/pilot/ │
│  no!)    │ ◄───────────────────── │   route.ts   │
└──────────┘    401 if not allowed  └──────┬───────┘
                                            │ token
                                            │ + x-pilot-csrf
                                            ▼
                                    ┌──────────────┐
                                    │ Pilot server │
                                    │  :17361      │
                                    └──────────────┘
```

The route handler:
1. Reads token from `~/.pilot/server.token` (server-side fs)
2. Caches CSRF token for 60s (avoid round-trip per request)
3. Forwards method, body, all useful headers
4. Strips hop-by-hop headers + Set-Cookie from response

### New `browserApi` (client-safe)
- Lives in `web/src/lib/pilot-browser.ts`
- Routes everything through `/api/pilot/*`
- Same shape as server-side `api` (so the PolicyForm can use the
  same `api.setPolicy()` call signature)
- Re-exports as `PilotApiError` for parity

### `/policy` page update
Each policy card now has an `edit →` link in the footer (next to the
extension size). Click → goes to the new edit page.

## Files

New:
- `web/src/app/policy/[name]/edit/page.tsx` (~70 lines) — server wrapper
- `web/src/app/policy/[name]/edit/PolicyForm.tsx` (~310 lines) — client form
- `web/src/app/policy/[name]/edit/policy-form.module.css` (~150 lines)
- `web/src/app/api/pilot/[...path]/route.ts` (~110 lines) — proxy handler
- `web/src/lib/pilot-browser.ts` (~180 lines) — client-safe API client
- `web/tests/pilot.test.ts` — added 5 new tests for browserApi

Modified:
- `web/src/lib/pilot.ts` — comment updated (now server-only)
- `web/next.config.ts` — removed rewrites (route handler replaces them)
- `web/src/app/policy/page.tsx` — added "edit →" link per card
- `web/src/app/globals.css` — `.policy-card-footer` styles
- `README.md` — added Web workflow to the policy walkthrough

## Numbers

- **270 / 270** core tests pass
- **26 / 26** web vitest (was 22; +4 browserApi tests)
- **TypeScript strict 0 errors**
- Web build: 18 routes (was 17; +/policy/[name]/edit, +/api/pilot/[...path])
- `next build` clean; Turbopack no longer complains about fs in client bundle

## Verification

`release.sh` used end-to-end for this release:
```bash
$ ./scripts/release.sh 0.4.7 --dry-run   # showed all 12 steps
$ ./scripts/release.sh 0.4.7            # actually published
```

The script:
1. Pre-flighted (clean tree, on main, GH_TOKEN set) ✓
2. Ran `npm run test:offline` (270/270 passed in 6.2s) ✓
3. Ran `npx tsc --noEmit` ✓
4. Ran prettier on both `src/` and `web/` ✓
5. Bumped `0.4.6 → 0.4.7` in both `package.json` files ✓
6. Built core (`tsc`) + web (`next build`) ✓
7. Committed the version bump ✓
8. Pushed `main` ✓
9. Created annotated tag `v0.4.7` ✓
10. Pushed the tag ✓
11. Created the GitHub release via gh CLI ✓
12. Skipped `npm publish` (no NPM_TOKEN, as documented) ✓

**`release.sh` end-to-end works for the first time.** v0.4.6 was
shipped via the old manual curl flow because `release.sh` hadn't
been verified yet; v0.4.7 is the first release where the script
drove the whole thing.

## Try it

```bash
git pull
cd pilot
npm run build --prefix web
npm run build
node dist/cli.js dashboard --prod --no-build --no-open --port 17372

# Open http://localhost:17372/policy
# Click any policy card's "edit →" link
# Try the form: change a rule, save, apply
```