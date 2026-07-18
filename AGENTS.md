# AGENTS.md — Pilot 项目开发脚手架

> 给任何 agent（AI 或人类）接手 pilot 项目的"入职文档"。
> 把过去 14 个 minor 版本积累的所有工程教训集中在这里 —— 不是设计文档，是**实操避坑清单**。
>
> **生命周期**：
> - 每次新 release → 回写新教训到对应章节
> - 每次新 agent 接手 → 先 read 这文件（5-10 分钟），再 read memory/pilot.md（10-15 分钟）
>
> **目标**：
> 1. 保证核心功能正常 —— 降低 agent 开发导致的项目功能崩坏
> 2. 把 agent 错误总结出来 —— 做成合格脚手架，可复用，提高效率，节省 agent 调用

---

## 0. 30 秒判断题

- pilot 是什么：pi-coding-agent 的 management plane（CLI + Web UI）—— **不拦截 pi runtime**
- 仓库：`github.com/wwppee/pilot`（npm 名 `pilot`）
- 当前版本：v0.9.4
- 沙盒限制：可能不能 `git push` / `npm publish` / 起 `pilot start`（见 §9）

---

## 1. Project snapshot

### 1.1 仓库结构

| Path | 用途 |
|---|---|
| `src/` | Node CLI + Fastify server，~50 core files，ESM |
| `web/` | Next.js 16 app router，~20 routes + ~30 components |
| `test/unit/` | root vitest 测试（541 个）|
| `web/tests/` | web vitest 测试（214 个）|
| `docs/` | roadmap / design / archive |
| `scripts/` | release.sh + helper scripts |

### 1.2 关键技术决策

- **ESM**（`"type": "module"`）
- **严格 TypeScript**（`exactOptionalPropertyTypes: true`）
- **Zod schema 双向**（read + write）
- **持久化**：JSON files under `~/.pilot/...`
- **i18n**：三文件（`types` / `dict.en` / `dict.zh`），无 runtime library
- **Pilot = management plane**（不拦截 pi runtime，HITL 走 pi extension API）

### 1.3 关键路径

| Path | 内容 |
|---|---|
| `~/.pilot/server.token` | server 鉴权 |
| `~/.pilot/compose-boards/<id>.json` | /compose board 持久化 |
| `~/.pilot/plan/` | plan 状态 |
| `~/.pilot/policy/` | tool policies |
| `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/` | pi 安装位置 |

---

## 2. Pre-dev checklist (mandatory)

### 2.1 动手前必读 4 件事（10-15 分钟）

1. `cat /Users/feng/.mavis/agents/mavis/memory/pilot.md` —— 14 个版本所有教训
2. `head -30 CHANGELOG.md` —— 最近 5 个 release 的 high-level context
3. `head -50 docs/roadmap.md` —— 当前 phase + 校准 (N) 位置
4. `git log --oneline -20` —— 最近 commit 风格

### 2.2 动手前必 grep 3 件事

```bash
# 1. 确认现有 i18n pattern
grep -rn "i18n" <改动文件目录>

# 2. 确认 i18n key 命名空间
grep -rn "T k=" <改动文件目录>

# 3. 确认没重复造轮子
grep -rn "<新功能关键字>" src/ web/src/
```

---

## 3. Hard rules (NEVER violate)

### 3.1 i18n 三文件同步

- 改 page.tsx 显示文本**必须**走 `<T k="...">` / `renderT(locale, ...)` / `t("...")`
- 加新 i18n key **必须三文件同步**：`types.ts` + `dict.en.ts` + `dict.zh.ts`
- types 缺 key → tsc 编译错强提醒（safety net，不要绕过）
- dict 缺 key → i18n dict completeness test fail
- **不要在 t() 里 fallback 默认字符串**（绕过类型系统）

### 3.2 不动无关代码

