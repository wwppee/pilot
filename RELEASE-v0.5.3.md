# v0.5.3 — Session info card + Avatar apply dry-run

Shipped 2026-07-06. Two small but useful additions: a per-session summary banner,
and a "what would happen?" preview for Avatar apply.

## What's new

### Session info card (`/sessions/[id]`)

Each session page now shows a **Summary** card next to the existing
Snapshot banner, sourced from the same JSONL trace but sliced per-session
instead of aggregated like `/usage`:

- **Model** — first assistant message's model
- **Duration** — wall-clock span (first → last entry timestamp), formatted
  as `12s` / `3m 4s` / `1h 5m` / `2d 3h`
- **Total tokens** — sum of `usage.totalTokens` across assistant messages
- **Total cost** — sum of `usage.cost.total` across assistant messages,
  formatted as USD with 4 decimals
- **Assistant messages** — count
- **Tools used** — `toolCall` invocations aggregated as `{name, count}`
  chips, sorted by count descending

#### Gotcha: cost aggregation

Pi's `usage.cost = {input, output, total}` where `total === input + output`.
Summing every numeric field would double-count. The endpoint uses the
canonical `total` and only falls back to summing the rest when `total` is
absent (defensive against custom trace writers).

### Avatar apply dry-run (`POST /avatars/:cwd/apply?dry=1`)

The same `applyAvatar` core function now accepts an options bag. When
`{dry: true}` is passed:

- No `pi install` calls happen.
- No profile activation happens.
- Every "would-install" / "would-activate" step is still recorded, with
  `dry: true` flag, plus a `report.dry: true` at the root.
- The `installed` and `activated` arrays still populate with the
  would-have-been-installed targets — useful for "preview counts".

The UI exposes this as a separate **Dry-run** button on
`/avatars/[cwd]`, below the existing Apply form. The ApplyReportBanner
detects `report.dry === true` and:

- Adds a "dry run" badge in the corner.
- Shows an italic note "(dry run — no changes made)" below the title.
- Tags each step in the expandable detail list with `(dry)`.

No confirm dialog is needed — dry-run is reversible by definition.

## Internals

### New core module

`src/core/session-info.ts` — `deriveSessionInfo(id, home?)`:

```ts
interface SessionInfoSummary {
  sessionId: string;
  cwd?: string;
  model?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  totalMessages: number;
  assistantMessages: number;
  totalTokens: number;
  totalCost: number;
  toolsUsed: { toolName: string; count: number }[];
}
```

The function reads from Pi's session JSONL the same way
`deriveSessionInfo`'s sibling `deriveSnapshot` does, but slices
per-session instead of capturing cross-session state.

### Apply options

`src/core/avatar.ts` — new `AvatarApplyOptions { dry?: boolean }`:

```ts
applyAvatar(
  encodedCwd: string,
  home?: string,
  opts?: AvatarApplyOptions,
): Promise<AvatarApplyReport | null>;
```

The dry branch skips both `runPiStreaming(["install", source])` and
`writeActiveProfile(...)`, recording the step with `dry: true` and the
report with `dry: true`.

### Service + server route

- `PilotService.applyAvatar(encodedCwd, opts?)` — added options bag.
- `POST /avatars/:cwd/apply?dry=1` — accepts `{dry?: "1" | "true"}` query.
- `GET /sessions/:id/info` — new route, 404 when session not found.

### Web types

`web/src/lib/types.ts` — both `AvatarApplyReport` and `AvatarApplyStep`
gained optional `dry?: boolean`. Same shape either way; the UI branches
on the field.

## i18n

Added keys for both surfaces in EN + zh-CN. New keys:

- `sessions.info.{h2,model,duration,totalTokens,totalCost,toolsUsed,assistantMessages,noUsage,noTools,noModel}`
- `avatars.apply.{dryCaption,dryCta,dryBadge,dryNote}`

## Tests

- **Core: 414/414 passing** (was 409 in v0.5.2; +5 from session-info,
  avatar dry-run, and cost-aggregation edge cases)
- **Web: 95/95 passing** (no new tests; types-only changes)
- New tests cover:
  - `deriveSessionInfo` happy path + empty + non-PI timestamp + cost
    aggregation (3 unit tests in `session-info.test.ts`)
  - `applyAvatar({dry: true})` returns same shape without side-effects
    + null when no Avatar + skip when already matches (3 unit tests)
  - Server route `POST /avatars/:cwd/apply?dry=1` returns `dry: true`
    report + 404 (2 server tests)
  - Server route `GET /sessions/:id/info` returns summary + 404 +
    cost-aggregation correctness + fallback to summing fields (4 server tests)

## Files changed

### Core

- `src/core/session-info.ts` (NEW)
- `src/core/avatar.ts` (AvatarApplyOptions + dry branch)
- `src/core/service.ts` (applyAvatar signature)
- `src/core/service-impl.ts` (forward opts)
- `src/server/server.ts` (`?dry=1` query + new info route)

### Web

- `web/src/app/sessions/[id]/page.tsx` (SessionInfoCard)
- `web/src/app/avatars/[cwd]/page.tsx` (Dry-run form + dry-aware banner)
- `web/src/lib/actions.ts` (`dryRunAvatarForm` server action)
- `web/src/lib/pilot.ts` + `pilot-browser.ts` (applyAvatar accepts `{dry}`)
- `web/src/lib/types.ts` (`AvatarApplyReport.dry`, `AvatarApplyStep.dry`,
  `SessionInfoSummary` interface)
- `web/src/lib/i18n/{dict.en,dict.zh,types}.ts` (new keys)

### Docs

- `docs/roadmap-pi-grounded.md` — replaced idealized v0.5.x plan with
  what actually shipped. The original plan assumed a "Replay mode"
  feature that hasn't been built (Pi v3 doesn't expose the trace hook
  Pilot needs to replay without a session running); v0.5.x focused on
  state-management primitives (Avatars + Capability diff + Apply) instead.

## What's next

Likely v0.5.4 candidates, in rough priority order:

- **Avatar delete dry-run / undo** — Apply is one-way; a rollback path
  (re-capture the previous Avatar before applying) would close the loop.
- **Session export** — single session as JSONL bundle for sharing / bug
  reports (lower priority — useful for GitHub issues).
- **Real Replay mode** — once Pi exposes a trace hook for replaying
  without the session being live.

After those, v0.6.0 is the `@pilot/pi-extension` work — Pilot becoming
available *inside* Pi via `/pilot stats today` etc.

## Install

```bash
npm install -g @earendil-works/pilot@0.5.3
pilot dashboard
```

Then open the URL printed to the terminal.