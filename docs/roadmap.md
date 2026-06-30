# Roadmap

> 三段式叙事：**看见 Pi** → **管理 Pi** → **进化 Pi**。
>
> 每段都是独立可交付的小版本，按周迭代，不跨段承诺。

## 阶段一：看见 Pi（v0.1 - v0.1.x，已发）

**目标**：让用户从终端看清 Pi 状态。

| 版本 | 状态 | 内容 |
|---|---|---|
| **v0.1.0** | ✅ 已发 | `pilot pack ls/search/info/install`、`session ls/search`、`doctor` |

**核心交付**：
- CLI 骨架（commander）
- 7 个命令
- core 抽象（settings、JSONL parser、npm registry、pi CLI wrapper）
- TypeScript strict + 单元测试
- CI / release-please / 贡献指南

**完成标志**：用户在终端能 ls / search / install / doctor，可以日常 dogfooding。

---

## 阶段二：管理 Pi（v0.2 - v0.3.x，下一波）

**目标**：让用户能切换、组合、可视化 Pi 的配置。

| 版本 | 周期 | 内容 |
|---|---|---|
| **v0.2.0** | 2-3 周 | PilotService 抽象 · pilot server (127.0.0.1) · Capability model |
| **v0.3.0** | 3-4 周 | Session tree (CLI) · Profile manager · Cost stats · 包分类重构（读 manifest） |
| **v0.3.5** | 1-2 周 | **★ Web UI v1（Next.js）· 3 个只读页 · 第一张截图** |
| **v0.3.6** | 1 周 | UI v1.5（写操作：安装/卸载/启停） |

### v0.2.0 关键内容

- **PilotService interface**（`listPacks / installPack / listSessions / searchSessions / runDoctor`）— CLI/server/web 共享同一份接口
- **pilot server** — Fastify HTTP REST，只监听 127.0.0.1:17361
- **本地 token 鉴权** — server 启动时生成一次性 token，Web UI 必须带；写操作额外 Origin 校验
- **Capability 数据模型** — Zod schema + `capabilityDir()` 解析；为 v0.4 Forge 钉好数据基础

### v0.3.0 关键内容

- **`pilot session tree <id>`** — 解析 DAG，输出 ASCII 树
- **Profile manager** — `pilot profile ls/use/create/set`；overlay 优先，不直接 patch 全局 settings
- **Cost stats** — 解析 session JSONL 的 token 字段，按模型/扩展聚合
- **包分类重构** — 读 `package.json` 的 `pi` 字段，识别实际提供的 extension / skill / prompt / theme / commands / keybindings

### v0.3.5 关键内容（Web UI v1）

| 页面 | 内容 | 复用 core |
|---|---|---|
| **Dashboard** | pi/Node/fd 健康、settings 状态、已装包数、会话总大小、今天 token/cost | doctor + stats |
| **Package Center** | 已装包按类别分组、npm 搜索、安装/卸载按钮、冲突高亮 | pack + npm-registry |
| **Session Explorer** | 会话列表、全文搜索、详情页 + **★ DAG 树可视化（React Flow）** | sessions + readSessionTree |

**第一张截图**：Session DAG Explorer — 彩色节点、parentId 边、capability snapshot 标签。

### v0.3.5 安全模型（写操作必须）

| 接口 | 保护 |
|---|---|
| `GET /health` / `GET /packs` / `GET /sessions` | 仅 token |
| `POST /packs/install` | token + Origin 校验 + CSRF token |
| `POST /packs/uninstall` | 同上 |
| `POST /profiles/*` | 同上 |
| `POST /sessions/gc` | 同上 |
| `POST /doctor/fix` | 同上 |

**Web UI**：仅监听 127.0.0.1，浏览器只接受 `http://127.0.0.1:17361`，CORS 白名单只允许自己。

---

## 阶段三：进化 Pi（v0.4 - v1.0）

**目标**：让 Pilot 成为 Pi 的能力操作系统。

| 版本 | 周期 | 内容 |
|---|---|---|
| **v0.4.0** | 3-4 周 | Forge MVP（手写 3 能力 + eval harness） |
| **v0.4.5** | 1 周 | UI v2（Forge 流程页 + Profile 编辑） |
| **v0.5.0** | 4-6 周 | Avatars + Session snapshot + 能力差异可视化 |
| **v0.6.0** | 2 周 | Pi extension（`/pilot` slash 命令） |
| **v0.7.0** | 2 周 | 多 Pi 编排（团队 / 服务端 / 本地） |
| **v1.0.0** | 1 月 | 稳定 + 文档 + 申请收录 pi.dev/packages |

### v0.4.0 关键内容（Forge MVP）

3 个手写能力 + eval harness：

| 能力 | 灵感来源 | 为什么先做 |
|---|---|---|
| `plan-mode` | Claude Code | 用户感知强，Pi 官方明确没有 |
| `todo-manager` | 通用 | 工程任务必备，和 plan-mode 闭环 |
| `permission-gate` | Claude Code | 安全价值，体现"管理平面" |

**6 个核心命令**：
```bash
pilot forge search <query>          # 检索外部 Pi 扩展
pilot forge inspect <pkg>           # 读取 README / manifest / 探测
pilot forge absorb <pkg> --as <id>  # 沙箱安装 → 能力规格化 → 加能力库
pilot avatar create <name>          # 创建分身
pilot avatar add <name> <cap>       # 给分身加能力
pilot avatar run <name>             # 启动分身
```

**评测 6 类**（v0.4.0 必跑）：
- 代码理解 · 小修复 · 多文件修改 · 工作流控制 · 安全控制 · 长上下文

**自动迭代闭环**（v0.4.5 加）：
```
build → eval → 失败 → 把日志/diff/失败断言喂回 Pi → Pi 改 → 再 eval
```

### v0.5.0 关键内容（Avatars + Session snapshot）

- **Avatars** = base Pi + profile + capabilities + memory + model + session policy
- **Session capability snapshot** — 每个 session branch 记录当时启用的能力 + 模型
- **能力差异可视化** — UI 一目了然：architect / fixer / reviewer 分身的能力差异
- **三层隔离** — Global Pi / Pilot Capability Store / Avatar Overlay
- **冲突图** — 自动检测能力互斥，建议 safe-fix 分支

### v0.6.0 关键内容（Pi extension）

```bash
pi install npm:@pilot/pi-extension
```

装上后 pi 内部可用：
- `/pilot stats today`
- `/pilot session search "JWT"`
- `/pilot doctor`
- `/pilot ui` — 在 pi 内打开 Web UI

### v1.0 标志

- 文档齐全（vision / architecture / roadmap / forge-and-avatars / modules）
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