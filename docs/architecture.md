# Architecture

> v0.1 单包结构。v0.2 起转为 pnpm monorepo（实际已 flatten 回单包，详见 src/）。

## 1. 边界（最重要的部分）

### `~/.pi/agent/`（Pi 拥有，Pilot 通过 extension 协作）

| 路径 | Pi 写 | Pilot 读 | Pilot 写 |
|---|---|---|---|
| `extensions/pilot-tools.ts` | ❌ | ✅ | ⚠️ **仅 symlink**（v0.5.4+ NEW；指到 `~/.pilot/extensions/pilot-tools.ts`） |
| `extensions/其他` | ✅ | ✅ | ❌（用 `pi install`） |
| `skills/` | ✅ | ✅ | ❌ |
| `prompt-templates/` | ✅ | ✅ | ❌ |
| `themes/` | ✅ | ✅ | ❌ |
| `sessions/**/*.jsonl` | ✅ | ✅ | ❌ |
| `settings.json` | ✅ | ✅ | ⚠️ 仅在用户显式 `apply` 时 |
| `models.json` | ✅ | ✅ | ⚠️ 同上 |

### `~/.pilot/`（Pilot 自己维护）

```
extensions/         # v0.5.4 NEW: pilot-tools.ts 真源（source of truth）
                    # ~/.pi/agent/extensions/pilot-tools.ts 软链到这里
teams/                # Meta-pack TOML（v0.2）
profiles/             # 命名 profile（v0.3）
capabilities/         # 能力库（v0.4）
avatars/              # 分身配置（v0.5）
cache/                # npm registry 缓存、UI 临时数据
logs/                 # Pilot 自己日志
runtime/              # Avatar 临时 runtime（v0.5）
```

### `<cwd>/.pilot/`（项目级，gitignore 友好）

```
profile.toml          # 项目级 profile 覆盖（v0.3）
forge-state.json      # 当前项目能力使能快照（v0.4）
runtime/              # 临时 runtime 隔离（v0.5）
```

**关键原则**（v0.5.4 修正）：
- Pilot 不复制 Pi 的 session、package、model、settings
- Pilot 可以创建自己的配置目录、缓存、能力库、**extension 真源**
- Pilot 通过软链把 extension 暴露给 Pi；**只暴露 pilot-tools.ts**（不污染 Pi 的 extension 目录）
- Profile 默认用 overlay，**不直接 patch 全局 settings.json**
- 只有用户显式执行 `pilot profile apply` / `pilot avatar apply` 时，才写入 `~/.pi/agent/`
- Pilot **不替代** Pi 跑活，但是 Pi 跑活的最佳搭档（双向桥）

## 2. 目录结构（v0.2 起 monorepo）

