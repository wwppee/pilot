# Pilot v0.4.x 路线图 — 以 Pi 实际能力为锚（修订版）

> **重新校准**：之前的 v1.0 宏图（3 层 + 7 槽 + 6 阶段 + Hermes 借鉴）建立在假设上，没有验证 Pi 实际提供什么。本文件以 Pi **实际** 的扩展模型、CLI flag、JSONL 数据结构为起点。

## 一、Pi 实际提供的能力（已核实）

### Pi 自身就有的（**Pilot 不需要重新发明**）

| 能力 | Pi 实现 | 备注 |
|------|--------|------|
| Tool 白/黑名单 | `--tools <allowlist>` / `--exclude-tools <denylist>` | CLI flag 直接生效 |
| Project Context 自动发现 | `AGENTS.md` / `CLAUDE.md` / `.pi/AGENTS.md` | 用 `--no-context-files` 关闭 |
| 系统提示 | `--system-prompt` / `--append-system-prompt` | 可在 extension 里 `before_agent_start` 动态改 |
| Extension 加载 | `~/.pi/agent/extensions/*.ts` + `~/.pi/agent/npm/` | 按需自动 |
| Skills / Prompts / Themes | 自动目录发现，`--no-{skills,prompt-templates,themes}` 关闭 | 各自有独立目录 |
| Thinking level | `--thinking off/minimal/low/medium/high/xhigh` | 也可在 extension 里 `setThinkingLevel()` |
| Tool 拦截（block） | extension `pi.on("tool_call", ...)` → 返回 `{ block: true }` | **这就是 Pilot 想要的 HITL** |
| Tool 结果改写 | extension `pi.on("tool_result", ...)` → 改 `content` / `details` | 已经可以做 audit / redact |
| Token 计费 | `AssistantMessage.usage.{input,output,cacheRead,cacheWrite,cost}` 全在 JSONL 里 | Pilot 还没读，需补 |
| Compaction 自定义 | extension `pi.on("session_before_compact")` 可替换 | Hermes-like 在这里实现 |
| 多 Provider / Model | `--provider` / `--model` + 24+ 环境变量 | 已经支持（Anthropic/OpenAI/Google/...） |
| 输出模式 | `--mode text/json/rpc/print` | print 模式适合做 service |

### Pi extension API（13+ events）

```
session_start { reason: "startup" | "new" | "resume" | "fork" }
session_shutdown
resources_discover
before_agent_start    ← 可改 system prompt、注入 message
agent_start / agent_end
turn_start / turn_end
message_start / message_update / message_end   ← token-by-token
model_select
tool_call             ← 可拦截、可修改 input
tool_result           ← 可改写 result
user_bash
session_before_compact / compaction  ← Hermes-like 错误恢复
```

外加方法：
- `pi.registerTool()`、`pi.registerCommand()`、`pi.registerProvider()`
- `ctx.ui.confirm()` / `notify()` / `select()` / `input()` / `setStatus()` / `setWidget()`
- `pi.appendEntry()` / `pi.compress()` / `pi.abort()` / `pi.shutdown()`
- `ctx.getSystemPrompt()` / `ctx.getContextUsage()` / `ctx.sessionManager`

### JSONL 实际数据结构

```typescript
// 一行一个 entry
interface FileEntry = SessionHeader | SessionEntry;
interface SessionEntry {
  id: string;       // 8-char hex
  parentId: string | null;
  timestamp: string;
  type: "message" | "thinking_level_change" | "model_change" |
        "compaction" | "branch_summary" | "custom" | "label" | "session_info";
  // type: "message" 嵌一层：
  message?: AgentMessage;  // UserMessage | AssistantMessage | ToolResultMessage |
                          // | BashExecutionMessage | CustomMessage |
                          // | BranchSummaryMessage | CompactionSummaryMessage
}

// AssistantMessage 自带 token 计费
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;       // ← Pilot 还没读！
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

// ToolResultMessage 自带成败信息
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: any;
  isError: boolean;
  timestamp: number;
}
```

## 二、Pilot 真正要做的（在 Pi 之上）

Pilot 不拦截 Pi 的 runtime（做不到也不需要）。Pilot 做的是：

