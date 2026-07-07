/**
 * Default implementation of PilotService.
 *
 * Wires together the existing core modules (settings, jsonl-parser, npm-registry,
 * pi-cli, capability) into a single object that satisfies the PilotService interface.
 *
 * This is the **only** place where read paths converge. Commands / server / Web UI
 * must all go through this. The default impl is intentionally not exported
 * directly — callers receive it via `createService()` so tests can swap in
 * a mock.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

import { listCapabilities, tryLoadCapability } from "./capability.js";
import { diffCapability } from "./capability-diff.js";
import { readSessionTree, searchSession } from "./jsonl-parser.js";
import {
  classifyFromManifest,
  readPackManifestCached,
} from "./pack-manifest.js";
import { getPack, searchPacks as searchPacksNpm } from "./npm-registry.js";
import { isPiInstalled, runPiStreaming } from "./pi-cli.js";
import {
  deleteProfile,
  listProfiles,
  tryReadProfile,
  writeProfile,
} from "./profile.js";
import {
  clearActiveProfile,
  readActiveProfile,
  writeActiveProfile,
} from "./profile-state.js";
import { discoverProjectContext } from "./project-context.js";
import { listAllSessions, sortByRecent } from "./sessions.js";
import { deriveSnapshot } from "./session-snapshot.js";
import { deriveTemplate } from "./session-template.js";
import { deriveSessionInfo } from "./session-info.js";
import { listSources, readSettings } from "./settings.js";
import { forgeAbsorb, forgeInspect, forgeSearch } from "./forge.js";
import {
  applyAvatar as applyAvatarCore,
  captureAvatar as captureAvatarCore,
  deleteAvatar as deleteAvatarCore,
  diffAvatar as diffAvatarCore,
  listAvatars as listAvatarsCore,
  readAvatar as readAvatarCore,
  readCurrentState as readCurrentStateCore,
} from "./avatar.js";
import { aggregateStats } from "./stats.js";
import { listToolInventory } from "./tool-inventory.js";
import {
  traceToolCalls,
  type ToolCallEvent,
  type ToolTraceFilter,
} from "./tool-trace.js";
import { aggregateUsage } from "./usage.js";
import {
  piAgentDir,
  piSettingsFile,
  piSessionsDir,
  type InstalledPack,
  type Pack,
  type SessionInfo,
  type SessionTree,
} from "./types.js";

import type {
  DoctorCheck,
  DoctorReport,
  PilotService,
  PolicyDecision,
  SessionFilter,
  SessionSearchHit,
} from "./service.js";
import {
  deletePolicy as deletePolicyFromHome,
  ensurePoliciesDir,
  listPolicies as listPoliciesFromFs,
  policyExtensionPath,
  readPolicy as readPolicyFromHome,
  tryReadPolicy,
  writePolicy as writePolicyToHome,
  type ToolPolicyInput,
} from "./policy.js";
import {
  checkPolicy as checkPolicyInEngine,
  type ToolCallInfo,
} from "./policy-engine.js";
import { generatePolicyExtension } from "./policy-extension.js";
import {
  writeFile,
  unlink as unlinkFile,
  stat as statFile,
} from "node:fs/promises";
import type { Plan, Task, Step, ToolSuggestion } from "./plan.js";

export interface CreateServiceOptions {
  /**
   * Override the user's home directory. Defaults to `$HOME` (or `os.homedir()`).
   * Tests use this to point service at a temp dir.
   */
  home?: string;
}

// ─── Factory ───────────────────────────────────────────────