```
pilot/                         # repo root
├── packages/
│   ├── core/                  # PilotService interface + 实现（共享）
│   │   ├── capability.ts      # Capability 数据模型（v0.2 第一刀）
│   │   ├── service.ts         # PilotService interface
│   │   ├── service-impl.ts    # 默认实现（调 core/*）
│   │   ├── settings.ts        # 读 ~/.pi/agent/settings.json
│   │   ├── jsonl-parser.ts    # 流式 session 解析
│   │   ├── sessions.ts        # 会话目录扫描
│   │   ├── npm-registry.ts    # npm search / get
│   │   ├── pi-cli.ts          # pi 子进程包装
│   │   ├── conflict-detector.ts
│   │   └── types.ts
│   │
│   ├── cli/                   # pilot CLI（v0.1 在这里）
│   │   ├── src/
│   │   │   ├── cli.ts
│   │   │   └── commands/
│   │   │       ├── pack.ts
│   │   │       ├── session.ts
│   │   │       ├── doctor.ts
│   │   │       ├── profile.ts    # v0.3
│   │   │       ├── stats.ts      # v0.3
│   │   │       ├── forge.ts      # v0.4
│   │   │       └── avatar.ts     # v0.5
│   │   └── package.json
│   │
│   ├── server/                # pilot server（v0.2）
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── packs.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── profiles.ts
│   │   │   │   ├── doctor.ts
│   │   │   │   ├── stats.ts
│   │   │   │   ├── capabilities.ts  # v0.4
│   │   │   │   └── avatars.ts       # v0.5
│   │   │   ├── auth.ts        # token + Origin 校验
│   │   │   └── csrf.ts
│   │   └── package.json
│   │
│   └── web/                   # Next.js UI（v0.3.5）
│       ├── app/
│       │   ├── (dashboard)/page.tsx
│       │   ├── packages/page.tsx
│       │   ├── sessions/page.tsx
│       │   ├── sessions/[id]/page.tsx
│       │   ├── capabilities/page.tsx      # v0.4
│       │   ├── avatars/page.tsx           # v0.5
│       │   └── layout.tsx
│       ├── components/
│       │   ├── session-tree.tsx           # React Flow DAG
│       │   ├── package-card.tsx
│       │   ├── conflict-badge.tsx
│       │   └── avatar-diff.tsx            # v0.5
│       ├── lib/
│       │   └── api.ts
│       └── package.json
│
├── test/                      # 跨包测试
├── docs/                      # 文档
├── examples/                  # 示例
└── package.json               # root, pnpm workspace
```

## 3. 核心接口（v0.2 必出）

```typescript
// packages/core/src/service.ts
export interface PilotService {
  // Packs
  listPacks(): Promise<InstalledPack[]>;
  searchPacks(query: string): Promise<Pack[]>;
  getPack(name: string): Promise<Pack | null>;
  installPack(source: string): Promise<void>;
  uninstallPack(source: string): Promise<void>;

  // Sessions
  listSessions(filter?: SessionFilter): Promise<SessionInfo[]>;
  searchSessions(query: string): Promise<Array<{ info: SessionInfo; hits: number }>>;
  readSessionTree(id: string): Promise<SessionTree>;
  exportSession(id: string, format: 'html' | 'md'): Promise<string>;

  // Profile (v0.3)
  listProfiles(): Promise<Profile[]>;
  getProfile(name: string): Promise<Profile | null>;
  setProfile(name: string, profile: Profile): Promise<void>;
  applyProfile(name: string): Promise<void>;     // 写回 ~/.pi/agent

  // Stats (v0.3)
  getStats(range: StatsRange): Promise<StatsReport>;

  // Doctor
  runDoctor(): Promise<DoctorReport>;
  doctorFix(issueId: string): Promise<boolean>;

  // Capability (v0.4)
  listCapabilities(): Promise<Capability[]>;
  getCapability(id: string): Promise<Capability | null>;
  searchCapabilities(query: string): Promise<Capability[]>;

  // Avatar (v0.5)
  listAvatars(): Promise<Avatar[]>;
  getAvatar(id: string): Promise<Avatar | null>;
  runAvatar(id: string, options?: AvatarRunOptions): Promise<void>;
}
```

**为什么先于 UI/server 抽象这个**：
- CLI / server / UI 三入口共享一份实现
- 单元测试好写（mock 一个 service 即可）
- Forge / Avatar 后续功能直接消费

## 4. 启动流程（v0.2 起）

```
pilot                  # CLI
  └─ buildService()
     └─ new PilotServiceImpl()

pilot server           # 启动 HTTP server
  └─ buildService()
  └─ new Fastify({ ... })
  └─ routes/*
  └─ 只监听 127.0.0.1:17361

pilot ui               # 启动 server + 开 Web UI
  └─ spawn pilot server (subprocess)
  └─ 读 server token
  └─ open http://127.0.0.1:17361?token=...
```

## 5. 安全模型（v0.2 必出）

### 5.1 网络

