# Pilot v1.0 — 箱庭 Cockpit（修订版 v2）

> **核心比喻**：Web UI 不是一个 dashboard，是一个**可拼搭的沙盆**。Pi 的所有构造件（extension / skill / prompt / profile / tool / project context）都是**可拖拽的方块**，用户像在 Minecraft / RPG Maker 里一样**组装、测试、保存、分享**自己的 agent。

## 一、为什么是"箱庭"而不是"dashboard"

| Dashboard 的范式 | 箱庭的范式 |
|----------------|----------|
| 静态表格 / 图表 | 可拖拽的方块、连线和缩放 |
| 我**看**agent 做了什么 | 我**搭**agent 然后看它做什么 |
| 表格是只读的 | 方块可以被替换、调参、重新接线 |
| 信息架构是 hierarchy | 信息架构是 **canvas**（空间 + 连线） |
| "管理" 是 CRUD | "管理" 是 **玩 + 试验 + 调** |

参考案例：Minecraft（inventory + craft + place）、RPG Maker（tileset + event）、Scratch（block snapping）、Figma（freeform canvas + components + instances）、Blender（node-based materials）、Dwarf Fortress（designate zone + watch）。

## 二、5 类方块（agent 的可拼搭原件）

每类方块都是 sandbox 里的一个**可拖拽实体**，有 icon / name / 状态 / 预览 / 详情。

### 1. Extension 方块
- 来源：`~/.pi/agent/extensions/<name>/` 或 npm absorbed
- 预览：版本、mode (L1/L2/L3/L4)、conflicts
- 详情页：源码、它带的 skills / prompts / commands 全部展开
- **Pi 特色**：L1-L4 mode 用颜色编码（灰/绿/蓝/紫），一眼看出整合深度

### 2. Skill 方块
- 来源：extension 自带 / 用户写在 `~/.pi/agent/skills/`
- 预览：trigger 词、依赖（用了哪些 tools）
- 详情页：文件全文 + "过去 7 天被触发 N 次" 的统计
- **工程细节**：显示这个 skill 触发的 bash 命令、写入的文件

### 3. Prompt 方块
- 来源：extension 自带 / 用户写
- 预览：渲染后第一段
- 详情页：完整内容 + 谁引用了它

### 4. Profile 方块（特殊的**容器**方块）
- 来源：TOML 文件
- 预览：model + 启用的 extension 数 + tools 策略
- **特殊性**：它包含 / 引用其他方块。在 箱庭里表现为**有子方块的容器**，或者通过**连线**展示"这个 profile 启用了这些 extensions"

### 5. Tool 方块（**工程层**粒度）
- 来源：built-in / extension 提供
- 类型：bash / read / write / edit / web_search / subagent / webfetch / ...
- 预览：safety 等级（read / write / exec / network）、最近一次调用
- 详情页：完整调用历史（每次的 input/output/耗时/出错信息）
- **关键工程能力**：每个 tool 可以被**连线**到其它 tool（"grep → edit"），这是 v0.5+ 的"tool 编排"

### 6. Project Context 方块（用户特别提到的 CLAUDE.md）
- 来源：自动扫描 `CLAUDE.md` / `AGENTS.md` / `README.md` / `.cursor/rules` / `CONTRIBUTING.md`
- 预览：前 200 字符 + byte 数 + 上次修改时间
- 详情页：完整内容 + **impact 分析**（"包含这个 context 比不包含，平均 token 增加 X 但准确率 +Y"）
- **关键能力**：用户可以**显式 toggle**（"这个项目用 AGENTS.md，不用 CLAUDE.md"），或**手动添加**项目级 instructions

## 三、箱庭的 4 种模式（顶部 tab 切换）

### 模式 A：Compose（拼搭）
- 自由画布，左侧是方块 palette，右侧是 canvas
- **拖方块**到 canvas；方块会**自动 snap** 到网格
- **连线**展示 profile → extension / extension → skill / skill → tool 的关系
- **缩放、平移、框选、删除**
- **保存**当前 canvas → "Composition"（暂存，可 export）
- **加载**已有 Composition → 还原 canvas
- **v0.4.4 MVP**：read-only drag（保存只存视图，不影响运行时）
- **v0.4.5**：save Composition → 真的生成 TOML profile

### 模式 B：Run（跑）
- 当前 Composition 选了 Profile 之后，"Play" 按钮启动一次 session
- 实时看到：哪些方块被触发（高亮），tool 方块亮起（红/绿/黄 = 失败/成功/慢）
- 跑完自动切到 Replay 模式

### 模式 C：Replay（回放 / 调试）
- 选一条已存在的 session，canvas 上**回放**方块的触发序列
- 时间轴在底部：拖动 slider 跳到任意时刻
- 每个被触发的方块显示其 input / output / 耗时 / token
- **A/B 对比**：左边一个 session，右边另一个，并排显示
- **断点回放**：在某个 step 暂停，换个 profile，从这里重跑