/** Create the default service instance. */
export function createService(opts: CreateServiceOptions = {}): PilotService {
  const home = opts.home;
  return {
    listPacks: () => listPacks(home),
    searchPacks: (q) => searchPacks(q),
    getPack: (name) => getPack(name),
    installPack: (source) => installPack(source),
    uninstallPack: (name: string) => uninstallPack(name, home),

    listSessions: (filter) => listSessions(filter, home),
    searchSessions: (q, options) => searchSessions(q, options, home),
    readSessionTree: (id) => readSessionTreeById(id, home),
    getSnapshot: (id) => deriveSnapshot(id, home),
    getSessionTemplate: (id) => deriveTemplate(id, home),
    getSessionInfo: (id) => deriveSessionInfo(id, home),

    forgeSearch: (q) => forgeSearch(q),
    forgeInspect: (name) => forgeInspect(name),
    forgeAbsorb: async (name, asId) =>
      (await forgeAbsorb(name, asId, home)).capability,

    listAvatars: () => listAvatarsCore(home),
    readAvatar: (encodedCwd) => readAvatarCore(encodedCwd, home),
    captureAvatar: (encodedCwd) => captureAvatarCore(encodedCwd, home),
    deleteAvatar: (encodedCwd) => deleteAvatarCore(encodedCwd, home),
    applyAvatar: (encodedCwd, opts) => applyAvatarCore(encodedCwd, home, opts),
    readCurrentState: () => readCurrentStateCore(home),
    diffAvatar: async (encodedCwd) => {
      const avatar = await readAvatarCore(encodedCwd, home);
      if (!avatar) return null;
      const current = await readCurrentStateCore(home);
      return diffAvatarCore(avatar, current);
    },

    capabilityDiff: async (aId, bId) => {
      const [a, b] = await Promise.all([
        tryLoadCapability(aId, home),
        tryLoadCapability(bId, home),
      ]);
      if (!a || !b) return null;
      return diffCapability(a, b);
    },
    traceSessionTools: (id, filter) => traceSessionTools(id, home, filter),

    runDoctor: () => runDoctor(home),

    listCapabilities: () => listCapabilities(home),
    getCapability: (id) => tryLoadCapability(id, home),

    listProfiles: () => listProfiles(home),
    getProfile: (name) => tryReadProfile(name, home),
    setProfile: (name, input) => writeProfile(name, input, home),
    deleteProfile: (name) => deleteProfile(name, home),
    activateProfile: async (name) => {
      // Refuse to activate a profile that has no TOML — silently
      // activating "ghost" profiles is how drift bugs start.
      const existing = await tryReadProfile(name, home);
      if (!existing) {
        throw new Error(
          `Profile "${name}" not found in ~/.pilot/profiles/. Run \`pilot profile ls\` to see available profiles.`,
        );
      }
      // v0.5.5: actually apply the profile to pi's settings.json so
      // the next pi launch picks up the model / thinking / packages.
      // Previously this only wrote `~/.pilot/active.json`, a file
      // pi never read — the activation was theatrical.
      //
      // v0.5.6: pass the full profile so provider / packages / notes
      // also flow through (previously only model + thinking made it).
      // We do this BEFORE writeActiveProfile so a settings write
      // failure surfaces clearly instead of leaving Pilot's diary
      // pointing at a profile that pi's runtime can't see.
      const { applyProfileToPi } = await import("./apply-profile-to-pi.js");
      const applied = await applyProfileToPi(existing, home);
      if (!applied.ok) {
        throw new Error(
          `failed to apply profile "${name}" to pi's settings: ${applied.message}${applied.error ? ` (${applied.error})` : ""}`,
        );
      }
      return writeActiveProfile(name, "web", home);
    },
    getActiveProfile: () => readActiveProfile(home),
    clearActiveProfile: () => clearActiveProfile(home),

    getStats: (range) => aggregateStats(range, home),
    getUsage: (range) => aggregateUsage(range, home),

    listTools: () => listToolInventory(home),
    discoverProjectContext: (cwd) => discoverProjectContext(cwd, home),

    listComposeEntities: () => listComposeEntitiesFromService(home),

    listPolicies: () => listPoliciesFromHome(home),
    getPolicy: (name) => tryReadPolicy(name, home),
    setPolicy: (name, input) => writePolicyWithHome(name, input, home),
    deletePolicy: (name) => deletePolicyByName(name, home),
    applyPolicy: (name) => applyPolicyByName(name, home),
    unapplyPolicy: (name) => unapplyPolicyByName(name, home),
    checkPolicyCall: (name, call) => checkPolicyCallByName(name, call, home),

    // ─── Plans (v0.6.0 — Agent capability layer) ────
    listPlans: () => listPlansFromHome(home),
    getPlan: (id) => readPlanFromHome(id, home),
    createPlan: (input) => createPlanInHome(input, home),
    updatePlan: (id, input) => updatePlanInHome(id, input, home),
    deletePlan: (id) => deletePlanFromHome(id, home),
    startPlan: (id) => startPlanInHome(id, home),
    pausePlan: (id) => pausePlanInHome(id, home),
    resumePlan: (id) => resumePlanInHome(id, home),
    cancelPlan: (id) => cancelPlanInHome(id, home),
    updateTask: (planId, taskId, updates) =>
      updateTaskInHome(planId, taskId, updates, home),
    updateStep: (planId, taskId, stepId, updates) =>
      updateStepInHome(planId, taskId, stepId, updates, home),
    suggestTools: (goal) => suggestToolsFromHome(goal, home),
  };
}

