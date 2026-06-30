# Pilot

> **Pi 跑活，Pilot 管 Pi。**
>
> Pilot 管包、管会话、管 profile、看消耗、做体检，并把扩展生态沉淀成可组合的 Pi 能力。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-green.svg)](https://nodejs.org)

[Pi](https://pi.dev) 是极简终端编码 agent。**Pilot 是 Pi 的管理平面**——它不运行 agent，只管理 Pi：包、会话、profile、消耗、健康状态。

## 30 秒上手

```bash
npm install -g pilot

pilot doctor           # 体检：Pi / Node / fd / settings
pilot pack ls          # 看已装包（按类别分组）
pilot pack search subagent
pilot session search "JWT auth"
```

## 命令一览

| 命令 | 说明 |
|---|---|
| `pilot pack ls` | 已装包 + 冲突检测 |
| `pilot pack search <q>` | 终端内搜 npm |
| `pilot pack info <pkg>` | 详情 |
| `pilot pack install <pkg>` | 包装 `pi install` |
| `pilot session ls` | 列出会话（按项目分组） |
| `pilot session search <q>` | 全文搜会话（8 路并发） |
| `pilot doctor` | 健康检查 |

v0.2+：`pilot server`（本地 HTTP）、`pilot ui`（Web UI）、`pilot profile`。
v0.4+：`pilot forge`（能力工厂）。
v0.5+：`pilot avatar`（分身）。

## 设计原则

1. **Pi 是 source of truth** — Pilot 永远不复制 Pi 的 session、package、model、settings
2. **`~/.pilot/` 是 Pilot 自己的** — 不污染 `~/.pi/agent/`，除非用户显式 apply
3. **不抓取闭源产品内部实现** — 只复刻"公开可观察的工作流行为"
4. **不承诺"等价 Claude Code"** — 表述为 "inspired by"

## 文档

- 📖 [Vision](./docs/vision.md) — Pilot 是什么、不是什么、边界、长期形态
- 🏗️ [Architecture](./docs/architecture.md) — core / cli / server / ui / 安全模型
- 🗺️ [Roadmap](./docs/roadmap.md) — 三段式：看见 Pi → 管理 Pi → 进化 Pi
- 🔥 [Forge & Avatars](./docs/forge-and-avatars.md) — 能力系统（v0.4+）
- 📦 [Pack module](./docs/modules/pack.md) · 💬 [Session module](./docs/modules/session.md)
- 📐 [Design overview](./PILOT.md)

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。简单版：

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot
npm install
npm run dev -- pack ls
npm test
```

## 许可

[MIT](./LICENSE) © 2026 Pilot Contributors