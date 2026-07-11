# Changelog

## Unreleased

### v0.6.7 — block-to-block connections (schema v2, SVG overlay, inspector connect picker)

Compose is a sandbox. The whole point is to lay out a stack of
entities (session / pack / profile / policy / capability) and
see what the composition looks like. v0.6.6 made the inspector
show real entity fields; v0.6.7 adds the missing "between" —
directed edges from one block to another.

**New state**

- `ComposeState.connections: ComposeConnection[]` (optional on
  the type so v1 saves still load; treated as `[]` until the
  user adds an edge)
- `ComposeConnection = { id, from, to }` — `id` is stable so
  history entries stay small (we re-find the edge by id, not
  by a positional index that would shift on every add)
- `version` bumped 1 → 2. `loadState()` accepts both versions
  (v1 saves load fine; new saves always write v2). `importJson`
  validates the same way. Future versions drop to empty state
  rather than mis-parse.

**New history entries**

- `addConnection` / `removeConnection` — extend the existing
  pure-function `applyEntry` / `invertEntry` in
  `lib/compose-history.ts`. Refuse self-loops, duplicate edges,
  and edges whose endpoints aren't in the current block set
  (would render as broken line-ends).
- 5 new test cases in `tests/compose-history.test.ts` covering
  apply / invert / round-trip / preservation across
  non-related entries.

**UI**

- SVG overlay inside the canvas — one `<g>` per connection,
  cubic bezier from the right edge of the source block to
  the left edge of the target block. Click a line to select
  it (visual emphasis only for now; the inspector list is
  where the user actually disconnects).
- Inspector gets a "Connections" section: list of incoming +
  outgoing edges with per-edge "×" disconnect button. Empty
  state shows "No connections yet". The "+ Connect to…"
  button toggles a small picker panel listing every other
  block (with existing targets marked ✓) so the user can
  wire up the composition in two clicks.
- Connection state is fully undoable — undo/redo work
  through the new history entries.
- The connections array is included in export/import — the
  JSON file round-trips.

**CSS**

- `.compose-connections` overlay (canvas-relative, z-index 0
  so blocks render on top).
- `.compose-inspector-connections` section, picker list, and
  per-edge disconnect button styling.
- Block dimensions are pinned to 220×80 via `BLOCK_W` /
  `BLOCK_H` constants in `ConnectionPath` so the bezier
  anchors stay in sync with `ComposeBlockView` styles.

**i18n**: 9 new keys (en + zh) — `compose.inspector.connections`,
`connect`, `connectTo`, `cancelConnect`, `disconnect`,
`noConnections`, `connectionsFrom`, `connectionsTo`,
`compose.announce.{connectionAdded,connectionRemoved}`.

**Files touched**

- `web/src/lib/types.ts` — `ComposeConnection` + state.connections
  + version bump
- `web/src/lib/compose-history.ts` — addConnection/removeConnection
- `web/src/app/compose/ComposeBoard.tsx` — SVG overlay, picker,
  callbacks, ConnectionPath, ConnectingPicker, ConnectionList,
  loadState v1/v2 dual support
- `web/src/app/compose/compose.css` — overlay + inspector section
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` — 9 new keys
- `web/tests/compose-history.test.ts` — 5 new cases
- `web/tests/compose-state.test.ts` — update v1 → v2 expectations

**Tests**

- core: 559/559 (no core changes this release)
- web: **194/194** (+5 history detail cases)
- `format:check` clean both repos
- `lint` clean (root)
- `tsc` clean (root + web)
- `npm run build` succeeds

**What's NOT in v0.6.7 (deferred to v0.6.8+)**

- Drag-from-block-edge to create a connection (current flow is
  click "+ Connect to…" → click target). Drag is more
  intuitive but adds another pointer-event state machine.
- Edge label / type (e.g. "uses", "depends on") — current
  edges are pure visual hints, no semantic.
- Arrowhead direction at the target end. Right now the line
  just terminates at the target's left edge.
- Server-side persistence of the board (current state lives in
  localStorage; same as before).

### v0.6.6 — P2 hotfix: ComposeBoard hydration mismatch (silent since v0.4.4)

v0.4.4 introduced `ComposeBoard` with two pieces of state
lazy-initialized from `localStorage` inside `useState`:

  const [state, setState] = useState<ComposeState>(() => loadState());
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());

`loadState()` checks `typeof window === "undefined"` and returns
`emptyState()` in SSR — so the server renders "0 个块" and the
"Modern" skin toggle. On the client, the same `loadState()`
runs but the `typeof window` branch is now `true`, so it reads
`localStorage` and returns the persisted state — which on a
user's second visit is "2 个块" and the "Cozy" skin.

This is React's classic SSR/CSR text mismatch. The warning has
been silently present on every Compose page view since v0.4.4
(3+ minor versions), including all of v0.6.2 / v0.6.3 / v0.6.4 /
v0.6.5. Doesn't break anything functionally — React just
throws away the SSR HTML and re-renders the client — but it
pollutes the console and silently hides real hydration issues.

**Fix**: stop lazy-initializing from localStorage. SSR and the
client's first render must produce identical UI, so both start
from the default `emptyState` / "modern" skin. After hydration,
a `useEffect` reads localStorage and re-renders. The re-render
triggered by `setState` in `useEffect` is not a hydration — it's
just a normal update after the tree is already attached.

  - `useState<ComposeState>(emptyState)`  // was: `() => loadState()`
  - `useState<ViewMode>("modern")`        // was: `() => loadViewMode()`
  - `useEffect(() => { setState(loadState()); setViewMode(loadViewMode()); }, [])`

No other state is localStorage-backed at component init, so no
other changes needed.

**Verified end-to-end**:

- Pre-fix: dev console shows the hydration warning on every
  /compose load.
- Post-fix: dev console is clean (only the unrelated favicon
  404). Block count "2 个块" + 2 block DOM elements render
  correctly after the post-hydration re-render.

**Files touched**: `web/src/app/compose/ComposeBoard.tsx` only
(3 useState + 1 useEffect).

**Tests**: core 559/559, web 189/189 (no new tests — this is a
3-line fix verified by console behavior, not a test case), format
双清, lint clean, tsc clean (root + web), production build OK.

### v0.6.5 — /compose inspector real entity fields

v0.6.2 / v0.6.4 made the inspector functional, but every block
showed the same five metadata rows (id, kind, refId, position,
cached sublabel). A "session" block, a "policy" block, and a
"profile" block all rendered the same fields — no way to see the
real entity's cwd / size / rules / packages without navigating
away. This release adds per-entity full-detail rendering.

**New server endpoint**

- `GET /compose/catalog/:kind/:id` returns a discriminated-union
  `ComposeEntityDetail` (session / pack / profile / policy /
  capability) with the entity's real fields. Returns 404 when
  the entity is not found, 400 when the kind is unknown.
- `core/compose-listing.ts#getComposeEntityDetail` is the pure
  helper that backs it, plus the exported `ComposeEntityDetail`
  union type.
- `PilotService.getComposeEntityDetail` + service-impl adapter
  share the data-source wiring with the existing
  `listComposeEntities` so the two paths stay in sync.

**Client changes**

- `web/src/lib/pilot-browser.ts#composeEntityDetail` is the
  browser-safe fetch (404 → null, no throw noise).
