/**
 * Centralized glossary for Pilot.
 *
 * v0.5.18: beginner-friendly guidance — every jargon term used in
 * the UI gets a one-line definition here. The same term always
 * explains the same way.
 *
 * Keys are referenced via `<GlossaryTerm term="X" />`.
 *
 * Convention: `short` is the term itself; `definition` is the
 * beginner-friendly one-liner. Keep `definition` ≤ 140 chars.
 */

const glossary = {
  pilot: {
    short: "Pilot",
    definition:
      "A web UI + CLI for managing pi (the AI coding agent). Read sessions, manage packages, see costs.",
  },
  pi: {
    short: "pi",
    definition:
      "An open-source AI coding agent. Runs in your terminal, edits files, calls tools. Pilot is its management dashboard.",
  },
  session: {
    short: "session",
    definition:
      "One pi conversation. Saved as a JSONL file in ~/.pi/agent/sessions/. Each prompt is a new entry.",
  },
  capability: {
    short: "capability",
    definition:
      "A named permission / setting (model, tools, policies) that pi uses for a session. Bundled into Avatars and Profiles.",
  },
  avatar: {
    short: "avatar",
    definition:
      "A project's expected config: which packages, profiles, policies should be active here. Lets you diff vs current.",
  },
  profile: {
    short: "profile",
    definition:
      "A saved bundle of capabilities + model + thinking level. Switch profiles to quickly change pi's behavior.",
  },
  pack: {
    short: "package",
    definition:
      "A pi extension installed from npm — adds tools, prompts, or skills. Browse in /packages.",
  },
  tool: {
    short: "tool",
    definition:
      "A function pi can call on your behalf — read a file, run shell, search code, etc. Listed in /tools.",
  },
  fork: {
    short: "fork",
    definition:
      "Branch a session from any past user message. The original branch stays; future messages go to the new one.",
  },
  context: {
    short: "context",
    definition:
      "Project-level rules pi reads on startup (AGENTS.md, CLAUDE.md). Shows which files were found.",
  },
  policy: {
    short: "policy",
    definition:
      "Safety rules: which tools pi can call, when to confirm, what to block. Edit in /policy.",
  },
  plan: {
    short: "plan",
    definition:
      "A multi-step task (tasks + steps) for pi to execute. v0.5.13 ships the data model + UI; v0.6.0 adds execution.",
  },
  rpc: {
    short: "RPC",
    definition:
      "Remote Procedure Call. pi has a `--mode rpc` flag that lets other processes drive it via JSON messages.",
  },
  token: {
    short: "token",
    definition:
      "LLM usage unit. ~1 token ≈ ¾ of an English word. Cost = tokens × model's per-token rate.",
  },
  contextWindow: {
    short: "context window",
    definition:
      "Maximum tokens a model can read in one prompt. Larger = pi can 'remember' more of your session.",
  },
} as const satisfies Record<string, { short: string; definition: string }>;

export type { glossary };

export type GlossaryKey = keyof typeof glossary;

export default glossary;
