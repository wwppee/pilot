/**
 * `pilot policy` — manage ToolPolicy and emit pi extensions.
 *
 * v0.4.3: a `ToolPolicy` is a named bundle of allow/deny/path/command
 * rules. The CLI can:
 *   - ls/show: enumerate and inspect
 *   - new: create from a starter template
 *   - edit: open in $EDITOR (TODO v0.4.3.1)
 *   - apply: generate a `pilot-policy-<name>.ts` extension and write
 *            it to `~/.pilot/extensions/` so pi auto-loads it
 *   - unapply: remove the generated extension
 *   - check: dry-run a tool call against a policy
 *
 * Usage:
 *   pilot policy ls
 *   pilot policy show <name>
 *   pilot policy new <name>
 *   pilot policy apply <name>
 *   pilot policy unapply <name>
 *   pilot policy check <name> <tool> [--arg key=value ...]
 */

import kleur from "kleur";
import {
  listPolicies,
  readPolicy,
  tryReadPolicy,
  writePolicy,
  ensurePoliciesDir,
  policyPath,
  policyExtensionPath,
  pilotExtensionsDir,
  type ToolPolicy,
  type ToolPolicyInput,
} from "../core/policy.js";
import { generatePolicyExtension } from "../core/policy-extension.js";
import { checkPolicy, type ToolCallInfo } from "../core/policy-engine.js";
import { readFile, writeFile, unlink, stat } from "node:fs/promises";
import type { Command, PilotContext } from "../core/types.js";

export const manifest: Command = {
  name: "policy",
  description: "Manage tool policies and generate pi enforcement extensions",
  subcommands: [
    "ls",
    "show <name>",
    "new <name>",
    "apply <name>",
    "unapply <name>",
    "check <name> <tool> [...args]",
  ],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];
  const json = args.includes("--json");

  switch (sub) {
    case "ls":
      return runLs(args, ctx, json);
    case "show":
      return runShow(args, ctx, json);
    case "new":
      return runNew(args, ctx, json);
    case "apply":
      return runApply(args, ctx, json);
    case "unapply":
      return runUnapply(args, ctx, json);
    case "check":
      return runCheck(args, ctx, json);
    default:
      ctx.logger.error(
        "Usage: pilot policy <ls|show|new|apply|unapply|check> [...]",
      );
      return 1;
  }
}

// ─── ls ─────────────────────────────────────────────────────

async function runLs(
  _args: string[],
  ctx: PilotContext,
  json: boolean,
): Promise<number> {
  await ensurePoliciesDir(ctx.home);
  const policies = await listPolicies(ctx.home);

  if (json) {
    console.log(JSON.stringify(policies, null, 2));
    return 0;
  }

  console.log(
    kleur.bold("Tool Policies") + kleur.dim(`  (${policies.length})`),
  );
  console.log();
  if (policies.length === 0) {
    console.log(
      kleur.dim("  No policies yet. Try: pilot policy new safe-bash"),
    );
    return 0;
  }

  for (const p of policies) {
    const applied = await isExtensionInstalled(p.name, ctx.home);
    const status = applied
      ? kleur.green("● applied")
      : kleur.dim("○ not applied");
    console.log(
      `  ${kleur.cyan(p.name.padEnd(24))} ${status.padEnd(22)} ${kleur.dim(p.description ?? "")}`,
    );
    const counts: string[] = [];
    if (p.deny.length > 0) counts.push(`deny ${p.deny.length}`);
    if (p.allow.length > 0) counts.push(`allow ${p.allow.length}`);
    if (p.denyPaths.length > 0) counts.push(`paths ${p.denyPaths.length}`);
    if (p.denyCommands.length > 0)
      counts.push(`commands ${p.denyCommands.length}`);
    if (p.sensitivePatterns.length > 0)
      counts.push(`redact ${p.sensitivePatterns.length}`);
    if (p.requireApproval.length > 0)
      counts.push(`HITL ${p.requireApproval.length}`);
    if (counts.length > 0) {
      console.log(`  ${" ".repeat(24)} ${kleur.dim(counts.join(" · "))}`);
    }
  }
  return 0;
}

// ─── show ──────────────────────────────────────────────────