- `BlockInspector` does a `useEffect` fetch on `block.kind` /
  `block.refId` change; renders a `hydrated` guard so client
  and SSR don't disagree on `Date.now()`-derived text
  (React #418 fix).
- `InspectorDetailFields` switches on `detail.kind` and renders
  kind-specific `<dl>` rows:
  - **session** → cwd / model / entries / size (B/KB/MB) /
    firstUsed / lastUsed (relative time) / firstUserPreview
  - **pack** → source / packKind / enabled
  - **profile** → model / provider / thinking / team /
    description / packages list
  - **policy** → description + all six rule lists (allow / deny
    / denyPaths / denyCommands / sensitivePatterns /
    requireApproval) with rule counts
  - **capability** → title / type / description / sources list /
    conflicts / requires
- `pilot.ts` `pilot<T>()` gains function overloads:
  - `pilot(path, init?)` → `Promise<T>` (default)
  - `pilot(path, { nullableStatuses: [...] })` →
    `Promise<T | null>`

**Bug fix: client-bundle import of `node:fs/promises`**

- v0.6.4 build worked because `ComposeBoard` imported
  `pilot.ts` but never *called* any of its functions client-side
  — Turbopack tree-shook the `node:fs/promises` import away.
- v0.6.5's `useEffect` fetch of `composeEntityDetail` actually
  pulls `pilot.ts` into the client bundle, which Turbopack
  rejects with "the chunking context does not support external
  modules (request: node:fs/promises)".
- Fix: `ComposeBoard` now imports from `pilot-browser.ts` (the
  v0.4.7 split that was already in place for this exact reason)
  instead of `pilot.ts`. The browser variant routes through
  Next.js's `/api/pilot/*` proxy so the token never reaches the
  browser, and there's no `node:fs` to drag in.

**i18n**: 28 new keys (en + zh) — `compose.inspector.loading` +
`compose.inspector.error` + 26 `compose.inspector.detail.*`
labels (cwd / entries / size / lastUsed / firstUsed / model /
packages / thinking / provider / team / preview / source /
enabled / title / type / description / sources / allow / deny /
denyPaths / denyCommands / sensitivePatterns / requireApproval /
conflicts / requires / noneCount).

**Files touched**

- `src/core/compose-listing.ts`
- `src/core/service.ts`
- `src/core/service-impl.ts`
- `src/server/server.ts`
- `test/unit/compose-listing.test.ts` (6 new detail cases)
- `web/src/lib/types.ts`
- `web/src/lib/pilot.ts`
- `web/src/lib/pilot-browser.ts`
- `web/src/app/compose/ComposeBoard.tsx`
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts`

**Tests**

- core: 559/559 (+6 detail)
- web: 189/189 (unchanged)
- `format:check` clean both repos
- `lint` clean (root)
- `tsc` clean (root + web)
- `npm run build` succeeds (production)

**What's intentionally NOT in v0.6.5 (deferred)**

- Block-to-block edges / connections
- Multi-board / server-side persistence of board state
- Keyboard-shortcut modal (`?` button)
- Block hover tooltip showing arrow-key hints

### v0.6.4 — /compose operation visibility: undo counter, block actions, drag/drop animation, Strict-Mode bug fix

The v0.6.2/v0.6.3 release made the layout work and added undo/
redo, but the operations were still easy to miss. This release
polishes the interactions and fixes one real bug that the
v0.6.2 Strict-Mode setup had been hiding.

**What's new**

- **Toolbar undo/redo: stack count.** When `canUndo`/`canRedo`
  is true, the button text now includes the count — `↶ Undo · 3`
  / `↷ Redo · 1`. When the stack is empty the original
  `↶ Undo` / `↷ Redo` is shown.
- **Inspector per-block actions.** Each block now has
  `Duplicate (⎘)`, `Top (⤒)`, `Bottom (⤓)` alongside the
  existing "open detail page" link and Remove. Duplicate creates
  a copy offset 24px down-right so the user can see the pair.
  Top / Bottom reorder within the blocks array (z-order = render
  order; the moved block lands at the new z-position).
- **Drag/drop visual feedback:**
  - Sidebar item the user is currently dragging out is dimmed to
    40% opacity with a dashed accent ring (`data-dragging="true"`)
  - Canvas gets a slow pulsing inset accent border while a
    sidebar item is being dragged over it
    (`data-pending="true"`)
  - Each newly added block fades + scales in over 220ms
    (`data-just-added="true"`); cleared 320ms after creation

**Bug fix: Strict-Mode double-history-push**

`addBlockAtCenter` previously deferred its history push + flash
via `queueMicrotask` inside a `setState((s) => ...)` updater.
React 18 Strict Mode runs the updater twice in **dev**, so the
microtask fired twice and produced **TWO** history entries per
click. Production was unaffected (Strict Mode is dev-only).
Symptom: dev-mode undo button showed `↶ Undo · 4` after only two
`+`-button clicks. Moved the side effects out of the updater;
both dev and prod now show the correct count.

**i18n:** 8 new keys (en + zh) — `compose.toolbar.{undoWithCount,
redoWithCount}`, `compose.inspector.{duplicate, duplicateTitle,
moveTop, moveBottom}`, `compose.announce.justAdded`.

**Files touched**

- `web/src/app/compose/ComposeBoard.tsx`
- `web/src/app/compose/compose.css`
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts`

**Tests**

- core: 553/553 (unchanged)
- web: 189/189 (unchanged)
- `format:check` clean both repos
- `lint` clean (root)
- `tsc` clean (root + web)
- `npm run build` succeeds (production)
- Playwright DOM-level verification (production build, no Strict
  Mode double-call): `+` × 3 → `↶ Undo · 3`; all 5 inspector
  actions present; block border-color = `rgb(121, 192, 255)`
  (`var(--accent)`); dark theme body bg = `rgb(11, 13, 16)`
  (`var(--bg)`)

**What's intentionally NOT in v0.6.4 (deferred)**

- Block-to-block edges / connections (v0.6.5+)
- Multi-board / server-side persistence (v0.6.5+)
- Keyboard-shortcut modal (`?` button) (v0.6.5+)
- Block hover tooltip showing arrow-key hints (v0.6.5+)

### v0.6.3 — hotfix: /compose CSS module → global CSS so classes actually apply

v0.6.2 shipped a complete /compose UI overhaul that **never
rendered**. Root cause: the CSS file was `compose.module.css`
imported via `import "./compose.module.css"` from the page-level
server component. Under Next.js 16, `*.module.css` is treated as
a CSS Module — every class gets hashed through the bundler. The
className strings in `ComposeBoard.tsx`
(`"compose-page"`, `"compose-grid"`, `"compose-toolbar"`,
`"compose-sidebar"`, `"compose-canvas"`, `"compose-block"`, …)
never matched anything in the served stylesheet, so the v0.6.2
grid layout never took effect — the page rendered as a single
column of stacked elements (toolbar, then sidebar contents, then
inspector contents, with no canvas column and no inspector
column at all).

**Verified by Playwright screenshot, before / after the rename:**

- **before:** all elements stacked vertically, no canvas column,
  toolbar's mobile-only "Open details" button visible (because
  `.compose-toolbar-inspector-trigger { display: none }` was
  also dead), no toolbar wrapping
- **after:** 3-column grid (sidebar 280px / canvas 1fr / inspector
  320px) at ≥1024px, sticky toolbar on top, mobile bottom-sheet
  drawer at <1024px, all v0.6.2 changes visible

**Fix:** rename `compose.module.css` → `compose.css` (unscoped
global CSS, matching the v0.4.4-v0.6.1 contract where
`className="…"` was already used directly) + update the `import`
path. No component / i18n / type changes — strictly a
build-config fix.

**Files touched:**

- `web/src/app/compose/compose.module.css` → `web/src/app/compose/compose.css` (rename only — same content)
- `web/src/app/compose/page.tsx` (1 line: import path)

**Tests:**

- core: 553/553 (unchanged)
- web: 189/189 (unchanged)
- `format:check` clean both repos
- `lint` clean (root)
- `tsc` clean (root + web)
- `npm run build` succeeds
- Playwright visual verification: 3-column grid renders as designed

### v0.6.2 — /compose UI experience overhaul (toolbar + undo/redo + ellipsis + mobile drawer)

`/compose` was first shipped in v0.4.4 as a "box garden" canvas
and hadn't been touched in 4 minor versions. The visual style
held up, but the operator UX had drifted badly: 18–24px
buttons (below touch-target), `word-break: break-all` mid-glyph
breaks on labels, 4-layer cozy box-shadow stacks, a 4-layer
inspector footer that buried the cozy toggle, and **no undo**
after a misclick. This release is a pure experience overhaul —
**no schema, URL, i18n-key-prefix, or API-path changes**.

**Top sticky toolbar replaces the inspector footer**

The cozy / modern toggle, export, import, and clear buttons
moved from the inspector footer to a new top-of-grid toolbar
with undo / redo on the left, block count in the middle, and
view / export / import / clear on the right. The inspector
footer is gone. On `<1024px` viewports the toolbar also shows
an "Open details" button that opens the inspector as a
bottom-sheet drawer.

**Undo / Redo: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z**

