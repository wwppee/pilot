/**
 * pilot-tools — Pi extension exposing Pilot's commands as LLM tools.
 *
 * v0.5.4 NEW (Co-pilot 模式): let Pi's LLM call Pilot during a session
 * so it can self-adjust its capabilities without leaving the conversation.
 *
 * ## Why this exists
 *
 * Before v0.5.4, Pilot was strictly a "side panel" — you had to exit Pi
 * to run `pilot pack install`, switch profiles, capture Avatars, etc.
 * That broke flow. With pilot-tools, the LLM can:
 *
 *   - `pilot_pack_install({source: "npm:foo"})` — grab a pack mid-conversation
 *   - `pilot_profile_activate({name: "pi-architect"})` — switch context
 *   - `pilot_avatar_capture({cwd: "/path"})` — checkpoint current state
 *   - `pilot_session_search({query: "memory leak"})` — find past sessions
 *   - `pilot_session_info({id: "..."})` — pull summary card data
 *   - `pilot_stats_today({})` — see today's spend
 *   - `pilot_doctor({})` — health check
 *
 * ## How it talks to Pilot
 *
 * All tools call Pilot's local HTTP server at http://127.0.0.1:17361
 * (same as the Web UI uses). Token is read from `~/.pilot/server.token`.
 * If the server isn't running, every tool returns a clear "start it with
 * `pilot dashboard`" error — never a silent failure.
 *
 * ## Safety
 *
 * Pilot only exposes commands the user can already run from the CLI.
 * There's no "hidden channel" — every tool's name matches a real
 * `pilot <verb>` command. Tools return JSON-shaped text so the LLM can
 * either display it directly or feed it into the next reasoning step.
 *
 * ## Hot-reload
 *
 * Pi auto-discovers extensions from `~/.pi/agent/extensions/`. The
 * `pilot init` / `pilot agent` commands symlink this file there, so
 * editing the source + `/reload` picks up changes without restart.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Pilot HTTP client ─────────────────────────────────────────

const PILOT_PORT = 17361;
const PILOT_BASE = `http://127.0.0.1:${PILOT_PORT}`;

interface PilotCallResult {
  ok: boolean;
  status: number;
  body: string;
}

async function callPilot(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<PilotCallResult> {
  const tokenPath = join(homedir(), ".pilot", "server.token");
  if (!existsSync(tokenPath)) {
    return {
      ok: false,
      status: 0,
      body: `Pilot server not running (no token at ${tokenPath}). Start it with \`pilot dashboard\`.`,
    };
  }
  let token: string;
  try {
    token = (await readFile(tokenPath, "utf-8")).trim();
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: `Pilot token unreadable: ${(e as Error).message}`,
    };
  }

  const url = `${PILOT_BASE}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "X-Pilot-Token": token,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* not JSON, keep raw */
    }
    return { ok: res.ok, status: res.status, body: pretty };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: `Pilot server unreachable at ${PILOT_BASE}: ${(e as Error).message}. Start it with \`pilot dashboard\`.`,
    };
  }
}

function textResult(text: string, isError: boolean) {
  return {
    content: [{ type: "text" as const, text }],
    details: {},
    ...(isError ? { isError: true } : {}),
  };
}

// ─── Schemas ───────────────────────────────────────────────────

const PilotPackInstallParams = Type.Object({
  source: Type.String({
    description:
      'Pack source: "npm:foo" / "git:github.com/u/r@v1" / "file:/abs/path"',
  }),
});

const PilotPackUninstallParams = Type.Object({
  name: Type.String({ description: "Pack name to uninstall (e.g. 'foo')" }),
});

const PilotProfileActivateParams = Type.Object({
  name: Type.String({ description: "Profile name to activate" }),
});

const PilotSessionSearchParams = Type.Object({
  query: Type.String({ description: "Full-text query over session JSONL" }),
  limit: Type.Optional(
    Type.Number({ description: "Max results (default 20)" }),
  ),
});

const PilotSessionInfoParams = Type.Object({
  id: Type.String({ description: "Session id (URL-encoded timestamp prefix)" }),
});

const PilotAvatarCaptureParams = Type.Object({
  cwd: Type.Optional(
    Type.String({
      description: "Project cwd (defaults to current pi session cwd)",
    }),
  ),
});

const PilotAvatarDiffParams = Type.Object({
  cwd: Type.Optional(
    Type.String({
      description: "Project cwd (defaults to current pi session cwd)",
    }),
  ),
});

const PilotAvatarApplyParams = Type.Object({
  cwd: Type.Optional(
    Type.String({
      description: "Project cwd (defaults to current pi session cwd)",
    }),
  ),
  dry: Type.Optional(
    Type.Boolean({
      description: "true = preview only, no side-effects (default true)",
    }),
  ),
});

const PilotStatsRangeParams = Type.Object({
  range: Type.Optional(StringEnum(["today", "week", "month", "all"] as const)),
});

const PilotCapabilityDiffParams = Type.Object({
  a: Type.String({ description: "First capability id" }),
  b: Type.String({ description: "Second capability id" }),
});

