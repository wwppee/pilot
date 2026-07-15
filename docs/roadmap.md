# Roadmap

> 三段式叙事：**看见 Pi** → **管理 Pi** → **进化 Pi**。
>
> 每段都是独立可交付的小版本，按周迭代，不跨段承诺。
>
> **2026-07-07 校准**：阶段一和阶段二已全部发完。阶段三走到 **v0.5.7**（Plan 数据模型 + CRUD + CLI 基线）。从 v0.5.7 开始，Pilot 的定位从"Pi 的管理面板"升级为**自主智能体工具**——新增 Plan（任务规划）、Agent Loop（自主执行）、Workflow（工作流编排）三大能力。详见 [`docs/roadmap-agent.md`](./roadmap-agent.md)。
>
> **2026-07-09 校准**：v0.5.7 之后连发 v0.5.8 - v0.5.12 共 5 个版本，全部是 **Web UI 收尾 + 设计系统重构**，没有新功能上线。这是为下一站「Web UI for Plans」铺的视觉 / 可达性 / 国际化底座：
>
> | 版本 | 内容 |
> |---|---|
> | **v0.5.8** | Session 详情加固：16-type tree union + 6-chip filter bucket + ErrorSurface + RetryButton + 16 个 i18n key |
> | **v0.5.9** | Sessions 列表 Topic 列：`firstUserPreview` 从 JSONL 提取（≤120 字，兼容 legacy + v3 两种 schema） |
> | **v0.5.10** | i18n 大扫除（7 个页面的硬编码英文）+ `<Skeleton>` 组件 + `loading.tsx` / `error.tsx` / `not-found.tsx` + zh 自然度打磨 |
> | **v0.5.11** | 设计系统重构：22 项审计收尾——design tokens（`.card` `.pill` `.section-h2` `.form` 等）+ Policy 页 CSS 全面修复 + ComposeBoard 3-tier 响应式 + 5 种 EmptyState 统一 |
> | **v0.5.12** | 审计第二轮：`<RichT>` 组件（i18n + ReactNode 占位符）+ 5 种调色板硬编码 → CSS tokens + 7 个内联按钮 → `.btn` + `/context` 加 `<DiscoveryRules>` 折叠面板 + ICU plural 字面量 bug 修复 |
>
> 下一站是 **v0.6.0 — PlanExecutor 反馈循环**（原计划 3-4 周）。如果先做「Web UI for Plans」（Plan 状态实时可视化、retry/skip 按钮、Task DAG 图、事件历史时间轴），需要在 v0.6.0 之前单独切一个版本号（候选 v0.5.13）。
>
> **2026-07-09 校准 (2)**：**v0.5.13 已发**——Web UI for Plans 的数据层 + UI 骨架先于 PlanExecutor 落地。Plan 详情页从单一任务列表重构为 5 个明确分区（Header / Context / Task graph / Tasks / Event log），并新增 3 个组件：
>
> | 版本 | 内容 |
> |---|---|
> | **v0.5.13** | Plan 详情页重组：`<PlanStatusPill>`（统一 Plan / Task / Step 三种状态的彩色 pill）+ `<PlanTaskGraph>`（DAG 表格视图，显示每个任务的 dependsOn / blocks 边）+ `<PlanEventTimeline>`（读取 `~/.pilot/plans-history/*.jsonl` 的事件日志）。后端新增 `listPlanEvents()` + `GET /plans/:id/events`。49 个新 i18n key（task/step 状态、action type 标签、event type 标签）+ 重构 `/plans/[id]/page.tsx` 消除所有 section heading 硬编码英文。 |
>
> **下一站**：v0.6.0 PlanExecutor（反馈循环）。retry/skip 按钮等实时控制要等 PlanExecutor 就绪——这次 v0.5.13 没做按钮，但 DAG 视图 + 事件时间轴已经为 v0.6.0 的实时刷新铺好了 UI。
>
> **2026-07-09 校准 (3)**：**v0.5.14 已发**——「Pilot 在浏览器里跑 pi」的目标落地第一段。Pilot server 加 WebSocket 路由 `/api/pi/ws`，每个浏览器 tab 直接连到服务端 spawn 的 `pi --mode rpc` 子进程；web 侧 `<usePiSession>` hook 把 WebSocket 封成 React state，配合 `/playground` 演示页验证整条链路：
>
> | 版本 | 内容 |
> |---|---|
> | **v0.5.14** | Pi RPC bridge：服务端 `PiRpcBridge` 包 `RpcClient`（来自 `@earendil-works/pi-coding-agent`），通过 30+ 类型化 `RpcCommand` 把 pi 的 RPC 协议映射到 WebSocket。token 通过 `Sec-WebSocket-Protocol` 子协议传递（浏览器 WebSocket API 不能加自定义 header）。web 侧 `<usePiSession>` + `/playground` 演示 prompt/abort/new-session 流式事件。`/api/pi/token` 端点暴露 token 给浏览器（同源 localhost 才安全）。WebSocket 的 onRequest 钩子跳过全局 token 检查；握手后由 `/api/pi/ws` 路由自己读 `socket.protocol` 校验。|
>
> **下一站**：v0.6.0 PlanExecutor。Plan 的 `pi_session` action 直接复用 `usePiSession` + RpcClient 调 `r.prompt()`，不再需要单独的集成层。retry/skip 按钮也会基于 WebSocket 实时刷新（PlanExecutor 写事件 → JSONL → 浏览器收 WS push → 重新渲染）。
>
> **2026-07-09 校准 (4)**：**v0.5.14.1 已发**——v0.5.14 WebSocket bridge 的 12 项自审（1 P0 / 4 P1 / 7 P2）全部修复，没有新功能：
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **P0#1** | `pi-rpc-bridge.ts` + `usePiSession.ts` | 服务端在每条 `kind: "response"` 回传请求 `id`；客户端先按 id 匹配 pending Promise，再回退 FIFO by command type。否则两个并发同类型命令（如 prompt + abort）会死锁。 |
> | **P1#2** | `usePiSession.ts` | 每条 pending 命令挂 30s `setTimeout`，到时 reject；timeoutId 在响应到达或 reject 时清掉，避免僵尸 setTimeout。 |
> | **P1#3** | `pi-rpc-bridge.ts` | dispatch `switch` 加 `default` 分支，未知命令返回 `success: false, error: "unknown command: <type>"`。 |
> | **P1#4** | `server.ts` | WebSocket 路由加 `onClose` 钩子，server 关闭时遍历 `liveBridges` 调 `bridge.close()`，避免 `pi --mode rpc` 孤儿进程。 |
> | **P1#5** | `pi-rpc-bridge.ts` | `socket.on("message")` 原始 raw 在 parse 前先做 Buffer / ArrayBuffer / Buffer[] → string 转换；测试覆盖 string + Buffer 两种入参。 |
> | **P1#6** | `api/pi/token/route.ts` | 端点加 localhost-only 检查：解析 `x-forwarded-for` 首跳 + 校验 `127.0.0.1` / `::1` / `localhost` / 空 host，否则 403。同源保护之外多加一层（防注入脚本 fetch）。 |
> | **P2#7** | `playground/page.tsx` + i18n | 23 个 playground 文案改走 `<T>`。 |
> | **P2#8** | `usePiSession.ts` + `playground/page.tsx` | `safeStringify()` 包 try/catch，循环引用 payload 不再炸 event log。 |
> | **P2#10** | `playground/page.tsx` | 事件列表 React key 用 `${type}-${counter}`，不用 array index，避免日志 prepend 时跳行。 |
> | **P2** | `sessions/[id]/page.tsx` | `$${cost}` 硬编码 → `renderT(locale, "currency.usd", {amount})`。 |
>
> 同时**重构**：`pi-rpc-bridge.ts` 把构造器里的 message listener 拆成私有 `onMessage(raw)` 方法（之前 listener 写在 `start()` 里，单测要起真 pi 进程才能触发 dispatch；现在 listener 在构造器注册，方法体可独立单测）。新增 `test/unit/pi-rpc-bridge.test.ts` 5 个用例覆盖 id 回传 / default case / Buffer raw / 非法 JSON / close 幂等。
>
> **2026-07-09 校准 (5)**：**v0.5.14.2 已发**——复查 v0.5.14.1 发现 P0#1 修复**不完整**：客户端 `usePiSession.onmessage` 里 id 匹配分支实际没写（`let pending` 声明即 undefined，`if (!pending)` 恒真，永远走 FIFO），仍然会并发死锁。同时 `socket.once("close", ...)` 在某些 `@types/ws` 版本下类型不兼容：
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **P0#1** | `web/src/lib/usePiSession.ts` | `onmessage` 加真正的 id 匹配：`msg.id` 在 `pendingRef` 里直接 get+delete；找不到再 fallback FIFO by command-type。`PiCommandResponse` 类型加 `id?: string`。 |
> | **防御** | `src/server/server.ts` L752 | `socket.once("close", ...)` → `socket.on("close", ...)`。`.once` 在 `@types/ws` 不同版本下不总是 declared；`.on` 在 socket 已关闭后等价。 |
>
> 新增 `web/tests/use-pi-session.test.tsx` 4 个用例：两个并发 prompt 按 id 分流、FIFO fallback（无 id）、错误响应 reject、30s timeout。
>
> **2026-07-10 校准 (6)**：**v0.5.14.3 已发**——v0.5.14 review 报告的两个小尾巴：
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **P1** | `playground/page.tsx` L194 | textarea 的 `placeholder="playground.prompt.placeholder"` 是字面量 key 字符串，渲染出来给用户看到 raw i18n key。改用 `useT()` hook 走翻译，与页面上其他文案一致。en 显示 `e.g. "List the files in the current directory"`，zh 显示 `例如："列出当前目录的文件"`。 |
> | **P2** | `pi-rpc-bridge.test.ts` L73 / L115 / L146 | 三处 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 指令是多余的（规则其实没启用），触发 `--max-warnings 0` lint 失败。把 `(bridge as any).rpc = ...` 换成结构化 cast `(bridge as unknown as { rpc: RpcClient }).rpc = ...`——同样效果，不需要 disable 指令。 |
>
> **2026-07-10 校准 (7)**：**v0.5.15 已发**——v0.5.14 的 `/playground` 名字 + 形态都不对（raw event log 不像 chat，名字像开发页不像用户页）。重命名为 `/try`（"试玩" / "Try pi"），并重做 UI 成真正的 chat 体验：
>
> | 改动 | 位置 |
> |---|---|
> | 新增 reducer `chat-stream.ts` | `web/src/lib/chat-stream.ts` —— `ChatMessage` 模型（`role + blocks: text/thinking/toolCall[] + status`），`reduceStream()` 纯函数把 pi 的 `AgentEvent` 流变成 chat 列表。处理 `text_delta` / `thinking_delta` 累积 + tool call 生命周期 + `message_end` 状态翻转。 |
> | 重写页面 | `web/src/app/try/page.tsx` —— 真正的 chat layout：用户气泡在右（accent 色）、助手气泡在左（surface-2）、自动滚动；thinking + tool calls 可折叠；status pill + Connect/Disconnect/New session/Abort 一行；Cmd/Ctrl-Enter 发送。 |
> | 原始事件流降级 | `<details>` 折叠的"Developer details"面板，开发调试用，主界面不再被 raw JSON 淹没。 |
> | 重命名 | URL `/playground` → `/try`；nav "Playground"/"试玩" → "Try pi"/"试玩 pi"；所有 i18n key `playground.*` → `try.*`（en + zh）；新增 7 个 chat 专用 key。 |
>
> 新增 `web/tests/chat-stream.test.ts` 6 个用例。core 522/522、web 139/139（+6）、lint clean、format 双清。
>
> **2026-07-10 校准 (8)**：**v0.5.16 已发**——把 pi 的 session tree 接进 `/try` chat UI。v0.5.15 只能聊，看不到 / 控制不到 tree。这版补上：
>
> | 改动 | 位置 |
> |---|---|
> | 新增组件 `SessionPanel` | `web/src/components/SessionPanel.tsx` —— header 横条：当前 session 名（点开 inline rename 走 `set_session_name`）、消息数（`.one`/`.other` plural）、Clone 按钮（`clone()`）。 |
> | 新增组件 `BubbleActions` | `web/src/components/BubbleActions.tsx` —— 每个用户气泡 hover 出现"↳ Fork from here"，点击先弹确认再调 `fork(entryId)`，因为 fork 会建新 session 文件，不能误触。 |
> | 接入 try 页面 | `web/src/app/try/page.tsx` —— `get_state` 在 connect + 每个变更（prompt/rename/clone/fork）后拉一次（pi 不发 public tree-change event，靠 mutation polling）。fork 流程：点击 → `get_fork_messages()` 匹配 entryId → `fork(entryId)` → 清本地气泡 → 重拉 state；header 显示 `↳ Forked from "<oldName>"` 直到用户在分支里发新消息。clone 流程对称。 |
> | i18n | 新增 15 个 `try.session.*` key（en + zh）：title / unnamed / rename + placeholder + save/cancel / clone + hint / messageCount.one/other / forkedFrom / forkHere / forkConfirm / forkButton / forkCancel / cloneOk。 |
>
> 新增 `web/tests/try-session.test.tsx` 9 个用例（SessionPanel 6 + BubbleActions 3）。core 522/522、web 148/148（+9）、lint clean、format 双清。
>
> **2026-07-10 校准 (9)**：**v0.5.17 已发**——手机宽度下 `/try` 有两个问题：
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **bug** | `web/src/lib/chat-stream.ts` | 一个 prompt 出现两个 user bubble。reducer 没跳过 pi 回传的 `message_start {role: "user"}` 事件，加上本地 `userMessage()` 合成就有了两个。reducer 跳过 user-role 事件即可；user bubble 只来自 `userMessage()`。 |
> | **响应式** | `web/src/app/try/page.tsx` + 新 `web/src/components/OverflowMenu.tsx` | 手机宽度下三个 button 行 + 输入框挤一起。改成：mobile 折叠到单个 `⋯` overflow 菜单（原生 `<details>`，零 JS）；SessionPanel 加 `compact` 模式（mobile 只显名称+计数）；input bar sticky bottom + 44px 触屏目标；chat bubble mobile `max-w-[92%]`，desktop `80%`；header subtitle mobile 隐藏；页面高度用 `100dvh` 处理 mobile 浏览器 chrome。 |
>
> 新增 `web/tests/overflow-menu.test.tsx` 3 个用例 + `chat-stream.test.ts` +2。core 522/522、web 153/153（+5）、lint clean、format 双清。
>
> **2026-07-10 校准 (10)**：**v0.5.18 已发**——给初学者做的全面引导。每一页都用 inline hint + glossary 解释 jargon；nav 重做成三组（Inspect / Manage / Learn）+ 每个链接加 emoji 图标 + hover tooltip；新增 `/help` 页面（glossary + how-tos + 架构说明）。
>
> | 改动 | 位置 |
> |---|---|
> | 新组件 `<Hint>` | `web/src/components/Hint.tsx` —— inline collapsible"What is this?"展开。 |
> | 新组件 `<GlossaryTerm>` | `web/src/components/GlossaryTerm.tsx` —— dotted-underline jargon，hover 出定义；数据源 `web/src/lib/glossary.ts`（13 项：pilot / pi / session / capability / avatar / profile / pack / fork / context / policy / plan / rpc / token / contextWindow），所有页面引用同一份定义。 |
> | 新组件 `<WelcomeBanner>` | `web/src/components/WelcomeBanner.tsx` —— dismissible 3-step first-visit card，SSR-safe。 |
> | 新组件 `<NavTooltip>` | `web/src/components/NavTooltip.tsx` —— popover-on-hover 包装，纯 CSS。 |
> | Nav 重设计 | `web/src/components/NavLinks.tsx` —— 三组（Inspect / Manage / Learn）+ 每个链接 emoji 图标 + hover tooltip。Try pi 移到位置 2（最适合新用户）。新增 `/help`（Learn 组的唯一个）。 |
> | 新页面 `/help` | `web/src/app/help/page.tsx` —— How-do-I（6 个 starter cards）+ Glossary（13 项带锚点）+ Architecture（一段话）。 |
> | Dashboard | 加 WelcomeBanner + StatCards 加 `?` GlossaryTerm（Sessions + Tokens）。 |
> | Sessions | 顶部 `<Hint summary="What's a session?">` 段。 |
> | Try | 顶部 `<Hint summary="What is this page?">` 段，解释 Connect / Fork / Rename / Clone + `<GlossaryTerm term="rpc">`。 |
>
> 新增 `web/tests/onboarding.test.tsx` 8 个用例 + `nav-links.test.tsx` 更新。core 522/522、web 163/163（+10）、lint clean、format 双清。剩余 11 个页面（Usage / Tools / Context / Capabilities / Avatars / Plans / Packages / Profiles / Forge / Policy / Compose）的引导下个版本 v0.5.19 走。
>
> **2026-07-10 校准 (11)**：**v0.5.19 已发**——v0.5.18 铺完共享组件 + /help + nav + 3 个关键页；这版补全剩下 11 个页面：
>
> | 页面 | Hint 主题 | 关键 GlossaryTerm |
> |---|---|---|
> | Usage | token / cost / cache 解释 | token, profile |
> | Tools | 工具是什么 + safety badge | tool, policy |
> | Context | loaded vs info 文件 | context |
> | Capabilities | capability 是什么 | capability |
> | Avatars | avatar vs profile 区别 | avatar, profile |
> | Plans | plan 是什么 + v0.6.0 executor | plan |
> | Packages | package 是什么 + 安装流 | pack, tool, capability |
> | Profiles | profile vs avatar 区别 | profile, capability, avatar |
> | Forge | forge 是干嘛的 | capability, profile |
> | Policy | policy 是什么 + apply/unapply | policy |
> | Compose | compose 是 sandbox 不是配置工具 | capability, profile |
>
> Glossary 新增 `tool`（14 项）。`onboarding.test.tsx` +1。core 522/522、web 163/163、format 双清、lint clean。
>
> **2026-07-10 校准 (12)**：**v0.5.20 已发**——把 pi 完整会话树画到 `/try` 页面。之前 v0.5.16 的 bubble fork 只能对当前 turn 操作；这版加一个折叠的"Conversation tree"面板，能看见所有分支 + 从任意 user 节点 fork。
>
> | 改动 | 位置 |
> |---|---|
> | 新组件 `SessionTreeView` | `web/src/components/SessionTreeView.tsx` —— 拉 `GET /sessions/:id/tree`，渲染嵌套 ul（按 depth 缩进 + 垂直连接线 + siblingIndex/siblingCount 标号），高亮当前路径（用 events 时间戳反推），每个 user 节点 hover 出 `↳` 直接 fork。 |
> | Try 页面接入 | `app/try/page.tsx` —— 在 SessionPanel 和 chat 之间加 `<details>` 折叠面板；抽出 `forkByText` 让 bubble fork 和 tree fork 共用 `get_fork_messages` 查找；新 `latestEventTimestampMs` 给 tree 高亮用。 |
> | i18n | 6 个新 key（title / hint / empty / stats / branches.one+other / depth）。 |
>
> 新增 `web/tests/session-tree.test.ts` 7 个用例（flatten 线性/分支/深树 + findCurrentPath 无事件/线性/分支发散）。core 522/522、web 170/170（+7）、format 双清、lint clean。
>
> **2026-07-10 校准 (13)**：**v0.5.21 已发**——修 v0.5.18 引入的 P0 SSR 崩溃 + 两个 P2 硬编码英文。
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **P0** | `web/src/components/NavLinks.tsx` | 没有 `"use client"` 但调用 `useT()`，tsc 不报错但 `next build` 在静态生成时报 "useT() from the server"。重写成 Server Component：拿 `locale: Locale` prop，用纯 `renderT(locale, key)`。`NavTooltip` 也清掉 `"use client"`（纯 JSX）。`layout.tsx` 传 locale 下来。 |
> | **P2** | `web/src/app/page.tsx` | `<WelcomeBanner>` 标题/intro/3 步文案全英文硬编码。`page.tsx`（server component）现在用 `renderT(locale, "home.welcome.*")` 预翻译后传 props 进去。 |
> | **P2** | `web/src/components/NavLinks.tsx` | 每个 `NavItem` 的 `hint: string` 硬编码英文。改成 `hintKey: HintKey`，渲染时用 `renderT(locale, hintKey)`。新增 15 个 `nav.hint.*` key（en + zh）。 |
>
> 测试：`nav-links.test.tsx` 完全重写以适配新签名 + 加了 `locale="zh"` 块（断言所有 tooltip 都有中文、不暴露 raw key）。11/11 通过。`npm run build` 现在能成功（之前每页都报 P0 错）。core 522/522、web 170/170、format 双清、lint clean。
>
> **2026-07-10 校准 (14)**：**v0.5.22 已发**——P2 硬编码英文第三轮：把 v0.5.18 漏的两块补完。
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **P2** | `web/src/lib/glossary.ts` | 旧 shape `{short: string, definition: string}` 全英文。改成 per-locale `{short: {en, zh}, definition: {en, zh}}`，加 `shortFor` / `definitionFor` helper（缺 zh 时 fallback 到 en）。`record` helper 给想读原始 locale map 的调用方。15 个条目全员双语。 |
> | **P2** | `web/src/components/GlossaryTerm.tsx` | 新增 `locale: Locale` prop。14 个 caller 全部更新：11 个 server pages（直接从 `negotiateLocale` 拿 locale）+ 2 个 client components（`useI18n()` 拿 locale）+ Dashboard `StatCard`（接 `locale` prop 透传）。 |
> | **P2** | `web/src/app/help/page.tsx` | 原 sync 组件读 raw `entry.short` / `entry.definition`（新 shape 之后不再 typecheck）。重写为 async server component：自己协商 locale（Accept-Language），glossary 走 `shortFor` / `definitionFor`；6 张 "How do I…" 卡片 12 个新 key（`help.howDo.*.title` / `*.body`）。 |
> | **P2** | 13 个页面的 inline `<Hint>` | 全部把英文 JSX 段落 + inline `<GlossaryTerm>` / `<code>` / `<strong>` / `<em>` 重构成 `<RichT locale={locale} k="*.hint.body" values={...} />`。`summary` prop 也改成 `<T k="*.hint.summary" />`。`hint.defaultSummary` 给 Hint 组件的默认 "What is this?" 兜底。共 27 个新 key（13 × summary + 13 × body + 1 default）。 |
>
> 涉及 13 个页面：`tools` `context` `capabilities` `plans` `compose` `usage` `sessions` `forge` `packages` `profiles` `avatars` `policy` `try`（其中 `try` 是 client component，用 `useI18n()` 拿 locale）。`compose` / `forge` 原本没接 `negotiateLocale`，这次顺带补上。
>
> 测试：`onboarding.test.tsx` 重写以适配新 helper + 新 `locale` prop；加 zh 渲染 case + "每个 key 在两个 locale 都非空" 不变量。9/9 通过。core 522/522、web 171/171（+1）、format 双清、lint clean、`npm run build` 成功、tsc clean。
>
> **2026-07-11 校准 (15)**：**v0.5.23 已发**——PlanExecutor MVP 切片落地。原 `startPlan` / `pausePlan` / `resumePlan` / `cancelPlan` 只翻 status，这版接上真执行器。
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **新功能** | `src/core/plan-executor.ts` (新增) | `class PlanExecutor` —— 顺序策略（parallel/adaptive 留 enum 给 v0.6.0）。3 个真 action：`pilot_command`（spawn child + 捕获 stdout/stderr + 监听 cancel signal 杀子进程）/ `profile_switch`（调 `service.activateProfile`）/ `policy_apply`（调 `service.applyPolicy`）。5 个 stub：`pi_session` / `pack_install` / `condition` / `wait` / `manual`（返回 success + `{stubbed: true, reason: "v0.5.23 MVP"}`）。 |
> | **持久化** | `src/core/plan.ts` | 新增 `PlanRuntimeSnapshot` interface + `writeRuntimeSnapshot` / `readRuntimeSnapshot` / `deleteRuntimeSnapshot`（原子 tmp+rename）。`~/.pilot/runtime/plans/<id>.json` 是恢复的唯一事实源。 |
> | **接 service** | `src/core/service-impl.ts` | `startPlan` 翻 status 后调 `getDefaultRegistry().start(planId, service, home)`（fire-and-forget）。`pause` / `cancel` 立即翻 status 让 UI 响应，同时通知 executor 在下一个 step boundary 停下。`resume` 优先调活着的 executor，否则用 snapshot 启动新的。抽出 `activateProfileByName` 命名函数给 executor adapter 用。 |
> | **崩溃恢复** | `src/server/server.ts` | `startServer` 构造 `app` 后调 `recoverRunningPlans` —— 扫 `runtime/plans/*.json`，plan 还在 running 的就 `registry.start` 重新跑；plan 没了 / 已非 running 的孤儿 snapshot 直接删。失败 log 但不阻塞启动。 |
> | **新文件** | `test/unit/plan-executor.test.ts` (12 cases) | 线性 plan / 失败 step / stub / 暂停+恢复 / 取消 / 从 snapshot 恢复 / registry / 恢复扫描（real / orphan / stale 三类）/ `pilot_command` 真 spawn 集成。 |
>
> 故意**不**做：pi_session / pack_install 真执行、condition / wait / manual 真分支、parallel / adaptive、retry/skip endpoint、WebSocket 实时推送、FeedbackEngine、多 plan 并发。详见 [`docs/v0.6.0-plan-executor-mvp.md`](./v0.6.0-plan-executor-mvp.md)。
>
> 测试：core 534/534（+12）、web 171/171、format 双清、lint clean、`npm run build` 成功、tsc clean。
>
> **2026-07-11 校准 (16)**：**v0.6.0 已发**——PlanExecutor 完整版。v0.5.23 MVP 的 5 个 stub 砍到 1 个（`manual`）。
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **新文件** | `src/core/pi-session-runner.ts` | `class PiSessionRunner` —— single-shot pi subprocess 包装。直接 upstream `RpcClient`（不走 v0.5.14 的 WS bridge），spawn `pi --mode rpc`，`promptAndWait` 抓 last text + tokens。`signal` 绑 abort。 |
> | **真 dispatchers** | `src/core/plan-executor.ts` | `pi_session` / `pack_install` / `condition` / `wait` 4 个新默认 handler。`pi_session` 走 `PiSessionRunner`，`pack_install` 调 `service.installPack`，`condition` 跑 DSL（`true` / `false` / `step.<id>.success` / JS 表达式），`wait` `setTimeout` 立即 resolve。 |
> | **Service** | `src/core/service.ts` + `service-impl.ts` | 新接口 `retryTask(planId, taskId)` + `skipTask(planId, taskId)`。retry：reset task + steps、清 snapshot 的 step ids、plan 从 failed 拉回 running、re-start executor（必要时）。skip：task 标 skipped、发 `task_skipped` event。两者都拒绝 running task（409）。 |
> | **Server** | `src/server/server.ts` | `POST /plans/:id/tasks/:taskId/retry` + `/skip` 两条路由。 |
> | **Exposed API** | `PlanExecutor` 类 | `getDispatcher(type)` / `getRecordedStepSuccess(id)` / `getConditionContext()` —— 给 `condition` handler 用，同 executor dispatcher 跑 SubStep。 |
> | **STUBBED_ACTIONS 收敛** | `src/core/plan-executor.ts` | 从 5 个缩到 1 个（`manual`）。4 个现在有真实现。 |
> | **新测试** | `test/unit/plan-executor.test.ts` (+5) + `test/unit/service-plan-retry-skip.test.ts` (新, 7) | wait timeout / condition `true` / `false` / `step.<id>.success` / pack_install / STUBBED_ACTIONS 收敛；retry 成功 / 409 running / 409 completed / 404 未知；skip 成功 / 409 running / 409 completed。 |
>
> 故意**不**做：`manual` (waiting_human) 仍 stub、parallel / adaptive、WS 实时 push、FeedbackEngine、multi-plan concurrent。下一个 v0.6.x 走「condition DSL 完整化（jmespath）」+ 「WebSocket live push」+ 「FeedbackEngine」。
>
> 测试：core 546/546（+12）、web 171/171、format 双清、lint clean、`npm run build` 成功、tsc clean。
>
> **2026-07-11 校准 (17)**：**v0.6.1 已发** —— 紧接 v0.6.0 的 9 bug 修 + PlanEditor（visual plan builder）。
>
> | 编号 | 位置 | 修复 |
> |---|---|---|
> | **P0** | `core/plan-executor.ts:1105+1122` | `PlanExecutorRegistry.start` 调了两次 `exec.run()` —— 双 promise + 双 error handler。合并成一次。 |
> | **P1** | `core/plan-executor.ts:627-671` | `finalize()` 在 cancelled 时没清旧 `result`（之前 completed run 的 `result.success:true` 残留），可能 `status:cancelled` + `success:true` 矛盾。cancelled 显式 `result: undefined`。 |
> | **P1** | `core/plan-executor.ts:709-725` | `runWithTimeout` 中 `fn()` 在 race 结束后 reject 会触发 `unhandledRejection`。加独立 `fnPromise.catch(() => undefined)` 防泄漏。 |
> | **P1** | `core/plan-executor.ts:1036-1039` | `evaluateCondition` 用 `new Function("ctx", ...)` 跑任意表达式 —— 代码注入向量。换成手写递归下降 parser，支持 `true` / `false` / `step.<id>.success` / `step.<id>.output.<key>` / `and` / `or` / `not` / `eq` / `neq` / `contains` 闭合 DSL。语法外默认 `false`（typo 不会误跑 then-branch）。 |
> | **P1** | `core/pi-session-runner.ts:206-210` | `cleanup()` 没 remove signal 上的 abort listener，长 plan 累积闭包。显式 `removeEventListener` + 清空 ref。 |
> | **P1** | `core/plan-executor.ts:800` | `defaultPilotCommandHandler` 返回 `durationMs: 0`，调用方没填真值。改成 `Date.now() - start`。 |
> | **P2** | `core/plan-executor.ts:166-168` | `Object.entries(... as ...)` 拼写错误键名静默接收。改成对 `StepAction` union 显式校验 + warn。 |
> | **P2** | `core/pi-session-runner.ts:192` | `{ ...result, events: undefined }` 产生多余 `events: undefined` 字段。重建 data 对象只发有值的字段。 |
> | **P3** | `web/components/WelcomeBanner.tsx:101,118` | "Step N" + "Dismiss welcome banner" 仍硬编码英文。换 `t("home.welcome.stepN", {n})` + `t("home.welcome.dismiss")`。 |
>
> | 新功能 | 位置 | 内容 |
> |---|---|---|
> | **新文件** | `web/components/PlanEditor.tsx` | 可视化 plan 编辑器。goal / title / strategy 字段；任务列表（add / remove / 上移下移 / dependsOn chip 选择器）；每任务可加步骤，每步骤按 action 类型显不同字段（pilot_command 的 command + args、pi_session 的 prompt + cwd、profile_switch / policy_apply 用下拉菜单、condition 显示 DSL 语法提示、wait 显示 timeoutMs、manual 显示 prompt textarea）。Sticky submit bar。<br/>提交走 `createPlanWithTasksForm` server action → 一个 POST 创建完整 plan。 |
> | **Server route** | `core/server/server.ts:602-650` | `POST /plans` 现在接受 `tasks[]` + `strategy`（之前只接受 goal / title / context）。 |
> | **i18n** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` | 28 个新 `plans.editor.*` 键（goal / title / strategy / tasks / steps / dependsOn / move / remove / 提交 / 错误 / 字段标签）。 |
> | **新测试** | `web/tests/plan-editor.test.tsx` (9 cases) | 空态 / 初始 goal / 增删任务 / 排序 / action-type 字段切换 / 内联错误（无 fetch）/ 有效提交触发 fetch。 |
>
> 关键设计：`<form noValidate>` 关掉 HTML5 native validation（让自定义 inline 错误先跑），goal 改用 `aria-required` 而不是 `required`（屏幕阅读器友好，但 browser 不拦截）。
>
> 测试：core **553/553**（+7）、web **180/180**（+9）、format 双清、lint clean、`npm run build` 成功、tsc clean（root + web）。
>
> **2026-07-11 校准 (18)**：**v0.6.2 已发** —— `/compose` 页面体验全面修复（v0.4.4 引入后一直未动）。这一版是**纯体验修复**，不动 schema / URL / i18n key 前缀 / server API。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **新工具栏** | `web/app/compose/ComposeBoard.tsx` | 顶部 sticky toolbar：undo / redo（带 disabled 状态）、block count live region、modern ↔ cozy 切换、export / import / clear。从 inspector footer 提到顶部。 |
> | **Undo / Redo** | `web/app/compose/ComposeBoard.tsx` + `web/lib/compose-history.ts` (新) | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z。3 类 entry（add / remove / move），最多 50 步。drag 在 pointerup 时入栈一条（不是每帧入栈）。arrow-key 移动合并连续 entries。import JSON 清空 history。 |
> | **侧栏 affordance** | `web/app/compose/compose.module.css:174-260` | sidebar item 最小 44px 高（v0.5.11 是 30px，触控不达标）。加显式 `+` 按钮（点 = 加到中央）+ "拖动，或点 +" 一行提示。 |
> | **文字溢出** | `web/app/compose/compose.module.css:248-264, 364-378, 449-457` | `word-break: break-all`（拆字符：governance → gover nanc e）→ `text-overflow: ellipsis` + `white-space: nowrap`。block / sidebar / inspector 标题 / 字段全部统一。 |
> | **Block 视觉** | `web/app/compose/compose.module.css:339-411` | 块宽 180px → 220px，padding 8/10 → 10/12，label 字号 13 → 14。删除按钮 18×18 → 24×24，默认 opacity 0.5（之前 0 看不见）。 |
> | **Cozy mode 简化** | `web/app/compose/compose.module.css:474-516` | 4 层 box-shadow 堆叠（hover 6 个、dragging 6 个）→ 1 层。保留伪元素 :before/:after 立方体面。 |
> | **移动端 inspector** | `web/app/compose/compose.module.css:418-444, 480-485` | `<1024px` 时 inspector 变底部抽屉：`position: fixed; bottom: 0; transform: translateY(...)`，toolbar 多一个 "Open details" 触发按钮 + inspector header 多 "Close" 按钮。 |
> | **空状态** | `web/app/compose/ComposeBoard.tsx:776-800` | 从 "👆 Enter" 一行 → 标题 + 3 步编号引导 + 键盘提示。 |
> | **i18n** | `web/lib/i18n/{types,dict.en,dict.zh}.ts` | 22 个新 `compose.toolbar.*` / `compose.empty.*` / `compose.sidebar.*` / `compose.inspector.*` / `compose.announce.{undone,redone,historyEmpty}` 键。`compose.subtitle` 重写（之前"另存为配置、应用或运行"会误导——compose 不能 apply/run，是 sandbox）。 |
> | **新测试** | `web/tests/compose-history.test.ts` (新, 9 cases) | `applyEntry` / `invertEntry` 纯函数：add/remove/move 应用 + 反演 + undo/redo round-trip + 不变性。 |
>
> 关键设计：history helper 拆到 `web/lib/compose-history.ts` 单独文件，让测试可以在不渲染 React 树的情况下 import。`compose.*` 命名前缀 / URL `/compose` / API `/compose/catalog` / types `ComposeBlock` 全部不变（精准修改）。
>
> 测试：core **553/553**（没动）、web **189/189**（+9 history）、format 双清、lint clean、`npm run build` 成功、tsc clean（root + web）。
>
> **2026-07-11 校准 (19)**：**v0.6.3 hotfix 已发** —— v0.6.2 那个 UI 改动在用户环境**根本没渲染**。
>
> | 类别 | 位置 | 修复 |
> |---|---|---|
> | **Root cause** | `web/app/compose/compose.module.css` + `page.tsx` | 文件名 `compose.module.css` + `import "./compose.module.css"` —— Next.js 16 把 `*.module.css` 当 CSS Module 处理，所有 class 都被 hash 化。但 `ComposeBoard.tsx` 全文用的都是直接 className 字符串（`className="compose-page"` 等），没有 import 为 `styles` 对象 —— 所以**全部 CSS 一条都没生效**。整个 v0.6.2 的 grid / toolbar / sidebar / canvas / inspector / mobile drawer 都是 dead code，渲染出来就是把所有元素堆一列。 |
> | **Fix** | `web/app/compose/compose.css` (rename) + `page.tsx` (import path) | `compose.module.css` → `compose.css`（unscoped global CSS，跟 v0.4.4-v0.6.1 一致）。1 行 import 路径改完，零组件改动。 |
> | **验证** | Playwright 截图 before/after | before：单列堆叠，画板不存在，toolbar 移动端 "Open details" 按钮（`.compose-toolbar-inspector-trigger { display:none }` 也死了）也露出来。after：3 栏 grid (280/1fr/320)、sticky toolbar、移动端 bottom-sheet drawer 全部正确。 |
>
> 教训：v0.6.2 release 前我应该自起 dev server 截一张图验证，而不是只看 `tsc + build + test` 全过就发。**build OK ≠ 实际渲染 OK**。CSS 加载/解析/类名匹配是 build pipeline 之外的事。
>
> 测试：core **553/553**、web **189/189**（没变）、format 双清、lint clean、tsc clean、build OK、**Playwright 视觉验证**。
>
> **2026-07-11 校准 (20)**：**v0.6.4 已发** —— `/compose` 操作可见性。继续深化 v0.6.2/v0.6.3 的体验，user 直接 critical "完全无从下手"的痛点还没完全消化完。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **Toolbar undo/redo 计数** | `web/app/compose/ComposeBoard.tsx:730-749` | `canUndo`/`canRedo` 为真时按钮文字带 stack count（`↶ Undo · 3` / `↷ Redo · 1`）；空 stack 时用原 label。2 个新 i18n key `compose.toolbar.{undoWithCount,redoWithCount}`。 |
> | **Inspector 4 个新 action** | `web/app/compose/ComposeBoard.tsx:497-580` + `1216-1262` | 每个 block 加 Duplicate (⎘) / Top (⤒) / Bottom (⤓) 按钮。Duplicate 创建 24px 偏移副本；Top / Bottom 重排 blocks 数组（z-order = render 顺序）。5 个新 i18n key。 |
> | **Drag/drop 视觉反馈** | `web/app/compose/compose.css:484-525` | sidebar item `data-dragging="true"` → 40% 透明 + dashed accent ring；canvas `data-pending="true"` → 慢速 pulse inset accent；新 block `data-just-added="true"` → 220ms fade+scale 动画。 |
> | **Strict-Mode bug fix** | `web/app/compose/ComposeBoard.tsx:556-588` | v0.6.2 `addBlockAtCenter` 在 `setState((s) => ...)` 内部用 `queueMicrotask(() => setHistory(...))`。React 18 Strict Mode dev 模式双调用 → 每次 +button click 推 2 个 history entry。修了：把 side effect 移出 updater。production 不受影响（Strict Mode 是 dev-only）。 |
>
> 关键设计：Strict-Mode bug 是 dev 模式独有但 user 在 `npm run dev` 下会看到 undo count 异常。production 跑是干净的。Playwright production 验证：3 次 +button → undo = 3，5 个 inspector action 全部就位。
>
> 测试：core **553/553**、web **189/189**、format 双清、lint clean、tsc clean、production build OK、Playwright DOM-level verify 全过。
>
> **故意没做**（v0.6.5+ 留）：block-to-block 连线 / 多 board / 快捷键 modal / block hover tooltip。
>
> **2026-07-11 校准 (21)**：**v0.6.5 已发** —— `/compose` inspector 真正显示 entity 字段。user "无从下手"的最后一块拼图：选中一个 block 之前只能看到 id/kind/refId/position 这 5 个 metadata，现在能看到 session 的 cwd/size/entries，profile 的 model/packages，policy 的 6 类 rule 列表等。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **新 server 端点** | `src/server/server.ts:553-578` | `GET /compose/catalog/:kind/:id` 返回 discriminated-union `ComposeEntityDetail`。404 not found / 400 unknown kind。 |
> | **新 helper** | `src/core/compose-listing.ts:111-294` | `getComposeEntityDetail(source, kind, id)` 复用现有 `ComposeDataSource` interface；`ComposeEntityDetail` union type 5 kind × 不同 field set。 |
> | **Service wire** | `src/core/service.ts:325-330` + `src/core/service-impl.ts:201-202, 526-548` | `PilotService.getComposeEntityDetail(kind, id)` 通过 `getComposeEntityDetailFromService(home, ...)` 调 helper。 |
> | **新 browserApi 方法** | `web/lib/pilot-browser.ts:296-310` | `composeEntityDetail(kind, id)` 走 `/api/pilot/*` proxy，404 → null（不 throw）。 |
> | **Inspector fetch + render** | `web/app/compose/ComposeBoard.tsx:1268-1310` | `useEffect` 在 `block.kind`/`block.refId` 变时 fetch detail。`hydrated` guard 防止 `formatRelative` (Date.now()) 触发 React #418 hydration mismatch。 |
> | **kind-specific 渲染** | `web/app/compose/ComposeBoard.tsx:1394-1548` | `InspectorDetailFields` switch on `detail.kind`：session → cwd/model/entries/size/firstUsed/lastUsed/preview；pack → source/packKind/enabled；profile → model/provider/thinking/team/desc/packages；policy → desc + 6 类 rule list (with count)；capability → title/type/desc/sources/conflicts/requires。 |
> | **`pilot<T>()` overload** | `web/lib/pilot.ts:54-103` | 加 `nullableStatuses` 选项：404 → `T \| null` 而非 throw。现有 server-side callers 保持 `T` 返回类型不变。 |
>
> 关键 bug fix：**client-bundle `node:fs/promises` 错误**。v0.6.4 build work 是因为 `ComposeBoard` 导入 `pilot.ts` 但**没在 client 调用** - Turbopack tree-shake 把 `node:fs/promises` dead-code 掉了。v0.6.5 真正 client 调用 `api.composeEntityDetail(...)` 后整个 `pilot.ts` 被拉进 client bundle，Turbopack 拒绝（"chunking context does not support external modules"）。修法：`ComposeBoard` 改 import `pilot-browser.ts`（v0.4.7 已经为这个原因 split 出过），走 `/api/pilot/*` proxy，token 永远不离开 server。
>
> 测试：core **559/559**（+6 detail）、web **189/189**、format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **故意没做**（v0.6.6+ 留）：block-to-block 连线 / 多 board / 快捷键 modal / block hover tooltip。
>
> **2026-07-11 校准 (22)**：**v0.6.6 hotfix 已发** —— ComposeBoard hydration mismatch 修了。这个 bug 静默存在跨 4 个 minor 版本（v0.4.4 起就有，到 v0.6.5 都还在）。
>
> | 类别 | 位置 | 修复 |
> |---|---|---|
> | **Root cause** | `web/app/compose/ComposeBoard.tsx:197-198` (v0.4.4 起) | `useState(() => loadState())` 和 `useState(() => loadViewMode())` 在 SSR 时 `loadState()` 走 `typeof window === "undefined"` 分支返回 `emptyState()`（"0 个块"、"Modern"），client hydration 时同一函数走 `localStorage` 分支返回持久化 state（"2 个块"、"Cozy"）。React 18 dev 模式控制台报 hydration warning，3 个版本没人发现。 |
> | **Fix** | `web/app/compose/ComposeBoard.tsx:197-211` (v0.6.6) | 不再 lazy-init。`useState(emptyState)` + `useState("modern")` 给 SSR 和 client first render 一致 default。`useEffect(() => { setState(loadState()); setViewMode(loadViewMode()); }, [])` 在 mount 后读 localStorage 触发 re-render（post-hydration 正常 update，不算 hydration mismatch）。 |
> | **验证** | Playwright console log | before fix：dev console 报 "Hydration failed because the server rendered text didn't match the client"。after fix：console 干净（只有 favicon 404 与本修复无关）。block count "2 个块" + 2 block DOM elements 正常 render。 |
>
> 教训：`useState(() => readLocalStorage())` 模式看起来 lazy / clean，但破坏 SSR 假设（"useState init must produce identical value on SSR + client first render"）。任何"从客户端持久化读"的 state 都应该在 `useEffect` 里 load，init 用 server-safe default。
>
> 测试：core **559/559**、web **189/189**、format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **2026-07-11 校准 (23)**：**v0.6.7 已发** —— `/compose` block-to-block 连接。compose 是 sandbox，"可视化组合" 的核心是让 block 之间能连线。v0.6.5 + v0.6.6 把 inspector 真正信息化了，v0.6.7 把"组合"这一步补上。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **新 schema** | `web/lib/types.ts:525-562` | `ComposeConnection = {id, from, to}` + `ComposeState.connections?: Connection[]` + version 1 → 2。`loadState` 接受 v1 + v2（v1 无 `connections` 字段 = `[]`）。 |
> | **新 history entries** | `web/lib/compose-history.ts:24-36, 78-99, 119-126` | `addConnection` / `removeConnection` 走 `applyEntry` / `invertEntry`。5 个新 unit test 覆盖 apply/invert/round-trip/preservation。 |
> | **SVG overlay** | `web/app/compose/ComposeBoard.tsx:1177-1202` | canvas 内 SVG z-index 0，每个 connection 一个 `<g>` + bezier path。点 line → setSelectedConnectionId 高亮。 |
> | **inspector connections** | `web/app/compose/ComposeBoard.tsx:1540-1570` | "Connections" section 列出此 block 的 incoming + outgoing 边，每条带 × disconnect 按钮。 |
> | **Connect to… picker** | `web/app/compose/ComposeBoard.tsx:1603-1665` | 选中 block 点 "+ Connect to…" 按钮 → 弹出 picker 列出所有 other blocks（已连的标 ✓）。点候选 → create connection → 自动关 picker。 |
> | **i18n** | 9 新 key (en + zh)：`connections` / `connect` / `connectTo` / `cancelConnect` / `disconnect` / `noConnections` / `connectionsFrom` / `connectionsTo` / `announce.{connectionAdded,connectionRemoved}` |
> | **CSS** | `web/app/compose/compose.css:519-624` | `.compose-connections` overlay + `.compose-inspector-connections` section + picker + per-edge disconnect 按钮 |
>
> 关键设计：`BLOCK_W = 220, BLOCK_H = 80` 常量在 `ConnectionPath` 内固定，确保 SVG bezier 端点跟 `ComposeBlockView` 样式同步。Connection state 完全 undoable（走 history stack）。`loadState` 接受 v1 + v2 双版本（v1 save 没 `connections` 字段 = `[]`）。
>
> 验证限制：sandbox 没起 pilot server，page 走 error 分支不挂 ComposeBoard。本机 `pilot start` 后能正常 work。tsc + build + 14 history tests + 19 state tests 全过。
>
> **2026-07-11 校准 (24)**：**v0.6.8 已发** —— drag-to-create connection。v0.6.7 picker 是 2-click（block → "+ Connect to…" → pick from list），drag-to-create 是一次 gesture（block 边缘 handle → 拖到 target）。前者的"探索者"体验完整，后者的"已知道 A→B"体验是 1 步。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **新 state** | `web/app/compose/ComposeBoard.tsx:189-198` | `pendingConnection: { fromId, pointerX, pointerY } \| null` canvas-相对坐标，pointerup 后清掉 |
> | **新 callback** | `web/app/compose/ComposeBoard.tsx:548-585` | `startConnectionDrag(block, e)`：handle pointerdown 时 `e.stopPropagation()` 阻止 block move drag 触发，调 `setPointerCapture` 让 handle 跟 cursor 出 block 边界也不丢 |
> | **扩展 onCanvasPointerMove** | `web/app/compose/ComposeBoard.tsx:498-512` | 优先处理 connection drag（更新 pointer 位置）→ 然后才是 block drag。互斥：handle pointerdown 已 stopPropagation，block drag 不会同时跑 |
> | **扩展 onCanvasPointerUp** | `web/app/compose/ComposeBoard.tsx:388-444` | connection drag 优先 resolve：`document.elementsFromPoint(e.clientX, e.clientY)` 找顶层 `.compose-block` → 读 `data-block-id` 拿 target → self-loop / missing / duplicate 拒绝 → 调 `addConnection` history entry → `setSelectedId(targetId)` flip inspector |
> | **handle 渲染** | `web/app/compose/ComposeBoard.tsx:1540-1556` | `ComposeBlockView` 加 `onHandlePointerDown` prop。`{selected ? <button data-conn-handle className="compose-block-handle" /> : null}` |
> | **ghost line** | `web/app/compose/ComposeBoard.tsx:1309-1336` | SVG overlay 末尾条件渲染 `path.compose-connection-ghost`：source 块右边缘 → cursor 位置，cubic bezier 同 `ConnectionPath`（`dx = max(\|x2-x1\|/2, 60)`） |
> | **CSS** | `web/app/compose/compose.css:501-555` | `.compose-block-handle` 14px accent dot 居中右边缘 + `box-shadow` 0→6px 脉冲（1.8s loop）。hover/focus 1.15× scale。`.compose-connection-ghost` dashed accent stroke @ 0.7 opacity + `pointer-events: none` |
> | **i18n** | 2 新 key (en + zh): `compose.handle.aria` / `compose.handle.title` |
>
> 关键设计：handle pointerdown 调 `setPointerCapture`（handle 上）+ `e.stopPropagation()`，让 handle 即使 cursor 跑出 block 边界也能继续收 pointermove（直到 release）。`elementsFromPoint` 走 `data-block-id` 拿 target ID，零状态依赖（不靠 React state 推算）。所有拒绝路径（self-loop / missing / duplicate）和 v0.6.7 picker 完全一致 — 不引入新策略。Ghost line 和正式 connection 用同一套 bezier 公式（`ConnectionPath` 内 `BLOCK_W / BLOCK_H`），保证 release 那一刻 ghost → 正式线没有视觉跳跃。
>
> 验证限制：sandbox 没起 pilot server，drag gesture 不能 Playwright 测。tsc + production build + 194/194 web tests + 559/559 core tests + format + lint 全过。本机 `pilot start` 后能体验。
>
> 测试：core **559/559**、web **194/194**（+5 detail）、format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **故意没做**（v0.6.8+ 留）：block 边缘 drag-to-create connection / connection label 类型 / arrow head / server-side board persistence。
>
> **2026-07-12 校准 (25)**：**v0.6.9 已发** —— connection arrow head + free-text label。v0.6.7 / v0.6.8 的 connection 只是纯箭头，"A → B" 没说为什么；v0.6.9 让 edge 真正有名字。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **Schema v3** | `web/src/lib/types.ts:411-447` | `ComposeConnection` 加 `label?: string` + `kind?: ConnectionLabelKind`；`ComposeState.version: 2 → 3` |
> | **新 type union** | `web/src/lib/types.ts:402-409` | `ConnectionLabelKind = flows \| uses \| feeds \| depends \| produces \| manual` — 语义不是视觉，默认 `flows`（线本身仍 accent 色） |
> | **新 history entry** | `web/src/lib/compose-history.ts:40-58` | `updateConnectionLabel` kind：存 `fromLabel/toLabel/fromKind/toKind`（`""` = clear，区别于 `undefined` = "no change"） |
> | **applyEntry / invertEntry** | `web/src/lib/compose-history.ts:128-160, 188-197` | `applyEntry` 用 `delete`（不是 `=undefined`），确保 JSON round-trip 没多余 `label: undefined`；`invertEntry` swap before/after |
> | **SVG marker** | `web/src/app/compose/ComposeBoard.tsx:1310-1329` | `<defs>` 里两个 `<marker>`：`compose-arrow-default` / `compose-arrow-selected`（后者 markerWidth/Height 8 vs 7 + selected 时切 url）。`fill="currentColor"` 让 head 跟 line 同色 |
> | **ConnectionPath** | `web/src/app/compose/ComposeBoard.tsx:2230-2283` | 加 `markerEnd={...}` 指向对应 marker；新增 `data-kind={...}` 让 CSS 走 kind 着色；`midX = (x1+x2)/2, midY = (y1+y2)/2 - 6`（cubic bezier 中点公式可化简）渲染 `<text>` label |
> | **ConnectionList 编辑器** | `web/src/app/compose/ComposeBoard.tsx:1921-2005` | 每个 connection 从 row 改成 column：header（方向 + peer 名 + disconnect）+ editor（text input + kind `<select>`），input 清空 → `""` → 清除 |
> | **Inspector wiring** | `web/src/app/compose/ComposeBoard.tsx:1641-1654, 1743-1752` | BlockInspector 加 `onUpdateLabel` prop；`ConnectionList` 同样接 |
> | **顶层 updateConnectionLabel** | `web/src/app/compose/ComposeBoard.tsx:805-867` | normalize：textbox 空 → `undefined`；history entry 用 `""` 表达 clear（避免 `exactOptionalPropertyTypes: true` 报 `label: undefined` 不合法） |
> | **CSS** | `web/src/app/compose/compose.css:678-820` | `.compose-connection-item` 改 column；新增 `.compose-connection-item-header` / `.compose-connection-item-editor` / `.compose-connection-label-input` / `.compose-connection-kind-select`；`.compose-connection-label` SVG text：`paint-order: stroke; stroke: var(--bg); stroke-width: 4px` 出 pill 效果；cozy 模式 halo 用 `#f5ecd9`；6 个 `data-kind` 着色（accent / cozy-accent-2 / cozy-accent / hitl / cozy-profile / text-muted） |
> | **i18n** | 13 新 key (en + zh)：`compose.inspector.connectionLabel{,placeholder,none}` + 6 个 `compose.connectionLabel.kind.{flows,uses,feeds,depends,produces,manual}` + `compose.connectionLabel.tooltip` + `compose.announce.connectionLabelUpdated` |
> | **Tests** | `web/tests/compose-history.test.ts:200-366` | +9 case：set / preserve other edges / clear via `""` / invertEntry swap / round-trip undo/redo / preserves blocks / preserves from/to + `web/tests/compose-state.test.ts` 升 `version: 2 → 3` |
>
> 关键设计：
>
> - **"clear" 用 `""` 而不是 `undefined`**：`exactOptionalPropertyTypes: true` 不让 `label: undefined` 字面量存在。History entry 用 `string` (label) / `ConnectionLabelKind \| ""` (kind) — 既是 type-safe，也保证 JSON round-trip 不会带 `label: undefined` 字段。React 层负责 normalize（`textbox 空 → undefined` → `entry 里用 ""`）。
> - **SVG marker color = `currentColor`**：让 head 跟 line 同色，省去颜色同步逻辑。Selected 时换 marker url（默认 7x7，selected 8x8 + drop-shadow filter）。
> - **Label pill 靠 `paint-order: stroke`**：不用 `<rect>` 背景，stroke 用 `var(--bg)` 出"光晕"，文字保持 currentColor，可读性 OK。cozy 模式 halo 切到 `#f5ecd9`。
> - **Bezier 中点可化简**：`x1 + dx` / `x2 - dx` 这两个 control point 的 Y 跟端点 Y 一样，所以 `B(0.5)` = `(x1+x2)/2, (y1+y2)/2`。减 6px 是因为文字居中时实际视觉中心偏下，要往线上面挪一点。
> - **每改一次 label = 1 history entry**：跟 drag-to-move 一样"commit on change end"模式，不是 per-keystroke。`useCallback` 闭包能拿到最新 state，no-op short-circuit（`fromLabel === toLabel && fromKind === toKind`）避免空格 toggle 产生空 entry。
> - **Schema v3 兼容 v1/v2**：loader 已 accept v1/v2/v3；新字段 optional，老存档打开正常。
>
> 验证限制：sandbox 没起 pilot server，arrow head + label 不能 Playwright 测。tsc + production build + 201/201 web tests（+7 这次）+ 559/559 core tests + format 双清 + lint clean 全过。本机 `pilot start` 后能看到。
>
> 测试：core **559/559**、web **201/201**（+7 label + 1 升 version），format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **故意没做**（v0.6.10+ 留）：server-side board persistence（让 /compose layout 跨设备同步）、multiple connections (A↔B 双向)、connection color 自定义、auto-route 避开 block 中心。
>
> **2026-07-12 校准 (26)**：**v0.6.10 已发** —— server-side board persistence。/compose 6 个版本（v0.4.4 → v0.6.9）后，layout 还在 localStorage，跨设备看不到。v0.6.10 把 /compose 完成"工具化"最后一公里：每块 layout 可以 save 到 server，从另一台 machine load 回来。
>
> | 类别 | 位置 | 改动 |
> |---|---|---|
> | **新 module** | `src/core/compose-boards.ts` | `listBoards` / `loadBoard` / `saveBoard` / `deleteBoard` + Zod schemas；`isValidBoardId` 防 path traversal；`generateBoardId` = `board-<ts36>-<rand6>`；原子 save (`.tmp-<pid>-<ts>` + rename) |
> | **新 routes** | `src/server/server.ts:582-630` | `GET/POST/PUT/DELETE /api/compose/boards[/:id]` — 404/201/204 状态码语义对齐 REST；path id 永远 wins over body id |
> | **Service 接口** | `src/core/service.ts:336-373` | `PilotService` 加 4 个方法；保持 lazy-import 模式（避免 fs/zod 污染非持久化 caller） |
> | **Service impl** | `src/core/service-impl.ts:559-590` | 4 个 `*FromService` 内部函数转 `await import("./compose-boards.js")` — 跟其他 compose*FromService 模式一致 |
> | **Web types** | `web/src/lib/types.ts:585-595` | `BoardSummary` interface (id, name, updatedAt, createdAt, blockCount, connectionCount) — 镜像 core 的同名 type |
> | **Web API client** | `web/src/lib/pilot-browser.ts:300-340` | `api.composeBoards()` / `composeBoard(id)` / `saveComposeBoard(id, state)` / `deleteComposeBoard(id)`；404 → `null` / `false` (UI 不用 try/catch) |
> | **Web UI** | `web/src/app/compose/ComposeBoard.tsx:312-329, 889-1014, 1287-1412, 1414-1530` | 新 state (`serverPanel` / `boardNameInput` / `boardList` / `boardStatus` / `lastSavedId`) + 5 个 callback (`openSavePanel` / `openLoadPanel` / `closeServerPanel` / `saveBoardToServer` / `loadBoardFromServer` / `deleteServerBoard`) + toolbar Save/Load buttons + absolute-positioned panel 渲染（Save / Load 两种 body 模式） |
> | **CSS** | `web/src/app/compose/compose.css:36-41, 123-209` | `.compose-page { position: relative }` 让 absolute panel 锚定；`.compose-server-panel` 320px wide + shadow + `top: 64px`（toolbar 52px + 12px gap）；`.compose-board-list-item-load` 整行可点 + name + meta 副行；`.compose-toolbar button[data-active="true"]` 强调 active 按钮 |
> | **i18n** | 16 新 key (en + zh)：`compose.toolbar.{saveTitle,loadTitle,boardsTitle}` + 13 `compose.board.*` (状态、错误、placeholder、确认) |
> | **Tests** | `test/unit/compose-boards.test.ts` (25 cases) | list empty / list sort / save round-trip / load 404-corrupt-wrong-version / delete hit-miss / ID safety (`../`, `a*65`, empty) / atomic write 不留 `.tmp` / 不可改 connection kind |
>
> 关键设计：
>
> - **storage 用 JSON 不用 TOML**：与 web localStorage byte-level 一致，save/load 零 schema round-trip。`kind` / `label` 字段是 free-form user text，TOML escaping 没必要。v0.4.4 已 export/import JSON，路径最一致。
> - **service lazy-import**：和现有 `*FromService` 模式一致。`service-impl.ts` 不直接 import `compose-boards.ts`，而是运行时 dynamic import，避免 fs/zod 拉进只读 compose listing 的 caller。
> - **Zod 校验 on read AND on write**：list 跳过 corrupt 文件（不 throw），单条 load 失败返 `null`，save 时用 schema 验证 blocks / connections / version 全部合规 — 多层防御，坏数据不会爬到内存里。
> - **PUT/POST 双路由**：PUT 用 path id（"save this id, replace if exists"），POST 不带 id 让 server 分配（"create new"）。HTTP 语义清晰。
> - **`lastSavedId` 跟踪**：web 端记住上次 save 的 id，name 没变就 reuse（同 board 覆盖），name 变了就生成新 id（不同 board 不覆盖）。避免 name typo 产生一堆重复文件。
> - **panel 用 absolute 不用 modal**：toolbar 已经在文档顶部，panel 落在 toolbar 下方右侧 64px，shadow + z-index: 50 让它浮在 canvas 上。比 modal 轻（无 portal、无 backdrop），state 也好管。
> - **`name: undefined` 处理**：`exactOptionalPropertyTypes: true` 下，`{name: undefined}` spread 不合法。用 `delete next.name` 而不是 `next.name = undefined`，JSON 序列化也干净。
> - **25 个 core test 不写 web test**：web 端 save/load 是 thin wrapper，TypeScript type 已经检查 API 契约；UI 测试需要在 sandbox 起 pilot server（blocked by `pilot start` not running），v0.6.11 列表页 + Playwright 一起补。
>
> 验证限制：sandbox 没起 pilot server，toolbar Save/Load 不能 Playwright 测（user 本机 `pilot start` 后能看到 panel）。但 server-side `core/compose-boards.ts` 完全覆盖（25 cases：list/save/load/delete round-trip + schema 验证 + ID safety + 坏文件 recovery）。tsc + production build + 201/201 web tests（无变化）+ 584/584 core tests（+25 这次）+ format 双清 + lint clean 全过。
>
> 测试：core **584/584**、web **201/201**，format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **故意没做**（v0.6.16+ 留）：multiple connections (A↔B 双向)；connection color 自定义；auto-route 避开 block 中心；ComposeBoard.tsx hooks/state 抽离；**placeholder parameter audit**（zh/en 15 处 placeholder 不一致，**不影响渲染**，v0.6.17+ 视新 locale 加入时机处理）。
>
> **2026-07-16 校准 (32)**：**v0.6.16 已发** —— user-reported cleanup batch: 6 个 i18n fix + 1 个 UX polish (/usage 4 按钮 range picker)。第 7 个 bug（dict.zh.ts 15 处 placeholder drift）user 标 P3 = "不影响功能"，punt 到 v0.6.17+。**4 个按钮 UX fix 是 user 截图报的**：active 按钮因内容自适应宽度比 sibling 窄；active 状态用 font-semibold 增强 + aria-current="page" 标记；非 active 加 hover 颜色+bg。
>
> | 级别 | 文件 | 修复 |
> |---|---|---|
> | **P1.1** | `web/src/app/profiles/[name]/page.tsx:61` | `✓ Created <code>{name}</code>.` → `RichT k="profiles.createdBanner"`。新 key `profiles.createdBanner` = "✓ Created {name}." / "✓ 已创建 {name}。"。`values` prop 传 `<code>` 保持样式。 |
> | **P1.2** | `web/src/app/profiles/[name]/page.tsx:83` | `Profile <code>{name}</code> not found.` → `RichT k="profiles.notFound"`。新 key `profiles.notFound` = "Profile {name} not found." / "未找到 Profile {name}。"。 |
> | **P1.3** | `web/src/app/profiles/[name]/page.tsx:195` | `env (read-only — edit TOML directly)` 硬编码 → `<T k="profiles.envHeading" />`。新 key `profiles.envHeading` = "env (read-only — edit TOML directly)" / "env（只读 — 直接编辑 TOML）"。 |
> | **P1.4** | `web/src/app/policy/page.tsx:150` | `<T k="error.couldntLoad.title" />: policies` 中英混杂（`: policies` 是 raw English）→ 单 key `policy.loadErrorTitle` = "Couldn't load policies" / "加载策略失败"。把 noun 折进 i18n key。 |
> | **P2.1** | `web/src/app/compose/Inspector.tsx:726-737` | `formatRelative()` 硬编码 `${n}s ago` / `${n}m ago` / ... → 6 个 i18n key `compose.inspector.time.{second,minute,hour,day,month,year}`。en "5s ago" / "3m ago"；zh "5 秒前" / "3 分钟前"。helper module-level 不能 `useT()`，caller 传 `t` 进去：`formatRelative(iso, t)`。 |
> | **P3.1** | `web/src/lib/i18n/dict.zh.ts:1177` | `try.hint.forkFromHere` = "从这里分叉" → "从此处派生"（跟 `try.session.forkHere` 一致）。en 不变。 |
> | **UX** | `web/src/app/usage/page.tsx:80-104` | 4 个按钮 (Today / 7天 / 30天 / 全部) 加 `min-w-[5rem]` 统一宽度（active 不再因内容短而显得窄）；active 加 `font-semibold` + `aria-current="page"`；非 active 加 `hover:text-[var(--text)]` + `hover:bg-[var(--surface-2)]`。 |
> | **i18n** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` | 11 新 key：profiles.createdBanner + profiles.notFound + profiles.envHeading + policy.loadErrorTitle + compose.inspector.time.{second,minute,hour,day,month,year} (6)。en + zh 都加。 |
>
> 关键设计：
>
> - **P2.1 module-level helper 拿 t**：formatRelative 不能用 `useT()` hook（不在 component 内），改成 `formatRelative(iso, t)` 由 caller（`<Inspector>` 用 `const t = useT()`）传 t 进去。比把 helper 改 component 更轻（一个 prop 而不是一个 refactor）。
> - **P1.4 fold noun into i18n key**：`<T>...: policies</T>` 这种 "T 输出后半句 raw 字符串" 是经典 anti-pattern —— `<T>` 部分本地化但 raw 字符串不。**整句一个 key** 才能确保 locale 完整（"加载策略失败" vs "Couldn't load policies"）。user 看到"加载失败: policies" 是这个 bug 的症状。
> - **4 按钮 min-w-[5rem]**：是 floor 不是 ceiling。zh 最长 "近 30 天" (4 字) ≈ 4rem + padding ≈ 5rem；en 最长 "Last 30 days" (12 chars) 远超过 5rem 但 CSS 自适应。min-w 保证 4 按钮宽度一致，content 长时按钮 grow。active 不再"比 sibling 窄"是 user 截图看到的问题。
> - **P3 placeholder drift punt**：15 处 zh/en placeholder 不一致，但**渲染正常**（`renderT` 不替换缺失的 placeholder 就当字面量 `{name}` 留在 output —— 但实际调用方传了什么用什么，没传就不替换）。真出问题场景是**加新 locale**（fr/ru/ar）时翻译者会困惑"为什么 en 模板有 `{n}` zh 没有"。v0.6.17 触发时机 = 任何新 locale 加入。
>
> 验证：tsc + format + lint + 543/543 core + 214/214 web + production build OK。dict.zh.ts 1 个 key 翻译统一（fork），其他 10 个新 key 是直接加。**placeholder drift 没动 code**（P3 punt）。
>
> 测试：core **543/543**（无变化）、web **214/214**（无变化）、format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **2026-07-16 校准 (31)**：**v0.6.15 已发** —— user-reported hotfix: `pilot forge absorb` 在 macOS sandboxed shell（Cursor / VSCode devcontainer / sandboxed Terminal.app）上跑会 EPERM 拒 mkdir。根因：`~/.pilot/capabilities/` 目录**只有 `pilot init` 才创建**（init.ts:73-86 mkdir 4 个子目录：extensions/policy/profiles/capabilities），其他 command 都假设它已经存在。User 没跑过 init 直接 absorb → recursive mkdir 第一次就拒。
>
> | 级别 | 文件 | 修复 |
> |---|---|---|
> | **P0.1** | `src/core/types.ts:30-50` | 新增 `ensurePilotCapabilitiesDir(home)` helper —— `mkdir recursive: true` 幂等。`forgeAbsorb` 入口调它，不依赖 user 先跑 init。test override hook 走 `globalThis[Symbol.for(...)]`（不在 production 路径触发）。 |
> | **P0.2** | `src/core/forge.ts:124-148` | EPERM/EACCES 错误信息带 actionable hint：建议 `pilot init` 或检查 sandbox。generic IO 错误保留原 bare 信息。 |
> | **Tests** | `test/unit/forge.test.ts:195-230` | +2 regression test：(1) absorb 在 `~/.pilot/capabilities/` 不存在时仍能成功（lazy init happy path）；(2) EPERM 错误信息含 "pilot init" 提示。 |
>
> 关键设计：
>
> - **抽 helper 而非 inline mkdir**：core/forge.ts 调 `ensurePilotCapabilitiesDir(home)` 一行，比 inline `mkdir recursive` 干净。将来加 `.gitignore` / log breadcrumb / 别的子目录创建都集中改一个地方。
> - **test override 用 globalThis Symbol.for**：ESM module export 不可重定义（`vi.spyOn` 不灵），`node:fs/promises.mkdir` 也是 read-only。helper 内部查 `globalThis[Symbol.for("pilot.test.ensureCapabilities")]` —— test 注入 synthetic EPERM 时调，production 永远不设。比 `vi.mock` 改整个 module 轻量，scope 精准。
> - **operator note for reporter user**：macOS sandboxed Terminal.app / Cursor / VSCode devcontainer 这类 sandbox 阻断 mkdir。**immediate 绕路**：在非 sandboxed Terminal 跑 `pilot init` 一次创建目录。**permanent fix**：v0.6.15 之后任何路径都会 lazy init，不再需要 init。
>
> 验证：tsc + format + lint + 543/543 core + 214/214 web + production build OK。2 个新 test 覆盖 lazy init happy path + EPERM error message。
>
> 测试：core **543/543**（+2）、web **214/214**（无变化）、format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **2026-07-16 校准 (30)**：**v0.6.14 已发** —— site-wide i18n audit pass 完成。v0.6.13 flag 出的"全站 i18n audit"在这版做掉。实际 surface 比预期**小很多** —— 16 个 page 中 13 个已经 i18n'd，剩 3 个 page 4 处真硬编码：
>
> | 级别 | 文件 | 修复 |
> |---|---|---|
> | **P2.1** | `web/src/app/sessions/page.tsx:80` | `<th>ID</th>` → `<T k="sessions.col.id" />`。6 个 sibling column header 早 i18n'd，就 ID 漏。key 已存在（zh 也是 "ID"），修是为了 i18n 契约完整性。 |
> | **P2.2** | `web/src/app/policy/page.tsx:339-342` | 4 个 `<option value="bash">bash</option>` 等：value 保留 raw tool name（API 契约），visible label 包 `policy.tryRule.tool{Bash,Read,Edit,Write}`。en + zh 都显示 bash/read/edit/write（术语），但 key 备好等将来 fr/ru/ar 翻译。 |
> | **P2.3** | `web/src/app/policy/page.tsx:385` | `placeholder="safe-bash"` → `placeholder={renderT(locale, "policy.newCard.namePlaceholder")}`。key 已存在只是没用。 |
> | **P2.4** | `web/src/app/profiles/[name]/page.tsx:135-153` | 5 个 field placeholder + 1 个 label suffix "(comma-separated)" → 6 个新 `profiles.field.*` key（en: provider/model/thinking/packages 例子 + 标签后缀；zh: "例如：claude-opus-4.6" / "（逗号分隔）"）。 |
> | **Plumbing** | `web/src/app/policy/page.tsx:279, 293, 372` | `<DryRun>` / `<DryRunForm>` / `<NewPolicyCard>` 加 `locale: ReturnType<typeof negotiateLocale>` prop，跟 `<PolicyList>` 的 pattern 一致。`renderT` 在 child 组件里能拿同一 locale。 |
> | **i18n** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` | 9 新 key：`policy.tryRule.tool{Bash,Read,Edit,Write}` (4) + `profiles.field.{provider,model,thinking,packages}Placeholder` (4) + `profiles.field.packagesLabelSuffix` (1) |
>
> 关键观察：
>
> - **i18n audit 实际 surface 比预期小**：v0.6.13 我担心是 30-50 处，实际只 4 处真硬编码。原因是 pilot 从 v0.4.4 开始**每个新 feature PR 都同步 i18n**，14 个 minor version 积累下来 13/16 page 已经 i18n'd。v0.6.14 完成了 backlog 中"全站 i18n audit"项。
> - **tool name 是 technical term**：bash / read / edit / write 在 en + zh 都显示原文（zh 用户也习惯这些英文术语）。但 i18n key 包装仍然必要 —— 让将来加 fr/ru/ar 等语言的翻译者能把 "bash" 翻成 "Bash-Befehl" / "Lectura" 等。
> - **child component 拿 locale 的 pattern**：parent 调 `negotiateLocale` 一次，传 `locale: ReturnType<typeof negotiateLocale>` prop 给 child。比 child 各自 `await headers()` 重复 negotiate 干净（也避免 await 多次的 race condition）。`PolicyList` 早就在用这 pattern，`<DryRun>` / `<NewPolicyCard>` 跟上。
>
> 验证：tsc + format + lint + 541/541 core + 214/214 web + production build OK。i18n dict completeness test 自动覆盖新 9 key 存在性。
>
> **2026-07-15 校准 (29)**：**v0.6.13 已发** —— 8 i18n cleanup + 1 stale comment。hotfix to v0.6.12，纯 cleanup，无新 feature / 新 schema / 新 route。每项独立可测。`/compose/boards` 四个 v0.6.12 引入的英文硬编码全收掉（`<title>` / RenameDialog max-length error / BoardListView bulk partial-failure / 表头 select-all aria），加上 v0.6.11 之前就有的两处（Inspector `<dt>kind</dt>` + try page "Fork from here"）和两处 a11y polish（BoardRow checkbox aria-label 不再是 count 形状 / 表头 aria-label 走 i18n key）。外加 ComposeBoard.tsx 的 stale `handleCanvasX/Y` breadcrumb 清理（v0.6.11 P3.12 删了那个变量但 comment 漏改了）。
>
> | 级别 | 文件 | 修复 |
> |---|---|---|
> | **P2.1** | `web/src/app/compose/boards/page.tsx:19` | `metadata.title` 改 `generateMetadata` 接 `Accept-Language`：en "Boards — Pilot" / zh "画板 — Pilot"。其他页面（/、/compose、/sessions…）早就有这个 pattern，v0.6.12 漏了。`<h1>` body 一直走 `<T k="compose.boards.title" />` 是对的，只有 `<title>` tag 错。 |
> | **P2.2** | `web/src/app/compose/boards/RenameDialog.tsx:67` | `` `Max ${MAX_LENGTH} characters` `` → `t("compose.boards.renameDialog.maxLengthError", { n: MAX_LENGTH })`（en "Max {n} characters" / zh "最多 {n} 个字符"） |
> | **P2.3** | `web/src/app/compose/boards/BoardListView.tsx:163` | 末尾 `` ` (${failed} failed)` `` 拼到英文 message 后面 → 单 key `compose.boards.announce.bulkDeletedWithFailures` 带 `{n}` / `{m}` 两个占位（en "Deleted {n} board(s), {m} failed" / zh "已删除 {n} 个画板，{m} 个失败"）。一条 message 一个 template — "partial success" 是单一语义不该拆。 |
> | **P2.4** | `web/src/app/try/page.tsx:351` | `<strong>Fork from here</strong>` raw → `<strong>{t("try.hint.forkFromHere")}</strong>`。其他 `<strong>` run（Connect / rpc）早就 i18n'd，这个漏了。 |
> | **P3.5** | `web/src/app/compose/Inspector.tsx:566` | `<dt>kind</dt>` raw → `t("compose.inspector.field.kind")`。同文件第 177 行已经用这个 key，是 detail 块漏迁。 |
> | **P3.6** | `web/src/app/compose/boards/BoardRow.tsx:65` | checkbox `aria-label` 从 `t("compose.boards.bulk.selected", { n: checked ? 1 : 0 })` 改专用 key `compose.boards.row.select`（en "Select this board" / zh "选择此画板"）。n=0 时 "0 selected" 是 per-row toggle 语义（应该是 "未选"/"select"）不是 multi-select 状态。 |
> | **P3.7** | `web/src/app/compose/boards/BoardListView.tsx:312` | `<th aria-label="select">` raw → `aria-label={t("compose.boards.column.selectAria")}`（en "Select" / zh "选择"）。 |
> | **P3.8** | `web/src/app/compose/ComposeBoard.tsx:578` | stale `handleCanvasX/Y` breadcrumb 清理 — v0.6.11 P3.12 删了那个变量但 comment 漏改。改写为描述当前架构（anchor 是 `from.x` + `from.y` 的纯函数，不另起 ref）。 |
> | **i18n** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` | 5 新 key：`compose.boards.renameDialog.maxLengthError` / `compose.boards.announce.bulkDeletedWithFailures` / `compose.boards.row.select` / `compose.boards.column.selectAria` / `try.hint.forkFromHere` |
>
> 关键设计：
>
> - **P2.1 `<title>` 走 `generateMetadata` 而非 i18n key**：metadata 不是内容，加 i18n key 是 ceremony 无 payoff。`generateMetadata` 接 `Accept-Language` 是 next 14+ 标准 pattern（layout.tsx 早就在用），保持一致。
> - **P2.3 partial-failure 用单 key + 两个占位不是两个 key**："Deleted 3 boards, 2 failed" 是一个语义（partial success report），拆成 "Deleted {n} boards" + "{m} failed" 会让模板组合时丢失连接词（"and" / "，"），英文尤其糟。
> - **P3.6 per-row checkbox aria-label 不复用 bulk.selected**：bulk 状态是"我选了几个"，per-row 是"我要不要选这个 row"。两个语义不该共用 key，否则 n=0 时出现 "已选 0 项"（"已选"暗示状态而不是 toggle 意图）。
> - **P3.8 删 stale comment 时改写描述而非简单删除**：comment 解释 "为什么 ghost line 用 from.x + BLOCK_W 而不另起 ref" 是 architectural decision 文档；删了 variable name 但保留了"anchor 是 pure function of grid position"这一信息。代码 review 时这条信息还有用。
>
> 验证：现有 web 214/214 test 全过（i18n dict completeness 测自动覆盖新 5 key 存在性）。tsc + format + production build 全过。`boards.test.tsx` 没新增 test — 修的都是 i18n 字符串，i18n provider wrap 已经覆盖 en locale 路径，zh 等价路径靠 i18n.test.ts 的 dict completeness 兜底。
>
> 测试：core **541/541**（无变化）、web **214/214**（无变化）、format 双清、tsc clean（root + web）、production build OK。
>
> **2026-07-15 校准 (28)**：**v0.6.12 已发** —— `/compose/boards` 列表页（multi-board picker + rename + bulk delete + copy-as-JSON share）。`/compose` v0.6.10 引入 server persistence 后只暴露了 toolbar Save/Load dropdown（单板快速存读），没有"管理多个板"的入口。v0.6.12 把这个表面补上：4-state 列表（loading / ok-empty / ok-with-rows / error）、per-row 4 actions（Open / Rename / Copy as JSON / Delete）、bulk select + sticky bottom bar、live-region a11y announcements、4 个新文件（`page.tsx` + `BoardListView` + `BoardRow` + `RenameDialog`）+ 1 个新 page route (`/compose/boards`) + 1 个新 PATCH endpoint (`/api/compose/boards/:id`)。
>
> | 类别 | 文件 | 内容 |
> |---|---|---|
> | **New page** | `web/src/app/compose/boards/page.tsx` | server component shell (title + subtitle)，`metadata` = `Boards — Pilot` |
> | **New client** | `web/src/app/compose/boards/BoardListView.tsx` | 4-state machine (loading/ok-empty/ok-with-rows/error) + bulk select + bulk actions + live-region announce + RenameDialog mount |
> | **New client** | `web/src/app/compose/boards/BoardRow.tsx` | 单行：checkbox + name (mono id) + blocks count (pluralised) + connections count (pluralised) + updatedAt (YYYY-MM-DD HH:MM local TZ) + 4 action buttons (Open / Rename / Copy as JSON / Delete) |
> | **New client** | `web/src/app/compose/boards/RenameDialog.tsx` | local modal：focus input + select-all on mount + Esc cancel + Enter submit + 200 char 计数 + 边界验证 mirror server (string / non-empty / ≤200) |
> | **New endpoint** | `src/server/server.ts:660-693` | `PATCH /compose/boards/:id` 路由 + 三态 error mapping (400 边界校验 / 400 unsafe id / 404 missing board / 200 success) |
> | **New service** | `core/service-impl.ts:601-609` + `core/service.ts:368-382` | `renameComposeBoard(id, name)` —— `loadBoard` → 改 name → `saveBoard` (atomic write path 复用 §9.5) |
> | **New core** | `core/compose-boards.ts:330-352` | `renameBoard(id, name, home?)` helper + 8 unit tests (preserves blocks/connections/createdAt / trims / empty / oversize / missing / unsafe id / reflected in listBoards) |
> | **New client** | `web/src/lib/pilot-browser.ts:355-362` | `api.renameComposeBoard(id, name)` — POSTs `{ name }` to PATCH, returns updated `BoardSummary` |
> | **New toolbar entry** | `web/src/app/compose/ComposeBoard.tsx:1367-1376` | `≡ Boards` Link next to existing Save/Load dropdowns in server-persistence group |
> | **New search-param** | `web/src/app/compose/ComposeBoard.tsx:1006-1024` | `?board=<id>` auto-load on mount via `useSearchParams` → `loadBoardFromServer(id)` → `history.replaceState` to strip the param |
> | **i18n** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` | 40 new keys under `compose.boards.*` (page + 4 actions + 5 column headers + pluralised units + 4 states + rename dialog + bulk bar + announce) |
> | **Tests** | `test/unit/compose-boards.test.ts:453-562` | +8 renameBoard core tests (preserves blocks/connections/createdAt, trims, empty/whitespace, oversize, missing board, unsafe id, listBoards reflects rename) |
> | **Tests** | `test/unit/server.test.ts:907-1044` | +9 PATCH route tests (200 success / trim / preserves blocks / 400 empty / 400 oversize / 400 non-string / 400 unsafe id / 404 missing / 401 unauth) |
> | **Tests** | `web/tests/boards.test.tsx` (new) | +13 client tests (4 states / 5 row actions / 3 bulk actions / 1 date format) |
>
> 关键设计：
>
> - **`renameBoard` 复用 `saveBoard` 不另起 atomic write**：`saveBoard` 已经是 `writeFile(tmp) → rename(tmp, file)`（§9.5），且能 preserve `createdAt` + bump `updatedAt` + 跑 Zod schema 校验。`renameBoard` 是 thin wrapper (`loadBoard` → 改 name → `saveBoard`)。零新代码路径，0 个新 race condition。
> - **PATCH 端点边界校验 mirror `BoardInput` 语义**：string / non-empty after trim / ≤200 chars。`assertBoardId` 复用 v0.6.11 的 helper（regex `/^[a-zA-Z0-9_-]{1,64}$/`）。400 / 404 错误文案明确（"name must be a string" / "name must not be empty" / "name must be at most 200 characters"），让 client 错误提示有具体原因。
> - **share-link 不做 server-side 暂存 URL**：考虑过 upload JSON → server 返 URL → 用户分享，但 round-trip 太重（需要 GC + auth + 短链映射）。改用 `navigator.clipboard.writeText` 把 board JSON 复制到剪贴板，导入走现有 toolbar Import。bulk copy 收一个 array（receiver 单 board 逐个 Import — copy plural / import singular，不对称是有意的简化）。
> - **Open button 用 `useSearchParams` + `history.replaceState`**：用户点 Boards list 的 Open → `/compose?board=<id>` → ComposeBoard 顶部 useEffect 读 searchParams → 调 `loadBoardFromServer(id)` → `history.replaceState` 去掉 `?board=`。`replaceState`（不是 `push`）避免 back stack 残留临时 URL。`lastAutoLoadRef` 防止 React Strict Mode 双调用导致的重复 load。
> - **`compose.boards.column.{blocks,connections}.{one,other}` 用真 plural 不用 `.replace("1 ", "")` hack**：v0.6.11 把 hack 砍掉后这种 i18n 一律走 unit key。中文 "1 块" / "0 块" 一样自然；以后加俄语/阿拉伯语也有 place。
> - **bulk bar 用 sticky fixed 而非 inline 在表下**：rows 多时 (100+ boards) inline bar 要滚到底才能看到操作。fixed bottom + left-1/2 + max-w 居中更稳，鼠标一动就到。
> - **a11y live region `aria-live="polite"`**：每条成功 action 推到 `role="status"` 元素。screen reader 不打断用户当前 narration，只在 idle 时补报"已重命名为 X" / "已删除 Y" / "已复制 Z 为 JSON"。失败用 `window.alert` 阻塞提示（vs live region — 失败需要用户主动确认）。
> - **`sr-only` 类的 live region 永远 mounted**：用 `role="status"` 而非 `aria-live` 单独 element，避免 re-mount 引起 SR 重新 announce。React 状态变 announcement → DOM text 变 → SR 感知。
>
> 验证：sandbox 没起 pilot server，UI 流程（点 Rename → 改 → Save / 选 2 个 → 删 / Open URL 自动加载）不能 Playwright 测，但 16 个 core + 9 个 server + 13 个 client test 全覆盖了边界 / 成功 / 错误 / 4 状态 / 5 per-row action / 3 bulk action。tsc + production build + 541/541 core tests + 214/214 web tests + format 双清 + lint clean 全过。`/compose/boards` 在 `next build` route 列表里以 `ƒ` 出现 (server-rendered on demand)。
>
> 测试：core **541/541**（+16：8 renameBoard + 9 PATCH route，但有 1 个 shared test 计数重叠 — 实际 +16 测试条目）、web **214/214**（+13）、format 双清、lint clean、tsc clean（root + web）、production build OK（`ƒ /compose/boards` 出现在 route 列表）。
>
> **故意没做**（v0.6.13+ 留）：multiple connections (A↔B 双向) —— connection schema 加 `dir` 字段 + Inspector 双连接渲染；connection color 自定义 —— per-connection 调色板 + i18n；auto-route 避开 block 中心 —— orthogonal routing + 障碍规避（~1-2 天算法）；ComposeBoard.tsx hooks/state 抽离 —— 1974 行 + 17 useState + 15 useCallback，state hoisting 风险大。
>
> **2026-07-14 校准 (27)**：**v0.6.11 已发** —— 16 bug fixes（P0 × 2 + P1 × 4 + P2 × 5 + P3 × 5）。纯 patch release，无新 feature / 新 schema / 新 route。每个修复独立可测。
>
> | 级别 | 文件 | 修复 |
> |---|---|---|
> | **P0.1** | `src/core/compose-boards.ts:248-274` | 真原子 write：`writeFile(tmp) → rename(tmp, file)`，删冗余 `JSON.stringify` 第二次调用 + `unlink` hack |
> | **P0.2** | `web/src/app/compose/ComposeBoard.tsx:1183-1196` | `importJson` 接受 v3：版本检查 `[1, 2, 3].includes(parsed.version)` |
> | **P1.3** | `src/server/server.ts:594-604, 612, 622-632, 645` | 路由层 `assertBoardId` helper（regex `/^[a-zA-Z0-9_-]{1,64}$/`）→ 400 + descriptive error；`POST /compose/boards` 也校验 body 里的可选 id |
> | **P1.4 + P3.14** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` + `ComposeBoard.tsx:1515-1533` | 新 4 个 key `compose.boardList.{blockCount,connectionCount}.{one,other}`；替换 `.replace("1 ", "")` hack |
> | **P1.5** | `src/core/compose-boards.ts:128-225` | `readBoardSummary`（轻量字段类型检查）+ `Promise.all` 并行 IO；`listBoards` 切换路径 |
> | **P1.6** | `web/src/app/compose/ComposeBoard.tsx:929-957` | `saveBoardToServer` 先 `api.composeBoards()` 查同名；不同 id 走 `confirm(t("compose.board.confirmOverwrite"))` |
> | **P2.7** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` + `ComposeBoard.tsx:1895-1897` | 新 key `compose.canvasSelectBlock.keys`（Delete / Escape 字面量烤进翻译）；删 caller 硬编码 |
> | **P2.8** | `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` + `ComposeBoard.tsx:2125-2140` | 4 个新 key `compose.inspector.field.{id,kind,refId,position}` |
> | **P2.9** | `web/src/app/compose/Inspector.tsx` (新建) + `web/src/app/compose/ConnectionPath.tsx` (新建) | 抽 `BlockInspector` + `ConnectionList` + `ConnectingPicker` + `InspectorDetailFields` + 3 helpers + `KIND_META` 到 Inspector.tsx；抽 `ConnectionPath` + `BLOCK_W`/`BLOCK_H` 到 ConnectionPath.tsx；ComposeBoard.tsx 2767→1974 行（-793） |
> | **P2.10** | `web/src/app/compose/ComposeBoard.tsx:194-218, 415-462, 760-770` | module-level `buildConnectionIfValid(fromId, toId, state)` 纯函数；drag-to-create 路径 + `connectBlock` 都调它 |
> | **P2.11** | `web/src/components/OverflowMenu.tsx:34-42, 64` + `web/src/lib/i18n/{types,dict.en,dict.zh}.ts` + `web/src/app/try/page.tsx:290` | 新 key `aria.moreActions`；OverflowMenu 用 `useT()` 拿默认值；try 页面删显式 `ariaLabel="More actions"` 传参 |
> | **P3.12** | `web/src/app/compose/ComposeBoard.tsx:600-624` | 删 `handleCanvasX`/`handleCanvasY` 计算 + `void` 抑制；更新注释指向 SVG overlay closure |
> | **P3.13** | `src/core/plan-executor.ts:354, 768-790` | `areDependsOnSatisfied(task, plan)`：用 `plan.tasks` 建 `byId` Map；dependsOn target 必须是 `status === "completed"`；dangling reference → fail closed |
> | **P3.15** | `web/src/lib/types.ts:598-608` + `web/src/lib/pilot-browser.ts:333-345` + `web/src/app/compose/ComposeBoard.tsx:971-977` | 新 type `BoardInput`（mirror core）；`api.saveComposeBoard(id, input: BoardInput)`；payload 不再 spread `state`，只取 4 个 server 字段（name/blocks/connections/version） |
> | **P3.16** | `src/core/pi-session-runner.ts:53-92` | 删 `"dist/cli.js"` 相对路径兜底；用 `import.meta.url` 解析 module sibling `dist/cli.js`；最后 throw descriptive error |
> | **Tests** | `web/tests/overflow-menu.test.tsx` | 3 个测试 wrap `<I18nProvider initialLocale="en">`（OverflowMenu 现在调 useT） |
>
> 关键设计：
>
> - **P0.1 用 `fs.rename` 而非 unlink+writeFile**：POSIX guarantee rename atomic；unlink+writeFile 中间有"文件不存在"窗口，crash 会真丢数据。`rename` 失败时 catch + unlink tmp（防止 tmp 留垃圾），重新 throw。
> - **P1.4 用独立 `compose.boardList.*` key 而不是 `compose.inspector.blockCount.*`**：前者只表示 unit（"block"），后者烤了 count。caller 拼接 `数字 + 单位` 比 `.replace("1 ", "")` hack 干净太多。
> - **P1.5 summary path 保留 strict path**：`loadBoard` 仍跑全 Zod（用户实际打开 board 时），list 只跑 field type check（100 boards 不能卡 100ms）。
> - **P1.6 same-name confirm 走 `compose.board.confirmOverwrite` key**（v0.6.10 已经加好，v0.6.11 终于用上）。
> - **P2.7 keyboard 名字不进 i18n placeholder**：Delete / Escape / Esc 是 key 名字不是语言；中文也直接用英文。`.keys` 后缀的 key 表达"this is the keys-as-literal version"。
> - **P2.9 拆分不抽 hooks/state**：只抽"独立组件 + 它们的 helpers"（Inspector + ConnectionPath）。ComposeBoard 主 component 的 17 个 useState / 15 个 useCallback 还是在一起 — 那是一次更大的 refactor（hooks 抽离需要 state hoisting 或 context），不在 v0.6.11 范围。
> - **P2.10 `buildConnectionIfValid` 是 module-level pure function**：caller 传 state 函数返 connection 或 null；UI 关注点（commit/setState/announce/flip selection）仍在 caller closure 里。drag-to-create 和 inspector picker 现在用同一套验证规则，不可能再 drift。
> - **P3.13 fail closed on dangling reference**：dependsOn 引用不存在的 task id 返 false，不静默放行。`Map` lookup + 显式 `if (!dep) return false`。
> - **P3.15 `BoardInput` 不带 `id` / `updatedAt`**：id 走 path，updatedAt server 填。wire 契约宽度 = schema 宽度。
> - **P3.16 `import.meta.url` 解析 sibling**：`path.dirname(fileURLToPath(import.meta.url))` 拿 `dist/core/`，`path.resolve(here, "..", "cli.js")` 拿 `dist/cli.js`。这条在 `node_modules/pilot/dist/cli.js` 安装布局下也能用。
> - **overflow-menu test 加 I18nProvider wrap**：3 个 test 改 4 行（import + renderWithI18n helper + 替换 `render(`）。OverflowMenu 是通用组件，单独包 provider 比 setup.ts 全局包更轻。
>
> 验证限制：sandbox 没起 pilot server，UI 流程（Save panel / Load panel / Inspector 改 label）不能 Playwright 测，但 server-side 逻辑（ID validation / name confirm / atomic save / import version check）都被现有 25 compose-boards cases 覆盖。tsc + production build + 201/201 web tests（+overflow-menu 3 个 wrap i18n）+ 584/584 core tests + format 双清 + lint clean 全过。
>
> 测试：core **584/584**、web **201/201**，format 双清、lint clean、tsc clean（root + web）、production build OK。
>
> **故意没做**（v0.6.12+ 留）：`/compose/boards` 列表页（multi-board picker + rename + bulk delete + share-link）—— 纯 UI 切片，API 已经齐了；multiple connections (A↔B 双向)；connection color 自定义；auto-route 避开 block 中心；ComposeBoard.tsx hooks/state 抽离（需要更深的 refactor）。
>
> **2026-07 校准**：之前的 v1.0 终极宏图（`docs/roadmap-v1.0.md`，已移到 `docs/retired/`）建立在未经验证的假设上（6 阶段流水线 / Hermes scratch_pad）—— **Pi 实际数据里没有这些抽象**。Pilot 走的是 verify-first 路线，每个版本都基于 [`roadmap-pi-grounded.md`](./roadmap-pi-grounded.md) 的真实能力盘点。

## 阶段一：看见 Pi（v0.1 - v0.3.x，已发）

**目标**：让用户从终端看清 Pi 状态。

| 版本 | 状态 | 内容 |
|---|---|---|
| **v0.1.0** | ✅ 已发 | `pilot pack ls/search/info/install`、`session ls/search`、`doctor` |
| **v0.2.0** | ✅ 已发 | PilotService 抽象 · pilot server (127.0.0.1:17361) · Capability model · 本地 token 鉴权 |
| **v0.3.0** | ✅ 已发 | Session tree (CLI) · Profile manager · Cost stats · 包分类重构（读 manifest） |
| **v0.3.5** | ✅ 已发 | **★ Web UI v1（Next.js）· 3 个只读页 · 第一张截图** |
| **v0.3.6** | ✅ 已发 | UI v1.5（写操作：安装/卸载/启停） |

### 关键交付

- CLI 骨架（commander）
- 7 → 14 个命令（v0.4.x 扩到 14 个：pack / session / stats / profile / capability / doctor / dashboard / server / forge / init / policy / context / tool / usage）
- core 抽象（settings、JSONL parser、npm registry、pi CLI wrapper、PilotService interface）
- TypeScript strict + 单元测试（21 文件 / 270 用例，离线 ~7 秒跑完）
- CI / release-please / 贡献指南

**完成标志**：用户在终端能 ls / search / install / doctor，可以日常 dogfooding。

---

## 阶段二：管理 Pi（v0.3.7 - v0.3.10，已发）

**目标**：让用户能切换、组合、可视化 Pi 的配置。

| 版本 | 状态 | 内容 |
|---|---|---|
| **v0.3.7** | ✅ 已发 | usage / token / cost dashboard 接入 session JSONL |
| **v0.3.8** | ✅ 已发 | Project context auto-discovery + Tool inventory（只读） |
| **v0.3.9** | ✅ 已发 | Profile editor（overlay 模型）+ Capability 持久化 |
| **v0.3.10** | ✅ 已发 | Polishing：UI 文本统一 + 错误边界 + i18n 准备 |

### v0.3.7 关键内容

- **`pilot usage today/week/month`** — 解析 `AssistantMessage.usage.{input,output,cacheRead,cacheWrite,cost}`，按 provider / model 聚合
- **`pilot context`** — auto-discover `AGENTS.md` / `CLAUDE.md` / `.pi/AGENTS.md` / `.cursor/rules`
- **`pilot tool`** — 列出 profile 启用的所有 tool，标注来源（built-in / extension）/ safety / 调用次数

### v0.3.7 安全模型（写操作必须）

| 接口 | 保护 |
|---|---|
| `GET /health` / `GET /packs` / `GET /sessions` / `GET /usage` / `GET /context` / `GET /tools` | 仅 token |
| `POST /packs/install` / `POST /packs/uninstall` | token + Origin 校验 + CSRF token |
| `POST /profiles/*` / `POST /sessions/gc` / `POST /doctor/fix` | 同上 |
| `PUT /policies/*` / `POST /policies/*/apply` | 同上 |

**Web UI**：仅监听 127.0.0.1，浏览器只接受 `http://127.0.0.1:17361`，CORS 白名单只允许自己。Web token 永远不进入浏览器（v0.4.7+ 通过 `/api/pilot/[...path]` server-side proxy）。