- **只监听 127.0.0.1:17361**（不暴露到 0.0.0.0）
- CORS 白名单：`http://127.0.0.1:17361`（自己）
- 不支持 HTTPS（本地不需要）
- 启动时检查端口占用，提示用户换端口

### 5.2 鉴权

```
server 启动
  ↓
生成 32 字节随机 token
  ↓
写到 ~/.pilot/server.token (chmod 600)
  ↓
所有 HTTP 请求必须带 X-Pilot-Token 头
  ↓
不匹配 → 401
```

**Web UI**：
- 启动时 `pilot ui` 读 token
- 第一次 GET / 带上 `?token=...` 一次性回传
- 前端把 token 存到 `localStorage`（仅本域）
- 所有 fetch 自动带 `X-Pilot-Token`

### 5.3 写操作额外保护

| 接口 | 额外要求 |
|---|---|
| `POST /packs/install` | Origin 校验 + CSRF token |
| `POST /packs/uninstall` | 同上 |
| `POST /profiles/*` | 同上 |
| `POST /sessions/gc` | 同上 |
| `POST /doctor/fix` | 同上 |
| `POST /capabilities/*` | 同上 |
| `POST /avatars/*` | 同上 |

**CSRF**：
- GET 请求需要 token
- POST 请求需要 token + `X-Pilot-CSRF` 头
- CSRF token 在第一次 GET / 时下发，存到 cookie

**Origin 校验**：
- 只接受 `http://127.0.0.1:17361` 和 `http://localhost:17361`
- 跨域 POST 一律拒绝

### 5.4 文件权限

- `~/.pilot/server.token` — `chmod 600`
- `~/.pilot/profiles/*.toml` — `chmod 600`
- `~/.pilot/capabilities/` — `chmod 700`（目录）

## 6. 数据流

### 6.1 读路径

```
Pilot CLI
  └─ PilotService.listSessions()
     └─ read ~/.pi/agent/sessions/<encoded>/*.jsonl   (read-only)
     └─ parse + return SessionInfo[]
```

### 6.2 写路径（安装包）

```
Pilot CLI
  └─ PilotService.installPack('npm:pi-subagents')
     └─ exec `pi install npm:pi-subagents`            (Pi 自己写)
     └─ return success/failure
```

### 6.3 Profile overlay 路径

```
Pilot CLI
  └─ PilotService.applyProfile('work-frontend')
     ↓
     读 ~/.pilot/profiles/work-frontend.toml
     ↓
     与 ~/.pi/agent/settings.json 合并
     ↓
     生成 ~/.pilot/runtime/overlay-<uuid>/
     ↓
     提示用户：Preview changes? [Y/n]
     ↓
     Y → 写入 ~/.pi/agent/settings.json
     N → 不动
```

**默认行为**：只生成 overlay，不写回。要写回必须显式 confirm。

## 7. 错误处理

- **Pi 不在 PATH** → 提示安装（不 throw）
- **settings.json 损坏** → 提示用户备份后重试
- **会话文件损坏** → 跳过该文件，其他继续
- **npm registry 超时** → 30s timeout，提示稍后重试
- **server 端口占用** → 提示换端口（`--port 17362`）

## 8. 测试策略

- **core/** — 100% 单测（JSONL parser 必须 100%）
- **cli/** — 关键命令有 e2e
- **server/** — 路由级集成测试
- **web/** — 关键页 Playwright e2e
- **整体** — CI 跑 lint + typecheck + test + build，跨 macOS / Linux × Node 20/22

## 9. 性能目标

| 操作 | 目标 |
|---|---|
| `pilot pack ls` | < 100ms |
| `pilot pack search` | < 2s（含 npm 一次往返） |
| `pilot session ls` | < 500ms（100 个会话） |
| `pilot session search` | < 5s（100 个会话，8 路并发） |
| `pilot doctor` | < 1s |
| Web UI 首屏 | < 2s（127.0.0.1 局域网） |
| Session DAG 渲染 | < 1s（500 节点） |