1. **观察 Pi 的状态** — 读 `~/.pi/agent/` 各种目录
2. **观察 Pi 的历史** — 读 session JSONL（含 usage、tool call、compaction）
3. **编排 Pi 的运行** — `pi install` / `pi list` / 写 runner script 喂 `--tools` 等 flags
4. **生成 Pi 友好的配置** — 产出 `settings.json` 改动 / TOML profile / extension 源码
5. **提供 Web UI** — 把 1-4 在箱庭视觉里呈现，让用户"搭 / 看 / 调试" Pi

## 三、修正后的 11 个 toggle（基于 Pi 实际能力）

| # | 用户面 | Pi 实现 | Pilot 现状 (2026-07-04) |
|---|--------|--------|---------------------|
| 1 | **Models** | `--provider` / `--model` + 24+ 环境变量 | ✅ `/usage` + `pilot usage` (v0.4.2)，按 provider/model 聚合 |
| 2 | **Tools policy** | `--tools` / `--exclude-tools` | ✅ TOML profile + browser edit + extension generator (v0.4.3 + v0.4.7) |
| 3 | **Skills** | 自动目录 + `--no-skills` | ⏳ 列出已装 skills (v0.4.8 read)，profile 启停 (v0.5) |
| 4 | **Prompts** | 自动目录 + `--no-prompt-templates` | ⏳ 同 skills (v0.5) |
| 5 | **Themes** | 自动目录 + `--no-themes` | ⏳ 同 skills (v0.5) |
| 6 | **Project Context** | 自动发现 AGENTS.md / CLAUDE.md / `--no-context-files` | ✅ `/context` + `pilot context` (v0.4.2) |
| 7 | **Instruction** | `--system-prompt` / `--append-system-prompt` + `before_agent_start` | ⏳ 列出 system prompt 模板 (v0.5) |
| 8 | **Guardrails** | extension `pi.on("tool_call")` 返回 `{ block: true }` | ✅ `pilot policy` 生成 `pilot-policy-<name>.ts` extension (v0.4.3) |
| 9 | **HITL** | `ctx.ui.confirm()` 在 `tool_call` 里 | ✅ 同上 extension 集成 `ctx.ui.confirm()` (v0.4.3) |
| 10 | **Compaction** | `pi.on("session_before_compact")` 自定义策略 | ⏳ v0.5+ |
| 11 | **Reasoning** | `--thinking` + provider-level | ⏳ v0.5+ |

之前文档里的 7 槽 / 8 干预点 / Hermes scratch_pad 是**想象**，已经删掉。详见 [`docs/retired/macro-spec-audit.md`](./retired/macro-spec-audit.md)。

## 四、Pilot 已经有的事实（2026-07-04 verify）

```
src/core/                           核心模块（已读 Pi 真实数据）
  capability.ts                     Capability data model + Zod schema
  compose-listing.ts (v0.4.4)       cross-entity enumeration for Compose canvas
  extension-scanner.ts (v0.4.3)     AST-light regex scan of pi.registerTool()
  jsonl-parser.ts                   读 pi JSONL session（含 tree 重建）
  npm-registry.ts                   npm search / install via registry
  pack-manifest.ts                  pi pack manifest 读取 + 分类
  pi-cli.ts                         shell out to `pi` CLI
  policy.ts (v0.4.3)                ToolPolicy Zod schema + TOML IO
  policy-engine.ts (v0.4.3)         pure checkPolicy + matchPath glob + redactContent
  policy-extension.ts (v0.4.3)      TS extension generator
  profile.ts                        TOML profile CRUD
  service-impl.ts                   PilotService 实现
  service.ts                        Service interface
  sessions.ts                       JSONL 列表
  settings.ts                       读 pi 的 settings.json
  stats.ts                          JSONL 流式聚合（含 usage + cost）
  tool-inventory.ts (v0.4.2)        read-only tool listing
  project-context.ts (v0.4.2)       auto-discoverer for AGENTS.md / CLAUDE.md

src/commands/                       14 个 CLI 子命令
  pack, profile, session, stats, capability, doctor, dashboard, server,
  forge, init (v0.4.6), policy (v0.4.3), context (v0.4.2),
  tool-list (v0.4.2), usage (v0.4.2)

src/utils/
  io.ts, logger.ts, net.ts (v0.4.6), shell.ts

web/src/app/                        18 routes
  /                                 dashboard (home)
  /compose                          Box Garden canvas (v0.4.4 + Cozy v0.4.5 + a11y v0.4.8)
  /policy                           policy list + dry-run (v0.4.3)
  /policy/[name]/edit               full edit form (v0.4.7)
  /profiles, /profiles/[name]       profile overlay 管理
  /sessions, /sessions/[id]         session list + DAG tree
  /tools                            tool inventory (v0.4.2)
  /usage                            token/cost dashboard (v0.4.2)
  /context                          project context list (v0.4.2)
  /capabilities, /capabilities/[id] capability store
  /packages, /packages/[name]       pack center
  /api/pilot/[...path]              server-side proxy (v0.4.7, token 永不进浏览器)
  /api/policy-check                 dry-run endpoint
```