- 改 bug 时**只改 bug 相关文件 + 必要 test**
- 顺手 refactor 是反模式（commit message 说不清楚改了什么）
- 大改必须拆成独立 commit / 独立 PR
- commit message **必须列清楚改动文件清单**（"X.ts: 修 Y bug / Y.ts: 加 Z 模式"）

### 3.3 测试必加

- 加新 feature → 必加 test（root core 用 vitest，web client 用 @testing-library/react）
- 修 bug → 必加 regression test
- test 不应 mock 整个 module（用 `vi.spyOn` 部分 mock）
- 涉及 i18n → test 包 `<I18nProvider initialLocale="en">`

### 3.4 不重写新 atomic write

- **复用**现有 `fs.rename` pattern（`saveBoard` 已实现）
- **复用**现有 Zod schema 验证
- **复用**现有 `composeBoardsDir` / `composeBoardPath` 路径 helper
- "重写更干净"是常见幻觉，实际引入 race condition

### 3.5 child component 拿 locale

- child server component 拿 locale → parent 传 `locale: ReturnType<typeof negotiateLocale>` prop
- 不要 child 各自 `await headers()` 重复 negotiate
- 不要把 `<T k=...>` 塞进 child server component（`<T>` 是 client，server 应该用 `renderT`）

### 3.6 atomic write tmp 命名

```ts
const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
```

`<Date.now()>` 不够（同一毫秒撞），加 `<pid>` 保险。

### 3.7 删变量时清 comment

- 删 ref / state / variable → 搜所有 comment 引用
- 改 architectural decision → 改写 comment 描述**当前**架构（不要留 stale breadcrumb）

### 3.8 错误分类 400 vs 404 vs 500

| Status | 含义 | 谁返 |
|---|---|---|
| **400** | bad input | route 边界 validate |
| **404** | missing resource | service 找不到 → route 返 404 |
| **500** | unexpected error | throw 兜底 |

service 内部 `if (!isValid) return null` 返 404 = **错**（route 层应该返 400）。

### 3.9 拆文件的边界

- 抽"独立组件 + 它们的 helpers"到独立文件
- **不抽** hooks / state（hoist 风险大，state hoisting 需要 context）
- 文件减半比全拆干净更值

### 3.10 wire 契约 vs 内态

- client 发什么 → server 收什么（不是 client state 宽度 = wire 宽度）
- Mirror core 的 `BoardInput` type，client 只取 server 实际需要的字段
- `updatedAt` 等 server 必覆盖的字段**不要** ship 上去

---

## 4. Standard workflow (per feature)

每个新 feature 必走 7 步：

| 步 | 动作 |
|---|---|
| 1. **Read 上下文** | pre-dev checklist (§2) |
| 2. **Plan** | TodoWrite 拆 5-15 个子任务，列依赖关系 |
| 3. **Core 先行** | 加 core / server 端代码 + Zod schema + test |
| 4. **Wire web** | 加 web client（types + i18n + components + page）|
| 5. **Test 配套** | root test + web test 都加（mock 用 `vi.mock` + `vi.spyOn`）|
| 6. **Verify** | tsc + format + lint + tests + build 全过（见 §6）|
| 7. **Document** | CHANGELOG + roadmap 校准 (N) + commit + tag + push + release |

每个修 bug 必走 5 步：

| 步 | 动作 |
|---|---|
| 1. **Read 上下文** | 找相关 test / 类似 fix 历史 |
| 2. **Reproduce** | 写 failing test |
| 3. **Fix** | 改最小代码让 test pass |
| 4. **Regression** | 跑全套 test 确认没破其他东西 |
| 5. **Document** | CHANGELOG 注明 P0/P1/P2/P3 级别 |

---

## 5. i18n mandatory rules

### 5.1 改 page.tsx 必查

每次改 `web/src/app/**/page.tsx`：

- [ ] JSX 文本节点都有 `<T k="...">` / `{renderT(locale, ...)}` / `{t("...")}` 包装
- [ ] aria-label / title / placeholder / alt 用 i18n key
- [ ] option / button 内部文本用 i18n key（如果值可能翻译）
- [ ] 子 component 拿 locale：parent 传 prop 或 child 自己 I18nProvider
- [ ] `<title>` / metadata 走 `generateMetadata` + Accept-Language

