"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * AutoRefresh — calls `router.refresh()` every `intervalMs` to refetch
 * Server Component data without a full reload.
 *
 * Use sparingly. Anything inside will refetch on every tick, which is
 * a network call to the pilot server. Default 10s is fine for a local
 * dashboard.
 */
export function AutoRefresh({
  intervalMs = 10_000,
  enabled = true,
}: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs, enabled]);

  return null;
}

/** A small status pill — green when live, dim when stale. */
export function LivePulse({ live }: { live: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: live ? "var(--accent-2)" : "var(--text-muted)" }}
      aria-label={live ? "live" : "idle"}
    />
  );
}
