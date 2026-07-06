# Pilot — Design Overview

> **Pilot = Pi 的 Co-pilot。**
>
> Pilot 给 Pi 装一套"管理 + 能力"工具栈：CLI/Web 让人看见 Pi 在做什么，`pilot agent` 帮你起 Pi 并装上 Pilot 的工具集，Pi 在跑活时可以反过来调 Pilot 的命令来即装即用 Forge 包、切 profile、抓 Avatar、补会话上下文。Forge 让 Pi 吸收扩展生态，Avatars 让不同项目拥有不同能力配置。

---

## 0. 一句话定位（v0.5.4 修正）

> Pilot **不替代** Pi 跑活，但 **是 Pi 跑活的最佳搭档**：
>
> - **看见 Pi**：CLI / Web 看包、会话、profile、消耗、能力组合
> - **管理 Pi**：`pilot pack install`、`pilot profile activate`、`pilot avatar apply` 直接驱动 Pi 的状态
> - **给 Pi 装工具**：`pilot agent` 启动 Pi 时自动加载 `pilot-tools` extension，让 LLM 在会话内就能调 Pilot 的命令（"装这个包"、"切那个 profile"、"存当前 Avatar"）
> - **和 Pi 一起长**：Forge 让 Pi 吸收扩展生态，Avatars 让不同项目拥有不同能力组合

**Pilot 是双向桥，不是单向观察者。**

---

## 文档结构

| 文档 | 内容 |
|---|---|
| **[README.md](./README.md)** | 30 秒上手、安装、命令清单、截图 |
| **[docs/vision.md](./docs/vision.md)** | Pilot 是什么 / 不是什么 / 边界 / 长期形态 |
| **[docs/architecture.md](./docs/architecture.md)** | core / cli / server / ui / 安全模型 / 数据流 |
| **[docs/roadmap.md](./docs/roadmap.md)** | 三段式 high-level：看见 Pi → 管理 Pi → 进化 Pi |
| **[docs/roadmap-pi-grounded.md](./docs/roadmap-pi-grounded.md)** | v0.4.x 真实路径 + 11 个 toggle + 以 Pi 实际能力为锚（**活的 roadmap**） |
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

## 3. 一句话定位（v0.5.4 修正：双向桥）

**完整版**（vision.md / 演讲）：
> Pilot = Pi 的 Co-pilot。Pilot 不替代 Pi 跑活，但是 Pi 跑活的最佳搭档——CLI / Web UI 让你看见和管理 Pi 的状态（包、会话、profile、消耗、能力），`pilot agent` 帮你起 Pi 时自动装上 Pilot 的工具集，让 Pi 在会话内也能反过来调 Pilot 的命令即装即用。Forge 让 Pi 吸收扩展生态，Avatars 让不同项目拥有不同能力组合。

**短版**（README）：
> Pilot = Pi 的 Co-pilot。管包、管会话、管 profile、看消耗、做体检；还能在 Pi 跑活时给 LLM 装上自己的工具（pilot-tools extension），让 Pi 自己调整能力。开源。

**Tweet 版**：
> Pilot = Pi 的 Co-pilot + 能力操作系统。CLI / Web UI / Agent 三入口；包 / 会话 / profile / 消耗 / 体检 / 能力组合 / 双向桥 全覆盖。开源。

---

## 4. 模块总览（v0.1 已实现的 6 个 + 远期）

| 模块 | 状态 | 关键命令 / 入口 |
|---|---|---|
| **Pack** | ✅ | `pack ls/search/info/install/uninstall` |
| **Session** | ✅ | `session ls/search` + Web `/sessions/[id]` 详情 |
| **Profile** | ✅ | `profile ls/use/create/set/apply` |
| **Stats** | ✅ | `stats today/week/by-model/by-pack` |
| **Doctor** | ✅ | `doctor` / `doctor --json` |
| **Server** | ✅ | `server`（127.0.0.1:17361） |
| **Web UI** | ✅ | Next.js 16 + Tailwind 4，~20 路由 |
| **Forge** | ✅ | `forge search/inspect/absorb/eval/build` |
| **Avatar** | ✅ | `avatar ls/capture/diff/apply`（含 dry-run） |
| **Capability diff** | ✅ | `capability diff <a> <b>` + Web `/capabilities/diff` |
| **Pilot agent** | v0.5.4 NEW | `pilot agent [--cwd X]` 起 Pi，自动装 `pilot-tools` extension |
| **Pilot-tools extension** | v0.5.4 NEW | 给 Pi 的 LLM 暴露 ~10 个 Pilot 命令作为工具 |

