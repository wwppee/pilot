/**
 * v1.0.4: per-tool enable/disable state.
 *
 * Pilot exposes a per-tool toggle in the Hub (/hub → Tools section).
 * The on-disk source of truth is `~/.pilot/tools-state.json` —
 * a flat `{ [toolName]: boolean }` map. Pilot never writes to
 * pi's own settings.json because that file has strict schema
 * requirements and a `tools` key isn't part of the canonical
 * PiSettings interface (v0.9.16+). Overlaying Pilot's own
 * state is safer and reversible: deleting the file restores
 * default behaviour.
 *
 * The Hub UI merges `tool-inventory` (built-in + npm extension
 * tools) with this state. The `enabled` field the user sees
 * is therefore:
 *
 *   enabled = (tool.enabled in inventory) AND (state[t] !== false)
 *
 * Built-in tools are always inventory-enabled. npm extensions
 * are inventory-enabled when their package is installed. The
 * override here lets the user say "even though this is
 * available, don't show it to pi" — Pilot filters the tool
 * out of `listTools()` for the dashboard.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pilotDir } from "./types.js";

const STATE_FILENAME = "tools-state.json";

function statePath(home?: string): string {
  return join(pilotDir(home), STATE_FILENAME);
}

/** Read the override map. Missing file = no overrides. */
export async function readToolsState(
  home?: string,
): Promise<Record<string, boolean>> {
  try {
    const raw = await readFile(await statePath(home), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    // ENOENT or JSON parse error — treat as "no overrides".
    return {};
  }
}

/**
 * Set one tool's enabled state. Returns the new effective
 * state for the tool. Throws if the write fails.
 *
 * `enabled = true`  → remove the override (back to default)
 * `enabled = false` → write `{ name: false }` to the state file
 *
 * Collapsing `true` to "no override" means a clean file by
 * default — only `false` entries actually appear in the JSON.
 */
export async function setToolEnabled(
  name: string,
  enabled: boolean,
  home?: string,
): Promise<{ name: string; enabled: boolean }> {
  const path = await statePath(home);
  const current = await readToolsState(home);
  if (enabled) {
    delete current[name];
  } else {
    current[name] = false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(current, null, 2) + "\n", "utf-8");
  return { name, enabled };
}