### 5.2 加新 i18n key 必做

```ts
// 1. web/src/lib/i18n/types.ts 加 key
"my.feature.key": string;

// 2. web/src/lib/i18n/dict.en.ts 加 value
"my.feature.key": "English value",

// 3. web/src/lib/i18n/dict.zh.ts 加 value
"my.feature.key": "中文翻译",
```

跑 `npx vitest run` —— i18n dict completeness test 自动 fail if 缺。

### 5.3 metadata 走 generateMetadata

browser tab title / OG / twitter card 不是 page 内容，加 i18n key 是 ceremony 无 payoff：

```ts
export async function generateMetadata(): Promise<Metadata> {
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = negotiateLocale(acceptLanguage);
  const title = locale === "zh" ? "中文 — Pilot" : "English — Pilot";
  return { title };
}
```

### 5.4 i18n key 命名空间约定

- `{page}.{section}.{field}` 三段 namespace
- 复数走 `.one` / `.other`（**不要** `.replace("1 ", "")` hack）
- 键盘名走 `.keys` 后缀（Delete / Escape 字面量保留）
- partial-failure 走**单 key 多占位**（不要拆两 key 拼）
- per-row aria-label 不用 bulk count key（语义不同）

### 5.5 富文本拆 before/after

当字符串需要嵌入 `<code>{cmd}</code>` 这种富文本时，**不要**把 cmd 放进 placeholder slot。
拆成 `.before` + `.after`，中间用 JSX 插 `<code>`：

```ts
"packages.install.underHood.before": "Pilot installs packs under ",
"packages.install.underHood.after": " (npm scope @pi-mono).",
```

调用点：
```tsx
<RichT k="packages.install.underHood.before" /> <code>{dir}</code> <RichT k="packages.install.underHood.after" />
```

---

## 6. Test mandatory rules

### 6.1 vitest 测试范围

```bash
# root tests (541 个)
cd / && npx vitest run --exclude '**/commands.test.ts'

# web tests (214 个)
cd web && npx vitest run
```

**`commands.test.ts` 走真实 npm registry**，sandbox 偶尔超时（§9）。
本地跑：跳过它。

### 6.2 加新 feature 的 test 模式

**root core**:
- happy path
- 边界（empty / null / max / 特殊字符）
- atomic write（crash 不会留半截文件）
- wire 契约（client 发什么 → server 收什么）
- 错误码 400 vs 404 vs 500

**web client**:
- 4 状态：loading / ok-empty / ok-with-rows / error
- 5 交互：onClick / onChange / onSubmit / onCancel / onConfirm
- 3 bulk 行为：全选 / 部分选 / 清空
- 1 date format（如果用 Date.now() 类 API）

### 6.3 mock 模式

```ts
// 全局 mock module
vi.mock("@/lib/pilot-browser", () => ({
  api: {
    composeBoards: () => mockComposeBoards(),
    // ...
  },
}));

// per-test 行为控制
mockComposeBoards.mockResolvedValue(SAMPLE);
mockComposeBoards.mockRejectedValue(new Error("network"));

// per-test spyOn
vi.spyOn(window, "confirm").mockReturnValue(true);
```

### 6.4 jsdom stub 必备

- `navigator.clipboard.writeText` —— 必 stub
- `window.confirm` / `window.alert` —— 必 spyOn
- `localStorage` —— setup.ts 已 polyfill

不 stub 跑会抛。

---

## 7. Verify checklist (mandatory before commit)

```bash
# 1. TypeScript 全清
cd / && npx tsc --noEmit
cd web && npx tsc --noEmit

# 2. Prettier 双 scope
cd / && npm run format:check    # 含 web/

# 3. ESLint root
cd / && npm run lint

# 4. Vitest 双套
cd / && npx vitest run --exclude '**/commands.test.ts'
cd web && npx vitest run

# 5. Web production build
cd web && npx next build
```

