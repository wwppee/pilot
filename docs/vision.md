# Pilot Vision

> Pilot 是 Pi 的 **Co-pilot**：它**不替代** Pi 跑活，但是 Pi 跑活的最佳搭档——Pilot 既能从外面看见和管理 Pi 的状态（包、会话、profile、消耗、能力），也能在 Pi 跑活的时候给它的 LLM 装上自己的一套工具，让 Pi 即装即用、即查即调。
>
> Pi 跑活，Pilot 管 Pi、帮 Pi、和 Pi 一起长。Forge 让 Pi 吸收扩展生态，Avatars 让不同项目拥有不同能力组合，`pilot-tools` extension 让 Pi 在会话内反过来调 Pilot 的命令。

## 1. 是什么 / 不是什么

### Pilot 是

- **Co-pilot（双向桥）** — 从外面看得见、管得了 Pi；同时也能进 Pi 的 LLM 工具栈，让 Pi 自己调 Pilot
- **管理平面（management plane）** — CLI、Local Web UI、`pilot-tools` extension 三种入口
- **可观测性 + 治理** — 看得见 Pi 在干什么、花了多少、是否健康
- **能力组合 + 沉淀** — 把扩展生态消化成 capability，可组装、可评测、可复用
- **开发者工具** — 面向写代码的人，不是给非技术用户的"AI 平台"

### Pilot 不是

- **不是另一个 agent runtime** — 不写代码、不调用 LLM、**不替代 Pi 跑活**。Pilot 提供工具让 Pi 跑得更好
- **不复制 Pi runtime state** — `~/.pi/agent/` 永远是 source of truth
- **不抓取闭源产品内部实现** — 只复刻"公开可观察的工作流行为"
- **不是 Coze / Dify 类的低代码平台** — 目标用户是开发者
- **不替用户决定** — Pilot 提供工具和评测，不规定最佳实践
- **不会偷偷改 Pi 的 system prompt** — pilot-tools extension 只暴露显式声明的工具，LLM 自己决定用不用

## 2. 边界（重要的）

### `~/.pi/agent/`（Pi 拥有，Pilot 通过 extension 协作）

```
extensions/         # Pi 直接读；pilot-tools 软链接到这里被 Pi 自动加载
skills/             # 同上
prompt-templates/   # 同上
themes/             # 同上
sessions/           # Pi 写入，Pilot 只读（jsonl-parser 解析）
settings.json       # Pi 拥有，Pilot 读取，**写入需用户显式 apply**
models.json         # Pi 拥有，Pilot 读取，写入需显式 apply
```

### `~/.pilot/`（Pilot 自己维护，不污染 Pi）

```
extensions/         # v0.5.4 NEW: pilot-tools.ts 的真源（source of truth）
                    # Pi 通过 ~/.pi/agent/extensions/pilot-tools.ts 软链到这里
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
- Pilot **可以** 创建自己的配置目录、缓存、能力库、extension 真源
- Pilot 通过软链把 extension 暴露给 Pi（Pi 的 extension 加载机制自动发现）
- Profile 默认用 overlay，**不直接 patch 全局 settings.json**
- 只有用户显式执行 `pilot profile apply` / `pilot avatar apply` 时，才写入 `~/.pi/agent/`

## 3. 为什么需要"Co-pilot"

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

**Pilot 把这些缺口统一在一个 CLI / Web UI / Extension 下**。但 v0.5.4 之前只有单向："PILOT 帮用户管 PI"。问题是——**用户在 Pi 里跑活时，缺口依旧存在**：

- 想装个新包 → 必须退出 Pi、CLI 装、重启 Pi
- 想切 profile → 同上
- 想看会话 → 必须退出 Pi、Web UI 翻
- 想抓 Avatar → 必须退出 Pi、CLI 跑

**v0.5.4 的 Co-pilot 模式解决这个**：通过 `pilot-tools` extension 把 Pilot 的命令暴露成 Pi 的 LLM 工具，Pi 跑活时可以反过来调 Pilot——装包、切 profile、抓 Avatar、补会话上下文，全程不用退出。

## 4. 长期形态：能力操作系统（不变）

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
       ↓
   Pilot-Tools Extension（v0.5.4 NEW）
   └─ 把上述所有能力反向暴露给 Pi 的 LLM 工具栈
```

详细设计见 [`docs/forge-and-avatars.md`](./forge-and-avatars.md)。

## 5. 离线 / 在线行为

| 行为 | 是否需要 Pi 在跑 | 是否需要网络 |
|---|---|---|
| 读取 `~/.pi/agent/sessions/` 历史 | ❌ Pi 不需要跑 | ❌ |
| 打开 Web UI | ❌ | ❌ |
| 读 settings / models | ❌ | ❌ |
| 读 / 写 `~/.pilot/` 自己的数据 | ❌ | ❌ |
| 安装 / 卸载包（CLI） | ❌ Pi 不需要跑（但需要 `pi` 在 PATH） | ✅ npm registry |
| 执行 agent 任务 | ✅ Pi 必跑 | ✅ LLM API |
| Forge 自动生成 | ✅ Pi 必跑（被调用方） | ✅ LLM API |
| Eval 跑工程任务 | ✅ Pi 必跑 | ✅ LLM API（可选） |
| **pilot-tools extension 调 Pilot 命令** | **✅ Pi 必跑（被加载）** | **看具体命令** |
| **`pilot agent` 起 Pi** | **❌→✅ Pi 从无到有** | **✅ LLM API（如果用 agent）** |

**结论**：Pilot 的**查看、整理、治理能力可以离线**；**执行、安装、生成能力需要 Pi + 网络**。Pilot **不会**把自己伪装成 Pi runtime 来执行 agent 任务——它要么起 Pi 让 Pi 跑（`pilot agent`），要么通过 pilot-tools 让 Pi 自己跑时也能用 Pilot 的能力。

## 6. 一句话（多版本，按场景用）

**完整版**（vision.md / 演讲）：
> Pilot = Pi 的 Co-pilot。Pilot 不替代 Pi 跑活，但是 Pi 跑活的最佳搭档——CLI / Web UI 让你看见和管理 Pi 的状态（包、会话、profile、消耗、能力），`pilot agent` 帮你起 Pi 时自动装上 Pilot 的工具集，让 Pi 在会话内也能反过来调 Pilot 的命令即装即用。Forge 让 Pi 吸收扩展生态，Avatars 让不同项目拥有不同能力组合。

**README 短版**：
> Pilot = Pi 的 Co-pilot。管包、管会话、管 profile、看消耗、做体检；还能在 Pi 跑活时给 LLM 装上自己的工具（pilot-tools extension），让 Pi 自己调整能力。开源。

**Tweet 版**：
> Pilot = Pi 的 Co-pilot + 能力操作系统。CLI / Web UI / Agent 三入口；包 / 会话 / profile / 消耗 / 体检 / 能力组合 / 双向桥 全覆盖。开源。