---

## 阶段三：进化 Pi（v0.4 - v1.0，进行中）

**目标**：让 Pilot 成为**自主智能体工具**——不只是管理 Pi，更能规划任务、编排执行、自主迭代。

| 版本 | 状态 | 周期 | 内容 |
|---|---|---|---|
| **v0.4.0** | ✅ 已发 | — | Forge MVP（手写 3 能力 + eval harness） |
| **v0.4.1** | ✅ 已发 | — | Forge 能力库持久化 + capability show 命令 |
| **v0.4.2** | ✅ 已发 | — | read paths（usage/tools/context）+ 6 阶段数据模型 + 3 个 web 只读页 |
| **v0.4.3** | ✅ 已发 | — | Tool policies（TOML → 生成 pi extension，HITL 钩子） |
| **v0.4.4** | ✅ 已发 | — | Box Garden Compose MVP（拖拽画布 + localStorage 自动保存） |
| **v0.4.5** | ✅ 已发 | — | Cozy 2.5D 皮肤（cream + sage + amber + 伪元素立方体） |
| **v0.4.6** | ✅ 已发 | — | 基础设施：`pilot init` + `dashboard --prod` + standalone build + `release.sh` 一条龙 |
| **v0.4.7** | ✅ 已发 | — | 浏览器编辑 policy（7 字段表单 + token 不进浏览器） |
| **v0.4.8** | ✅ 已发 | — | WebUI a11y（WCAG AA + keyboard nav + axe-core 23 测试） |
| **v0.4.9-v0.5.6** | ✅ 已发 | — | Avatars + Co-pilot 模式 + Profile 真正生效 + Bug 修复 |
| **v0.5.7** | ✅ 已发 | — | **★ Agent 能力层基线：Plan 数据模型 + 任务规划 + 工具推荐 + Plan CRUD API + CLI** |
| **v0.6.0** | ⏳ 计划 | 3-4 周 | **自适应执行引擎：反馈分析 + 错误恢复 + 自主循环迭代** |
| **v0.7.0** | ⏳ 计划 | 2-3 周 | 工作流模板 + 组合复用（从历史 Plan 提取模板） |
| **v0.8.0** | ⏳ 计划 | 2-3 周 | 多 Plan 编排（DAG 依赖 + 并行执行） |
| **v1.0.0** | ⏳ 计划 | 1 月 | 稳定 + 文档 + 申请收录 pi.dev/packages |

