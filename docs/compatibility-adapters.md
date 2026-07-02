# Pilot 兼容性架构 — 兼容嫁接 OpenClaw 和 Hermes

> **核心思想**：3 层架构的每一层都暴露一个 **adapter 接口**。Pilot 提供原生实现，OpenClaw 和 Hermes 作为**可选替换实现** register 进来。用户的栈不被锁死。

## 一、3 个 Adapter 接口

### 1.1 GatewayAdapter（Layer 1）

```typescript
// core/adapters/gateway-adapter.ts
export interface GatewayAdapter {
  // 通道身份
  readonly id: 'cli' | 'web' | 'openclaw' | 'telegram' | 'slack' | 'feishu';
  readonly displayName: string;

  // ──── 启动 / 关闭 ────
  start(ctx: AdapterContext): Promise<void>;
  stop(): Promise<void>;

  // ──── 接收请求 ────
  // 不同的 adapter 用不同的 transport (stdin / HTTP / WebSocket / Bot webhook)
  // 但 PilotService 看到的是统一的 invoke
  invoke(request: NormalizedRequest): Promise<NormalizedResponse>;

  // ──── 会话管理 ────
  listSessions(filter?: SessionFilter): Promise<SessionMeta[]>;

  // ──── 多 agent 路由 ────
  route(request: NormalizedRequest): AgentSystemId;

  // ──── 权限 / 审计 ────
  checkPermission(channel: string, user: string, op: string): PermissionDecision;
  audit(event: AuditEvent): Promise<void>;
}
```

### 1.2 ToolCallProtocol（Layer 3）

```typescript
// core/adapters/tool-call-protocol.ts
export interface ToolCallProtocol {
  // ──── Tool schema 序列化 ────
  // 把 ToolSlot[] 序列化成这种协议要求的格式
  // e.g. hermes: <tools><tool name=...></tools>
  //      openai: { tools: [...] }
  //      anthropic: { tools: [{name, description, input_schema}] }
  formatTools(tools: ToolSlot[]): string;

  // ──── Tool call 解析 ────
  // 从模型输出里抽出 tool_call
  parseToolCall(modelOutput: string): ToolCall | null;

  // ──── Tool response 序列化 ────
  formatToolResponse(call: ToolCall, result: unknown): string;

  // ──── 推理块（reasoning / scratch_pad）───
  formatReasoning(reasoning: string): string;
  parseReasoning(modelOutput: string): { reasoning: string; toolCall: ToolCall | null };

  // ──── System prompt 分槽注入 ────
  // Hermes 用 <role>/<boundaries>，OpenAI 用 system 字符串
  formatSystemPrompt(slot: InstructionSlot): string;
}
```

### 1.3 Gateway Adapter 列表（实现清单）

| Adapter | 阶段 | 用途 |
|---------|------|------|
| **CLIGatewayAdapter** | ✅ v0.4.2（已有） | `pilot` 命令 |
| **WebGatewayAdapter** | ✅ v0.4.2（已有） | Next.js UI |
| **OpenClawAdapter** | 🆕 v0.4.5 | 把 Pilot 作为 agent 注册到 OpenClaw，反向让 Pilot 接受 OpenClaw webhook |
| **TelegramAdapter** | 🆕 v0.7+ | Telegram bot entry |
| **SlackAdapter** | 🆕 v0.7+ | Slack bot entry |

### 1.4 Tool Call Protocol 列表（实现清单）

| Protocol | 阶段 | 用途 |
|----------|------|------|
| **HermesToolProtocol** | 🆕 v0.4.3 | Hermes 风格 `<tools>` / `tool_call` / `<tool_response>` / `[scratch_pad]` |
| **OpenAIToolProtocol** | ✅ 已有（隐式）| `function_call` JSON（OpenAI/兼容） |
| **AnthropicToolProtocol** | ✅ 已有（隐式）| `tool_use` blocks |
| **MCPToolProtocol** | 🆕 v0.4.5 | MCP server 转 ToolSlot 的桥接 |

**关键**：用户选一个 model provider（OpenAI / Anthropic / Nous Hermes），Pilot 自动选对应的 protocol。**用户能 override**，比如用 Hermes 模型 + OpenAI protocol（如果他想要）。

## 二、OpenClaw 嫁接的两种模式

### 2.1 Pilot 在 OpenClaw 里（**Pilot 作为 Agent**）

OpenClaw 想用 Pilot 当 agent：

```yaml
# openclaw-agents.yaml
agents:
  - name: pilot-coding
    type: webhook
    url: http://127.0.0.1:17361/openclaw/invoke
    auth: bearer $PILOT_TOKEN
    capabilities: [code, research, ops]
    system_prompt_path: ~/.pilot/agents/coding-default.json
```

Pilot 暴露 `POST /openclaw/invoke` endpoint，接受 OpenClaw 调来的请求，把它当一个 WebGatewayAdapter 的请求处理。

### 2.2 OpenClaw 在 Pilot 里（**Pilot 作为 Gateway**）

Pilot 启动时 spawn 一个 OpenClaw gateway，可选：

```typescript
// 在 PilotService 里
const openclawGateway = new OpenClawAdapter({
  port: 17362,
  configPath: '~/.pilot/openclaw-gateway.yaml',
});
await openclawGateway.start();
```

这样 Pilot 直接提供 OpenClaw 兼容的多通道（CLI + Web + Telegram + ...），同时内部用 OpenClaw 的 routing/audit。

### 2.3 实现：v0.4.5 起，二选一

