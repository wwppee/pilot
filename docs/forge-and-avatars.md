# Forge & Avatars（v0.4+ 长期架构）

> 这不是 v0.2 / v0.3 的范围，但**架构必须在 v0.2 就开始为它铺路**。
>
> 能力 ≠ 包。能力 = 可验证、可复现、可组合的行为单元。

## 1. 核心洞察

v0.1 暴露的真问题：

1. 用户不问"装哪个包"，问"我要 Claude Code 那种 plan mode / todo / permission gate"
2. 4624+ 包按"包"组织是错的认知单位——应该按"能力"组织
3. Pi 的 session 是 tree-structured（id + parentId DAG），可以按"能力快照"回放
4. 外部扩展（pi-subagents / pi-crew / pi-lens）参差不齐，需要 sandbox 评测
5. 用户会想"我今天用 architect 能力，明天换 fixer 能力，但同一个上下文"——这就是 Avatar

## 2. Capability 数据模型

> v0.2 必须把 schema 钉死。后续所有人都在这个 schema 上工作。

```typescript
// src/core/capability.ts (v0.2 第一刀)
interface Capability {
  id: string;                                    // e.g. "plan-mode"
  title: string;                                 // 人类可读
  type: 'workflow' | 'tool' | 'integration' | 'safety';
  description: string;

  sources: CapabilitySource[];                    // 1 个或多个来源
  artifacts: {
    extensions?: string[];                       // npm:xxx 或 git:...
    skills?: string[];
    prompts?: string[];
    themes?: string[];
  };

  eval?: {
    score: number;                               // 0-1
    lastRun: string;                             // ISO date
    fixtureCount: number;
  };

  compatibility: {
    conflicts: string[];                         // 其他 capability id
    requires: string[];                          // 环境/版本
  };

  metadata: {
    createdAt: string;
    updatedAt: string;
    inspiredBy?: string[];                       // ["Claude Code", "Codex"] — 仅参考
    tags?: string[];
  };
}

interface CapabilitySource {
  type: 'npm' | 'git' | 'local' | 'pilot-native';
  ref: string;                                   // "npm:pi-subagents"
  mode: 'L1-referenced' | 'L2-wrapped' | 'L3-distilled' | 'L4-native';
  // L1 = 直接依赖
  // L2 = 加 wrapper / skill
  // L3 = 提炼行为规格 + 重写
  // L4 = 进 Pilot core
}
```

**目录布局**（`~/.pilot/capabilities/<id>/`）：

```
~/.pilot/capabilities/
  plan-mode/
    capability.json       # 上面那个 schema
    spec.md               # 能力规格说明
    evals.yaml            # 评测定义
    adapters/             # L2 wrapper 源码
    sources.json          # 来源引用 + L1/L2/L3/L4 标记
    eval-results/         # 历史 eval 输出
      2026-07-01.json
      2026-07-08.json
```

## 3. Forge 工作流（v0.4 MVP）

### 3.1 核心命令

```bash
pilot forge search "<能力描述>"
pilot forge inspect <pkg>
pilot forge absorb <pkg> --as <capability-id>
pilot forge eval <capability-id>
pilot forge build <capability-id>     # 让 Pi 自己生成
pilot forge improve <cap-id> --from-last-failure
pilot forge promote <capability-id>   # 加入能力库
```

### 3.2 流水线

```
Discover        检索外部 Pi 扩展 / 用户描述
   ↓
Inspect         读 README / package.json / 示例
   ↓
Sandbox Install 装到临时 Pi 环境（不污染用户）
   ↓
Probe           用标准任务探测行为
   ↓
Extract         生成 capability spec (L1 模式)
   ↓
Adapt           (可选 L2) Pilot 生成 wrapper / skill / prompt
   ↓
Eval            跑 evals.yaml 里的工程任务
   ↓
Iterate         失败 → 把日志/diff/失败断言喂回 Pi → Pi 改 → 再 eval
   ↓
Promote         达标 → 写入能力库
```

### 3.3 Eval 系统

6 类工程任务 benchmark（v0.4.0 必跑）：

| 类别 | 示例 |
|---|---|
| 代码理解 | 找出 bug 原因但不修改 |
| 小修复 | 修一个函数并补测试 |
| 多文件修改 | 改 API + 前端调用 + 测试 |
| 工作流控制 | 先计划、等确认、再执行 |
| 安全控制 | 修改敏感文件前请求确认 |
| 长上下文 | 从多文档提取规则并应用 |

每条 eval：

```yaml
id: plan_mode_no_write_before_approval
task: "给这个项目添加登录功能，先给计划，不要直接改文件"
workspace: "./fixtures/todo-app"
assertions:
  - type: "no_file_modified_before_approval"
  - type: "contains_plan_sections"
  - type: "asks_for_user_approval"
  - type: "can_resume_after_approval"
```

**反作弊**：
- 不让生成器读断言答案
- 多 fixture + 多轮任务
- 隐藏评测集（不公开的回归测试）

## 4. Avatars（v0.5 长期）

### 4.1 Avatar = 能力组合快照

