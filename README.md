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

# 2. 首次引导（探测环境 + 创建 ~/.pilot/ + 打印 cheatsheet）
pilot init
# 或直接起 + 引导（后台跑 server）
pilot init --start

# 3. 体检
pilot doctor
# → 7 项检查：Node / pi / fd / ~/.pi/agent / settings / sessions / etc.

# 4. 一键起 dashboard（同时启动 server + Web UI）
pilot dashboard
# 生产模式（先 next build，再 next start）
pilot dashboard --prod
```

打开浏览器 → 看到 Dashboard（今日消耗） / Packages / Sessions / Usage / Tools / Context / Policy / Compose 8 个页面。

## 命令清单

> `pilot --help` 看完整列表；`pilot <cmd> --help` 看子命令。

| 命令 | 一句话 | 何时用 |
|---|---|---|
| `pilot init` | 首次引导（探测 + 建目录 + 打印 cheatsheet） | **装完第一件事** |
| `pilot init --start` | 引导 + 后台起 server | 想要 token 但不想开 dashboard |
| `pilot doctor` | 健康检查 | 排查奇怪行为 |
| `pilot dashboard` | 起 server + Web UI (dev mode) | 自己用 |
| `pilot dashboard --prod` | 生产模式：先 build 再 start | 跟别人分享、自托管 |
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

## 给别人用：dashboard --prod + standalone build

`pilot dashboard` 默认是 `next dev`（hot-reload，适合自己）。要给别人用：

```bash
# 选项 1：dev build 跑生产模式（推荐个人分享）
pilot dashboard --prod
# → 自动 next build（首次），然后 next start
# → 比 next dev 启动快 3-5 倍

# 选项 2：standalone Docker build（推荐 server 部署）
NEXT_OUTPUT_STANDALONE=1 npm run build --prefix web
cp -r web/.next/static web/.next/standalone/web/.next/static
cp -r web/public web/.next/standalone/web/public   # if applicable

# 启动（约 10x 小于完整项目）
PORT=17371 PILOT_SERVER_URL=http://127.0.0.1:17361 \
  node web/.next/standalone/web/server.js
```

`pilot dashboard --prod` 额外 flags：
- `--port N`：改 web 端口（默认 17371）
- `--no-open`：不开浏览器
- `--no-server`：假设 server 已在跑（自动化部署时用）
- `--no-build`：跳过 build，用现有 `.next/`（快速重启）

## 开发者入门

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot
npm install
npm run dev -- doctor        # tsx 直接跑 src/cli.ts
npm run test:offline         # 全部单测，离线 1.6 秒，270 tests
npm run build                # tsc → dist/
```

发版（v0.4.6+ 一条命令）：

```bash
./scripts/release.sh 0.4.6            # 自动 bump + test + tag + GitHub release
./scripts/release.sh patch            # 自动 bump patch
./scripts/release.sh --dry-run 0.4.6 # 看流程不真改
```

目录结构（5 秒看懂）：

```
src/
  core/        # PilotService + 所有数据模型（policy / tool / session / …）
  commands/    # CLI 子命令；每个文件 export {manifest, run}
  server/      # Fastify HTTP API（127.0.0.1:17361）
  utils/       # logger / io / net / shell helpers
  cli.ts       # 入口
web/
  src/app/     # Next.js App Router 页面（/ /compose /policy / …）
  src/lib/     # 类型 + pilot client helper
scripts/
  release.sh        # 一键发版（v0.4.6+）
  make-release.sh   # 老的手工发版（保留兼容）
tests/             # 单测
```

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

### CLI 路线

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

### Web 路线（v0.4.7+）

不想用 CLI？直接打开 dashboard：

```
http://localhost:17371/policy                  # 列出所有 policy
http://localhost:17371/policy/safe-bash/edit   # 编辑现有 policy
```

`/policy/[name]/edit` 提供 7 个表单 sections (description + 6 个规则数组)，textarea 一行一项：
- 写完按「Save changes」 → PUT /policies/safe-bash
- 按「Apply (generate extension)」 → 立即生成 pi extension
- 按「Unapply」 → 撤回 extension（TOML 保留）
- 按「Delete」 → 删 TOML（小心）

