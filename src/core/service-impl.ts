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
  appendPlanEvent,
  listPlanEvents,
  // P1#8: Plan functions imported statically (was dynamic) to match
  // the project's "all imports static" style. Lazy-import was a v0.5.7
  // v0.5.7-beta code smell — no circular-dep reason to keep it.
  deletePlan as deletePlanCore,
  deriveTitle,
  ensurePlanDirs,
  generatePlanId,
  listPlans as listPlansCore,
  PlanError,
  PlanErrors,
  readPlan as readPlanCore,
  writePlan as writePlanCore,
} from "./plan.js";
import { suggestTools as suggestToolsCore } from "./plan.js";
import {
  getDefaultRegistry,
  type PlanExecutorService,
} from "./plan-executor.js";
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
import type { Plan, Task, Step, ToolSuggestion, PlanEvent } from "./plan.js";

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
    activateProfile: (name) => activateProfileByName(name, home),
    getActiveProfile: () => readActiveProfile(home),
    clearActiveProfile: () => clearActiveProfile(home),

    getStats: (range) => aggregateStats(range, home),
    getUsage: (range) => aggregateUsage(range, home),

    listTools: () => listToolInventory(home),
    discoverProjectContext: (cwd) => discoverProjectContext(cwd, home),

    listComposeEntities: () => listComposeEntitiesFromService(home),
    getComposeEntityDetail: (kind, id) =>
      getComposeEntityDetailFromService(home, kind, id),

    listComposeBoards: () => listComposeBoardsFromService(home),
    getComposeBoard: (id) => getComposeBoardFromService(home, id),
    saveComposeBoard: (input) => saveComposeBoardFromService(home, input),
    deleteComposeBoard: (id) => deleteComposeBoardFromService(home, id),
    renameComposeBoard: (id, name) =>
      renameComposeBoardFromService(home, id, name),

    // v0.7.0: workflows. Same pattern as compose-boards.
    listWorkflows: () => listWorkflowsFromService(home),
    getWorkflow: (id) => getWorkflowFromService(home, id),
    saveWorkflow: (input) => saveWorkflowFromService(home, input),
    deleteWorkflow: (id) => deleteWorkflowFromService(home, id),

    listPolicies: () => listPoliciesFromHome(home),
    getPolicy: (name) => tryReadPolicy(name, home),
    setPolicy: (name, input) => writePolicyWithHome(name, input, home),
    deletePolicy: (name) => deletePolicyByName(name, home),
    applyPolicy: (name) => applyPolicyByName(name, home),
    unapplyPolicy: (name) => unapplyPolicyByName(name, home),
    // v0.9.0 (A2 — tool wrapper): same CRUD + apply
    // surface as policy, but operating on the
    // wrapper store. The apply step generates a
    // no-op stub extension today (the real pi-side
    // hook is a v0.9.x release); the schema + REST
    // contract are what v0.9.0 ships.
    listWrappers: async () => {
      const { listWrappers } = await import("./tool-wrapper.js");
      return listWrappers(home);
    },
    getWrapper: async (name) => {
      const { tryReadWrapper } = await import("./tool-wrapper.js");
      return tryReadWrapper(name, home);
    },
    setWrapper: async (name, input) => {
      const { writeWrapper } = await import("./tool-wrapper.js");
      return writeWrapper(name, input, home);
    },
    deleteWrapper: async (name) => {
      const { deleteWrapper } = await import("./tool-wrapper.js");
      return deleteWrapper(name, home);
    },
    applyWrapper: async (name) => {
      const { applyWrapper } = await import("./tool-wrapper.js");
      return applyWrapper(name, home);
    },
    unapplyWrapper: async (name) => {
      const { unapplyWrapper } = await import("./tool-wrapper.js");
      return unapplyWrapper(name, home);
    },
    checkPolicyCall: (name, call) => checkPolicyCallByName(name, call, home),
    // v0.7.3 (B2): observability accessors. The service is the
    // single thing the dashboard talks to for these — the web
    // layer never imports `core/observability.js` directly.
    // v0.8.2: optional `since` argument so the chat
    // endpoint can answer time-windowed questions
    // ("最近 24h") without the caller having to know
    // about observability internals.
    getObservabilitySummary: async (since?: string) => {
      const { summarizeRecordedToolCalls } = await import("./observability.js");
      return summarizeRecordedToolCalls(home, since);
    },
    getToolCalls: async (filter) => {
      const { collectRecordedToolCalls } = await import("./observability.js");
      return collectRecordedToolCalls(home, filter);
    },
    // v0.8.7: public write side. The implementation
    // is a thin pass-through to `core/observability.js`,
    // which already swallows its own errors. The
    // service surface is the only place the server
    // (and any future in-process tool caller) should
    // record — never reach for `core/observability.js`
    // directly, because that would skip the home-dir
    // indirection the service owns.
    recordToolCall: async (event) => {
      const { recordToolCall: record } = await import("./observability.js");
      await record(event, home);
    },

    // ─── Plans (v0.6.0 — Agent capability layer) ────
    listPlans: () => listPlansFromHome(home),
    getPlanEvents: (id) => getPlanEventsFromHome(id, home),
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
    retryTask: (planId, taskId) => retryTaskInHome(planId, taskId, home),
    skipTask: (planId, taskId) => skipTaskInHome(planId, taskId, home),
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