### v0.5.7 关键内容（Agent 能力层 — Plan 数据模型基线）

详见 [`docs/roadmap-agent.md`](./roadmap-agent.md)。

**核心新增**：
- **Plan 数据模型** — Plan / Task / Step 三层结构，支持 sequential / parallel / adaptive 策略
- **StepAction** — 8 种动作类型（pilot_command / pi_session / profile_switch / pack_install / policy_apply / condition / wait / manual）
- **Plan CRUD API** — 完整的 REST 端点 + Server Actions
- **工具推荐** — 基于目标描述匹配可用工具和 Profile
- **CLI 命令** — `pilot plan new/ls/show/run/pause/resume/cancel/delete/suggest-tools`
- **存储** — `~/.pilot/plans/` (TOML) + `~/.pilot/plans-history/` (JSONL)
- **事件日志** — 每个生命周期动作（plan_created / started / paused / resumed / cancelled / deleted）记一条 JSONL 事件，方便后续执行器回放

### v0.6.0 关键内容（自适应执行引擎）

- **PlanExecutor** — 执行引擎，AsyncIterable<PlanEvent> 流式输出
- **FeedbackEngine** — 分析步骤结果，分类 pass/fail/partial
- **RecoveryStrategy** — 5 种恢复策略（retry / alternative / skip / escalate / replan）
- **自适应循环** — 执行 → 观察结果 → 调整计划 → 继续执行
- **Web UI** — Plan 执行状态实时展示（WebSocket 或轮询）

