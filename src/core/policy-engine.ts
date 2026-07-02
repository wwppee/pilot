/**
 * Policy engine — pure functions that evaluate a `ToolPolicy` against
 * a tool call. Used by:
 *   1. The generated `pilot-policy-<name>.ts` extension (runtime)
 *   2. The CLI `pilot policy check` command (preview / dry-run)
 *   3. Unit tests (no I/O)
 *
 * All checks return a `PolicyDecision` with a `block` flag and an
 * optional `reason` string. `block: true` means the tool call should
 * be denied; `block: false` means allowed.
 *
 * See: docs/roadmap-pi-grounded.md (Layer 2 policy section).
 */

import type { ToolPolicy } from "./policy.js";

// ─── Types ──────────────────────────────────────────────────

export interface PolicyDecision {
  /** Whether to allow the call. */
  block: boolean;
  /** Human-readable reason (only set when block is true). */
  reason?: string;
  /** Which policy rule fired (for debugging / audit). */
  rule?: string;
  /** When true, the call requires human approval (HITL) before proceeding. */
  requireApproval?: boolean;
  /** Approval prompt message (when requireApproval is true). */
  approvalPrompt?: string;
}

export interface ToolCallInfo {
  /** Tool name, e.g. "bash", "edit", "read". */
  name: string;
  /** Tool arguments. Shape varies per tool. */
  args: Record<string, unknown>;
}

// ─── Path / command helpers ─────────────────────────────────

/**
 * Match a path against a glob pattern.
 *
 * Uses a tiny `**` + `*` matcher. Supports:
 *   - `**` matches any number of path segments
 *   - `*` matches any characters except `/`
 *   - literal matches
 *
 * Examples:
 *   matchPath("X/.env", "/foo/.env")           === true
 *   matchPath("/etc/X", "/etc/passwd")         === true
 *   matchPath("X.ts", "src/foo.ts")            === true
 *   matchPath("X.ts", "src/sub/foo.ts")        === false
 */
export function matchPath(pattern: string, path: string): boolean {
  // We support three glob forms:
  //   - `*`  — any chars except `/`
  //   - `**` — any chars including `/` (path segments)
  //   - literal
  //
  // We always build an anchored regex. Leading `/` is preserved on
  // both pattern and path so that `/etc/**` and `/etc/passwd` match.
  const p = pattern;
  const t = path;

  let re = "";
  let i = 0;
  while (i < p.length) {
    if (p[i] === "*" && p[i + 1] === "*") {
      // ** can appear as `**/foo` (match across dirs) or `foo/**`
      // (match anything after). Both reduce to `.*` for the regex,
      // but we need to handle the leading/trailing `/` carefully.
      re += ".*";
      i += 2;
      // Eat a single following `/` (so `**/foo` becomes `.*foo`)
      if (p[i] === "/") i++;
    } else if (p[i] === "*") {
      re += "[^/]*";
      i++;
    } else if (p[i] === "/") {
      re += "/";
      i++;
    } else if (/[.+^$(){}|\\?[\]]/.test(p[i]!)) {
      re += "\\" + p[i];
      i++;
    } else {
      re += p[i];
      i++;
    }
  }
  const m = new RegExp("^" + re + "$").exec(t);
  return m !== null;
}

// ─── Main check function ─────────────────────────────────────

/**
 * Evaluate a tool call against a policy. Pure function — no I/O.
 *
 * Decision precedence (first match wins):
 *   1. allow/deny lists (deny wins)
 *   2. requireApproval (returns block: false but requireApproval: true)
 *   3. path/command denylists (tool-specific)
 *   4. allowed (block: false, no rule)
 */
export function checkPolicy(
  call: ToolCallInfo,
  policy: ToolPolicy,
): PolicyDecision {
  // 1. Tool-level allow/deny
  if (policy.deny.includes(call.name)) {
    return {
      block: true,
      reason: `tool "${call.name}" is denied by policy "${policy.name}"`,
      rule: "deny",
    };
  }
  if (policy.allow.length > 0 && !policy.allow.includes(call.name)) {
    return {
      block: true,
      reason: `tool "${call.name}" not in allow list of policy "${policy.name}"`,
      rule: "allow",
    };
  }

  // 2. requireApproval (HITL)
  if (policy.requireApproval.includes(call.name)) {
    return {
      block: false,
      requireApproval: true,
      approvalPrompt: `Policy "${policy.name}" requires your approval before "${call.name}" can run.`,
    };
  }

  // 3. Tool-specific checks
  switch (call.name) {
    case "read":
    case "edit":
    case "write": {
      const path = callArgsString(call.args, ["path", "file_path"]);
      if (path) {
        for (const pattern of policy.denyPaths) {
          if (matchPath(pattern, path)) {
            return {
              block: true,
              reason: `path "${path}" matches denied glob "${pattern}" in policy "${policy.name}"`,
              rule: "denyPaths",
            };
          }
        }
      }
      break;
    }
    case "bash": {
      const command = callArgsString(call.args, ["command"]);
      if (command) {
        for (const pattern of policy.denyCommands) {
          try {
            if (new RegExp(pattern).test(command)) {
              return {
                block: true,
                reason: `command matches denied regex "${pattern}" in policy "${policy.name}"`,
                rule: "denyCommands",
              };
            }
          } catch {
            // Invalid regex — skip silently (the schema doesn't enforce regex validity)
          }
        }
      }
      break;
    }
  }

  return { block: false };
}

// ─── Redaction ──────────────────────────────────────────────

/**
 * Apply sensitive-pattern redaction to tool-result content.
 *
 * Returns a NEW string with matched substrings replaced by `[REDACTED]`.
 * Used by the generated extension's `pi.on("tool_result")` hook.
 *
 * Patterns are substring matches (case-sensitive by default) — not regex.
 * If a pattern is a valid regex, it's used as such; otherwise it's a
 * plain substring.
 */
export function redactContent(content: unknown, policy: ToolPolicy): unknown {
  if (typeof content !== "string") return content;
  if (policy.sensitivePatterns.length === 0) return content;

  let out: string = content;
  for (const pattern of policy.sensitivePatterns) {
    if (pattern.length === 0) continue;
    // Try regex first; fall back to substring
    try {
      const re = new RegExp(pattern, "g");
      out = out.replace(re, "[REDACTED]");
    } catch {
      out = out.split(pattern).join("[REDACTED]");
    }
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────

/** Read a string field from tool args, supporting several common keys. */
function callArgsString(
  args: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