New `web/lib/compose-history.ts` exposes `applyEntry` and
`invertEntry` as pure functions of `ComposeState` (importable
from tests). Three history-entry kinds — `add`, `remove`,
`move` — capped at 50 entries. Drag commits ONE entry on
`pointerup` (not per-frame); arrow-key moves coalesce
consecutive presses for the same block into a single entry by
extending its `to` while keeping `from` pinned. `importJson`
clears history; the toolbar buttons are disabled when
`canUndo` / `canRedo` is false.

**Word-break: ellipsis everywhere labels overflow**

`word-break: break-all` split both CJK and Latin mid-glyph
(e.g. `governance` → `gover nanc e`). Replaced with
`text-overflow: ellipsis` + `white-space: nowrap` on sidebar
items, block labels, block sublabels, inspector card title,
and inspector `dd` cells. Each gets a `title=` attribute
carrying the full text so hover still shows the untruncated
value.

**Sidebar items: 44px min, explicit "+" button**

Sidebar item height went from ~30px to a 44px minimum
(meeting touch-target guidelines). Each item now also has a
visible "+" button on the right that adds the entity to
canvas center, with a one-line "Drag, or click +" affordance
in the sidebar header. The drag-and-drop path is unchanged.

**Block visuals: bigger, friendlier, delete always visible**

- Width 180px → 220px, padding 8/10 → 10/12, label 13px → 14px
- Delete button 18×18 → 24×24, default `opacity: 0.5`
  (was 0 — invisible until hover) so users can see the control
- Hover and selected states both raise opacity to 1.0

**Cozy 2.5D skin: simplified the 4-layer box-shadow stack**

Each block's hover/selected/dragging state had 4–6 stacked
`box-shadow` declarations totaling 6 lines per state. The
shadows were visually redundant (the cube illusion comes
from the `:before`/`:after` pseudo-element faces). Now each
state is one or two `box-shadow` declarations. The
pseudo-element faces, skew transforms, and warm palette are
preserved.

**Mobile (<1024px) inspector: bottom-sheet drawer**

Previously the inspector column simply disappeared at
`<1024px` (no media-query handling at all). Now it's a
fixed bottom-sheet with `transform: translateY(...)`
transitions, opened by the toolbar's "Open details" button
and closed by an explicit "Close" button in the inspector
header. The header is auto-shown on mobile when a block is
selected via tap.

**Empty state: 3-step onboarding instead of "👆 Enter"**

The empty canvas used to show a single line
`Empty canvas — pick a sidebar item and press {key}.`. Now it
shows a title ("Start by adding a block") + a 3-step numbered
list (drag from sidebar / click + / select to inspect) + a
keyboard-tip line. The text is `pointer-events: none` so it
never blocks drops.

**Subtitle rewritten to fix a positioning lie**

The old `compose.subtitle` claimed
"Drag blocks from the sidebar to plan a session — save as
Profile, apply, run." — but `/compose` cannot actually
save-as-Profile, apply, or run anything. It is a sandbox.
New subtitle:
"A free-form sandbox for arranging sessions, packs, profiles,
policies, and capabilities. Visualize combinations — it
doesn't actually configure pi."

**Files touched (v0.6.2)**

