# Pilot

> **Pi 跑活，Pilot 管 Pi。**
>
> Pilot 不运行 agent，只管理 Pi：包、会话、profile、policy、消耗、健康状态、可视化画布。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-green.svg)](https://nodejs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/wwppee/pilot/ci.yml?label=CI)](https://github.com/wwppee/pilot/actions)
[![Latest release](https://img.shields.io/github/v/release/wwppee/pilot)](https://github.com/wwppee/pilot/releases/latest)

[Pi](https://pi.dev) 是一个极简的终端编码 agent。**Pilot 是 Pi 的"管理平面"（management plane）**——它不是 runtime，不替代 pi，也不复刻 pi 的功能。它在 pi 的旁边，帮你**看见 pi 在做什么、管 pi 的配置、把 pi 的扩展生态沉淀成可组合的资产**。

## 三句话讲清

1. **`pilot dashboard`** —— 一键起本地 Web UI，看会话、看消耗、看工具、看策略。
2. **`pilot policy`** —— 写 TOML 规则，自动生成 pi extension 在下次启动时强制执行（`/usr/bin/rm -rf /` 直接 blocked）。
3. **`pilot compose`** —— 把 session / pack / profile / policy / capability 拖到画布上自由摆，跨 reload 保留。

## 30 秒上手

```bash
# 前置：装了 pi（https://pi.dev），有 Node 20+

# 1. 装 Pilot
npm install -g pilot
# 或开发版
npm install -g wwppee/pilot

# 2. 体检
pilot doctor
# → 7 项检查：Node / pi / fd / ~/.pi/agent / settings / sessions / etc.

# 3. 一键起 dashboard（同时启动 server + Web UI）
pilot dashboard
# → pilot server  : http://127.0.0.1:17361  (token 在 ~/.pilot/server.token)
# → web UI        : http://localhost:17371
```

打开浏览器 → 看到 Dashboard（今日消耗） / Packages / Sessions / Usage / Tools / Context / Policy / Compose 8 个页面。

## 命令清单

> `pilot --help` 看完整列表；`pilot <cmd> --help` 看子命令。

| 命令 | 一句话 | 何时用 |
|---|---|---|
| `pilot doctor` | 健康检查 | 装完之后第一件事 |
| `pilot dashboard` | 起 server + Web UI | 想看 dashboard |
| `pilot server start` | 只起 server（CLI 用） | 自动化、远程访问 |
| `pilot pack ls` | 列出已装的包 | 看现在装了啥 |
| `pilot pack search <q>` | 搜 npm 包 | 找新工具 |
| `pilot pack install <name>` | 装包（包装 `pi install`） | 加新能力 |
| `pilot session ls` | 列出会话（按项目分组） | 看历史 |
| `pilot session search "JWT auth"` | 全文搜会话内容（8 路并发） | 找之前做过的方案 |
| `pilot profile ls` | 列出 profile | 多环境切换 |
| `pilot profile new <name>` | 创建 profile | 设专门的 model / thinking / tools |
| `pilot usage today` | 看今日 token + USD | 看花了多少钱 |
| `pilot usage week` | 本周消耗 | 对比、预算 |
| `pilot tool ls` | 看 pi 能调的工具 | 装新包后 verify |
| `pilot context ls` | 看 AGENTS.md / CLAUDE.md 等 | 确认上下文被 pi 正确加载 |
| `pilot policy new safe-bash` | 起一个安全策略模板 | 想管住 pi 能做什么 |
| `pilot policy apply safe-bash` | 生成 pi extension + 自动加载 | 策略生效 |
| `pilot policy check safe-bash bash --arg command='rm -rf /'` | 试一条规则 | 调试策略 |
| `pilot capability ls` | 看本地 capability 库（v0.4+ 沉淀的资产） | 复用以前的探索 |

> 网络测试 (`pilot pack install`、`pilot pack search`、forge 等) 在 sandbox/CI 里设 `PILOT_SKIP_NETWORK=1` 可以跳过；本地跑不需要。

## 5 个核心概念

| 概念 | 是什么 | 在哪儿 |
|---|---|---|
| **Pack** | 一个 pi extension / skill / theme / prompt 包 | `~/.pi/agent/npm/` (源), `pilot/pack` 管 |
| **Profile** | 一组"换模型 + 换 team + 换 thinking"的预设 | `~/.pilot/profiles/<name>.toml` |
| **Policy** | 工具白/黑名单 + 路径 deny + 命令 deny + 敏感 redact + HITL | `~/.pilot/policy/<name>.toml` → 生成 `~/.pilot/extensions/pilot-policy-<name>.ts` |
| **Capability** | 把 npm 包"蒸馏"成可复用的能力定义 (L1 referenced / L2 wrapped) | `~/.pilot/capabilities/` |
| **Compose** | 一个保存的视觉布局：哪些 session / pack / profile / policy 在一起 | Web UI localStorage + JSON 导出 |

## 一个真实的工作流

> "我想让 pi 不能 rm -rf /"

```bash
# 1. 起一个策略
pilot policy new safe-bash
# → 生成 ~/.pilot/policy/safe-bash.toml，里面已经填了：
#   - deny ["bash"] (默认不安全)
#   - denyPaths ["**/.env", "**/.env.*", ...]
#   - denyCommands ["^rm\\s+-rf\\s+/", "^mkfs", ...]
#   - sensitivePatterns ["sk-[A-Za-z0-9]{20,}", "ghp_[A-Za-z0-9]{20,}", ...]
#   - requireApproval ["bash", "write"]

# 2. 试一下规则
pilot policy check safe-bash bash --arg command='ls -la'
# → ✓ ALLOWED
pilot policy check safe-bash bash --arg command='rm -rf /'
# → ✗ BLOCKED  (rule: denyCommands)  command matches denied regex "^rm\s+-rf\s+/"

# 3. 调一调（用 $EDITOR 改 TOML）
$EDITOR ~/.pilot/policy/safe-bash.toml

# 4. 生效
pilot policy apply safe-bash
# → 生成 ~/.pilot/extensions/pilot-policy-safe-bash.ts
# → pi 下次启动自动加载；当前 session 用 /reload 即可

# 5. 撤掉
pilot policy unapply safe-bash
```

`safe-bash.ts` 是真·编译过的 TypeScript extension，**不是 magic 字符串**，**没有运行时依赖**，**源码人类可读**：

```typescript
// ~/.pilot/extensions/pilot-policy-safe-bash.ts
const POLICY = {
  name: "safe-bash",
  deny: ["bash"],
  denyPaths: ["**/.env", ...],
  denyCommands: ["^rm\\s+-rf\\s+/", ...],
  sensitivePatterns: ["sk-[A-Za-z0-9]{20,}", ...],
  requireApproval: ["bash", "write"],
} as const;

// hooks pi 的 tool_call / tool_result 事件
(pi.on as any)("tool_call", async (event, ctx) => { ... });
(pi.on as any)("tool_result", async (event) => { /* redact */ });
```

## 设计原则（也是边界）

1. **Pi 是 source of truth。** Pilot 永远不复制 Pi 的 session / package / model / settings —— 它读，但几乎不写。
2. **`~/.pilot/` 是 Pilot 自己的。** 不污染 `~/.pi/agent/`，除非用户显式 `apply`。撤销就是 `unapply` + 删 TOML。
3. **不抓取闭源产品的内部实现。** 我们复刻的是"公开可观察的工作流行为"，不是源码。
4. **不承诺"等价 Claude Code"。** 表述永远是 "inspired by"，每个 capability 都标 L1 / L2 / L3 / L4 来自程度。
5. **Pilot 是 management plane，不是 runtime interceptor。** 我们不替你跑 pi。pi 该崩还是崩 —— 我们只是让你知道它崩了、为什么崩、怎么避免下次。

## 路线图（实际跑过的）

- ✅ v0.1-v0.4.0：包、会话、profile、server、Web UI、stats、capability、forge
- ✅ v0.4.2：**usage + tool + context** — 看 pi 在花多少钱、看它能调啥工具、看 AGENTS.md 是否加载
- ✅ v0.4.3：**policy** — 真·能 enforce 的策略，TOML → pi extension 闭环
- ✅ v0.4.4：**compose** — 视觉画布，把 entities 拖到 sandbox 摆着
- ✅ v0.4.5：**cozy 2.5D skin** — `/compose` 一键切到 cream/sage 沙盘
- ⏭️ v0.5：edit policy in browser、block-to-block 箭头、sandbox rotate/zoom

完整 roadmap：[`docs/roadmap-pi-grounded.md`](./docs/roadmap-pi-grounded.md)。

## 数字

- **260 / 260** 单测（`npm run test:offline` ~2 秒跑完）
- **TypeScript strict 0 errors**
- **22 / 22** Web vitest
- Web build 17 个路由
- 0 网络依赖（CI 全 green 用 `PILOT_SKIP_NETWORK=1`）

## 开发者入门

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot
npm install
npm run dev -- doctor        # tsx 直接跑 src/cli.ts
npm run test:offline         # 全部单测，离线 1.6 秒
npm run build                # tsc → dist/
```

目录结构（5 秒看懂）：

```
src/
  core/        # PilotService + 所有数据模型（policy / tool / session / …）
  commands/    # CLI 子命令；每个文件 export {manifest, run}
  server/      # Fastify HTTP API（127.0.0.1:17361）
  utils/       # logger / io / shell helpers
  cli.ts       # 入口
web/
  src/app/     # Next.js App Router 页面（/ /compose /policy / …）
  src/lib/     # 类型 + pilot client helper
tests/
  setup.ts     # jsdom + localStorage polyfill
```

## 文档

- [`PILOT.md`](./PILOT.md) — 30 秒设计总览
- [`docs/vision.md`](./docs/vision.md) — Pilot 是什么、不是什么、长期形态
- [`docs/architecture.md`](./docs/architecture.md) — 模块边界 + 安全模型
- [`docs/roadmap-pi-grounded.md`](./docs/roadmap-pi-grounded.md) — 已对齐 pi 真实能力、不脑补的 roadmap
- [`docs/visual-style.md`](./docs/visual-style.md) — 3 层视觉栈（modern canvas + 2.5D cozy + real web UI）

## 贡献

[`CONTRIBUTING.md`](./CONTRIBUTING.md) 说了流程。简单版：

1. `npm run dev -- <cmd>` 验证 CLI 工作
2. `npm run test:offline` 全过
3. `npm run format` + `npm run lint` 全过
4. PR 描述里写「为什么」「怎么测」

## 许可

[MIT](./LICENSE) © 2026 Pilot Contributors