`stats.ts` 已经补了 usage + cost，从 `AssistantMessage.usage.{input,output,cacheRead,cacheWrite,totalTokens,cost.*}` 直接聚合。

## 五、v0.4.2 → v0.4.8 真实路径

| 版本 | 内容 | 关键文件 |
|---|---|---|
| **v0.4.2** | read paths: usage / tools / context + 6 阶段数据模型 + 3 web 页 | `core/stats.ts` + `core/tool-inventory.ts` + `core/project-context.ts` |
| **v0.4.3** | Tool policies (TOML + extension generator) | `core/policy.ts` + `core/policy-engine.ts` + `core/policy-extension.ts` + `core/extension-scanner.ts` |
| **v0.4.4** | Box Garden Compose MVP | `core/compose-listing.ts` + `web/.../compose/ComposeBoard.tsx` |
| **v0.4.5** | Cozy 2.5D skin (cream + sage + amber) | `web/.../compose/compose.module.css` |
| **v0.4.6** | 基础设施：`init` + `dashboard --prod` + `release.sh` | `commands/init.ts` + `commands/dashboard.ts` + `scripts/release.sh` |
| **v0.4.7** | 浏览器编辑 policy (token 不进浏览器) | `web/.../api/pilot/[...path]/route.ts` + `web/.../policy/[name]/edit/` |
| **v0.4.8** | WebUI a11y (WCAG AA + keyboard + axe-core) | `web/.../layout.tsx` + `web/.../globals.css` + `web/tests/a11y.test.tsx` |

## 六、v0.4.9 候选（next）

按"先解决最痛的问题"原则，三个候选（**等你拍板**）：

| 候选 | 内容 | 估时 | 解决的痛点 |
|---|---|---|---|
| **A** | npm publish 自动化（接 `release.sh`，有 `NPM_TOKEN` 时自动 publish） | 半天 | v0.4.x 每次发布都要手工 publish，文档说"有 NPM_TOKEN 就自动"，实际没接 |
| **B** | 浏览器编辑 profile（v0.4.7 是 policy，profile 还是只能 CLI） | 2-3 天 | profile 编辑是高频动作，不能只在 CLI |
| **C** | ComposeBoard 加 block-to-block SVG 箭头（让"画布"真的有"流"的感觉） | 2-3 天 | 视觉上现在是孤立方块，缺"连"的概念 |

我倾向 **A**：v0.4.x 已经发了 9 个版本，每个版本都带病发布（typecheck / docs 不全），先把发布工程一次搞透，再上功能。但你拍。

## 七、v0.5 → v1.0 计划

详见 [`docs/roadmap.md` § 阶段三](./roadmap.md#阶段三进化-pi-v04---v10进行中)。

简版：
- **v0.5.0**（4-6 周）：Avatars + Session snapshot + 能力差异可视化 + Replay mode + A/B diff + 6 阶段 trace 可视化
- **v0.6.0**（2 周）：Pi extension（`/pilot` slash 命令）
- **v0.7.0**（2 周）：多 Pi 编排
- **v1.0.0**（1 月）：GA + 申请收录 pi.dev/packages

## 八、v0.4.2 dev plan（已完成）

详见 [`docs/v0.4.2-dev-plan.md`](./v0.4.2-dev-plan.md)（已被实际发布覆盖，仅作 audit）。
