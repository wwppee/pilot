# Pilot v1.0 — Web UI 作为 Pi 的 Cockpit

> 核心立场：**Web UI 是主控台，CLI 是 power user 通道。Pi 是第一个被支持的 agent runtime，未来加任何 runtime 都从同一个 cockpit 出。**

## 5 个 cockpit 窗口（你说的那 5 个能力）

### 1. 拆解 agent 的能力（Capability Inspector）

把 Pi 的"它能做什么"摊在桌面上，不只是 schema 列表。

| 对象 | Web UI 上能看到什么 |
|------|------------------|
| **Extension** | 源码、版本、作者、mode (L1/L2/L3/L4)、conflicts、状态、它的 prompts/skills 都在哪 |
| **Skill** | 文件预览、依赖、什么 trigger 词、过去 7 天被触发 N 次、成功率 |
| **Prompt** | 渲染后的样子、配套的 extension、谁引用了它 |
| **Profile** | TOML 全展开、model mix 饼图、tools 启用列表、当前激活的 extensions |
| **Subagent** | 调度图（谁调它、它调谁、平均 chain 长度） |

设计原则：**click 任何一项，能跳到"它被用在哪"（sessions），也能跳到"谁在用它"（profiles）**。

### 2. 调试（Debug & Replay）

| 视图 | 功能 |
|------|------|
| **Session tree** | subagent call graph（树形 / 桑基图），点节点看详情 |
| **Step through** | 每步：tool call 名、input/output、耗时、token、model |
| **Inspect** | 每个 LLM call 的完整 prompt + response、temperature、stop reason |
| **Replay** | 从某个 checkpoint 用不同 profile 重跑，看结果 diff |
| **Diff two sessions** | 同一个 prompt 跑两次 A/B，token / 时间 / 结果并列 |

### 3. 复制分发（Replicate & Distribute）

| 操作 | 形态 |
|------|------|
| **Export capability** | 打成 bundle：manifest + 源码 + provenance + 校验和；同事拖进自己的 Pilot 就能装 |
| **Export session as lesson** | 匿名化（去掉 user-specific 路径/token），留下"任务 + 关键步骤 + 结果"，作为别人的参考 |
| **Import bundle** | 拖拽或 URL，自动校验 + absorb |
| **Share via deep link** | `pilot://capability/<id>` 协议，macOS Finder 关联 |

Forge 的 search/inspect/absorb 这一套是这里的**底层机制**（L1-referenced 等价于"只引用，不下载"），但 UI 上呈现的是"分享"，不是"冶炼"。

### 4. 数据洞察 / 调用量（Analytics）

| 图表 | 维度 |
|------|------|
| **Token usage over time** | 按 model / session / profile / extension 切分 |
| **Cost breakdown** | 美元 / token / 调用次数，可投影到月底 |
| **Latency histogram** | p50 / p95 / p99，按 model |
| **Tool use frequency** | top N tools，per extension |
| **Skill trigger rate** | 触发次数 vs 实际产生有用输出的次数 |
| **Error rate** | 按 error type 分组，按 model 看 |

时间窗：today / 7d / 30d / 自定义。

### 5. 会话分析 + Pi 特色（Pi-aware Session Analysis）

这是和 LangSmith / Helicone 拉开差距的地方 —— **针对 Pi 的结构专门做分析**：

- **Subagent call tree**：哪个 subagent 被调得最多、最深、平均 chain 长度、节省了多少 token（vs 主 agent 直接做）
- **Profile 影响分析**：`fast` vs `default` profile 在同一 prompt 上的成本/质量对比
- **Extension 效应**：哪个 extension 在这场 session 里"帮了"（减少 token）或"拖了"（增加错误率）
- **相似 session 搜索**："找到和这条 session 类似的 5 条" —— 不是按字面匹配，是按结构（tool 调用序列 + extension 集合）
- **自动 lesson learned**：会话结束后生成一段总结（哪些 skill 救场、哪些 extension 没用上、什么 pattern 重复出现了）
- **人性化 UX**：
  - "你这条 session 平均每 200 token 就触发一次 `bash` —— 是不是考虑加个 skill 替代？"
  - "Profile `default` 跑这个任务比 `fast` 慢 2.3x 但输出更长 —— 你可能在写文档类任务"
  - "你这周用了 3 个新 extension，其中 1 个被触发 0 次 —— 建议 disable"

