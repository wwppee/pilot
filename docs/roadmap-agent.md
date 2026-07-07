# Agent Roadmap: 自主智能体能力层

> Pilot 从"Pi 的管理面板"进化为"自主智能体工具"。
>
> 核心理念：**Pilot 不运行 LLM，但能规划、编排、调度 Pi 的执行——让 Pi 在 Pilot 设定的框架内自主完成复杂任务。**

## 设计哲学

Pilot 的 Agent 能力层遵循以下原则：

1. **Pilot 规划，Pi 执行** — Pilot 做任务分解、工具选择、流程编排；Pi 做实际的代码生成和工具调用
2. **工具层干涉** — Pilot 直接修改 Pi 的 settings.json、extensions、profiles 来改变 Pi 的行为，不需要 Pi 主动配合
3. **闭环反馈** — 执行结果回流到 Pilot，用于调整下一步计划
4. **可观测可干预** — 用户始终能看到 Plan 的当前状态、每一步的结果、并可手动干预
5. **渐进式自主** — 从手动编排 → 半自动（Pilot 建议，用户确认）→ 全自动（Pilot 自主循环）

## 四阶段能力模型

```
┌─────────────────────────────────────────────────────────┐
│                    Layer 4: 自主循环                      │
│   Plan → Execute → Observe → Adapt → Loop              │
│   Pilot 自主驱动多轮执行，根据反馈调整计划               │
├─────────────────────────────────────────────────────────┤
│                    Layer 3: 反馈适应                      │
│   执行结果分析 · 错误分类 · 路线重规划 · 工具替换       │
│   "这一步失败了，换一种方式重试"                         │
├─────────────────────────────────────────────────────────┤
│                    Layer 2: 流程编排                      │
│   步骤时序 · 条件分支 · 并行执行 · 依赖管理             │
│   "先装包、再写代码、最后跑测试"                         │
├─────────────────────────────────────────────────────────┤
│                    Layer 1: 任务规划                      │
│   目标分解 · 工具选择 · 资源评估 · Profile 匹配          │
│   "这个任务需要哪些工具，用哪个 Profile"                 │
└─────────────────────────────────────────────────────────┘
```

## v0.6.0 — Plan 数据模型 + 基础规划

### 核心数据结构

```
Plan (计划)
├── id: string
├── goal: string                    // 用户的目标描述
├── status: "draft" | "running" | "paused" | "completed" | "failed"
├── strategy: "sequential" | "parallel" | "adaptive"
├── tasks: Task[]                   // 任务列表
├── context: PlanContext             // 执行上下文
├── createdAt / updatedAt: string
└── result: PlanResult?             // 最终结果摘要

Task (任务)
├── id: string
├── description: string             // 做什么
├── status: "pending" | "running" | "completed" | "failed" | "skipped"
├── steps: Step[]                   // 执行步骤
├── dependsOn: string[]              // 依赖的 task id
├── profile?: string                // 推荐使用的 profile
├── requiredTools: string[]         // 需要的工具
├── estimatedTokens?: number        // 预估消耗
└── result: TaskResult?

Step (步骤)
├── id: string
├── action: StepAction              // 具体动作
├── status: "pending" | "running" | "completed" | "failed"
├── input: Record<string, unknown>  // 输入参数
├── output?: StepOutput             // 执行结果
├── error?: string                  // 错误信息
└── retryCount: number

StepAction (动作类型)
├── type: "pilot_command"           // 调用 Pilot 命令
│   └── command: string, args: string[]
├── type: "pi_session"              // 启动 Pi 会话
│   └── prompt: string, profile?: string
├── type: "profile_switch"          // 切换 Profile
│   └── profile: string
├── type: "pack_install"           // 安装包
│   └── source: string
├── type: "policy_apply"            // 应用策略
│   └── policy: string
├── type: "condition"               // 条件判断
│   └── check: string, then: Step[], else: Step[]
├── type: "wait"                    // 等待外部条件
│   └── condition: string, timeout: number
└── type: "manual"                  // 需要人工介入
    └── prompt: string
```

### API 端点

```
# Plan CRUD
POST   /plans                    # 创建新计划
GET    /plans                    # 列出所有计划
GET    /plans/:id                # 获取计划详情
PUT    /plans/:id                # 更新计划
DELETE /plans/:id                # 删除计划

# Plan 执行
POST   /plans/:id/start          # 开始执行
POST   /plans/:id/pause          # 暂停
POST   /plans/:id/resume         # 恢复
POST   /plans/:id/cancel         # 取消

# Task 操作
POST   /plans/:id/tasks/:taskId/retry    # 重试失败任务
POST   /plans/:id/tasks/:taskId/skip    # 跳过任务
PUT    /plans/:id/tasks/:taskId         # 手动更新任务

# 工具选择（基于上下文推荐）
POST   /plans/suggest-tools              # 根据目标推荐工具组合
POST   /plans/suggest-profile            # 根据任务推荐 Profile
```

### CLI 命令

```bash
pilot plan new "实现用户登录功能"          # 创建计划
pilot plan ls                             # 列出计划
pilot plan show <id>                       # 查看计划详情
pilot plan run <id>                        # 执行计划
pilot plan pause <id>                      # 暂停
pilot plan resume <id>                     # 恢复

pilot plan suggest-tools "解析 CSV"        # 推荐工具
pilot plan suggest-profile "code-review"   # 推荐 Profile
```

