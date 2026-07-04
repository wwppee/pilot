# CLAUDE.md — Pilot 项目 AI Agent 指令

## 语言

- **思维链、推理、内心独白默认使用中文**。
- 给用户的最终回复也用中文（除非用户用其他语言提问）。
- 代码标识符、文件路径、CLI 命令、commit message、技术术语（`typecheck`、`coverage`、`L1-referenced`、`aggregateTokens` 等）保持英文原样，不要硬翻译。
- 文档、commit message、release notes 跟用户语言保持一致——用户用中文沟通就写中文。

## 项目背景

- Pilot = pi 的管理平面（management plane），不是 runtime interceptor。读 `~/.pi/agent/`，写 `~/.pilot/`。
- 不直接改 `~/.pi/agent/settings.json`，所有写入通过 `pi` CLI。
- 所有写操作走 PilotService；CLI 和 Web 共享同一份 core 逻辑（v0.4.14 起 forge 已统一）。
- 版本：`v0.4.14` 已发布，正在推进 `v0.5.0`。

## 工作约定

- 修改前先 read 现状，不要靠记忆下结论。
- 多步骤任务用 TodoWrite 跟踪，状态实时更新，不要批量补。
- 每个 task 完成立刻勾选，不要攒到最后。
- 写完一段代码就跑 tsc + 相关单元测试，别留到提交前一起。
- 改 web UI 一定要 i18n（en + zh-CN 都要加 dict key + 类型条目）。
- 创建/删除文件用 mavis-trash，不要 `rm`。

## 测试约定

- core 离线测试用 `npm run test:offline`（包含 `PILOT_SKIP_NETWORK=1`）。
- web 测试用 `npm test`（在 `web/` 目录下）。
- RTL 测试要 import `cleanup` 并在 setup.ts 的 `afterEach` 里跑——不写会出现 "Found multiple elements"。
- 用 `dangerouslySetInnerHTML` 时必须先 HTML-escape，避免 session preview 等用户内容注入 XSS。

## 提交约定

- Conventional Commits：`feat` / `fix` / `chore` / `docs` / `refactor`。
- 一个 commit 一个主题。版本 bump 单独 commit。
- Release：`scripts/release.sh <patch|minor|major>`，或手动 bump + `git tag -a` + GitHub Release（`gh` 未装时用 `python3 urllib.request` 调 API）。
- Release notes 写 `RELEASE-vX.Y.Z.md`，commit message 写 `docs: RELEASE-vX.Y.Z.md`。

## 详细文档

- 项目背景、设计、roadmap 在 `PILOT.md`、`docs/roadmap-pi-grounded.md`、`docs/forge-and-avatars.md`。
- 用户旅程审计 P0/P1/P2 列表在 memory（agent memory）里有快照。
- 公开 API 全部在 `src/core/service.ts`，新增方法先加接口，再加实现，再加 server 路由，最后加 Web。