# v0.4.4 — Box Garden Compose MVP

**v0.4.4 starts Pilot's visual cockpit era.** A new `/compose` page
where you drag Pilot entities (sessions, packs, profiles, policies,
capabilities) onto a canvas and arrange them visually. The first
layer of the 3-layer visual stack from `docs/visual-style.md` —
modern SaaS canvas (Figma-like spine). 2.5D cozy-sandbox skin and
real reactive panels come in v0.4.5 / v0.4.6.

## What's new

### `/compose` — drag-and-drop canvas
- **Sidebar (left)**: searchable list of every Pilot entity, grouped
  by kind, with kind filter chips (💬📦🎛🛡🧩)
- **Canvas (center)**: dotted-grid surface, blocks are draggable
  cards with kind-specific tint
- **Inspector (right)**: shows selected block's metadata + links
  to dedicated detail pages + remove action
- **Drop to add**: drag from sidebar onto canvas → block created at
  drop position
- **Drag to move**: drag any block on the canvas to reposition
- **Delete**: click ✕ on block, or press Delete/Backspace when selected
- **Persist**: every change auto-saves to `localStorage["pilot-compose-state"]`
- **Export / Import**: download/upload the layout as JSON
- **Clear**: button to reset (with confirm)
- **Catalog awareness**: if you delete a block's underlying entity
  (e.g. remove a policy), the block stays put but the Inspector
  warns "not in current catalog"

### Catalog API (server-side)
- `core/compose-listing.ts`: enumerates every Pilot entity across
  stores into a unified `{kind, id, label, sublabel, href}` shape
- Reads via `PilotService` so we share code paths with the rest
  of Pilot — no duplicated session/profile/policy/capability parsing
- Caps sessions at 50 most-recent to keep the sidebar responsive
- Returns a `ComposeCatalog` with 5 sections: `sessions`, `packs`,
  `profiles`, `policies`, `capabilities`, plus `totalCount` and
  `generatedAt` ISO timestamp

### Server endpoint
- `GET /compose/catalog` — same shape as the client `ComposeCatalog`

### Web UI additions
- `/compose` page (server component fetches catalog, renders
  `<ComposeBoard>` client component)
- `ComposeBoard` (client) — the entire interactive UI, ~370 lines
- `compose.module.css` — grid layout (sidebar / canvas / inspector)
  + scoped component styles; pure Tailwind v4 + CSS variables
- Shared utility classes moved to `globals.css` (`.btn`, `.muted`,
  `.kbd`, `.mono`, etc.) for reuse

### Persistence format
```ts
interface ComposeState {
  blocks: ComposeBlock[];
  version: 1;          // bump on breaking shape changes
  updatedAt: string;   // ISO timestamp
  name?: string;       // user-given name
}
interface ComposeBlock {
  id: string;          // uuid, client-generated
  kind: ComposeEntityKind;
  refId: string;       // catalog.{kind}.id
  x: number; y: number;
  label: string;       // cached from catalog at drop time
  sublabel?: string;
  href?: string;
}
```
Schema-versioned: v0.5+ clients can refuse to load v1 if they want.

## Numbers
- **258/258** core tests pass (was 249; +9 in `compose-listing.test.ts`)
- **17/17** web vitest (was 9; +8 in `compose-state.test.ts` + `composeCatalog()` test)
- **23/23** server tests (was 21; +2 in `/compose/catalog`)
- TypeScript strict, **0 errors**
- Web build: `next build` produces 17 routes including `/compose`
- Total new code: ~750 lines (core + server + web)

## What it looks like

```
┌──────────┬─────────────────────┬──────────────┐
│ Sidebar  │   Canvas (dotted)   │  Inspector   │
│ 280px    │                     │   320px      │
│          │   ┌──────┐           │              │
│ Search   │   │ 🛡   │           │  Selected    │
│ [_____]  │   │saf…  │           │  block info  │
│          │   └──────┘           │  + actions   │
│ 💬 3     │                     │              │
│   ses-1  │   ┌──────┐           │  [Export]    │
│   ses-2  │   │ 💬   │           │  [Import]    │
│          │   │ ses1 │           │  [Clear]     │
│ 📦 5     │   └──────┘           │              │
│   ...    │                     │              │
└──────────┴─────────────────────┴──────────────┘
```

## What still doesn't work (deliberate v0.4.5+ scope)

- **No block-to-block connections / arrows** — visual cockpit v0.4.5
- **No 2.5D / isometric skin** — just flat dotted grid (that's v0.4.5)
- **No global layout sharing** — localStorage is per-browser
- **No undo/redo** — single-shot actions only
- **No multi-select / lasso** — one block at a time

## Files added (this release)
- `src/core/compose-listing.ts` (170 lines) — `ComposeDataSource` + entity converters
- `test/unit/compose-listing.test.ts` (9 tests)
- `web/src/app/compose/page.tsx` (60 lines)
- `web/src/app/compose/ComposeBoard.tsx` (370 lines) — full client UI
- `web/src/app/compose/compose.module.css` (270 lines)
- `web/tests/compose-state.test.ts` (7 tests)

## Files modified
- `src/core/service.ts` — +1 method (`listComposeEntities`)
- `src/core/service-impl.ts` — +1 helper
- `src/server/server.ts` — +1 endpoint (`GET /compose/catalog`)
- `test/unit/server.test.ts` — +2 endpoint tests
- `web/src/lib/types.ts` — +`ComposeEntity`, `ComposeCatalog`, `ComposeBlock`, `ComposeState`
- `web/src/lib/pilot.ts` — +`api.composeCatalog()`
- `web/src/app/globals.css` — +`.btn`, `.muted`, `.kbd`, `.mono`, etc.
- `web/src/app/layout.tsx` — +Compose nav link
- `web/tests/pilot.test.ts` — +composeCatalog client test
- `package.json` / `web/package.json` — bump to 0.4.4