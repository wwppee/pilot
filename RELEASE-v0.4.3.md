# v0.4.3 — Tool policies you can actually enforce

**v0.4.3 makes Pilot's tool policy a real, end-to-end thing.** You write
a `ToolPolicy` TOML, hit `apply`, and Pilot generates a TypeScript
extension that pi auto-loads. Every subsequent pi session respects
your rules — without you having to touch pi's settings or write any
TypeScript.

## What's new

### `pilot policy` — full CRUD + enforcement
- `ls` — list policies, with applied/not-applied status
- `show <name>` — full TOML + extension file path
- `new <name>` — generate a safe-by-default starter (denies `bash`,
  blocks `.env` reads, redacts common API keys, requires approval for
  `bash`/`write`)
- `apply <name>` — generate `~/.pilot/extensions/pilot-policy-<name>.ts`
  that pi auto-loads
- `unapply <name>` — remove the generated extension
- `check <name> <tool> --arg key=value` — dry-run a call against the
  policy and see which rule fires

### Generated extension — the actual enforcement
The generated `.ts` is a real pi extension that:
- Subscribes to `tool_call` → returns `{block: true, reason: ...}`
  for denied tools, paths, commands; or prompts via `ctx.ui.confirm()`
  for tools in `requireApproval`
- Subscribes to `tool_result` → scrubs content matching
  `sensitivePatterns` (OpenAI/Anthropic keys, GitHub PATs, AWS keys,
  `password=…` patterns)
- Lives entirely in `~/.pilot/extensions/`, no Pilot runtime deps
- Compiles cleanly with `tsc --strict` — verified by an integration
  test that runs the compiler on the generated output

### AST scan of extension .ts files
The `/tools` Web UI and `pilot tool ls` now show real tools registered
in project-local extensions, not just the npm package name. A
best-effort scanner parses `pi.registerTool({name: "..."})` calls in
`~/.pi/agent/extensions/*.ts` and `.pi/extensions/*.ts`. Limitations
documented in the module; v0.4.4 will use a real TS parser for
edge cases (cross-file imports, variable indirection).

### Policy data model
- `allow` / `deny` — tool names (deny wins)
- `denyPaths` — glob patterns for read/edit/write (e.g. `**/.env`,
  `/etc/**`)
- `denyCommands` — regex patterns for bash (e.g. `^rm\s+-rf\s+/`)
- `sensitivePatterns` — regex/string patterns redacted from tool
  results
- `requireApproval` — tool names that pause for `ctx.ui.confirm()`
- All stored as TOML in `~/.pilot/policy/<name>.toml`

### Web UI
- `/policy` — list policies, see applied status + extension size,
  run a dry-run check from the browser
- `/api/policy-check` — form action for the "Try a rule" form

### Server endpoints
- `GET /policies`, `GET /policies/:name`
- `PUT /policies/:name` — create or update
- `DELETE /policies/:name` — remove
- `POST /policies/:name/apply` — generate extension
- `POST /policies/:name/unapply` — remove extension
- `POST /policies/:name/check` — dry-run evaluation

## Bug fixes
- `matchPath` glob matcher now correctly handles `**` boundary
  (previously `/etc/**` and `/etc/` were treated the same way; now
  `/etc/passwd` matches but `/etc/` doesn't, and `**/.env` requires
  the trailing `/`).
- `tryReadPolicy` returns `null` for invalid names (previously threw).

## Numbers
- **249/249** core tests pass (was 191; +58 across 4 new modules)
- **9/9** web vitest
- **21/21** server tests including a full policy lifecycle
- TypeScript strict, **0 errors**
- Generated extension compiles with `tsc --strict` (verified in CI)

## What still doesn't work
- AST scan can't resolve cross-file imports or `registerTool(myVar)`
  — v0.4.4 will use `typescript-eslint` for real AST analysis
- No policy UI for editing TOML in-browser (CLI only) — v0.4.5
- No central registry of "what should a good policy look like" —
  intentionally out of scope; users can share TOML files via git

Full diff: `git log v0.4.2..v0.4.3` (after release)
