# v0.5.7 — Agent capability layer (Plan data model + CLI baseline)

Shipped 2026-07-07. Pilot 升级为**自主智能体工具**的第一块砖：把"执行计划"这个概念从文档里落到可用的数据模型、CRUD、CLI、HTTP API、JSONL 事件日志。

执行引擎本身（真正跑 Task、Step、反馈循环）留给 v0.6.0 —— v0.5.7 把地基打好。

## What's new

### Plan 数据模型 — `Plan / Task / Step` 三层结构

一个 Plan 把用户目标分解为有序 Tasks，每个 Task 有自己的 Steps，每个 Step 有强类型的 action：

- **`Plan`** = `{ id, goal, title, status, strategy, tasks[], context, startedAt, completedAt, result? }`
- **`Task`** = `{ id, description, status, steps[], dependsOn[], profile?, requiredTools[], result? }`
- **`Step`** = `{ id, description, action, status, input, output?, retryCount, maxRetries, startedAt?, completedAt? }`
- **`StepAction`** 8 种类型（Zod discriminated union）：
  - `pilot_command` — 跑一个 Pilot CLI 命令
  - `pi_session` — 起一个 Pi 会话跑 prompt
  - `profile_switch` — 切换 Profile
  - `pack_install` — 装包
  - `policy_apply` — 应用策略
  - `condition` — 条件分支（sub-steps 存 raw JSON，避开 Zod 循环引用）
  - `wait` — 等外部条件
  - `manual` — 需要人工介入

存储格式是 TOML，路径 `~/.pilot/plans/<id>.toml`。运行时快照目录 `~/.pilot/runtime/plans/` 已建好（v0.6.0 执行器会真正写进去）。

### 工具推荐 — `pilot plan suggest-tools`

基于目标描述关键词匹配可用工具和 Profile。当前是 v0.5.7 基线（纯字符串匹配），LLM-based 匹配留给 v0.6.0。

```bash
$ pilot plan suggest-tools "read and parse CSV"
✓ Matched tools:
  read (built-in/safe)
  bash (built-in/unsafe)
```

### CLI 命令 — `pilot plan` 全套

```bash
pilot plan new "实现用户登录功能"          # 创建计划
pilot plan ls                             # 列出所有计划
pilot plan show <id>                      # 详情（Tasks / Steps / 状态）
pilot plan run <id>                       # 开始执行
pilot plan pause <id>                     # 暂停
pilot plan resume <id>                    # 恢复
pilot plan cancel <id>                    # 取消
pilot plan delete <id>                    # 删除
pilot plan suggest-tools "解析 CSV"       # 推荐工具
```

CLI 全部走 `ctx.service`，不是直接调 `core/plan.ts`。这样事件日志 + 状态校验 + 未来执行器钩子全白嫖。

### HTTP API — 15 个新端点

```
POST   /plans                      # 创建
GET    /plans                      # 列表
GET    /plans/:id                  # 详情
PUT    /plans/:id                  # 更新
DELETE /plans/:id                  # 删除

POST   /plans/:id/start            # 开始执行
POST   /plans/:id/pause            # 暂停
POST   /plans/:id/resume           # 恢复
POST   /plans/:id/cancel           # 取消

PUT    /plans/:id/tasks/:taskId    # 更新单个任务
PUT    /plans/:id/tasks/:taskId/steps/:stepId   # 更新单个步骤

POST   /plans/suggest-tools        # 推荐工具
```

### 事件日志 — JSONL

每个生命周期动作都写一条 JSONL 事件到 `~/.pilot/plans-history/<plan-id>_<timestamp>.jsonl`：

```
{"timestamp":"...","planId":"...","type":"plan_created","data":{"goal":"...","strategy":"..."}}
{"timestamp":"...","planId":"...","type":"plan_started","data":{}}
{"timestamp":"...","planId":"...","type":"plan_paused","data":{}}
{"timestamp":"...","planId":"...","type":"plan_resumed","data":{}}
{"timestamp":"...","planId":"...","type":"plan_cancelled","data":{}}
{"timestamp":"...","planId":"...","type":"plan_deleted","data":{}}
```

未来 v0.6.0 执行器可以从事件日志回放 + 决定下一步。

## Bugs fixed

v0.5.7 在 review 远程 commit `5e87d2b`（自己之前 push 的）的过程中抓到了 3 个 bug，全部已修：

### Bug 1 — `readPlan` 永远返回 null（严重）

