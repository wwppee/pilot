# Changelog

## Unreleased

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