async function runShow(
  args: string[],
  ctx: PilotContext,
  json: boolean,
): Promise<number> {
  const name = args[1];
  if (!name || name.startsWith("--")) {
    ctx.logger.error("Usage: pilot policy show <name>");
    return 1;
  }
  const policy = await tryReadPolicy(name, ctx.home);
  if (!policy) {
    ctx.logger.error(`Policy not found: ${name}`);
    return 1;
  }
  if (json) {
    console.log(JSON.stringify(policy, null, 2));
    return 0;
  }
  printPolicyDetail(policy);
  const ext = policyExtensionPath(name, ctx.home);
  const applied = await isExtensionInstalled(name, ctx.home);
  console.log();
  console.log(
    kleur.dim(
      `  Extension: ${applied ? kleur.green("installed") : kleur.yellow("not installed")}  ${ext}`,
    ),
  );
  console.log(kleur.dim(`  Policy file: ${policyPath(name, ctx.home)}`));
  return 0;
}

// ─── new ──────────────────────────────────────────────────

async function runNew(
  args: string[],
  ctx: PilotContext,
  _json: boolean,
): Promise<number> {
  const name = args[1];
  if (!name || name.startsWith("--")) {
    ctx.logger.error("Usage: pilot policy new <name>");
    return 1;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    ctx.logger.error(`Invalid policy name: ${name}. Use kebab-case.`);
    return 1;
  }
  await ensurePoliciesDir(ctx.home);

  const existing = await tryReadPolicy(name, ctx.home);
  if (existing) {
    ctx.logger.error(`Policy already exists: ${name}`);
    return 1;
  }

  const input: ToolPolicyInput = {
    description: "My new tool policy",
    allow: [],
    deny: ["bash"], // safe-by-default starter
    denyPaths: ["**/.env", "**/.env.*", "**/secrets.json", "**/id_rsa"],
    denyCommands: [
      "^rm\\s+-rf\\s+/",
      "^mkfs",
      ":\\(\\)\\s*\\{\\s*:\\|:&\\s*\\};\\s*:", // fork bomb
      "dd\\s+if=.*of=/dev/(sd|nvme|hd)",
    ],
    sensitivePatterns: [
      "sk-[A-Za-z0-9]{20,}", // OpenAI / Anthropic keys
      "ghp_[A-Za-z0-9]{20,}", // GitHub PAT
      "AKIA[0-9A-Z]{16}", // AWS access key
      "(?i)password\\s*=\\s*\\S+",
    ],
    requireApproval: ["bash", "write"],
  };
  await writePolicy(name, input, ctx.home);
  console.log(kleur.green("✓") + ` Created policy ${kleur.cyan(name)}`);
  console.log(kleur.dim(`  File: ${policyPath(name, ctx.home)}`));
  console.log();
  console.log(kleur.dim("  Edit it then apply with:"));
  console.log(kleur.dim(`    pilot policy apply ${name}`));
  return 0;
}

// ─── apply ─────────────────────────────────────────────────

async function runApply(
  args: string[],
  ctx: PilotContext,
  _json: boolean,
): Promise<number> {
  const name = args[1];
  if (!name || name.startsWith("--")) {
    ctx.logger.error("Usage: pilot policy apply <name>");
    return 1;
  }
  const policy = await tryReadPolicy(name, ctx.home);
  if (!policy) {
    ctx.logger.error(`Policy not found: ${name}`);
    return 1;
  }

  const ext = policyExtensionPath(name, ctx.home);
  const extDir = pilotExtensionsDir(ctx.home);
  await ensurePoliciesDir(ctx.home);

  const source = generatePolicyExtension(policy);
  await writeFile(ext, source, "utf-8");
  console.log(
    kleur.green("✓") + ` Generated extension for ${kleur.cyan(name)}`,
  );
  console.log(kleur.dim(`  ${ext}`));
  console.log();
  console.log(kleur.bold("Loaded by pi from:"));
  console.log(kleur.dim(`  ${extDir}/`));
  console.log();
  console.log(kleur.dim("Pi will pick this up on next session start."));
  console.log(kleur.dim("For an active session, run /reload in pi."));
  return 0;
}

// ─── unapply ───────────────────────────────────────────────

async function runUnapply(
  args: string[],
  ctx: PilotContext,
  _json: boolean,
): Promise<number> {
  const name = args[1];
  if (!name || name.startsWith("--")) {
    ctx.logger.error("Usage: pilot policy unapply <name>");
    return 1;
  }
  const ext = policyExtensionPath(name, ctx.home);
  try {
    await stat(ext);
  } catch {
    console.log(kleur.yellow("○") + ` Not installed: ${name}`);
    return 0;
  }
  await unlink(ext);
  console.log(kleur.green("✓") + ` Removed extension for ${kleur.cyan(name)}`);
  console.log(kleur.dim(`  ${ext}`));
  return 0;
}

