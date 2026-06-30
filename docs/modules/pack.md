# `pilot pack` — manage pi packages and meta-packs

## Subcommands

### `pilot pack ls`

List installed packs, grouped by kind (extension / skill / theme / prompt).
Detects common conflicts (e.g. multiple subagent packs installed).

```bash
$ pilot pack ls
✓ 4 pack(s) installed:

🔌 Extensions
  ● npm:pi-subagents
  ● npm:pi-lens
  ○ npm:old-pack              # disabled

📚 Skills
  ● npm:superpowers-zh

⚠ 2 subagent packs detected — they may conflict. Keep only one.
```

### `pilot pack search <query>`

Search the npm registry from the terminal. Default 15 results.

```bash
$ pilot pack search subagent
Showing 15 of many. Install with: pilot pack install <name>

  pi-subagents@0.31.0
    Pi extension for delegating tasks to subagents with chains, parallel execution

  @tintinweb/pi-subagents@0.12.0
    A pi extension extension that brings smart Claude Code-style autonomous sub-agents to pi
  ...
```

### `pilot pack info <pkg>`

Show details for a single npm package.

```bash
$ pilot pack info pi-subagents
pi-subagents @ 0.31.0

  Pi extension for delegating tasks to subagents with chains, parallel execution
  author: nicopreme
  last published: 2026-06-30
  keywords: pi, subagent, agent

  Install: pilot pack install pi-subagents
```

### `pilot pack install <pkg|team>`

Install a pack. Wraps `pi install` — accepts the same syntax:

- `npm:<package>` (default if no scheme)
- `git:<url>`
- Local path

```bash
$ pilot pack install pi-subagents
→ Running: pi install npm:pi-subagents
✓ Installed.
```

## Meta-packs (v0.2)

A "team" bundles multiple packs. Defined as TOML in `~/.pilot/teams/<name>.toml`
or shipped via `examples/teams/`. Install:

```bash
pilot pack team install code-review-team
```

See [examples/teams/code-review-team.toml](../../examples/teams/code-review-team.toml).

## Conflict detection (v0.1)

`pilot pack ls` warns when you have 2+ packs with overlapping categories
(subagent, crew, orchestr). This is a heuristic — keep only the one you
actually use.