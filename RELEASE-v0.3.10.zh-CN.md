# Pilot v0.3.10 — Web UI v1、Capabilities 只读、发布流程

[pi.dev](https://github.com/mariozechner/pi-coding-agent) 的本地读写控制台。Pilot 是 pi 旁边的"管理平面"：能看见 pi 在做什么（sessions / packs / profiles / capabilities / stats），也能改它（装包、改 profile），不用离开终端——也可以不开浏览器。

这一版**完整收口 v0.3 line**。包括：第一个浏览器控制台、完整的读写 Server Actions + CSRF 防护、只读 Capability 表面、跨 macOS+Ubuntu × Node 20/22/24 的干净 CI 矩阵、跑得通的 release-please 流程。

**Tag：** `v0.3.10` · **发布日期：** 2026-07-02 · **License：** MIT

---

## 新增内容

### 🛰 Web UI v1（v0.3.5）

第一个浏览器控制台，Next.js 16 + Tailwind CSS 4 + React 19 写。Server-rendered — 你的 session 数据不出本机。

- **Dashboard** —— 今日 sessions / messages / tool calls、模型/工具 Top、近期 sessions。每 10s 自动刷新。
- **Package Center** —— 已装的 pack + npm registry 搜索；详情页有 Install 按钮。
- **Session Explorer** —— session 列表 + 递归树视图（user → assistant → tool → tool → ... → assistant）。
- **Profile Manager** —— 通过网页表单 list / create / edit / delete named profiles。
- **Capabilities（v0.3.9）** —— 已装 Capability 的列表 + 详情（type、sources、conflicts、requires）。

同源代理，pilot 的 auth token 永远到不了浏览器。打开方式：

```bash
pilot dashboard
```

一个命令把 pilot server（127.0.0.1:17361）和 Web UI（127.0.0.1:17371）都拉起来，Ctrl-C 同时关掉。

### 🖱 Web 写操作（v0.3.6）

四个 Server Actions，带完整 CSRF 往返：

- `pilot pack install <name>` —— `/packages/[name]` 上的 `<form>`
- `pilot profile create / set` —— `/profiles` 和 `/profiles/[name]` 上的 `<form>`
- `pilot profile delete` —— `<DeleteButton>` 浏览器确认后提交，自动重新验证列表

CSRF 链路：Server Action → `GET /health`（拿到 `pilot-csrf` cookie + `X-Pilot-CSRF` header）→ `POST <path>`（两个都转发）。每次调用都重新取一次，server 重启透明。

### 🧩 Capability 只读（v0.3.9）

Capability 数据模型 + Zod schema 早在 v0.2-a 就有了，但没法列出来。v0.3.9 把读面补齐：

```bash
pilot capability ls            # 列出已装的 capability（带 type + title）
pilot capability show <id>     # 详情：sources、conflicts、requires、时间戳
```

Web 端：`/capabilities`（列表）+ `/capabilities/[id]`（详情）。完整的 Capability 生命周期（Forge / Eval / Install / Publish）放 v0.4。

### 🛡 发布流程 cleanup（v0.3.7 / v0.3.10）

- **版本号统一** —— `package.json` / `web/package.json` / Git tag / `/health` / `--version` 全部对齐
- **单元测试是单元测试了** —— `service-impl.test.ts` mock `readPackManifestCached`；`npm test` 不再读真 npm registry。网络测试在 `test/integration/` 里（按需：`npm run test:integration`）
- **CI 矩阵** —— `macos-latest × ubuntu-latest × Node {20, 22, 24}` = 6 个 job，矩阵里也跑 `web/` 子包
- **Build 干净** —— Next 16 的 eslint warning、lockfile warning、重复 `-p` 都没了
- **release.yml 修对** —— 删了无效的 `package-name` 输入（之前每次跑都报 "Unexpected input(s) 'package-name'" 警告）
- **integration tests 真正能跑了** —— 新加 `vitest.integration.config.ts`，`npm run test:integration` 真的能 pick up（之前的 script 是坏的，被默认 config 的 `exclude` 屏蔽了）

---

## 数字

- **28 个 commit**（自 v0.1.0 起）
- **149 unit + 4 integration + 9 web test** —— 本地全过；CI 矩阵 4 个连续 commit 全绿
- **6 CI jobs**（2 OS × 3 Node）—— `lint + typecheck + test + build` + `web: typecheck + test + build`
- **9 个 CLI 命令** + 1 个 subcommand（dashboard）
- **14 个 server route** + 4 个 server action
- **10 个 web 页面**

## CLI 速查

```bash
pilot pack ls                  # 已装 pack（按 manifest 分类）
pilot pack search pi-coding    # npm 搜索
pilot pack info <name>         # 详情
pilot pack install <name>      # 安装/更新

pilot session ls               # 列 sessions
pilot session tree <id>        # session DAG
pilot session search "fix bug" # 全文搜

pilot profile ls / show / create / set / delete
pilot stats today / week / month / all

pilot capability ls            # 已装 capability（v0.3.9）
pilot capability show <id>     # 详情

pilot server start / stop      # 127.0.0.1:17361
pilot dashboard [--no-open]    # 打开 Web UI（同时起 server）
pilot doctor                   # 健康检查
```

## Web 页面

```
/                  → Dashboard       (stats + recent + installed, 10s 自动刷新)
/packages          → Package Center  (list + npm 搜索)
/packages/[name]   → 详情 + install
/sessions          → Session 列表
/sessions/[id]     → Session 树
/profiles          → Profile 列表 + 新建表单
/profiles/[name]   → 详情 + 编辑表单 + 删除
/capabilities      → Capability 列表 (15s 自动刷新)
/capabilities/[id] → Capability 详情
```

## 架构

```
Browser  ─→  127.0.0.1:17371  (Next.js dev server, server-rendered React)
                  │
                  │  RSC fetch (token 不到浏览器)
                  ▼
              /api/pilot/*  (proxied via next rewrites)
                  │
                  │  + X-Pilot-Token (服务端注入)
                  ▼
  Server  ─→  127.0.0.1:17361  (pilot server, Fastify)
```

pilot token 永远到不了浏览器。读通过 `process.env.PILOT_TOKEN` 或 `~/.pilot/server.token` 服务端注入。写操作再加 `X-Pilot-CSRF`（double-submit cookie 模式）。

## 接下来

- **v0.4** —— Capability Forge：`forge search` / `forge inspect` / `forge absorb` / `forge eval` / `capability install / promote`
- **v0.5** —— Avatars：capability 被 promote 后就是 avatar；pi session 可以 `pilot run <avatar>`

## 安装

```bash
npm install -g pilot
pilot --version   # → 0.3.10
pilot doctor      # 应该全绿
pilot dashboard   # 浏览器打开 127.0.0.1:17371
```

## 本地验证

```bash
git clone https://github.com/wwppee/pilot.git
cd pilot

# 根
npm ci
npm test                  # 149 个单元测试
npm run test:integration  # 4 个 integration 测试（需要网络）
npm run typecheck
npm run build
npm run lint
npm run format:check

# web
cd web
npm ci
npm test
npm run typecheck
npm run build
```

## CI 状态

- 工作流：`.github/workflows/ci.yml` —— 6 jobs（2 OS × 3 Node）
- 工作流：`.github/workflows/release.yml` —— release-please，每次 push main 触发
- 运行历史：https://github.com/wwppee/pilot/actions

## GitHub 仓库设置（一次性的，需要在网页勾）

release workflow 要能开 PR + 写 release，仓库设置需要：

```
Settings → Actions → General
  ✓ Workflow permissions: Read and write permissions
  ✓ Allow GitHub Actions to create and approve pull requests
```

CI workflow 只需要读权限；release workflow 需要上面这两个。

— Mavis，代表 pilot 项目