- `web/src/app/compose/page.tsx` — unchanged (server, still loads catalog + renders Hint)
- `web/src/app/compose/ComposeBoard.tsx` — major rewrite (826 → 1274 lines, adds toolbar + history + mobile drawer)
- `web/src/app/compose/compose.module.css` — full rewrite (510 → ~520 lines, same scope)
- `web/src/lib/compose-history.ts` — **new** (~110 lines, pure helpers)
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` — 22 new `compose.*` keys + subtitle rewrite
- `web/tests/compose-history.test.ts` — **new** (9 cases, unit-tests `applyEntry` / `invertEntry` round-trips)

**What's intentionally not in v0.6.2 (deferred to v0.6.3+)**

- Server-side persistence (`GET/PUT /compose/:name`) — localStorage only
- Block-to-block edges / connections
- Multi-board switching (currently one anonymous board per browser)
- Full mobile redesign (drawer is a pragmatic interim)
- Renaming `/compose` → `/sandbox` (would break URLs + i18n key prefixes + API paths — separate migration)

**Tests**

- core: 553/553 (no core changes this release)
- web: **189/189** (+9 history unit tests)
- `format:check` clean both repos
- `lint` clean (root)
- `tsc` clean (root + web)
- `npm run build` succeeds, all 30 routes SSG/SSR cleanly

### v0.6.1 — 9 bug fixes + PlanEditor (visual orchestration)

Hot on the heels of v0.6.0, this patch closes 9 issues
spotted during initial code review + builds the missing
plan editor. The PlanExecutor itself didn't change shape,
but the executor + planner are now much safer AND there
is finally a real way to construct a plan from the browser.

**P0 — `PlanExecutorRegistry.start` called `exec.run()` twice**

Two `void exec.run()` calls in the registry's start path
created duplicate promise objects + double error handling.
Consolidated into one `run().catch().finally()` so the
cleanup happens once.

**P1 — `finalize()` left stale `result: { success: true }` on cancelled plans**

When a plan was cancelled but had completed some tasks
(e.g. retried from a prior run), the old `result` field
survived the spread, producing the contradiction
`status: "cancelled" + result.success: true`. Now
cancelled plans explicitly set `result: undefined` to
keep the source-of-truth consistent.

**P1 — `runWithTimeout` could trigger `unhandledRejection`**

If `fn()` rejected AFTER the timeout already settled the
race, the rejection was detached and surfaced as
`unhandledRejection`. Attached a defensive catch so the
post-race rejection is observed without affecting the
race outcome.

**P1 — `evaluateCondition` used `new Function()` (code injection)**

The v0.6.0 condition DSL was implemented via
`new Function("ctx", "return (${trimmed});")` — fine for
trusted plans, but a real injection vector if plan TOMLs
ever came from untrusted sources. Replaced with a
hand-rolled recursive-descent parser supporting a closed
DSL: `true` / `false` / `step.<id>.success` /
`step.<id>.output.<key>` / `and(...)` / `or(...)` / `not(...)` /
`eq(...)` / `neq(...)` / `contains(...)`. Anything not in
the grammar evaluates to `false` (safe default — typos
never accidentally run the then-branch).

**P1 — `PiSessionRunner.cleanup()` leaked the abort listener**

Long plans accumulating closures on the caller's signal.
Now `cleanup()` explicitly calls `removeEventListener`
and clears both the signal + listener refs.

**P1 — `defaultPilotCommandHandler` returned `durationMs: 0`**

Caller never filled the real value. Now the handler
captures `Date.now()` at start and returns
`Date.now() - start` so the persisted step output has
real wall-clock duration.

**P2 — `PlanExecutor.dispatchers` type-unsafe entry keys**

`Object.entries(opts.dispatchers ?? {}) as Array<[StepAction["type"], ActionHandler]>`
silently accepted any string key. Typos (e.g.
`"pi-sassion"`) created dispatcher entries that would
never fire. Now we validate against the `StepAction` union
and warn at the boundary.

**P2 — `PiSessionRunner` output had `events: undefined` key**

`{ ...result, events: undefined }` produced a phantom
`events: undefined` field in JSON. Rebuilt the data
object to only emit fields that have values.

**P3 — `WelcomeBanner` had hardcoded English "Step N" + "Dismiss" aria-label**

Replaced with `t("home.welcome.stepN", { n })` and
`t("home.welcome.dismiss")`. Both keys added to en + zh
+ Dict type.

**`PlanEditor` (web) — visual plan builder**

`/plans/new` was a goal-only form. To actually build a
plan, the user had to hand-edit TOML on disk. v0.6.1
replaces it with `PlanEditor` (new client component,
~700 lines): add any number of tasks, each with its
own steps. Per-action-type fields render inline:
`pilot_command` (command + args), `pi_session`
(prompt + cwd), `profile_switch` (dropdown of
existing profiles, falls back to text), `pack_install`
(source), `policy_apply` (dropdown of existing
policies), `condition` (DSL text input + syntax hint
chip), `wait` (cosmetic label + timeoutMs), `manual`
(prompt textarea). Tasks support add / remove / move
up-down + dependsOn chip picker. Submit POSTs a
single JSON payload to the new `createPlanWithTasksForm`
server action → server validates against the zod
`Task` / `Step` / `StepAction` schemas and creates the
plan in one go.

**Server: `POST /plans` now accepts `tasks[]` and `strategy`**

Previously the route only took `{ goal, title, context }`.
The web editor's `PlanEditor` builds the full plan
structure and submits it in one POST; the zod validation
in `service.createPlan` is the source of truth for shape.

**Tests**

- `test/unit/plan-executor.test.ts` +7 condition DSL cases
  (`and` / `or` / `not` / `eq` / `neq` / `contains` / typo
  safety).
- `web/tests/plan-editor.test.tsx` (new, 9 cases):
  empty state, initial goal, add/remove/move tasks,
  action-type field switching, inline validation errors
  (no fetch), successful fetch on valid submit.
- core: 553/553 ✓ (+7)
- web: 180/180 ✓ (+9)
- tsc clean (root + web) · `npm run build` clean
- format clean (root + web) · lint clean

**Notes**

- `PlanEditor` uses `noValidate` on the `<form>` so
  custom inline validation runs before the browser's
  native HTML5 form-validation. `aria-required` is still
  set on the goal textarea for screen readers.
- The condition DSL intentionally uses loose equality
  (`==` / `!=`) for `eq` / `neq` so `eq("1", 1)` is
  true — plan DSLs cross type boundaries (string from
  a step's output, number from a constant). Lint is
  suppressed with an `eslint-disable-line` comment +
  rationale.
- `PlanExecutor.dispatchers` validation happens once
  at construction time; runtime overrides via the
  `dispatchers` constructor option skip the check
  (they're already typed by the caller).

### v0.6.0 — PlanExecutor 完整版 (pi_session + pack_install + condition + wait + retry/skip)

把 v0.5.23 MVP 留的 5 个 stub 拆掉了 4 个（保留 `manual`）。PlanExecutor 现在能跑 8 个 action type 中的 7 个真执行。retry / skip endpoint 接进 service + server。

**New: `src/core/pi-session-runner.ts`**

- `class PiSessionRunner` —— single-shot pi subprocess 包装。
- 用 upstream 的 `RpcClient`（不再用 v0.5.14 的 WebSocket bridge），
  spawn `pi --mode rpc`，发 `prompt`，等 `promptAndWait` 收完所有
  event，抓 last assistant text + session stats（tokens / cost）。
- `signal` 绑 abort → `rpc.abort()`。
- 单一子进程一次 prompt。multi-turn 走多个 `pi_session` step。

**Real action types (v0.6.0 加 4 个真)**

- `pi_session` → `defaultPiSessionHandler` → `PiSessionRunner`。
  cwd 来自 `step.action.cwd` / `step.input.cwd` / process.cwd() 顺序。
  model / provider 可被 `step.input` 覆盖。tokens 写到 `output.tokensUsed`。
- `pack_install` → `defaultPackInstallHandler` → `service.installPack(source)`。
  扩了 `PlanExecutorService` 加 `installPack`。`buildExecutorServiceForHome`
  实现了它。
- `condition` → `defaultConditionHandler` + 小的 DSL：
  - `"true"` / `"false"` 字面量
  - `"step.<id>.success"` —— 查 executor 内 `stepResults` map（每个 step 完成时 `completeStep` 会 `stepResults.set(id, success)`）
  - 其它 → 当 JS 表达式用 `new Function("ctx", ...)` 跑，ctx 是 `{ steps: { [id]: { success, summary, output } } }`。
  跑 then/else SubStep 列表（同一 executor 的 dispatcher）。branch 失败 → 整个 step 失败。
- `wait` → `defaultWaitHandler` → `setTimeout(timeoutMs)`，abort 立即 resolve。
  condition 字符串暂忽略（真 "wait until X" 需要 polling subsystem，留 v0.6.1）。

**STUBBED_ACTIONS 从 5 个缩到 1 个**

```ts
export const STUBBED_ACTIONS = new Set<StepAction["type"]>(["manual"]);
```

`manual` (waiting_human) 没真 UI 让用户 resolve 门，暂留 stub。

**Retry / skip endpoints**

- `service.retryTask(planId, taskId)` —— 把 task + 所有 step 重置成 pending，
  删 runtime snapshot 里这些 step 的 id，把 plan 从 failed 拉回 running，
  发 `task_started` event with `retried: true`，若 executor 不在跑了重新启动。
- `service.skipTask(planId, taskId)` —— task 标 skipped，发 `task_skipped`。
- 路由：`POST /plans/:id/tasks/:taskId/retry` 和 `/skip`。
- 限制：retry / skip 在 plan = {running, paused, failed} 时可用（retry 多了 failed），
  task 不能是 running。error 用 `PlanError(statusCode=409)` 标 409。

**Exposed dispatcher / context API（condition 用）**

- `executor.getDispatcher(type)` —— condition handler 拿同 executor 的 dispatcher 跑 SubStep。
- `executor.getRecordedStepSuccess(id)` / `getConditionContext()` —— condition DSL 查上下文。

**Tests**

- `test/unit/plan-executor.test.ts` +5 cases：wait timeout、condition
  `true` / `false` / `step.<id>.success`、pack_install、STUBBED_ACTIONS 收敛。
- `test/unit/service-plan-retry-skip.test.ts` (新, 7 cases)：retry 成功
  / running task 拒绝 / completed 拒绝 / 404 未知 task；skip 成功 / 409
  running / 409 completed。
- core: 546/546 ✓ (+12)
- web: 171/171 ✓
- tsc clean · build clean · format clean · lint clean

**Out of scope (deferred)**

- `manual` (waiting_human) 仍 stub —— 等 UI gate
- parallel / adaptive strategy
- WebSocket push live progress（仍 polling）
- FeedbackEngine
- multi-plan concurrent

### v0.5.23 — PlanExecutor MVP (sequential + 3 real actions + crash recovery)

The Plan data model + CRUD + UI shell have been in place since v0.5.7
+ v0.5.13, but `startPlan` / `pausePlan` / `resumePlan` / `cancelPlan`
only flipped status — they didn't actually run any steps. This
version lands a real `PlanExecutor` and wires the existing control
endpoints to it. It's the **MVP slice** of the full v0.6.0
「自适应执行引擎」(3-4 weeks of work); see
[`docs/v0.6.0-plan-executor-mvp.md`](./docs/v0.6.0-plan-executor-mvp.md)
for the scope decision.

**Core — `src/core/plan-executor.ts` (new, ~700 lines)**

- `class PlanExecutor` — single-plan runner. Async, single-process,
  no multi-plan locking.
- Sequential strategy only (parallel/adaptive are no-ops in MVP;
  the enum is preserved for v0.6.0).
- 3 real action types:
  - `pilot_command` — `child_process.execFile('pilot', [command, ...args])`
    with cwd/env from `step.input`. Honors the cancel signal by
    killing the child.
  - `profile_switch` — calls `service.activateProfile(name)`. Throws
    → step fails (e.g. profile TOML missing).
  - `policy_apply` — calls `service.applyPolicy(name)`. Writes the
    extension file under `~/.pilot/extensions/`.
- 5 stubbed action types (return success + `data: { stubbed: true,
  reason: "v0.5.23 MVP — full implementation in v0.6.0" }`):
  - `pi_session` (waiting for v0.5.14.3's bridge to be production-ready)
  - `pack_install` (pilot-tools 改造 in flight)
  - `condition` / `wait` / `manual` (real branching is v0.6.0)
- Persistence-first design: every step re-writes the plan TOML
  AND the runtime snapshot before moving to the next step.
- **Crash recovery**: the runtime snapshot at
  `~/.pilot/runtime/plans/<id>.json` records every completed step.
  On resume, anything in `completedStepIds` is skipped. The
  server's boot hook (`startServer`) calls `recoverRunningPlans`
  which scans for orphan snapshots and re-starts executors.

**Core — `src/core/plan.ts`**

- `PlanRuntimeSnapshot` interface + `writeRuntimeSnapshot` /
  `readRuntimeSnapshot` / `deleteRuntimeSnapshot` / `planRuntimePath`.
  Atomic write via tmp + rename.

**Service — `src/core/service-impl.ts`**

- `startPlanInHome` is no longer a status flip. After flipping
  status + writing `plan_started`, it hands off to
  `getDefaultRegistry().start(planId, service, home)` (fire-and-forget).
- `pausePlanInHome` / `cancelPlanInHome` tell the live executor to
  pause/cancel and immediately flip the plan TOML to the new
  status (so the UI reflects the user's intent without waiting
  for the in-flight step to finish).
- `resumePlanInHome` either resumes the live paused executor or
  starts a new one (if the previous one died). The snapshot
  guides it to the right checkpoint.
- `activateProfile` was extracted to a named function
  `activateProfileByName` so the executor's adapter can call it.
- `buildExecutorServiceForHome(home)` is the executor service
  adapter (exposes only `activateProfile` + `applyPolicy`).

**Server — `src/server/server.ts`**

- `startServer` calls `recoverRunningPlans` after `app` is
  constructed. Failures are logged but don't block boot.

**Tests — `test/unit/plan-executor.test.ts` (new, 12 cases)**

- `STUBBED_ACTIONS` exposes the 5 stubbed types.
- Linear profile_switch plan: 3 steps run in order, plan ends
  `completed`, runtime snapshot deleted.
- Failing step: 1st step succeeds, 2nd throws → task + plan end
  `failed`, step output captures the error.
- Stub action: `pi_session` + `wait` return success with the
  `stubbed: true` marker.
- Pause + resume: pause mid-plan (between s1 and s2), assert
  the run promise hasn't resolved, resume, let finish.
- Cancel mid-plan: assert status ends `cancelled`, in-flight
  step's "next" call never runs.
- Resume from snapshot: pre-write a snapshot saying s1 is done,
  start a fresh executor, assert it skips s1 and runs s2+s3.
- Registry: start/get/pause/cancel flow; pause + cancel return
  false when no live executor.
- `recoverRunningPlans`: real running plan is recovered, orphan
  snapshot (no matching plan) is cleaned up, stale snapshot
  (plan is no longer running) is cleaned up.
- Integration: `pilot_command` with `doctor --version` actually
  spawns the child and captures the result.

**Validation**

- core: 534/534 ✓ (+12)
- web: 171/171 ✓ (unchanged)
- tsc clean (root + web) · `npm run build` clean
- format clean (root + web) · lint clean

**Out of scope (deferred to v0.6.0)**

- `pi_session` / `pack_install` real execution
- `condition` / `wait` / `manual` real branching
- `parallel` / `adaptive` strategies
- `POST /plans/:id/tasks/:taskId/retry` / `skip` endpoints
- WebSocket push for live step progress (currently poll-based)
- `FeedbackEngine` + recovery strategies
- Multi-plan concurrent execution (single-process per plan in MVP)

### v0.5.22 — Bilingual glossary + /help i18n + per-page `<Hint>` i18n

Round three of the P2 hardcoded-English sweep. v0.5.18–v0.5.19 added the
components and the per-page Hints, v0.5.21 caught the NavLinks SSR
regression + WelcomeBanner strings, but the glossary data itself and
the inline `<Hint>` prose were still hardcoded English. This version
finishes the job: glossary is now bilingual, the `/help` page renders
in the active locale, and every per-page `<Hint>` is wired to a
`<RichT>` template so the prose + inline `<GlossaryTerm>` /
`<code>` / `<strong>` / `<em>` all switch together.

**Glossary data (v0.5.18's `lib/glossary.ts`)**

Old shape was `{short: string, definition: string}` — both English.
New shape is per-locale:

```ts
{ short: { en, zh }, definition: { en, zh } }
```

Two new helpers: `shortFor(term, locale)` and
`definitionFor(term, locale)`, both falling back to English if a
locale is missing. Default export of the `glossary` object is kept
for back-compat, plus the new `record` helper for callers that want
the raw per-locale shape.

`<GlossaryTerm>` now takes a `locale: Locale` prop. The 14 caller
sites (Dashboard `StatCard` + 11 server pages + 2 client
components) all updated. The `<T>`-style resolution still works at
SSR time — the locale comes from the existing
`negotiateLocale(Accept-Language)` in each page.

**`/help` page (server component)**

Was a plain sync component reading raw `entry.short` /
`entry.definition` — that no longer typechecks. Rewrote as an async
server component that:
- Negotiates `locale` from `Accept-Language` (same pattern as the
  other server pages).
- Renders glossary entries via `shortFor` / `definitionFor(key, locale)`.
- I18n'd the 6 "How do I…" cards (12 new keys: `help.howDo.*.title`
  + `help.howDo.*.body` for first session / find session / install
  tool / switch model / block dangerous / check spending).

**Per-page inline `<Hint>` (13 pages)**

`tools`, `context`, `capabilities`, `plans`, `compose`, `usage`,
`sessions`, `forge`, `packages`, `profiles`, `avatars`, `policy`,
`try` (client) — each had a 3-7 line English JSX paragraph with
inline `<GlossaryTerm>` / `<code>` / `<strong>` / `<em>`. Replaced
with `<RichT locale={locale} k="*.hint.body" values={...} />`. The
`summary` prop also became `<T k="*.hint.summary" />`. Placeholders
use `{s1}`, `{c1}`, `{em1}`, `{term}` style naming — generic
because each template's embeds are different.

**i18n keys added (39 total)**

- `hint.defaultSummary` (en + zh)
- 13 × `*.hint.summary` (en + zh)
- 13 × `*.hint.body` (en + zh)
- 12 × `help.howDo.*.title` / `help.howDo.*.body` (en + zh)

**Tests**

- `web/tests/onboarding.test.tsx` rewritten to use the new
  `shortFor` / `definitionFor` helpers and the `locale` prop.
  Added a zh-render case and a "every key has both locales populated"
  invariant. 9/9 ✓.
- core unit: 522/522 ✓ (unchanged)
- web: 171/171 ✓ (+1)
- format clean (root + web) · lint clean
- `npm run build` clean · tsc clean

### v0.5.21 — P0 SSR fix (NavLinks useT) + P2 hardcoded-English i18n

**P0 — NavLinks `useT()` from server (v0.5.18 regression)**

`NavLinks` was added in v0.5.18 without `"use client"` but called `useT()` (a client hook). tsc didn't catch it but `next build` failed at static-generation time:

> Error: Attempted to call useT() from the server but useT is on the client.

Fix:
- Removed the `useT()` call; `NavLinks` is now a Server Component that takes `locale: Locale` as a prop and uses the pure `renderT(locale, key)`.
- `NavTooltip` no longer needs `"use client"` — it's pure JSX, just receives pre-translated strings.
- `layout.tsx` passes the already-computed `locale` down.

Trade-off: the nav no longer re-renders on client-side language toggle. Acceptable because:
1. The `<LanguageSwitcher>` lives inside the same `<I18nProvider>` and updates its own labels instantly.
2. The page-level translations (most of the app) still update reactively because they use `useT()` from their own client components.
3. A future fix can add `router.refresh()` to `setLocale` to make the nav re-render too.

**P2 — Hardcoded English in WelcomeBanner + NavTooltip hints**

- `home.welcome.*` keys (en + zh) for the 3-step banner: title, intro, 3× (label, desc).
- `nav.hint.*` keys (en + zh) for the 15 nav tooltips.
- `page.tsx` now passes pre-translated strings to `<WelcomeBanner>` (the banner stays a client component, no internal i18n needed).

**Tests**
- `web/tests/nav-links.test.tsx` rewritten for the new server-component signature. Now covers both `locale="en"` and `locale="zh"` — the zh block asserts that every tooltip body contains Chinese characters and no raw `nav.hint.*` keys. 11/11 ✓.
- core unit: 522/522 ✓
- web: 170/170 ✓ (count unchanged — existing onboarding + new tree tests are unaffected)
- format clean (root + web) · lint clean
- **`npm run build` now succeeds** (was failing on every page with the P0 error).

### v0.5.20 — Session tree visualization on /try

Surface pi's full conversation DAG inside the chat page. The existing bubble-level fork action (v0.5.16) only worked for the visible turn — this version adds a sidebar-style view of all branches so users can see + fork from anywhere in the history.

**New component (`web/src/components/SessionTreeView.tsx`)**
- Fetches `GET /sessions/:id/tree` and renders a nested unordered list (depth-based indentation, vertical connectors on each level, siblingIndex/siblingCount for branch numbering).
- Highlights the linear path to the current leaf (best-effort: walk from the latest event timestamp back to root).
- Each user node gets a hover-revealed `↳` that calls `fork(entryId)` directly with the tree's node id — no need to look up via `get_fork_messages`.
- Stats line: total nodes / branch count / max depth.
- Empty / loading / error states.

**Try-page wiring**
- New collapsible "Conversation tree" `<details>` panel sits between SessionPanel and the chat area.
- `handleTreeFork(entryId, prompt)` reuses the same `forkedFrom` + local-messages-clear flow as the bubble fork.
- Extracted `forkByText(text)` so the existing bubble fork and the new tree-row fork share the same `get_fork_messages` lookup path.
- `latestEventTimestampMs` derived from the events stream powers the "current path" highlight.

**i18n**
- 6 new keys: `try.tree.title / hint / empty / stats / branches.one+other / depth`.

**Tests**
- New `web/tests/session-tree.test.ts` (7 cases): flatten linear / branching / deep trees, `findCurrentPath` no-events / linear / branch-divergence, type sanity.
- core unit: 522/522 ✓
- web: 170/170 ✓ (+7)
- format clean (root + web) · lint clean

### v0.5.19 — Per-page beginner guidance for the remaining 11 pages

v0.5.18 added the shared components (Hint, GlossaryTerm, WelcomeBanner, NavTooltip) and the `/help` page, and applied them to Dashboard / Sessions / Try. This version finishes the pass: every remaining page now opens with a collapsible "What is this?" Hint, and inline jargon is wrapped in `<GlossaryTerm>` so the same definition is used everywhere.

**Pages updated**
- **Usage** — what tokens / cache read / cost mean; per-model rate is set in profile.
- **Tools** — built-in vs local vs npm sources; what each safety badge (`read` / `write` / `exec` / `network` / `secret`) means.
- **Context** — what "loaded" vs "info" files are; where to find the Discovery rules.
- **Capabilities** — what a capability is, where they come from (packages), and why conflicts matter.
- **Avatars** — what an avatar is, and the avatar vs profile distinction.
- **Plans** — what a plan is (goal / tasks / steps) and that v0.6.0 adds the executor.
- **Packages** — what a package is and the install workflow.
- **Profiles** — what a profile is and the profile vs avatar distinction.
- **Forge** — what forge is for (absorbing local extensions without publishing).
- **Policy** — what a policy is and the apply / unapply / dry-run flow.
- **Compose** — what compose is for (visual sandbox, not a real config tool).

**Glossary**
- New entry: `tool` (function pi can call; listed in /tools).
- 14 entries total now.

**Tests**
- `web/tests/onboarding.test.tsx` +1 (GlossaryTerm accepts the new `tool` key).
- core unit: 522/522 ✓ (unchanged)
- web: 163/163 ✓ (unchanged — only +1, and that one already passed since the v0.5.18 file)
- format clean (root + web) · lint clean

### v0.5.18 — Beginner-friendly guidance (welcome banner, glossary, /help, redesigned nav)

Massive onboarding pass. Every page should now make sense to a first-time user without external docs.

**New shared components**
- `<Hint>` — inline collapsible "What is this?" / "What's a session?" expandable. Use anywhere you'd write a footnote.
- `<GlossaryTerm>` — dotted-underline inline jargon with the canonical definition as the `title` (hover) + `aria-label`. Backed by `lib/glossary.ts` (13 entries: pilot, pi, session, capability, avatar, profile, pack, fork, context, policy, plan, rpc, token, contextWindow) — same definition used everywhere.
- `<WelcomeBanner>` — dismissible 3-step first-visit card. SSR-safe (checks localStorage in `useEffect`). Shown once per browser per `dismissKey`.
- `<NavTooltip>` — popover-on-hover wrapper around a nav link. Pure CSS `:hover`/`:focus-within`, zero JS state.

**Nav redesign**
- Icons (emoji, decorative) on every item: 🏠 💬 📋 📊 🔧 📄 🧩 🎭 📝 📦 🛠 🛡 🧪 👤 ❓
- One-line tooltip on every item ("Browse past pi conversations" etc).
- Reorder: Try pi moves to position 2 (most natural starting point for beginners).
- New third group: **Learn** with `/help`.

**`/help` page (new)**
- "How do I…" — 6 starter cards (start first session, find past session, install a tool, etc).
- "Glossary" — full 13-term list with id anchors so other pages can deep-link.
- "Architecture" — one-paragraph explainer of pilot / pi / WS bridge / RPC.

**Per-page improvements (v0.5.18 ships Dashboard / Sessions / Try; remaining pages in v0.5.19)**
- **Dashboard**: WelcomeBanner on top; StatCards gain inline `?` GlossaryTerm on Sessions + Tokens (`title=` definitions on hover).
- **Sessions**: top-of-page `<Hint summary="What's a session?">` paragraph.
- **Try**: top-of-page `<Hint summary="What is this page?">` paragraph explaining Connect / Fork / Rename / Clone + the `<GlossaryTerm term="rpc">RPC</GlossaryTerm>` link.

**Tests**
- New `web/tests/onboarding.test.tsx` (8 cases): Hint expand/collapse, GlossaryTerm canonical text + title + aria-label, every glossary key has non-empty short + definition.
- Updated `web/tests/nav-links.test.tsx` (now 16): three groups, 15 items, Learn → /help, Inspect order includes Try pi at position 2.
- core unit: 522/522 ✓ (unchanged)
- web: 163/163 ✓ (+10)
- format clean (root + web) · lint clean

### v0.5.17 — Mobile responsive /try + duplicate-bubble fix

Two issues from a phone-sized viewport test:

1. **Duplicate user bubbles** — `chat-stream.ts`'s reducer created a second user bubble from pi's `message_start` event (pi echoes the user message into its session) on top of the locally-synthesized one. The reducer now skips `role: "user"` events so user bubbles come from `userMessage()` only. New test: `skips user-role message_start events`.
2. **Mobile responsive** — `<640px` viewports were cramped (3 stacked button rows, tiny bubbles, no sticky input). New layout:
   - **Overflow menu** (`components/OverflowMenu.tsx`) collapses Connect / New session / Abort / Disconnect / Rename / Clone behind a single `⋯` button on mobile. Native `<details>` for free click-outside-to-close + keyboard nav, no JS state machine.
   - **SessionPanel `compact` mode** — mobile shows just session name + count; the rename + clone buttons move to the overflow menu. Desktop keeps the full inline panel.
   - **Chat bubbles** go `max-w-[92%]` on mobile (was `max-w-[80%]`) so the chat feels less cramped on phones.
   - **Input bar sticky bottom** on mobile (`sticky bottom-2`); buttons get a `min-h-[44px]` touch target.
   - **Header subtitle** hidden on mobile, shown at `sm:` and up.
   - **Page height** uses `100dvh` on mobile (handles mobile browser chrome) and `100vh` on desktop.

**Tests**
- `web/tests/chat-stream.test.ts` +2 (now 8): user-role events filtered, helper is the canonical source.
- `web/tests/overflow-menu.test.tsx` (new, 3 cases): trigger renders, item click invokes callback, disabled disables.
- core unit: 522/522 ✓ (unchanged)
- web: 153/153 ✓ (+5)
- format clean (root + web) · lint clean (`--max-warnings 0`)

### v0.5.16 — Session tree actions (rename / clone / fork per bubble)

Wire pi's session tree into the `/try` chat UI. The page already streamed messages, but until now you couldn't see or control the tree.

**New components**
- `web/src/components/SessionPanel.tsx` — header strip showing current session name (clickable to inline rename via `set_session_name`), message count (with `.one`/`.other` plural keys), and a Clone button (`clone()` — copies the current branch into a new session file).
- `web/src/components/BubbleActions.tsx` — hover-revealed "Fork from here" trigger on every user bubble. Opens a confirm panel before invoking `fork(entryId)`, since forking creates a new session file.

**Wiring (`web/src/app/try/page.tsx`)**
- `get_state` is called on connect + after every mutation (`prompt`, `rename`, `clone`, `fork`). Pi doesn't emit public `session_forked` / `session_switched` events, so polling-on-mutation is the simplest reliable sync.
- `fork` flow: click → `get_fork_messages()` → match the bubble's text against `entryId` → `fork(entryId)` → clear local user bubbles → re-fetch state. The header shows `↳ Forked from "<oldName>"` until the user sends a new message in the new branch.
- `clone` flow: capture name, clear bubbles, `clone()`, re-fetch state.
- `rename` flow: click name → inline edit (Enter saves, Esc cancels) → `set_session_name(name)` → re-fetch.

**i18n**
- 15 new keys (`try.session.*`): title, unnamed, rename + placeholder + save/cancel, clone + hint, messageCount.one/other, forkedFrom, forkHere, forkConfirm, forkButton, forkCancel, cloneOk. en + zh.

**Tests**
- New `web/tests/try-session.test.tsx` (9 cases): unnamed rendering, name + count, singular/plural, forkedFrom indicator, onClone callback, onRename trim, BubbleActions disabled / confirm / cancel.
- core unit: 522/522 ✓ (unchanged)
- web: 148/148 ✓ (+9)
- format clean (root + web) · lint clean (`--max-warnings 0`)

### v0.5.15 — Try pi: chat UI in the browser

Replace the v0.5.14 `/playground` page (raw JSON event log) with a real chat interface for talking to pi from the browser. Rename to `/try` ("试玩" / "Try pi") to match what the page actually does.

**New module (`web/src/lib/chat-stream.ts`)**
- `ChatMessage` / `ContentBlock` model — `{ role, blocks: text | thinking | toolCall[], status }` — independent of pi's SDK types so the web bundle stays light.
- `reduceStream(events)` — pure reducer that turns pi's `AgentEvent` stream into a `ChatMessage[]`. Handles `text_delta` / `thinking_delta` accumulation, `toolcall_start/end` + `tool_execution_start/update/end` lifecycle, `message_end` status flip.
- `userMessage(text)` — synthesize a local user bubble for display (pi doesn't emit a `message_start` for the prompt we sent).

**Rewritten page (`web/src/app/try/page.tsx`)**
- Real chat layout: user bubbles on the right (accent color), assistant bubbles on the left (surface-2), auto-scroll.
- Per-block rendering: text, thinking (collapsible), tool calls (collapsible, with args + result + error indicator).
- Status pill + Connect/Disconnect/New session/Abort buttons in a single header row.
- Cmd/Ctrl-Enter to send.
- Raw event stream collapsed into a "Developer details" `<details>` panel — devs can still see the bridge events without cluttering the chat.

**Renames**
- Route `/playground` → `/try` (URL).
- Nav label "Playground" / "试玩" → "Try pi" / "试玩 pi".
- All i18n keys `playground.*` → `try.*` (en + zh). 7 new chat-specific keys (`try.chat.emptyConnected`, `try.thinking`, `try.streaming`, `try.tool.executing`, `try.tool.result`, `try.tool.error`, `try.tool.args`, `try.developerDetails`, `try.developerDetailsHint`).

**Tests**
- New `web/tests/chat-stream.test.ts` (6 cases): text delta accumulation; thinking + text in separate blocks; tool call lifecycle (`start`/`update`/`end`); streaming status flip; unknown / lifecycle events ignored; `userMessage()` shape.
- core unit: 522/522 ✓ (unchanged)
- web: 139/139 ✓ (+6)
- format clean (root + web)
- lint clean (`--max-warnings 0`)

### v0.5.14.3 — Playground placeholder i18n + lint cleanup

Two small follow-ups from v0.5.14 review.

**Web (`web/src/app/playground/page.tsx`)**
- **P1** The `<textarea>` placeholder was a literal `"playground.prompt.placeholder"` string, showing the raw i18n key to users. Now uses `useT()` to translate the key — matches the `<T k="..." />` pattern used everywhere else on the page. Both en (`e.g. "List the files in the current directory"`) and zh (`例如："列出当前目录的文件"`) values render correctly.

**Tests (`test/unit/pi-rpc-bridge.test.ts`)**
- **P2** Drop the three `// eslint-disable-next-line @typescript-eslint/no-explicit-any` directives. The `no-explicit-any` rule isn't actually enabled (we use `any` nowhere else), so the disable directives were unused and triggered `--max-warnings 0` lint failure. Replace `(bridge as any).rpc = ...` with the structural `(bridge as unknown as { rpc: RpcClient }).rpc = ...` cast — same effect, no rule needed.