// ─── Packs ─────────────────────────────────────────────────

async function listPacks(home?: string): Promise<InstalledPack[]> {
  const settings = await readSettings(home);
  const sources = listSources(settings);
  // Enrich each source with its manifest in parallel (cached). Falls back to
  // name heuristic when manifest is missing or has no `pi` field.
  return Promise.all(sources.map((s) => toInstalledPack(s)));
}

async function searchPacks(query: string): Promise<Pack[]> {
  return searchPacksNpm({ query, size: 15 });
}

async function installPack(source: string): Promise<void> {
  const spec = source.includes(":") ? source : `npm:${source}`;
  await runPiStreaming(["install", spec]);
}

async function uninstallPack(name: string, home?: string): Promise<void> {
  if (!name) {
    throw new Error("Usage: pilot pack uninstall <name>");
  }
  // v0.4.12: gate on whether the pack is actually installed, so users
  // get a clear error instead of a confusing pi-side failure if they
  // typo the name.
  const installed = await listPacks(home);
  const found = installed.find(
    (p) => p.name === name || p.source === `npm:${name}`,
  );
  if (!found) {
    throw new Error(
      `Pack "${name}" is not installed. Run \`pilot pack ls\` to see installed packs.`,
    );
  }
  const spec = found.source.startsWith("npm:")
    ? found.source
    : `npm:${found.name}`;
  await runPiStreaming(["uninstall", spec]);
}

async function toInstalledPack(source: string): Promise<InstalledPack> {
  // v0.5.5: `listSources` now returns plain strings (the new `packages`
  // field is `string | {source,...}`, we extract the source via
  // `packageSourceOf`). pi's schema has no `enabled` flag, so every
  // package listed in `settings.json` is implicitly enabled — we
  // preserve the `InstalledPack.enabled` field for back-compat but
  // always set it to `true`.
  const colonIdx = source.indexOf(":");
  const name = colonIdx >= 0 ? source.slice(colonIdx + 1) : source;
  // Read manifest (cached). Falls back to name heuristic on failure or
  // when manifest has no `pi` field.
  const manifest = await readPackManifestCached(name);
  return {
    source,
    name,
    enabled: true,
    kind: classifyFromManifest(manifest, name),
  };
}

// ─── Sessions ──────────────────────────────────────────────

async function listSessions(
  filter: SessionFilter | undefined,
  home?: string,
): Promise<SessionInfo[]> {
  const all = sortByRecent(await listAllSessions(home));
  if (!filter) return all;

  return all.filter((s) => {
    if (
      filter.model &&
      !(s.model ?? "").toLowerCase().includes(filter.model.toLowerCase())
    ) {
      return false;
    }
    if (filter.cwd && s.cwd !== filter.cwd) return false;
    if (filter.sinceDays !== undefined) {
      const lastUsed = s.lastUsedAt ? Date.parse(s.lastUsedAt) : 0;
      const cutoff = Date.now() - filter.sinceDays * 24 * 60 * 60 * 1000;
      if (lastUsed < cutoff) return false;
    }
    return true;
  });
}

async function searchSessions(
  query: string,
  options: { caseSensitive?: boolean } | undefined,
  home?: string,
): Promise<SessionSearchHit[]> {
  const caseSensitive = options?.caseSensitive ?? false;
  const all = await listAllSessions(home);

  // Bounded concurrency — don't pin the disk on huge session stores.
  const CONCURRENCY = 8;
  const queue: SessionInfo[] = [...all];
  const hits: SessionSearchHit[] = [];

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const info = queue.shift();
        if (!info) return;
        try {
          const count = await searchSession(info.path, query, caseSensitive);
          if (count > 0) hits.push({ info, hits: count });
        } catch {
          // skip unreadable
        }
      }
    }),
  );

  hits.sort((a, b) => b.hits - a.hits);
  return hits;
}