---

## 5. 三段式路线图（v0.5.4 修正）

| 阶段 | 版本 | 周期 | 重点 |
|---|---|---|---|
| **看见 Pi** | v0.1.x | 已发 | pack / session / doctor 基础 |
| **管理 Pi** | v0.2 - v0.3.5 | 已发 | service 抽象 + server + Web UI + profile + session tree |
| **进化 Pi** | v0.4 - v0.5.3 | 已发 | Forge + Avatars + Session snapshot + Capability diff |
| **和 Pi 一起跑** | v0.5.4 - v0.6.x | 进行中 | `pilot agent` 起 Pi + `pilot-tools` extension 让 Pi 调 Pilot + Web 嵌入 |

详细见 [`docs/roadmap.md`](./docs/roadmap.md) 和 [`docs/roadmap-pi-grounded.md`](./docs/roadmap-pi-grounded.md)。

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
- ✅ **v0.3.5 已完**：Web UI v1 — Next.js 16 + Tailwind 4，4 个只读页面（dashboard / packages / sessions / profiles），7 个 web 测试。CLI `pilot dashboard` 一键起 + 打开浏览器
- ✅ **v0.3.6 已完**：Web UI 写操作 — Server Actions（install / create / save / delete profile），CSRF 端到端跑通，9 个 web 测试
- ✅ **v0.3.7 已完**：hygiene 收尾 — 版本号统一 0.3.6、service-impl 测试离线（mock manifest，不再 real npm）、build warning 清零（移除 Next 16 不识别的 eslint config + turbopack.root 锁定）、`pilot dashboard` 自动拉起 pilot server（`--no-server` 可选）
- ✅ **v0.3.8 已完**：release 收尾 — RELEASE-v0.3.6.md（给 GitHub release 页面贴）、Dashboard auto-refresh（10s `router.refresh()`）+ LivePulse 状态点；版本号同时升 0.3.8
- ✅ **v0.3.9 已完**：Capabilities（read-only）— `pilot capability ls/show` CLI；Web `/capabilities` + `/capabilities/[id]` 列表+详情页；server 已有的 GET endpoints 复用。**完整 lifecycle（forge/eval/install/publish）留 v0.4**
- ✅ **v0.3.10 已完**：release 流程清理 — `.github/workflows/release.yml` 删无效的 `package-name`（v4 action 不接受）；新增 `vitest.integration.config.ts` 让 `npm run test:integration` 真正跑 integration；integration 测试断言放宽（kind 由 npm 决定，不强加值）。**v0.3 line 完整 release-ready**
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

- ❌ 替代 Pi 跑活（Pi 是 source of truth，Pilot 是 Co-pilot）
- ❌ 复制 Pi 的 session / package / model
- ❌ 抓取闭源产品内部 prompt
- ❌ 承诺"等价 Claude Code / Codex / Kimi"
- ❌ 把所有功能塞进 Pilot core
- ❌ 让 eval 答案可被生成器读到
- ❌ 直接 patch 全局 `~/.pi/agent/settings.json`（除非显式 apply）
- ❌ 把 server 暴露到 0.0.0.0
- ❌ 跳过 eval 直接 promote 能力到库
- ❌ 在不告诉用户的情况下偷偷重写 Pi 的 prompt（pilot-tools extension 只能暴露显式声明的工具给 LLM）

---

## 10. 一句话总结（v0.5.4 修正）

> Pilot 是 Pi 的 **Co-pilot**：看见 Pi、管 Pi、给 Pi 装工具。Forge 让 Pi 吸收扩展生态，Avatars 让不同项目拥有不同能力组合；`pilot agent` + `pilot-tools` extension 让 Pi 跑活时 LLM 自己就能调 Pilot 的命令来调整能力。