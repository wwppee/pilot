# `pilot session` — manage pi session files

## Subcommands

### `pilot session ls`

List all sessions, most-recent first. Grouped by project directory.

```bash
$ pilot session ls
47 session(s):

~/projects/myapp
  2026-06-30 22:41  134 entries · 2.3 MB · claude-opus-4.6
    /Users/me/.pi/agent/sessions/.../2026-06-30_22-41_abc.jsonl
  ...

~/projects/api-server
  2026-06-30 09:15  211 entries · 4.1 MB · gpt-5
    ...
```

### `pilot session search "<query>"`

Full-text search across **every** entry in every session. Case-insensitive
by default; pass `--case` for case-sensitive.

Concurrency-limited to 8 simultaneous reads so we don't pin your disk.

```bash
$ pilot session search "JWT auth"
Searching all sessions for: JWT auth

★ 2026-06-30 22:41  4 hits
    ~/projects/myapp
    /Users/me/.pi/agent/sessions/.../2026-06-30_22-41_abc.jsonl

  2026-06-22 15:12  2 hits
    ~/projects/api-server
    /Users/me/.pi/agent/sessions/.../2026-06-22_15-12_def.jsonl

Re-open with: pi --resume 2026-06-30_22-41_abc
```

## Future (v0.2+)

- `pilot session diff <id1> <id2>` — compare two sessions
- `pilot session tree <id>` — visualize the branch DAG
- `pilot session export <id>` — HTML / Markdown
- `pilot session gc --older-than 30d` — cleanup
- `pilot session stats --by model|pack` — usage analytics