// ─── check (dry-run) ───────────────────────────────────────

async function runCheck(
  args: string[],
  ctx: PilotContext,
  json: boolean,
): Promise<number> {
  const name = args[1];
  const tool = args[2];
  if (!name || !tool || name.startsWith("--") || tool.startsWith("--")) {
    ctx.logger.error(
      "Usage: pilot policy check <name> <tool> [--arg key=value ...]",
    );
    return 1;
  }
  const policy = await readPolicy(name, ctx.home);

  // Parse --arg key=value pairs
  const toolArgs: Record<string, unknown> = {};
  for (let i = 3; i < args.length; i++) {
    if (args[i] === "--arg" && i + 1 < args.length) {
      const kv = args[i + 1]!;
      const eq = kv.indexOf("=");
      if (eq > 0) {
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        toolArgs[k] = coerceValue(v);
      }
      i++;
    }
  }

  const call: ToolCallInfo = { name: tool, args: toolArgs };
  const decision = checkPolicy(call, policy);

  if (json) {
    console.log(JSON.stringify({ call, decision }, null, 2));
  } else {
    console.log(
      kleur.bold("Check:") +
        ` ${kleur.cyan(tool)} against policy ${kleur.cyan(name)}`,
    );
    if (Object.keys(toolArgs).length > 0) {
      console.log(kleur.dim("  args:") + ` ${JSON.stringify(toolArgs)}`);
    }
    console.log();
    if (decision.block) {
      console.log(
        kleur.red("✗ BLOCKED") + kleur.dim(`  (rule: ${decision.rule})`),
      );
      console.log(`  ${decision.reason}`);
      return 2;
    }
    if (decision.requireApproval) {
      console.log(kleur.yellow("? APPROVAL REQUIRED"));
      console.log(`  ${decision.approvalPrompt}`);
      return 0;
    }
    console.log(kleur.green("✓ ALLOWED"));
  }
  return decision.block ? 2 : 0;
}

// ─── Helpers ───────────────────────────────────────────────

function printPolicyDetail(p: ToolPolicy): void {
  console.log(kleur.bold("Policy:") + ` ${kleur.cyan(p.name)}`);
  if (p.description) console.log(kleur.dim(`  ${p.description}`));
  console.log(kleur.dim(`  created: ${p.createdAt}`));
  console.log(kleur.dim(`  updated: ${p.updatedAt}`));
  console.log();

  if (p.deny.length > 0) {
    console.log(kleur.underline("Denied tools:"));
    for (const t of p.deny) console.log(`  ${kleur.red("✗")} ${t}`);
  }
  if (p.allow.length > 0) {
    console.log(kleur.underline("Allowed tools (exclusive):"));
    for (const t of p.allow) console.log(`  ${kleur.green("✓")} ${t}`);
  }
  if (p.denyPaths.length > 0) {
    console.log(kleur.underline("Denied paths:"));
    for (const g of p.denyPaths) console.log(`  ${kleur.red("✗")} ${g}`);
  }
  if (p.denyCommands.length > 0) {
    console.log(kleur.underline("Denied command patterns:"));
    for (const r of p.denyCommands) console.log(`  ${kleur.red("✗")} ${r}`);
  }
  if (p.sensitivePatterns.length > 0) {
    console.log(kleur.underline("Sensitive patterns (redact):"));
    for (const r of p.sensitivePatterns)
      console.log(`  ${kleur.yellow("◐")} ${r}`);
  }
  if (p.requireApproval.length > 0) {
    console.log(kleur.underline("Require approval:"));
    for (const t of p.requireApproval)
      console.log(`  ${kleur.yellow("?")} ${t}`);
  }
  if (
    p.deny.length === 0 &&
    p.allow.length === 0 &&
    p.denyPaths.length === 0 &&
    p.denyCommands.length === 0 &&
    p.sensitivePatterns.length === 0 &&
    p.requireApproval.length === 0
  ) {
    console.log(kleur.dim("  (no rules — this policy does nothing)"));
  }
}

async function isExtensionInstalled(
  name: string,
  home?: string,
): Promise<boolean> {
  try {
    await stat(policyExtensionPath(name, home));
    return true;
  } catch {
    return false;
  }
}

/** Coerce --arg value: number / true / false / null / string. */
function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

// readFile is reserved for future "show extension source" subcommand.
void readFile;
