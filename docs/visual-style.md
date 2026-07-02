# Pilot 视觉风格规范 v1（v0.4.4 起适用）

> **三层结构**：
> 1. 底层交互：现代 SaaS canvas（Figma/白板）
> 2. 中层视觉：2.5D 小岛/地块/建筑（isometric workspace, soft pixel）
> 3. 操作层：真实 Web UI（卡片、浮层、侧边栏、Inspector）

## 一、不要做的方向

| ❌ 不要 | 原因 |
|--------|------|
| 纯 3D Minecraft 像素 | 开发成本高、信息密度低、迭代慢 |
| 复古 RPG Maker | 不现代、品牌联想弱 |
| 太游戏化（小动画狂堆） | 用户被视觉吸引但功能没验证 |

## 二、要做的方向：3 层叠加

### 第 1 层：现代画布（底层骨架）

参照 **Figma / Linear / tldraw / Excalidraw**：
- 无限 2D 画布（pan / zoom / minimap）
- Snap-to-grid（默认 16px）
- 平滑动画（200ms ease-out）
- 键盘快捷键（⌘Z / ⌘D / Space 拖 / V 选 / H 手型）

实现技术选型：
- React + 自建 canvas（不要 Konva / Fabric，太重）
- 缩放 transform，用 CSS `transform: translate3d + scale`
- 方块渲染用 absolute-positioned `<div>`，每块 16px 网格对齐
- 连线用 SVG overlay，按方块位置动态计算 path

### 第 2 层：2.5D 箱庭皮肤（视觉包装）

**视觉关键词**：cozy sandbox / isometric workspace / soft pixel / agent town / interactive map dashboard

- 方块默认是 **isometric 3/4 视角** 的 tile（CSS 3D transform 或 SVG)
- 一块"地"代表一个 category（Extensions 区 / Skills 区 / Tools 区 / Context 区 / Sessions 区）
- 方块是"小建筑"，有屋顶样式区分类型：
  - Extension：圆顶小屋（mode 颜色 = 屋顶色）
  - Skill：尖顶小木屋
  - Tool：方块平房（带安全锁的视觉标记）
  - Project Context：石碑 / 卷轴
  - Profile：圆塔（其它方块围绕它连成轨道）
  - Subagent：分支小路
- 连线是**小径**，分实线（数据流）/ 虚线（依赖）
- 微动画（轻游戏化反馈）：
  - 方块运行时轻微发光（pulse 2s）
  - Tool 调用成功：方块短暂绿光
  - Tool 调用失败：方块短暂红光 + 抖动
  - 加载中：旋转的齿轮小图标
- **绝对禁止**：粒子特效、爆炸、彩纸、3D 模型旋转

### 第 3 层：真实 Web UI（操作层）

不管视觉怎么包装，操作必须符合成熟 Web 产品的预期：

```
┌──────────────────────────────────────────────────────────┐
│ TopBar  ◀ Back  | Sandbox > Profile: default | [Run] [⋯] │
├────────────────────────────────┬─────────────────────────┤
│                                │                         │
│                                │   Inspector             │
│        Canvas                  │   ┌─────────────┐       │
│        （箱庭画布）            │   │ extension-x │       │
│                                │   │ v1.2.0      │       │
│     ┌──┐  ┌──┐                 │   │ mode: L2    │       │
│     │  │──│  │                 │   │             │       │
│     └──┘  └──┘                 │   │ [Configure] │       │
│           │                    │   │ [Run]       │       │
│           ▼                    │   │ [Diff]      │       │
│     ┌──┐  ┌──┐                 │   └─────────────┘       │
│     │  │  │  │                 │                         │
│     └──┘  └──┘                 │   Log                   │
│                                │   ┌─────────────┐       │
│                                │   │ 12:34:05    │       │
│                                │   │ tool: bash   │       │
│                                │   │ exit: 0      │       │
│                                │   └─────────────┘       │
└────────────────────────────────┴─────────────────────────┘
```

- **TopBar**：标准导航（左返回 / 面包屑 / 主操作）
- **Canvas**：主区域（画布，可全屏）
- **Inspector（右侧）**：选中对象的配置 / 状态 / 日志
- **Timeline / Activity（底部或浮层）**：运行过程 / 事件流
- **Sidebar（左侧，可折叠）**：方块 palette / 导航
- **Modal**：弹窗（新建、确认、设置）

### 配色 + 排版

- 主色：低饱和度蓝绿（cozy tone）
- 辅助色：暖橙（高亮 / 警告 / 选中）
- 字体：Inter（UI）+ JetBrains Mono（代码 / log）
- 圆角：8px（卡片）/ 4px（按钮）/ 16px（容器）
- 阴影：柔（box-shadow: 0 2px 8px rgba(0,0,0,0.06)）
- 间距：4 / 8 / 12 / 16 / 24 / 32 / 48

## 三、风格实施顺序

```
v0.4.2-v0.4.3  纯 SaaS UI（无箱庭）—— list 视图 + 表格 + Inspector
v0.4.4         引入现代画布骨架（Figma 风格）—— 方块可以拖动
v0.4.5         加上 2.5D 皮肤（isometric skin）
v0.5           加上运行时微动画（轻游戏化反馈）
```

分阶段引入，**先验证功能骨架再上视觉**，避免视觉先行变成"酷但空"的成品。

## 四、技术栈补充

- React 19 + Next.js 16（已有）
- Tailwind 4（已有）
- 状态管理：React Context + useReducer（不上 Redux）
- 画布：自建（不依赖 Konva/Fabric）
- 动画：CSS + 必要时 framer-motion
- 持久化：localStorage（用户布局） + IndexedDB（会话详情，大对象）

## 五、参考链接（不抄，做自己）

- Figma canvas UX
- Linear issue detail panel
- tldraw 的 roughness
- Excalidraw 的手绘感
- 一些 isometric editor（Isometric Map Editor）
- agent town 这个细分（Anthropic / LangChain 都在探索）

---

**总结一句话**：modern canvas 为骨架，2.5D 箱庭为皮肤，真实 Web UI 为操作层。功能验证优先于视觉，视觉分阶段引入。
