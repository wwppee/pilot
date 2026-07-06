# v0.5.4 — Co-pilot mode (pilot agent + pilot-tools extension)

Shipped 2026-07-06. Pilot stops pretending it doesn't talk to the agent
runtime. This release flips the architecture: Pilot is now a **bidirectional
bridge** between the user (CLI/Web) and Pi (running agent). The Pi extension
turns Pilot's commands into tools the LLM can call mid-conversation, so Pi
can self-install packs, switch profiles, and capture Avatars without the
user ever leaving the chat.

## Why this release

PILOT.md used to say "Pilot is a management plane — it doesn't run agents,
only manages Pi's state". That was wrong on two counts:

1. **The user wanted to launch Pi from Pilot's Web UI** — running Pi as a
   subprocess with Pilot's tools loaded is the natural entrypoint.
2. **Pi's LLM should be able to call Pilot** — forcing the user to exit Pi
   every time they want to install a pack or switch profiles was a workflow
   killer.

v0.5.4 fixes both. The positioning now reads:

> **Pilot = Pi's Co-pilot.** Pilot doesn't replace Pi running the agent, but
> it IS Pi's best partner — CLI / Web UI for seeing and managing Pi's state,
> `pilot agent` to launch Pi with Pilot's tools loaded, and a `pilot-tools`
> extension that lets Pi's LLM call Pilot's commands mid-conversation.

`docs/vision.md` and `docs/architecture.md` updated to match. The "❌ 替代
Pi 做 agent" item in PILOT.md's "不要做" list is replaced with "❌ 替代 Pi
跑活（Pi 是 source of truth，Pilot 是 Co-pilot）".

## What's new

### `pilot agent` — launch Pi with Pilot's tools loaded

```bash
pilot agent                       # spawn pi in cwd, install extension if missing
pilot agent --cwd /path/to/proj   # spawn pi in a different cwd
pilot agent --profile pi-architect # activate profile before spawning
pilot agent --model claude-opus-4-6
pilot agent -- --some-pi-flag foo  # pass anything after `--` straight to pi
pilot agent --no-extension        # skip extension install (debugging)
```

The command:

1. Verifies `pi` is on PATH (clear error with install hint if not).
2. Installs (or refreshes) the `pilot-tools` symlink at
   `~/.pi/agent/extensions/pilot-tools.ts` pointing to
   `<pilot-install>/extensions/pilot-tools.ts`. Idempotent — silent on
   every subsequent launch.
3. Optionally activates a profile via the service layer.
4. Prints a server-status hint: if Pilot's HTTP server is reachable at
   `http://127.0.0.1:17361`, the extension's tools will work; otherwise
   the user gets a "start with `pilot dashboard`" warning.
5. Spawns pi as a child process with `stdio: 'inherit'` so the user's TUI
   flows through. SIGINT / SIGTERM are forwarded cleanly.

### `pilot-tools` Pi extension

Single TypeScript file at `src/extensions/pilot-tools.ts` (also copied
to `dist/extensions/` on build). Auto-loaded by Pi from
`~/.pi/agent/extensions/pilot-tools.ts` — no manual setup beyond
running `pilot init` or `pilot agent`.

Registers 13 tools, each calling Pilot's HTTP API:

| Tool | What it does |
|---|---|
| `pilot_pack_install` | install `npm:foo` / `git:…` / `file:…` |
| `pilot_pack_uninstall` | remove by name |
| `pilot_pack_list` | list installed packs |
| `pilot_profile_activate` | switch active profile |
| `pilot_profile_list` | list available profiles |
| `pilot_session_search` | full-text search past sessions |
| `pilot_session_info` | per-session summary card |
| `pilot_stats` | tokens / cost / messages (today/week/month/all) |
| `pilot_avatar_capture` | snapshot current state for a cwd |
| `pilot_avatar_diff` | diff saved Avatar vs current state |
| `pilot_avatar_apply` | apply Avatar (defaults to dry-run) |
| `pilot_forge_search` | search npm registry for Pi packages |
| `pilot_capability_diff` | diff two capability specs by id |
| `pilot_doctor` | health check |

