# Pilot — Design Overview

> **Pi 跑活，Pilot 管 Pi。**
>
> Pilot 是 Pi 的管理平面：它不运行 agent，只管理 Pi 的包、会话、profile、消耗、健康状态和能力组合。Forge 让 Pi 吸收扩展生态，Avatars 让不同会话树拥有不同能力。

---

## 文档结构

| 文档 | 内容 |
|---|---|
| **[README.md](./README.md)** | 30 秒上手、安装、命令清单、截图 |
| **[docs/vision.md](./docs/vision.md)** | Pilot 是什么 / 不是什么 / 边界 / 长期形态 |
| **[docs/architecture.md](./docs/architecture.md)** | core / cli / server / ui / 安全模型 / 数据流 |
| **[docs/roadmap.md](./docs/roadmap.md)** | 三段式：看见 Pi → 管理 Pi → 进化 Pi |
| **[docs/forge-and-avatars.md](./docs/forge-and-avatars.md)** | §11 能力系统（Forge / Capability Store / Avatars） |
| **[docs/modules/pack.md](./docs/modules/pack.md)** | `pilot pack` 详解 |
| **[docs/modules/session.md](./docs/modules/session.md)** | `pilot session` 详解 |

---

## 1. 设计原则（不可妥协）

1. **Pi 是 source of truth** — Pilot 永远不复制 Pi 的 session、package、model、settings
2. **`~/.pilot/` 是 Pilot 自己的** — 不污染 `~/.pi/agent/`，除非用户显式 apply
3. **Profile 用 overlay，不直接 patch 全局 settings.json**
4. **Server 写操作必须有 token + Origin + CSRF**
5. **不抓取闭源产品内部实现** — 只复刻"公开可观察的工作流行为"
6. **不承诺"等价 Claude Code"** — 表述为 "inspired by"
7. **能力包沙箱化** — permission-gate、shell-wrapper 必须隔离测试
8. **eval 防止作弊** — 多 fixture + 多轮 + 隐藏评测集
9. **不造空中楼阁** — 每段都 dogfooding 验证再进入下段

---

## 2. 边界（重要）

```
~/.pi/agent/         ← Pi 拥有，Pilot 主要读
~/.pilot/            ← Pilot 自己维护
<cwd>/.pilot/        ← 项目级，可 gitignore
```

详细边界规则见 [`docs/vision.md` §2](./docs/vision.md) 和 [`docs/architecture.md` §1](./docs/architecture.md)。

---

## 3. 一句话定位

**完整版**（vision.md / 演讲）：
> Pilot 是 Pi 的管理平面：它不运行 agent，只管理 Pi 的包、会话、profile、消耗、健康状态和能力组合。Pi 跑活，Pilot 管 Pi；Forge 让 Pi 吸收扩展生态，Avatars 让不同会话树拥有不同能力。

**短版**（README）：
> Pi 跑活，Pilot 管 Pi。Pilot 管包、管会话、管 profile、看消耗、做体检，并把扩展生态沉淀成可组合的 Pi 能力。

**Tweet 版**：
> Pilot = Pi 的管理平面 + 能力操作系统。CLI / Web UI / Extension 三入口，包 / 会话 / profile / 消耗 / 体检 / 能力组合全覆盖。开源。

---

## 4. 模块总览（v0.1 已实现的 6 个 + 远期）

| 模块 | v0.1 状态 | 关键命令 |
|---|---|---|
| **Pack** | ✅ | `pack ls/search/info/install` |
| **Session** | ✅ | `session ls/search` |
| **Profile** | v0.3 | `profile ls/use/create/set/apply` |
| **Stats** | v0.3 | `stats today/week/by-model/by-pack` |
| **Doctor** | ✅ | `doctor` / `doctor --json` |
| **Server** | v0.2 | `server`（127.0.0.1:17361） |
| **Web UI** | v0.3.5 | `ui`（3 个只读页） |
| **Forge** | v0.4 | `forge search/inspect/absorb/eval/build` |
| **Avatar** | v0.5 | `avatar create/add/run/diff` |

---

## 5. 三段式路线图

