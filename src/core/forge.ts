/**
 * core/forge.ts — shared Forge operations for both CLI and Web.
 *
 * Previously the absorb + inspect logic lived inside
 * `src/commands/forge.ts` (CLI only). v0.4.14 lifts them into core so
 * the Web UI can call them through `PilotService` instead of shelling
 * out to the CLI.
 *
 * Surface:
 *   - `forgeInspect(name)` — fetch pack summary + manifest. Returns
 *     null when the package isn't on npm.
 *   - `forgeAbsorb(name, asId?)` — build a Capability from the pack
 *     manifest + write to `~/.pilot/capabilities/<id>/capability.json`.
 *     Throws on schema validation failure or invalid id.
 *   - `deriveCapabilityId(pack)` — strip npm scope, lowercase.
 *   - `mapKindToType(kind)` — pack kind → Capability type.
 *
 * See docs/forge-and-avatars.md for the L1/L2/L3 mode taxonomy.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readPackManifest, type PackManifest } from "./pack-manifest.js";
import { getPack, searchPacks as searchPacksNpm } from "./npm-registry.js";
import { CapabilitySchema, type Capability } from "./capability.js";
import { ensurePilotCapabilitiesDir, pilotCapabilitiesDir } from "./types.js";
import type { Pack } from "./types.js";

export interface ForgeInspectResult {
  pack: Pack;
  manifest: PackManifest;
}

/**
 * Fetch the pack summary + manifest for inspection.
 *
 * Reads the manifest via the npm-registry helper (cached); if the
 * package has no `pi` field, `manifest.pi` will be undefined and
 * absorb would create an L1-referenced-only capability.
 *
 * Returns null when the package isn't on npm (404 from registry).
 * Throws on network failure or registry errors.
 */
export async function forgeInspect(
  name: string,
): Promise<ForgeInspectResult | null> {
  const pack = await getPack(name);
  if (!pack) return null;
  const manifest = await readPackManifest(name);
  if (!manifest) return null;
  return { pack, manifest };
}

export interface ForgeAbsorbResult {
  /** Capability id actually written to disk. */
  id: string;
  /** Path to the written capability.json. */
  path: string;
  /** The capability object (matches CapabilitySchema). */
  capability: Capability;
}

export class ForgeAbsorbError extends Error {
  constructor(
    public readonly code:
      | "not-found"
      | "invalid-id"
      | "schema-validation"
      | "io",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ForgeAbsorbError";
  }
}

/**
 * Build a Capability from a pack manifest and persist to
 * `~/.pilot/capabilities/<id>/capability.json`.
 *
 * @param name   npm package name (with or without scope)
 * @param asId   optional override for the capability id; if missing,
 *               derived from the package name (strip scope, lowercase).
 * @param home   Pilot home (defaults to `process.env.HOME`).
 */
export async function forgeAbsorb(
  name: string,
  asId?: string,
  home?: string,
): Promise<ForgeAbsorbResult> {
  const manifest = await readPackManifest(name);
  if (!manifest) {
    throw new ForgeAbsorbError(
      "not-found",
      `Package not found or no manifest: ${name}`,
    );
  }

  const id = asId ?? deriveCapabilityId(manifest);
  if (!isValidCapabilityId(id)) {
    throw new ForgeAbsorbError(
      "invalid-id",
      `Derived capability id "${id}" is invalid. Use kebab-case, or pass --as <id>.`,
    );
  }

  const cap = buildCapability(id, manifest);
  const validation = CapabilitySchema.safeParse(cap);
  if (!validation.success) {
    throw new ForgeAbsorbError(
      "schema-validation",
      `Built capability failed schema validation: ${validation.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  const capDir = join(pilotCapabilitiesDir(home), id);
  const capFile = join(capDir, "capability.json");
  try {
    // v0.6.15: lazy-init the capabilities directory. The first
    // write to ~/.pilot/capabilities/ used to require that the
    // user had run `pilot init` first (init.ts is the only place
    // that mkdir'd the directory). Users on macOS sandboxed
    // shells who skipped init hit EPERM here. The helper is
    // idempotent — a no-op when the directory already exists,
    // so the hot-path cost is one mkdir syscall.
    await ensurePilotCapabilitiesDir(home);
    await mkdir(capDir, { recursive: true });
    await writeFile(
      capFile,
      JSON.stringify(validation.data, null, 2) + "\n",
      "utf-8",
    );
  } catch (e) {
    // v0.6.15: distinguish EPERM/EACCES (shell can't write to
    // ~/.pilot/ — usually a sandboxed Terminal.app / Cursor /
    // VSCode devcontainer) from generic IO failures. Surface a
    // actionable hint: try `pilot init` from a non-sandboxed
    // shell, or open the Terminal directly.
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EPERM" || err.code === "EACCES") {
      throw new ForgeAbsorbError(
        "io",
        `Cannot write ${capFile}: ${err.message} (${err.code}). ` +
          `Your shell is sandboxed or otherwise blocked from writing to ` +
          `~/.pilot/. Run \`pilot init\` from a non-sandboxed Terminal, ` +
          `or check that ${pilotCapabilitiesDir(home)} is accessible.`,
        e,
      );
    }
    throw new ForgeAbsorbError(
      "io",
      `Failed to write ${capFile}: ${err.message}`,
      e,
    );
  }

  return { id, path: capFile, capability: validation.data };
}

/**
 * Build a Capability object from a pack manifest.
 *
 * Maps the pack's `pi.kind` (extension/skill/theme/prompt) onto the
 * Capability type taxonomy (workflow/tool/integration/safety). Defaults
 * to "integration" when the kind is unset.
 */
export function buildCapability(id: string, pack: PackManifest): Capability {
  const p = pack.pi ?? {};
  const mode = p.extension !== undefined ? "L2-wrapped" : "L1-referenced";
  const now = new Date().toISOString();
  return {
    id,
    title: pack.name,
    type: mapKindToType(p.kind),
    description:
      pack.description ?? `Absorbed from ${pack.name}@${pack.version}`,
    sources: [
      {
        type: "npm",
        ref: `npm:${pack.name}@${pack.version}`,
        mode,
      },
    ],
    artifacts: {},
    compatibility: {
      conflicts: [],
      requires: [],
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** Map a pack's `pi.kind` onto the Capability `type` enum. */
export function mapKindToType(kind: string | undefined): Capability["type"] {
  // Pack kinds: extension, skill, theme, prompt
  // Capability types: workflow, tool, integration, safety
  switch (kind) {
    case "skill":
      return "tool";
    case "prompt":
      return "workflow";
    case "theme":
      return "integration";
    case "extension":
    default:
      return "integration";
  }
}

/** Strip npm scope and lowercase, e.g. `@wwppee/foo` → `foo`. */
export function deriveCapabilityId(pack: PackManifest): string {
  return pack.name.replace(/^@[^/]+\//, "").toLowerCase();
}

export function isValidCapabilityId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

/**
 * Search npm for forge-able packages. Thin wrapper around
 * `searchPacksNpm` (kept here so callers don't have to import from
 * `npm-registry.js` directly).
 */
export async function forgeSearch(query: string): Promise<Pack[]> {
  return searchPacksNpm({ query, size: 15 });
}