**任何 1 个 fail → 不 commit。所有 5 个 pass → commit。**

---

## 8. Commit / release rules

### 8.1 commit message 模板

```
v{X.Y.Z}: <one-line summary>

<body paragraphs: 文件: 改动理由 + 设计点>

<结尾: 链接/数字/test stats>

Bump version {X.Y.Z-1} -> {X.Y.Z}.
```

### 8.2 CHANGELOG 必加

`CHANGELOG.md` 顶部 `## Unreleased` 下面加 `### v{X.Y.Z} — title` 段。
段内列：P0/P1/P2/P3 分类、改的文件、stats、Deliberately NOT done backlog。

### 8.3 roadmap 校准 必加

`docs/roadmap.md` 找上一校准 (N-1) 下面加校准 (N) 段。
段内列：级别、文件、修复表格 + 关键设计 + 验证 stats。

### 8.4 bump + tag + push

```bash
# 改两个 package.json 的 version
git add -A   # 一次性
git commit -m "v{X.Y.Z}: ..."
git tag v{X.Y.Z}
git push origin main --tags
```

### 8.5 sandbox push 偶发失败（3 种）

按出现频率排：

1. **长时间 connect timeout (75s+)**：`sleep 5` 后 retry
2. **HTTP2 framing error**：立即 retry 100% 过
3. **TLS handshake 失败**：走 bundle → 用户本机 push

retry 顺序：immediate → sleep 5 → sleep 10 → fallback bundle。

### 8.6 GitHub release（调 API）

```bash
python3 -c "
import json, urllib.request
body = {'tag_name': 'v{X.Y.Z}', 'name': '...', 'body': '<notes>'}
req = urllib.request.Request(
    'https://api.github.com/repos/wwppee/pilot/releases',
    data=json.dumps(body).encode('utf-8'),
    method='POST',
    headers={'Authorization': 'token <TOKEN>', 'Accept': 'application/vnd.github+json'},
)
with urllib.request.urlopen(req, timeout=30) as r:
    print(r.read().decode())
"
```

（具体 token 看 `~/.mavis/memory/MEMORY.md` §GitHub token）

---

## 9. Sandbox caveats

### 9.1 网络

- git push 可能失败（见 §8.5）
- npm registry [network] test 偶尔 timeout
- TLS handshake 跟 Apple-bundled LibreSSL 3.3.6 不兼容（用 OpenSSL 3.6.2 OK）

### 9.2 不起 pilot server

- `pilot start` 在 sandbox 跑不起来
- UI 流程不能 Playwright 测
- 只能 server-side 测 + client mock 测
- user 本机 `pilot start + pilot dashboard` 验证

### 9.3 不发 npm

- npm publish 必须在 user 本机做
- bundle → 本机 push → 本机 npm publish

---

## 10. Common hallucinations (specific cases)

每个都是 v0.6.11-14 **实际犯过**的错，**不要再犯**：

### 10.1 改 page.tsx 漏 i18n

**症状**：新加 page 时 metadata.title / 内部 JSX 文本 / placeholder 走 i18n
**实际**：metadata.title 硬编码 "Boards — Pilot"，zh 用户 tab 显示英文
**防**：
- 改 page.tsx 必跑 i18n checklist（§5.1）
- 跑 web build + 起 server 实际看一眼 zh locale

### 10.2 child component 拿不到 locale

**症状**：在子 component 里写 `renderT(locale, ...)`，tsc 报 `Cannot find name 'locale'`
**实际**：parent 调了 negotiate，但没传 prop 给 child
**防**：
- child 签名加 `locale: ReturnType<typeof negotiateLocale>` prop
- parent call site 传 locale
- 跟 `<PolicyList>` 现有 pattern 对齐

### 10.3 删变量漏改 comment