| 阶段 | 版本 | 周期 | 重点 |
|---|---|---|---|
| **看见 Pi** | v0.1.x | 已发 | pack / session / doctor 基础 |
| **管理 Pi** | v0.2 - v0.3.5 | 2-3 月 | service 抽象 + server + Web UI + profile + session tree |
| **进化 Pi** | v0.4 - v1.0 | 4-6 月 | Forge + Avatars + Session snapshot + pi extension |

详细见 [`docs/roadmap.md`](./docs/roadmap.md)。

---

## 6. 关键架构决策

- ✅ **v0.2-a 已完**：Capability 数据模型 + Zod schema（23 测试）
- ✅ **v0.2-b 已完**：PilotService interface + 默认实现（15 测试）
- ✅ **v0.2-c 已完**：pilot server（Fastify + token + Origin + CSRF，17 测试）
- ✅ **v0.2-d 已完**：CLI 切到 ctx.service（7 个 commands 全走 service，16 mock 测试）
- ✅ **v0.2-e 已完**：code review 修复（version from package.json / dynamic Origin / 全 async）
- ✅ **v0.3.0-a 已完**：Session tree — DAG 解析 + CLI + server route（11 测试）
- ✅ **v0.3.0-b 已完**：Profile manager — TOML 存储 + CLI + server routes（22 测试）
- ✅ **v0.3.0-c 已完**：Stats — 全 session 聚合（messages / tools / models / by-day），CLI today/week/month/all + GET /stats（7 测试）
- ✅ **v0.3.0-d 已完**：Pack manifest 分类（替代关键词启发式，19 测试）
- **v0.3.0-c**：Stats（token / tool / model 聚合）
- **v0.3.0-d**：包分类重构（pack-manifest.ts，读 manifest 替代关键词）
- **v0.3.5 必出**：Web UI v1（3 个只读页，第一张截图）
- **v0.4 必出**：Forge MVP（3 个手写能力 + eval harness）
- **v0.5 必出**：Avatars + Session capability snapshot

---

## 7. 安全模型

- **Server**：只监听 127.0.0.1
- **鉴权**：32 字节随机 token，写到 `~/.pilot/server.token` (chmod 600)
- **CSRF**：POST 请求必须带 CSRF token
- **Origin 校验**：只接受 127.0.0.1 / localhost
- **文件权限**：`~/.pilot/server.token`、`profiles/*.toml` 全部 chmod 600
- **不暴露**：`0.0.0.0` 监听、HTTPS（本地不需要）、远程访问

详细见 [`docs/architecture.md` §5](./docs/architecture.md)。

---

## 8. 待核实的事实

> 这些事实在 vision / roadmap 里提到，但需要实际跑一遍 Pi 0.80.2 确认。

- `pi install` / `pi remove` / `pi list` / `pi update` — CLI 子命令形式
- `pi --export <file>` — **疑似不准确**。可能只是交互模式里的 `/export` slash command，不是 CLI flag
- `pi config` — TUI 命令是否真的存在
- `pi --mode rpc` — RPC mode 是否通过 CLI flag 启用，还是默认 stdin/stdout
- 4624+ 包的数量 — 实际数字以 pi.dev/packages 当前索引为准
- 各包的下载量数字 — 同样会变

这些会在 v0.2 PilotService 抽象完成后用实际命令验证。

---

## 9. 不要做

- ❌ 替代 Pi 做 agent
- ❌ 复制 Pi 的 session / package / model
- ❌ 抓取闭源产品内部 prompt
- ❌ 承诺"等价 Claude Code / Codex / Kimi"
- ❌ 把所有功能塞进 Pilot core
- ❌ 让 eval 答案可被生成器读到
- ❌ 直接 patch 全局 `~/.pi/agent/settings.json`（除非显式 apply）
- ❌ 把 server 暴露到 0.0.0.0
- ❌ 跳过 eval 直接 promote 能力到库

---

## 10. 一句话总结

> Pilot 是 Pi 的**管理平面** + 能力操作系统。Pi 跑活，Pilot 管 Pi；Forge 让 Pi 吸收扩展生态，Avatars 让不同会话树拥有不同能力。