async function readSessionTreeById(
  id: string,
  home?: string,
): Promise<SessionTree> {
  const all = await listAllSessions(home);
  const match = all.find((s) => s.id === id);
  if (!match) {
    throw new Error(`session not found: ${id}`);
  }
  return readSessionTree(match.path, id);
}

async function* traceSessionTools(
  id: string,
  home: string | undefined,
  filter: ToolTraceFilter | undefined,
): AsyncIterable<ToolCallEvent> {
  const all = await listAllSessions(home);
  const match = all.find((s) => s.id === id);
  if (!match) {
    throw new Error(`session not found: ${id}`);
  }
  yield* traceToolCalls(match.path, filter ?? {});
}

// ─── Doctor ────────────────────────────────────────────────

async function runDoctor(home?: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // Node version
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    ok: nodeMajor >= 20,
    message: `Node ${process.versions.node}`,
    ...(nodeMajor < 20 ? { hint: "Upgrade to Node 20+" } : {}),
  });

  // pi on PATH
  const piOk = await isPiInstalled();
  checks.push({
    ok: piOk,
    message: piOk ? "pi on PATH" : "pi NOT found",
    ...(piOk
      ? {}
      : { hint: "Install: npm install -g @earendil-works/pi-coding-agent" }),
  });

  // fd (optional)
  let fdOk = false;
  try {
    // We only care whether the binary exists; ignore its output.
    await execFileAsync("fd", ["--version"], { stdio: "ignore" } as never);
    fdOk = true;
  } catch {
    fdOk = false;
  }
  checks.push({
    ok: fdOk,
    message: fdOk ? "fd installed (recommended)" : "fd not found",
    ...(fdOk
      ? {}
      : { hint: "Optional: brew install fd — speeds up file search" }),
  });

  // ~/.pi/agent exists
  const dirOk = await pathExists(piAgentDir(home));
  checks.push({
    ok: dirOk,
    message: dirOk ? "~/.pi/agent exists" : "~/.pi/agent missing",
    ...(dirOk ? {} : { hint: "Run `pi` once to initialize the directory" }),
  });

  // settings.json
  const settings = await readSettings(home);
  const settingsExists = await pathExists(piSettingsFile(home));
  if (settingsExists) {
    checks.push({
      ok: settings !== null,
      message:
        settings !== null ? "settings.json valid" : "settings.json malformed",
      ...(settings !== null
        ? {}
        : { hint: "Run `pilot doctor` to see parse details" }),
    });
  } else {
    checks.push({ ok: true, message: "settings.json not yet created" });
  }

  // Pack conflicts
  const sources = listSources(settings);
  if (sources.length >= 2) {
    const subagent = sources.filter((s) => /subagent|crew|orchestr/i.test(s));
    if (subagent.length >= 2) {
      checks.push({
        ok: false,
        message: `${subagent.length} subagent packs installed (likely conflict)`,
        hint: "Keep only one: pilot pack uninstall <others>",
      });
    }
  }

  // Sessions dir size
  const sessionsDir = piSessionsDir(home);
  if (await pathExists(sessionsDir)) {
    const total = await dirSize(sessionsDir);
    const mb = total / (1024 * 1024);
    checks.push({
      ok: mb < 500,
      message: `sessions: ${mb.toFixed(1)} MB total`,
      ...(mb >= 500
        ? { hint: "Consider: pilot session gc --older-than 30d (v0.2)" }
        : {}),
    });
  }

  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0, failed, checks };
}

/** Recursive size of a directory in bytes. Bounded by depth for safety. */
async function dirSize(p: string, depth = 0): Promise<number> {
  if (depth > 6) return 0;
  let entries;
  try {
    entries = await readdir(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    const full = join(p, e.name);
    if (e.isDirectory()) {
      total += await dirSize(full, depth + 1);
    } else if (e.isFile()) {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // skip
      }
    }
  }
  return total;
}

