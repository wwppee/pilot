# Pilot Vision

> Pilot 是 Pi 的**管理平面**：它不运行 agent，只管理 Pi 的包、会话、profile、消耗、健康状态和能力组合。
>
> Pi 跑活，Pilot 管 Pi。Forge 让 Pi 吸收扩展生态，Avatars 让不同会话树拥有不同能力。

## 1. 是什么 / 不是什么

### Pilot 是

- **管理平面（management plane）** — 提供 CLI、Local Web UI、Pi extension 三种入口
- **可观测性 + 治理** — 看得见 Pi 在干什么、花了多少、是否健康
- **能力组合 + 沉淀** — 把扩展生态消化成 capability，可组装、可评测、可复用
- **开发者工具** — 面向写代码的人，不是给非技术用户的"AI 平台"

### Pilot 不是

- **不是另一个 agent runtime** — 不写代码、不调用 LLM、不替代 Pi
- **不复制 Pi runtime state** — `~/.pi/agent/` 永远是 source of truth
- **不抓取闭源产品内部实现** — 只复刻"公开可观察的工作流行为"
- **不是 Coze / Dify 类的低代码平台** — 目标用户是开发者
- **不替用户决定** — Pilot 提供工具和评测，不规定最佳实践

## 2. 边界（重要的）

### `~/.pi/agent/`（Pi 拥有，Pilot 读取为主）

```
extensions/         # Pi 直接读，写入由 pi install 完成
skills/             # 同上
prompt-templates/   # 同上
themes/             # 同上
sessions/           # Pi 写入，Pilot 只读
settings.json       # Pi 拥有，Pilot 读取，**写入需用户显式 apply**
models.json         # Pi 拥有，Pilot 读取，写入需显式 apply
```

### `~/.pilot/`（Pilot 自己维护，不污染 Pi）

```
teams/                # Meta-pack TOML（v0.2）
profiles/             # 命名 profile（v0.3）
capabilities/         # 能力库（v0.4）
avatars/              # 分身配置（v0.5）
cache/                # npm registry 缓存、UI 临时数据
logs/                 # Pilot 自己日志
```

### `<cwd>/.pilot/`（项目级，gitignore 友好）

```
profile.toml          # 项目级 profile 覆盖（v0.3）
forge-state.json      # 当前项目的能力使能快照（v0.4）
runtime/              # 临时 runtime 隔离（v0.5，Avatars 运行时用）
```

**关键原则**：

- Pilot **不** 复制 Pi 的 session、package、model、settings
- Pilot **可以** 创建自己的配置目录、缓存、能力库
- Profile 默认用 overlay，**不直接 patch 全局 settings.json**
- 只有用户显式执行 `pilot profile apply` / `pilot avatar install` 时，才写入 `~/.pi/agent/`

## 3. 为什么需要"管理平面"

Pi 的设计哲学是**极简 + 可扩展**：4 个原子工具（read/write/edit/bash）、<1000 token system prompt，所有"非核心"功能通过 extensions、skills、prompt templates、themes、packages 扩展。

这种克制让 Pi 跑得快、稳定、透明，但也留下了 10 个明显的管理缺口：

1. 4624+ 包，终端内没法按场景筛选
2. 同类包互斥（如 subagent 三个 fork）没有冲突检测
3. 会话堆积，没法全文搜索
4. 项目级 model/extension 切换要手动改环境变量
5. Token 消耗没统计
6. 包是否真在用、调用频率，无遥测
7. 多个 Pi 实例（团队 / 服务端 / 本地）没法编排
8. Settings.json 写错要重启 pi 才发现
9. 没有"包组合"概念（subagent + lens + simplify 要一个个装）
10. 没有健康检查

**Pilot 把这些缺口统一在一个 CLI / Web UI 下**。它**不**和 Pi 抢 agent runtime 的位置，只在 Pi 之外提供"治理 + 可视化 + 组合"。

## 4. 长期形态：能力操作系统

从 v0.4 开始，Pilot 不只是"管理工具"，而是 Pi 的**能力操作系统**：

```
外部 Pi 扩展生态
       ↓
   Forge（能力工厂）
   ├─ 检索 / 沙箱安装 / 行为探测
   ├─ 能力规格化
   ├─ 评测 harness
   └─ 内化（L1 → L4）
       ↓
   Capability Store（能力库）
   ├─ capability spec
   ├─ sources / 内化等级
   ├─ eval 分数 / 冲突图
   └─ 版本历史
       ↓
   Avatars（分身）
   ├─ pi-architect: plan-mode + design-doc + subagent
   ├─ pi-fixer: tdd + debugger + test-runner
   ├─ pi-reviewer: code-review + security-gate
   └─ pi-researcher: long-context + rag + citation
       ↓
   Session Tree（带 capability snapshot）
   └─ 每个节点记录当时启用的能力 + 模型
```

详细设计见 [`docs/forge-and-avatars.md`](./forge-and-avatars.md)。

## 5. 离线 / 在线行为

| 行为 | 是否需要 Pi 在跑 | 是否需要网络 |
|---|---|---|
| 读取 `~/.pi/agent/sessions/` 历史 | ❌ Pi 不需要跑 | ❌ |
| 打开 Web UI | ❌ | ❌ |
| 读 settings / models | ❌ | ❌ |
| 读 / 写 `~/.pilot/` 自己的数据 | ❌ | ❌ |
| 安装 / 卸载包 | ✅ 需要 `pi` 在 PATH | ✅ npm registry |
| 执行 agent 任务 | ✅ Pi 必跑 | ✅ LLM API |
| Forge 自动生成 | ✅ Pi 必跑（被调用方） | ✅ LLM API |
| Eval 跑工程任务 | ✅ Pi 必跑 | ✅ LLM API（可选） |

**结论**：Pilot 的**查看、整理、治理能力可以离线**；**执行、安装、生成能力需要 Pi + 网络**。Pilot **不会**把自己伪装成 Pi runtime 来执行 agent 任务。

## 6. 一句话（多版本，按场景用）

**完整版**（vision.md / 演讲）：
> Pilot 是 Pi 的管理平面：它不运行 agent，只管理 Pi 的包、会话、profile、消耗、健康状态和能力组合。Pi 跑活，Pilot 管 Pi；Forge 让 Pi 吸收扩展生态，Avatars 让不同会话树拥有不同能力。

**README 短版**：
> Pi 跑活，Pilot 管 Pi。Pilot 管包、管会话、管 profile、看消耗、做体检，并把扩展生态沉淀成可组合的 Pi 能力。

**Tweet 版**：
> Pilot = Pi 的管理平面 + 能力操作系统。CLI / Web UI / Extension 三入口，包 / 会话 / profile / 消耗 / 体检 / 能力组合全覆盖。开源。