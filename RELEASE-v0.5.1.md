# v0.5.1 — Capability diff

Released 2026-07-05. Tag: `v0.5.1`. Commit: 376fdca.

## Highlights

### Capability diff — compare two absorbed Capabilities

Pure-function diff between two Capabilities, exposed via Web UI at `/capabilities/diff`. Useful when upgrading a package (re-absorb creates a new Capability) or comparing L1-referenced vs L2-wrapped versions.

**Per-field status** (`match` / `missing` / `extra` / `drift` — re-used from Avatar):
- Scalars: `title`, `type`, `description`, `metadata.createdAt`, `metadata.updatedAt`
- Sets: `sources` (matched by `ref`), `artifacts.{extensions,skills,prompts,themes}`, `compatibility.{conflicts,requires}`, `metadata.{inspiredBy,tags}`
- Special: `eval` (3-state: both absent / only A / only B / both)

`id` is intentionally NOT diffed (identity field).

### Web UI

- **`/capabilities/diff`** — picker A + picker B + diff table
- Each card under `/capabilities` has a "diff with…" link that opens the diff with that cap pre-selected as A

### Server

- `GET /capabilities/:aId/diff/:bId` (404 when either side missing)

## Files added

- `src/core/capability-diff.ts` (~280 lines, pure function)
- `test/unit/capability-diff.test.ts` — 18 tests
- `web/src/app/capabilities/diff/page.tsx`
- `web/src/components/CapabilityDiffClient.tsx`
- `web/tests/capability-diff-client.test.tsx` — 8 RTL tests

## Files modified

- `src/core/service.ts` + `src/core/service-impl.ts` — `capabilityDiff(aId, bId)`
- `src/server/server.ts` — diff route
- `web/src/lib/{pilot,pilot-browser,types}.ts` — API surface + `CapabilityDiff` type
- `web/src/app/capabilities/page.tsx` — "diff with…" link
- `web/src/lib/i18n/{dict.en,dict.zh,types}.ts` — 23 new keys

## Tests

- **388/388 core** (was 366; +20)
- **95/95 web** (was 87; +8)

## What's next (v0.5.2+)

- Replay mode — re-run a session tree against a different model
- Forge L2 eval — run `evals.yaml` against installed capabilities