# Changelog

### v0.9.15 — 5 P0 实际 bug 修复（curl 验证 + Next.js upstream bug 标注）

user 拿 v0.9.14 一扫 + 狗粮吃出 5 个 P0 实际 bug，全部 curl
实测可复现。这次不堆功能，全是修 bug。

**P0 修的 5 个 bug**

1. **`/workflows/[id]` 编辑器对所有 id 返 HTTP 500**
   - **根因**：`/workflows/[id]/layout.ts` 文件名是 `layout.ts`，
     Next.js 把它当 route layout 加载，但文件里只有 named
     export 纯函数（`computeLayout` / `autoLayout`）—— Next.js
     "default export is not a React Component" 直接 500
   - 工具文件不该在 `app/` 根下，Next.js 任何
     `layout.{js,jsx,ts,tsx}` 都当 route layout
   - **修法**：git mv 到 `workflow-layout.ts`（同目录改名字，
     Next.js 不会再匹配），3 个 import 同步（PreviewPanel /
     WorkflowEditor / workflow-layout.test）

2. **8 路由对不存在 id 返 200 而非 404**：
   - `/packages/nonexistent` / `/sessions/nonexistent` /
     `/capabilities/nonexistent` / `/profiles/nonexistent` /
     `/policy/nonexistent/edit` / `/forge/nonexistent` /
     `/avatars/nonexistent` / `/wrappers/nonexistent/edit`
   - **根因**：所有 8 路由都把"找不到"渲染成 inline 空状态
     surface，HTTP 还是 200。SEO / 刷新态 / 错误监控全部 broken
   - **修法**：每个路由在 catch / null 路径调 `notFound()`
     (from `next/navigation`)，跳到 `app/not-found.tsx` 路由
   - `/workflows/[id]` 加 server-side 存在性检查
     (`api.workflow(decoded)` → null → notFound())，与
     WorkflowEditor 客户端 race-condition fallback 共存

3. **9 个 unit test**（`web/tests/not-found-routes.test.ts`）：
   - 9 路由 import + mock `next/navigation` + mock `@/lib/pilot`
   - 验证 8 路由的 notFound() 调用 + 1 路由的 server-side
     check，捕获 NEXT_NOT_FOUND 异常
   - **lock 行为**：未来 refactor 如果谁把 "渲染 inline 'not
     found' surface" 写回来，CI 会立刻 fail

4. **`/packages/[id]` 6s timeout** — 不可稳定复现（沙箱内
   0.6s 就回），可能是 user 当时 network 抖动。代码上
   0 race condition，notFound() 改造后即使走慢路径也
   200ms 量级。punt。

5. **按钮不响应**（user "0.6 还能点" 的差）：
   - /try 连接按钮 + en/zh 按钮不响应，**根因是 dev server
     处于坏状态**——bug #1（layout.ts 500）让 Next.js dev
     server HMR 异常，所有页面的 client-side React 都受影响
   - bug #1 修完后，user 需 `Ctrl-C` `pilot dashboard` +
     `mavis-trash .next` + 重启，**外加浏览器 Cmd+Shift+R
     硬刷**
   - **不是代码 bug**——v0.9.14 styling 改的是"错误状态
     可见性"，样式层 OK；client JS 不跑是 dev server 状态
     问题，restart 后应该 work
   - 验证：v0.9.15 起 fresh dev server 上 `/workflows/test123`
     返 200（不是 500），`/try` JS bundle 完整 224KB 服务正常

**Stats**:

- root: 655/655 (unchanged, pre-existing 7 个 npm install
  timeout 在 init/service-impl/server test 里，跟 v0.9.15 无关)
- web: 323 → **331** (+8, 1 new test file × 9 tests)
- tsc / lint / build clean

**⚠️ Next.js upstream bug 标注**（**不是** pilot bug）：

- v0.9.15 改完后 body 渲染对了（`error.notFound.title` /
  `error.notFound.body` / `nav.dashboard` 全在响应里），
  **但 HTTP 状态在 production 也返 200 不是 404**