/**
 * Check if a path exists. Resolves true/false; never throws.
 * Replaces existsSync (which is sync and not promisified).
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ─── Compose listing (v0.4.4) ──────────────────────────────

async function listComposeEntitiesFromService(
  home?: string,
): Promise<import("./compose-listing.js").ComposeCatalog> {
  const { listComposeEntities } = await import("./compose-listing.js");
  return listComposeEntities({
    listSessions: () => listSessions(undefined, home),
    listPacks: () => listPacks(home),
    listProfiles: () => listProfiles(home),
    listPolicies: () => listPoliciesFromHome(home),
    listCapabilities: () => listCapabilities(home),
  });
}

// ─── Policy (v0.4.3) ───────────────────────────────────────

async function listPoliciesFromHome(
  home?: string,
): Promise<import("./policy.js").ToolPolicy[]> {
  await ensurePoliciesDir(home);
  return listPoliciesFromFs(home);
}

async function writePolicyWithHome(
  name: string,
  input: ToolPolicyInput,
  home?: string,
): Promise<import("./policy.js").ToolPolicy> {
  await ensurePoliciesDir(home);
  return writePolicyToHome(name, input, home);
}

async function deletePolicyByName(
  name: string,
  home?: string,
): Promise<boolean> {
  return deletePolicyFromHome(name, home);
}

async function applyPolicyByName(
  name: string,
  home?: string,
): Promise<{ path: string }> {
  const policy = await readPolicyFromHome(name, home);
  await ensurePoliciesDir(home);
  const file = policyExtensionPath(name, home);
  const source = generatePolicyExtension(policy);
  await writeFile(file, source, "utf-8");
  return { path: file };
}

async function unapplyPolicyByName(
  name: string,
  home?: string,
): Promise<{ removed: boolean }> {
  const file = policyExtensionPath(name, home);
  try {
    await statFile(file);
  } catch {
    return { removed: false };
  }
  await unlinkFile(file);
  return { removed: true };
}

async function checkPolicyCallByName(
  name: string,
  call: ToolCallInfo,
  home?: string,
): Promise<{
  policy: import("./policy.js").ToolPolicy;
  decision: PolicyDecision;
}> {
  const policy = await readPolicyFromHome(name, home);
  return { policy, decision: checkPolicyInEngine(call, policy) };
}

// ─── Plans (v0.6.0 — Agent capability layer) ───────────────

async function listPlansFromHome(home?: string): Promise<Plan[]> {
  const { listPlans, ensurePlanDirs } = await import("./plan.js");
  await ensurePlanDirs(home);
  return listPlans(home);
}

async function readPlanFromHome(
  id: string,
  home?: string,
): Promise<Plan | null> {
  const { readPlan } = await import("./plan.js");
  return readPlan(id, home);
}

async function createPlanInHome(
  input: Partial<Plan> & { goal: string },
  home?: string,
): Promise<Plan> {
  const {
    generatePlanId,
    deriveTitle,
    writePlan,
    ensurePlanDirs,
    appendPlanEvent,
  } = await import("./plan.js");
  await ensurePlanDirs(home);
  const id = generatePlanId();
  const plan = await writePlan(
    id,
    {
      ...input,
      title: input.title ?? deriveTitle(input.goal),
    },
    home,
  );
  await appendPlanEvent(
    {
      timestamp: new Date().toISOString(),
      planId: id,
      type: "plan_created",
      data: { goal: input.goal, strategy: plan.strategy },
    },
    home,
  );
  return plan;
}

async function updatePlanInHome(
  id: string,
  input: Partial<Plan>,
  home?: string,
): Promise<Plan> {
  const { writePlan, readPlan } = await import("./plan.js");
  const existing = await readPlan(id, home);
  if (!existing) throw new Error(`Plan not found: ${id}`);
  return writePlan(id, input, home);
}

async function deletePlanFromHome(id: string, home?: string): Promise<boolean> {
  const { deletePlan } = await import("./plan.js");
  return deletePlan(id, home);
}

async function startPlanInHome(id: string, home?: string): Promise<Plan> {
  const { writePlan, readPlan, appendPlanEvent } = await import("./plan.js");
  const plan = await readPlan(id, home);
  if (!plan) throw new Error(`Plan not found: ${id}`);
  if (plan.status === "running")
    throw new Error(`Plan is already running: ${id}`);
  if (plan.status === "completed")
    throw new Error(`Plan is already completed: ${id}`);
  const now = new Date().toISOString();
  const updated = await writePlan(
    id,
    { status: "running", startedAt: plan.startedAt ?? now },
    home,
  );
  await appendPlanEvent(
    { timestamp: now, planId: id, type: "plan_started", data: {} },
    home,
  );
  return updated;
}

async function pausePlanInHome(id: string, home?: string): Promise<Plan> {
  const { writePlan, readPlan, appendPlanEvent } = await import("./plan.js");
  const plan = await readPlan(id, home);
  if (!plan) throw new Error(`Plan not found: ${id}`);
  if (plan.status !== "running")
    throw new Error(`Plan is not running (current: ${plan.status}): ${id}`);
  const updated = await writePlan(id, { status: "paused" }, home);
  await appendPlanEvent(
    {
      timestamp: new Date().toISOString(),
      planId: id,
      type: "plan_paused",
      data: {},
    },
    home,
  );
  return updated;
}

async function resumePlanInHome(id: string, home?: string): Promise<Plan> {
  const { writePlan, readPlan, appendPlanEvent } = await import("./plan.js");
  const plan = await readPlan(id, home);
  if (!plan) throw new Error(`Plan not found: ${id}`);
  if (plan.status !== "paused")
    throw new Error(`Plan is not paused (current: ${plan.status}): ${id}`);
  const updated = await writePlan(id, { status: "running" }, home);
  await appendPlanEvent(
    {
      timestamp: new Date().toISOString(),
      planId: id,
      type: "plan_resumed",
      data: {},
    },
    home,
  );
  return updated;
}

async function cancelPlanInHome(id: string, home?: string): Promise<Plan> {
  const { writePlan, readPlan, appendPlanEvent } = await import("./plan.js");
  const plan = await readPlan(id, home);
  if (!plan) throw new Error(`Plan not found: ${id}`);
  if (plan.status !== "running" && plan.status !== "paused")
    throw new Error(
      `Plan cannot be cancelled (current: ${plan.status}): ${id}`,
    );
  const now = new Date().toISOString();
  const updated = await writePlan(
    id,
    { status: "cancelled", completedAt: now },
    home,
  );
  await appendPlanEvent(
    { timestamp: now, planId: id, type: "plan_cancelled", data: {} },
    home,
  );
  return updated;
}

async function updateTaskInHome(
  planId: string,
  taskId: string,
  updates: Partial<Task>,
  home?: string,
): Promise<Plan> {
  const { readPlan, writePlan } = await import("./plan.js");
  const plan = await readPlan(planId, home);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  const taskIdx = plan.tasks.findIndex((t) => t.id === taskId);
  if (taskIdx === -1) throw new Error(`Task not found: ${taskId}`);
  const existingTask = plan.tasks[taskIdx]!;
  plan.tasks[taskIdx] = { ...existingTask, ...updates };
  return writePlan(planId, plan, home);
}

async function updateStepInHome(
  planId: string,
  taskId: string,
  stepId: string,
  updates: Partial<Step>,
  home?: string,
): Promise<Plan> {
  const { readPlan, writePlan } = await import("./plan.js");
  const plan = await readPlan(planId, home);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const stepIdx = task.steps.findIndex((s) => s.id === stepId);
  if (stepIdx === -1) throw new Error(`Step not found: ${stepId}`);
  const existingStep = task.steps[stepIdx]!;
  task.steps[stepIdx] = { ...existingStep, ...updates };
  return writePlan(planId, plan, home);
}

async function suggestToolsFromHome(
  goal: string,
  home?: string,
): Promise<ToolSuggestion> {
  const { suggestTools } = await import("./plan.js");
  const [tools, profiles] = await Promise.all([
    listToolInventory(home),
    listProfiles(home),
  ]);
  const toolItems = tools.map((t) => ({
    name: t.name,
    source: t.source,
    safety: t.safety,
    description: t.description,
  }));
  const profileItems = profiles.map((p) => ({
    name: p.name,
    ...(p.model ? { model: p.model } : {}),
    ...(p.packages ? { packages: p.packages } : {}),
  }));
  return suggestTools(goal, toolItems, profileItems);
}