## v0.4.x → v0.6 路线图

### v0.4.2 — 调试 + 会话分析基础（最重）
- 复用 v0.3.0-a 已经有 session tree 数据
- Web UI：
  - `/sessions` 列表（已有 → 加搜索/筛选）
  - `/sessions/[id]`：session tree + step through + inspect
  - `/sessions/compare?a=...&b=...`：A/B diff
- 新 CLI：`pilot session show <id>` / `pilot session replay <id>` 
- **没 analytics 图表**（v0.4.4），但每条 session 详情有 token / 耗时数据

### v0.4.3 — 能力拆解 (Capability Inspector)
- Web UI：
  - `/capabilities` 重做：左侧分类树（extension/skill/prompt/profile），右侧 detail
  - 每个 capability 的 detail 页：元数据 + 引用图（被哪些 profile / session 引用）
  - `/profiles` 列表 + 详情（TOML 折叠树 + model mix + 引用 extension 列表）
- 复用 v0.3.9 capability 基础

### v0.4.4 — 数据洞察 (Analytics Dashboard)
- Web UI：`/analytics`，4-5 个核心图表
- 后端：聚合 session 数据，存到本地 SQLite
- 触发器：session 结束时增量更新
- 时间窗 + 维度切换

### v0.4.5 — 复制分发 (Distribute)
- CLI：`pilot bundle export capability <id> --out foo.bundle` / `pilot bundle import foo.bundle`
- Bundle 格式：tar.gz 含 capability.json + 资源 + sha256
- Web UI：drag-drop import，share link

### v0.5 — Pi 特色分析（深度）
- Subagent call tree 可视化（桑基图）
- Profile 影响分析（自动跑对照实验）
- 相似 session 搜索（向量索引）
- 自动 lesson learned（用 LLM 总结，存到 capability 的 lessons 字段）

### v0.6 — 人性化 UX 收尾
- "建议" 卡片（"你可能想 disable X" / "你可能想加个 skill Y"）
- 全局 search（命令面板 ⌘K）
- Onboarding：第一次装 Pilot 时的引导流

## 不做（明确边界）

- ❌ **不直接做 marketplace / 云端 registry**（v0.7+ 才考虑）
- ❌ **不做实时协作 / 多用户**（v1.0+）
- ❌ **不做云同步**（v1.0+）
- ✅ **单用户、本地、Pi-first** 是 v1.0 的清晰边界

## 跟之前的差异

| 之前我说的 | 实际应该做的 |
|------------|-------------|
| "Forge 是核心" | Forge 是分发机制，UI 才是主控 |
| "v0.5 多 runtime" | v0.4 全程单 runtime，UI 设计成可扩展；v0.7+ 才加 runtime |
| "absorbing a npm package 是亮点" | 分享给同事一个 capability bundle 才是亮点 |
| "Eval 决定是否 absorb" | Eval 是为了"分享前我心里有底"，不是 absorb 门槛 |

## 第一个要做的（建议）

**v0.4.2 的 session tree 详情页 + step through**。

理由：
1. 数据基础已经有（v0.3.0-a session tree）
2. 是所有 5 个 cockpit 窗口里**最 wow** 的（重放自己的 session 是高光时刻）
3. 复用 v0.3.6 已有 web UI 框架
4. 跑通之后其它 4 个窗口都能套同样的模式

**你拍板**：
- 同意 v0.4.2 = session 调试 / 分析，5 个 cockpit 窗口按上面顺序做？
- 还是想先做某个特定的？
- "人性化的使用体验" 你心里有具体场景吗？比如"我希望它能告诉我 X"那种？
