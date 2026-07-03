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
  "btn.add": "添加",
  "btn.remove": "移除",
  "btn.create": "创建",
  "btn.ariaConfirmDelete": "确认删除策略（再点一次即删除）",
  "btn.ariaDelete": "删除该策略",
  "btn.ariaApplyTitle":
    "生成 ~/.pilot/extensions/pilot-policy-<name>.ts 并让 pi 加载",
  "btn.ariaUnapplyTitle": "移除已生成的扩展",

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
