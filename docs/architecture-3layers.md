# Pilot 架构 — 3 层 + 7 槽 + 8 干预点

> 借鉴 **Hermes** 的"分层注入 + 全程可掀开"思路，结合 OpenClaw 多入口 + Codex/opencode 工具链，把 Pilot 设计成一个**每层都可配置的 agent 操作系统**。

## 一、3 层架构

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 1: Gateway                                               │
│  ── 多入口 ── 会话路由 ── 多 agent 路由 ── 权限/审计              │
│  CLI / Web UI / (Telegram/Slack/Feishu) → 同一个 PilotService     │
├────────────────────────────────────────────────────────────────┤
│  Layer 2: Agent Runtime                                         │
│  ── 6 阶段流水线 ── 上下文 ── 记忆 ── 工作流 ── 反思             │
│  Strategy → Planner → Retrieval → ToolSel → Exec → Valid → Out  │
├────────────────────────────────────────────────────────────────┤
│  Layer 3: Tool Calling                                          │
│  ── Schema 注册 ── XML 解析/序列化 ── 执行 ── 沙箱 ── 校验       │
│  工具调用格式：  xml / hermes-style / mcp / native              │
└────────────────────────────────────────────────────────────────┘
```

每层有自己的**配置入口**、**独立的数据结构**、**独立的服务接口**。PilotService 是统一的对外 API（v0.2-a 已定义），3 层是它的实现分层。

## 二、7 槽（Layer 2 的核心数据模型）

借鉴 Hermes 的"分槽注入"，一个 Agent System 由 7 个独立槽组成。每个槽是**可单独编辑 / 启用 / 替换**的：

```typescript
interface AgentSystem {
  // 槽 1: 角色与指令
  instruction: InstructionSlot;
  //   多版本 system prompt，热切换

  // 槽 2: 边界与禁止
  guardrails: GuardrailSlot;
  //   { denyPaths, denyCommands, sensitivePatterns, outputFilters }

  // 槽 3: 工作流
  workflow: WorkflowSlot;
  //   { steps: [...], requireApprovalAt: [...] }

  // 槽 4: 记忆
  memory: MemorySlot;
  //   { tier, compressionPolicy, retrievalPolicy }

  // 槽 5: 技能
  skills: SkillSlot[];
  //   用户封装的稳定任务

  // 槽 6: 工具（Layer 3 深入）
  tools: ToolSlot[];
  //   见 Layer 3 schema

  // 槽 7: 推理模板（scratch_pad）
  reasoningTemplate: ReasoningSlot;
  //   plan-act-observe-reflect 的 prompt 模板
}
```

每槽的**配置面板**独立（`/settings/agent/[id]?slot=instruction` 等），借鉴 Hermes 的分槽编辑：
- 实时编辑 + 预览
- 多版本切换
- 与当前 session 的 diff
- "测试此槽"：跑 N 个 sample session 看效果（v0.5+）

## 三、Layer 3 — ToolSlot 的 schema（Hermes-style）

```typescript
interface ToolSlot {
  name: string;                // e.g. "read_file"
  description: string;         // 人类可读
  source: 'built-in' | 'extension' | 'mcp';
  schema: JSONSchema;          // 强制 schema（不能 free-form）

  // ──── 控制策略 ────
  policy: {
    requireApproval: boolean;
    sandbox: 'none' | 'worktree' | 'container';
    rateLimit?: { perMinute: number };
    timeoutMs?: number;
  };

  // ──── Few-shot 引导 ────
  examples: ToolExample[];

  // ──── 观测 ────
  metrics: {
    totalCalls: number;
    avgLatencyMs: number;
    errorRate: number;
    lastUsedAt: number;
  };
}
```

**Hermes 标签风格**（v0.5+ 适配）：
```xml
<tools>
  <tool name="read_file">
    <description>Read a file from disk</description>
    <parameters>...</parameters>
  </tool>
</tools>
```

模型输出：
```xml
[scratch_pad]Need to look at the file first[/scratch_pad]
<tool_response or="model output">
<tool_call name="read_file">
{"file_path": "/Users/x/.../foo.ts"}
</tool_call>
</tool_response>

