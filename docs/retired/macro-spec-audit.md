# v0.4.x 之前的"宏图"文档——审计记录

> 用户反馈："原本的出发点就是以 Pi 为主的自定义体系工具，需要你在之上构建的这些宏图，需要铺设好细节的开发计划。你需要仔细验证。"
>
> 这些是**已作废或已校准**的文档。保留是为了留 audit trail。

## 已作废

| 文档 | 作废原因 |
|------|---------|
| `roadmap-v1.0.md` (v3 终极版) | 6 阶段流水线 / Hermes scratch_pad / Tool Selector stage —— Pi 实际数据里根本没有。Pilot 的 `SessionEntry.type` 只有 `user \| assistant \| tool \| system` 4 个枚举。 |
| `compatibility-adapters.md` | "OpenClaw / Hermes / MCP 作为 Layer 1 / Layer 3 适配器" —— Pilot 不在 Pi 的 runtime 层，只是 shell-out + 读 JSONL 的 management plane。Adapter 抽象没意义。 |
| `architecture-3layers.md` | 把 Pilot 拆成"Gateway / Agent Runtime / Tool Calling"3 平行层。错。Pilot 的"3 层"实际是：入口 (CLI/Web) → PilotService → 调 Pi 工具。这不是平行的 abstraction，是垂直的 use-of-tools。 |
| 部分 `forge-and-avatars.md` 里关于"Avatar / multi-agent routing"的段落 | Pi 已经有 `model_select` event + Tool 调度，无需 Avatar 抽象。 |

## 已校准

| 文档 | 校准方式 |
|------|---------|
| `visual-style.md` | 视觉原则保留（modern canvas + 2.5D skin + 真实 UI）。但在 v0.4.4 真正实现 Compose 时，"方块 → Pi extension"的映射需要重新画，**不是抽象的 7 槽**。 |
| `pilot-overview.html` | 视觉 OK，但 toggle 列表的语义需要等到 v0.4.4 Compose 时重做，目前先不在 v0.4.2 范围。 |

## 真实起点（详见 `roadmap-pi-grounded.md`）

- Pilot：management plane，shell out to `pi` + 读 JSONL
- Pi：实际 runtime，13+ extension events，7 built-in tools，完整 usage/cost JSONL
- v0.4.2 第一交付：usage aggregation + tool trace + project context + tool inventory + 3 个 Web 页面

## 经验教训

1. **每个"宏图"前必须先 verify 底层**。v3 宏图失败的根本原因：没读 `pi-coding-agent/docs/extensions.md` 就开始设计 6 阶段
2. **Pi extension API 才是核心抽象层**。Pilot 的所有"接入 Pi"工作，最终都通过 `pi.on("xxx")` + `ctx.ui.xxx()` + pi's CLI flags 实现；不需要自己造"阶段" / "Hook" 这些词
3. **Web 箱庭要画 Pi extension，不是抽象概念**。v0.4.4 实现 Compose 时，每个"建筑"应该是真实能 inspect / 启停的 Pi extension
4. **v0.4.x 跨度太长要拆**。之前的 v0.4.2 → v1.0 跨度太激进了，每 1-2 周一个版本号、每个版本号有具体可验收产物