`writePlan` 把 `id` 从 TOML 里剥掉了（对的，文件名就是 id），但 `readPlan` 调 `PlanSchema.parse(data)`，schema **要求 `id`** → `try/catch` 吞掉 → 返回 null → `plan ls` 显示空，`plan show <id>` 说找不到。

dogfood 复现：建了一个 plan，文件落盘了，但 `ls` 和 `show` 都报错。

修法：`readPlan` 里 parse 前把 id 塞回去。

### Bug 2 — CLI 绕开 service 层，事件日志全空 + 状态变更丢失（高）

`pilot plan run/pause/resume/cancel` 直接调 `writePlan`，没走 `service.startPlan/...`。后果：

1. **CLI 路径下 JSONL 事件日志全空**——`appendPlanEvent` 在 service-impl 里调了 6 次，commands/plan.ts 里 **0 次**。
2. **`plan run` 里 `task.status = "blocked"` 是内存里改的，从来没落盘**——`writePlan` 在循环之前就调完了，循环里改的 blocked 状态直接蒸发。
3. 校验不对称：service 层会在 `pause` 时拒绝非 running 状态，CLI 也拒绝但错误文案不一样。

修法：CLI 命令全部走 `ctx.service.<method>()`。

### Bug 3 — `service.deletePlan` 不发 `plan_deleted` 事件（中）

`createPlan/start/pause/resume/cancel` 都打日志，就 `deletePlan` 不打。修法：`deletePlanFromHome` 加一行 `appendPlanEvent({ type: "plan_deleted" })`。

### Bonus — `generatePlanId` 句号 bug（测试抓到）

原代码 `now.toISOString().replace(/[-:T]/g, "").slice(0, 15)` 没剥掉 `.` 和 `Z`，导致 ID 里夹了句号（"20260707135522._xxx"）。改成 `[-:T.Z]` + slice(0, 15)，输出纯数字时间戳。

## Internals

### CLI 重构

`src/commands/plan.ts` 从 536 行减到 450 行（净减 86）。所有生命周期操作走 `ctx.service`，不再直接调 `core/plan.ts` 的 `writePlan/readPlan`。新增 `handleServiceError()` helper 统一处理 service 抛出的错误。

### 文件改动统计

```
README.md                  |   8 +-
docs/roadmap-agent.md      |   7 +-
docs/roadmap.md            |  38 +++---
src/commands/plan.ts       | 228 +++++++++++----------------------
src/core/plan.ts           |  15 ++-
src/core/service-impl.ts   |  16 ++-
test/unit/commands.test.ts | 310 ++++++++++++++++++++++++++++++++++++++++++++-
test/unit/plan.test.ts     | 355 ++++++++++++++++++++++++++++++++++++++++  (新)
```

## Tests

- **Core: 474/476 passing**（v0.5.6 是 454/456；+20 plan 测试，2 个 forge 老失败仍未修，不在 v0.5.7 范围）
- **Web: 100/100 passing**（v0.5.7 没碰 web）

新测试：

- **`test/unit/plan.test.ts` (NEW, 23 tests)** — 覆盖：
  - Bug 1 回归（`readPlan` 注入 id）
  - `writePlan` 保留 `createdAt`、自动生成 `updatedAt`、校验 goal 必填
  - `listPlans` 在目录缺失时返回 `[]`，按 `updatedAt` 倒序
  - `deletePlan` 文件存在/不存在分支
  - `generatePlanId` 格式（15 位数字 + `_` + 6 位随机）
  - `deriveTitle` 剥前缀、截断到 60 字符
  - `suggestTools` 关键词匹配 + 大小写不敏感 + 工具/Profile 分别匹配
  - `appendPlanEvent` 文件名格式 + JSONL 多事件追加
  - `ensurePlanDirs` 创建 3 个子目录

- **`test/unit/commands.test.ts` (+15 tests)** — CLI 子命令：
  - `plan new` 调 `service.createPlan`，无 goal 返 1
  - `plan ls/show/run/pause/resume/cancel/delete` 全部走对应 service 方法
  - `plan run` service 抛错时 CLI 返 1（错误透传）
  - `plan suggest-tools` 调 `service.suggestTools`，无 goal 返 1
  - `plan delete` service 返回 false 时返 1

## 安装

```bash
npm install -g pilot@0.5.7
# pilot plan new / ls / show / run / pause / resume / cancel / delete
# HTTP API: GET/POST/PUT/DELETE /plans + /plans/:id/{start,pause,resume,cancel}
```