Each tool has `promptSnippet` + `promptGuidelines` so Pi's LLM knows
exactly when to use it (the prompt-level hint matters more than the
description alone — see the dynamic-tools example in Pi's docs).

Every tool fetches `http://127.0.0.1:17361/...` with the token from
`~/.pilot/server.token`. If the server isn't running, the tool returns a
clear "start it with `pilot dashboard`" message — never a silent failure.

### Extension installer (`src/core/extension-installer.ts`)

`installPilotTools(installDir)` is a separate core module so both
`pilot init` and `pilot agent` can use it. Symlinks (not copies) so
edits to the source + `/reload` in Pi pick up changes without re-install.

Idempotency rules:

- Already-linked to our source → no-op (`action: "already-linked"`)
- Stale symlink pointing elsewhere → replace (`action: "replaced"`)
- Regular file at target → refuse to clobber (`action: "skipped-conflict"`)
- Source file missing → bail with clear error
- `$PI_AGENT_DIR` respected (in case the user runs Pi at a custom dir)

### `pilot init` updates

The first-run banner now shows the extension status ("✓ pilot-tools
extension installed") and the cheatsheet gains a "Launch Pi with Pilot's
tools loaded: `pilot agent` (Co-pilot mode)" tip.

### Docs

- **PILOT.md**: tagline flipped to "Co-pilot". Section 0 added as the
  authoritative positioning. Section 3 ("一句话定位") rewritten. Section 9
  ("不要做") updated. Section 10 ("一句话总结") rewritten. Module table
  adds the two new entries. Roadmap updated to a 4th phase "和 Pi 一起跑".
- **docs/vision.md**: opening tagline flipped. §1 (是什么/不是什么) updated.
  §2 (边界) adds the new `~/.pilot/extensions/` source-of-truth + the
  `~/.pi/agent/extensions/pilot-tools.ts` symlink.
- **docs/architecture.md**: §1 (边界) reflects the new directory layout.

## Build / install changes

- `npm run build` now also copies `src/extensions/*.ts` to
  `dist/extensions/` so the extension ships with the npm package.
- New `npm run copy-extension` script for incremental re-copy during dev.
- `src/extensions/` is excluded from the TypeScript project (the file
  uses `typebox` + `@earendil-works/pi-ai`, which are transitive deps of
  pi-coding-agent — not pilot's. The extension is loaded by Pi via
  jiti at runtime, not by pilot itself.)

## Tests

- **Core: 436/436 passing** (was 414 in v0.5.3; +22 from extension
  installer + agent CLI + extension-file sanity checks)
- **Web: 95/95 passing** (no changes — purely CLI/runtime work)

New test files:

- `test/unit/extension-installer.test.ts` (11 tests) — covers
  `findPilotToolsSource` (prod / dev / missing layouts),
  `getExtensionTargetPath` (`$PI_AGENT_DIR` override / `~/.pi/agent`
  fallback), and `installPilotTools` (create / already-linked / replaced /
  skipped-conflict / missing-source / auto-mkdir-parent cases).
- `test/unit/agent.test.ts` (11 tests) — covers `parseOptions` for all
  flags + `--` passthrough, plus two sanity tests that the
  `pilot-tools.ts` source file exists at `src/` and matches the
  `dist/` copy after `npm run build`.

The installer tests use fake `$HOME` + `$PI_AGENT_DIR` so they never
touch the real `~/.pi/agent/` directory.

## Web UI embedding (deferred to v0.5.5)

This release deliberately stops at "Co-pilot mode via CLI". The next
piece — embedding Pi in the Pilot Web UI via `pi --mode rpc` + SSE
streaming — is a bigger engineering effort (RPC protocol framing,
bidirectional streaming, terminal rendering) that deserves its own
release. The groundwork is laid: Pilot already has well-defined HTTP
endpoints that pilot-tools calls; v0.5.5 just needs the server to
proxy RPC events to the browser.

## Files changed

### New

- `src/extensions/pilot-tools.ts` — the Pi extension itself (~430 lines)
- `src/core/extension-installer.ts` — symlink management
- `src/commands/agent.ts` — `pilot agent` CLI command
- `test/unit/extension-installer.test.ts`
- `test/unit/agent.test.ts`

### Modified

- `PILOT.md` — positioning flip + new module rows + roadmap phase 4
- `docs/vision.md` — positioning + boundary updates
- `docs/architecture.md` — boundary table
- `src/cli.ts` — register `agentCmd`
- `src/commands/init.ts` — install extension during `pilot init`, banner
- `tsconfig.json` — exclude `src/extensions/` from TS project
- `package.json` — version bump, description flip, build copies
  extensions, new `copy-extension` script

## Install

```bash
npm install -g pilot@0.5.4
pilot init        # or just `pilot agent` — installer runs on first launch
pilot agent       # spawn Pi with pilot-tools loaded; LLM can call Pilot
```

Then in Pi, try saying something like "install the `npm:pi-subagents`
pack" — Pi's LLM should call `pilot_pack_install` automatically, the
pack gets installed, and the next turn picks up the new capability.