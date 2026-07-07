# Roadmap

> 三段式叙事：**看见 Pi** → **管理 Pi** → **进化 Pi**。
>
> 每段都是独立可交付的小版本，按周迭代，不跨段承诺。
>
> **2026-07-07 校准**：阶段一和阶段二已全部发完。阶段三走到 **v0.5.7**（Plan 数据模型 + CRUD + CLI 基线）。从 v0.5.7 开始，Pilot 的定位从"Pi 的管理面板"升级为**自主智能体工具**——新增 Plan（任务规划）、Agent Loop（自主执行）、Workflow（工作流编排）三大能力。详见 [`docs/roadmap-agent.md`](./roadmap-agent.md)。
>
> **2026-07 校准**：之前的 v1.0 终极宏图（`docs/roadmap-v1.0.md`，已移到 `docs/retired/`）建立在未经验证的假设上（6 阶段流水线 / Hermes scratch_pad）—— **Pi 实际数据里没有这些抽象**。Pilot 走的是 verify-first 路线，每个版本都基于 [`roadmap-pi-grounded.md`](./roadmap-pi-grounded.md) 的真实能力盘点。

## 阶段一：看见 Pi（v0.1 - v0.3.x，已发）

**目标**：让用户从终端看清 Pi 状态。

| 版本 | 状态 | 内容 |
|---|---|---|
| **v0.1.0** | ✅ 已发 | `pilot pack ls/search/info/install`、`session ls/search`、`doctor` |
| **v0.2.0** | ✅ 已发 | PilotService 抽象 · pilot server (127.0.0.1:17361) · Capability model · 本地 token 鉴权 |
| **v0.3.0** | ✅ 已发 | Session tree (CLI) · Profile manager · Cost stats · 包分类重构（读 manifest） |
| **v0.3.5** | ✅ 已发 | **★ Web UI v1（Next.js）· 3 个只读页 · 第一张截图** |
| **v0.3.6** | ✅ 已发 | UI v1.5（写操作：安装/卸载/启停） |

### 关键交付

- CLI 骨架（commander）
- 7 → 14 个命令（v0.4.x 扩到 14 个：pack / session / stats / profile / capability / doctor / dashboard / server / forge / init / policy / context / tool / usage）
- core 抽象（settings、JSONL parser、npm registry、pi CLI wrapper、PilotService interface）
- TypeScript strict + 单元测试（21 文件 / 270 用例，离线 ~7 秒跑完）
- CI / release-please / 贡献指南

**完成标志**：用户在终端能 ls / search / install / doctor，可以日常 dogfooding。

---

## 阶段二：管理 Pi（v0.3.7 - v0.3.10，已发）

**目标**：让用户能切换、组合、可视化 Pi 的配置。

| 版本 | 状态 | 内容 |
|---|---|---|
| **v0.3.7** | ✅ 已发 | usage / token / cost dashboard 接入 session JSONL |
| **v0.3.8** | ✅ 已发 | Project context auto-discovery + Tool inventory（只读） |
| **v0.3.9** | ✅ 已发 | Profile editor（overlay 模型）+ Capability 持久化 |
| **v0.3.10** | ✅ 已发 | Polishing：UI 文本统一 + 错误边界 + i18n 准备 |

### v0.3.7 关键内容

- **`pilot usage today/week/month`** — 解析 `AssistantMessage.usage.{input,output,cacheRead,cacheWrite,cost}`，按 provider / model 聚合
- **`pilot context`** — auto-discover `AGENTS.md` / `CLAUDE.md` / `.pi/AGENTS.md` / `.cursor/rules`
- **`pilot tool`** — 列出 profile 启用的所有 tool，标注来源（built-in / extension）/ safety / 调用次数

### v0.3.7 安全模型（写操作必须）

| 接口 | 保护 |
|---|---|
| `GET /health` / `GET /packs` / `GET /sessions` / `GET /usage` / `GET /context` / `GET /tools` | 仅 token |
| `POST /packs/install` / `POST /packs/uninstall` | token + Origin 校验 + CSRF token |
| `POST /profiles/*` / `POST /sessions/gc` / `POST /doctor/fix` | 同上 |
| `PUT /policies/*` / `POST /policies/*/apply` | 同上 |

**Web UI**：仅监听 127.0.0.1，浏览器只接受 `http://127.0.0.1:17361`，CORS 白名单只允许自己。Web token 永远不进入浏览器（v0.4.7+ 通过 `/api/pilot/[...path]` server-side proxy）。

---

## 阶段三：进化 Pi（v0.4 - v1.0，进行中）

**目标**：让 Pilot 成为**自主智能体工具**——不只是管理 Pi，更能规划任务、编排执行、自主迭代。

