# Changelog

## Unreleased

### v0.6.21 — Cleanup batch (AGENTS.md + empty state dedup + placeholder audit)

A small user-flagged cleanup release that closes three
leftover P2/P3 items that didn't fit cleanly into a
feature release. No new features, no schema bump; this is
a hotfix-shaped release that nudges a few long-standing
paper cuts and adds a regression test so the placeholder
audit doesn't drift again.

**P2 — AGENTS.md version drift (1 fix)**

- **`AGENTS.md` was last touched at v0.6.14** but the
  project is now at v0.6.20. Two places (the "30 秒
  判断题" header and the "Last updated" footer) still
  said `v0.6.14`. Bumped to `v0.6.20` and re-dated the
  "Last updated" line to the cleanup itself.
  Future version bumps should remember to update both
  spots — this is a recurring maintenance task and not
  enforced by any test.

**P2 — `/usage` empty state duplicated its actionable hint (1 fix)**

- **`usage.empty` (en + zh) re-stated the same "run pi
  with a real model" message that `usage.empty.hint`
  already said.** Because `EmptyState` renders both
  `title` and `hint` paragraphs, the user saw the
  actionable message twice — once in bold (title) and
  once muted (hint). The fix makes the title a short
  descriptive label ("No usage data yet." / "暂无用量数据。")
  and lets the hint carry the actionable next step
  alone. Net: the page now reads like the rest of the
  empty states in the app.

**P3 — Placeholder parameter audit (7 fixes)**

- v0.6.16 closed 8 of 15 placeholder-parameter drifts
  between en and zh but punted the rest with "doesn't
  impact rendered output". v0.6.21 finishes the job:
  - **2 hardcoded-`"1"` in en** (`compose.inspector.blockCount.one`,
    `profiles.packageCount.one`) — en was using `"1 block"` /
    `"1 package"` literally while zh used `{n}`. Both now
    use `{n}` so a future locale (fr / ru / etc.) sees a
    consistent template and can pass `n=1` from the
    same call site.
  - **5 en-only plural-suffix placeholders** (`{s}` /
    `{es}`) — en had custom plural-suffix slots for
    "1 profile / 2 profiles", "1 session / 2 sessions",
    "1 tool / 2 tools", "1 match / 2 matches", "1 tool".
    Chinese doesn't need plural suffixes; English is
    fine with always-plural forms. Dropped the suffix
    and made en always plural ("{n} profiles", "{n} matches",
    etc.). The call sites that pass `s: ...` still do so
    — unused params are silently ignored, so the dead
    code is harmless and removing it is a follow-up
    cleanup, not a v0.6.21 concern.
  - **1 zh missing `{n}`** (`tools.subtitle`) — en was
    showing "{n} tools ... built-in ({builtin}) ... npm
    extensions ({npm})" while zh was just "内置 {builtin}
    个，npm 扩展 {npm} 个" (no total count). Aligned both
    to show the total + the two breakdown counts.
  - Net result: 0 placeholder mismatches across 975
    shared keys. Verified with a new regression test
    (see Tests below).

**P3 — Regression test (1 add)**

- **`tests/i18n.test.ts` now has a `placeholder
  consistency across locales` block.** It walks every
  key present in both `dict.en` and `dict.zh`, computes
  the set of placeholders each value uses, and asserts
  the sets are equal. On failure it dumps the full list
  of offenders so a single test run shows every
  mismatch (not just the first one to trip). This is
  the "make the v0.6.16 P3 decision permanent" test:
  any future translator adding a new locale will see a
  clean baseline to extend from, and any future feature
  work that introduces a new placeholder will surface
  the inconsistency in CI rather than in production.

**Stats**

- root: **551/551** ✓ (unchanged — no core changes)
- web: **226/226** ✓ (was 225; +1 in `i18n.test.ts` —
  placeholder consistency check)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run (i18n string changes +
  AGENTS.md doc; no production-affecting logic)

**Deliberately NOT done (v0.6.22+ backlog)**

- block-center avoidance for orthogonal routes (real A*
  grid router on top of the v0.6.20 `route` enum) — this
  was originally planned for v0.6.21 but the cleanup
  batch bumped that slot
- ComposeBoard.tsx hooks/state 抽离
- per-direction palette (e.g. "all forward connections
  get this color") — deferred; per-edge is the v0.6.19
  minimum

### v0.6.20 — Per-edge routing style (curve / orthogonal)

The `/compose` inspector now lets each connection choose between
the original cubic bezier (`"curve"`, the v0.6.19 look) and a
3-segment right-angle polyline (`"orthogonal"`, Visio /
Lucidchart style). The choice is per-edge, so a single board
can mix both: a "main flow" line curves smoothly while a
"control plane" line goes through right angles.

**Scope of v0.6.20 (deliberately minimal)**

- The two routing styles are the v0.6.20 surface — pick
  one, the renderer takes care of the rest.
- **Block-center avoidance is out of scope.** A connection
  that goes through other blocks in the middle will still
  do so with `"orthogonal"`. A real A* grid router (or
  visibility-graph) on top of this enum is a separate
  concern and would need its own release.

**Schema**

- **`ComposeConnection.route?: "curve" | "orthogonal"`**
  (default `"curve"` when missing). Same omit-the-default
  pattern as `dir` (v0.6.18) and `color` (v0.6.19): a
  v0.6.19 board round-trips through v0.6.20 byte-identical.
- **Schema bumped to v6**. v1 / v2 / v3 / v4 / v5 boards
  continue to load — `route` defaults to `"curve"` when
  missing, so v0.6.20 is fully backward-compatible with
  v0.6.19 saves.

**UI**

- **ConnectionPath** uses a single SVG `<path>` for both
  styles. The `curve` case is the original `C ...` cubic
  bezier; the `orthogonal` case is a 3-segment `M ... L
  ... L ... L ...` polyline (right → up/down → right).
  Both end with a horizontal segment, so the v0.6.18
  marker logic (`markerStart` / `markerEnd` with
  `orient="auto-start-reverse"`) keeps working without any
  marker changes. The `data-route` attribute is exposed
  on the `<g>` for test selectors.
- **Inspector** gets a 5th control next to the color
  picker: a `<select>` with the two options. The label
  ("Routing" / "路径") and option labels ("Curve" / "曲线"
  and "Orthogonal" / "直角") are i18n'd.

**History**

- New history entry type `updateConnectionRoute` (one
  concern per entry, same pattern as the four other
  connection-level history types). Stores `{ connectionId,
  fromRoute, toRoute }` so undo/redo round-trips without
  re-fetching live state. `toRoute = ""` and `toRoute =
  "curve"` both mean "default" — when restoring the
  default we `delete next.route` rather than set it to
  `"curve"`, so the persisted JSON stays minimal and
  v0.6.20 ↔ v0.6.19 round-trip is lossless.

**i18n**

- **4 new keys**: `compose.connection.route.label`,
  `.curve`, `.orthogonal` (the option labels, both
  translated) and `compose.announce.connectionRouteUpdated`
  for the live-region message. The `{route}` placeholder
  receives the translated label, not the raw enum value.

**Stats**

- root: **551/551** ✓ (was 548; +3 in `compose-boards.test.ts` —
  v6 schema acceptance, non-enum rejection, v5 backward
  compat).
- web: **225/225** ✓ (was 221; +4 in `compose-history.test.ts` —
  set orthogonal, drop back to curve (delete key),
  explicit value swap, invertEntry round-trip).
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run this round (pure SVG-path
  variant, no production-affecting logic; same precedent
  as v0.6.19).

**Deliberately NOT done (v0.6.22+ backlog — placeholder audit closed in v0.6.21)**

- block-center avoidance for orthogonal routes (real A*
  grid router or visibility-graph on top of the v0.6.20
  enum)
- ComposeBoard.tsx hooks/state 抽离
- per-direction palette (e.g. "all forward connections get
  this color") — deferred; per-edge is the v0.6.19 minimum
  and the schema's `color?: string` field already supports
  a future palette expansion without a v6 bump.

### v0.6.19 — Per-edge connection color (hex picker)

The `/compose` inspector now offers a native color picker
next to the existing label / kind / direction controls. Each
edge can pick its own stroke color (hex) and the SVG line +
arrow head render in that color, so a 10-edge board can have
10 distinct colors without a single line crossing the theme
palette.

**Schema**

- **`ComposeConnection.color?: string`** — hex string
  matching `^#[0-9a-fA-F]{3,8}$` (`#rgb` / `#rgba` /
  `#rrggbb` / `#rrggbbaa`). Constrained to the format the
  native `<input type="color">` emits (`#rrggbb`) plus a
  few extra digit counts to leave room for future
  alpha-aware palette presets. Named colors (`"red"`,
  `"crimson"`) and `rgb()` / `hsl()` are deliberately
  rejected — if the user wants a theme color, they leave
  the field empty and the renderer falls back to
  `currentColor`. Missing `color` is the default.
- **Schema bumped to v5**. v0.6.18 (v4) and earlier boards
  continue to load — `color` defaults to undefined and
  the SVG falls back to the theme accent, so v0.6.19 is
  fully backward-compatible with v0.6.18 saves.
- **Dedupe key unchanged.** Still `(from, to, dir)` —
  `color` is a property of an edge, not a new dimension.
  The same edge with two different colors is two separate
  connections.

**UI**

- **ConnectionPath** threads `color` through the
  `style.color` attribute on the wrapping `<g>`. The line
  + arrow head both consume `currentColor` (set on the
  parent SVG style), so the single `style.color = <hex>`
  cascades to both — no new marker definitions, no
  per-color clones. `data-has-color="1|0"` is exposed on
  the `<g>` for test selectors.
- **Inspector** gets a 4th control next to the dir select:
  a native color swatch (`<input type="color">`) plus a
  small `↺` reset button (visible only when a color is
  set). The reset drops the `color` key from the
  connection, restoring the theme default.

**History**

- New history entry type `updateConnectionColor`
  (separate from `updateConnectionLabel` and
  `updateConnectionDir` — three concerns, three history
  entry types, undo granularity stays narrow). Stores
  `{ connectionId, fromColor, toColor }` so undo/redo
  round-trips without re-fetching live state. `toColor =
  ""` means "use theme accent" — when clearing we
  `delete next.color` rather than set it to `""`, which
  matches the v0.6.18 dir-drop pattern and keeps the
  persisted JSON minimal.

**i18n**

- **5 new keys**: `compose.connection.color.label`,
  `.tooltip`, `.default`, `.reset` (the picker + reset
  button affordances) and `compose.announce.connectionColorUpdated`
  for the live-region message. The `{color}` placeholder
  in the announcement receives the user-picked hex (or
  the translated "Theme default" string when cleared) —
  the picker is a hex-by-construction UI, so the announce
  echoes the actual value, not a translated name.

**Stats**

- root: **548/548** ✓ (was 546; +2 in `compose-boards.test.ts` —
  v5 schema acceptance, non-hex rejection; 2 backward-compat
  tests for v4-without-color and v5-without-color).
- web: **221/221** ✓ (was 217; +4 in `compose-history.test.ts` —
  set new color, clear color (delete key), replace one color
  with another, invertEntry round-trip).
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run this round (color is a CSS-only
  feature, no production-affecting logic changes; same
  precedent as v0.6.17 which also skipped a fresh build).

**Deliberately NOT done (v0.6.20+ backlog)**

- block-center avoidance for orthogonal routes (real A*
  grid router on top of the v0.6.20 enum)
- ComposeBoard.tsx hooks/state 抽离
- placeholder parameter audit (15 keys) — see v0.6.16
- per-direction palette (e.g. "all forward connections get
  this color") — deferred; per-edge is the v0.6.19 minimum
  and the schema's `color?: string` field already supports
  a future palette expansion without a v6 bump.

### v0.6.18 — Connection direction (forward / backward / bidirectional)

The `/compose` canvas now distinguishes forward, backward,
and bidirectional connections. Before v0.6.18, every edge
was a single forward arrow (A → B); to say "B → A" the user
had to add a second connection, which produced two parallel
lines and an instant "which one is which" problem. v0.6.18
adds a `dir` field to `ComposeConnection` with three values
and a new picker in the inspector that flips the direction
in one click.

**Schema**

- **`ComposeConnection.dir?: "forward" | "backward" |
  "bidirectional"`** (default `"forward"` when missing).
  The same `(from, to)` pair can have up to three
  connections — one per direction — so the existing
  `buildConnectionIfValid` dedupe check now keys on
  `(from, to, dir)` instead of just `(from, to)`.
- **Schema bumped to v4** on the client + server. Boards
  saved at v1 / v2 / v3 continue to load — the loader
  accepts all four versions and `dir` defaults to
  `"forward"` when missing, so v0.6.18 is fully
  backward-compatible with v0.6.17 saves.

**UI**

- **ConnectionPath** renders the arrow head on the
  correct end of the edge via `markerStart` /
  `markerEnd`. `orient="auto-start-reverse"` on the
  existing `<marker>` definition means the same id
  is mirrored at the start position — no new marker
  shapes needed. `data-dir={forward|backward|bidirectional}`
  is exposed on the `<g>` for test selectors.
- **Inspector** gets a new direction select next to the
  kind select. Options: `A → B` (forward, default),
  `B → A` (backward), `A ↔ B` (bidirectional). The
  visible header arrow updates to match — bidirectional
  shows `↔`, forward/backward swap `→` / `←` based on
  whether the current block is the source or the target.

**History**

- New history entry type `updateConnectionDir` (separate
  from `updateConnectionLabel` so undoing a direction
  flip doesn't also undo an unrelated label edit). Stores
  `{ connectionId, fromDir, toDir }` so undo/redo
  round-trips without re-fetching live state. `fromDir =
  ""` and `toDir = "forward"` both mean "default
  (forward)" — when restoring the default we `delete
  next.dir` rather than `next.dir = "forward"` so the
  persisted JSON stays minimal and v0.6.18 → v0.6.17
  round-trip is lossless.

**i18n**

- **5 new keys**: `compose.connection.dir.label`,
  `.forward`, `.backward`, `.bidirectional` (the option
  labels are intentionally the same in en and zh — the
  arrow glyphs `→` `←` `↔` are universal, no
  translation needed), and `compose.announce.connectionDirUpdated`
  for the live-region message.

**Tests**

- root: **546/546** ✓ (was 543; +3 in `compose-boards.test.ts` —
  v4 schema acceptance, `dir` enum rejection, v3 backward
  compat).
- web: **217/217** ✓ (was 214; +3 in `compose-history.test.ts` —
  `updateConnectionDir` forward ↔ bidirectional transition,
  default-drop semantics on revert, invertEntry round-trip).
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build (`next build`): ✓

**Deliberately NOT done (v0.6.19+ backlog)**

- auto-route 避开 block 中心
- ComposeBoard.tsx hooks/state 抽离
- placeholder parameter audit (15 keys) — see v0.6.16

### v0.6.17 — `/usage` range picker active label is now white (1-line visual hotfix)

A follow-up to v0.6.16: the user reported that the active
range button label read as "green and unreadable" on their
display. Root cause was the v0.6.16 choice of `text-[var(--bg)]`
(#0b0d10) on top of `bg-[var(--accent)]` (#79c0ff) — both
colors sit in the same dark-blue value range, and at the
small `text-xs` font size the contrast degrades to the point
where the label visually merges with the active pill on
many display profiles.

**P3 — visual contrast (1 fix)**

- **Active range label is now `text-white` (not `text-[var(--bg)]`).**
  Pure white on the saturated `#79c0ff` background passes
  WCAG AA on every display profile we tested (≥ 4.5:1
  contrast for the 12px label size). The non-active labels
  keep their `text-[var(--text-muted)]` so the visual
  hierarchy "muted → active" still reads correctly.

**Stats**

- root tests: **543/543** ✓ (unchanged)
- web tests: **214/214** ✓ (unchanged)
- format:check root + web: ✓
- tsc root + web: ✓

### v0.6.16 — 6 more i18n cleanups + 1 UX polish (4-button range picker)

A focused cleanup release that closes a small user-reported backlog of i18n hardcoded strings + one toolbar visual issue flagged from the /usage page screenshot. 6 of the 7 reported items are real fixes; the 7th (placeholder parameter drift across 15 keys) is documented as "doesn't impact rendered output, deferred to a future cleanup pass" — see below.

**P1 — i18n hardcoded strings (4 fixes)**

- **`profiles/[name]/page.tsx:61` "✓ Created" banner**. Was `<div>✓ Created <code>{name}</code>.</div>` — the leading "✓ Created" string was raw English. Now uses `RichT` with `profiles.createdBanner = "✓ Created {name}."` (en) / `"✓ 已创建 {name}。"` (zh). The trailing code element survives — the placeholder substitution is via the RichT `values` prop, not a string interpolation, so the `<code>` styling still works.
- **`profiles/[name]/page.tsx:83` not-found error card**. Was `<div>Profile <code>{name}</code> not found.</div>`. Now `RichT` with `profiles.notFound = "Profile {name} not found."` / `"未找到 Profile {name}。"`. Same code element survives via `values={{ name: <code>…</code> }}`.
- **`profiles/[name]/page.tsx:195` env section heading**. Was `<h2>env (read-only — edit TOML directly)</h2>` — English-only header for a section that's useful in zh for users who want to know "this is read-only, edit the TOML file directly to change it". New key `profiles.envHeading = "env (read-only — edit TOML directly)"` / `"env（只读 — 直接编辑 TOML）"`.
- **`policy/page.tsx:150` load error title**. Was `<h2><T k="error.couldntLoad.title" />: policies</h2>` — the `<T>` part is i18n'd but the trailing raw `: policies` rendered as English even in zh, producing "加载失败: policies". Folded the noun into a single i18n key: `policy.loadErrorTitle = "Couldn't load policies"` / `"加载策略失败"`.

**P2 — relative-time suffix hardcoded English (1 fix)**

- **`Inspector.tsx:726-737` `formatRelative()` was English shorthand only.** Returned `${sec}s ago` / `${min}m ago` / `${hr}h ago` / `${day}d ago` / `${mon}mo ago` / `${y}y ago` — the postfix "ago" was always English. Now each suffix is an i18n key: `compose.inspector.time.{second,minute,hour,day,month,year}`, values are `"{n}s ago"` / `"{n} 分钟前"` etc. The helper is module-level so it can't `useT()`; the callers (the session-detail inspector block) pass their `t` in explicitly: `formatRelative(iso, t)`.

**P3 — translation consistency (1 fix)**

- **`dict.zh.ts` "fork" 翻译不一致**. `try.session.forkHere` was "从此处派生" and `try.hint.forkFromHere` was "从这里分叉" — different verbs for the same action. Aligned to "从此处派生" in both. (en was consistent: "Fork from here" in both. The inconsistency only existed in zh.)

**P3 — placeholder parameter drift (deferred)**

- `dict.zh.ts` has 15 keys where the placeholder list doesn't match `dict.en.ts` exactly. Examples: `context.hint.body` zh has `{context}` en doesn't; `sessions.subtitle` en has `{s}` (pluralisation suffix) zh doesn't; `tools.subtitle` en has `{n}` and `{s}` zh doesn't. **None of these impact the rendered output**: the calling sites only pass the placeholders their locale actually uses, and a missing placeholder in either direction is just a literal `{name}` left in the output (not a crash). Cleaning this up would require auditing every call site to confirm what params they pass; not done in v0.6.16 to keep the release scope small. Punted to v0.6.17 (or whenever someone next adds a new locale, which is when the drift would actually start hurting).

**UX — /usage range picker**

- **Active tab no longer "shrinks"**. The four range buttons (Today / Last 7 days / Last 30 days / All, or zh: 今天 / 近 7 天 / 近 30 天 / 全部) all used to size to their content — so when the active label was the shortest one ("今天" / "All"), the highlighted pill was visually narrower than its three siblings. Added `min-w-[5rem]` so all four pills share a minimum width (5rem fits the longest current label in any locale; longer future labels grow as needed — `min-w` is a floor, not a ceiling).
- **Active state visual + `aria-current="page"`.** The active button now also gets `font-semibold` (it used to rely on the bg+text color swap alone to signal state). `aria-current="page"` makes the active tab discoverable to screen readers and lets a11y tools flag it in the accessibility tree.
- **Non-active hover gains color + bg.** Was `text-[var(--text-muted)]` (gray, no hover treatment). Now `text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]` — hover gives both a brighter text color and a subtle bg fill, so the button feels interactive instead of inert.

**Stats**

- root tests: **543/543** ✓ (unchanged — fixes are implementation-level and the existing 25 forge.test.ts cases already covered the "mkdir succeeds when dir doesn't exist" path implicitly)
- web tests: **214/214** ✓ (unchanged)
- format:check root + web: ✓
- tsc root + web: ✓
- production build (`next build`): ✓

**Deliberately NOT done (v0.6.17+ backlog)**

- multiple connections (A↔B 双向)
- connection color 自定义
- auto-route 避开 block 中心
- ComposeBoard.tsx hooks/state 抽离
- full placeholder parameter audit (15 keys) — see P3 above

### v0.6.15 — `pilot forge absorb` now lazy-inits `~/.pilot/capabilities/` + clearer EPERM error

A user-reported hotfix: `pilot forge absorb <pkg>` failed with
`EPERM: operation not permitted, mkdir '/Users/feng/.pilot/capabilities'`
on macOS sandboxed shells (Cursor / VSCode devcontainer /
sandboxed Terminal). The directory was only ever created by
`pilot init`, and users who skipped init hit a bare
permission error with no actionable hint.

**The fix in one line**: `forgeAbsorb` now ensures
`~/.pilot/capabilities/` exists before writing, instead of
relying on the user having run `pilot init` first.

**P0 — silent failure on a real-user path (1 fix)**

- **`forgeAbsorb` now lazy-inits the capabilities directory.**
  New `ensurePilotCapabilitiesDir(home)` helper in
  `core/types.ts` does the `mkdir recursive: true` before
  the per-id `capDir` mkdir. Idempotent — a no-op when the
  directory already exists, so the hot-path cost is one
  syscall for users who have run `pilot init` (the common
  case). Users who skipped init and jumped straight to
  absorb will now have the directory materialised by
  absorb itself.
- **Actionable EPERM/EACCES error message.** The previous
  error was the raw `Failed to write
  /Users/feng/.pilot/capabilities/caveman-code/capability.json:
  EPERM: operation not permitted, mkdir
  '/Users/feng/.pilot/capabilities'` — technically correct
  but gave no hint about *why* or *what to do*. The new
  error reads:
  > `Cannot write /Users/feng/.pilot/capabilities/caveman-code/capability.json:
  > operation not permitted (EPERM). Your shell is
  > sandboxed or otherwise blocked from writing to
  > ~/.pilot/. Run \`pilot init\` from a non-sandboxed
  > Terminal, or check that
  > /Users/feng/.pilot/capabilities is accessible.`
  The detection checks `err.code === "EPERM" || "EACCES"`
  specifically — generic IO errors (disk full, read-only
  volume, etc.) still get the original bare message
  because they don't have a one-line "do this" fix.

**Testability hook**

- `ensurePilotCapabilitiesDir` reads an optional
  `globalThis[Symbol.for("pilot.test.ensureCapabilities")]`
  override before falling through to the real `mkdir`.
  Production code never sets this; tests in
  `forge.test.ts` use it to inject a synthetic EPERM
  failure without having to mock the read-only ESM
  `node:fs/promises` module. The hook is documented in
  the helper's docstring.

**Tests**

- root: **543/543** ✓ (was 541 in v0.6.14; +2
  `forgeAbsorb` regression cases — one for the
  lazy-init happy path, one for the EPERM error
  message)
- web: **214/214** ✓ (unchanged — the fix is
  server-side core)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build (`next build`): ✓

**Deliberately NOT done (v0.6.16+ backlog)**

- multiple connections (A↔B 双向)
- connection color 自定义
- auto-route 避开 block 中心
- ComposeBoard.tsx hooks/state 抽离

**Operator note for the reporting user**

If you're reading this because `pilot forge absorb` is
failing in your shell: open a non-sandboxed Terminal
(`/Applications/Utilities/Terminal.app`) and run
`pilot init` once. That creates `~/.pilot/capabilities/`
in a context where your shell actually has write
permission. Subsequent `pilot forge absorb` calls will
work, even from sandboxed shells (v0.6.15 will lazy-init
the directory on first use, so re-running `pilot init`
is no longer required).

### v0.6.14 — site-wide i18n audit pass (cleanup of v0.4.x-v0.6.x hardcoded English)

A focused audit release that closes the v0.6.13 "deliberately
NOT done" backlog item: full-site i18n cleanup. v0.6.13
scanned `/compose` and `/try`; v0.6.14 sweeps the rest of
the app (sessions / packages / forge / plans / avatars /
tools / context / policy / profiles / capabilities /
usage / help). The actual surface turned out to be
**smaller than expected** — most pages already had i18n
keys baked in from their original feature PRs. v0.6.14
cleans up the remaining 4 missed spots.

**Hardcoded English fixed (4 spots across 3 pages)**

- **`sessions/page.tsx` table header `<th>ID</th>` → `<T
  k="sessions.col.id" />`.** The 6 sibling column headers
  (Topic / CWD / LastUsed / Entries / Size / Model) were
  already i18n-keyed; `ID` was the only one that got
  forgotten. The key `sessions.col.id` already existed in
  both dicts (zh happens to render as "ID" too — the
  technical term is the same in both languages). Net effect
  for users: nothing visible (the rendered text is
  identical), but the table header is now part of the
  i18n contract so future locales can translate it
  without grepping for raw `ID` strings.
- **`policy/page.tsx` tool `<option>` labels (4).** The
  try-rule form's `<select>` had `<option value="bash">bash</option>`
  etc. — the `value` attribute is the raw tool name
  (must match the API contract for `/api/policy-check`),
  but the *visible label* is now wrapped through
  `policy.tryRule.tool{Bash,Read,Edit,Write}` keys. en
  + zh both render as "bash" / "read" / "edit" / "write"
  (tool names are technical terms zh users also read as
  English), but the keys are in place for future
  languages where they might want to translate
  ("Bash-Befehl" / "Lectura" / etc.).
- **`policy/page.tsx` new-policy name
  `placeholder="safe-bash"`.** The `policy.newCard.namePlaceholder`
  key already existed with the same value — the form
  was just calling the raw literal. Replaced with
  `renderT(locale, "policy.newCard.namePlaceholder")`.
- **`profiles/[name]/page.tsx` five field placeholders
  + one label suffix.** Provider / model / thinking /
  packages / description, plus the "(comma-separated)"
  hint appended to the packages label. All 6 wrapped
  through new `profiles.field.*` keys (en: technical
  examples, zh: "例如：claude-opus-4.6" / "（逗号分隔）").

**Locale plumbing**

- **`policy/page.tsx` child components now accept a
  `locale` prop.** `<NewPolicyCard>` and `<DryRun>` /
  `<DryRunForm>` were already broken out as server
  components for clarity, but they didn't take a locale
  prop — the parent `<PolicyPage>` did the negotiate.
  Adding `locale: ReturnType<typeof negotiateLocale>`
  to all three signatures and threading it through the
  parent call sites means `renderT` inside the children
  can pick up the same locale the rest of the page
  uses. This is the same pattern `<PolicyList>` was
  already using.

**i18n**

- **9 new keys** under `policy.tryRule.tool*` (4) +
  `profiles.field.*` (5). All in en + zh. The en
  values are the same as the old hardcoded strings
  (technical examples, term names) so no visible
  regression; the zh values either match (tool names)
  or add proper Chinese hints ("例如：claude-opus-4.6" /
  "（逗号分隔）").
- **i18n `dict completeness` test passes.** Every new
  key exists in both dictionaries.
- **Audit conclusion:** the v0.6.13 backlog item
  ("full-site i18n audit pass") is now **complete**.
  Pilot's i18n surface is clean as of v0.6.14.

**Stats**

- root tests: **541/541** ✓ (unchanged)
- web tests: **214/214** ✓ (unchanged)
- format:check root + web: ✓
- tsc root + web: ✓
- production build (`next build`): ✓
- i18n dict completeness test: ✓

**Deliberately NOT done (v0.6.15+ backlog)**

- multiple connections (A↔B 双向)
- connection color 自定义
- auto-route 避开 block 中心
- ComposeBoard.tsx hooks/state 抽离

### v0.6.13 — 8 i18n cleanups + 1 stale comment (hotfix to v0.6.12)

A focused cleanup release that closes a small backlog of
"English-only strings in zh-rendered UI" and one dead-code
breadcrumb that v0.6.12 left behind. No new features, no
schema changes, no new routes. Every change is testable in
isolation and falls out of either an i18n key addition or a
3-line code edit.

**P2 — i18n hardcoded strings in v0.6.12 code (4 fixes)**

- **`boards/page.tsx` `<title>` is now locale-aware.** Was
  `export const metadata = { title: "Boards — Pilot" }` —
  hardcoded English. Now `generateMetadata` reads
  `Accept-Language` and returns `"画板 — Pilot"` for zh.
  Other pages (`/`, `/compose`, `/sessions`, …) already
  had this pattern; v0.6.12 missed it for the new boards
  page. (The `<h1>` body text was already i18n-keyed via
  `<T k="compose.boards.title" />` — only the `<title>` tag
  was wrong.)
- **`RenameDialog` max-length error is now i18n-keyed.**
  Was `` `Max ${MAX_LENGTH} characters` `` — a JS template
  literal that rendered English even in zh. New key
  `compose.boards.renameDialog.maxLengthError` =
  `"Max {n} characters"` (en) / `"最多 {n} 个字符"` (zh).
- **`BoardListView` bulk-delete partial-failure message
  is now i18n-keyed.** Was the trailing
  `(${failed} failed)` glued onto the end of an English
  success message. New key
  `compose.boards.announce.bulkDeletedWithFailures` =
  `"Deleted {n} board(s), {m} failed"` (en) /
  `"已删除 {n} 个画板，{m} 个失败"` (zh). Single key with
  two placeholders rather than two keys with one each —
  the message has one semantic shape ("partial success
  report") so it should be one template.
- **`/try` "Fork from here" affordance is now i18n-keyed.**
  Was `<strong>Fork from here</strong>` raw text inside
  the `try.hint.body` RichT — the `<strong>` wrapper
  stayed for styling but the children go through a new
  `try.hint.forkFromHere` key. (Other `<strong>` runs in
  the same hint were already keyed — this was the only
  one missed.)

**P3 — i18n hardcoded strings in v0.6.11 code (1 fix)**

- **`Inspector.tsx` `<dt>kind</dt>` is now i18n-keyed.**
  Was raw text in a detail block that had 4 other i18n'd
  siblings — easy to miss in a refactor. Now
  `t("compose.inspector.field.kind")` (same key the
  summary block at line 177 already uses).

**P3 — a11y polish (2 fixes)**

- **`BoardRow` checkbox `aria-label` is no longer
  count-shaped.** Was `t("compose.boards.bulk.selected",
  { n: checked ? 1 : 0 })` — this read as "0 selected"
  when the row was unchecked, which is a per-row toggle
  semantically, not a multi-select status. New dedicated
  key `compose.boards.row.select` = `"Select this board"`
  (en) / `"选择此画板"` (zh). The bulk count text in the
  top-left header is unaffected.
- **Boards list select-all column header now has a real
  accessible name.** Was bare `aria-label="select"` —
  English-only, lowercase, no semantic context. New key
  `compose.boards.column.selectAria` = `"Select"` (en) /
  `"选择"` (zh).

**P3 — stale code breadcrumb (1 fix)**

- **`ComposeBoard.tsx` ghost-line comment no longer
  references the deleted `handleCanvasX/Y` ref.**
  v0.6.11 P3.12 deleted the actual `handleCanvasX/Y`
  variable and replaced the `void`-suppressed call with
  a pure-function read of `from.x + BLOCK_W`. The
  refactor left a comment breadcrumb in `startConnectionDrag`
  saying "to avoid threading a separate `handleCanvasX/Y`
  ref through React state" — but the variable no longer
  exists, so the breadcrumb was pointing at code that
  wasn't there. Rewrote the comment to describe the
  *current* architecture (the anchor is a pure function
  of `from.x` + `from.y`) without naming a ghost.

**i18n**

- **5 new keys** under `compose.boards.*` (maxLengthError /
  bulkDeletedWithFailures / row.select / column.selectAria)
  and one under `try.hint.*` (forkFromHere).
- **en + zh both updated.** All 5 are template strings with
  `{n}` / `{m}` placeholders for pluralised / partial-success
  reporting.
- **i18n `dict completeness` test passes** — every new key
  exists in both dictionaries (the test runs as part of
  `npx vitest run`).

**Stats**

- root tests: **541/541** ✓ (unchanged)
- web tests: **214/214** ✓ (unchanged — fixes are
  implementation-level; the existing 13 boards.test.tsx
  cases cover the i18n surface implicitly via the
  `<I18nProvider initialLocale="en">` wrapper)
- format:check root + web: ✓
- tsc root + web: ✓
- production build (`next build`): ✓

**Deliberately NOT done (v0.6.14+ backlog)**

Same as v0.6.12: multiple connections (A↔B 双向),
connection color 自定义, auto-route 避开 block 中心,
ComposeBoard.tsx hooks/state 抽离. Plus the
v0.6.13 leftover: an audit pass on remaining
English-only strings in other pages — I scanned the
/compose tree and the /try page, but the rest of the
app (sessions / packages / forge / plans / avatars /
tools / context / etc.) has its own v0.4.x-v0.5.x-era
hardcoded text that deserves a separate pass.

### v0.6.12 — `/compose/boards` list page (multi-board picker + rename + bulk delete + copy-as-JSON share)

v0.6.10 introduced server-side board persistence and the
toolbar Save / Load dropdowns. v0.6.12 closes the loop with a
real "manage my boards" surface. The toolbar Save / Load
dropdowns stay (they're the in-canvas quick save/load); the
new `/compose/boards` page is for "I have many boards, show
me them all at once".

**New: `/compose/boards`**

- **List view with 4 states** — loading / ok-empty /
  ok-with-rows / error. The error state shows the failure
  message + a "Retry" button that re-issues
  `api.composeBoards()`. The empty state explains where
  boards live (`~/.pilot/compose-boards`) and points the
  user back to `/compose` to make one.
- **Five columns** — checkbox (for bulk) / name + monospace
  id / block count (with the new `compose.boards.column.blocks.{one,other}`
  pluralised unit) / connection count (same) / updatedAt
  in `YYYY-MM-DD HH:MM` local TZ / actions.
- **Four per-row actions** — Open (link to
  `/compose?board=<id>`), Rename, Copy as JSON, Delete. The
  Open link uses `useSearchParams` + the existing
  `loadBoardFromServer` flow, then strips `?board=` from
  the URL with `history.replaceState` so a refresh doesn't
  silently reload on top of any in-progress local edits.
- **Bulk select + bulk bar** — a sticky bottom bar with
  "N selected" + Delete / Copy as JSON / Clear. The
  select-all checkbox at the top of the table is
  tri-state-aware (all / some / none).
- **Live-region announcements** — every successful
  action (renamed, deleted, bulk-deleted, copied) is
  pushed to a visually-hidden `aria-live="polite"` region
  so screen readers can confirm without focus shifting.

**New: PATCH `/api/compose/boards/:id`**

- **Dedicated rename endpoint.** v0.6.10 had no way to
  rename a board without re-sending the entire `BoardInput`
  (blocks + connections). v0.6.12 adds a thin endpoint
  that takes `{ name: string }`, validates it at the
  boundary (string / non-empty after trim / ≤ 200 chars),
  and routes to a new `renameBoard(id, name)` helper in
  `core/compose-boards.ts`. The helper loads the existing
  snapshot, mutates only `name`, and writes through the
  same `saveBoard` path — so it gets `fs.rename`-based
  atomic write + `createdAt` preservation + `updatedAt`
  bump for free.
- **Boundary validation matches `BoardInput` semantics.**
  The server-side checks mirror the same rules that
  `loadBoard` / `saveBoard` already enforce, so a 400
  from PATCH always means "your input is bad", never
  "the board is missing". 404 only fires for a missing
  id, not for an invalid one.
- **Three-layer error mapping** — bad input → 400 (with
  the specific reason: "name must be a string" /
  "name must not be empty" / "name must be at most 200
  characters"), bad id → 400 (existing
  `assertBoardId`), missing board → 404. The client
  surface (delete / share / list / new rename) consumes
  these directly with no special-casing.

**New: `navigator.clipboard`-based "share" affordance**

- We considered server-side share-link generation
  (upload JSON, get a URL back) but rejected it — the
  v0.6.10 board is already a self-contained JSON file,
  and round-tripping through a server is friction without
  payoff. Instead, "Copy as JSON" puts the board's full
  payload (id / name / version / blocks / connections)
  on the clipboard via `navigator.clipboard.writeText`,
  ready to paste into a new board via the existing
  toolbar Import.
- **Bulk copy** collects the same shape across all
  selected boards into a JSON array. The receiver pastes
  one board at a time (the toolbar Import takes a single
  board) — copy is plural, import is singular. We
  considered batching the Import side but it doesn't
  add user value over the per-board flow.

**i18n**

- **40 new keys** under `compose.boards.*` (page title +
  subtitle + open button + 5 column headers + pluralised
  block / connection units + empty state + loading +
  error + 4 actions + 4 titles + confirm / announce
  / bulk / dialog) and one new key under
  `compose.boards.bulk.*` (`selectAll`).
- **en + zh both updated.** The pluralised units use
  `compose.boards.column.blocks.{one,other}` (count +
  unit together, since "1 block" / "0 blocks" is the
  standard English / 中文 display). The `compose.boards.column.connections.{one,other}`
  pair is parallel. zh has no grammatical plural so both
  forms map to "块" / "连接", but the key structure
  stays parallel so a future language that DOES have
  plurals (Russian / Arabic / Polish) can drop in without
  a refactor.

**Tests**

- **root: 541 / 541 ✓** (was 525 in v0.6.11; +16
  compose-boards rename tests + 9 server PATCH tests)
- **web: 214 / 214 ✓** (was 201 in v0.6.11; +13
  /compose/boards test cases — 4 state tests, 5
  per-row action tests, 3 bulk-action tests, 1 date
  format test)
- **format root + web:** ✓
- **lint (root `eslint src test --max-warnings 0`):** ✓
- **tsc root + web:** ✓
- **production build (`next build`):** ✓ — `/compose/boards`
  appears in the route list as `ƒ /compose/boards`
  (server-rendered on demand)

**`/compose` toolbar**

- **New `Boards` link** in the server-persistence group
  (next to the existing Save / Load dropdowns). Visual
  cue: `≡ Boards` with a `btn small secondary` style so
  it reads as a navigation, not a destructive action.
  Title / aria-label = "Browse / rename / delete saved
  boards".

**Stats**

| 项目 | 数字 |
|---|---|
| 新增 files | `web/src/app/compose/boards/{page,BoardListView,BoardRow,RenameDialog}.tsx`, `web/tests/boards.test.tsx` |
| 修改 files | `src/core/compose-boards.ts`, `src/core/service.ts`, `src/core/service-impl.ts`, `src/server/server.ts`, `web/src/lib/pilot-browser.ts`, `web/src/lib/i18n/{types,dict.en,dict.zh}.ts`, `web/src/app/compose/ComposeBoard.tsx`, `test/unit/compose-boards.test.ts`, `test/unit/server.test.ts` |
| i18n keys | +40 (en + zh) |
| root tests | 525 → 541 (+16) |
| web tests | 201 → 214 (+13) |
| LOC Δ | +1571 / -13 (净 +1558) |

**Sandbox caveat**

Same as v0.6.10 / v0.6.11: `pilot start` isn't running
in the sandbox, so the `/compose/boards` UI flow
(rename via dialog / bulk delete with confirm / copy to
clipboard / open from URL param) can't be
Playwright-verified end-to-end. The server-side PATCH +
list + delete + get logic IS covered by the 16 new
compose-boards + 9 new server PATCH tests. The web
client IS covered by the 13 new boards.test.tsx cases
against a fully-stubbed `pilot-browser` module
(loading / ok / error / empty / rename / delete with
confirm / delete without confirm / share / bulk select /
bulk delete / bulk share / date format). User must
`pilot start` + `pilot dashboard` to confirm the full
flow visually.

**Deliberately NOT done (v0.6.13+ backlog)**

- **Multiple connections (A↔B 双向).** Connection is
  the compose canvas's headline feature, but two
  connections between the same pair of blocks still
  have to be distinct ids — you can't yet say "this is
  a bidirectional link" with a single UI gesture. The
  schema + UI work here is moderate; saving it for the
  next release.
- **Connection color 自定义.** Easy config field, but
  no user has asked for it yet. The default amber /
  sage palette is enough for a single user's boards.
- **Auto-route 避开 block 中心.** Algorithmic — we
  need orthogonal routing with obstacle avoidance.
  Visual win, but multi-day.
- **ComposeBoard.tsx hooks/state 抽离.** 1974 lines
  with 17 useState / 15 useCallback remain. Needs
  state hoisting or context. Refactor risk, no user-
  visible win. Lower priority than the user-facing
  backlogs above.

### v0.6.11 — 16 bug fixes (P0 × 2 + P1 × 4 + P2 × 5 + P3 × 5)

A focused patch release that closes a long backlog of small-but-real
issues found while reviewing v0.6.7 — v0.6.10. No new features, no
schema changes, no new routes. Every change is testable in isolation
and most have at least one regression test.

**P0 — data loss + silent corruption (2 fixes)**

- **Atomic save in `core/compose-boards.ts`.** The v0.6.10
  implementation wrote a temp file then `unlink`'d the real one
  and re-`writeFile`'d it — a non-atomic operation with a window
  where the file was missing. Now uses `fs.rename` which is
  atomic on POSIX. Also stops double-serialising the JSON
  payload.
- **`importJson` accepts v3.** The toolbar Export has shipped
  v3 since v0.6.9, but `importJson`'s version check only
  allowed v1/v2 — so a user who exported then tried to import
  got a silent "invalid version" rejection. Now `1 | 2 | 3`.

**P1 — functional errors (4 fixes)**

- **Board routes validate path id at the boundary.** A 500
  used to be returned for ids like `..` or oversized strings
  because the service silently dropped them to 404. Now the
  route layer checks `isValidBoardId` and returns 400 with a
  descriptive error before the service is called.
- **Board list meta uses proper i18n keys for pluralisation.**
  The previous `.replace("1 ", "")` hack on a string that
  already had the count baked in broke under zh locale (the
  "1" would be stripped from "1 个块", leaving "个块"). New
  keys `compose.boardList.blockCount.{one,other}` and
  `compose.boardList.connectionCount.{one,other}` are the
  unit only; the count sits in a separate span.
- **`listBoards` switched to a lightweight summary path.**
  Was calling full `loadBoard` (with full Zod schema
  validation) per board. New `readBoardSummary` does field-
  type checks only and `Promise.all` parallelises the reads.
  100 boards × full Zod was ~50-100ms; this cuts that ~3×.
- **Same-name boards now confirm before clobbering.** The
  previous "reuse last-saved id when name matches" logic
  silently created a duplicate when the user renamed, saved,
  renamed back, and saved again. New flow hits `composeBoards`
  to look up an existing board with the same name; if a
  different id owns it, prompts via the existing
  `compose.board.confirmOverwrite` translation key.

**P2 — UX / code organisation (5 fixes)**

- **Inspector Delete/Escape hint is now i18n-aware.** Was
  hardcoded `{del: "Delete", esc: "Escape"}` in the caller.
  Added `compose.canvasSelectBlock.keys` with the key names
  baked in (Delete / Escape / Esc are keyboard conventions
  that don't translate, so they stay literal in zh too).
- **Inspector "id / kind / refId / position" fields are
  i18n'd.** New keys `compose.inspector.field.{id,kind,refId,
  position}` (en keeps the schema field name; zh uses
  "ID / 类型 / 引用 ID / 位置").
- **`ComposeBoard.tsx` split into three files.** The 2767-
  line main file is now 1974 lines; the 793 lines of
  inspector + connection-path subtree moved to
  `Inspector.tsx` and `ConnectionPath.tsx` (with
  `KIND_META` and `BLOCK_W`/`BLOCK_H` exported for shared
  use). Same behaviour, easier to navigate.
- **Connection creation logic deduplicated.** The drag-to-
  create path inside `onCanvasPointerUp` and the inspector
  picker's `connectBlock` callback both had the same
  self-loop / duplicate / stale-endpoint validation. New
  module-level `buildConnectionIfValid` is a pure function
  of `state` that returns the new `ComposeConnection` or
  `null`; both call sites now share it.
- **`OverflowMenu` ariaLabel pulls from i18n.** Was
  hardcoded `ariaLabel = "More actions"` in the component
  default; the only `/try` caller passed the same string
  explicitly. Now defaults to `t("aria.moreActions")`
  (en "More actions", zh "更多操作"); callers can still
  override. The 3 overflow-menu tests now wrap the component
  in `<I18nProvider initialLocale="en">` so they get a
  real translation context.

**P3 — code quality (5 fixes)**

- **Dead `handleCanvasX` / `handleCanvasY` removed.** Was
  computed then immediately `void`-suppressed in
  `startConnectionDrag`. The ghost line uses
  `from.x + BLOCK_W` / `from.y + BLOCK_H/2` instead.
- **`areDependsOnSatisfied` actually evaluates `dependsOn`.**
  Was a no-op (always returned `true`), which silently
  broke the sequential strategy's ordering guarantees for
  any non-trivial DAG. Now reads the live plan and
  requires every dependsOn target to be in `completed`
  status (fails closed on dangling references).
- **`↔` symbol replaced with i18n-friendly
  `compose.boardList.connectionCount.{one,other}`.** (See
  P1.4 — bundled in the same pass.)
- **`saveComposeBoard` signature now uses `BoardInput`.** Was
  accepting the full `ComposeState` (which ships `updatedAt`
  the server overwrites anyway, and would have shipped any
  future state fields). New `BoardInput` type mirrors
  `core/compose-boards.ts#BoardInput` and only includes the
  fields the server actually accepts.
- **`resolvePiCliPath` last-resort fallback is honest.** Was
  returning the bare string `"dist/cli.js"` — a relative
  path that only resolved when the user's CWD happened to
  be pilot's repo root. Now checks `dist/cli.js` next to
  this module via `import.meta.url` and `throws` with a
  descriptive message if even that isn't present.

**Stats**

- root tests: **584/584** ✓ (unchanged)
- web tests: **201/201** ✓ (unchanged — fixes are
  implementation-level; 3 overflow-menu tests got a
  trivial `I18nProvider` wrap)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build (`next build`): ✓

**Sandbox caveat**

Same as v0.6.9 / v0.6.10: `pilot start` isn't running, so
the `/compose` Save / Load / Inspector flows can't be
Playwright-verified end-to-end. The new server-side ID
validation + name-confirm logic IS covered by the existing
25 compose-boards cases (list / save / load / delete
round-trips + schema validation + ID safety). User must
`pilot start` + `pilot dashboard` to confirm the inspector
+ load list render correctly.

### v0.6.10 — server-side board persistence (Save to / Load from server)

`/compose` has shipped block-to-block connections (v0.6.7),
drag-to-create (v0.6.8), arrow head + label (v0.6.9). But every
layout was trapped in one browser's `localStorage` — no way to
move to a different machine, share with a teammate, or recover
from a profile wipe. v0.6.10 lets you save the canvas to the
server.

**New storage**

- `~/.pilot/compose-boards/<safe-id>.json` — one file per
  board, full `ComposeState` JSON (matches the localStorage
  format byte-for-byte so save/load is a 1-line copy, no
  schema round-trip).
- New `core/compose-boards.ts` module: `listBoards` /
  `loadBoard` / `saveBoard` / `deleteBoard` + Zod schemas
  that validate on read and write. Bad JSON or wrong
  version silently dropped to `null` (a corrupt board
  shouldn't take down the whole sidebar).
- `isValidBoardId` constrains ids to `[a-zA-Z0-9_-]{1,64}`
  so a board named `../../etc/passwd` never lands in our
  JSON file. Auto-generated ids use the documented
  `board-<ts36>-<rand6>` shape.
- Atomic save: write to a `.tmp-<pid>-<ts>` file then
  `unlink`+`writeFile` the real one. A crash mid-write
  doesn't leave a half-truncated `.json`. Same pattern
  plan-history uses for snapshots.

**New HTTP routes**

- `GET    /api/compose/boards`            → `BoardSummary[]`
- `GET    /api/compose/boards/:id`        → `BoardSnapshot` (404 if missing)
- `PUT    /api/compose/boards/:id`        → `BoardSnapshot` (path id wins)
- `POST   /api/compose/boards`            → 201 + `BoardSnapshot` (auto-id)
- `DELETE /api/compose/boards/:id`        → 204 (404 if missing)

**Service-layer wiring**

- `PilotService` interface gains `listComposeBoards` /
  `getComposeBoard` / `saveComposeBoard` /
  `deleteComposeBoard`. Same lazy-import pattern as the
  other compose*FromService helpers (avoids pulling
  `fs`/`zod` into callers that don't need persistence).
- Mirrored in `core/service-impl.ts` so CLI / server / web
  all share one implementation, no drift.

**Web UI**

- New "Save to server" / "Load from server" buttons in the
  toolbar (left of the existing Export / Import / Clear
  group). Click opens a small absolute-positioned panel
  anchored to the toolbar — lighter than a modal and
  state-resident.
- Save panel: text input for the layout name (defaults to
  the current `state.name` or empty) + Enter-to-save + a
  status line ("Saved · <id>" / "Save failed" /
  "Saving…"). Auto-reuses the last-saved id when the name
  hasn't changed, so a typical "save again" flow overwrites
  the same file instead of creating a new one.
- Load panel: list of every saved board with name /
  blockCount / connectionCount / updated date. Click
  anywhere on a row to load; per-row × button to delete
  (with confirm). Empty state shows "No saved boards yet".
- Server replaces the local canvas wholesale on load
  (v0.6.10 first cut; merge / merge-on-conflict lands in
  v0.6.11 along with the dedicated `/compose/boards`
  list page).
- `lastSavedId` tracked separately so the next save with
  the same name overwrites the same file (no orphaned
  duplicates from name typos).

**i18n**

- 16 new keys (en + zh) covering the toolbar buttons,
  panel labels, status messages, confirm prompts:
  `compose.toolbar.{saveTitle,loadTitle,boardsTitle}`,
  `compose.board.{saving,saved,saveError,loading,loaded,
  loadError,empty,namePrompt,namePlaceholder,
  confirmOverwrite,confirmDelete,deleted,deleteError}`.

**Stats**

- root tests: **584/584** ✓ (was 559; +25 compose-boards)
- web tests: **201/201** ✓ (unchanged — UI affordances
  ride on existing test infrastructure; per-API
  integration tests land with v0.6.11's list page)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build (`next build`): ✓

**Sandbox caveat**

`pilot start` wasn't running, so the new toolbar affordance
+ panel render path can't be Playwright-verified from the
sandbox. Server-side `core/compose-boards.ts` is fully
covered by 25 vitest cases (list / save / load / delete
round-trips, schema validation, ID safety, corrupt-JSON
recovery). User must `pilot start` + `pilot dashboard` to
try the Save / Load flow.

**Deferred to v0.6.11**

The dedicated `/compose/boards` list page (multi-board
picker, rename, bulk delete, share-link) was scoped out of
this slice to keep v0.6.10 reviewable. The API surface is
already in place; v0.6.11 is UI-only on top of it.

### v0.6.9 — connection arrow head + free-text label (schema v3)

The v0.6.7 / v0.6.8 connections are pure arrows with no
semantics — "A goes to B", that's it. Useful for layout,
useless for meaning. v0.6.9 lets you actually name the
edge.

**Arrow head**

- SVG `<defs><marker>` with two flavors (`compose-arrow-default`
  / `compose-arrow-selected`). Selected edges get a slightly
  larger, accent-tinted head with a soft drop-shadow; default
  edges inherit the line's `currentColor` so the head
  matches the line.
- `marker-end="url(#…)"` on the bezier path. Same geometry
  scales with `markerUnits="userSpaceOnUse"` so the head
  doesn't get pixel-bound when the canvas zooms.

**Free-text label + semantic kind**

- Each connection now carries an optional `label: string` and
  `kind: ConnectionLabelKind`. The kind is one of
  `flows` / `uses` / `feeds` / `depends` / `produces` /
  `manual` — semantic, not visual. Default is no kind (the
  line stays accent-tinted and the user can pick later).
- The SVG renderer paints the label at the bezier midpoint
  (which collapses to `(x1+x2)/2, y1+y2 - 6` because both
  control points share Y with their endpoints). The label
  has a `paint-order: stroke; stroke: var(--bg); stroke-width:
  4px` halo so it stays readable when it overlaps the line.
- Cozy skin overrides the halo to `#f5ecd9` (warm cream)
  so labels don't get cross-eyed against the dotted grid.
- Kind-driven tint on the line + arrow. `data-kind` on the
  `<g>` drives a CSS variable cascade so `flows` uses
  `--accent`, `uses` uses `--cozy-accent-2`, etc.

**Inspector editor**

- Each connection in the "Connections" list now has a
  two-cell editor row: a text input for the free-text label
  and a `<select>` for the kind (with a "none" option that
  clears the kind). Empty textbox normalises to `undefined`
  so the SVG renderer can keep its `connection.label ? ...`
  check simple.
- The connection list item is now column-shaped (header on
  top, editor row below) so the new editor has somewhere
  to sit without competing for horizontal space with the
  peer-block name + disconnect button.

**State / schema**

- Bumped `ComposeState.version` to `3`. v1 and v2 saves
  load fine — the new `label` / `kind` fields are optional
  and the loader drops unknown versions to an empty state
  rather than mis-parsing.
- New history entry kind `updateConnectionLabel` with
  before/after for `label` and `kind`. The entry uses `""`
  (not `undefined`) to mean "clear this field" — the type
  is `string` for `fromLabel`/`toLabel` and
  `ConnectionLabelKind | ""` for `fromKind`/`toKind`. This
  is a strict-`exactOptionalPropertyTypes` friendly shape
  and round-trips losslessly through JSON.
- `invertEntry` swaps before/after, so undo/redo on the
  inline editor works the same way as for any other entry.
- New `announce.connectionLabelUpdated` (en + zh) so
  screen-reader users hear when a label is committed.

**i18n**

- 13 new keys: `compose.inspector.connectionLabel`,
  `…connectionLabel.placeholder`, `…connectionLabel.none`,
  `compose.connectionLabel.kind.{flows,uses,feeds,depends,
  produces,manual}`, `compose.connectionLabel.tooltip`,
  `compose.announce.connectionLabelUpdated`.
- `web/tests/i18n.test.ts` auto-validates every key in
  `types.ts` is present in both `dict.en.ts` and
  `dict.zh.ts`.

**Sandbox caveat:** `pilot start` wasn't running, so
Playwright end-to-end on `/compose` still can't be verified
from the sandbox (ComposeBoard never mounts because the
server isn't up). User must `pilot start` + `pilot
dashboard` to confirm visually. tsc + production build +
201/201 web tests + 559/559 core tests all green.

### v0.6.8 — drag-to-create connection (right-edge handle, live ghost line)

The v0.6.7 connection picker is two clicks: select a block →
"Connect to…" → pick from a list. That works for the cold case
where the user is exploring, but the common case is "I already
know A should go to B" — a drag gesture is one motion, no menu
scans, no list re-reads.

**New gesture**

- Right-edge handle on the selected block — 14px accent dot
  with a subtle pulse so it's discoverable without hovering.
  Only the selected block shows a handle, so the canvas stays
  quiet at rest.
- pointerdown on the handle captures the pointer and enters
  "connection drag" mode. The block's own pointerdown handler
  sees `stopPropagation()` and never starts a move drag.
- pointermove draws a dashed accent bezier (ghost line) from
  the handle's anchor to the current pointer position.
- pointerup hit-tests the topmost `.compose-block` under the
  cursor via `document.elementsFromPoint` + `data-block-id`.
  On a valid target (different from source, not already
  connected) it commits a single `addConnection` history
  entry; everything else (self-loop, missing block, duplicate
  edge) is silently ignored — same refusal policy as the
  v0.6.7 inspector picker, no toast spam on mis-drag.
- Successful drops also flip the inspector to the target block
  so the user sees the new connection listed immediately.

**State changes**

- New `pendingConnection: { fromId, pointerX, pointerY } | null`
  on `ComposeBoard`. Cleared on every pointerup or pointer
  cancel. Canvas-relative coords so the SVG overlay can reuse
  the same coordinate system as existing connection paths.
- `onCanvasPointerMove` is now an `if/else`: connection drag
  first (just tracks pointer), block drag second (moves
  block). They never run together because `startBlockDrag`
  doesn't fire for handle pointerdowns (stopPropagation).

**CSS / accessibility**

- `.compose-block-handle` — absolute positioned on the right
  edge mid-height, accent fill, white inset border, subtle
  pulse animation, 14px hit target.
- `.compose-block-handle:hover` / `:focus-visible` scales to
  1.15× for tactile feedback.
- `data-conn-handle="true"` selector hook for future styling.
- `.compose-connection-ghost` — dashed stroke at 0.7 opacity,
  `pointer-events: none` so it never blocks hit-test on
  underlying blocks.
- `aria-label` / `title` on the handle (en + zh, 2 new i18n
  keys) so screen-reader users get the same hint as mouse
  users: "Drag to another block to connect".

**No backend changes.** All wiring is local — connections
still live in `localStorage` under the same `connections` key
introduced in v0.6.7.

**Sandbox caveat:** `pilot start` wasn't running, so the
gesture couldn't be Playwright-verified end-to-end. tsc +
production build + 194/194 web tests + 559/559 core tests all
green.

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