### 模式 D：Stats（统计）
- 同一个 canvas 上叠一层 heatmap
- Token 消耗热力图：哪些方块最费 token
- 调用频次：哪些方块一周被用了 N 次
- 错误率：哪些 tool 经常失败
- **Pi 特色维度**：按 subagent 树看（哪个 subagent 任务最重）

## 四、工程层面的工具调度（用户的核心要求）

Web UI 不仅是"看"，是要**管 agent 的工程环境**：

### 4.1 Tool Inventory（tool 库存）
- 列出当前 Profile 启用的所有 tool
- 每个 tool：来源、safety 等级、最近一次调用、累计调用次数、平均耗时
- **按 safety 等级分组**：read-only / write / exec / network / secrets

### 4.2 Tool Whitelist / Blacklist（policy）
- 可视化的"工具开关面板"
- Toggle 每个 tool 的启用状态
- 实时生成对应的 TOML 配置
- **命名策略**：`profile.fast` 禁用 `bash`、启用 `read` + `grep`
- **审计日志**：谁在什么时间改了 tool policy

### 4.3 Tool Call Trace（调用追踪）
- 选一条 session，**按时间线**展示所有 tool 调用
- 每条：tool 名、参数（折叠/展开）、输出（折叠/展开）、耗时、exit code
- **搜索**：在所有 session 里搜 "用过 `webfetch` 调用 example.com 的"
- **错误聚合**：所有失败 tool 调用的 top 失败原因

### 4.4 Tool 编排（v0.5+ 高级）
- 拖一个 tool A → 连线到 tool B → 生成"宏 tool"（A 的输出自动喂给 B）
- 例：`grep --pattern X` → `edit --replace Y` 合成 "find-and-replace"
- 命名 / 描述 / 入参 schema
- 可作为新的 Skill 写回 Pi

### 4.5 Project Context Auto-loader（v0.4.2 起步）
- **扫描规则**：从 CWD 向上找 `CLAUDE.md` / `AGENTS.md` / `README.md` / `.cursor/rules` / `CONTRIBUTING.md` / `package.json` 的 `pi` 字段
- 显示**加载了什么**、**byte 数**、**上次修改时间**
- **Toggle**：每条 context 独立开关
- **手动添加**：用户写项目级 instructions（"这个项目用 pnpm"）
- **Impact 分析**（v0.4.3）：对比"带这条 context"vs"不带"的 session 表现
- **默认值**：v0.4.2 只显示，不影响 agent；v0.4.3 起让 agent 真的读

## 五、v0.4.x 路线图（修订）

```
v0.4.2  Project Context Auto-loader ── 直接回应用户 Claude.md 问题
        + Tool Inventory (read-only) ── 工程可见性起步
        + 现有 session tree 详情升级 ── 数据基础已有
        ── 输出：用户能"看见"工程环境

v0.4.3  Tool Policy (whitelist/blacklist UI)
        + Tool Call Trace (per-session 工具调用时间线)
        + Impact 分析基础（context on/off 对比）
        ── 输出：用户能"管"工程环境

v0.4.4  箱庭 Compose MVP ── drag/drop/snap，read-only
        + Profile 详情页升级（用方块展示它的组成）
        ── 输出：用户能"搭"agent

v0.4.5  Compose → Save as Profile
        + Run 模式（MVP：在 sandbox 里跑 sample task）
        ── 输出：箱庭开始有功能效果

v0.5    Replay 模式 + A/B diff
        + Tool 编排（tool chain）
        + Subagent tree 可视化
        ── 输出：箱庭开始"活"起来

v0.6    Stats heatmap
        + Humane UX 收尾
        ── 输出：箱庭可量化
```

## 六、跟 v1 草案的差异

| 之前 | 现在 |
|------|------|
| "5 个 cockpit 窗口" 是平等的并列 | **箱庭**是单一空间，4 个模式（Compose / Run / Replay / Stats）是它的视角 |
| "拆解能力" 是浏览式的 | "拆解能力" 是**可拖拽方块** |
| "工程层面工具调度" 是个 feature | 是**整个范式** —— 工具和上下文都是方块，箱庭就是 agent 的施工面 |
| Project context 没单独提 | 单独提，是 v0.4.2 的第一个交付 |

## 七、第一个要做的（建议）

**v0.4.2 = Project Context Auto-loader + Tool Inventory (read-only)**

理由：
1. 直接回应你 "CLAUDE.md" 的具体诉求
2. 数据模型简单（filesystem scan + JSON metadata），风险低
3. 跑通之后，v0.4.3 就在它上面加 policy / trace，v0.4.4 把它升级为可拖拽方块
4. 给后续的 Compose 模式准备好"Project Context 方块"这个基础类型

**你拍板**：
- 同意 v0.4.2 = Project Context + Tool Inventory 起步？
- 箱庭的"4 个模式"分法对吗？有没有想加 / 减的？
- "箱庭" 你心里的参考是 Minecraft 那种 3D 像素风，还是 RPG Maker 那种 2D 像素风，还是 Figma 那种现代 freeform canvas？
