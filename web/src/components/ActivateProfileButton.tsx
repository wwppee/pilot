"use client";

/**
 * <ActivateProfileButton> — client island for "make this profile active".
 *
 * Renders either "Activate" (idle) or "Active ✓" (this profile is
 * already the active one) depending on the active-state prop the
 * server passed in. Clicking POSTs to the server's activate endpoint
 * and reloads the page so the new state is server-rendered.
 *
 * Why reload instead of mutate local state? Two reasons:
 *   1. The header badge needs to update too — easier to let the
 *      server re-render the whole tree than to thread a context.
 *   2. The active.json file is the source of truth — reloading
 *      guarantees we're showing what the server actually has.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./I18n";
import { api } from "@/lib/pilot-browser";
import type { ActiveProfile } from "@/lib/types";

interface ActivateProfileButtonProps {
  name: string;
  active: ActiveProfile | null;
}

export function ActivateProfileButton({
  name,
  active,
}: ActivateProfileButtonProps) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = active?.name === name;

  if (isActive) {
    return (
      <span
        className="px-2 py-1 text-xs rounded font-medium"
        style={{
          background: "var(--accent-2)",
          color: "var(--bg)",
        }}
        aria-label={`${t("profiles.active")}: ${name}`}
        title={t("profiles.activeHint")}
      >
        ★ {t("profiles.active")}
      </span>
    );
  }

  async function onActivate() {
    setBusy(true);
    setError(null);
    try {
      await api.activateProfile(name);
      // Reload server components so header badge + this card both
      // re-render with the new active state.
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onActivate}
        disabled={busy}
        className="px-2 py-1 text-xs rounded font-medium transition-opacity disabled:opacity-50"
        style={{
          background: "var(--surface-2)",
          color: "var(--text)",
          border: "1px solid var(--border)",
        }}
        aria-label={t("profiles.activate") + " " + name}
      >
        {busy ? "…" : t("profiles.activate")}
      </button>
      {error && (
        <span
          className="text-xs"
          style={{ color: "var(--error)" }}
          role="alert"
        >
          {t("profiles.activateFailed", { msg: error })}
        </span>
      )}
    </div>
  );
}