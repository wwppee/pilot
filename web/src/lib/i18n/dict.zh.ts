import type { Dict } from "./types";

const zh: Dict = {
  // Skip link / a11y
  "skip.toMain": "跳到主要内容",
  "nav.ariaLabel": "主导航",

  // Brand
  "brand.name": "pilot",
  "brand.ariaHome": "Pilot 首页",

  // Nav
  "nav.dashboard": "概览",
  "nav.packages": "包",
  "nav.sessions": "会话",
  "nav.usage": "用量",
  "nav.tools": "工具",
  "nav.context": "上下文",
  "nav.policy": "策略",
  "nav.compose": "编排",
  "nav.profiles": "配置",
  "nav.capabilities": "能力",

  // Server status
  "server.up": "pilot 服务 · v{version}",
  "server.down": "服务未运行",

  // Footer
  "footer.copy": "pilot-web v{version} · 提供读、策略、编排三大功能",
  "footer.endpoint": "服务监听地址",

  // Language switcher
  "lang.label": "语言",
  "lang.en": "EN",
  "lang.zh": "中",

  // Common buttons
  "btn.save": "保存修改",
  "btn.saved": "已保存",
  "btn.saving": "保存中…",
  "btn.cancel": "取消",
  "btn.back": "返回",
  "btn.backToList": "返回列表",
  "btn.apply": "应用",
  "btn.applyGenerate": "应用（生成扩展）",
  "btn.unapply": "取消应用",
  "btn.delete": "删除",
  "btn.confirmDelete": "确认删除？",
  "btn.search": "搜索",
  "btn.refresh": "刷新",
  "btn.export": "导出",
  "btn.import": "导入",
  "btn.clear": "清空",
  "btn.add": "添加",
  "btn.remove": "移除",
  "btn.create": "创建",
  "btn.edit": "编辑",
  "btn.filter": "筛选",
  "btn.submit": "提交",
  "btn.ariaConfirmDelete": "确认删除策略（再点一次即删除）",
  "btn.ariaDelete": "删除该策略",
  "btn.ariaDeleteProfile": "删除该配置",
  "btn.ariaApplyTitle":
    "生成 ~/.pilot/extensions/pilot-policy-<name>.ts 并让 pi 加载",
  "btn.ariaUnapplyTitle": "移除已生成的扩展",
  "btn.ariaEditPolicy": "编辑策略 {name}",
  "btn.ariaFormActions": "表单操作",
  "btn.ariaRange": "时间范围",
  "btn.ariaSearch": "搜索",
  "btn.ariaSearchCatalog": "搜索目录",
  "btn.ariaComposeCanvas":
    "编排画布。选中方块后，用方向键移动，Delete 删除，Escape 取消选中。",
  "btn.ariaRemoveBlock": "移除方块",

  // Loading / empty / errors
  "loading.generic": "加载中…",
  "loading.form": "加载表单中…",
  "loading.catalog": "加载目录中…",
  "loading.policies": "加载中…",
  "loading.policyForm": "加载表单中…",
  "error.couldntLoad.title": "加载失败",
  "error.couldntLoad.body": "是否 `pilot server` 没在跑？试试 `pilot server start`。",
  "status.unsaved": "有未保存的修改",
  "status.saving": "保存中…",

  // Policy list / edit
  "policy.edit.h1": "编辑策略",
  "policy.edit.backToList": "← 返回策略列表",
  "policy.edit.backToListAria": "返回策略列表",
  "policy.edit.ariaEdit": "编辑策略 {name}",
  "policy.descriptionLabel": "描述",
  "policy.empty.title": "暂无策略",
  "policy.empty.body":
    "用 `pilot policy new <name>` 创建，或 `pilot policy apply` 应用。",
  "policy.serverHint": "是否 `pilot server` 没在跑？试试 `pilot server start`。",
  "policy.tryRule.h2": "试着跑一条规则",
  "policy.tryRule.noPolicies": "暂无可测试的策略。",
  "policy.tryRule.policyLabel": "策略",
  "policy.tryRule.toolLabel": "工具",
  "policy.tryRule.argsLabel": "参数 (JSON)",
  "policy.tryRule.runCheck": "检查",
  "policy.check": "检查",
  "policy.allowBadge": "允许",
  "policy.denyBadge": "拒绝",
  "policy.warnBadge": "警告",
  "policy.hitlBadge": "需确认",
  "policy.hitlDesc": "会话暂停，通过 `ctx.ui.confirm()` 询问用户后再执行。",
  "policy.applyFailed": "应用失败：{msg}",
  "policy.unapplyFailed": "取消应用失败：{msg}",
  "policy.confirmDeleteProfile": "删除 \"{name}\"？此操作不可恢复。",

  // Compose
  "compose.searchPlaceholder": "搜索…",
  "compose.emptySearch": "无匹配。调整筛选或搜索条件。",
  "compose.dragHint": "拖到画布，或按 Enter 添加到中央",
  "compose.canvasAria":
    "编排画布。选中方块后，用方向键移动，Delete 删除，Escape 取消选中。",
  "compose.canvasEmpty": "画布为空 — 选中侧栏项后按 {key} 添加。",
  "compose.canvasSelectBlock":
    "点击画布上的方块查看详情。按 {del} 删除，按 {esc} 取消选中。",
  "compose.removeBlock": "移除方块",

  // Packages
  "packages.noPacksHint": "还没装包。试试 `pilot pack search subagent`。",

  // Profiles [name]
  "profiles.editHeading": "编辑",
  "profiles.descriptionPlaceholder": "这份配置用来做什么？",
  "profiles.saved": "配置已更新。",
  "profiles.model": "模型",
  "profiles.thinking": "思考",
  "profiles.packages": "包",
  "profiles.activate": "设为活跃",
  "profiles.active": "活跃中",
  "profiles.activeHint": "下次启动 pi 时会使用这份配置。",
  "profiles.activatedToast": "✓ {name} 已设为活跃配置。",
  "profiles.clearedToast": "已取消活跃配置。",
  "profiles.noActive": "暂无活跃配置。点击任一配置卡的「设为活跃」按钮即可指定。",
  "profiles.activateFailed": "激活失败：{msg}",

  // Context
  "context.loadedTitle": "Pi 已加载",
  "context.infoTitle": "仅供查看",

  // Range nav
  "range.today": "今天",

  // Home (dashboard)
  "home.h1": "概览",
  "home.subtitle": "本地 pi 活动的实时视图。过去 24 小时。",
  "home.error.title": "连不上 pilot 服务",
  "home.error.body":
    "运行 `pilot dashboard` 一条命令启动服务 + Web UI；\n如果只要 CLI，运行 `pilot server start`。",
  "home.card.sessions": "会话",
  "home.card.messages": "消息",
  "home.card.toolCalls": "工具调用",
  "home.card.tokens": "Token",
  "home.card.cost": "成本 (USD)",
  "home.section.today": "今日",
  "home.section.byModel": "按模型",
  "home.section.topTools": "热门工具",
  "home.section.recentSessions": "最近会话",
  "home.section.installedPacks": "已装包",
  "home.link.seeAll": "看全部 →",
  "home.link.manage": "管理 →",
  "home.empty.sessions": "暂无会话。",
  "home.empty.packs": "暂无已装包。",
  "home.refreshHint": "10 秒自动刷新 · 已更新",

  // Packages
  "packages.h1": "包中心",
  "packages.subtitle": "已安装 {n} 个 · 无需离开页面即可搜索 npm。",
  "packages.searchPlaceholder": "搜索 npm…（如 pi-subagents）",
  "packages.searchResultsFor": "\u201c{q}\u201d 的搜索结果",
  "packages.nothingMatches": "没匹配上。",
  "packages.installed": "已安装",
  "packages.empty": "还没装包。试试 `pilot pack search subagent`。",

  // Sessions
  "sessions.h1": "会话",
  "sessions.subtitle": "{home} 下共 {n} 个会话 · 最近的在前。",
  "sessions.empty": "还没有会话。运行 pi 来创建。",
  "sessions.col.id": "ID",
  "sessions.col.cwd": "目录",
  "sessions.col.lastUsed": "最后使用",
  "sessions.col.entries": "条数",
  "sessions.col.size": "大小",
  "sessions.col.model": "模型",

  // Usage
  "usage.h1": "Token 与成本",
  "usage.subtitle": "聚合所有 pi v3 会话的 `AssistantMessage.usage`。",
  "usage.range.today": "今天",
  "usage.range.week": "近 7 天",
  "usage.range.month": "近 30 天",
  "usage.range.all": "全部",
  "usage.card.sessions": "会话",
  "usage.card.assistantMessages": "助手消息",
  "usage.card.totalTokens": "总 Token",
  "usage.card.totalCost": "总成本",
  "usage.byModel.title": "按模型",
  "usage.byDay.title": "按日（本地时区）",
  "usage.col.model": "模型",
  "usage.col.msgs": "消息",
  "usage.col.input": "输入",
  "usage.col.output": "输出",
  "usage.col.cacheR": "缓存读",
  "usage.col.cacheW": "缓存写",
  "usage.col.total": "合计",
  "usage.col.cost": "成本",
  "usage.empty": "暂无用量数据。运行 pi（带真实模型）以记录 token 与成本。",
  "usage.empty.model": "暂无模型数据。",
  "usage.empty.day": "暂无每日数据。",
  "usage.showingLastN": "（显示最近 14 天，共 {n} 天）",

  // Tools
  "tools.h1": "工具清单",
  "tools.subtitle":
    "当前配置下 pi 可用的工具 — 内置 {builtin} 个，npm 扩展 {npm} 个。",
  "tools.empty": "暂未发现工具。运行 pi 一次以初始化目录。",
  "tools.section.builtin.title": "内置",
  "tools.section.builtin.subtitle": "Pi 自带（见 `pi --help`）",
  "tools.section.local.title": "扩展（项目本地）",
  "tools.section.local.subtitle": "~/.pi/agent/extensions/*.ts — 待 AST 扫描",
  "tools.section.npm.title": "扩展（npm）",
  "tools.section.npm.subtitle": "通过 `pi install <pkg>` 安装",
  "tools.col.name": "名称",
  "tools.col.source": "来源",
  "tools.col.safety": "安全",
  "tools.col.description": "描述",
  "tools.col.status": "状态",

  // Context
  "context.h1": "项目上下文",
  "context.subtitle":
    "在 {cwd} 下 pi 可能加载进系统提示的文件。镜像 pi 的 `loadProjectContextFiles` 算法。",
  "context.empty":
    "未找到上下文文件。在此目录创建 `AGENTS.md` 或 `CLAUDE.md`。",
  "context.section.loaded.title": "Pi 已加载",
  "context.section.loaded.subtitle": "会话开始时注入到系统提示",
  "context.section.info.title": "仅供查看",
  "context.section.info.subtitle": "Pilot 可见，Pi 不会自动加载",

  // Policy
  "policy.h1": "工具策略",
  "policy.subtitle": "用声明式 TOML 规则生成 pi 强制扩展。",

  // Compose
  "compose.h1": "编排",
  "compose.subtitle": "从侧栏拖拽方块规划会话 — 另存为配置、应用、运行。",
  "compose.inspector": "检视器",
  "compose.emptyCanvas": "画布为空 — 选中侧栏项后按 {key} 添加。",

  // Profiles
  "profiles.h1": "配置",
  "profiles.subtitle": "共 {n} 个配置 · 存储在 ~/.pilot/profiles/",
  "profiles.newNameLabel": "新配置名（kebab-case）",
  "profiles.newNamePlaceholder": "my-work",
  "profiles.empty": "暂无配置。用上方表单创建。",
  "profiles.delete": "删除",

  // Capabilities
  "capabilities.h1": "能力",
  "capabilities.subtitle": "已安装 {n} 个能力 · Forge 在 v0.4 推出。",
  "capabilities.refreshHint": "15 秒自动刷新",
  "capabilities.empty": "暂无已安装能力。Forge 在 v0.4 推出。",
  "capabilities.sources": "{n} 个来源",
  "capabilities.requires": "需要 {n}",
  "capabilities.conflicts": "冲突 {n}",
};
export default zh;
