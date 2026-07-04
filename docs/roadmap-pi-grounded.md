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

## 五、v0.4.2 → v0.4.11 真实路径

| 版本 | 内容 | 关键文件 |
|---|---|---|
| **v0.4.2** | read paths: usage / tools / context + 6 阶段数据模型 + 3 web 页 | `core/stats.ts` + `core/tool-inventory.ts` + `core/project-context.ts` |
| **v0.4.3** | Tool policies (TOML + extension generator) | `core/policy.ts` + `core/policy-engine.ts` + `core/policy-extension.ts` + `core/extension-scanner.ts` |
| **v0.4.4** | Box Garden Compose MVP | `core/compose-listing.ts` + `web/.../compose/ComposeBoard.tsx` |
| **v0.4.5** | Cozy 2.5D skin (cream + sage + amber) | `web/.../compose/compose.module.css` |
| **v0.4.6** | 基础设施：`init` + `dashboard --prod` + `release.sh` 一条龙 | `commands/init.ts` + `commands/dashboard.ts` + `scripts/release.sh` |
| **v0.4.7** | 浏览器编辑 policy (token 不进浏览器) | `web/.../api/pilot/[...path]/route.ts` + `web/.../policy/[name]/edit/` |
| **v0.4.8** | WebUI a11y (WCAG AA + keyboard + axe-core 23 测试) | `web/.../layout.tsx` + `web/.../globals.css` + `web/tests/a11y.test.tsx` |
| **v0.4.9** | typecheck hotfix + docs sync (release-please 历史债) | 9 处 JSX namespace + 3 处其他 + `release.sh` 加 web tsc + `roadmap-v1.0.md` 归档 |
| **v0.4.10** | `/packages` 搜索白屏 hotfix + npm publish 流程加固 | `web/src/lib/pilot.ts` + `scripts/release.sh` (preflight dist + npm view + --provenance) |
| **v0.4.11** | WebUI i18n (EN / 中文，Accept-Language 默认 + localStorage 持久化) | `web/src/lib/i18n/` + `web/src/components/I18n.tsx` + `web/src/components/LanguageSwitcher.tsx` + 12 page files + 90+ dict keys |
| *unreleased* | policy edit white-screen (params 未 await) + i18n coverage gap fix | `web/src/app/policy/[name]/edit/page.tsx` + `<NavLinks>` + `<DeleteButton confirmMessage>` + 30+ dict keys |

**总测试**：270 core + 70 web = 340 passing；TypeScript strict 0 errors；web build clean。

## 六、v0.4.12 → v0.5.0 候选（next）

按"先解决最痛的问题"原则：

| 候选 | 内容 | 估时 | 解决的痛点 |
|---|---|---|---|
| **A** ✅ done | npm publish 自动化 | 半天 | **v0.4.10 已完成** — `release.sh` 加 preflight + npm view + --provenance + 422 already_exists 自动 PATCH |
| **B** | 浏览器编辑 profile（v0.4.7 是 policy；profile 还是只能 CLI） | 2-3 天 | profile 编辑是高频动作，"创建-编辑-应用" 闭环断在 web |
| **C** | ComposeBoard block-to-block SVG 箭头 + 6 阶段可视化骨架 | 3-4 天 | 现在方块是孤立的；加箭头让"流"的感觉出来；为 v0.5.0 的 Replay mode 打底 |
| **D** | Session snapshot — 在 session JSONL 派生文件里记录 capabilities + model 快照 | 4-5 天 | v0.5.0 Avatars / Capability diff 的数据基础，没有它 diff 没法做 |
| **E** | `pilot init` 接入到 dashboard flow（`dashboard --setup` 一键 init + start） | 1 天 | 新用户体验：现在 `init` 和 `dashboard` 是两步，衔接不顺 |

**我倾向 D 先做**（虽然时间最长）。理由：

1. **D 是 v0.5.0 的硬前置**：Avatars diff、Replay mode、6 阶段 trace 可视化——这三个都依赖"每个 session 当时启用了哪些 capabilities + model"。没这个 snapshot，后面 5 个版本都在沙上盖楼。
2. **D 单独 ship 也立得住**：不依赖 Avatars/Replay 本身。读 JSONL + 派生文件 + 在 `/sessions/[id]` 显示"当时 model = claude-opus, capabilities = [policy-safe-bash, profile-research]" 这一行就够了。
3. **D 测试容易**：纯派生计算，无 UI 复杂度；session JSONL schema 已经验证过。

时间表（按这个顺序）：
```
v0.4.12 (4-5 天)  D: Session snapshot
v0.4.13 (2-3 天)  B: 浏览器编辑 profile（拿 v0.4.7 policy edit 的模板，1 天复用）
v0.4.14 (3-4 天)  C: ComposeBoard SVG 箭头（v0.5.0 视觉基础）
v0.4.15 (1 天)    E: init + dashboard 衔接（polish）
v0.5.0  (1-2 周)  组合: Avatars + Capability diff (基于 D + B) + Replay mode (基于 C)
```

如果你拍 D，我就开干。

## 七、v0.5 → v1.0 计划

详见 [`docs/roadmap.md` § 阶段三](./roadmap.md#阶段三进化-pi-v04---v10进行中)。

调整后的简版（v0.5 拆成 5 个小版本，每个 1-2 周，可独立 ship）：

| 版本 | 周期 | 内容 |
|---|---|---|
| **v0.5.0** | 2 周 | Avatars (架构定义 + TOML schema + 第一个示例 avatar `pi-architect`) + Capability diff (基于 v0.4.12 snapshot) |
| **v0.5.1** | 1 周 | Replay mode（选 session + profile 重放；只读 trace） |
| **v0.5.2** | 1 周 | 6 阶段 trace 可视化（基于 Replay 的每步标注属于 strategy/planner/retrieval/toolSelector/executor/validator/output） |
| **v0.5.3** | 1 周 | A/B diff（两个 session 同 prompt 不同 profile 的差异对比） |
| **v0.6.0** | 2 周 | Pi extension（`@pilot/pi-extension` — `/pilot stats today`、`/pilot session search`、`/pilot doctor`、`/pilot ui`） |
| **v0.7.0** | 2 周 | 多 Pi 编排（团队 / 服务端 / 本地） |
| **v1.0.0** | 1 月 | GA + 申请收录 pi.dev/packages + 完整文档 + npm 周下载 > 100 |

**v0.5.0 GA 标志**：用户能在 Web 上选 session 重放 + 看每个 capability 的差异 + 看到 6 阶段 trace。

## 八、v0.4.2 dev plan（已完成）

详见 [`docs/v0.4.2-dev-plan.md`](./v0.4.2-dev-plan.md)（已被实际发布覆盖，仅作 audit）。