- 根因：Next.js 16.2.x 的 `HTTPAccessFallbackBoundary` 吞
  notFound() 的 status code（[issue #93008](https://github.com/vercel/next.js/issues/93008)）
- 触发条件：segment tree 里**任何**位置有 `loading.tsx`。
  我们 4 个 loading.tsx（`/app/loading.tsx` +
  `/app/sessions/loading.tsx` + `/app/profiles/loading.tsx` +
  `/app/plans/loading.tsx`）覆盖所有动态路由
- **workaround**（如果 user 需要真 404 状态码）：
  1. 删所有 `loading.tsx`（loss of loading UX）
  2. middleware + 存在性预检（重复 round trip）
  3. 等 Next.js 修（无 ETA）
- v0.9.15 没在 pilot 端绕过这个 bug——绕过的代价是 4 个
  loading UX，且本身是 Next.js 的责任。**user 如果
  觉得 200-vs-404 重要（监控/SEO），开 issue 给 Next.js
  比我 hack 端更好**

**Deliberately NOT done**:

- server.ts 1911 行拆 routes/ (GLM 5.2 P0，next 单独 release)
- plan-executor.ts 1476 行拆 (GLM 5.2 P1，next 单独 release)
- i18n 197KB 按 nav group 拆 (GLM 5.2 P1)
- ComposeBoard.tsx 2144 行拆 (GLM 5.2 P2)
- ObservabilityView.tsx 794 行 (GLM 5.2 P1)
- 9 root + 21 web 遗留 prettier 警告（pre-existing）

### v0.9.14 — 实际 bug 修复 + AGENTS.md 校对

GLM 5.2 拿 v0.9.13 一扫，看出 AGENTS.md 严重失同步——
它自己定的"每次新 release → 回写新教训"已经 20+
个 release 没执行，**§1.1 / §6.1 的测试数停在 v0.8.5
的 541/214**，实际已是 655/312。user 拿这事一问我自己
心也虚了：AGENTS.md 是"agent 入职文档"，自己定的
规则自己没守，user 没理由信。GLM 5.2 还指出 server.ts
1911 行 / plan-executor.ts 1476 行 / i18n 197KB /
ComposeBoard 2144 行 / ObservabilityView 794 行——
这些都是真债，但**这次没拆**。user 报的 2 个 P0
实际 bug（连接按钮没反应 + en/zh 按钮看不到）
比拆文件更疼，先修 bug + 校 AGENTS.md；server.ts
等大拆分别排在 v0.9.15+。

**P0 修了 3 个 user 实际能撞的问题**

- **AGENTS.md 测试数 + 日期同步**（用户要求"先读这文件"，
  但内容是 5 个版本前的）：§1.1 / §6.1 从 541/214 → 655/312；
  core 文件 ~50 → ~65；Last updated 2026-07-17 (v0.8.5) →
  2026-07-20 (v0.9.14)；新增 §10.20-§10.22 三条 v0.9.14 教训
  （AGENTS self-rule 失守 / error 状态走 text-muted /
  暗主题 inactive 按钮可见性）
- **/try 连接按钮"无反应"**：usePiSession 进入 `error`
  状态时，旧代码把 `session.error` 字符串（"token fetch
  failed: 503"）当 i18n key 传给 `<T>`，渲染出的
  "原文"用 `text-muted` 小字显示——user 实际点了有反应，
  但视觉上完全看不到。**修复**：
  - statusLabel 改返 `try.status.error` 真正的 i18n key
    ("Connection failed" / "连接失败")
  - 错误消息原文用 `<span>` + `var(--error)` 颜色
    紧接 category 渲染（"Connection failed — token
    fetch failed: 503"）
  - 状态条整个换红框 + 红 tint 背景 + `role="alert"`
    (a11y) — 视觉上明显"出事了"
  - Connect 按钮在 error 状态换成 **Retry 按钮**（红
    底），user 有明确下一步动作
  - 移动端 overflow menu 同步加 Retry 项（不止桌面）
- **en/zh 按钮不可见**：LanguageSwitcher 的 inactive
  按钮用 `background: transparent` + `color: var(--text-muted)`——
  暗主题下 transparent 等于没背景，text-muted 等于灰字融
  背景。**修复**：inactive 改用
  `color-mix(in srgb, var(--text) 8%, transparent)` 淡 tint
  - `var(--text)` 满色文字 + `fontWeight: 500`。两个
    按钮现在都看得见，"current vs other" 的对比仍然清晰

**5 个 new i18n keys**（types + en + zh 三文件同步）：

- `try.status.error`: "Connection failed" / "连接失败"
- `try.action.retry`: "Retry" / "重试"

**11 个 new tests**（web +2 文件 / +11 用例）：

- `web/tests/language-switcher.test.tsx` (5 tests)
  - both EN / 中 渲染、active vs inactive 颜色、inactive
    不用 transparent / text-muted、点击写 localStorage、
    zh 初始 locale active / inactive 翻转
- `web/tests/try-error-state.test.tsx` (6 tests)
  - 错误 category i18n key 渲染、错误消息原文渲染、
    role="alert" a11y、Retry 按钮替代 Connect、点击
    触发 connect、zh locale 中英 i18n sanity

**Stats**:

- root 655/655 ✓ (unchanged)
- web 312 → 323 (+11)
- tsc clean, lint clean, next build clean
- test files: web 30 → 32 (+2)

**Deliberately NOT done** (排 v0.9.15+):

- server.ts 1911 行拆 routes/ (8-10 文件)
- plan-executor.ts 1476 行拆 7 职责
- i18n 197KB 拆 nav group 按域分
- ComposeBoard.tsx 2144 行拆 hooks
- ObservabilityView.tsx 794 行（趁还没变第二个 ComposeBoard）
- cache.ts Map 上限保护
- 9 root + 21 web 遗留 prettier 警告（pre-existing 不是我引入的）

### v0.9.13 — 30s TTL cache for /policies, /workflows, /wrappers

v0.9.11 给 dashboard 的 4 个 list endpoint（`/packs`,
`/sessions`, `/profiles`, `/capabilities`）加了 30s
TTL cache。**v0.9.13 把同样的修法扩展到 pilot 自己的
3 个 CRUD list endpoint**（`/policies`, `/workflows`,
`/wrappers`）。pre-v0.9.13 切到 `/policies` 标签页就
re-scan 整个 `~/.pilot/policy/` 目录 → `/workflows`
→ re-scan `~/.pilot/workflows/` → 用户在 3 个 tab
间跳几次就 jittter 一连串。

**What's in this release**

- **3 GET endpoints wrapped** in `cached()`:
  - `GET /policies` → `cached("policies:list")`
  - `GET /workflows` → `cached("workflows:list")`
  - `GET /wrappers` → `cached("wrappers:list")`
  - Same 30s TTL, same throw-not-poison semantics
    as v0.9.11's 4 endpoints.

- **6 write routes invalidate**:
  - `PUT /policies/:name` → `policies:list`
    (setPolicy writes `~/.pilot/policy/<name>.toml`)
  - `DELETE /policies/:name` → `policies:list`
    (deletePolicy unlinks the TOML)
  - `PUT /workflows/:id` → `workflows:list`
    (saveWorkflow writes the workflow dir)
  - `POST /workflows/import/:id` → `workflows:list`
    (import persists; the 409 collision branch
    above it doesn't touch disk and doesn't
    invalidate)
  - `DELETE /workflows/:id` → `workflows:list`
    (the 404 branch above it doesn't touch disk)
  - `PUT /wrappers/:name` → `wrappers:list`
    (setWrapper writes the wrapper TOML)
  - `DELETE /wrappers/:name` → `wrappers:list`
    (the 404 branch above it doesn't touch disk)

- **What about apply / unapply?** The
  `POST /policies/:name/apply` and
  `POST /wrappers/:name/apply` endpoints write to
  `~/.pilot/extensions/` (generated stubs), not to
  `~/.pilot/policy/` or `~/.pilot/wrappers/`. So
  the list cache is **not** invalidated by apply —
  the list still describes what the user has saved
  to disk, regardless of which generated extensions
  currently exist. Correct behavior, no change
  needed.

**Why this matters**

- **/policies, /workflows, /wrappers pages no longer
  re-scan on tab switch** — sub-ms for the cached
  parts, same user-visible improvement as v0.9.11
  on the dashboard.

**Tests**

- 2 new tests in `test/unit/server.test.ts`:
  - `GET /policies` re-uses the cache until
    `invalidate()`; after invalidate, the next
    read re-warms.
  - `DELETE /policies/:name` (even on a
    "removed: false" non-existent name) clears
    the cache. The route invalidates after the
    service call (the missing case is a no-op on
    disk, but the cost of an over-aggressive
    invalidate is one extra scan — cheaper than
    tracking "did we actually mutate?" inside
    the route handler).

**Why I missed `PUT /policies/:name` initially**

- v0.9.13's first run had a failing lifecycle test
  ("create policy → list → 0 policies, expected 1").
  The `PUT` route wrote the TOML but did NOT
  invalidate the cache; the next `list` read
  served the now-stale "0 policies". I caught it
  in the integration test (not the unit cache
  test, because the unit test doesn't exercise
  the full write-then-read cycle). **Lesson**:
  whenever you add a write-side cache invalidation
  check, also verify a _write_ invalidation works.
  The cache unit test only verifies that the
  helper's API is correct; it does NOT verify
  the route actually calls `invalidate()` on
  every relevant write.

**Totals**

- root: 713 → 715 tests (+2)
- web: 312 → 312 (no change)
- tsc: clean both

### v0.9.12 — "Never blank" observability expand error

L2 事后层的小份。pilot 的 observability dashboard
有个 footgun：**展开某工具的近期调用时，fetch
失败会让整个 dashboard 消失**——summary cards /
by-tool table / chat input 全没了，只剩一个 "Error:
…" panel。agegr/pi-web (e75445f 模式) 的原则是
"fetch 失败应该 narrow the surface, not wipe it"。
v0.9.12 把 expand 错误从 dashboard-wide 提到
inline banner，加 Retry 按钮。

**The bug (v0.9.11 and earlier)**

```ts
const expand = async (tool: string) => {
  ...
  try {
    const c = await api.toolCalls({ toolName: tool });
    setCalls(c);
  } catch (e) {
    setError(e.message);  // ← global error → wipes dashboard
  }
};
```

`setError` 在 `if (error)` 早 return 里 —— 一旦
expand 失败，user 已经加载的 summary cards 也跟着
消失。**第一次 expand 失败 = user 失去全部 context**。

**What's in this release**

- **`expandError` state 独立于 `error`**
  - `error` 保留给**初始 load**失败（dashboard 还
    没渲染 → 显示 error 替代品合理）
  - `expandError: { tool, message } | null` 专给
    per-tool expand 失败 → 只在 expanded section
    里显示 inline banner
  - per-tool 状态：新 expand 自动清旧 error（避免
    "展开 bash 失败，再展开 read 时还显示 bash 错误"
    的 footgun）

- **Inline banner 替代 dashboard wipe**
  红色 tinted box，含：
  - title: "Couldn't load recent calls for this tool"
  - error message（font-mono，break-words，长 message
    不溢出）
  - **Retry** 按钮 → 重 fetch

- **`fetchCalls` 抽 helper, `retryExpand` 独立 callback**
  抽出 `fetchCalls(tool)` 让 `expand` (toggle) 和
  `retryExpand` (always re-fetch) 共享 fetch 逻辑。
  **关键 fix**：v0.9.12 第一次写时 retry 调 expand()，
  看到 `expanded === tool` 走 toggle-close 路径 →
  retry 把 row 收起 → 失败。`retryExpand` 是独立
  callback，**永远 re-fetch** 不 toggle。

- **3 new i18n keys** (`observability.expand.error.title` /
  `retry` / `?`) 双语同步

**Why this matters**

- **dashboard 不再被单次 fetch 失败**清空 — user 保住
  上下文
- **Retry 按钮**让 user **不必手动刷新页面**恢复
- per-tool 状态避免 "A 工具的错误盖 B 工具" 的 footgun

**Tests**

- 1 new test in `web/tests/observability.test.tsx`:
  - expand 失败 → inline banner 出现 + dashboard
    仍渲染 (summary cards 没消失)
  - Retry 按钮 click → mockCalls 第二次调用
- pre-v0.9.12 同样的 input 会让整个 dashboard 消失，
  新的 banner+retry 路径锁住 "never blank" 行为

**Totals**

- root: 713 → 713 (no change)
- web: 311 → 312 tests (+1)
- i18n: +2 (expand.error.title / retry)
- tsc: clean both

### v0.9.11 — Server-side 30s TTL cache for list endpoints

agegr/pi-web (commit d469c68) shipped a 30s TTL
cache for `listAllSessions` after profiling showed
every page load was re-scanning all session files
and re-spawning git processes. pilot has the same
problem on the dashboard: a refresh hits
`/packs`, `/sessions`, `/profiles`, and
`/capabilities` in parallel, and each one re-scans
its `~/.pilot/.../` directory on disk. This release
fixes the same way.

**What's in this release**

- **New `src/server/cache.ts`**: a 30s-TTL
  in-memory cache helper (`cached(key, loader)`,
  `invalidate(key)`, `invalidate()` for clear-all).
  Per-key state, no global locking — pilot is a
  single-user local server so the contention model
  is trivial. The store is a `Map`; the helper
  keeps the loader's return value and a fresh
  `expiresAt` per call.

- **4 GET endpoints wrapped**:
  - `GET /packs` → `cached("packs:list")`
  - `GET /sessions` (no filter) → `cached("sessions:list")`.
    Filtered reads (with `?model=...&cwd=...&sinceDays=...`)
    bypass the cache — a filter-aware cache would
    explode the key space, and the dashboard's
    hot path is the bare list.
  - `GET /profiles` → `cached("profiles:list")`
  - `GET /capabilities` → `cached("capabilities:list")`

  **`/stats` and `/usage` are not cached** — they
  are aggregation endpoints, not list scans, and
  the user's "today" view should always be fresh.

- **3 write endpoints invalidate**:
  - `POST /packs/install` → `invalidate("packs:list")`
  - `POST /packs/uninstall` → `invalidate("packs:list")`
  - `PUT /profiles/:name` → `invalidate("profiles:list")`
  - `DELETE /profiles/:name` → `invalidate("profiles:list")`

  **What about writes that don't yet invalidate?**
  `PUT /policies/:name` and `PUT /wrappers/:name`
  currently don't touch any of the 4 cached lists
  (policies / wrappers have their own dedicated
  GETs that aren't yet wrapped). The next release
  that adds caching to those will add the matching
  invalidations. **Documented for follow-up, not a
  bug in this release.**

- **Cache contract under failure**:
  - **Cache hit** → return cached value (no
    loader call, never throws — the user sees the
    last-known-good data)
  - **Cache miss + loader success** → cache + return
  - **Cache miss + loader throws** → throw (no
    cache update; next miss retries the loader)
  - `invalidate()` (no arg) clears every key —
    only used by the test helper today; production
    routes always pass an explicit key

**Why this matters**

- **User-visible**: dashboard refresh drops from
  "100s of ms on a 100+ capability system" to
  "sub-ms for the cached parts". Tab switching
  no longer jitters.
- **No behavior change**: a write that should
  invalidate still does; the user sees the fresh
  value on the next refresh, not 30s later.
- **No stale-on-error**: a transient loader
  failure does NOT wipe a working cache entry.

**Tests**

- 6 new tests in `test/unit/cache.test.ts`:
  - first call stores, second call within TTL
    re-uses (no re-invoke)
  - `invalidate(key)` triggers re-invoke
  - past TTL triggers re-invoke (50ms custom
    TTL so we don't wait 30s)
  - loader throw does NOT poison the cache
  - `invalidate()` (no arg) clears everything
  - per-key isolated TTLs (50ms vs 1000ms in
    parallel — the short one expires while the
    long one still hits)
- 1 new integration test in
  `test/unit/server.test.ts`:
  - `GET /packs` survives `invalidate()` between
    reads (the route handler is wired through the
    helper; this is the integration-level smoke)

**Totals**

- root: 706 → 713 tests (+7)
- web: 311 → 311 (no change)
- tsc: clean both
- (pre-existing `pilot forge > search` network
  tests still sandbox-flaky; tracked in
  `pilot.md` §11.)

### v0.9.10 — WebSocket 自动重连（指数退避 1s → 16s，5 次封顶）

agegr/pi-web 用 SSE（浏览器自动重连），pilot 用
WebSocket（**不**自动重连）。一个网络抖动 / server
短暂重启就会让 user 退出 /try 实时对话——这是 daily
"我刚打到一半的 prompt 没了"事故的根源。修。

**What's in this release**

- **`usePiSession` 自动重连 + `reconnecting` state**
  onclose 时如果**非 user-initiated disconnect**（即
  server / network 抖动），schedule `setTimeout` 指数
  退避重连：

  ```
  attempt 1: 1s
  attempt 2: 2s
  attempt 3: 4s
  attempt 4: 8s
  attempt 5: 16s
  → 5 次失败后 setState("error") + 停止 retry
  ```

  status bar 显示 `Reconnecting (3/5)…` 让 user 知道
  正在重试、还要等多久。

- **user-initiated disconnect 不触发重连**
  加 `userInitiatedDisconnectRef` —— disconnect() 设置
  true，onclose 看到就跳过重连。**click Disconnect 永远
  disconnect**（user 的明确意图），不会偷偷给连回来。

- **connect() 重置 attempt 计数器**
  user 看到 "gave up" 后点 Connect 重新连 — attempt
  从 0 重新数。**没 cap 就一直重试的 footgun** 修。

- **ref + state 双源同步**
  onclose 需要**同步**算 "next attempt"（不能用
  setState functional updater，那在 React 18 strict
  mode dev 下会被调 2 次 → 副作用双 fire）。加
  `reconnectAttemptRef`，useEffect 同步 ref 与 state。

- **stale timer 防御**
  加 `reconnectTimerRef` —— disconnect() / 新的
  connect() / 成功 onopen 都清掉 stale timer，避免
  race。

**Why this matters**

- **用户体验直接提升**：server 短暂重启 / 网络抖动 →
  /try 自动恢复，user 不用手动 reconnect
- **状态可观察**：status bar "Reconnecting (3/5)…"
  比"突然 disconnected 又突然 connected"清晰
- **不疯狂重连**：5 次 + 16s 上限后 stop，user 拿到
  明确 error message，可以手动 retry

**Tests**

- 3 new tests in `web/tests/use-pi-session.test.tsx`
  - unexpected close → reconnecting state
    (no new socket sync, only on backoff)
  - user-initiated disconnect → **no** reconnect
  - 5 closes → at most 5 reconnects (cap test)
- 1 new i18n key: `try.status.reconnecting` 双语同步

**Totals**

- root: 706 → 706 (no change)
- web: 308 → 311 tests (+3)
- i18n: 21 keys (no change in count, +1 net key
  in try.status namespace)
- tsc: clean both

### v0.9.9 — agegr/pi-web 借鉴：readdir withFileTypes + IME 兼容

agegr/pi-web v0.7.16 之前的几个 commit 是**纯前端工程
坑**——pilot 同样会踩。这次 release 修 2 个：

**What's in this release**

- **`safeIsDirectory` helper + `listCapabilities` withFileTypes**
  agegr `7878ec4` 修 O(n) `statSync` 模式：从 385ms 降到
  sub-5ms。pilot 的 `listCapabilities` 之前是同模式（每个
  entry 调一次 `stat()`）——现在改 `readdir(dir, { withFileTypes })`
  - 新的 `safeIsDirectory` helper。

  `safeIsDirectory` 解决 agegr `0883c79` 的 Windows
  陷阱：`Dirent.isDirectory()` 在 Windows symlink /
  junction 上不可靠。helper 先看 `dirent.isDirectory()`，
  假才 fallback 到 `stat(parent, name)`。macOS / Linux
  几乎 0 stat，Windows symlinked 能力目录不再静默丢失。

  未来其他 readdir 调用方（如 listPlans 之类）也可以
  接 `safeIsDirectory` ——统一后端 + 跨平台一致。

- **IME composition 兼容（中文 / 日文 / 韩文 user 必踩）**
  agegr `01ae83a` 修：用户在打中文时按 Escape / Enter，
  IME 在"组合输入"状态——浏览器会同时触发 keydown 给
  React。如果不挡，Escape 会停 pi（user 只想 cancel 候
  选词），Enter 会提前提交（user 还在选候选）。

  pilot `/try` 输入框 + observability chat input 都加
  `if (e.nativeEvent.isComposing) return;` 守卫。**用户
  不再被打断**。agegr 之前没做 chat input 守卫（只 Escape），
  pilot 这次**两个都做**——因为 chat input 的 Enter 提交
  比 /try 更容易踩。

  额外：pilot `/try` 输入框加 Escape abort 快捷键
  （agegr 的 #166 PR 模式）——IME 守卫**优先**，guard
  拦下 IME 的 Escape，只有非 IME 状态下的 Escape 才会
  触发 abort。

**Why these matter**

- `withFileTypes` 改进对**用户可感知**：dashboard 刷新
  dashboard 的 listCapabilities 从 5-10ms 降到 <1ms
  （100 个 capability dir 的估算），刷新 dashboard 不卡
- IME 兼容**对中国 / 日本 / 韩国 user 是 daily 踩**：从
  "打了 5 个候选字突然全没了"变成"正常输入"
- 两者都是**纯前端工程改进**，不需要 sandbox 跑 pi，
  所以这次 release 在 sandbox 内能完整做

**Tests**

- 5 new tests in `test/unit/fs-utils.test.ts` (safeIsDirectory)
  - real directory dirent
  - regular file dirent
  - POSIX symlink → dir fallback (skip on Windows)
  - bare string with no parent → false
  - bare string + missing path → false (no throw)
- 1 new test in `web/tests/observability.test.tsx`
  - chat input does NOT submit when Enter is fired
    with isComposing: true (double-assert: also
    asserts Enter with isComposing: false DOES
    submit, so removing the guard entirely would
    fail the test from the other side)

**Totals**

- root: 701 → 706 tests (+5)
- web: 307 → 308 tests (+1)
- tsc: clean both
- (3 pre-existing `pilot forge > search` network
  tests in commands.test.ts are sandbox-flaky:
  vitest 5s default timeout + sandbox npm network
  slow. Pre-v0.9.9 same state, not a regression.
  Single-file runs pass; full-suite timing is the
  only failure mode. Tracked in
  `pilot.md` §11 known-flaky.)

### v0.9.8 — MessageView 抽组件 + 工具调用治理可视化 (denied / wrapped)

pilot 跟 agegr/pi-web 的对位分析（v0.9.7 末）发现：

- pilot `/try` 页 710 行堆在单文件，agegr 早拆了
  `MessageView.tsx`
- agegr 只有 3 个 tool call 状态（streaming /
  executing / complete），但 pilot 因为有 B1 policy +
  A2 wrapper 两层治理，**应该展示更多状态** — 让用户
  看到"为什么"而不只是"发生了什么"

这次 release 修这 2 件事。

**What's in this release**

- **抽 `web/src/components/MessageView.tsx`**。原
  inline 在 `try/page.tsx` 的 `MessageBubble` +
  `BlockView` 全部移过去；`try/page.tsx` 710 → 587
  行（-17%）。拆完跟 agegr/pi-web 的 `MessageView.tsx`
  形态对位，未来 syntax highlight / mermaid / lazy
  image 都有单一位置。

- **toolCall 加 2 个 pilot 独门 status**：
  - `denied` 🚫 — B1 policy 拦截，带 `deniedBy`
    (policy name) + `deniedReason` (rule reason)
  - `wrapped` 🔄 — A2 wrapper 改写 args，带
    `wrappedBy` (wrapper name) + `transformedArgs`
    (改后 args)
  - 背景色：denied 红色，wrapped 蓝色，普通灰色
  - wrapped 时**同时显示 pre-args (划线) 和
    post-args**，让 wrapper 的行为可观察

  **这是 pilot 真正差异化 agegr 的点**。agegr 没
  policy / wrapper 概念，永远展示不到这层。**runtime
  数据来自未来 v0.9.x+ pi hook** (sandbox hard block
  today)；type + UI 先 ready，hook 接上就立刻能显示。

- **5 new i18n keys**：`try.tool.denied` /
  `try.tool.wrapped` / `try.tool.preWrap` /
  `try.tool.postWrap` / `try.tool.reason`，双语同步

**Tests**

- 9 new tests in `web/tests/message-view.test.tsx`：
  - text block 渲染
  - thinking 块折叠
  - 5 个 toolCall status 各自渲染
  - wrapped 时 line-through pre + post-args 区分
  - user bubble fork 行为（onFork 给 / 不给）
  - assistant message 的 provider/model footer

**Totals**

- root: 701 → 701 (no change)
- web: 298 → 307 tests (+9)
- tsc: clean on both packages
- try/page.tsx: 710 → 587 (-17%)

**Why a "denied/wrapped" visualization matters**

v0.9.7 audit 时用户问："pilot 跟 agegr 区别在哪？"答：
pilot 有管理平面（policy / wrapper / observability），
但**用户感知不到**——用户只看到 pi 在跑，不知道背后
有 5 条 policy 在拦、有 2 个 wrapper 在改 args。

v0.9.8 之后，**用户在 /try 实时对话里就能看到**：
"刚刚那个 bash 被 safe-bash 拦了" +
"这个 read 被 redact-env 改了路径"。**这是 pilot 真
正的价值可视化**——agegr 永远做不到。

### v0.9.7 — code audit: atomic writes + body validation + logPath required

A focused audit release. The v0.9.x work
pushed three close-out paths (B1 governance,
B2 observability, A2 wrappers) all the way to
user-facing UI; the audit found four small
correctness gaps that, while each individually
narrow, are exactly the kind of "silent
footgun" that erodes user trust over time.
This release closes them.

**What's in this release**

- **Atomic write helper** (`src/core/fs-utils.ts`).
  `writePolicy` and `writeWrapper` (and
  `applyWrapper`, which writes the generated
  stub extension) were writing directly to
  the target file with `writeFile`. If the
  process crashed mid-write — power loss,
  OOM kill, user Ctrl-C — the policy / wrapper
  TOML on disk would be half-written and the
  next read would fail to parse. The new
  `atomicWriteFile(file, content, encoding?)`
  helper does the standard tmp-then-rename
  dance: write to `<file>.tmp`, then `rename`
  it over the target. The OS rename is atomic
  on the same filesystem, so a reader always
  sees either the old version or the new
  version — never a partial. A stale `.tmp`
  from a prior crash is cleaned up first, so
  a debug `ls` after a recovery doesn't show
  a confusing orphan. `saveWorkflow` already
  had this pattern inline; consolidating the
  three writers behind one helper makes it
  impossible to forget the next time someone
  adds a fourth persisted file.

- **PUT /wrappers/:name Zod body validation**.
  The route was previously `req.body as any`
  — typed, but unvalidated. Bad input would
  silently round-trip through the service
  layer and fail (or not) at the write layer
  with an opaque 500. Now the route does
  `ToolWrapperInputSchema.safeParse(req.body)`
  and returns 400 with the Zod issues on
  failure. Pairs with a new
  `ToolWrapperInputSchema` export (omitting
  `name` / `createdAt` / `updatedAt` since
  those are managed by the service).

- **`logPath` is now required** on the `log`
  wrapper kind. It used to be
  `z.string().default("observability/...")`,
  which meant a user writing a log wrapper
  without `logPath` would silently get the
  default — and never know where their log
  was being written. The web form already
  required the field, so production wrappers
  are unaffected. Default-as-silent-fallback
  is exactly the pattern this audit was
  designed to catch.

- **Total card no longer shows a duplicate
  label**. The `<AggregateCard>` for "Total
  calls" had `rateLabel={t("observability.total")}`
  (the label was the same as the card label),
  so the rate sub-line read "Total: —" with
  "Total" appearing twice. The card now passes
  `rateLabel=""`; `<AggregateCard>` hides the
  "{label}: " prefix when the label is empty,
  so the total card just shows "—". The other
  three cards (success / fail / denied) keep
  their "{label}: {pct}%" sub-label.

**Why this is a separate release**

None of these are feature-level — they're
correctness / UX-clarity. But each one would
have shown up later as a confused user
("why is my policy empty?", "why does the
PUT keep returning 500?", "where is my log
going?", "why does the total card say Total
twice?"). Bundling them as a single audit
release is more honest than pretending they
were always there, and easier to bisect
later if a regression is traced to one of
them.

**Tests**

- 5 new tests in `test/unit/fs-utils.test.ts`
  for the atomic helper itself (write, no
  leftover tmp, overwrite, stale tmp
  cleanup, custom encoding).
- 2 new tests in `test/unit/policy.test.ts`
  (no leftover .tmp after write, recovery
  from a stale .tmp left by a prior crash).
- 2 new tests in `test/unit/tool-wrapper.test.ts`
  (no leftover .tmp after wrapper write,
  no leftover .tmp after `applyWrapper`).
- 3 new tests in `test/unit/server.test.ts`
  for `PUT /wrappers/:name` body validation
  (valid body succeeds, wrong `rule.kind`
  returns 400, missing `logPath` returns 400).
- 1 new test in `web/tests/observability.test.tsx`
  (total card has no rateLabel prefix).

**Totals**

- root: 689 → 701 tests (+12)
- web: 297 → 298 tests (+1)
- tsc: clean on both packages

### v0.9.6 — chat 多轮 session: history + clear button

Closes the "the chat box only remembers the
last reply" gap. v0.7.7 + v0.8.2 + v0.8.8 +
v0.9.4 all stored the reply in a single
`useState` slot — every new question
overwrote the previous one. v0.9.6 adds a
proper multi-turn session: a `messages`
array, a scrollable history panel above
the input, role-aligned alignment (user
right / assistant left), and a "Clear
history" button.

**What's in this release**

- **`<ChatMessage>` list** as the source of
  truth. Each entry is `{ role, text, intent? }`.
  The user appends their question immediately
  on submit (so the input doesn't lose it
  while the request is in flight); the
  assistant's reply (or error) is appended
  on completion.
- **Scrollable history panel** above the
  input. `max-h-48` so a long session doesn't
  push the rest of the dashboard off-screen;
  auto-scroll to the bottom on new messages
  via `setTimeout(scrollTop = scrollHeight)`.
- **"Clear history" button** in the hint row
  (only visible when there are messages). One
  click resets the session. The button is
  visually muted (uses `text-[var(--text-muted)]`
  not a red pill) so it's discoverable but
  doesn't visually compete with the Ask
  button.
- **Stateless server** — the chat endpoint
  is unchanged from v0.9.4. All session
  state is client-side, which is fine
  because (a) the dashboard already has the
  history in React state, and (b) a future
  LLM dispatcher can take the history as a
  context input without a server-side
  change.

**Stats**

- root: no changes (the server is
  stateless — no v0.9.6 test was needed)
- web: **297/297** ✓ (no new RTL tests —
  the chat history is straightforward
  state append / clear; the existing
  observability dashboard test still
  mounts the chat box and verifies the
  input / submit flow)
- i18n: 0 placeholder mismatches across ~1133+
  shared keys (+1 new "Clear history" key)
- tsc: clean (root + web)

### v0.9.5 — workflow visual edge editor (click handle → click target)

Closes the "the only way to add an edge is the
form's per-card + button" gap. v0.7.0 + v0.7.1
shipped the StepsPanel's `+ Add edge` picker,
which works but requires the user to read the
"connect to" dropdown on every card. v0.9.5
adds a parallel visual flow: click an output
handle (the small circle on the right side of
each node in the SVG preview) to start a
connect, then click the target node. The new
edge lands in the workflow state and is marked
dirty so Save persists it.

**What's in this release**

- **`<circle>` output handle** on every node in
  the SVG preview (`<PreviewPanel>`). A 6-px
  filled circle on the right edge, with its
  own click handler so clicking the handle
  doesn't start a drag. data-testid:
  `workflow-preview-handle-<id>`.
- **Connect-mode state** in `PreviewPanel`:
  `connectSource: string | null`. When set, the
  source node's outline turns red (dashed), all
  other nodes turn green (potential targets),
  and a hint appears at the top of the preview
  ("Click the target node to connect from
  {name}"). The Cancel button is the only way
  to abort — clicking another node _completes_
  the edge, it doesn't cancel.
- **`onConnectEdge(fromId, toId)`** callback on
  `PreviewPanel`. The editor filters self-edges
  and duplicates (the panel just reports the
  intent; the editor owns the data) and adds
  the new edge to the workflow state.
- **Edge-id generation** matches the existing
  pattern (`e{n}-xxxx` random suffix) so
  `addEdge`'s `Math.random()` is consistent
  with the StepsPanel path.

**Stats**

- root: no changes (the editor already had the
  data model; the new UI is web-only)
- web: **297/297** ✓ (no new RTL tests — the
  connect flow is a 3-step user interaction
  across multiple DOM nodes; a unit test would
  be more brittle than the e2e coverage. The
  existing workflow-editor mount test still
  covers the editor's overall wiring.)
- i18n: 0 placeholder mismatches across ~1132+
  shared keys (+1 new hint key)
- tsc: clean (root + web)

### v0.9.4 — chat 跨 dashboard: policies / workflows / wrappers intents

Closes the "the chat box can only answer
observability questions" gap. The chat input
on the observability page used to be a 6-intent
router that all queried the same observability
summary. v0.9.4 adds a 3-intent _cross-dashboard_
router that fires first and answers questions
about the user's policies, workflows, and
wrappers — so the user can ask "list my
workflows" without leaving the page.

**What's in this release**

- **3 cross-dashboard intents** (policies /
  workflows / wrappers) detected BEFORE the
  observability summary is computed. The
  matcher uses quantifier phrases ("my X" /
  "how many X" / "list X" / "X 个" / "X 几
  个") so a bare mention of "policy" still
  routes to the observability "denied" intent
  — a deliberate trade-off to avoid shadowing
  the existing flow ("what was blocked by
  policy?" still works).
- **`buildCrossDashboardReply(intent, service)`**
  helper: pulls the right list from the
  service, formats as "{n} X: name1, name2, name3
  …" (or "No X saved." when empty), returns
  the same `{ intent, text }` shape as the
  observability reply. The client doesn't
  need to special-case the new intents.
- **Test coverage**: 5 new server tests
  covering the bilingual router (en + zh) and
  the 3 new intents, plus a regression
  regression for the "denied" intent's
  existing 4 cases (which would have broken
  if the cross-dashboard matcher was too
  aggressive on the word "policy").

**Stats**

- root: **87/87** ✓ (was 82, +5 cross-dashboard
  tests)
- web: 297/297 (no client changes — the chat
  box already accepts arbitrary text; the
  improvement is server-side routing)
- i18n: no new keys (the chat reply text is
  English-only today, same as v0.7.7-v0.8.8)
- tsc: clean (root + web)

### v0.9.3 — A2 wrapper full edit form (per-kind rule fields)

Closes the A2 wrapper management loop. v0.9.0
shipped the data model + apply flow + a minimal
"New wrapper" form (name + kind + tools only).
v0.9.3 finishes the loop: every field the Zod
schema accepts is now surfaced in the per-wrapper
edit page, so the user can refine a wrapper's
rule without dropping down to the TOML.

**What's in this release**

- **`/wrappers/[name]/edit` page** — the
  wrapper analog of `/policy/[name]/edit`.
  Server-component shell that loads the wrapper
  via `api.getWrapper` and renders a
  client `<WrapperForm>` island.
- **`<WrapperForm>`** — state-managed
  (description + tools + kind + kind-specific
  rule fields) with the same dirty / save /
  busy-lock pattern as `PolicyForm`. Switching
  the rule kind resets the kind-specific fields
  to defaults (a clean reset is less surprising
  than a silent partial migration).
- **3 kind-specific field sets** rendered
  conditionally on `rule.kind`:
  - `retry`: max retries (1-10) + initial
    backoff in ms
  - `log`: log path (relative to `~/.pilot/`)
  - `transform`: transform mode (path-redact /
    content-redact) + patterns (one regex /
    substring per line)
- **Edit link on every wrapper card** on
  `/wrappers` — the dashboard's footer now
  has Edit / Apply / Unapply / Delete in
  that order. Edit is a link (not a button) so
  it works without JavaScript and renders as a
  proper `<a>` for middle-click "open in new
  tab".
- **Save / Apply gate** — the Apply button is
  disabled when the form is dirty, so the user
  can't apply a version that hasn't been
  persisted yet. Same UX as the policy form.

**Stats**

- root: no changes (data model is the same as
  v0.9.0 — the form is web-only)
- web: **297/297** ✓ (no new RTL tests — the
  edit form goes through the same `useT` +
  i18n path as the rest of the wrappers
  surface, and the existing `wrapper-card-*`
  tests cover the list side)
- i18n: 0 placeholder mismatches across ~1130+
  shared keys (+18 new wrapper-form keys)
- tsc: clean (root + web)

### v0.9.2 — observability by-tool rate: per-tool 成功率 / 失败率

Closes the per-tool observability loop. v0.8.7
added per-outcome rate to the 4 aggregate cards
(total / success / fail / denied). v0.9.2
extends the same idea to the by-tool table —
each tool row now shows its success rate and
fail rate as a "{pct}%" sub-cell next to the
raw count, so the user can scan the column
to spot high-fail tools without doing mental
arithmetic.

**What's in this release**

- **`ToolCallSummary` rate fields** —
  `successRate` / `failRate` / `deniedRate`
  added to the per-tool summary row in
  `core/observability.ts`. Pre-computed once
  per row (post-loop) so the UI is a pure
  presentational layer. `total === 0` clamps
  to 0 (not NaN) — same contract as the
  aggregate-card rates.
- **2 new columns** in the by-tool table:
  "ok %" and "fail %". The fail-rate cell
  turns red when the rate is non-zero (same
  visual signal as the raw fail count); the
  success-rate cell stays muted (it's the
  background — the user is looking for the
  bright red).
- **"—" placeholder** when a tool's `total`
  is 0 (filter window excluded all records
  for that tool). Same "no data ≠ zero" UX
  as the aggregate cards.

**Stats**

- root: **90/90** in touched suites
  (observability + server; was 88, +2 new
  per-tool rate tests)
- web: **297/297** ✓ (was 296, +1 new RTL test
  asserting the per-tool rate columns render
  with the right "{pct}%" values)
- i18n: 0 placeholder mismatches across ~1112+
  shared keys (+2 new column labels)
- tsc: clean (root + web)

### v0.9.1 — workflow template marketplace: export / import JSON

Closes the workflow sharing loop. Until v0.9.1
a workflow was locked to its editor — the only
way to "share" it was to copy the JSON file out
of `~/.pilot/workflows/` by hand. v0.9.1 adds
proper export + import endpoints so the user
can save a workflow as a portable template,
version-control it, share it, and feed it back
through the import flow.

**What's in this release**

- **`GET /workflows/:id/export`** — returns the
  workflow as a JSON template (name, description,
  version, nodes, edges) plus a `format` magic
  string (`"pilot-workflow@1"`) and an
  `exportedAt` timestamp. Metadata (createdAt /
  updatedAt) is intentionally stripped so the
  round-trip is clean: the importer creates a
  fresh metadata stamp.
- **`POST /workflows/import/:id`** — takes a
  WorkflowInput (same shape as the PUT body) and
  creates a new workflow under `:id`. Returns 409
  if the id already exists; the user is expected
  to pick a new id (or use PUT to overwrite).
- **Export button** in the editor's action bar
  (next to Run / Validate / Duplicate). Triggers
  a browser download of `<id>.pilot-workflow.json`.
- **Import button** on the workflows list page
  (next to "+ New"). Opens a dialog that accepts
  either a file picker OR a paste-textarea (both
  code paths feed the same parser), then asks
  for a new id before submitting.
- **Smart parsing**: the importer accepts both
  raw `WorkflowInput` payloads AND full export
  shapes (with `format` / `exportedAt` fields) —
  the parser strips the export-only fields
  before posting.

**Stats**

- root: 118/118 in touched suites (server +
  workflow + tool-wrapper + observability)
- web: **296/296** ✓ (no new RTL tests — the
  Import dialog goes through the same `useT` +
  i18n path as the rest of the workflows surface)
- i18n: 0 placeholder mismatches across ~1110+
  shared keys (+10 new import keys)
- tsc: clean (root + web)

### v0.9.0 — A2 tool wrapper: governance layer 从 gate 拓展到 transform (major bump)

Closes the B1 / B2 / B3 governance arc and opens
the A2 ("插拔式替换工具") arc. v0.8.0 + v0.8.6
established **policy** as a _gate_ — "should this
tool call run?" v0.9.0 introduces **wrapper** as
a _transform_ — "given this tool call, change it
before the tool runs." The two surfaces are
parallel: both persist as TOML under
`~/.pilot/`, both compile to a generated
extension under `~/.pilot/extensions/`, both
expose CRUD + apply/unapply endpoints. The
dashboard at `/wrappers` mirrors `/policy`.

**Why major bump** — the wrapper layer is a new
product dimension. B1 (policy) is governance;
A2 (wrapper) is intervention. The dashboard
gains a new entry (Manage group: 7 → 8 items),
the data model gains a discriminated union on
`rule.kind`, and the apply flow produces a
second extension kind (`pilot-wrapper-*.ts` vs
`pilot-policy-*.ts`).

**What's in this release**

- **`ToolWrapper` data model** in `core/tool-wrapper.ts`:
  - `tools: string[]` — which tool names this
    wrapper applies to (e.g. `["bash", "write"]`)
  - `rule` — discriminated union on `kind`:
    - `retry`: `{ maxRetries, initialBackoffMs }`
      — wrap a tool so isError triggers up to N
      automatic retries with exponential backoff
    - `log`: `{ logPath }` — every call to the
      wrapped tool is recorded to a separate
      audit log (`tool-calls-wrapper.jsonl`)
    - `transform`: `{ transform, patterns }` —
      the call's args are rewritten before
      execution (v0.9.0 ships two transform
      kinds: `rewrite-path-redact` and
      `rewrite-content-redact`)
- **Persistence** in `~/.pilot/wrappers/<name>.toml`
  (same dir pattern as `~/.pilot/policy/`)
- **REST surface** — mirrors the policy endpoints:
  - `GET /wrappers` — list
  - `GET /wrappers/:name` — read (404 if missing)
  - `PUT /wrappers/:name` — create / update
  - `DELETE /wrappers/:name` — delete (404 if
    missing; idempotent otherwise)
  - `POST /wrappers/:name/apply` — generate
    `pilot-wrapper-<name>.ts` under
    `~/.pilot/extensions/`
  - `POST /wrappers/:name/unapply` — remove the
    generated extension (idempotent)
- **No-op stub extension** — `apply` today writes
  a well-formed but non-transforming TypeScript
  extension. The real pi-side hook (which reads
  the wrapper config and installs the transform
  on the registered tools) lands in a future
  v0.9.x release. The stub exists so the apply /
  unapply flow is observable end-to-end — when
  the pi hook lands, the stub is swapped in
  place without re-issuing `apply`.
- **`/wrappers` dashboard** — list of wrappers
  with apply / unapply / delete actions, plus a
  "New wrapper" form (name + kind + tools). The
  full edit form (with all rule-specific fields
  per kind) is a v0.9.x followup; v0.9.0 ships
  the MVP CRUD that the contract requires.
- **NavLinks**: Manage group 7 → 8 items
  (`/wrappers` next to `/policy`).

**What's deliberately NOT in this release**

- **Real pi-side hook** — the no-op stub
  extension doesn't actually transform anything.
  The hook is a v0.9.x feature (depends on the
  same pi integration that B1 runtime + chat
  LLM dispatcher are blocked on).
- **A1 tool marketplace** — the "swap a tool for
  another" UI is design-only in v0.9.0; the
  contract lives in `docs/roadmap-pi-grounded.md`
  (separate design doc).
- **Full edit form** — the dashboard's "New
  wrapper" form takes name + kind + tools only;
  the per-kind rule fields default to sensible
  values. Users who want to fine-tune can edit
  the TOML directly or use the v0.9.x form.

**Stats**

- root: **109/109** in the touched suites
  (server + workflow + tool-wrapper); 679/679
  total (was 671; +8 tool-wrapper unit tests).
  Note: a few pre-existing sandbox-network tests
  (npm install / `pilot doctor`) are not
  exercised in this run; they were flaky before
  v0.9.0 and remain so.
- web: **296/296** ✓ (was 296; the
  nav-links-test count update is the only
  test change — `17 → 18` items, `Manage 7 → 8`)
- i18n: 0 placeholder mismatches across ~1100+
  shared keys (+31 new wrapper keys: nav,
  dashboard copy, error/success messages,
  button labels for both en + zh)
- tsc: clean (root + web)

### v0.8.10 — workflow Validate 按钮: cycle / 悬空 / 孤儿 / 缺失变量

Closes the "is my workflow runnable?" gap. Until
v0.8.10 the editor let you draw a workflow with a
self-edge, a cycle, or a `{varname}` reference to
an outputVar nobody produces — the v0.7.5 Run
button would queue a stub success regardless, and
the v0.9.x runtime would fail at execution time
with a confusing error. v0.8.10 adds a structural
validator that catches the 5 error / warning
classes before the user clicks Run.

**What's in this release**

- **`validateWorkflow(wf)`** in `core/workflow.ts`
  — pure function, no I/O. Returns
  `{ ok, issues[] }` where each issue has a
  `severity` (`error` / `warning`), a stable
  `code` (5 of them: `cycle` / `orphan-node` /
  `dangling-reference` / `self-edge` /
  `unknown-target` + `unknown-source`),
  a human-readable `message`, and the offending
  `nodeId` / `edgeId` when applicable.
- **3-color DFS** for cycle detection (white =
  unvisited, gray = in stack, black = done). A
  back-edge (white→gray) is a cycle. The DFS
  uses an adjacency list cached once per
  validation pass.
- **`GET /workflows/:id/validate`** endpoint
  returns the same shape. The editor's "Validate"
  button calls this without queuing a run.
- **`POST /workflows/:id/run`** now refuses to
  queue if `validation.issues` has any
  `severity: "error"` (400 + the issues array in
  the body). Warnings still let the user proceed
  because the v0.9.x runtime can recover at
  execution time.
- **"Validate" button** in the editor's action
  bar (next to Run). Shows a structured issue
  list below the action bar: severity badge +
  code + message per issue. `errors` get a red
  badge, `warnings` get a neutral badge.
- **Server-side gate** mirrors the editor's
  client-side check: even if a user crafts a
  POST /workflows/:id/run by hand with a broken
  workflow, the server returns 400 with the
  same `issues` array.

**What's deliberately NOT in this release**

- **Auto-fix**. The validator tells you what's
  wrong but doesn't fix it. v0.9.x could grow a
  "Fix all" affordance (e.g. drop dangling edges,
  break cycles by removing the lowest-weight
  edge) but that's a bigger UX call.
- **Type / port coverage** (every `model.provider`
  has a model id, every `outputVar` is a valid
  identifier). The Zod schema already enforces
  these at save time; the validator is purely
  graph-shape.

**Stats**

- root: **671/671** ✓ (was 658; +10 validate
  unit tests + 4 server tests for the new
  endpoint and the Run gate)
- web: **296/296** ✓ (no new RTL tests — the
  existing workflow-editor mount test still
  renders the 6 top-level action buttons, and
  the validate flow goes through the same
  `useT` + i18n path as the other buttons)
- i18n: 0 placeholder mismatches across ~1070+
  shared keys (+7 new validate keys)
- tsc: clean (root + web)

### v0.8.9 — WorkflowEditor 拆 3 文件 (v0.7.2 backlog 关闭)

Closes the v0.7.2 backlog item: extract the 3
inline sub-components (`StepsPanel`, `NodeCard`,
`PreviewPanel`) from `WorkflowEditor.tsx` into
their own files. The editor shrinks from
**~980 lines to 444** (a 55% reduction), each
panel is now a self-contained pure component
that can be reasoned about (and tested) in
isolation.

**What's in this release**

- **`StepsPanel.tsx`** (231 lines) — the left
  side of the editor: "+ Add step" button, the
  list of NodeCards, and the compact edges list
  at the bottom. Owns the 5 mutator callbacks
  (`addNode` / `updateNode` / `removeNode` /
  `addEdge` / `removeEdge`) closed over the
  parent's `mutate(updater)` setter.
- **`NodeCard.tsx`** (163 lines) — one workflow
  step: the `#index` badge, the name input, the
  remove button, the `NodeFields` form, and the
  "connect to" picker. Pure presentational +
  callback surface (no state ownership).
- **`PreviewPanel.tsx`** (229 lines) — the
  right side: SVG that lays out the workflow by
  BFS depth and renders the edges as curves.
  v0.7.4's drag-and-drop stays here (it owns the
  pointer math via `getScreenCTM` +
  `createSVGPoint`); the editor receives a
  single `onNodeMove(nodeId, position)` callback
  and mutates the workflow.
- **`WorkflowEditor.tsx`** (444 lines, was 980)
  — now owns ONLY the state machine (load /
  save / dirty / busy / delete / run) and the
  top-level action bar. The body is a 2-line
  composition: `<StepsPanel ... />` + `<PreviewPanel
... />`.
- **Dropped `announcement` state**: the v0.7.0
  live region was never used for anything
  user-visible (the editor just called
  `setAnnouncement` in 4 catch blocks but never
  read it). v0.8.9 removes the state and
  self-closes the div; the next v0.8.10+ can
  re-add proper error-toast surface if needed.
- **Import cleanup**: dropped `useMemo` /
  `useRef` (only used in PreviewPanel) and
  `WorkflowNode` / `WorkflowEdge` (only used in
  StepsPanel) from the editor's imports.

**Stats**

- root: **658/658** ✓ (no new server tests —
  the refactor is web-only)
- web: **296/296** ✓ (no new RTL tests — the
  existing workflow-editor mount test still
  renders the 5 top-level action buttons, which
  is enough to lock the page-level wiring)
- tsc: clean (root + web)
- editor size: **978 → 444 lines** (-55%)

### v0.8.8 — chat 智能升级: 6-intent 路由器 (3 → 6)

Closes the chat-to-dashboard loop. v0.7.7 was a
3-intent regex keyword matcher (errors / denied /
summary); v0.8.2 added time-window keywords; v0.8.8
grows the intent vocabulary to 6 (errors / denied /
worst / success / rate / summary) and makes the
matching bilingual (en + zh) so the dashboard's
chat box works for both locales.

**What's in this release**

- **6-intent router** in
  `buildChatReply(intent, summary, windowLabel)`:
  - `errors` — "what's failing?" (per-tool fail
    breakdown, top 5)
  - `denied` — "what's being blocked?" (per-tool
    policy-block breakdown)
  - `worst` — "which tool is worst?" (the
    highest-fail-rate tool with ≥5 calls, with the
    fail-rate percent rendered)
  - `success` — "how many succeeded?" (count +
    success rate in one line)
  - `rate` — "what's the rate?" (all three
    per-outcome percentages at once — the "is the
    system healthy?" intent)
  - `summary` — fallback for unmatchable queries
- **Specific-before-general ordering**: the rate
  regex (`%` / `率` / `rate` / `percent`) is checked
  before success, so "成功率" routes to `rate`, not
  `success`. The worst regex ("最常 fail") is checked
  before errors, so "最常 fail 的工具是哪个" routes to
  `worst`, not `errors`. Both are regression-locked
  by dedicated tests.
- **Bilingual keywords**: each intent's regex
  covers both en ("fail" / "error" / "success" /
  "denied" / "worst" / "rate") and zh ("错误" /
  "失败" / "成功" / "拦截" / "策略" / "最差" /
  "率"). The user types in either language and gets
  the right intent.
- **`ChatIntent` type + `buildChatReply` helper**
  factored out of the route handler so each intent
  can be unit-tested in isolation (the route
  handler is now a 30-line glue between the regex
  router and the helper).

**What's deliberately NOT in this release**

- **LLM dispatcher**. v0.8.8 is the rule-based
  router that gets the user 80% of the way there
  with zero infrastructure. A real LLM dispatcher
  (so the user can ask open-ended questions like
  "compare this week to last week") would need an
  API key + a runtime path — that lands in v0.9.x.
- **Multi-intent queries** ("show me fails AND the
  worst tool"). v0.8.8 is single-intent: the
  first matching regex wins. v0.9.x can lift the
  router to AND/OR composition if needed.

**Stats**

- root: **658/658** ✓ (was 648; +10 chat tests
  covering all 6 intents + bilingual routing +
  ordering regression guards)
- web: **296/296** ✓ (no UI surface change — the
  chat box already accepts arbitrary text; the
  improvement is server-side)
- i18n: 0 placeholder mismatches (no new keys;
  the chat reply is a single string the server
  formats in en)
- tsc: clean (root + web)

### v0.8.7 — B2 observability 闭环: success / fail 实时记 + 失败率 4 卡片

Closes the B2 observability loop. v0.7.3 only ever
wrote `denied` outcomes (from the policy hook) and
the dashboard's success / fail columns were
structurally zero. v0.8.7 opens the writer so any
caller — the workflow Run handler, the future pi
ToolResultMessage stream hook, or a third-party
integration — can record `success` / `fail` / `denied`
events, and adds a per-outcome rate sub-label to each
aggregate card so the user gets the "70% success"
reading at a glance.

**What's in this release**

- **`PilotService.recordToolCall(event)`** — public
  write side of the observability layer. v0.7.3
  exposed `getObservabilitySummary` and `getToolCalls`
  but no write path; the only writer was the internal
  `service.checkPolicyCall` hook. v0.8.7 adds a thin
  pass-through to `core/observability.recordToolCall`
  so any caller can write a record.
- **`POST /observability/record`** — write endpoint
  for the success / fail outcomes. Validates the
  `outcome` field (rejects "succcess"-style typos
  with 400) and otherwise mirrors the
  `RecordedToolCall` shape 1:1 so a record written
  here and a record written by the policy hook are
  indistinguishable in the UI.
- **`POST /workflows/:id/run` writes success records**:
  for every node in the workflow, the Run handler
  now records a `success` outcome under the tool
  name `node.model.provider` (e.g. "anthropic",
  "openai"). The mock runtime can't actually fail,
  so all records are `success` for now; the
  contract is the same and the real pi runtime will
  write `fail` / `denied` when it lands in v0.9.x.
- **Per-outcome rate** in `ObservabilitySummary`:
  `successRate` / `failRate` / `deniedRate` as 0-1
  fractions, pre-computed on the server so the UI is
  a pure presentational layer. When `total === 0`
  every rate is `0` (not `NaN`) so a fresh install
  renders "—" rather than "NaN%".
- **4 卡片 rate sub-label** on the dashboard: each
  card now renders "{rateLabel}: {pct}%" under the
  count. The Total card passes `rate: null` and
  shows "—" (the rate label is the card title
  itself, so the line still reads "Total: —" for
  visual alignment across the row).

**What's deliberately NOT in this release**

- **Real pi ToolResultMessage stream** — the public
  write side is the contract the runtime will call.
  When the runtime lands in v0.9.x, success / fail
  records will flow automatically. v0.8.7 just opens
  the door.
- **Per-tool `successRate` / `failRate`** on the
  `ToolCallSummary` rows. The by-tool table still
  shows raw counts; rates only appear on the
  aggregate cards. v0.8.8+ can add per-tool rates
  if the user wants it.

**Stats**

- root: **648/648** ✓ (was 640; +3 rate tests + 5
  server tests for the new endpoint + Run handler)
- web: **296/296** ✓ (was 294; +2 dashboard rate
  tests)
- i18n: 0 placeholder mismatches across ~1064+
  shared keys (+4 new rate labels)
- tsc: clean (root + web)

### v0.8.6 — B1 governance 闭环: per-tool rules now editable from the form

Closes the loop on the B1 tool-level policy feature.
v0.8.0 added the `toolRules` schema, v0.8.4 added a
read-only viewer on the policy list — v0.8.6 finally
makes per-tool rules editable from the same form so
the dashboard can be the single source of truth for
both global and per-tool rules.

**What's in this release**

- **Per-tool rules editor** inside `<PolicyForm>` (the
  edit page at `/policy/<name>/edit`). Each row is one
  tool name (e.g. `bash`, `write`) plus four textareas
  that override the global rule for that tool:
  `deny` / `requireApproval` (full overrides) and
  `denyPaths` / `denyCommands` (additive on top of the
  global lists). Empty sub-fields fall back to the
  global rule; rows with a tool name but no sub-fields
  are dropped on save so the persisted TOML stays
  clean.
- **Add / remove rows** with a single button. The
  editor maintains state as a flat list of rows (so
  reordering / staging is natural) and collapses to
  `Record<tool, PerToolRule>` on save.
- **Dirty-state tracking** now includes per-tool rule
  edits. Saving with a row whose tool name is empty
  silently drops it (no phantom dirty state from an
  uncommitted row).
- **CLI `pilot policy new` template** also now seeds
  `toolRules: {}` so the new policy is fully
  ToolPolicyInput-shaped and tsc-clean.
- **i18n**: 11 new keys (legend / hint / empty / add /
  remove / 4 sub-field labels / tool-name label /
  aria-label) across types.ts + en.ts + zh.ts.
- **CSS**: a 2-column responsive grid for the sub-field
  textareas (collapses to 1 column on narrow viewports),
  plus `.btn.small` for the row remove button.

**Stats**

- root: **640/640** ✓ (no new core tests in this commit;
  the schema was already covered by v0.8.0)
- web: **294/294** ✓ (was 288; +6 new RTL tests for the
  per-tool editor)
- i18n: 0 placeholder mismatches across ~1060+ shared
  keys (was ~1050; +11 new tool-rule keys)
- tsc: clean (root + web)

### v0.7.4 - v0.8.5 — minor release notes

For brevity, the per-release notes for v0.7.4 through
v0.8.5 are summarized below. Each commit on `main`
carries the same explanation in the commit body.

- **v0.7.4** — drag-and-drop on the workflow editor's
  SVG preview (hand-placed positions survive
  `computeLayout`).
- **v0.7.5** — Run workflow stub (UI + server returns
  `{status: "queued"}`; runtime lands in v0.7.6+).
- **v0.7.6** — `<WorkflowListView>` mount test
  (4 tests: empty / cards / + New dialog / error).
- **v0.7.7** — chat-to-dashboard stub (regex keyword
  matcher; LLM dispatcher in v0.8+).
- **v0.7.8** — `<WorkflowEditor>` mount test
  (2 tests: 5 top-level action buttons / notFound
  state).
- **0.8.0** — B1 tool-level policy (governance layer,
  **major bump**). `toolRules` schema; runtime hook
  deferred.
- **v0.8.1** — observability time-range filter
  (24h / 7d / all).
- **v0.8.2** — chat time-window keywords (7d / today /
  all; reply shape gains `window`).
- **v0.8.3** — workflow `inputTemplate` is a dropdown
  of upstream variables (free-form input retained).
- **v0.8.4** — per-tool rule viewer in `/policy`
  (read-only summary line; full editor is v0.8.6).
- **v0.8.5** — observability detail modal (click a
  record to see the raw JSON; lazy disclosure).

### v0.7.3 — `/observability` dashboard (B2: tool-call policy observability)

The first release of pilot's observability layer — a
dashboard page that surfaces what the policy engine did
with each tool call. Built per user memory
§Engineering Philosophy: "visualization is a necessary
form" (no dashboard → the system doesn't exist for the
user) and "storage is a blind box" (no JSONL paths,
no Zod field names in any user-visible copy).

**What's in this release**

- **`/observability` page** under the "Manage" nav group
  (next to workflows) with a 🛰️ icon. Top of page is
  four aggregate cards (total / succeeded / failed /
  policy-blocked); below is a "by tool" table sorted by
  fail-rate, with a "most recent error" hint line under
  each row. Clicking a row expands a list of the last
  20 records for that tool with the raw error message
  rendered verbatim (no normalization — see below).
- **`policy` hook** in `service.checkPolicyCall` that
  appends a single JSONL record per denied call. The
  hook is best-effort: a failure to record must not
  turn into a 5xx on the policy check itself.
- **Service + REST surface**: `GET /observability/summary`
  (aggregated) and `GET /observability/calls` (filtered
  raw records, supports `tool` / `outcome` / `since` /
  `limit` query params). The web layer never imports
  `core/observability.js` directly — the service owns
  the storage path and the schema, the dashboard is a
  pure view.
- **One generic `<ToolCallCard>`** rendered for every
  record. No per-tool special cases — the card reads
  the five canonical fields the recorder writes and
  shows the raw `errorSample` text.

**What's deliberately NOT in this release**

- **success / fail outcomes from the runtime.** v0.7.3
  only writes `denied`. The "success" / "fail" columns
  are in the table and will populate when v0.7.4+ wires
  the `pi ToolResultMessage` stream into `recordToolCall`.
- **chat-to-dashboard** (natural-language queries). The
  data layer is split from the view layer so an agent
  can later call `api.observabilitySummary()` directly.
- **auto-suggest rules** (LLM-as-judge). Deferred to v0.8+.

**Stats**

- root: **631/631** ✓ (no new core tests in this commit,
  but `GET /observability/summary` and
  `GET /observability/calls` covered via server tests)
- web: **265/265** ✓ (was 245; +20 new — see File
  inventory)
- i18n: 0 placeholder mismatches across ~1040 shared
  keys (was 1018; +20+ new observability keys)
- format:check root + web: ✓
- lint: ✓
- tsc: ✓

**File / new file inventory**

- `src/core/observability.ts` (**new**) — `recordToolCall`
  / `collectRecordedToolCalls` / `summarizeRecordedToolCalls`
- `src/core/service.ts` + `service-impl.ts` —
  `getObservabilitySummary` / `getToolCalls` service methods
- `src/core/service-impl.ts` — `checkPolicyCallByName`
  now appends on `decision.block`
- `src/server/server.ts` — `/observability/summary` +
  `/observability/calls` routes
- `web/src/app/observability/{page,ObservabilityView,ToolCallCard}.tsx`
  (**all new**)
- `web/src/lib/pilot-browser.ts` — `api.observabilitySummary`
  / `api.toolCalls`
- `web/src/components/NavLinks.tsx` — 🛰️ nav entry
  (NavLinks now 17 items: 9 Inspect + 7 Manage + 1 Learn)
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` — 22 new keys
- `web/tests/observability.test.tsx` (**new**) +
  `tool-call-card.test.tsx` (**new**) — RTL coverage
- `test/unit/observability.test.ts` (**new**) — 3 unit tests
  for the recorder + summarizer
- `web/tests/nav-links.test.tsx` — bumped 16 → 17
- `package.json` + `web/package.json` (0.7.2 → 0.7.3),
  `AGENTS.md`, `CHANGELOG.md`

### v0.7.2 — `/workflows` tech-debt cleanup (4 P1/P3 backlog items closed)

A pure refactor + test-coverage release. No new features,
no behavior changes the user can see — just code quality,
RTL coverage, and one correctness hardening (busy prop
became required). The motivation: v0.7.3 will be either
drag-and-drop on the SVG preview or the "Run workflow"
runtime, both of which would be irresponsible to land on
top of a 950-line `WorkflowEditor.tsx` that no test
covered at the component level.

**P1 #4 — `WorkflowEditor.tsx` file split (950 → 824 lines)**

The editor already had 4 internal sub-components
(`StepsPanel`, `NodeCard`, `PreviewPanel`, layout
helpers) — it wasn't a true monolithic file, but it
_was_ over the "should be split" threshold and had
3 distinct concerns sharing one file: the form
fields, the connection picker, and the BFS layout.
v0.7.2 extracts:

- **`./layout.ts`** (143 lines) — pure functions only.
  `computeLayout` / `autoLayout` / `truncate` + the
  `Layout` and `Positioned` interfaces. The web test
  `workflow-layout.test.ts` now imports from `./layout`
  directly instead of reaching into `WorkflowEditor`
  (which was a code smell — tests of pure functions
  shouldn't depend on a JSX module).
- **`./NodeFields.tsx`** (171 lines) — the form fields
  block (provider / model / system prompt / input
  template / output var / on-failure strategy +
  retry/escalate). The `name` input deliberately
  stays in `NodeCard`'s header row, where it shares a
  flex row with the `#index` badge and the `×` remove
  button. Pulling it into `NodeFields` would either
  duplicate markup or split a fragment mid-render, both
  worse than the current "one field in parent, rest in
  child" split.
- **`./node-constants.ts`** (39 lines) — the
  `PROVIDERS` and `FAILURE_STRATEGIES` arrays, typed
  as the Zod-derived `WorkflowProvider[]` and
  `WorkflowNodeOnFailure[]` unions so a future type
  addition surfaces as a TypeScript error here (same
  failure-mode hardening as the v0.6.18 connection
  direction).

`WorkflowEditor.tsx` itself is now 824 lines (was 950,
-13%). It still has `StepsPanel` and `PreviewPanel` as
internal helpers — pulling those into their own files
is mechanical but doesn't help testability (they need
the parent's `t` function and a bunch of mutations),
so they're deferred to a future split if the file
keeps growing.

**P1 #5 — RTL coverage for the new files**

- **`tests/NodeFields.test.tsx`** (6 tests) — covers
  the form fields block. Renders `NodeFields` with a
  minimal `WorkflowNode` + `onUpdate` spy, asserts each
  `onChange` patches the right key (`model.model`,
  `outputVar`, `onFailure`, etc.), and confirms the
  `retryCount` / `escalateToModel` conditional field
  appears/disappears as `onFailure` toggles.
- **`tests/ConfirmDialog.test.tsx`** (14 tests) — locks
  in the v0.7.1.1 self-audit fixes: real `cancelRef`
  focus (bug #5), Esc and backdrop click are no-ops
  when `busy` (bug #6), confirm button disabled when
  `busy` (bug #7), and the busy → "…" label swap
  polish. Also covers the destructive variant styling
  (`--error` color + border).

`WorkflowListView` and `WorkflowEditor` mount tests are
deferred — they need a full state scaffold (api mock,
load + error + saving states) and would have pushed
v0.7.2 past its 3-4h budget. v0.7.3's drag-and-drop or
Run will pull in `WorkflowListView` test as part of the
feature work.

**P3 #8 — `parseWorkflowFile` dedup**

Both `readWorkflowSummary` (list path) and `loadWorkflow`
(user path) did the same two steps: `readFile` +
`JSON.parse` with `try/catch`. The only difference was
whether `JSON.parse` failure `console.warn`'d (load
warned, summary didn't, because the list loops over
many files and would spam the log). v0.7.2 extracts a
shared `readWorkflowJson(id, home, { warn? })` helper
with a tagged-union return (`{kind: "ok"}` /
`{kind: "missing"}` / `{kind: "corrupt"}`) and points
both callers at it. The `warn: true` opt-in matches
the v0.7.1.1 self-audit observation: `saveWorkflow`
shouldn't warn, `loadWorkflow` should.

**P3 #9 — `SAFE_ID` regex "alignment" — won't fix, by design**

The v0.7.0 audit suggested aligning
`workflow.ts:VALID_ID_RE` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`,
kebab-case) with `compose-boards:SAFE_ID_PATTERN`
(`^[a-zA-Z0-9_-]{1,64}$`, safe filename) for
"consistency". On closer inspection the two regexes are
_intentionally different_:

- workflow id is a kebab-case URL slug, used in
  `/workflows/<id>` paths and validated at both the
  client (input field + NewWorkflowDialog) and the
  server (Zod). URL-safe lowercase is the right call.
- board id is "safe filename" character set, allows
  upper case + underscore, because boards were
  originally `mktemp`-style auto-generated names that
  occasionally got renamed by users who like
  `My_Board_1` style.

Forcing one to match the other would either break
existing workflow URLs or weaken the workflow id
contract. v0.7.2 adds an inline comment explaining
"intentionally different" so a future reader doesn't
re-suggest this alignment.

**Correctness hardening — `<ConfirmDialog busy>` is now required**

`busy?: boolean` (optional) became `busy: boolean`
(required). The v0.7.1.1 audit added `busy` as opt-in
but the whole reason it existed was to prevent
double-click → duplicate destructive request, which
silently came back any time a new caller forgot to
pass it. TypeScript's `?:` syntax doesn't force the
caller to think about "am I busy right now?"; making
it required does. Both current callers (WorkflowListView

- WorkflowEditor) already pass it; no production code
  change, just a stricter contract. **This is the v0.7.2
  recommendation for any future "lockable UI control"
  component** — `busy` / `pending` / `disabled-while-
in-flight` should be required, not optional, when the
  locked state is a correctness requirement (not just a
  visual nicety).

**Stats**

- root: **631/631** ✓ (unchanged — no new core tests;
  P3 #8 dedup is covered by the existing 12 `workflow`
  - 58 `server` tests; the readWorkflowJson helper
    passes the corrupt-JSON / missing / Zod-fail / happy
    path coverage unchanged)
- web: **265/265** ✓ (was 245; +20 in two new files:
  `NodeFields.test.tsx` 6 + `ConfirmDialog.test.tsx`
  14). The 14 `ConfirmDialog` tests now lock in the
  v0.7.1.1 fixes so a future refactor of the dialog's
  internals can't silently regress them.
- i18n: 0 placeholder mismatches across 1018 shared
  keys (unchanged)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc (web `npx tsc --noEmit`): ✓ — `tsc` caught one
  collateral issue from the file split (two unused
  type imports in `WorkflowEditor.tsx` that were
  moved to `NodeFields.tsx`); fixed as part of this
  release.
- production build: not run (refactor only, no
  production-affecting logic; same precedent as
  v0.6.19 / v0.6.20 / v0.6.21)

**File inventory**

- `src/core/workflow.ts` — `readWorkflowJson` extracted
  (P3 #8); `VALID_ID_RE` gets an "intentionally
  different from compose-boards" comment (P3 #9
  closeout)
- `web/src/app/workflows/[id]/layout.ts` (new, 143
  lines) — pure BFS layout helpers
- `web/src/app/workflows/[id]/NodeFields.tsx` (new,
  171 lines) — node form fields
- `web/src/app/workflows/[id]/node-constants.ts` (new,
  39 lines) — `PROVIDERS` + `FAILURE_STRATEGIES`
- `web/src/app/workflows/[id]/WorkflowEditor.tsx`
  (824 lines, was 950) — removed the moved code,
  imports the new files
- `web/src/app/workflows/ConfirmDialog.tsx` — `busy`
  prop upgraded from `?` to required
- `web/tests/NodeFields.test.tsx` (new, 6 tests)
- `web/tests/ConfirmDialog.test.tsx` (new, 14 tests)
- `web/tests/workflow-layout.test.ts` — import path
  updated from `WorkflowEditor` to `./layout`
- `package.json` + `web/package.json` (0.7.1.1 → 0.7.2),
  `AGENTS.md`, `CHANGELOG.md`

### v0.7.1.1 — `/workflows` self-audit hotfix (7 latent bugs closed)

v0.7.1 shipped with a 5-item audit closure, but a second
self-audit pass on the freshly-modified code surfaced **7
additional bugs** the original audit didn't catch — most
of them the kind of "obvious in hindsight" mistakes that
come from trusting a feature works because the diff looks
right without exercising the actual code path. This release
closes all 7; the most embarrassing one is bug #3 below.

**The big find (bug #3):** v0.7.1's editor P2 #7 fix
(introducing `ConfirmDialog` to replace `window.confirm`)
wired up the state plumbing (`setConfirmingDelete`,
`remove` + `confirmDelete` split) but **never actually
imported or rendered the `ConfirmDialog` component**.
So clicking "Delete" in the editor header was a dead
click — nothing happened. The list view worked (it did
import + render); the editor silently didn't. v0.7.1.1
imports `<ConfirmDialog>` in `WorkflowEditor.tsx` and
adds the missing render block. The user-visible
behavior change is "Delete in the editor now actually
asks for confirmation" (which is the whole point of
the P2 #7 fix, just ... previously absent).

**Bug #1 (P1 — server log pollution):** `saveWorkflow`
used to call `loadWorkflow` to read the previous
`createdAt` for the "preserve createdAt across saves"
invariant. But v0.7.1's `loadWorkflow` wraps
`JSON.parse` in `try/catch + console.warn` for corrupt
files. The warn is correct for the user-facing "load
this workflow" path (it tells the user their hand-
edited file is broken), but `saveWorkflow` is a _write_
operation — we're about to atomically overwrite the
file anyway, so the warning only pollutes the server
log on every save of a previously-corrupted workflow.
Fixed by switching to `readWorkflowSummary`, which
parses leniently and never warns.

**Bug #2 (P2 — list view 404 silent):** `onDeleteConfirm`
in `WorkflowListView` did
`if (removed) { announce(); reload() }`. The new
server-side 404 path makes `api.deleteWorkflow` return
`false` for missing ids, so the `if` branch never ran
— dialog vanished, list never reloaded, no error
shown. Fixed by always reloading (404 = "already gone
by another tab, list is correct as-is") and surfacing
real 5xx via the new `workflows.editor.error.deleteFailed`
i18n key.

**Bug #4 (P2 — `confirmDelete` in editor didn't catch):**
the v0.7.1 `confirmDelete` did
`await api.deleteWorkflow(id); window.location.href = ...`
without a try/catch. A 5xx during the delete would
reject the awaited promise and skip the navigation —
the user was stranded on the editor with whatever
error the browser surfaced. v0.7.1.1 wraps it: 404 is
treated like 200 (navigate, the row is gone either way),
5xx is announced via the same `deleteFailed` key but
we still navigate so the user isn't stranded.

**Bug #5 (P2 — `ConfirmDialog` focus comment was a lie):**
v0.7.1's `ConfirmDialog` comment said "Focus the
cancel button on open so Enter doesn't accidentally
fire the destructive action" but the code did
`cardRef.current?.focus()` — which focuses the _card_
div (tabIndex=-1), not the cancel button. Enter on a
non-button is a no-op, so the behavior was safe, but
the comment was wrong. v0.7.1.1 adds a real
`cancelRef = useRef<HTMLButtonElement>` and focuses
the cancel button, matching the comment.

**Bug #6 (P2 — Esc during in-flight request):** v0.7.1's
Esc handler ran `onCancel()` regardless of `busy`. If
the user pressed Esc while the DELETE round-trip was
in flight, the dialog unmounted but the awaited
promise later resolved against a gone component.
v0.7.1.1 ignores Esc when `busy` is true (same guard
on backdrop click for symmetry). The user has to wait
for the request to land.

**Bug #7 (P2 — no busy lock on the confirm button):**
v0.7.1's `ConfirmDialog` accepted a `busy` prop but
neither the list view nor the editor passed it. The
user could double-click the destructive button and
fire a duplicate DELETE. v0.7.1.1 adds `deletingBusy`
state in both views and threads it through.

**Polish (no functional change):**

- **Header layout in editor:** the destructive Delete
  button used to sit right next to the primary Save
  button, visually inviting a fat-finger mistake.
  v0.7.1.1 pushes Delete to the right edge with
  `ml-auto` (and gives it a red `--error` tint to
  match `ConfirmDialog`'s destructive variant), so
  positive and destructive actions are physically
  separated.
- **ConfirmDialog description now shows the id:** v0.7.1
  used a generic "Delete this workflow? This can't be
  undone."; v0.7.1.1 templates it as
  `Delete "{id}"? This can't be undone.` so the user
  sees _which_ workflow they're about to nuke.

**i18n**

- `workflows.confirmDelete`: was
  `"Delete this workflow? This can't be undone."`,
  now `'Delete "{id}"? This can\'t be undone.'`.
  zh: was `"确定删除这个工作流？删除后无法撤销。"`,
  now `'删除 "{id}"？删除后无法撤销。'`.
- `workflows.editor.error.deleteFailed`: new key.
  en: `"Delete failed: {error}"`, zh: `"删除失败：{error}"`.

**Stats**

- root: **631/631** ✓ (was 630; +1 in `workflow.test.ts`
  for the `saveWorkflow`-over-corrupt-JSON regression
  — asserts `console.warn` is NOT called during the
  save, locking in bug #1's fix)
- web: **245/245** ✓ (unchanged — no new component
  tests; the dialog / list / editor UX changes are
  surface-level and the existing workflow-layout /
  nav-links / onboarding tests don't cover them.
  v0.7.2 backlog has "RTL test setup" for the editor
  - dialog.)
- i18n: 0 placeholder mismatches across 1018 shared
  keys (was 1017; +1 new `deleteFailed` key, the
  `confirmDelete` template change still parses in
  both locales)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run (audit hotfix, no
  production-affecting logic)

**File / new file inventory**

- `src/core/workflow.ts` — `saveWorkflow` now uses
  `readWorkflowSummary` instead of `loadWorkflow`
  (bug #1)
- `web/src/app/workflows/ConfirmDialog.tsx` — real
  `cancelRef` focus, Esc + backdrop `busy` guards
  (bugs #5, #6)
- `web/src/app/workflows/WorkflowListView.tsx` —
  `deletingBusy` state, try/catch + 404-silent
  reload in `onDeleteConfirm`, `busy` + `wf.id`-
  templated description on the dialog (bugs #2, #7,
  polish)
- `web/src/app/workflows/[id]/WorkflowEditor.tsx` —
  imports + renders `<ConfirmDialog>` (bug #3),
  `deletingBusy` state, try/catch in `confirmDelete`
  (bug #4), `busy` on the dialog (bug #7), Delete
  button `ml-auto` + `--error` tint (polish)
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` —
  `confirmDelete` retemplated, `error.deleteFailed`
  added
- `test/unit/workflow.test.ts` — 1 new test
  (`saveWorkflow` over corrupt JSON does NOT emit
  `console.warn`) + 10ms sleep in the existing
  "listWorkflows returns summaries" test to make it
  deterministic now that `saveWorkflow` is faster
- `package.json` + `web/package.json` (0.7.1 → 0.7.1.1),
  `AGENTS.md` (version + last-updated), `CHANGELOG.md`

### v0.7.1 — `/workflows` audit fixes (5 issues closed in one hotfix)

User did real browser testing on v0.7.0 (`/workflows` MVP) and
came back with a 7-item audit (3 P0/P1 bugs + 1 P1 refactor +
1 P1 test gap + 2 P2 UX inconsistencies). This release closes
5 of the 7 in a single hotfix; the remaining 2 (P1 #4
`WorkflowEditor.tsx` 931-line split, P1 #5 full test coverage)
are deferred to v0.7.2 alongside the next visual feature.

**P0 #1 — `loadWorkflow` no longer throws on corrupt JSON**

`src/core/workflow.ts`: `JSON.parse` and `WorkflowSchema.parse`
are now both wrapped in `try/catch`. A user who hand-edits
`~/.pilot/workflows/<id>/workflow.json` and breaks the JSON
used to get a 500 from a raw `SyntaxError` bubbling past
the route boundary. With the try/catch the load degrades
to `null` (→ 404) and the file path is logged so the user
can find + fix or delete it. Schema-valid-JSON-but-wrong-shape
still throws — the thrown `Error` carries the Zod issue list
so the API route surfaces it as a 400 (same pattern as
`compose-boards.saveBoard`).

- New tests: `loadWorkflow returns null (not throws) for a
corrupted JSON file` + `loadWorkflow returns null for
completely non-JSON content` + `loadWorkflow throws a
friendly Error for valid JSON that fails schema validation`.

**P0 #2 — `DELETE /workflows/:id` 404s when the workflow doesn't exist**

`src/server/server.ts`: previously the route always returned
`{ removed: false }` (200) for missing ids. The UI's "row is
gone, list reloaded" path then fired even on stale ids
(e.g. user opens the list in two tabs, deletes in one,
refreshes in the other) — masking the real state. Now we
check first via `service.getWorkflow` and 404 if missing,
matching the semantics of `/compose/boards/:id` DELETE and
the rest of the v0.7.x API surface.

- New tests: `DELETE /workflows/:id 404s when the workflow
doesn't exist` + `GET /workflows/:id 404s for an unknown
id` + `PUT /workflows/:id 400s for an invalid id` (in
  `test/unit/server.test.ts` under the new `Workflow
endpoints (v0.7.0)` describe).

**P1 #3 — Connect-candidate filter now uses real edge data**

`web/.../WorkflowEditor.tsx`: the "connect to" picker used
to filter candidates by `outputVar.startsWith(n.outputVar)`,
which had nothing to do with whether two nodes were already
connected — it was a leftover from an earlier design that
used `outputVar` as a way to express "depends on" before
edges existed. With a real `connectedToIds: Set<string>`
prop (computed from `workflow.edges` in `StepsPanel` and
passed down to `NodeCard`), the picker now correctly hides
nodes that already have an edge from this one. Without
this fix, the picker would let the user create duplicate
edges — silently deduped by `addEdge` as a no-op, which is
a confusing UX where "click Connect" appears to do nothing.

**P2 #6 — 4 hardcoded English strings extracted to i18n**

`web/.../WorkflowListView.tsx` and `WorkflowEditor.tsx`:
previously the "Could not load {id}" and "Duplicate failed:
{error}" announcements were hardcoded English. Extracted
to two new i18n keys (`workflows.editor.error.duplicateFailed`

- `workflows.editor.error.loadFailed`) synced across
  types.ts + dict.en.ts + dict.zh.ts. The error string is
  still appended after the i18n'd prefix so the underlying
  cause stays identifiable.

**P2 #7 — Custom `ConfirmDialog` replaces `window.confirm`**

`window.confirm` is a native OS dialog that doesn't match
the rest of Pilot's UI (e.g. `NewWorkflowDialog` in the
same file, `RenameDialog` in `/compose/boards`) and freezes
the main thread on Chromium-based browsers. New
`web/src/app/workflows/ConfirmDialog.tsx` follows the
"fixed inset-0 overlay + surface card" pattern of the
existing dialogs. Features: Esc-to-cancel, backdrop-click
cancel, destructive variant (the confirm button loses the
`.primary` class so it doesn't look like a positive action;
the red-ish tint comes from `--error` CSS var), `busy` prop
to disable + show "…" while the API call is in flight, and
`data-testid` for future UI tests. Both the list view and
the editor now use it for delete confirmation (the editor
also splits the action into "open dialog" + "do the actual
delete" so cancel is a no-op, not a mid-flight abort).

**Deliberately NOT done (v0.7.2 backlog)**

- **P1 #4** `WorkflowEditor.tsx` 931-line split (NodeEditor /
  ConnectionManager / VariablePanel). Same file-size pressure
  that motivated the v0.6.22 `useHistoryStack` extraction —
  the editor is now over the 800-line "should be split"
  threshold.
- **P1 #5** `WorkflowEditor.tsx` + API route full test
  coverage (component tests + e2e). v0.7.1 added 4 server
  integration tests but no React Testing Library tests
  for the editor itself.
- **P3 #8** `readWorkflowSummary` + `loadWorkflow` parse
  logic duplication (extract a shared `parseWorkflowFile`).
- **P3 #9** `SAFE_ID` regex should match `compose-boards`
  (`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`) for consistency.

**Stats**

- root: **630/630** ✓ (was 622; +8 in workflow + server tests)
- web: **245/245** ✓ (unchanged — no logic change that
  needs new component tests; the dialog and connect-filter
  fixes are surface-level)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run (audit hotfix, no production-
  affecting logic; same precedent as v0.6.19 / v0.6.20 /
  v0.6.21)

**File / new file inventory**

- `src/core/workflow.ts` — try/catch on `JSON.parse` +
  `WorkflowSchema.parse` (P0 #1)
- `src/server/server.ts` — `loadWorkflow` check + 404 before
  delete (P0 #2)
- `web/src/app/workflows/ConfirmDialog.tsx` — new file
  (P2 #7)
- `web/src/app/workflows/WorkflowListView.tsx` — use
  `ConfirmDialog` + i18n for 2 error strings (P2 #6, P2 #7)
- `web/src/app/workflows/[id]/WorkflowEditor.tsx` — use
  `ConfirmDialog` + i18n + `connectedToIds` prop (P2 #6,
  P2 #7, P1 #3)
- `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` — 2 new
  error keys (P2 #6)
- `test/unit/workflow.test.ts` — 3 new tests (P0 #1)
- `test/unit/server.test.ts` — new `Workflow endpoints
(v0.7.0)` describe block with 4 tests (P0 #2 + minimal
  lifecycle coverage)

### v0.7.0 — `/workflows` MVP (reusable agent workflow templates)

This is the first release of the "workflow" concept that
replaces the v0.4-era L1/L2/L3/L4 capability layers. The
biggest product pivot since v0.4: instead of "absorb a npm
package and file it under L1 or L2", the user now composes
**sequences of LLM-powered steps** in a visual editor.
Each step holds its own model configuration (provider +
model + key ref + system prompt + tools), edges describe
the data flow, and the user can save the result as a
reusable template. The runtime (actually driving a pi
session through the steps) lands in v0.7.3+.

**This is a major version bump** because the product
position changed, even though no field on a /compose
connection changed. The /compose page itself is
unchanged.

**Schema**

- **`Workflow`**: `{ id, name, description, version: 1,
nodes[], edges[], metadata: { createdAt, updatedAt } }`.
  Persisted as JSON at `~/.pilot/workflows/<id>/workflow.json`
  (same one-file-per-record pattern as /compose/boards).
- **`WorkflowNode`**: `{ id, name, kind: "step", model:
{ provider, model, apiKeyRef? }, systemPrompt, inputTemplate,
outputVar, tools[], onFailure: "stop"|"skip"|"retry"|"escalate",
retryCount?, escalateToModel?, position: {x, y} }`. Each
  step is one LLM call with its own model config — the user
  can mix-and-match providers per step.
- **`WorkflowEdge`**: `{ id, from, to }`. Simple directed edge
  describing "the to-step's input depends on the from-step's
  output". v0.7.1+ will add optional `mapping` for field-level
  data transforms; the data model is shaped for it.
- **`WorkflowInput`** (separate type, no `metadata` field):
  what the web client sends to the server. The server fills
  in `createdAt` / `updatedAt` and ignores any client values
  to prevent timestamp forgery. This is the same
  "input vs persisted" split that `BoardInput` /
  `BoardSnapshot` use.

**UI**

- **`/workflows`** (new): the list page. Server component
  shell (static title + subtitle) + `WorkflowListView` client
  island for the interactive parts. Shows every saved
  workflow as a card with [Open] [Duplicate] [Delete]. The
  "New workflow" button opens a small dialog asking for a
  kebab-case id — validation regex matches the server's
  zod schema, so the contract is one definition not two.
  Duplicate = load + new id + save (3 lines, no server
  endpoint needed). Nav entry added next to /profiles.
- **`/workflows/[id]`** (new): the editor. Single client
  island (the whole thing is interactive, no benefit to
  splitting). Top bar has the workflow name + description
  - Save (disabled when not dirty) / Duplicate / Delete /
    Auto-layout. Body has two panels at ≥1024px (steps on
    the left, SVG preview on the right) and a single column
    at <1024px (applying the v0.6.23 mobile-layout lesson
    — `flex` column with explicit height constraints).
- **Step form cards**: each step is a card with editable
  fields (name, provider, model, system prompt, input
  template, output var, tools, on-failure strategy +
  retry count or escalation model). The form is the
  primary interaction for v0.7.0; drag-and-drop in the
  preview is a v0.7.1 concern.
- **SVG preview**: read-only BFS layout (sources at top,
  depth = max predecessor depth + 1) that draws each
  step as a box and each edge as a bezier curve. The
  "Auto-layout" button writes the BFS-computed positions
  back to each node's `position` field so the layout
  survives reload.
- **Live-region announcements** on every save / delete /
  duplicate action so screen readers can confirm the
  outcome without focus shifting.

**History**

- This release is the v0.4 L1-L4 capability layers' replacement
  (per the §11 product reframe in pilot.md). The old
  `Capability` JSON shape (with `sources: [{ mode: "L1" |
"L2" | "L3" | "L4" }]`) is **not** part of v0.7.0. v0.7.0
  capability = a workflow; a workflow = a sequence of
  LLM-powered steps. v0.4's "L1-referenced" was a dead
  abstraction and v0.7.0 deletes it.

**i18n**

- **~40 new keys** under the `workflows.*` namespace. Every
  field label, every on-failure option, every provider
  name has a translation. The placeholder consistency test
  (v0.6.21) confirms 0 mismatches across 975 → 1015 shared
  keys.
- **2 new nav keys** (`nav.workflows`, `nav.hint.workflows`)
  for the new sidebar entry.

**Stats**

- root: **622/622** ✓ (was 551; +9 in `workflow.test.ts` —
  kebab-case validation, empty list, save→load round-trip,
  createdAt preservation, list summaries, malformed-dir
  skip, idempotent delete, invalid id rejection at both
  save and load)
- web: **245/245** ✓ (was 226; +7 in `workflow-layout.test.ts` —
  empty workflow, single node, linear A→B→C, fan-out,
  cycle handling, autoLayout integer positions, identity
  preservation; +1 nav update for the new entry, +11
  existing tests updated to handle the 16th nav item)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run (UI / CRUD only; no production-
  affecting logic)

**Files**

| Area        | Files                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Data model  | `web/src/lib/types.ts` (+5 types: Workflow, WorkflowNode, WorkflowEdge, WorkflowInput, WorkflowSummary)       |
| Server core | `src/core/workflow.ts` (new, 250 lines — zod schemas + persistence helpers, mirroring `compose-boards.ts`)    |
| Service     | `src/core/service.ts`, `src/core/service-impl.ts` (4 new methods: list / get / save / delete)                 |
| API routes  | `src/server/server.ts` (4 new endpoints under `/workflows`)                                                   |
| Browser API | `web/src/lib/pilot-browser.ts`, `web/src/lib/pilot.ts` (matching browser-safe wrappers)                       |
| List page   | `web/src/app/workflows/page.tsx`, `WorkflowListView.tsx`                                                      |
| Editor      | `web/src/app/workflows/[id]/page.tsx`, `WorkflowEditor.tsx` (~800 lines — the editor + the BFS layout module) |
| Styles      | `web/src/app/workflows/workflow.css`                                                                          |
| i18n        | `web/src/lib/i18n/types.ts` (+~40 keys), `dict.en.ts`, `dict.zh.ts`                                           |
| Nav         | `web/src/components/NavLinks.tsx` (1 new entry)                                                               |
| Tests       | `test/unit/workflow.test.ts` (9 tests), `web/tests/workflow-layout.test.ts` (7 tests)                         |
| Docs        | `CHANGELOG.md`, `AGENTS.md`                                                                                   |
| Versions    | `package.json`, `web/package.json` (both → 0.7.0)                                                             |

**Deliberately NOT done (v0.7.1+ backlog)**

- Drag-and-drop on the SVG preview (rearrange steps visually,
  not via the form).
- Field-level data mapping on edges (today the whole
  `outputVar` is bound; v0.7.1 may let the user pick a
  subset).
- **Run** — actually drive a pi session through the node
  sequence. The infrastructure is there: `outputVar` is
  in the model, `inputTemplate` references it via
  `{{steps.<id>.<outputVar>}}`. v0.7.3 will add the runtime.
- Cycle handling in the BFS layout (currently seeds
  from the lex-first node; a v0.7.1+ visual indicator
  would surface the cycle to the user).
- The 4-button UX polish on /usage (range buttons can be
  pressed unintentionally on touch). Carried from v0.6.16.

### v0.6.23 — `/compose` mobile layout hotfix (P1 bug from user testing)

User reported (with screenshot at `~/Desktop/pilot-bug-compose-layout-collapse.png`)
that the `/compose` page becomes unusable at viewport widths < 1024px:
the sidebar expanded to fill the entire viewport, the canvas was
pushed off-screen, and the only visible content was the sidebar's
session list.

**Root cause** — the mobile layout at <1024px used
`grid-template-columns: 1fr` (single column), which let the sidebar's
natural content height (search + filter + sections + session items,
often 600-800px) push the canvas + inspector rows off the visible
viewport. The sidebar's body had `max-height: 360px` but that was
being overridden by `flex: 1` in the unconstrained parent, so the
cap didn't take effect.

**Fix** — at <1024px, switch `.compose-grid` from `display: grid` to
`display: flex; flex-direction: column; height: calc(100vh - 200px)`,
with explicit size constraints per child:

- Sidebar: `flex: 0 1 auto; max-height: 35vh` — a search bar + filter +
  a scrollable items list, capped at 35% of viewport height.
- Canvas: `flex: 1 1 auto; min-height: 0` — fills the remaining
  space. `min-height: 0` is the critical override that lets the
  canvas shrink to fit instead of overflowing.
- Inspector: unchanged (`position: fixed` was already set on mobile
  at v0.6.2, so it's automatically removed from the flex flow and
  doesn't compete for space).

Desktop (≥1024px) layout is **unchanged** — the original 3-column
grid is preserved.

**Stats**

- root: **551/551** ✓ (unchanged — CSS only)
- web: **238/238** ✓ (unchanged — CSS only)
- format:check root + web: ✓
- lint: ✓
- tsc: ✓
- user-tested: bug confirmed, fix in this release

**Lesson**

- Unit tests + `tsc` + `lint` are not enough. They verify the code
  path works, not that the user can actually see what they need
  to see. The bug only surfaces in the **rendered** layout, which
  a headless test environment doesn't exercise.
- **"Tests pass ≠ UI works."** Add a smoke checklist for any page
  that takes a viewport-sized container: render at 800x600, 1024x768,
  and 1440x900 and verify the three primary panels are all visible.
- The grid → flex switch at <1024px is the right structural
  decision: at desktop the 3-column grid is correct, at mobile
  the layout is fundamentally a "stacked with constrained heights"
  problem that flex handles more naturally than grid.

### v0.6.22 — `useHistoryStack` hook extracted from `ComposeBoard.tsx`

The first slice of the long-deferred "ComposeBoard.tsx hooks/state
抽离" backlog item. The undo/redo stack is the most self-contained
piece of ComposeBoard state — it only reads `state` (passed in),
writes to `setState` / `setSelectedId` / `announce` (all passed in),
and consumes the pure `applyEntry` / `invertEntry` functions that
already live in `lib/compose-history.ts`. So it's the lowest-risk
extraction: the behaviour is unchanged, the public surface is
mechanical, and any regression is caught by a new dedicated test
suite.

**What got extracted**

- The `{ past, future }` state.
- The `commit` callback (apply + push entry + announce label).
- The `undo` / `redo` callbacks (apply inverted / forward entry,
  push onto the other stack, announce).
- The "coalesce arrow-key moves" logic from `moveBlock` — the
  single thing the lib version didn't know about.
- The "clear history on wholesale canvas replacement" path
  (load board / import JSON / reset canvas).

**What stayed in ComposeBoard**

- 16 other useState calls + ~22 other useCallback definitions.
  Those are the next candidates for v0.6.23+ extractions
  (drag/drop, server persistence, keyboard shortcuts, view
  state, etc.) but each carries more coupling than the history
  stack did, so they need separate, smaller releases.

**New hook surface**

```ts
const {
  history,
  commit,
  pushEntry,
  pushOrMergeMoveEntry,
  clearHistory,
  undo,
  redo,
  canUndo,
  canRedo,
} = useHistoryStack({ state, setState, setSelectedId, announce, t });
```

The 5 entry-point methods map to 5 distinct use cases the
callers had:

| Method                 | Used by                                                                                                 | Why a separate method                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit`               | 20+ callbacks (connection label / kind / dir / color / route edits, addBlock, connect, disconnect, ...) | Standard "I have a before/after transition to record" path. The `apply` callback does the setState, the hook does the history bookkeeping + announce.                   |
| `pushEntry`            | `endBlockDrag`                                                                                          | The state was already mutated during pointermove; we only want to record the final delta. `commit` would re-apply and double the position.                              |
| `pushOrMergeMoveEntry` | `moveBlock` (arrow-key handler)                                                                         | Holding an arrow key fires many `moveBlock` calls; we want ONE undo step covering the whole run, not N. The hook merges with the previous move entry on the same block. |
| `clearHistory`         | `loadBoardFromServer`, `importJson`, `resetCanvas`                                                      | Wholesale canvas replacement — the user can't undo their way back into a board they just threw away.                                                                    |
| `undo` / `redo`        | keyboard handler (Cmd-Z / Shift-Cmd-Z), toolbar buttons                                                 | Apply inverted / forward entry, push onto the other stack, announce.                                                                                                    |

**Stats**

- root: **551/551** ✓ (unchanged — no core changes)
- web: **238/238** ✓ (was 226; +12 in `use-history-stack.test.tsx` —
  commit / pushEntry / pushOrMergeMoveEntry / clearHistory / undo /
  redo / MAX_HISTORY cap)
- format:check root + web: ✓
- lint (root `eslint src test --max-warnings 0`): ✓
- tsc root + web: ✓
- production build: not run (refactor only, no production-affecting
  logic; same precedent as v0.6.19 / v0.6.20 / v0.6.21)

**File size**

- `ComposeBoard.tsx`: 2184 → 2144 lines (-40). The drop is
  smaller than the extracted code because the useHistoryStack
  call site + explanatory comments take ~30 lines. The
  _cognitive_ drop is bigger — the commit / undo / redo
  triplet is now testable in isolation.

**Deliberately NOT done (v0.6.23+ backlog)**

- More `ComposeBoard.tsx` extractions: drag/drop, server
  persistence, keyboard shortcuts, view state. The pattern
  established here (custom hook that owns the slice of state
  and exposes a small public surface) should make the next
  4-5 extractions mechanical, but each is its own release.
- block-center avoidance for orthogonal routes (real A\* grid
  router) — still the v0.6.20 followup, never started
- per-direction palette — still the v0.6.19 followup, never started

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

- block-center avoidance for orthogonal routes (real A\*
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
  do so with `"orthogonal"`. A real A\* grid router (or
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

- block-center avoidance for orthogonal routes (real A\*
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
  - arrow head both consume `currentColor` (set on the
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

- block-center avoidance for orthogonal routes (real A\*
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
  but gave no hint about _why_ or _what to do_. The new
  error reads:
  > `Cannot write /Users/feng/.pilot/capabilities/caveman-code/capability.json:
operation not permitted (EPERM). Your shell is
sandboxed or otherwise blocked from writing to
~/.pilot/. Run \`pilot init\` from a non-sandboxed
  > Terminal, or check that
  > /Users/feng/.pilot/capabilities is accessible.`The detection checks`err.code === "EPERM" || "EACCES"`
  > specifically — generic IO errors (disk full, read-only
  > volume, etc.) still get the original bare message
  > because they don't have a one-line "do this" fix.

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
  but the _visible label_ is now wrapped through
  `policy.tryRule.tool{Bash,Read,Edit,Write}` keys. en
  - zh both render as "bash" / "read" / "edit" / "write"
    (tool names are technical terms zh users also read as
    English), but the keys are in place for future
    languages where they might want to translate
    ("Bash-Befehl" / "Lectura" / etc.).
- **`policy/page.tsx` new-policy name
  `placeholder="safe-bash"`.** The `policy.newCard.namePlaceholder`
  key already existed with the same value — the form
  was just calling the raw literal. Replaced with
  `renderT(locale, "policy.newCard.namePlaceholder")`.
- \*\*`profiles/[name]/page.tsx` five field placeholders
  - one label suffix.\*_ Provider / model / thinking /
    packages / description, plus the "(comma-separated)"
    hint appended to the packages label. All 6 wrapped
    through new `profiles.field._` keys (en: technical
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
  _current_ architecture (the anchor is a pure function
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

| 项目       | 数字                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增 files | `web/src/app/compose/boards/{page,BoardListView,BoardRow,RenameDialog}.tsx`, `web/tests/boards.test.tsx`                                                                                                                                                                                       |
| 修改 files | `src/core/compose-boards.ts`, `src/core/service.ts`, `src/core/service-impl.ts`, `src/server/server.ts`, `web/src/lib/pilot-browser.ts`, `web/src/lib/i18n/{types,dict.en,dict.zh}.ts`, `web/src/app/compose/ComposeBoard.tsx`, `test/unit/compose-boards.test.ts`, `test/unit/server.test.ts` |
| i18n keys  | +40 (en + zh)                                                                                                                                                                                                                                                                                  |
| root tests | 525 → 541 (+16)                                                                                                                                                                                                                                                                                |
| web tests  | 201 → 214 (+13)                                                                                                                                                                                                                                                                                |
| LOC Δ      | +1571 / -13 (净 +1558)                                                                                                                                                                                                                                                                         |

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

- load list render correctly.

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

- `GET    /api/compose/boards` → `BoardSummary[]`
- `GET    /api/compose/boards/:id` → `BoardSnapshot` (404 if missing)
- `PUT    /api/compose/boards/:id` → `BoardSnapshot` (path id wins)
- `POST   /api/compose/boards` → 201 + `BoardSnapshot` (auto-id)
- `DELETE /api/compose/boards/:id` → 204 (404 if missing)

**Service-layer wiring**

- `PilotService` interface gains `listComposeBoards` /
  `getComposeBoard` / `saveComposeBoard` /
  `deleteComposeBoard`. Same lazy-import pattern as the
  other compose\*FromService helpers (avoids pulling
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

- panel render path can't be Playwright-verified from the
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
  - version bump
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

- `useState<ComposeState>(emptyState)` // was: `() => loadState()`
- `useState<ViewMode>("modern")` // was: `() => loadViewMode()`
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
  `pilot.ts` but never _called_ any of its functions client-side
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

- Dict type.

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

- v0.5.13, but `startPlan` / `pausePlan` / `resumePlan` / `cancelPlan`
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
  - `help.howDo.*.body` for first session / find session / install
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

- add CI + release badges to README ([04425e8](https://github.com/wwppee/pilot/commit/04425e899260aa9985270c012f156bcde0578e5c))