### v0.7.0 关键内容（工作流模板）

- **WorkflowTemplate** — 从历史 Plan 提取可复用的模板
- **内置模板** — code-review / bug-fix / feature-impl / refactor / onboard-pkg
- **模板实例化** — 用模板 + 参数生成具体 Plan
- **Compose 集成** — Plan 执行结果可视化展示在 Compose 画布

### v0.8.0 关键内容（多 Plan 编排）

- **PlanComposition** — 多个 Plan 的 DAG 依赖编排
- **并行执行** — 无依赖的 Plan 同时执行
- **跨 Plan 数据流** — 一个 Plan 的输出作为另一个的输入

### v0.4.x 真实路径（与原 plan 的差异）

`docs/roadmap-v1.0.md`（v3 终极版）原本计划 v0.4.6 做 "Memory 方块 + Context Compression"，但实际 v0.4.6 是**先把发布工程搞稳**（`init` + `dashboard --prod` + 一键 release）。这是合理的工程顺序调整：基础设施不牢，后面每个版本发布都是手工活。

| 版本 | 原计划 | 实际 | 调整原因 |
|---|---|---|---|
| v0.4.6 | Memory 方块 + Context Compression | 基础设施（init + dashboard --prod + release.sh） | 把发布工程自动化后再做 Memory 才有持续产出 |
| v0.4.7 | (无具体计划) | 浏览器编辑 policy | 验证 token 不进浏览器的安全模式 |
| v0.4.8 | (无具体计划) | WebUI a11y | ComposeBoard 是鼠标唯一可用，先解决可达性 |