/**
 * v0.6.5: per-entity full detail. Shares the same data-source
 * wiring as `listComposeEntitiesFromService` so the two paths
 * stay in sync (e.g. same session filter / same list of packs).
 */
async function getComposeEntityDetailFromService(
  home: string | undefined,
  kind: import("./compose-listing.js").ComposeEntityKind,
  id: string,
): Promise<import("./compose-listing.js").ComposeEntityDetail | null> {
  const { getComposeEntityDetail } = await import("./compose-listing.js");
  return getComposeEntityDetail(
    {
      listSessions: () => listSessions(undefined, home),
      listPacks: () => listPacks(home),
      listProfiles: () => listProfiles(home),
      listPolicies: () => listPoliciesFromHome(home),
      listCapabilities: () => listCapabilities(home),
    },
    kind,
    id,
  );
}

// ─── Compose boards (v0.6.10) ──────────────────────────────

/**
 * Thin wrappers over `core/compose-boards.ts` so the service
 * layer can lazy-import the module (avoids pulling fs/zod into
 * callers that only need read-only compose listing). Same pattern
 * as the other compose*FromService helpers.
 */
async function listComposeBoardsFromService(
  home?: string,
): Promise<import("./compose-boards.js").BoardSummary[]> {
  const { listBoards } = await import("./compose-boards.js");
  return listBoards(home);
}

async function getComposeBoardFromService(
  home: string | undefined,
  id: string,
): Promise<import("./compose-boards.js").BoardSnapshot | null> {
  const { loadBoard } = await import("./compose-boards.js");
  return loadBoard(id, home);
}

async function saveComposeBoardFromService(
  home: string | undefined,
  input: import("./compose-boards.js").BoardInput,
): Promise<import("./compose-boards.js").BoardSnapshot> {
  const { saveBoard } = await import("./compose-boards.js");
  return saveBoard(input, home);
}

async function deleteComposeBoardFromService(
  home: string | undefined,
  id: string,
): Promise<boolean> {
  const { deleteBoard } = await import("./compose-boards.js");
  return deleteBoard(id, home);
}

// ─── Workflows (v0.7.0) ──────────────────────────────────

/**
 * v0.7.0: thin wrappers over `core/workflow.ts`, same
 * pattern as the compose-boards helpers above. Lazy-import
 * keeps fs/zod out of callers that don't need workflow I/O.
 */
async function listWorkflowsFromService(
  home?: string,
): Promise<import("./workflow.js").WorkflowSummary[]> {
  const { listWorkflows } = await import("./workflow.js");
  return listWorkflows(home);
}

async function getWorkflowFromService(
  home: string | undefined,
  id: string,
): Promise<import("./workflow.js").Workflow | null> {
  const { loadWorkflow } = await import("./workflow.js");
  return loadWorkflow(id, home);
}

async function saveWorkflowFromService(
  home: string | undefined,
  input: import("./workflow.js").WorkflowInput,
): Promise<import("./workflow.js").Workflow> {
  const { saveWorkflow } = await import("./workflow.js");
  return saveWorkflow(input, home);
}

async function deleteWorkflowFromService(
  home: string | undefined,
  id: string,
): Promise<boolean> {
  const { deleteWorkflow } = await import("./workflow.js");
  return deleteWorkflow(id, home);
}

