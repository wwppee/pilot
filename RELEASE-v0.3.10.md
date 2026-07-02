# Pilot v0.3.10 — Web UI v1, Capabilities read-only, release process

A read + write local dashboard for [pi.dev](https://github.com/mariozechner/pi-coding-agent), the AI coding agent. Pilot is the management plane next to pi: it sees what pi is doing (sessions, packs, profiles, capabilities, stats) and lets you steer it (install packs, manage profiles) without leaving the terminal — or now, the browser.

This release closes the **v0.3 line** as a stable, release-ready package. It includes the first browser dashboard, full read+write Server Actions with CSRF protection, a read-only Capability surface, a clean CI matrix across macOS+Ubuntu × Node 20/22/24, and a working release-please workflow.

**Tag:** `v0.3.10` · **Released:** 2026-07-02 · **License:** MIT

---

## What's new

### 🛰 Web UI v1 (v0.3.5)

The first browser dashboard for Pilot, built on Next.js 16 + Tailwind CSS 4 + React 19. Server-rendered — your session data never leaves the box.

- **Dashboard** — today's sessions / messages / tool calls, top models and tools, recent sessions. Auto-refreshes every 10s.
- **Package Center** — installed packs + npm registry search; one-click detail with an install button.
- **Session Explorer** — session list + recursive tree view (user → assistant → tool → tool → ... → assistant).
- **Profile Manager** — list, create, edit, delete named profiles via web forms.
- **Capabilities (v0.3.9)** — list + detail for installed Capabilities (types, sources, conflicts, requires).

Same-origin proxy means the pilot auth token never reaches the browser. Open with:

```bash
pilot dashboard
```

This starts both the pilot server (127.0.0.1:17361) and the web UI (127.0.0.1:17371) in one process. Ctrl-C cleans up both.

### 🖱 Web write operations (v0.3.6)

Four Server Actions with full CSRF round-trip:

- `pilot pack install <name>` — via `<form>` on `/packages/[name]`
- `pilot profile create / set` — via `<form>` on `/profiles` and `/profiles/[name]`
- `pilot profile delete` — `<DeleteButton>` with browser confirm, revalidates the list

CSRF chain: Server Action → `GET /health` (captures `pilot-csrf` cookie + `X-Pilot-CSRF` header) → `POST <path>` (forwards both). Re-fetched on every call so server restarts are transparent.

### 🧩 Capability read-only (v0.3.9)

The Capability data model and Zod schema shipped back in v0.2-a, but there was no way to list them. v0.3.9 adds the read surface:

```bash
pilot capability ls            # list installed capabilities with type+title
pilot capability show <id>     # sources, conflicts, requires, timestamps
```

Web: `/capabilities` (list) + `/capabilities/[id]` (detail). The Capability lifecycle (Forge / Eval / Install / Publish) ships in v0.4.

### 🛡 Release hygiene (v0.3.7 / v0.3.10)

- **Versions aligned** across `package.json`, `web/package.json`, Git tag, `/health`, `--version`.
- **Unit tests are unit again** — `service-impl.test.ts` mocks `readPackManifestCached`; no real `npm registry` reads in `npm test`. Network tests live in `test/integration/` (opt-in: `npm run test:integration`).
- **CI matrix** — `macos-latest` × `ubuntu-latest` × Node {20, 22, 24} = 6 jobs. The matrix also runs the `web/` workspace separately.
- **Build is clean** — no Next 16 eslint warning, no lockfile warning, no duplicate `-p` flag.
- **release.yml fixed** — removed the invalid `package-name` input (it was producing "Unexpected input(s)" warnings on every release-please run).
- **integration tests now work** — new `vitest.integration.config.ts` lets `npm run test:integration` actually find the integration tier (the previous script was silently broken because the default config excluded `test/integration/**`).

---

## By the numbers

- **28 commits** since v0.1.0
- **149 unit tests + 4 integration tests + 9 web tests** — all green locally; CI matrix green on 4 successive commits
- **6 CI jobs** (2 OS × 3 Node versions) — `lint + typecheck + test + build` + `web: typecheck + test + build`
- **9 CLI commands** + **1 web subcommand** (dashboard)
- **14 server routes** + **4 server actions**
- **10 web pages**

## CLI surface

```bash
pilot pack ls                  # installed packs, classified via manifest
pilot pack search pi-coding    # npm search
pilot pack info <name>         # detail
pilot pack install <name>      # install / update

pilot session ls               # list sessions
pilot session tree <id>        # show session DAG
pilot session search "fix bug" # full-text search

pilot profile ls / show / create / set / delete
pilot stats today / week / month / all

pilot capability ls            # list installed capabilities (v0.3.9)
pilot capability show <id>     # detail

pilot server start / stop      # 127.0.0.1:17361
pilot dashboard [--no-open]    # web UI (auto-starts server too)
pilot doctor                   # health checks
```

## Web surface

```
/                  → Dashboard       (stats + recent + installed, 10s auto-refresh)
/packages          → Package Center  (list + npm search)
/packages/[name]   → Detail + install
/sessions          → Session list
/sessions/[id]     → Session tree (recursive)
/profiles          → Profile list + create form
/profiles/[name]   → Detail + edit form + delete
/capabilities      → Capability list (15s auto-refresh)
/capabilities/[id] → Capability detail
```

## Architecture

```
Browser  ─→  127.0.0.1:17371  (Next.js dev server, server-rendered React)
                  │
                  │  RSC fetch (no token in browser)
                  ▼
              /api/pilot/*  (proxied via next rewrites)
                  │
                  │  + X-Pilot-Token (server-side injection)
                  ▼
  Server  ─→  127.0.0.1:17361  (pilot server, Fastify)
```

The pilot token never reaches the browser. Reads via `process.env.PILOT_TOKEN` or `~/.pilot/server.token` are injected server-side. Mutating writes additionally carry `X-Pilot-CSRF` (double-submit cookie pattern).

## What's coming next

- **v0.4** — Capability Forge: `forge search`, `forge inspect`, `forge absorb`, `forge eval`, `capability install / promote`
- **v0.5** — Avatars: a Capability becomes an Avatar when promoted; pi sessions can `pilot run <avatar>`

## Install

```bash
npm install -g pilot
pilot --version   # → 0.3.10
pilot doctor      # should be all green
pilot dashboard   # open browser to 127.0.0.1:17371
```

## Verify locally

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot

# Root
npm ci
npm test                  # 149 unit tests
npm run test:integration  # 4 integration tests (needs network)
npm run typecheck
npm run build
npm run lint
npm run format:check

# Web
cd web
npm ci
npm test
npm run typecheck
npm run build
```

## CI status

- Workflow file: `.github/workflows/ci.yml` — 6 jobs (2 OS × 3 Node versions)
- Workflow file: `.github/workflows/release.yml` — release-please on every push to main
- Actions run history: <https://github.com/wwppee/pilot/actions>

## Repository settings (one-time, manual)

For the release workflow to actually open PRs and write release notes, the GitHub repository needs:

```
Settings → Actions → General
  ✓ Workflow permissions: Read and write permissions
  ✓ Allow GitHub Actions to create and approve pull requests
```

The CI workflow itself only needs read access; the release workflow needs the two above.

— Mavis, on behalf of the pilot project