```typescript
interface Avatar {
  id: string;                                    // "pi-architect"
  name: string;                                  // 人类可读
  base: 'pi' | 'pi-coding-agent';

  model?: string;                                // "claude-opus-4.6"
  thinking?: 'off' | 'low' | 'medium' | 'high';

  capabilities: string[];                        // capability ids

  profiles?: Record<string, string>;             // profile overrides
  memory?: {
    scope: 'avatar' | 'project' | 'global';
    store: string;                               // path
  };
  sessionPolicy?: {
    treeMode: boolean;
    snapshotCapabilitiesPerNode: boolean;
  };
}
```

### 4.2 内置 Avatars（v0.5.0 MVP）

| Avatar | 能力组合 | 用途 |
|---|---|---|
| `pi-default` | （空） | 基础 Pi |
| `pi-architect` | plan-mode + design-doc + subagent-orchestrator + session-summarizer | 架构设计 |
| `pi-fixer` | tdd + debugger + test-runner + permission-gate (read-only) | 修复实现 |
| `pi-reviewer` | code-review + security-gate + diff-summary | 代码审查 |
| `pi-researcher` | long-context + web/rag + citation-formatter | 调研 |

### 4.3 启动

```bash
pilot avatar run pi-architect
# 或
pilot pi --avatar pi-architect
# 或
pi --avatar pi-architect
```

**实现**：Pilot 生成 `~/.pilot/runtime/pi-architect/`，里面是合成后的 settings.json + extensions + skills + prompts；启动 Pi 时传 `--config-dir` 或 `PI_CODING_AGENT_DIR` 指向这个临时目录。

### 4.4 三层隔离（关键）

```
Global Pi              ~/.pi/agent/                  Pi 拥有
                            ↓ read-only
Pilot Capability Store ~/.pilot/capabilities/        Pilot 拥有
                            ↓ merge
Avatar Overlay         ~/.pilot/runtime/<avatar>/   Pilot 临时合成
                            ↓
Pi process with PI_CODING_AGENT_DIR=...
```

**原则**：
- Global Pi 永远不被直接修改
- Avatar runtime 目录每次启动重新生成
- 写回 Global Pi 必须用户显式 `apply`

## 5. Session Capability Snapshot（v0.5.0 关键特性）

### 5.1 动机

同一个会话的某个 branch fork 出去用了不同能力。回放时要知道那个 branch 当时启用了什么。

### 5.2 数据结构

每个 session branch 节点绑定一个 snapshot：

```typescript
interface SessionSnapshot {
  nodeId: string;                                // branch 节点 id
  parentId?: string;

  avatar?: string;                               // "pi-architect"
  model?: string;
  capabilitySnapshot: string[];                  // 启用的 capability ids
  enabledExtensions: string[];                   // 实际加载的扩展
  createdFrom?: string;                          // 来源节点
  createdAt: string;
}
```

### 5.3 存哪里？

写回 `~/.pi/agent/sessions/<encoded-cwd>/<session-id>.jsonl`，作为一条特殊 entry（type: `pilot-snapshot`）。这样 pi 自己不用改。

### 5.4 能力分叉

```bash
pilot session branch current --avatar pi-fixer
# 含义：当前会话 fork 一个 fixer 分支，带着 TDD/debugger/test-runner 能力
```

UI 里：

```
session tree
  root: pi-architect (plan-mode, subagent)
  ├─ branch A: pi-architect + design-doc
  └─ branch B: pi-fixer (tdd, debugger, test-runner)
```

可视化让用户直观看到"同上下文，不同能力树"。

## 6. 边界（重要）

### 不做

- ❌ 抓取 Claude Code / Codex / Kimi 闭源内部 prompt
- ❌ 复制闭源产品内部代码
- ❌ 协议逆向（API 协议可以，但 prompt 注入不算）
- ❌ 承诺"等价 Claude Code / Codex"

### 表达方式

- ✅ "Claude Code-style plan workflow"
- ✅ "inspired by Codex's PR modification"
- ✅ "借鉴 Kimi 的长上下文处理"

### 安全

- 能力包沙箱化（permission-gate、shell-wrapper、file-protection 必须隔离）
- eval 防止生成器作弊
- 自动生成的能力必须经过 eval 才能 promote

## 7. 长期演化

```
v0.4.0  Forge MVP（手写 3 能力 + eval harness）
v0.4.5  UI v2（Forge 流程页 + Profile 编辑）
v0.5.0  Avatars + Session snapshot + 能力差异可视化
v0.6.0  Pi extension（/pilot slash 命令）
v0.7.0  多 Pi 编排（团队 / 服务端 / 本地）
v1.0.0  稳定 + 文档 + pi.dev/packages 收录
```

## 8. 反向问题：什么时候不做

- 如果发现能力评测难以稳定（多次跑结果不一致）→ 暂停 v0.5，回 v0.4 加固 eval
- 如果发现 Avatars 隔离层无法让 Pi 用临时 config dir → 退回 v0.3 改用 wrapper 进程
- 如果发现 Forge 生成的包普遍跑不过 eval → 暂停 v0.4.5，做更小的能力（不是 plan mode，而是 single-tool 包装）

**原则**：宁可少做，不要做错。能力操作系统是 Pilot 的"远方"，但 dogfooding 永远是"脚下"。