**Stats**
- core unit: 522/522 ✓ (unchanged)
- web: 133/133 ✓ (unchanged)
- bridge unit: 5/5 ✓ (unchanged — all 5 still pass with the new cast)
- format clean (root + web)
- lint clean (`--max-warnings 0`)

### v0.5.14.2 — P0#1 id-matching fix + .once() portability

Bug复查发现 v0.5.14.1 的 P0#1 修复不完整：客户端 `usePiSession.onmessage` 没有真正按 id 匹配，仍然走 FIFO fallback。修了。

**Web (`web/src/lib/usePiSession.ts`)**
- **P0#1** Fix id matching. The previous `if (!pending)` branch unconditionally fell through to FIFO by command-type — the id-based lookup was missing entirely. Now: if `msg.id` is present and the pending map has it, look up directly; otherwise fall back to FIFO. Two concurrent `prompt` calls now route correctly.
- Type `PiCommandResponse` gains `id?: string` on both success and failure variants.

**Server (`src/server/server.ts`)**
- **Defensive** Change `socket.once("close", ...)` to `socket.on("close", ...)` at the WS route. `@types/ws` doesn't always declare `.once()` on its `WebSocket` type (depends on the version installed), and `.on()` is functionally equivalent here (the socket is already closed by the time the callback runs).