[tool_response from system]
<tool_response name="read_file">
{"content": "...", "truncated": false}
</tool_response>
```

每步都有 `scratch_pad`（**推理**）和 `tool_call`（**动作**）分离，前端可拆开渲染。

## 四、8 干预点的具体落点（用户清单 → 3 层 + 7 槽）

| 干预点 | 落点（Layer + Slot） | v0.4.x 时间表 |
|-------|---------------------|---------------|
| **Prompt / System 指令** | Layer 2 / 槽 1 (instruction) | v0.4.4 |
| **Tools / 工具调用** | Layer 3 / ToolSlot | ✅ v0.4.2 read-only；UI 化 v0.4.3 |
| **MCP** | Layer 3 / ToolSlot.source='mcp' | v0.4.5 |
| **Skills** | Layer 2 / 槽 5 (skills) | v0.4.6 |
| **Memory** | Layer 2 / 槽 4 (memory) | v0.4.6 |
| **Workflow** | Layer 2 / 槽 3 (workflow) | v0.4.5 |
| **Guardrails** | Layer 1 + Layer 2 槽 2 (guardrails) | v0.4.3 |
| **Human-in-the-loop** | Layer 2 / 槽 3 (workflow.requireApprovalAt) | v0.4.3 |

## 五、Layer 1 — Gateway 数据模型

```typescript
interface GatewayChannel {
  id: 'cli' | 'web' | 'telegram' | 'slack' | 'feishu' | string;
  enabled: boolean;
  config: Record<string, unknown>;  // 各 channel 自己的配置
}

interface GatewayRouting {
  // 多 agent 路由规则
  rule: (request: IncomingRequest) => AgentSystemId;
}

interface GatewayAuditLog {
  timestamp: number;
  channel: GatewayChannel['id'];
  user: string;
  requestSummary: string;
  decision: 'allow' | 'deny' | 'transform';
  reason?: string;
}
```

Web UI：`/settings/gateway` — 入口开关、权限矩阵、审计日志时间线。

## 六、Hermes 借鉴清单（具体哪些 UX 复用什么）

| Hermes 特性 | 借鉴为 Pilot 的什么 | 何时落地 |
|------------|--------------------|---------|
| **`<tools>` JSON Schema 强制** | ToolSlot.schema | ✅ v0.4.2 数据模型；UI v0.4.3 |
| **`<scratch_pad>` 推理块** | ReasoningSlot + 每步 trace 折叠面板 | v0.5 replay mode |
| **`{allow,deny,transform,requireApproval}` 4 元 policy** | StagePolicy + ToolSlot.policy | ✅ v0.4.2 type；UI v0.4.3 |
| **`<role>`/`<boundaries>` 分槽** | 7 槽 AgentSystem | v0.4.4 |
| **失败时强制反思 prompt** | ReasoningSlot.errorReflectTemplate | v0.4.5 |
| **Few-shot examples in tool def** | ToolSlot.examples | v0.4.3 |
| **每步 trace 显式产出** | 已存在于 v0.3.0-a session tree | v0.5 加强 |

## 七、与之前路线图的一致性

之前的路线图 v3 的 6 阶段流水线 = **Layer 2 的实现细节**。
3 层 = 6 阶段的**外延**（加上 Gateway 在最前面、Tool Calling 在最后面）。
7 槽 = 6 阶段的**配置维度**（用户编辑的每一面）。
8 干预点 = 7 槽 + Gateway 权限 + HITL 的**清单**。

它们相互一致：

```
Layer 1 (Gateway, 审计) ──── 7 槽作为 Layer 2 的可配置维度 ──── Layer 3 是具象
       │                            │                                  │
   entry / auth              6 阶段 pipeline                    tool schema / exec
       └────────────────────────┴──────────────────────────────────┘
                                    │
                            8 个干预点（用户的清单）
```

## 八、v0.4.2 范围的最终定版

按计划实施，不变：
1. **Project Context Auto-loader** — Retrieval 阶段的具体实现（Layer 2）
2. **Tool Inventory (read-only)** — ToolSlot 的只读视图（Layer 3）
3. **6 阶段数据骨架** — Layer 2 抽象
4. **7 槽 type 定义**（**新增**）— 但 v0.4.2 只 type，不 UI

**Web UI 范围**（v0.4.2）：
- `/context` — Project Context 列表
- `/tools` — Tool Inventory 只读视图
- **`/settings/agent` 留空页**（结构占位，v0.4.4 填实）

不改路线图节奏。这次的"3 层 + 7 槽 + 8 干预点"是**架构清晰化**，不是 scope 调整。

## 九、决定下一步

如果你 OK，我现在开 v0.4.2：
- `core/stages.ts` — 6 阶段 + 7 槽 type
- `core/project-context.ts` — auto-discoverer
- `core/tool-inventory.ts` — read-only lister
- `commands/context.ts` — CLI: context ls/show
- `commands/tool-list.ts` — CLI: tool ls/inspect
- Web: `/context` + `/tools` 页面
- 测试 + build + release

如果想调整 8 干预点在 v0.4.x 路线图中的位置 / 时间，告诉我。
