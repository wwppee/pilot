# Pilot v1.0 — 箱庭 Cockpit + Agent 系统（v3 终极版）

> 把路线图收口到一句话：**现代 canvas 骨架 + 2.5D 箱庭皮肤 + 真实 Web UI 操作层**，承载一个 **6 阶段 agent 系统** —— 每个阶段都是可拼插的方块，用户只说一句话，agent 就能**自己改自己**。

## 一、6 阶段 Agent 系统（核心抽象）

把 agent 当 6 阶段流水线，每阶段都是**可拖拽方块**：

```
[请求] → [策略 Gate] → [规划器] → [上下文检索] → [工具选择] → [执行器] → [校验器] → [输出]
   │         │           │            │             │            │           │          │
   │         │           │            │             │            │           │          │
  输入    风险拦截    任务拆解     CLAUDE.md     tool list    沙箱/网      测试      模板
                                          历史/RAG    policy     络/文件   审计/HITL    过滤
```

### 每阶段的接口（type-safe）

```typescript
interface Stage<TInput, TOutput> {
  // 阶段身份
  id: StageId;             // 'strategy' | 'planner' | 'retrieval' | 'toolSelector' | 'executor' | 'validator' | 'output'
  block: BlockRef;          // 哪个方块实现（默认 / 用户 override）

  // 核心逻辑
  execute(input: TInput, ctx: StageContext): Promise<TOutput>;

  // 控制
  policy: StagePolicy;      // allow / deny / transform / requireApproval
  hooks: { before?: HookFn; after?: HookFn };

  // 观测
  metrics: StageMetrics;    // 调用次数 / 平均耗时 / token / 错误率
}

type StagePolicy =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'requireApproval'; approver: 'user' | 'rule' }
  | { kind: 'transform'; rule: string };
```

### 默认实现（v0.4.2 起步）

| 阶段 | 默认行为 | v0.4.2 数据源 |
|------|---------|--------------|
| 策略 Gate | 关键词 + path 黑名单 | (v0.4.3) |
| 规划器 | 单步（不拆解） | (v0.4.4) |
| **上下文检索** | 加载 Project Context（auto-discover） | ✅ v0.4.2 — Project Context Auto-loader |
| **工具选择** | 读 Profile.tool_whitelist | ✅ v0.4.2 — Tool Inventory (read-only) |
| 执行器 | Pi 原生（无沙箱） | (v0.5) |
| 校验器 | 信任模型 | (v0.5) |
| 输出 | 直通 | (v0.4.6) |

**v0.4.2 落地其中 2 个阶段**，但 type/接口/可观测性都先建好，让 v0.4.3+ 在同一个骨架上加新阶段。

## 二、Memory + 约束 + 权限 = First-class 方块

按用户提的 6 个维度独立设方块：

| 方块类型 | 控制什么 | v0.4.2 是否实现 |
|---------|---------|---------------|
| **Model** ⭐ | 选定模型（opus / sonnet / haiku / 自定义 endpoint）| (v0.4.4) |
| **Instruction** ⭐ | 系统提示（多版本，可切换）| (v0.4.4) |
| **Tool** ⭐ | 工具白名单/黑名单 + policy | ✅ read-only inventory |
| **Memory** ⭐ | 多层记忆：working / episode / semantic + compression 策略 | (v0.4.6) |
| **流程** ⭐ | 6 阶段编排（gate / planner / validator 等）| ✅ 数据模型 v0.4.2 |
| **权限控制** ⭐ | 哪个动作要人工确认 / 沙箱 / redact | (v0.4.5) |

每个方块都是**可单独启停 / 替换**的扩展开关，不是 monolith 配置。

## 三、自我迭代（Meta-agent）

> 用户只说一句话，agent 自己改自己。

### 场景 1：用户说"以后不要用 bash 改 .ts 文件"
```
用户 → Meta-agent
  ↓
解读：识别"改 .ts 文件"是高风险动作，"不要用 bash"是工具策略变更
  ↓
定位：Tool Selector 阶段 + Executor 阶段
  ↓
提议修改：
  - Tool Selector.policy.filter: 把 'edit .ts via bash' 标 deny
  - Executor.policy.requireApproval: 对 '.ts 后缀文件 + bash' 的组合要求确认
  ↓
评估：dry-run 跑 N 个测试 session，看是否引入 regression
  ↓
apply（用户可一键 revert）
  ↓
写入到 Capability.lessons: "用户偏好：避免用 bash 改 .ts"
```

### 场景 2：用户说"输出更简洁"
```
Meta-agent
  → 定位 Output Formatter
  → 提议：output.template.terse = true
  → eval 5 条历史 session，对比 token / 长度 / 完整度
  → apply
```

### 场景 3：用户说"工具调用失败别立刻重试"
```
Meta-agent
  → 定位 Executor
  → 提议：executor.retry.strategy = 'exponential-backoff'
  → eval: 对比"立即重试" vs "指数退避" 的 7 天历史
  → apply
```

### 实现：Meta-agent 本身是一个 6 阶段 agent，但它读 / 写的是 Agent System（不是工具调用）

```
Meta.request → Meta.strategy(是否需要修改) → Meta.planner(改哪个阶段哪个方块) →
Meta.retrieval(查 sessions / eval data) → Meta.toolSelector(实际改 TOML) →
Meta.executor(写回 + 重启) → Meta.validator(regression test) → Meta.output(diff 报告给用户)
```