### v0.4.5 关键内容（实际做的，不是 roadmap-v1.0 里写的"UI v2 Forge"）

`docs/roadmap-v1.0.md` 把 v0.4.5 写成 "Compose → Save as Profile + 2.5D + 实时 Run 模式"，实际只完成了 **2.5D skin**（cream + sage + amber palette + 伪元素立方体）。Save as Profile 和 Run 模式推迟。

### v0.5.0 关键内容（Avatars + Session snapshot + Replay）

- **Avatars** = base Pi + profile + capabilities + memory + model + session policy
- **Session capability snapshot** — 每个 session branch 记录当时启用的能力 + 模型
- **能力差异可视化** — UI 一目了然：architect / fixer / reviewer 分身的能力差异
- **三层隔离** — Global Pi / Pilot Capability Store / Avatar Overlay
- **冲突图** — 自动检测能力互斥，建议 safe-fix 分支
- **Replay mode** — 选定 session + profile 重放，观察每个阶段 trace
- **A/B diff** — 两个 session 同 prompt 不同 profile 的差异可视化
- **6 阶段 trace 可视化** — 每步标注属于 strategy / planner / retrieval / toolSelector / executor / validator / output

### v0.5.4 关键内容（Co-pilot 模式 / pilot agent）

```bash
pilot agent                  # 起 pi 子进程，自动加载 pilot-tools extension
pilot agent --profile work   # 用 work profile 启动
```

