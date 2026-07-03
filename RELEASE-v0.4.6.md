# v0.4.6 — Init + Production Mode + One-shot Release

**v0.4.6 turns Pilot from "a tool I use" into "a tool I can hand to
someone else".** Three concrete additions:

1. **`pilot init`** — first-run welcome wizard. Detects environment,
   creates `~/.pilot/`, runs doctor, prints a curated next-steps
   cheatsheet. Idempotent (safe to run any number of times).
2. **`pilot dashboard --prod`** — production-mode Web UI. Skips
   Turbopack/HMR, runs `next build && next start`. Starts in ~60ms
   (vs ~250ms for dev mode), no source maps, no hot reload.
3. **`scripts/release.sh`** — one-shot release workflow.
   Bumps version, runs offline tests, formats, builds, commits,
   pushes, tags, and creates the GitHub release — all in one
   command.

## What's new

### `pilot init` — first-run setup
```
$ pilot init

Pilot Setup

  ✓ Node 26.3.0
  ✓ pi on PATH
  ✓ fd installed

  ✓ Created home: /Users/feng/.pilot

  Doctor
    ✓ All checks passed.

Next steps
  → Try the policy demo: pilot policy new demo && pilot policy apply demo && pilot policy show demo
  → Run pilot --help to see all commands
```

What it does:
1. Verify Node ≥ 20
2. Probe `pi` on PATH (warn if missing — install instructions included)
3. Probe `fd` (recommended for fast file scanning)
4. Create `~/.pilot/` if it doesn't exist (idempotent — never destroys data)
5. Create the 4 subdirs Pilot needs: `extensions/`, `policy/`,
   `profiles/`, `capabilities/`
6. Run doctor and report status
7. Print a cheatsheet that's *tailored to what's missing*

Flags:
- `--start` — also spawn the server in the background and report its token
- `--no-open` — don't print the "open browser" hint
- `--json` — machine-readable output for scripts / CI

### `pilot dashboard --prod` — production mode
- Skips `next dev`, runs `next build` (first time only, cached via
  `web/.next/BUILD_ID`) then `next start`
- ~60ms cold start (vs ~250ms for dev mode with Turbopack)
- No source maps, no hot reload — what you'd deploy
- All the same flags as dev mode: `--port`, `--no-open`, `--no-server`,
  `--no-build` (skip build if `.next/` is current)

Why it's not the default: dev mode is faster for **iterating** on
Web UI changes (HMR). Production mode is what you want for
**sharing** the dashboard with someone else, or for `cron` /
systemd / Tailscale Serve deployments.

### `scripts/release.sh` — one-shot release
The v0.4.0 release-please 0-job bug has been a papercut for every
release since. `release.sh` bakes the manual workaround into a
single deterministic command so I (and contributors) don't have
to remember the steps:

```bash
./scripts/release.sh 0.4.6            # bump to specific version
./scripts/release.sh patch            # bump 0.4.5 → 0.4.6
./scripts/release.sh --dry-run 0.4.6 # show what would happen, change nothing
```

It runs, in order:
1. Pre-flight: clean tree, on main, `GH_TOKEN` set
2. `npm run test:offline` (the same CI command)
3. `npx tsc --noEmit`
4. Format both `src/` and `web/`
5. Bump `version` in core + web `package.json`
6. Build core (`tsc`) + web (`next build`)
7. Commit version bump
8. Push main
9. Create annotated tag `vX.Y.Z`
10. Push tag
11. Create GitHub release from `RELEASE-vX.Y.Z.md` (uses `gh` CLI
    if installed, falls back to curl + `GH_TOKEN`)
12. `npm publish` if `NPM_TOKEN` is set (skip silently otherwise)

The script is safe — refuses to run with uncommitted changes,
refuses to run on a non-`main` branch, refuses to run without
`GH_TOKEN`. `--dry-run` prints every step but executes nothing
destructive.

### Standalone Next.js build (env-gated)
`web/next.config.ts` now supports `output: 'standalone'` when
`NEXT_OUTPUT_STANDALONE=1` is set. Build produces a self-contained
`web/.next/standalone/web/` directory with only what's needed to
run in production:

```bash
NEXT_OUTPUT_STANDALONE=1 npm run build --prefix web
cp -r web/.next/static web/.next/standalone/web/.next/static
PORT=17371 PILOT_SERVER_URL=http://127.0.0.1:17361 \
  node web/.next/standalone/web/server.js
```

The standalone build is ~10× smaller than shipping the full
project tree and is what gets used in Docker images.

### New `utils/net.ts`
Tiny TCP-port-probe helper used by `pilot init --start` to decide
whether something is already listening on 17361. Pure
`node:net`, no deps. Tested.

### Test gating for network calls
4 tests in `test/unit/server.test.ts` and `test/unit/commands.test.ts`
that hit the live npm registry are now prefixed `[network]` and
honor `PILOT_SKIP_NETWORK=1`. Default `npm test` skips them
(sandbox / CI without outbound), local dev can run them for
real validation.

## Numbers

- **270 / 270** core tests pass (was 260; +10 init + net tests)
- **22 / 22** web vitest (no change)
- **23 / 23** server tests
- **TypeScript strict 0 errors**
- CLI commands: **14** (was 13; +init)
- New files:
  - `src/commands/init.ts` (~270 lines)
  - `src/utils/net.ts` (50 lines)
  - `scripts/release.sh` (~180 lines)
  - `test/unit/init.test.ts` (6 tests)
  - `test/unit/net.test.ts` (4 tests)
- Modified files:
  - `src/cli.ts` — register initCmd
  - `src/commands/dashboard.ts` — `--prod`, `--no-build`
  - `web/next.config.ts` — env-gated `output: 'standalone'`
  - `package.json` — `test:offline` script
  - `README.md` — new "30 秒上手" + "给别人用" sections

## Honest assessment

**Pilot v0.4.6 is genuinely ready for a friend.** The three things
that blocked "share with someone" — first-run onboarding,
production-mode web, repeatable release — are now solved:

- New user runs `npm install -g pilot && pilot init && pilot dashboard`
- If they want production-ish: `pilot dashboard --prod`
- If I want to ship: `./scripts/release.sh 0.4.7`

What's still not done (deferred, not blockers):
- Web UI editor for policy (only CLI for now)
- True connection lines between blocks in `/compose`
- npm publish automation (still needs `NPM_TOKEN`)

## Try it

```bash
# pull latest
cd /path/to/pilot
git pull

# build + run
npm run build --prefix web
npm run build
node dist/cli.js init              # see the banner
node dist/cli.js dashboard --prod --no-build --no-open --port 17372  # see production mode
```