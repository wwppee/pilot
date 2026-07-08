"use client";

/**
 * v0.5.8+: Retry button for the session-detail error surface.
 *
 * RSC pages can't attach `onClick`, so this thin client wrapper calls
 * `router.refresh()` to re-run the server component. We also nudge
 * the browser to skip its HTTP cache so a re-attempt actually retries
 * the fetch (otherwise refresh can short-circuit to cached HTML).
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface Props {
  label: string;
}

export function RetryButton({ label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      disabled={pending}
      className="text-xs px-3 py-1 rounded surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)] disabled:opacity-50"
    >
      {pending ? `${label}…` : label}
    </button>
  );
}