**关键**：
- 任何修改都不是 unilateral；用户必须 approve（除非修改是 trivial / dry-run 验证过的）
- 修改历史 + diff + eval 结果都在 WebUI 上展示
- 一键 revert

## 四、v0.4.x → v1.0 重排

```
v0.4.2  Project Context Auto-loader + Tool Inventory (read-only)
        + 6 阶段数据模型 (type/接口先建好，跑通 2 个阶段)
        + 视觉仍是现代 SaaS，无箱庭
        ── 输出：6 阶段的"地基" + 用户能看到"环境"

v0.4.3  Tool Policy (UI 化) + Tool Call Trace
        + 策略 Gate 阶段 (关键词/path 黑名单 UI)
        + Impact 分析基础 (有没有这个 stage 的差别)
        ── 输出：用户能"管"前 3 个阶段

v0.4.4  箱庭 Compose MVP (modern canvas 骨架，无 2.5D)
        + 6 阶段方块 + 5 类原件方块
        + Model / Instruction 方块
        ── 输出：用户能"搭"agent

v0.4.5  Compose → Save as Profile (functional effect)
        + 2.5D isometric skin
        + 实时 Run 模式（方块亮起、tool 红绿黄）
        ── 输出：箱庭开始有功能

v0.4.6  Memory 方块 + Context Compression 策略 (Hermes-like 前置)
        + Validator + Output Formatter 阶段
        ── 输出：6 阶段全在线

v0.5    Replay mode + A/B diff + Subagent tree 可视化
        + 6 阶段 trace 可视化（每步是哪阶段）
        + Error recovery per stage (Hermes)
        ── 输出：箱庭"活"起来 + 完整可观测

v0.6    Stats heatmap (per-stage metrics)
        + Tool 编排 (tool A → tool B 合成宏)
        + Humane UX 收尾（⌘K / onboarding）
        ── 输出：可量化

v0.7    自我迭代 meta-agent MVP（用户说一句话 → agent 提议改动 → dry-run → apply）
        + 修改历史 / diff / 一键 revert
        ── 输出："只说一句话就能迭代自己"成立

v1.0    Agent 系统完整 (6 阶段 + Memory + Permission + Self-iteration)
        + 2.5D 皮肤全应用
        + Hermes-equivalent: 错误恢复在每个阶段都有
        + 上下文压缩策略可视化
        + GA
        ── 输出：完整 agent 操作系统
```

## 五、不做（明确边界 v1.0 之前）

- ❌ 真正的 marketplace / 云端 registry（v1.0 之后）
- ❌ 实时协作 / 多用户（v2.0+）
- ❌ 云同步（本地优先）
- ❌ 自训模型 / fine-tuning 集成
- ❌ 复杂的多 agent 协作（subagent 已经是极限）
- ✅ 单用户、本地、Pi-runtime-first 是 v1.0 之前的不变目标

## 六、第一个具体 deliverable（v0.4.2）

按计划做 **Project Context Auto-loader + Tool Inventory (read-only)**，但要在数据模型层引入 6 阶段抽象：

### Web UI

| 页面 | 内容 |
|------|------|
| `/context` | Project Context 列表（CLAUDE.md / AGENTS.md / README / .cursor/rules）<br>+ 每条 byte 数 / 上次修改 / toggle / impact 摘要 |
| `/tools` | 当前 profile 启用的所有 tool 列表<br>+ 每个 tool：来源 / safety / 最近调用 / 调用次数 |
| `/sessions/[id]`（升级）| session tree + 每步标注属于 6 阶段哪一阶段（v0.4.2 用启发式推断，v0.4.3+ 真接入阶段 trace）|

### 后端

```typescript
// core/stages.ts — 6 阶段 type
export type StageId = 'strategy' | 'planner' | 'retrieval' | 'toolSelector' | 'executor' | 'validator' | 'output';

// core/project-context.ts — auto-discoverer
export async function discoverProjectContext(cwd: string): Promise<ProjectContextRef[]>
// 找 CLAUDE.md / AGENTS.md / README.md / .cursor/rules / package.json#pi
// 返回：路径、byte 数、mtime、前 200 字符 preview

// core/tool-inventory.ts — read-only tool listing
export async function listToolInventory(profile: Profile): Promise<ToolInventoryItem[]>
// 用 Profile.tool_whitelist / extension 提供的 tool 元数据
// 每个 tool：name / 来源 (built-in / extension) / safety / 累计调用
```

### CLI

```bash
pilot context ls              # list discovered project context
pilot context show <name>     # full content + impact 摘要
pilot tool ls                 # current profile's tool inventory
pilot tool inspect <name>     # detail: 来源 / safety / 最近调用
```

### 测试

- 单元：discoverProjectContext 在 fixture 目录上返回正确清单
- 单元：listToolInventory 对 L1-only profile 返回 built-in tools
- 集成：CLI 在 `/tmp/forge-test/.pilot` 上跑通

## 七、需要你拍板

1. **路线图分阶段**（v0.4.2 → v1.0 共 8 个版本）有要调整的吗？
2. **6 阶段抽象**这个核心 schema 同意吗？还是你想加 / 减阶段？
3. **自我迭代**这个 meta-agent 我放在 **v0.7**，位置太晚吗？还是想拉前到 v0.5？
4. **先开干 v0.4.2**？（按计划 = Project Context + Tool Inventory + 6 阶段数据骨架）