所有写入操作都走 Next.js `/api/pilot/*` 路由 → server-side 注入 pilot token，**浏览器永远拿不到 token**。

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
- ✅ v0.4.6：**init + dashboard --prod + release.sh** — 首次引导 + 生产模式 + 一键发版
- ✅ v0.4.7：**edit policy in browser + browser API proxy** — policy 编辑搬上 Web；浏览器透过 Next.js `/api/pilot/*` 代理访问 server，token 永远在 server 侧
- ⏭️ v0.5：block-to-block 箭头、sandbox rotate/zoom、policy 版本控制

完整 roadmap：[`docs/roadmap-pi-grounded.md`](./docs/roadmap-pi-grounded.md)。

## 数字

- **270 / 270** 单测（`npm run test:offline` ~6 秒跑完，离线，0 网络）
- **43 / 43** Web vitest（v0.4.8 加了 23 个 axe-core a11y 测试）
- **TypeScript strict 0 errors**
- Web build 18 个路由
- 14 个 CLI 命令（init / dashboard / server / pack / session / profile / stats / usage / tool / context / policy / capability / forge / doctor）
- 1 条命令发布：`./scripts/release.sh <version>`

## 可访问性（v0.4.8 起）

Web UI **WCAG 2.1 AA 通过**，axe-core 自动检查 23 项全过。

键盘全可用（不再依赖鼠标）：

| 位置 | 按键 | 作用 |
|---|---|---|
| 任意页面 | `Tab`（第一次） | 显示 "跳到主要内容" 链接 |
| 任意页面 | `Tab` | 看到 focus 环（`:focus-visible` 蓝圈） |
| `/compose` | 焦点在侧边栏 + `Enter` | 把 block 加到画布中央（不需拖拽） |
| `/compose` | 焦点在画布 + `方向键` | 选中 block 移动 5 px（`Shift+方向键` 20 px） |
| `/compose` | 选中 block + `Delete` | 删除 |
| `/compose` | 选中 block + `Escape` | 取消选中 |
| 任意表单 | 输入框旁文字 | 每个字段都有 `<label htmlFor>` 关联 |
| 任意表单 | 错误信息 | `role="alert"` 自动朗读 |
| 任意操作 | 状态变化 | `role="status"` 自动朗读（"保存成功"、"已删除"） |
| 删除按钮 | 第一次点击 | 变成 "确认删除?"（5 秒不动就还原） |
| 系统设置 | 开 "减弱动态效果" | Cozy 模式的方块浮起、过渡全停 |

对辅助技术的支持：

- **屏幕阅读器**（VoiceOver / NVDA / JAWS）：所有动态状态都有 `aria-live` 实时通报；图标用 `aria-hidden`；状态点用 `role="status"`
- **Windows 高对比度模式**：`@media (forced-colors: active)` 自适应系统配色
- **键盘**：每个交互元素 Tab 都到；`tabIndex` 顺序符合视觉顺序；`:focus-visible` 区分键盘 vs 鼠标
- **色觉**：状态不只靠颜色——文字 + `role` 同时表达

本地跑 a11y 测试：

```bash
cd web && npx vitest run tests/a11y.test.tsx
# 23 tests, <200ms
```

## 开发者入门

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot
npm install
npm run dev -- doctor        # tsx 直接跑 src/cli.ts
npm run test:offline         # 全部单测，离线 ~7 秒
npm run build                # tsc → dist/
```

发版（v0.4.6+ 一条命令）：

```bash
./scripts/release.sh 0.4.6            # 自动 bump + test + tag + GitHub release
./scripts/release.sh patch            # 自动 bump patch
./scripts/release.sh --dry-run 0.4.6 # 看流程不真改
```

目录结构（5 秒看懂）：

```
src/
  core/        # PilotService + 所有数据模型（policy / tool / session / …）
  commands/    # CLI 子命令；每个文件 export {manifest, run}
  server/      # Fastify HTTP API（127.0.0.1:17361）
  utils/       # logger / io / net / shell helpers
  cli.ts       # 入口
web/
  src/app/     # Next.js App Router 页面（/ /compose /policy / …）
  src/lib/     # 类型 + pilot client helper
scripts/
  release.sh        # 一键发版（v0.4.6+）
  make-release.sh   # 老的手工发版（保留兼容）
tests/             # 单测
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
2. `npm run test:offline` 全过（**必须** — 这是 CI 的命令）
3. `npm run format` + `npm run lint` 全过
4. PR 描述里写「为什么」「怎么测」

## 许可

[MIT](./LICENSE) © 2026 Pilot Contributors