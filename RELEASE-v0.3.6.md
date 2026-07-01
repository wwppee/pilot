# Pilot v0.3.6 — Web UI v1

A read + write local dashboard for [pi.dev](https://github.com/mariozechner/pi-coding-agent), the AI coding agent. Pilot is the management plane next to pi: it sees what pi is doing (sessions, packs, stats) and lets you steer it (install packs, manage profiles) without leaving the terminal — or now, the browser.

**Tag:** `v0.3.6` · **Released:** 2026-07-01 · **License:** MIT

---

## What's new

### 🛰 Web UI v1 (v0.3.5)

The first browser dashboard for Pilot, built on Next.js 16 + Tailwind CSS 4 + React 19. Server-rendered — your session data never leaves the box.

- **Dashboard** — today's sessions / messages / tool calls, top models and tools, recent sessions.
- **Package Center** — installed packs + npm registry search; one-click detail.
- **Session Explorer** — session list + recursive tree view (user → assistant → tool → tool → ... → assistant).
- **Profile Manager** — list + read-only detail of named profiles.

Same-origin proxy means the pilot auth token never reaches the browser. Open with:

```bash
pilot dashboard
```

This now starts both the pilot server (127.0.0.1:17361) and the web UI (127.0.0.1:17371) in one process. Ctrl-C cleans up both.

### 🖱 Write operations (v0.3.6)

Four Server Actions with full CSRF round-trip:

- `pilot pack install <name>` — via `<form>` on `/packages/[name]`
- `pilot profile create / set` — via `<form>` on `/profiles` and `/profiles/[name]`
- `pilot profile delete` — `<DeleteButton>` with browser confirm, revalidates the list

CSRF chain: Server Action → `GET /health` (captures `pilot-csrf` cookie + `X-Pilot-CSRF` header) → `POST <path>` (forwards both). Re-fetched on every call so server restarts are transparent.

### 🛡 Release hygiene (v0.3.7)

- **Versions aligned:** package.json `0.3.6`, web/package.json `0.3.6`, Git tag `v0.3.6`, `/health` response all agree.
- **Unit tests are unit again:** `service-impl.test.ts` mocks `readPackManifestCached`; no more real `npm registry` reads in default `npm test`. Network tests live in `test/integration/` (opt-in: `npm run test:integration`).
- **Build is clean:** no Next 16 eslint warning, no lockfile warning.
- **CI matrix:** macos-latest × ubuntu-latest × Node {20, 22, 24} (added Node 24). The matrix also runs the web/ workspace separately.

---

## By the numbers

- **25 commits** since v0.1.0
- **143 unit tests + 9 web tests + 4 integration tests** — all green
- **6 CI jobs** (2 OS × 3 Node versions) — all green on `d80e278`
- **6 web pages** + **7 CLI commands** + **14 server routes** + **9 Server Actions**

## CLI surface

```bash
pilot pack ls                  # installed packs, classified via manifest
pilot pack search pi-coding    # npm search
pilot pack info <name>         # detail
pilot pack install <name>      # install / update

pilot session ls               # list sessions
pilot session tree <id>        # show session DAG
pilot session search "fix bug" # full-text search

pilot profile ls / show / create / set / delete / use
pilot stats today / week / month / all

pilot server start / stop      # 127.0.0.1:17361
pilot dashboard [--no-open]    # web UI (auto-starts server too)
pilot doctor                   # health checks
```

## Web surface

```
/                  → Dashboard       (stats + recent + installed)
/packages          → Package Center  (list + npm search)
/packages/[name]   → Detail + install
/sessions          → Session list
/sessions/[id]     → Session tree (recursive)
/profiles          → Profile list + create form
/profiles/[name]   → Detail + edit form + delete
```

## What's coming next

- **v0.3.8** — auto-refresh dashboard, better empty/loading states
- **v0.4** — Capability manager (Pilot starts shaping pi's runtime, not just observing it)
- **v0.5** — Forge: distribute your own pilot packs

## Install

```bash
npm install -g pilot
pilot --version   # → 0.3.6
pilot doctor       # should be all green
pilot dashboard    # open browser to 127.0.0.1:17371
```

## Verification

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot
npm ci
npm test           # 143 unit tests, 9s
npm run typecheck
npm run build
cd web && npm ci && npm test && npm run build
```

CI status: <https://github.com/wwppee/pilot/actions>

— Mavis, on behalf of the pilot project
