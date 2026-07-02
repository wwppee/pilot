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

| # | 用户面 | Pi 实现 | Pilot 在 v0.4.x 做的事 |
|---|--------|--------|---------------------|
| 1 | **Models** | `--provider` / `--model` + 24+ 环境变量 | 列出 provider、model；profile 切换；tokens 计费汇总 |
| 2 | **Tools policy** | `--tools` / `--exclude-tools` | 可视化勾选、持久化为 TOML profile |
| 3 | **Skills** | 自动目录 + `--no-skills` | 列出已装 skills，按 profile 启停 |
| 4 | **Prompts** | 自动目录 + `--no-prompt-templates` | 同 skills |
| 5 | **Themes** | 自动目录 + `--no-themes` | 同 skills |
| 6 | **Project Context** | 自动发现 AGENTS.md / CLAUDE.md / `--no-context-files` | 列出加载了哪些文件、byte 数、影响（v0.4.2 已计划） |
| 7 | **Instruction** | `--system-prompt` / `--append-system-prompt` + `before_agent_start` | 多版本 system prompt、profile 切换 |
| 8 | **Guardrails** | extension `pi.on("tool_call")` 返回 `{ block: true }` | Pilot 产出"pilot-guardrails" extension（v0.4.3）|
| 9 | **HITL** | `ctx.ui.confirm()` 在 `tool_call` 里 | Pilot 产出"pilot-hitl" extension（v0.4.3）|
| 10 | **Compaction** | `pi.on("session_before_compact")` 自定义策略 | v0.5+ |
| 11 | **Reasoning** | `--thinking` + provider-level | v0.5+ |

之前文档里的 7 槽 / 8 干预点 / Hermes scratch_pad 是**想象**，应该删掉。

## 四、Pilot 已经有的事实（verify）

```
src/core/
  capability.ts (180 lines)        Capability data model + Zod schema
  jsonl-parser.ts (228 lines)      读 pi JSONL session（含 tree 重建）
  npm-registry.ts (122 lines)      npm search / install via registry
  pack-manifest.ts (193 lines)     pi pack manifest 读取 + 分类
  pi-cli.ts (91 lines)             shell out to `pi` CLI
  profile.ts (194 lines)           TOML profile CRUD
  service-impl.ts (333 lines)      PilotService 实现
  service.ts (138 lines)           Service interface
  sessions.ts (67 lines)           JSONL 列表
  settings.ts (40 lines)           读 pi 的 settings.json
  stats.ts (217 lines)             JSONL 流式聚合（**还没读 usage**）

src/commands/
  pack, profile, session, stats, capability, doctor, dashboard, server, forge

Web UI: 9 routes (capability, sessions, settings, profile, dashboard, ...)
```

`stats.ts` 已经注释说 "No token accounting yet — pi's session format may carry usage data but we don't depend on it"。**v0.4.2 第一件事就是补这个。**

## 五、详细 v0.4.2 dev plan（每个文件的具体改动）

详见 `docs/v0.4.2-dev-plan.md`。