**Tests**
- New `web/tests/use-pi-session.test.tsx` (4 cases): two in-flight same-type commands route by id; FIFO fallback when response has no id; error response rejects the right Promise; 30s timeout fires (`vi.useFakeTimers`).
- core unit: 522/522 ✓ (unchanged)
- web: 133/133 ✓ (+4)

### v0.5.14.1 — Pi RPC bridge hardening (P0/P1/P2 audit follow-up)

Address the 12-item bug report from a self-audit of the v0.5.14 WebSocket bridge. No new features; all changes are correctness / robustness / i18n hygiene.

**Server (`src/server/pi-rpc-bridge.ts`)**
- **P0#1** Echo the request `id` in every `kind: "response"` so the browser can match by id instead of FIFO by command type. Without this, two in-flight commands of the same type (e.g. `prompt` + `abort`) would deadlock.
- **P1#3** Add a `default` arm to the dispatch switch that returns `{success: false, error: "unknown command: <type>"}` instead of falling through silently.
- **P1#5** Decode `Buffer | ArrayBuffer | Buffer[]` raw payloads before `JSON.parse` — the bridge's `socket.on("message", cb)` callback receives typed arrays depending on the WS frame, and `JSON.parse(Buffer)` throws. Tests cover both Buffer and string inputs.
- **Refactor** Move the constructor-registered listener callback into a private `onMessage(raw)` method so the dispatch logic is unit-testable without spawning pi. The constructor only registers the listener.