**症状**：v0.6.11 删 `handleCanvasX/Y`，但 comment "to avoid threading a separate
`handleCanvasX/Y` ref through React state" 留着
**实际**：comment 指向已删除的代码
**防**：
- 删 ref / state / variable → 搜所有 comment 引用（`grep -n "<varname>" <file>`）
- 改写 comment 描述**当前**架构

### 10.4 detail block 漏迁 i18n

**症状**：sibling 都 `<dt>{t("...")}</dt>`，但一个 `<dt>kind</dt>` 硬编码
**防**：
- i18n audit 用 grep 同时找 "t(" 引用 和 裸文本
- 加新 detail field 时跟 sibling pattern

### 10.5 aria-label 用错语义 key

**症状**：per-row checkbox aria-label 用 `bulk.selected` count 显示 "0 selected"
**实际**：n=0 语义不通（"已选 0 项"）
**防**：
- per-row 跟 bulk 状态用不同 i18n key
- per-row 是 toggle 语义（"Select this board"）
- bulk 是 multi-select 状态语义（"N selected"）

### 10.6 button aria-label 跟 text 撞

**症状**：button aria-label 跟可见 text 用同一 i18n key → test 报
"Found multiple elements with the text"
**防**：
- aria-label 用专门语义 key（"Clear selection"）
- text 用计数 key（"N selected"）
- 两个 key 表达不同语义

### 10.7 重写新 atomic write

**症状**：实现 `renameBoard` 时写新 atomic write 函数
**实际**：v0.6.12 复用 `saveBoard` 的 `fs.rename` pattern（0 新 race condition）
**防**：
- 改 write / save / delete → 找现有 atomic 函数复用
- "重写更干净"是幻觉
- 复用 = 0 风险 + 0 LOC + 一致行为

### 10.8 错误分类搞混

**症状**：service `if (!isValid) return null` 返 404
**实际**：404 = missing resource，但用户传 invalid id 是 bad input
**防**：
- route 边界 validate → 400
- service 找不到 → null → route 返 404
- "500 vs 404 vs 400" 三态分明

### 10.9 schema 改宽不改窄

**症状**：v0.6.9 导出 schema v3，但 v0.6.10 importJson 只接 v1/v2
**实际**：用户导出再导入静默失败
**防**：
- 升级 schema 时同步升级 loader 的 version check
- 加 regression test 覆盖新 schema version

### 10.10 format check 漏 web/ scope

**症状**：format:check 跑 root 干净，但 web 漏掉
**实际**：v0.5.0 / v0.4.13 release 失败就是这个
**防**：
- root `format:check` chain 进 `(cd web && npx prettier --check .)`
- CI 单独 web format step
- §2.2 教训

### 10.11 lint 跟 test scope 不齐

**症状**：root `lint` 跑 `eslint src test --max-warnings 0`，web 没 lint script
**实际**：改 web 代码 lint 跑不到
**防**：
- 加 web lint 脚本（web/package.json）
- 或用 `tsc --noEmit` 兜底（type errors 也是 errors）

### 10.12 stale breadcrumb comment

**症状**：v0.6.11 P3.12 删了 `handleCanvasX/Y` 变量但漏改 comment
**防**：见 §10.3

### 10.13 next/font sandbox build error

**症状**：`next build` 报 `next/font: error:` 但 exit code 0
**实际**：build 成功，sandbox 拉不到 Google Fonts 不影响 production build
**防**：
- 看 `exit code: $?`，不是 stderr
- production build 不需要 fonts 也能跑

### 10.14 sandbox 关键字 "wipe" 触发 permission denied

**症状**：git commit 含 "wipe" 单词 → safety layer 拒绝
**防**：
- 改写 "cleared localStorage" / "empty localStorage"
- command 本身无害，但词法匹配误报

### 10.15 复数 hack `.replace("1 ", "")`

