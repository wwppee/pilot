"use client";

/**
 * <UninstallButton> — client island for the Uninstall form on
 * /packages/[name]. Confirms via window.confirm() before submitting
 * (the form action still posts to the server action — the button
 * just intercepts the click to ask the user first).
 */

import { useFormStatus } from "react-dom";

interface UninstallButtonProps {
  name: string;
}

export function UninstallButton({ name }: UninstallButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 text-sm rounded disabled:opacity-50"
      style={{
        background: "transparent",
        color: "var(--error)",
        border: "1px solid var(--error)",
      }}
      onClick={(e) => {
        if (!confirm(`Uninstall ${name}? You can reinstall it later.`)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? "Uninstalling…" : `Uninstall ${name}`}
    </button>
  );
}