## v0.7.0 — 自适应执行 + 反馈循环

### 反馈适应引擎

```typescript
interface FeedbackEngine {
  // 分析步骤执行结果
  analyzeStepResult(step: Step, output: StepOutput): StepVerdict;

  // 根据错误类型建议恢复策略
  suggestRecovery(step: Step, error: string): RecoveryStrategy;

  // 评估整体计划进度
  evaluateProgress(plan: Plan): ProgressReport;
}

type StepVerdict =
  | { status: "pass" }
  | { status: "fail"; reason: string; recoverable: boolean }
  | { status: "partial"; completed: string[]; remaining: string[] };

type RecoveryStrategy =
  | { type: "retry"; maxAttempts: number }
  | { type: "alternative"; alternativeSteps: Step[] }
  | { type: "skip"; reason: string }
  | { type: "escalate"; requiresHuman: boolean }
  | { type: "replan"; affectedTasks: string[] };
```

### 执行引擎

```typescript
interface PlanExecutor {
  // 执行一个计划（可能是多轮）
  execute(plan: Plan): AsyncIterable<PlanEvent>;

  // 单步执行
  executeStep(step: Step, context: ExecutionContext): Promise<StepOutput>;

  // 暂停 / 恢复
  pause(planId: string): Promise<void>;
  resume(planId: string): Promise<void>;
}

type PlanEvent =
  | { type: "plan_started"; planId: string }
  | { type: "task_started"; taskId: string }
  | { type: "step_started"; stepId: string }
  | { type: "step_completed"; stepId: string; output: StepOutput }
  | { type: "step_failed"; stepId: string; error: string }
  | { type: "task_completed"; taskId: string; result: TaskResult }
  | { type: "plan_completed"; planId: string; result: PlanResult }
  | { type: "plan_failed"; planId: string; error: string }
  | { type: "waiting_human"; stepId: string; prompt: string };
```

## v0.8.0 — 工作流模板 + 组合复用

### 工作流模板

```typescript
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  // 模板参数 — 使用时填充
  parameters: TemplateParameter[];
  // 模板定义的任务图
  tasks: TaskTemplate[];
  // 适用条件
  applicableWhen: string;  // 自然语言描述
}

// 从历史 Plan 中提取模板
function extractTemplate(plan: Plan): WorkflowTemplate;
// 用模板 + 参数生成具体 Plan
function instantiatePlan(template: WorkflowTemplate, params: Record<string, string>): Plan;
```

### 内置模板

| 模板 | 描述 | 典型步骤 |
|------|------|----------|
| `code-review` | 代码审查 | 分析变更 → 检查 lint → 检查测试 → 生成报告 |
| `bug-fix` | Bug 修复 | 复现 → 定位 → 修复 → 验证 → 提交 |
| `feature-impl` | 功能实现 | 分析需求 → 设计 → 编码 → 测试 → 文档 |
| `refactor` | 代码重构 | 分析依赖 → 制定计划 → 逐步重构 → 验证 |
| `onboard-pkg` | 包接入 | 搜索 → 检视 → 安装 → 配置 → 验证 |

## v0.9.0 — 多 Plan 编排

### Plan 组合

```typescript
interface PlanComposition {
  id: string;
  name: string;
  plans: string[];           // 子 Plan ID
  dependencies: Dependency[]; // Plan 间依赖
  strategy: "sequential" | "parallel" | "dag";
}

interface Dependency {
  from: string;  // Plan ID
  to: string;    // Plan ID
  condition: "completed" | "completed_successfully" | "any";
}
```

## 存储

```
~/.pilot/
├── plans/                    # Plan 持久化 (TOML)
│   ├── <id>.toml
│   └── _templates/            # 工作流模板
│       └── <id>.toml
├── plans-history/             # 执行历史 (JSONL)
│   └── <plan-id>_<timestamp>.jsonl
└── runtime/
    └── plans/                 # 运行时状态 (JSON)
        └── <plan-id>.json     # 当前执行状态快照
```

## 与现有功能的关系

| 现有功能 | Agent 层如何使用 |
|---------|-----------------|
| **Profile** | Plan 中的 Task 可指定推荐 Profile；执行前自动切换 |
| **Pack** | Plan 的 tool 依赖自动触发 pack 安装 |
| **Policy** | 高风险 Task 可临时启用安全策略 |
| **Avatar** | Plan 可基于 Avatar 的配置快照确定执行环境 |
| **Compose** | Plan 执行结果可视化展示在 Compose 画布 |
| **Session** | Pi session 的执行结果回流到 Plan 的 Step output |
| **Capability** | Plan 根据目标匹配可用 Capability 组合 |
| **pilot-tools** | Pi 在执行 Plan 步骤时可通过 pilot-tools 回调 Pilot |

## 与原路线图的关系

原路线图的三段式（看见 → 管理 → 进化）不变。Agent 能力层是"进化 Pi"的具体实现路径：

| 原计划 | Agent 层对应 |
|--------|------------|
| v0.5.0 Avatars | Avatar 为 Plan 提供执行环境快照 |
| v0.6.0 Pi extension | pilot-tools 让 Pi 在执行中回调 Pilot |
| v0.7.0 多 Pi 编排 | 多 Plan 并行编排 = 多 Pi 协同 |

Agent 层不替代原计划功能，而是在其基础上增加**规划、编排、自适应执行**的能力。