const PilotForgeSearchParams = Type.Object({
  query: Type.String({ description: "Search query (e.g. 'memory leak')" }),
  limit: Type.Optional(
    Type.Number({ description: "Max results (default 10)" }),
  ),
});

// ─── Extension ─────────────────────────────────────────────────

export default function pilotToolsExtension(pi: ExtensionAPI): void {
  // Notify once per session so the user knows the bridge is alive.
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.notify(
      "pilot-tools loaded — Pilot commands available as LLM tools",
      "info",
    );
  });

  // ─── Pack management ──────────────────────────────────────

  pi.registerTool({
    name: "pilot_pack_install",
    label: "Pilot: Install pack",
    description:
      "Install a Pi pack into ~/.pi/agent/. Source format: 'npm:foo' / 'git:github.com/u/r@v1' / 'file:/abs/path'. Returns the install report (success/failure per source).",
    promptSnippet:
      "Install a Pi pack from npm:, git:, or file: source into ~/.pi/agent/",
    promptGuidelines: [
      "Use pilot_pack_install when the user asks to add a new Pi capability, tool, or extension package during the conversation.",
    ],
    parameters: PilotPackInstallParams,
    async execute(_toolCallId, params) {
      const r = await callPilot("POST", "/packs/install", {
        source: params.source,
      });
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_pack_uninstall",
    label: "Pilot: Uninstall pack",
    description:
      "Uninstall a Pi pack by name (matches the npm name without 'npm:' prefix).",
    promptSnippet: "Uninstall a Pi pack by name",
    promptGuidelines: [
      "Use pilot_pack_uninstall when the user wants to remove a previously installed pack.",
    ],
    parameters: PilotPackUninstallParams,
    async execute(_toolCallId, params) {
      const r = await callPilot("POST", `/packs/uninstall`, {
        name: params.name,
      });
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_pack_list",
    label: "Pilot: List packs",
    description:
      "List currently installed Pi packs (source + name). Read-only, fast.",
    promptSnippet: "List installed Pi packs",
    promptGuidelines: [
      "Use pilot_pack_list when you need to know what packs are currently installed before deciding whether to install or uninstall one.",
    ],
    parameters: Type.Object({}),
    async execute() {
      const r = await callPilot("GET", "/packs");
      return textResult(r.body, !r.ok);
    },
  });

  // ─── Profile management ───────────────────────────────────

  pi.registerTool({
    name: "pilot_profile_activate",
    label: "Pilot: Activate profile",
    description:
      "Activate a Pilot profile by name. Writes ~/.pilot/active.json; pi picks it up on the next session_start.",
    promptSnippet: "Activate a named Pilot profile",
    promptGuidelines: [
      "Use pilot_profile_activate when the user wants to switch profile context (model + system prompt overlay).",
    ],
    parameters: PilotProfileActivateParams,
    async execute(_toolCallId, params) {
      const r = await callPilot(
        "POST",
        `/profiles/${encodeURIComponent(params.name)}/activate`,
      );
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_profile_list",
    label: "Pilot: List profiles",
    description:
      "List available Pilot profiles. Each profile bundles a model + optional system prompt overlay.",
    promptSnippet: "List available Pilot profiles",
    promptGuidelines: [
      "Use pilot_profile_list when the user wants to see what profiles exist before switching.",
    ],
    parameters: Type.Object({}),
    async execute() {
      const r = await callPilot("GET", "/profiles");
      return textResult(r.body, !r.ok);
    },
  });

  // ─── Session history ──────────────────────────────────────

  pi.registerTool({
    name: "pilot_session_search",
    label: "Pilot: Search sessions",
    description:
      "Full-text search over Pi's session JSONL. Returns matching sessions with id + cwd + preview.",
    promptSnippet: "Full-text search over past Pi sessions",
    promptGuidelines: [
      "Use pilot_session_search when the user asks about something they did in a past session and you need to find it before quoting or summarizing.",
    ],
    parameters: PilotSessionSearchParams,
    async execute(_toolCallId, params) {
      const qs = new URLSearchParams({ q: params.query });
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      const r = await callPilot("GET", `/sessions/search?${qs}`);
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_session_info",
    label: "Pilot: Session info",
    description:
      "Get per-session summary card (model, duration, total tokens, total cost, tools used) for one session id.",
    promptSnippet:
      "Per-session summary card: model, duration, tokens, cost, tools used",
    promptGuidelines: [
      "Use pilot_session_info when the user asks about a specific past session's stats — model used, how long it ran, total tokens/cost, what tools it called.",
    ],
    parameters: PilotSessionInfoParams,
    async execute(_toolCallId, params) {
      const r = await callPilot(
        "GET",
        `/sessions/${encodeURIComponent(params.id)}/info`,
      );
      return textResult(r.body, !r.ok);
    },
  });

  // ─── Stats ────────────────────────────────────────────────

  pi.registerTool({
    name: "pilot_stats",
    label: "Pilot: Stats",
    description:
      "Get Pilot's usage stats: total tokens / cost / messages / by-model breakdown for a given range.",
    promptSnippet:
      "Aggregate Pilot usage stats (tokens, cost, messages) for today/week/month/all",
    promptGuidelines: [
      "Use pilot_stats when the user asks how much they've spent, how many messages they've exchanged, or which model they've used most.",
    ],
    parameters: PilotStatsRangeParams,
    async execute(_toolCallId, params) {
      const qs = new URLSearchParams({ range: params.range ?? "today" });
      const r = await callPilot("GET", `/stats?${qs}`);
      return textResult(r.body, !r.ok);
    },
  });

  // ─── Avatars ──────────────────────────────────────────────

  pi.registerTool({
    name: "pilot_avatar_capture",
    label: "Pilot: Capture avatar",
    description:
      "Capture current Pilot state (active profile + model + installed packs + generated policy extensions) into a per-cwd Avatar. Use this when the user wants to checkpoint the working setup of a project.",
    promptSnippet:
      "Capture current Pilot state into a per-cwd Avatar checkpoint",
    promptGuidelines: [
      "Use pilot_avatar_capture when the user says things like 'remember this setup for this project' or 'save the current config so I can restore it later'.",
    ],
    parameters: PilotAvatarCaptureParams,
    async execute(_toolCallId, params) {
      const cwd = params.cwd ?? process.cwd();
      const r = await callPilot(
        "POST",
        `/avatars/${encodeURIComponent(cwd)}/capture`,
      );
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_avatar_diff",
    label: "Pilot: Avatar diff",
    description:
      "Diff an Avatar (expected state) against the current state for a given cwd. Returns per-field status (match / drift / missing / extra).",
    promptSnippet:
      "Diff a saved Avatar against the current Pilot state for a project",
    promptGuidelines: [
      "Use pilot_avatar_diff when the user asks 'what's drifted' or 'is this project still set up the way I left it'.",
    ],
    parameters: PilotAvatarDiffParams,
    async execute(_toolCallId, params) {
      const cwd = params.cwd ?? process.cwd();
      const r = await callPilot(
        "GET",
        `/avatars/${encodeURIComponent(cwd)}/diff`,
      );
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_avatar_apply",
    label: "Pilot: Avatar apply (dry-run by default)",
    description:
      "Apply an Avatar: install missing packs + activate profile. Defaults to dry-run=true (preview only, no side-effects). Pass dry=false to actually apply.",
    promptSnippet:
      "Apply a saved Avatar to bring current state in line; defaults to dry-run",
    promptGuidelines: [
      "Use pilot_avatar_apply with dry=true first to preview, then call again with dry=false once the user confirms.",
    ],
    parameters: PilotAvatarApplyParams,
    async execute(_toolCallId, params) {
      const cwd = params.cwd ?? process.cwd();
      const dry = params.dry !== false; // default true
      const r = await callPilot(
        "POST",
        `/avatars/${encodeURIComponent(cwd)}/apply${dry ? "?dry=1" : ""}`,
      );
      return textResult(r.body, !r.ok);
    },
  });

  // ─── Forge / capability ───────────────────────────────────

  pi.registerTool({
    name: "pilot_forge_search",
    label: "Pilot: Forge search",
    description:
      "Search the npm registry for Pi packages matching a query. Returns name + description + weekly downloads.",
    promptSnippet: "Search the npm registry for Pi packages",
    promptGuidelines: [
      "Use pilot_forge_search when the user wants to find a pack that does something specific but doesn't know the exact name.",
    ],
    parameters: PilotForgeSearchParams,
    async execute(_toolCallId, params) {
      const qs = new URLSearchParams({ q: params.query });
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      const r = await callPilot("GET", `/forge/search?${qs}`);
      return textResult(r.body, !r.ok);
    },
  });

  pi.registerTool({
    name: "pilot_capability_diff",
    label: "Pilot: Capability diff",
    description:
      "Diff two capability specs by id (e.g. compare two versions of a pack). Returns per-field status: match / drift / missing / extra.",
    promptSnippet: "Diff two capability specs by id",
    promptGuidelines: [
      "Use pilot_capability_diff when comparing two versions of the same pack or two related packs.",
    ],
    parameters: PilotCapabilityDiffParams,
    async execute(_toolCallId, params) {
      const r = await callPilot(
        "GET",
        `/capabilities/${encodeURIComponent(params.a)}/diff/${encodeURIComponent(params.b)}`,
      );
      return textResult(r.body, !r.ok);
    },
  });

  // ─── Health ───────────────────────────────────────────────

  pi.registerTool({
    name: "pilot_doctor",
    label: "Pilot: Doctor",
    description:
      "Run Pilot's health check: verifies Node version, pi on PATH, fd optional, home directory, server reachability, etc. Returns pass/fail per check.",
    promptSnippet: "Run Pilot's health check",
    promptGuidelines: [
      "Use pilot_doctor when something seems wrong and you want a structured list of what to fix.",
    ],
    parameters: Type.Object({}),
    async execute() {
      const r = await callPilot("GET", "/doctor");
      return textResult(r.body, !r.ok);
    },
  });
}
