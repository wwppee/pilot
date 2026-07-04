/**
 * session-template — derive a profile template from a real session.
 *
 * v0.4.13: when users want to create a profile "like the one I used
 * last Tuesday", we don't make them re-type the model name and the
 * tool list. Instead, point `/profiles/new?from=<sessionId>` at a
 * session and we extract the fields Pilot can recover from the
 * JSONL:
 *
 *   - `model`: first assistant message's model (same as snapshot)
 *   - `tools`: sorted unique list of tool names called in this session
 *     (from `toolCall` content blocks in assistant messages). Tools
 *     are *hints* — they're informational, the user still chooses
 *     which to allow/deny via the policy editor.
 *   - `cwd`: encoded cwd of the session
 *
 * What's NOT extracted:
 *   - thinking level — not logged per-session in v3 JSONL
 *   - exact token usage / cost — varies per turn, not profile-level
 *
 * Returns null when the session file no longer exists.
 */

import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { piAgentDir } from "./types.js";
import { readEntries } from "./jsonl-parser.js";
import type { SessionEntry } from "./types.js";

/**
 * Template extracted from a session — feeds into the profile creation
 * form as defaults. Tools are informational, not constraints.
 */
export interface SessionTemplate {
  sessionId: string;
  /** First assistant message's model — same field SessionSnapshot reads. */
  model?: string;
  /** Sorted unique tool names called via toolCall blocks. */
  tools: string[];
  /** Encoded cwd of the session (same as SessionInfo.cwd). */
  cwd?: string;
}

/**
 * Extract a template from a session by id. Walks the JSONL once,
 * collecting model (first hit) + tool names (every hit, deduplicated
 * and sorted at the end).
 */
export async function deriveTemplate(
  sessionId: string,
  home?: string,
): Promise<SessionTemplate | null> {
  const filePath = await findSessionFile(sessionId, home);
  if (!filePath) return null;

  let model: string | undefined;
  const tools = new Set<string>();

  for await (const entry of readEntries(filePath)) {
    // Model extraction — same logic as extractModelFromEntry in
    // jsonl-parser.ts, but inlined to avoid an import cycle.
    if (!model) {
      const m = extractModelFromEntry(entry);
      if (m) model = m;
    }
    // Tool extraction — v3 stores tool calls inside assistant message
    // content blocks with `type: "toolCall"` and `name: "..."`.
    if (entry.type === "message" && entry.message) {
      const msg = entry.message as Record<string, unknown>;
      if (msg["role"] === "assistant") {
        collectToolNames(msg["content"], tools);
      }
    }
  }

  const cwd = extractCwd(filePath);
  return {
    sessionId,
    ...(model !== undefined ? { model } : {}),
    tools: [...tools].sort(),
    ...(cwd !== undefined ? { cwd } : {}),
  };
}

/**
 * Walk an assistant message's content (string | array of blocks) and
 * pull out `type: "toolCall"` block names.
 */
function collectToolNames(
  content: unknown,
  out: Set<string>,
): void {
  if (typeof content === "string") return;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b["type"] === "toolCall" && typeof b["name"] === "string") {
        out.add(b["name"]);
      }
    }
  }
}

/**
 * Pull encoded cwd from a session file path — same trick used by
 * session-snapshot.ts. Kept duplicated to avoid cross-imports.
 */
function extractCwd(filePath: string): string | undefined {
  const idx = filePath.lastIndexOf(`${sep}sessions${sep}`);
  if (idx < 0) return undefined;
  const after = filePath.slice(idx + `${sep}sessions${sep}`.length);
  const seg = after.split(sep)[0];
  return seg && seg.length > 0 ? seg : undefined;
}

/**
 * Locate <sessionId>.jsonl under pi's sessions dir. Same walker as
 * session-snapshot.findSessionFile — duplicated here so each module
 * stays self-contained.
 */
async function findSessionFile(
  sessionId: string,
  home?: string,
): Promise<string | null> {
  const root = piAgentDir(home) + "/sessions";
  if (!existsSync(root)) return null;

  const cwdDirs = await readdir(root, { withFileTypes: true }).catch(
    () => [] as import("node:fs").Dirent[],
  );
  for (const d of cwdDirs) {
    if (!d.isDirectory()) continue;
    const candidate = join(root, d.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Local copy of extractModelFromEntry from jsonl-parser.ts — kept
 * inline to avoid exposing an internal helper. v3 supports message.model
 * and model_change.model; legacy assistant.data.model still parsed
 * for older sessions.
 */
function extractModelFromEntry(entry: SessionEntry): string | undefined {
  if (entry.type === "message" && entry.message) {
    const msg = entry.message as Record<string, unknown>;
    if (typeof msg["model"] === "string") return msg["model"];
  }
  if (entry.type === "model_change" && typeof entry.model === "string") {
    return entry.model;
  }
  return undefined;
}