**症状**：用 `t("blockCount", {n: 1}).replace("1 ", "")` 去掉数字
**实际**：zh "1 个块" → "个块"
**防**：
- 拆 2 套 key（`{key}.one` 带数字 + `{key}.unit` 只 unit）
- caller 拼接 `${n} ${unit}`

### 10.16 grep heuristic 太严

**症状**：找 `<th>X</th>` 硬编码时 pattern `>[A-Z][a-z]+<` 漏掉
**实际**：`<th>ID</th>`（全大写）/ `<th>Name</th>`（首大写）漏
**防**：
- 多 pattern 组合：JSX 文本 + 显式 tag (`<th>`, `<td>`, `<button>`, `<option>`)
- aria-label / title / placeholder 单独 grep

### 10.17 复数 partial-failure 拆两 key

**症状**：partial-failure 拆成 "Deleted {n} boards" + "{m} failed" 两 key
**实际**：拼起来丢连接词（"and" / "，"），英文尤其糟
**防**：
- 单 key + 多占位：`"Deleted {n} board(s), {m} failed"`
- "partial success" 是单一语义，不该拆

### 10.18 schema wire 太宽

**症状**：`saveComposeBoard(id, state: ComposeState)` 把整个内态 ship 给 server
**实际**：包括 `updatedAt`（server 必覆盖）和任何未来字段
**防**：
- Mirror core 的 `BoardInput` type
- client 只取 4 字段（name/blocks/connections/version）
- §3.10

### 10.19 dependsOn no-op 写 true

**症状**：`areDependsOnSatisfied` 返 `true` 是 no-op
**实际**：sequential 策略的 ordering guarantees 静默坏
**防**：
- 传 `plan` 进 helper，建 `byId = new Map(plan.tasks.map(t => [t.id, t]))`
- 查 `status === "completed"`
- **dangling reference 返 false（fail closed）**，不静默放行

---

## 11. When stuck

3 个方向，按顺序尝试：

1. **grep 现有实现**：`grep -rn "<关键字>" src/ web/src/ web/tests/`
2. **read recent memory**：memory/pilot.md 最新 §N（每个 release 一节）
3. **read 类似 fix**：CHANGELOG 看 P0/P1 fix 的 commit 怎么做的

4 次都搞不定 → ask user，不要瞎猜。

---

## 12. Quick reference

### 12.1 跑全套验证（一条命令）

```bash
cd /Users/feng/.mavis/sessions/<session-id>/workspace/pilot && \
  npx tsc --noEmit && \
  npm run format:check && \
  npm run lint && \
  npx vitest run --exclude '**/commands.test.ts' && \
  cd web && \
  npx tsc --noEmit && \
  npm run format:check && \
  npx vitest run && \
  npx next build
```

### 12.2 加 i18n key 的 4 步

```bash
# 1. types.ts
echo '  "my.feature.key": string;' >> web/src/lib/i18n/types.ts

# 2. dict.en.ts
echo '  "my.feature.key": "English value",' >> web/src/lib/i18n/dict.en.ts

# 3. dict.zh.ts
echo '  "my.feature.key": "中文翻译",' >> web/src/lib/i18n/dict.zh.ts

# 4. 用 key
<T k="my.feature.key" />  # client
renderT(locale, "my.feature.key")  # server component
```

### 12.3 加 server route 的 6 步

1. `core/xxx.ts` 加 Zod schema + 实现函数
2. `core/service-impl.ts` 加 `*FromService` wrapper
3. `core/service.ts` 加 interface 方法
4. `src/server/server.ts` 加 route + 边界 validate
5. `test/unit/xxx.test.ts` 加 happy path + 边界 + 错误码 test
6. `test/unit/server.test.ts` 加 route test（400/404/200）

### 12.4 bump version

```bash
sed -i '' 's/"version": "0.6.X"/"version": "0.6.Y"/' package.json web/package.json
```

---

**Last updated**: 2026-07-17 (v0.8.5 /workflows tech-debt cleanup)

**Maintainer**: 每次新 release 后回写新教训到对应章节。