// v0.6.12: dedicated /compose/boards list page needs a way to
// rename a board without resending the full state. We expose
// the same atomic write path that `saveBoard` uses — rename is
// load + mutate name + saveBoard under the hood.
async function renameComposeBoardFromService(
  home: string | undefined,
  id: string,
  name: string,
): Promise<import("./compose-boards.js").BoardSnapshot | null> {
  const { renameBoard } = await import("./compose-boards.js");
  return renameBoard(id, name, home);
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

async function activateProfileByName(
  name: string,
  home?: string,
): Promise<import("./profile-state.js").ActiveProfileState> {
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
}

/**
 * v0.5.23: build a PlanExecutorService adapter scoped to a
 * specific home directory. The PlanExecutor only needs
 * `activateProfile` and `applyPolicy` — the same operations
 * the public service exposes. We don't pass the full service
 * because the executor shouldn't be able to call unrelated
 * methods (capability / pack / etc.) and we want a stable
 * interface for testing.
 */
export function buildExecutorServiceForHome(home: string): PlanExecutorService {
  return {
    activateProfile: (name) => activateProfileByName(name, home),
    applyPolicy: (name) => applyPolicyByName(name, home),
    installPack: (source) => installPack(source),
  };
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
  const decision = checkPolicyInEngine(call, policy);
  // v0.7.3 (B2): when the policy engine blocks a call, record
  // the outcome so the dashboard can show the user which rules
  // fire most often. We record only `denied` here — `success`
  // and `fail` come from the pi session's ToolResultMessage
  // stream and will be wired in v0.7.4+. Recording is
  // best-effort: a failed append must not turn into a 5xx on
  // the policy check itself (recordToolCall already swallows).
  if (decision.block) {
    const { recordToolCall } = await import("./observability.js");
    void recordToolCall(
      {
        tool: call.name,
        outcome: "denied",
        reason: decision.rule ?? "policy",
        errorSample: decision.reason ?? "",
        context: { timestamp: new Date().toISOString() },
      },
      home,
    );
  }
  return { policy, decision };
}

// ─── Plans (v0.6.0 — Agent capability layer) ───────────────

async function listPlansFromHome(home?: string): Promise<Plan[]> {
  await ensurePlanDirs(home);
  return listPlansCore(home);
}

/**
 * v0.5.13+: read execution history for a plan.
 *
 * Returns null if the plan itself doesn't exist (404 from the
 * server's perspective). Returns [] if the plan exists but has no
 * events yet (never started). The server should NOT 404 an empty
 * history — that's a valid state.
 */
async function getPlanEventsFromHome(
  id: string,
  home?: string,
): Promise<PlanEvent[] | null> {
  const plan = await readPlanCore(id, home);
  if (!plan) return null;
  return listPlanEvents(id, home);
}

async function readPlanFromHome(
  id: string,
  home?: string,
): Promise<Plan | null> {
  return readPlanCore(id, home);
}

async function createPlanInHome(
  input: Partial<Plan> & { goal: string },
  home?: string,
): Promise<Plan> {
  await ensurePlanDirs(home);
  const id = generatePlanId();
  const plan = await writePlanCore(
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
  const existing = await readPlanCore(id, home);
  if (!existing) throw PlanErrors.notFound(id);

  // Status / lifecycle state are server-controlled. Only the dedicated
  // /plans/:id/{start,pause,resume,cancel} endpoints can mutate them.
  // This prevents clients from doing PUT {status: "completed"} to skip
  // the state machine. P0#1 from v0.5.7 review.
  const sanitized: Partial<Plan> = { ...input };
  delete (sanitized as Record<string, unknown>).id;
  delete sanitized.status;
  delete sanitized.startedAt;
  delete sanitized.completedAt;
  delete sanitized.result;
  delete sanitized.createdAt;
  delete sanitized.updatedAt;

  return writePlanCore(id, sanitized, home);
}

async function deletePlanFromHome(id: string, home?: string): Promise<boolean> {
  const deleted = await deletePlanCore(id, home);
  if (deleted) {
    await appendPlanEvent(
      {
        timestamp: new Date().toISOString(),
        planId: id,
        type: "plan_deleted",
        data: {},
      },
      home,
    );
  }
  return deleted;
}

async function startPlanInHome(id: string, home?: string): Promise<Plan> {
  const plan = await readPlanCore(id, home);
  if (!plan) throw PlanErrors.notFound(id);
  if (plan.status === "running") throw PlanErrors.alreadyRunning(id);
  if (plan.status === "completed") throw PlanErrors.alreadyCompleted(id);
  const now = new Date().toISOString();
  const updated = await writePlanCore(
    id,
    { status: "running", startedAt: plan.startedAt ?? now },
    home,
  );
  await appendPlanEvent(
    { timestamp: now, planId: id, type: "plan_started", data: {} },
    home,
  );
  // v0.5.23: hand off to the executor. It's fire-and-forget —
  // the run() promise resolves when the plan completes, pauses,
  // fails, or is cancelled. The registry keeps the live instance
  // so pause / resume / cancel can find it.
  if (home !== undefined) {
    getDefaultRegistry().start(id, buildExecutorServiceForHome(home), home);
  }
  return updated;
}

async function pausePlanInHome(id: string, home?: string): Promise<Plan> {
  const plan = await readPlanCore(id, home);
  if (!plan) throw PlanErrors.notFound(id);
  if (plan.status !== "running") throw PlanErrors.notRunning(id, plan.status);
  // v0.5.23: ask the live executor to pause. The loop honors it
  // at the next step boundary and writes status=paused on exit.
  // We still flip the plan TOML to "paused" immediately so the
  // UI reflects the user's intent without waiting for the
  // in-flight step to finish.
  getDefaultRegistry().pause(id);
  const updated = await writePlanCore(id, { status: "paused" }, home);
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
  const plan = await readPlanCore(id, home);
  if (!plan) throw PlanErrors.notFound(id);
  if (plan.status !== "paused") throw PlanErrors.notPaused(id, plan.status);
  const updated = await writePlanCore(id, { status: "running" }, home);
  await appendPlanEvent(
    {
      timestamp: new Date().toISOString(),
      planId: id,
      type: "plan_resumed",
      data: {},
    },
    home,
  );
  // v0.5.23: tell the live executor to resume. If the executor
  // finished and was cleaned up (shouldn't happen if status is
  // still paused, but defensive), we start a new one — the
  // runtime snapshot will guide it to the right checkpoint.
  const live = getDefaultRegistry().get(id);
  if (live && !live.isDone() && live.isPaused()) {
    live.resume();
  } else if (home !== undefined) {
    getDefaultRegistry().start(id, buildExecutorServiceForHome(home), home);
  }
  return updated;
}

async function cancelPlanInHome(id: string, home?: string): Promise<Plan> {
  const plan = await readPlanCore(id, home);
  if (!plan) throw PlanErrors.notFound(id);
  if (plan.status !== "running" && plan.status !== "paused")
    throw PlanErrors.cannotCancel(id, plan.status);
  // v0.5.23: ask the live executor to cancel. The loop notices
  // at the next step boundary and writes status=cancelled.
  getDefaultRegistry().cancel(id);
  const now = new Date().toISOString();
  const updated = await writePlanCore(
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
  const plan = await readPlanCore(planId, home);
  if (!plan) throw PlanErrors.notFound(planId);
  const taskIdx = plan.tasks.findIndex((t) => t.id === taskId);
  if (taskIdx === -1) throw new PlanError(`Task not found: ${taskId}`, 404);
  const existingTask = plan.tasks[taskIdx]!;
  plan.tasks[taskIdx] = { ...existingTask, ...updates };
  return writePlanCore(planId, plan, home);
}

async function updateStepInHome(
  planId: string,
  taskId: string,
  stepId: string,
  updates: Partial<Step>,
  home?: string,
): Promise<Plan> {
  const plan = await readPlanCore(planId, home);
  if (!plan) throw PlanErrors.notFound(planId);
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) throw new PlanError(`Task not found: ${taskId}`, 404);
  const stepIdx = task.steps.findIndex((s) => s.id === stepId);
  if (stepIdx === -1) throw new PlanError(`Step not found: ${stepId}`, 404);
  const existingStep = task.steps[stepIdx]!;
  task.steps[stepIdx] = { ...existingStep, ...updates };
  return writePlanCore(planId, plan, home);
}

async function suggestToolsFromHome(
  goal: string,
  home?: string,
): Promise<ToolSuggestion> {
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
  return suggestToolsCore(goal, toolItems, profileItems);
}

// ─── v0.6.0: retry / skip task endpoints ───────────────────

/**
 * Retry a failed task: reset the task + all its steps to
 * `pending`, remove its step ids from the runtime snapshot's
 * `completedStepIds`, transition the plan back to `running` if
 * it was `failed`, and re-start the executor if needed.
 *
 * Allowed states: plan in {running, paused, failed}. The task
 * itself may be in any non-`running` state.
 */
async function retryTaskInHome(
  planId: string,
  taskId: string,
  home?: string,
): Promise<Plan> {
  const plan = await readPlanCore(planId, home);
  if (!plan) throw PlanErrors.notFound(planId);
  if (!["running", "paused", "failed"].includes(plan.status)) {
    throw new PlanError(
      `Plan cannot be retried from status ${plan.status}: ${planId}`,
      409,
    );
  }
  const taskIdx = plan.tasks.findIndex((t) => t.id === taskId);
  if (taskIdx === -1) throw new PlanError(`Task not found: ${taskId}`, 404);
  const task = plan.tasks[taskIdx]!;
  if (task.status === "running") {
    throw new PlanError(
      `Cannot retry a running task: ${taskId} (let it finish or cancel)`,
      409,
    );
  }

  // Reset task + steps.
  plan.tasks[taskIdx] = {
    ...task,
    status: "pending",
    startedAt: undefined,
    completedAt: undefined,
    result: undefined,
    steps: task.steps.map((s) => ({
      ...s,
      status: "pending",
      startedAt: undefined,
      completedAt: undefined,
      output: undefined,
    })),
  };

  // If plan was failed, bring it back to running.
  const wasFailed = plan.status === "failed";
  if (wasFailed) {
    plan.status = "running";
  }

  const updated = await writePlanCore(planId, plan, home);

  // Drop the task's step ids from the snapshot so the next
  // executor run re-runs them.
  const { readRuntimeSnapshot, writeRuntimeSnapshot } =
    await import("./plan.js");
  const snap = await readRuntimeSnapshot(planId, home);
  if (snap) {
    const stepIds = new Set(task.steps.map((s) => s.id));
    snap.completedStepIds = snap.completedStepIds.filter(
      (id) => !stepIds.has(id),
    );
    snap.completedTaskIds = snap.completedTaskIds.filter((id) => id !== taskId);
    await writeRuntimeSnapshot(snap, home);
  }

  // Emit a `task_started`-ish event so the timeline shows
  // the retry. (No `plan_resumed` — the plan was either still
  // running, paused (no change), or was brought back from
  // failed.)
  await appendPlanEvent(
    {
      timestamp: new Date().toISOString(),
      planId,
      type: "task_started",
      data: { taskId, retried: true, wasFailed },
    },
    home,
  );

  // If the executor is no longer running for this plan, start
  // a new one. (The pause / running case is handled by the
  // live executor if it exists.)
  const registry = getDefaultRegistry();
  const live = registry.get(planId);
  if (!live || live.isDone()) {
    if (home !== undefined) {
      registry.start(planId, buildExecutorServiceForHome(home), home);
    }
  }
  return updated;
}

/**
 * Skip a task: mark the task as `skipped`, emit a
 * `task_skipped` event. The executor notices on the next
 * step boundary that the task is skipped and moves on. If
 * the resulting plan state has no further work, the executor
 * finalizes the plan as `completed` (or `failed` if any
 * sibling task is failed).
 *
 * Allowed states: plan in {running, paused}, task not in {running}.
 */
async function skipTaskInHome(
  planId: string,
  taskId: string,
  home?: string,
): Promise<Plan> {
  const plan = await readPlanCore(planId, home);
  if (!plan) throw PlanErrors.notFound(planId);
  if (plan.status !== "running" && plan.status !== "paused") {
    throw new PlanError(
      `Plan cannot skip task from status ${plan.status}: ${planId}`,
      409,
    );
  }
  const taskIdx = plan.tasks.findIndex((t) => t.id === taskId);
  if (taskIdx === -1) throw new PlanError(`Task not found: ${taskId}`, 404);
  const task = plan.tasks[taskIdx]!;
  if (task.status === "running") {
    throw new PlanError(
      `Cannot skip a running task: ${taskId} (let it finish or cancel)`,
      409,
    );
  }

  plan.tasks[taskIdx] = {
    ...task,
    status: "skipped",
    completedAt: new Date().toISOString(),
  };
  const updated = await writePlanCore(planId, plan, home);
  await appendPlanEvent(
    {
      timestamp: new Date().toISOString(),
      planId,
      type: "task_skipped",
      data: { taskId, reason: "user skipped" },
    },
    home,
  );
  return updated;
}
