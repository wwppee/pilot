/**
 * Centralized bilingual glossary for Pilot.
 *
 * v0.5.22: every entry now has explicit `en` + `zh` `short` and
 * `definition` fields. The same source of truth drives both the
 * inline `<GlossaryTerm>` tooltips (every hover) and the /help
 * page glossary list.
 *
 * Keys are referenced via `<GlossaryTerm term="X" locale={...} />`.
 * The GlossaryTerm component picks the right locale at render time.
 *
 * Convention: `short` is the term itself; `definition` is the
 * beginner-friendly one-liner. Keep `definition` ≤ 200 chars.
 */

const glossary = {
  pilot: {
    short: {
      en: "Pilot",
      zh: "Pilot",
    },
    definition: {
      en: "Pilot is a web UI + CLI for managing pi (the AI coding agent). Browse sessions, manage packages, see costs.",
      zh: "Pilot 是 pi（AI 编程 agent）的 Web UI + CLI 管理面板。可以看会话、装包、查费用。",
    },
  },
  pi: {
    short: {
      en: "pi",
      zh: "pi",
    },
    definition: {
      en: "An open-source AI coding agent. Runs in your terminal, edits files, calls tools. Pilot is its management dashboard.",
      zh: "一个开源的 AI 编程 agent。在终端跑、改文件、调工具。Pilot 是它的管理面板。",
    },
  },
  session: {
    short: {
      en: "session",
      zh: "会话",
    },
    definition: {
      en: "One pi conversation. Saved as a JSONL file in ~/.pi/agent/sessions/. Each prompt is a new entry.",
      zh: "一次 pi 对话。保存为 ~/.pi/agent/sessions/ 下的 JSONL 文件。每个 prompt 是一条新记录。",
    },
  },
  capability: {
    short: {
      en: "capability",
      zh: "能力",
    },
    definition: {
      en: "A named permission / setting (model, tools, policies) that pi uses for a session. Bundled into Avatars and Profiles.",
      zh: "一个有名字的权限 / 配置（model、tools、policies），pi 在会话里用。打包进 Avatars 和 Profiles。",
    },
  },
  avatar: {
    short: {
      en: "avatar",
      zh: "avatar",
    },
    definition: {
      en: "A project's expected config: which packages, profiles, policies should be active here. Lets you diff vs current.",
      zh: "一个项目应有的配置：哪些 packages、profiles、policies 在这里应该是激活的。可以跟当前状态对比差异。",
    },
  },
  profile: {
    short: {
      en: "profile",
      zh: "profile",
    },
    definition: {
      en: "A saved bundle of capabilities + model + thinking level. Switch profiles to quickly change pi's behavior.",
      zh: "保存好的能力包 + model + thinking level。切换 profile 来快速改变 pi 的行为。",
    },
  },
  pack: {
    short: {
      en: "package",
      zh: "package",
    },
    definition: {
      en: "A pi extension installed from npm — adds tools, prompts, or skills. Browse in /packages.",
      zh: "从 npm 安装的 pi 扩展——加 tools、prompts 或 skills。在 /packages 浏览。",
    },
  },
  fork: {
    short: {
      en: "fork",
      zh: "fork",
    },
    definition: {
      en: "Branch a session from any past user message. The original branch stays; future messages go to the new one.",
      zh: "从任意一条历史用户消息分叉出新的会话。原分支保留；后续消息进入新分支。",
    },
  },
  context: {
    short: {
      en: "context",
      zh: "context",
    },
    definition: {
      en: "Project-level rules pi reads on startup (AGENTS.md, CLAUDE.md). Shows which files were found.",
      zh: "项目级别的规则，pi 启动时读取（AGENTS.md、CLAUDE.md）。显示找到了哪些文件。",
    },
  },
  policy: {
    short: {
      en: "policy",
      zh: "policy",
    },
    definition: {
      en: "Safety rules: which tools pi can call, when to confirm, what to block. Edit in /policy.",
      zh: "安全规则：pi 哪些 tools 能直接调、哪些要你确认、哪些直接拦截。在 /policy 编辑。",
    },
  },
  plan: {
    short: {
      en: "plan",
      zh: "plan",
    },
    definition: {
      en: "A multi-step task (tasks + steps) for pi to execute. v0.5.13 ships the data model + UI; v0.6.0 adds execution.",
      zh: "一个多步任务（tasks + steps），交给 pi 执行。v0.5.13 提供数据模型 + UI；v0.6.0 加入执行能力。",
    },
  },
  rpc: {
    short: {
      en: "RPC",
      zh: "RPC",
    },
    definition: {
      en: "Remote Procedure Call. pi has a --mode rpc flag that lets other processes drive it via JSON messages.",
      zh: "远程过程调用。pi 的 --mode rpc 标志让其他进程用 JSON 消息驱动它。",
    },
  },
  token: {
    short: {
      en: "token",
      zh: "token",
    },
    definition: {
      en: "LLM usage unit. ~1 token ≈ ¾ of an English word. Cost = tokens × model's per-token rate.",
      zh: "LLM 用量单位。约 1 token ≈ ¾ 个英文单词。费用 = token 数 × 模型单价。",
    },
  },
  contextWindow: {
    short: {
      en: "context window",
      zh: "context window",
    },
    definition: {
      en: "Maximum tokens a model can read in one prompt. Larger = pi can 'remember' more of your session.",
      zh: "模型一次 prompt 能读的最大 token 数。越大 = pi 在一次会话里能'记住'的越多。",
    },
  },
  tool: {
    short: {
      en: "tool",
      zh: "tool",
    },
    definition: {
      en: "A function pi can call on your behalf — read a file, run shell, search code, etc. Listed in /tools.",
      zh: "pi 代替你调用的一个函数——读文件、跑 shell、搜代码等。在 /tools 列出。",
    },
  },
} as const satisfies Record<
  string,
  {
    short: Record<"en" | "zh", string>;
    definition: Record<"en" | "zh", string>;
  }
>;

/**
 * Per-locale resolution helpers. `locale` falls back to English
 * when a key is missing in the target language (e.g. brand names).
 */
function pickLocale(
  record: Record<"en" | "zh", string>,
  locale: "en" | "zh",
): string {
  return record[locale] ?? record.en;
}

export function shortFor(
  term: keyof typeof glossary,
  locale: "en" | "zh",
): string {
  return pickLocale(glossary[term].short, locale);
}

export function definitionFor(
  term: keyof typeof glossary,
  locale: "en" | "zh",
): string {
  return pickLocale(glossary[term].definition, locale);
}

export type { glossary };

export type GlossaryKey = keyof typeof glossary;

export default glossary;
