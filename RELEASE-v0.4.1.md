# Pilot v0.4.1 — Forge MVP (Search / Inspect / Absorb)

## 摘要

新增 `pilot forge` 命令集，把 pilot 从「看见 pi / 管理 pi」推进到「冶炼 pi」：
搜索、审查、把一个 npm 包吸收为可追踪、可演化的 Pilot capability。

## 新增命令

```bash
# 在 npm registry 里找候选（复用 ctx.service.searchPacks）
pilot forge search <query>

# 拉某个包的 manifest，把 `pi` 字段打出来，告诉你 absorb 会得到什么 mode
pilot forge inspect <name>

# 写一个 L1-referenced / L2-wrapped capability 到 ~/.pilot/capabilities/<id>/capability.json
pilot forge absorb <name> [--as <capability-id>]
```

- 默认 cap id：从 `name` 去掉 npm scope 转小写（如 `@wwppee/foo` → `foo`）
- `--as <id>` 显式覆盖；不合法（不是 kebab-case）会被拒
- mode 推断：`pi.extension` 存在 → L2-wrapped；否则 L1-referenced
- 写盘前过 `CapabilitySchema.safeParse`，失败立刻报错

## 端到端验证

```
$ pilot forge search subagent
ℹ 15 result(s):
  subagent                     1.1.1  TypeScript SDK for building agents that delegate to subagent
  opencode-subagent-statusline 1.2.0  OpenCode plugin that exposes subagent session statusline sta
  subagent-auto-manager        0.1.28  Codex subagent ledger CLI and hooks backed by SQLite.
  ...

$ pilot forge inspect pi-subagents
pi-subagents — v0.32.0
Pi extension for delegating tasks to subagents with chains, parallel execution, and TUI clarification
Manifest (`pi` field)
  kind:        (unset — falling back to name heuristic)
  sources:     none
  skills:      1 (./skills)
  prompts:     1 (./prompts)
Absorb would create a Capability with mode: L1-referenced (skill/theme/prompt)

$ pilot forge absorb pi-subagents --as subagents-delegation
✓ Absorbed pi-subagents as subagents-delegation

$ pilot capability show subagents-delegation
subagents-delegation — pi-subagents
  type:         integration
  sources:      1 source(s)
                - npm: npm:pi-subagents@0.32.0 [L1-referenced]
  created:      2026-07-02T09:47:21.385Z
  updated:      2026-07-02T09:47:21.385Z
```

## 范围

- L1-referenced（仅引用，不下载不构建）
- L2-wrapped（schema 标记为可包装，但本版本不下载源码）
- 不做：eval、build、install、运行（留给 v0.4.2+）

## kind → type 映射

| pack `pi.kind` | capability `type` |
|----------------|-------------------|
| `skill`        | `tool`            |
| `prompt`       | `workflow`        |
| `theme`        | `integration`     |
| `extension`    | `integration`     |
| (unset)        | `integration`     |

## 测试

- 10 个新单元测试（搜索 query 长度、结果渲染、inspect/absorb 错误路径、helper 逻辑）
- 43/43 单元测试通过；160/160 全部测试通过；build clean

## 文件

- 新增 `src/commands/forge.ts` (~270 行)
- `src/cli.ts`: 注册 `forgeCmd` 到 commands 数组
- `test/unit/commands.test.ts`: 新增 `pilot forge` describe 块
- `package.json`: version 0.4.0 → 0.4.1