Pi 内部可用 13 个 LLM 工具（通过 `pilot-tools` extension）：
- `pack_install / pack_uninstall / pack_list`
- `profile_activate / profile_list`
- `session_search / session_info`
- `stats`（今日/本周消耗）
- `avatar_capture / avatar_diff / avatar_apply`
- `forge_search / capability_diff / doctor`

### v1.0 标志

- 文档齐全（vision / architecture / roadmap-pi-grounded / forge-and-avatars / modules）
- 申请收录到 pi.dev/packages
- npm 周下载 > 100
- GitHub stars > 50
- 3 个外部贡献者
- 至少 1 个 issue 被合并

---

## 关键边界（重要）

- **Pilot 不抓取闭源产品内部 prompt / 代码 / 协议**。只复刻"公开可观察的工作流行为"。
- **Pilot 不承诺"等价 Claude Code / Codex / Kimi"**。表述为 "Claude Code-style plan workflow" 或 "inspired workflow"。
- **能力包沙箱化**。permission-gate、shell-wrapper 这类能力必须隔离测试。
- **eval 防作弊**。不读断言答案硬编码；用多 fixture + 多轮任务 + 隐藏评测集。

## 内部化 4 等级（Forge 关键设计）

| 等级 | 名称 | 描述 |
|---|---|---|
| L1 | Referenced | 直接依赖外部扩展 |
| L2 | Wrapped | 外部扩展 + Pilot wrapper |
| L3 | Distilled | 提炼行为规格，重写为 Pilot 能力包 |
| L4 | Native | 进入 Pilot core，成为内置能力 |