**Server (`src/server/server.ts`)**
- **P1#4** New `onClose` hook on the WebSocket route iterates `liveBridges` and calls `bridge.close()` on every active bridge when the server shuts down. Without this, a SIGTERM leaves orphan `pi --mode rpc` subprocesses.

**Web (`web/src/lib/usePiSession.ts`)**
- **P0#1** `sendCommand()` now matches pending requests by response id first, falling back to FIFO by command type for backwards compat. Adds a `PendingCommand.timeoutId` field and a 30s `setTimeout` so a hung server doesn't pin a React effect forever.
- **P2#8** `safeStringify(payload)` wraps `JSON.stringify` in `try/catch` and returns a `{kind: "raw", payload}` envelope on failure so the playground event log still shows something useful for cyclic structures.

**Web (`web/src/app/api/pi/token/route.ts`)**
- **P1#6** Reject non-localhost requests with 403. Parse `x-forwarded-for` first hop (real client IP behind a reverse proxy), allow `127.0.0.1` / `::1` / `localhost` / empty host. The endpoint already required same-origin but a `fetch()` from an injected script could still steal the token.

**Web (`web/src/app/playground/page.tsx`)**
- **P2#7** Replace all hardcoded English strings with `<T>` calls. Adds 23 new i18n keys (`playground.*`).
- **P2#10** Use `${type}-${counter}` as React list keys instead of array indices — preserves scroll position when events are prepended in the log.
- **P2#8** Use the shared `safeStringify` helper to avoid event-log crashes on cyclic payloads.

**Web (`web/src/app/sessions/[id]/page.tsx`)**
- Replace hardcoded `$${info.totalCost.toFixed(4)}` with `renderT(locale, "currency.usd", {amount})` so cost display respects locale.

