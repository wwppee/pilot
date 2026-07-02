# Pilot v0.4.2 — See What Pi Is Doing

## 摘要

v0.4.2 把 Pilot 从"管包 + 读老格式"升级到"**真正读懂 pi v3 的数据**"——usage 计费、tool 调用轨迹、project context 扫描，全部基于 pi 实际产生的 JSONL 字段（`AssistantMessage.usage`、`ToolResultMessage.isError`、`loadProjectContextFiles` 算法）。

**之前 stats.ts 注释写 "No token accounting yet — pi's session format may carry usage data but we don't depend on it"。这次不依赖了——已经依赖了。**

## 新增命令

```bash
pilot usage <today|week|month|all> [--json]   # token + cost (USD)
pilot tool ls [--json]                       # 7 built-in + npm extensions
pilot tool inspect <name> [--json]            # 详细（含 safety/source）
pilot context ls [cwd] [--json]              # AGENTS.md / CLAUDE.md / README / .cursor/rules
pilot context show <name> [cwd]               # 完整内容
```

## 新增 server endpoint

```
GET /usage?range=today|7d|30d
GET /tools
GET /context?cwd=...
```

## 新增 Web UI 页面

- `/usage` — token usage + cost dashboard，带 by-model 表 + by-day 条形图 + 4 个 summary card
- `/tools` — 工具库存浏览器（7 built-in + npm 包），按 safety 分类色标
- `/context` — 项目 context 浏览器，区分"pi 加载"和"信息性"
- Dashboard（首页）`Today` 条加 2 个新指标卡：**Tokens** + **Cost (USD)**

导航栏加了 3 个新链接。3 个新路由都是 dynamic server-rendered。

## 修复的关键 bug

Pilot 之前用 `{type: "user" | "assistant" | "tool" | "system", data: {...}}` 这种**不存在的 JSONL shape** 在解析。Pi v3 实际写的是 `{type: "message", message: {role, content, model, usage, ...}}`。这意味着 v0.4.1 之前 Pilot 实际上**不能读真 pi session**。本次：

- `core/types.ts` `SessionEntry` 改为 v3 shape（+ 完整的 `AgentMessage` union）
- `core/jsonl-parser.ts` 增加 `isAssistantEntry` / `isToolResultEntry` 类型守卫
- `core/stats.ts` 重写以处理 v3 消息
- 旧测试用 hand-crafted fixture 还在跑（backward compat）

## 测试

- 25 个新单测（CLI / core）
  - usage.test.ts (5) — token/cost 聚合
  - tool-trace.test.ts (7) — ToolResultMessage 抽取
  - project-context.test.ts (9) — pi 同样的 walk-up 算法
  - tool-inventory.test.ts (6) — 7 built-in + npm 包
  - jsonl-parser.test.ts (+4) — v3 格式测试
- Web 测试：9 个新 web vitest 还在跑
- 总数：**191/191** core + 9 web 通过（v0.4.1 是 160）
- TypeScript strict 0 error

## 已知限制

- **未实现 AST 扫描**：pi 扩展的 `.ts` 文件里的 `pi.registerTool()` 调用没解析。v0.4.2 只列 npm-installed 包的名字。v0.4.3 会加 AST。
- **未写回 pi settings**：本次纯 read。v0.4.3 加 tool policy 写回（通过产出一个 `pilot-policy` extension 拦截 `tool_call`）。
- **compaction / subagent tree**：v0.5+。

## 文件

- `core/usage.ts` (新, ~210 行)
- `core/tool-trace.ts` (新, ~150 行)
- `core/project-context.ts` (新, ~150 行)
- `core/tool-inventory.ts` (新, ~140 行)
- `commands/usage.ts` (新)
- `commands/tool-list.ts` (新)
- `commands/context.ts` (新)
- `core/jsonl-parser.ts` (v3 支持, +60 行)
- `core/types.ts` (SessionEntry 重写, +130 行)
- `core/stats.ts` (v3 重构)
- `core/service.ts` + `service-impl.ts` (4 个新方法)
- `server/server.ts` (3 个新 endpoint)
- `cli.ts` (注册 2 个新命令)
- `web/src/app/usage/page.tsx` (新)
- `web/src/app/tools/page.tsx` (新)
- `web/src/app/context/page.tsx` (新)
- `web/src/app/page.tsx` (dashboard 加 tokens + cost card)
- `web/src/lib/types.ts` (3 个新 type 集)
- `web/src/lib/pilot.ts` (3 个新 api 方法)
- `web/src/app/layout.tsx` (导航 3 个新链接)
- `package.json`: 0.4.1 → 0.4.2
- `web/package.json`: 0.3.5 → 0.4.2