这样既能快速获得能力，又不会长期被外部扩展绑死。

---

## 反节奏

如果某个阶段超出 1.5x 预计时间，**停下来**：
1. 重新确认问题是否真的存在
2. 跑 dogfooding 找新痛点
3. 调整下个阶段范围

不要为了"按计划发版"硬推。开源项目慢一点比烂掉好。

---

## 文档层级

| 文档 | 作用 |
|---|---|
| **本文件（`roadmap.md`）** | 三段式 high-level 叙事 + 阶段边界 |
| **[`docs/roadmap-agent.md`](./roadmap-agent.md)** | **Agent 能力层路线图** — Plan / Task / Step / Executor / Feedback |
| **[`docs/roadmap-pi-grounded.md`](./roadmap-pi-grounded.md)** | v0.4.x 真实路径 + 以 Pi 实际能力为锚的 11 个 toggle + 详细规划 |
| **[`docs/v0.4.2-dev-plan.md`](./v0.4.2-dev-plan.md)** | v0.4.2 具体实施（已被实际发布覆盖，仅作 audit） |
| **[`docs/retired/roadmap-v1.0.md`](./retired/roadmap-v1.0.md)** | 已作废的 v3 终极版宏图（保留为 audit trail） |
| **[`docs/retired/macro-spec-audit.md`](./retired/macro-spec-audit.md)** | 作废文档审计记录 |