**Tests**
- core unit: **522/522** ✓ (+5 in `test/unit/pi-rpc-bridge.test.ts`)
- web: **129/129** ✓ (unchanged)
- integration smoke: 2/2 skipped by `npm run test:offline` (unchanged)

### v0.5.14 — Pi RPC bridge (browser → pi via WebSocket)

Pilot server now proxies pi's typed RPC protocol over WebSocket. Browser tabs can `usePiSession()` to spawn a fresh `pi --mode rpc` subprocess and exchange commands + events.

**Server**
- `src/server/pi-rpc-bridge.ts` (new): wraps `@earendil-works/pi-coding-agent`'s `RpcClient`. Auto-resolves pi's CLI path (`npm root -g` first, `which pi` fallback). Each WS connection gets a fresh RpcClient.
- `src/server/server.ts`: `GET /api/pi/ws` route registered with `@fastify/websocket`. Auth via `Sec-WebSocket-Protocol: pilot-token-<TOKEN>` (browsers can't add custom headers to WS). The global `onRequest` hook skips the token check for `Upgrade: websocket` requests so the bridge can validate the subprotocol itself.
- New `@fastify/websocket@11.3.0` + `@types/ws` dev dep.

**Web**
- `app/api/pi/token/route.ts` (new): exposes the pilot server token to same-origin JS. Used by `usePiSession` to authenticate the WS handshake.
- `lib/usePiSession.ts` (new): client-side hook. Fetches token, opens WS, splits incoming messages into events (`{kind: "event"}`) and command responses (`{kind: "response", command, success, data}`). Pending requests matched by command-type FIFO since server doesn't echo ids.
- `app/playground/page.tsx` (new): interactive demo — Connect / Send prompt / Abort / New session / Disconnect, with scrolling event log.

**i18n**
- 1 new key: `nav.playground` (en + zh).

**Tests**
- core unit: 38/38 ✓ (unchanged)
- web: 129/129 ✓ (nav updated to 14 items / 9 Inspect)
- integration smoke (new): `test/integration/pi-rpc-bridge.smoke.test.ts` — 2 tests (bad token rejected, valid token gets a `get_state` response). Skipped by `npm run test:offline`.

**E2E verified**
- Open `ws://127.0.0.1:17361/api/pi/ws` with subprotocol `pilot-token-<tok>` → server validates token → spawns pi → bridges events + responses.
- `get_state` returns full session state (`{model, thinkingLevel, isStreaming, ...}`) in ~600ms over local WS.

### v0.5.13 — Web UI for Plans (DAG + event log)

**后端**

- `core/plan.ts`: `listPlanEvents(planId)` — 读取 `~/.pilot/plans-history/<id>_*.jsonl`，按时间戳升序合并所有匹配文件，跳过损坏行。
- `core/service.ts` + `service-impl.ts`: `getPlanEvents(id)` 服务方法 — plan 不存在返回 null，存在但无事件返回 `[]`。
- `server/server.ts`: `GET /plans/:id/events` — 静态路径注册在 `/plans/:id/*` 通配之前；plan 不存在返回 404。

**前端**

- `components/PlanStatusPill.tsx` — Plan / Task / Step 三种状态的彩色 pill，复用 v0.5.11 的 `.pill.ok|warn|error|neutral` token。
- `components/PlanTaskGraph.tsx` — 任务依赖图（3 列表格：任务 / dependsOn / blocks），server-component，无 JS。
- `components/PlanEventTimeline.tsx` — 事件日志，按时间倒序展示 18 种事件类型，自动从 data 字段提取摘要（goal / summary / error / taskId / stepId）。
- `app/plans/[id]/page.tsx` — 重构为 5 个独立 section，使用 `<PlanStatusPill>`、`<PlanTaskGraph>`、`<PlanEventTimeline>`，消除所有硬编码英文（`[step.status]` / `[task.status]` / `branch` / `profile:` / `tools:`）。

**i18n (en + zh)**

- 49 个新 key：6 个 task 状态、5 个 step 状态、8 个 action type 标签、18 个 event type 标签、6 个 detail 字段（dependsOn / retries / action / graph / events / blocks / tasksByStatus）。
- 修复 dashboard `Empty` 命名冲突（v0.5.12 已做）。

**测试**

- core: 38/38 ✓（新增 5 个 `listPlanEvents` 测试覆盖空目录、无匹配、多文件合并、损坏行跳过）。
- web: 129/129 ✓（新增 11 个 plan UI 测试覆盖 3 个新组件的 props / tone / 空状态 / 时间格式）。
- 端到端验证：手动触发 create → start → cancel，3 个事件正确出现在 timeline。

**未做（按计划推迟到 v0.6.0）**

- retry/skip 按钮 — 需要 PlanExecutor 就绪才有 `POST /plans/:id/tasks/:id/retry` 这种 endpoint。本次没做按钮避免承诺无法兑现的能力。
- 实时刷新 — 没有 WebSocket / SSE 桥。本次数据来自每次页面重新加载（dashboard 已有 10s `pulse()` 模式自动 refresh）。

### v0.5.12 — audit follow-up (12 items)

Round 2 of the v0.5.11 audit. Closes the remaining 6 P1 + 6 P2 items and adds a project-context discovery panel.

**Web UI**

- `RichT` component — translates a key with `{name}` placeholder values that can themselves be `ReactNode` (`<code>`, `<a>`, etc.). Replaces inline-English `<>...</>` JSX in `EmptyState` hints across 6 pages.
- `packages.installed.emptyHint`, `usage.empty.hint`, `tools.empty.hint`, `context.empty.hint`, `capabilities.empty.hint`, `sessions.empty.hint` — new i18n keys, with `dir`/`cmd`/`link`/`file1`/`file2` placeholders. Both en + zh.
- `compose.inspector.blockCount` (ICU plural: `n block` / `n blocks`) and ZH `n 个块`.
- `compose.inspector.openDetail`, `compose.inspector.remove`, `compose.announce.removedBlock`, `compose.announce.addedBlock`, `compose.aria.addEntity` — i18n'd the 10 hardcoded English strings in `ComposeBoard` (announcements, aria-label, inspector labels, action buttons).
- `profiles.packageCount` (ICU plural) + ZH `n 个包`.
- `usage.loadError`, `tools.loadError` — i18n'd the "Couldn't load …" error surface on `/usage` and `/tools`.
- `currency.usd` — unchanged from v0.5.11.
- `home.unit.messages`, `home.unit.calls` — i18n'd the dashboard's `${m.messages} msg` / `${t.count} calls` count units.
- Section headings unified to `section-h2` across `packages`, `usage`, `tools`, `context`.
- Inline Tailwind buttons collapsed to `.btn` / `.btn.secondary` / `.btn.danger` — `plans/[id]` (pause/resume/cancel), `plans/new` (cancel), `plans` (suggest-tools + new), `profiles` (create), `avatars` (capture).
- `pack → var(--cozy-accent-2)`, `profile → var(--cozy-profile)` (new token), `policy → var(--hitl)`, `capability → var(--cozy-accent)` — hardcoded hex tints in `KIND_META` now reference CSS palette tokens.
- `--cozy-profile: #7b8fa1` added to `globals.css` (slate blue, modern-mode profile tint).
- PolicyForm CSS tightened — input `font-size: 14px → 13px`, textarea `padding: 8px → 6px` to match the rest of the form controls.
- `<DiscoveryRules>` collapsible panel on `/context` — exposes the filename priority (AGENTS.md > AGENTS.MD > CLAUDE.md > CLAUDE.MD) and search path (`~/.pi/agent/` → cwd → .../parent → .../grandparent → ...) plus an informational-only clarification. Previously users saw the results without knowing the rules.
- Dashboard: `Empty` helper removed in favor of `<EmptyState>` from `@/components/EmptyState` (renamed local `EmptyState` → `EmptyStateCards` to avoid the collision).

**Test counts**

- web: 118/118 ✓
- core: 512/513 (1 pre-existing flaky `[network] absorb` timeout when run with the full suite — passes when isolated, unrelated to these changes)

## [0.4.0](https://github.com/wwppee/pilot/compare/v0.3.10...v0.4.0) (2026-07-02)


### Features

* add CI + release badges to README ([04425e8](https://github.com/wwppee/pilot/commit/04425e899260aa9985270c012f156bcde0578e5c))