| 版本 | 状态 | 周期 | 内容 |
|---|---|---|---|
| **v0.4.0** | ✅ 已发 | — | Forge MVP（手写 3 能力 + eval harness） |
| **v0.4.1** | ✅ 已发 | — | Forge 能力库持久化 + capability show 命令 |
| **v0.4.2** | ✅ 已发 | — | read paths（usage/tools/context）+ 6 阶段数据模型 + 3 个 web 只读页 |
| **v0.4.3** | ✅ 已发 | — | Tool policies（TOML → 生成 pi extension，HITL 钩子） |
| **v0.4.4** | ✅ 已发 | — | Box Garden Compose MVP（拖拽画布 + localStorage 自动保存） |
| **v0.4.5** | ✅ 已发 | — | Cozy 2.5D 皮肤（cream + sage + amber + 伪元素立方体） |
| **v0.4.6** | ✅ 已发 | — | 基础设施：`pilot init` + `dashboard --prod` + standalone build + `release.sh` 一条龙 |
| **v0.4.7** | ✅ 已发 | — | 浏览器编辑 policy（7 字段表单 + token 不进浏览器） |
| **v0.4.8** | ✅ 已发 | — | WebUI a11y（WCAG AA + keyboard nav + axe-core 23 测试） |
| **v0.4.9-v0.5.6** | ✅ 已发 | — | Avatars + Co-pilot 模式 + Profile 真正生效 + Bug 修复 |
| **v0.5.7** | ✅ 已发 | — | **★ Agent 能力层基线：Plan 数据模型 + 任务规划 + 工具推荐 + Plan CRUD API + CLI** |
| **v0.6.0** | ⏳ 计划 | 3-4 周 | **自适应执行引擎：反馈分析 + 错误恢复 + 自主循环迭代** |
| **v0.7.0** | ⏳ 计划 | 2-3 周 | 工作流模板 + 组合复用（从历史 Plan 提取模板） |
| **v0.8.0** | ⏳ 计划 | 2-3 周 | 多 Plan 编排（DAG 依赖 + 并行执行） |
| **v1.0.0** | ⏳ 计划 | 1 月 | 稳定 + 文档 + 申请收录 pi.dev/packages |

### v0.5.7 关键内容（Agent 能力层 — Plan 数据模型基线）

详见 [`docs/roadmap-agent.md`](./roadmap-agent.md)。

**核心新增**：
- **Plan 数据模型** — Plan / Task / Step 三层结构，支持 sequential / parallel / adaptive 策略
- **StepAction** — 8 种动作类型（pilot_command / pi_session / profile_switch / pack_install / policy_apply / condition / wait / manual）
- **Plan CRUD API** — 完整的 REST 端点 + Server Actions
- **工具推荐** — 基于目标描述匹配可用工具和 Profile
- **CLI 命令** — `pilot plan new/ls/show/run/pause/resume/cancel/delete/suggest-tools`
- **存储** — `~/.pilot/plans/` (TOML) + `~/.pilot/plans-history/` (JSONL)
- **事件日志** — 每个生命周期动作（plan_created / started / paused / resumed / cancelled / deleted）记一条 JSONL 事件，方便后续执行器回放

### v0.6.0 关键内容（自适应执行引擎）

- **PlanExecutor** — 执行引擎，AsyncIterable<PlanEvent> 流式输出
- **FeedbackEngine** — 分析步骤结果，分类 pass/fail/partial
- **RecoveryStrategy** — 5 种恢复策略（retry / alternative / skip / escalate / replan）
- **自适应循环** — 执行 → 观察结果 → 调整计划 → 继续执行
- **Web UI** — Plan 执行状态实时展示（WebSocket 或轮询）

### v0.7.0 关键内容（工作流模板）

- **WorkflowTemplate** — 从历史 Plan 提取可复用的模板
- **内置模板** — code-review / bug-fix / feature-impl / refactor / onboard-pkg
- **模板实例化** — 用模板 + 参数生成具体 Plan
- **Compose 集成** — Plan 执行结果可视化展示在 Compose 画布

### v0.8.0 关键内容（多 Plan 编排）

- **PlanComposition** — 多个 Plan 的 DAG 依赖编排
- **并行执行** — 无依赖的 Plan 同时执行
- **跨 Plan 数据流** — 一个 Plan 的输出作为另一个的输入

### v0.4.x 真实路径（与原 plan 的差异）

`docs/roadmap-v1.0.md`（v3 终极版）原本计划 v0.4.6 做 "Memory 方块 + Context Compression"，但实际 v0.4.6 是**先把发布工程搞稳**（`init` + `dashboard --prod` + 一键 release）。这是合理的工程顺序调整：基础设施不牢，后面每个版本发布都是手工活。