第一版 Pilot-to-OpenClaw 桥接做 **2.1 模式**（小，不搅乱内部架构）。2.2 模式如果用户要再说（v0.7+）。

## 三、Hermes 嫁接的 3 个深度

| 深度 | 做什么 | 何时 |
|------|--------|------|
| **L1 协议兼容** | 让 Pilot 用 Hermes `<tools>` / `tool_call` 格式跑 | ✅ v0.4.3 |
| **L2 推理模板** | 让 Pilot 提供 Hermes-style scratch_pad / plan-act-observe-reflect prompt template | v0.4.5 |
| **L3 Reasoning format parsing** | 解析模型输出里的 `[scratch_pad]...[/scratch_pad]` 块，前端单独渲染 | v0.5 |

**Pilot 默认的 ReasoningSlot 模板就是 Hermes-style**，其他格式可以 override。

## 四、对路线图的影响

### 4.1 v0.4.2 调整（最小）

新增（不影响的 scope）：
- `core/adapters/gateway-adapter.ts` —— GatewayAdapter 接口 type（不实现 OpenClaw/Telegram）
- `core/adapters/tool-call-protocol.ts` —— ToolCallProtocol 接口 type
- `core/protocols/hermes.ts` —— **stub 实现**（v0.4.3 填实）
- 已有 `core/claude-code/` / 隐式 OpenAI 调用 → 用适配器**而不是硬编码**

意思：v0.4.2 加 type，加一个 HermesProtocol stub 但不接模型（**数据层准备好，运行时延后**）。

### 4.2 v0.4.3 调整

加 HermesToolProtocol 实现：
- `formatTools(tools)` → 序列化 `<tools><tool>...</tool></tools>`
- `parseToolCall(output)` → 抽出 `tool_call { name, arguments }`
- `formatToolResponse(call, result)` → 格式化 `<tool_response>...</tool_response>`
- Web UI `/tools` 加 protocol switcher：`Hermes` | `OpenAI` | `Anthropic`

### 4.3 v0.4.5 调整

加 OpenClawAdapter 实现 + MCP：
- `core/adapters/openclaw.ts` —— 实现 GatewayAdapter，暴露 webhook endpoint
- `core/protocols/mcp.ts` —— 把 MCP server 转成 ToolSlot 注册到 Pilot
- `pilot gateway openclaw` —— 本地启动 OpenClaw 兼容网关（mode 2.2 的 MVP）

### 4.4 v0.4.6 调整

Memory + Skills 阶段接 Hermes 推理模板：
- `ReasoningSlot.errorReflectTemplate` —— 用 Hermes 的反思 prompt 模板
- `ReasoningSlot.planActObserveTemplate` —— plan → act → observe → reflect 四段式 prompt

### 4.5 v0.5 调整

Replay 模式 + per-stage trace 可视化（Hermes L3）：
- 前端拆 `[scratch_pad]...[/scratch_pad]` 和 `tool_call`，每个有独立折叠面板
- Reasoning timing / token / error 等指标按 Hermes 块的粒度统计

## 五、关键设计原则（避免兼容变成包袱）

### 5.1 Adapter 是可选的，不是 default

Pilot **自带完整原生实现**。OpenClaw / Hermes 只是"可换包装"。用户用默认就能工作。

### 5.2 协议无关 core

Pilot 的核心数据结构（ToolSlot, Stage, Session）必须**协议无关**。Hermes `<tools>` 是**序列化格式**，不是数据模型。数据模型只描述含义，序列化由 adapter 负责。

### 5.3 适配器可独立测试

每个 adapter 一个 describe block，输入已知，输出已知（用 fixture）。不依赖真实 model server。

### 5.4 跨协议可观测

如果一个 session 用了 Hermes protocol，A/B diff 出来也是 Hermes 格式可读。trace 统一存**结构化事件流**，UI 按需格式化。

### 5.5 不要试图 1:1 翻译

有些 Hermes 概念（如 scratch_pad）OpenAI 没有。**翻译会丢信息**。Pilot 的核心数据保留 reasoning 概念，让每个 protocol 把它的 native 字段映射过来。

## 六、最终愿景：Pilot 是个**协议无关的 agent 操作系统**

```
┌────────────────────────────────────────────────────────────┐
│  Pilot Core (协议无关)                                       │
│  7 槽 AgentSystem / 6 阶段 / sessions / audit / 调度          │
└────────────────────────────────────────────────────────────┘
    ▲                 ▲                  ▲
    │                 │                  │
┌───┴─────┐    ┌──────┴──────┐    ┌──────┴──────┐
│ OpenClaw│    │    Hermes    │    │  用户自己    │
│ Gateway │    │ Tool Protocol│    │  写的 adapter│
└─────────┘    └─────────────┘    └─────────────┘
   Layer 1         Layer 3
```

可以**完整兼容嫁接** OpenClaw（替代 Layer 1）和 Hermes（替代 Layer 3），同时不锁死用户的栈。

## 七、需要你拍板

1. **Adapter 策略**同意吗？（核心抽象 + 默认实现 + 兼容实现并存）
2. **OpenClaw 嫁接从 2.1 模式开始**（Pilot 作为 OpenClaw agent）可以吗？还是想直接做 2.2（Pilot 起 OpenClaw 网关）？
3. **Hermes L1 协议兼容放进 v0.4.3**？OK 吗？还是放到 v0.4.5 跟 MCP 一起？
4. **v0.4.2 现在加 2 个 adapter 接口 type**（纯 type，不实现），可以吗？还是想 v0.4.2 就直接实现 Hermes L1？
