"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Submit button that disables itself + shows a busy label while pending. */
export function SubmitButton({
  children,
  style,
  pendingLabel = "Working…",
}: {
  children: ReactNode;
  style?: React.CSSProperties;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 text-sm rounded disabled:opacity-60 text-[var(--bg)]"
      style={style ?? { background: "var(--accent)" }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Inline delete button that confirms before submitting. */
export function DeleteButton({
  name,
  label,
  action,
  confirmMessage,
}: {
  name: string;
  label: string;
  action: (data: FormData) => void;
  confirmMessage?: string;
}) {
  const fallback = `Delete "${name}"? This cannot be undone.`;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage ?? fallback)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="name" value={name} />
      <button
        type="submit"
        className="text-xs underline"
        style={{ color: "var(--error)" }}
      >
        {label}
      </button>
    </form>
  );
}