| 版本 | 原计划 | 实际 | 调整原因 |
|---|---|---|---|
| v0.4.6 | Memory 方块 + Context Compression | 基础设施（init + dashboard --prod + release.sh） | 把发布工程自动化后再做 Memory 才有持续产出 |
| v0.4.7 | (无具体计划) | 浏览器编辑 policy | 验证 token 不进浏览器的安全模式 |
| v0.4.8 | (无具体计划) | WebUI a11y | ComposeBoard 是鼠标唯一可用，先解决可达性 |

### v0.4.5 关键内容（实际做的，不是 roadmap-v1.0 里写的"UI v2 Forge"）

`docs/roadmap-v1.0.md` 把 v0.4.5 写成 "Compose → Save as Profile + 2.5D + 实时 Run 模式"，实际只完成了 **2.5D skin**（cream + sage + amber palette + 伪元素立方体）。Save as Profile 和 Run 模式推迟。

### v0.5.0 关键内容（Avatars + Session snapshot + Replay）

- **Avatars** = base Pi + profile + capabilities + memory + model + session policy
- **Session capability snapshot** — 每个 session branch 记录当时启用的能力 + 模型
- **能力差异可视化** — UI 一目了然：architect / fixer / reviewer 分身的能力差异
- **三层隔离** — Global Pi / Pilot Capability Store / Avatar Overlay
- **冲突图** — 自动检测能力互斥，建议 safe-fix 分支
- **Replay mode** — 选定 session + profile 重放，观察每个阶段 trace
- **A/B diff** — 两个 session 同 prompt 不同 profile 的差异可视化
- **6 阶段 trace 可视化** — 每步标注属于 strategy / planner / retrieval / toolSelector / executor / validator / output

### v0.5.4 关键内容（Co-pilot 模式 / pilot agent）

```bash
pilot agent                  # 起 pi 子进程，自动加载 pilot-tools extension
pilot agent --profile work   # 用 work profile 启动
```

Pi 内部可用 13 个 LLM 工具（通过 `pilot-tools` extension）：
- `pack_install / pack_uninstall / pack_list`
- `profile_activate / profile_list`
- `session_search / session_info`
- `stats`（今日/本周消耗）
- `avatar_capture / avatar_diff / avatar_apply`
- `forge_search / capability_diff / doctor`

### v1.0 标志

- 文档齐全（vision / architecture / roadmap-pi-grounded / forge-and-avatars / modules）
- 申请收录到 pi.dev/packages
- npm 周下载 > 100
- GitHub stars > 50
- 3 个外部贡献者
- 至少 1 个 issue 被合并

---

## 关键边界（重要）

- **Pilot 不抓取闭源产品内部 prompt / 代码 / 协议**。只复刻"公开可观察的工作流行为"。
- **Pilot 不承诺"等价 Claude Code / Codex / Kimi"**。表述为 "Claude Code-style plan workflow" 或 "inspired workflow"。
- **能力包沙箱化**。permission-gate、shell-wrapper 这类能力必须隔离测试。
- **eval 防作弊**。不读断言答案硬编码；用多 fixture + 多轮任务 + 隐藏评测集。

## 内部化 4 等级（Forge 关键设计）

| 等级 | 名称 | 描述 |
|---|---|---|
| L1 | Referenced | 直接依赖外部扩展 |
| L2 | Wrapped | 外部扩展 + Pilot wrapper |
| L3 | Distilled | 提炼行为规格，重写为 Pilot 能力包 |
| L4 | Native | 进入 Pilot core，成为内置能力 |

这样既能快速获得能力，又不会长期被外部扩展绑死。

---

## 反节奏

如果某个阶段超出 1.5x 预计时间，**停下来**：
1. 重新确认问题是否真的存在
2. 跑 dogfooding 找新痛点
3. 调整下个阶段范围

不要为了"按计划发版"硬推。开源项目慢一点比烂掉好。

---

## 文档层级

| 文档 | 作用 |
|---|---|
| **本文件（`roadmap.md`）** | 三段式 high-level 叙事 + 阶段边界 |
| **[`docs/roadmap-agent.md`](./roadmap-agent.md)** | **Agent 能力层路线图** — Plan / Task / Step / Executor / Feedback |
| **[`docs/roadmap-pi-grounded.md`](./roadmap-pi-grounded.md)** | v0.4.x 真实路径 + 以 Pi 实际能力为锚的 11 个 toggle + 详细规划 |
| **[`docs/v0.4.2-dev-plan.md`](./v0.4.2-dev-plan.md)** | v0.4.2 具体实施（已被实际发布覆盖，仅作 audit） |
| **[`docs/retired/roadmap-v1.0.md`](./retired/roadmap-v1.0.md)** | 已作废的 v3 终极版宏图（保留为 audit trail） |
| **[`docs/retired/macro-spec-audit.md`](./retired/macro-spec-audit.md)** | 作废文档审计记录 |