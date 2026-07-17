/**
 * v0.7.3 (B2): one generic card per recorded tool call.
 *
 * Per user memory §Engineering Philosophy, the dashboard uses
 * ONE card component for all tools — no per-tool special cases.
 * The card renders the five canonical fields the recorder writes
 * (`tool`, `outcome`, `reason`, `errorSample`, `context`) and
 * nothing more. The raw `errorSample` is shown verbatim; we
 * deliberately do NOT collapse "file not found" and "permission
 * denied" into a generic "工具失败" because that would lose the
 * actionable signal the user needs to fix the underlying cause.
 */

export interface ToolCallCardData {
  tool: string;
  outcome: "success" | "fail" | "denied";
  reason: string;
  errorSample: string;
  context: {
    sessionId?: string;
    workflowId?: string;
    timestamp: string;
  };
}

export function ToolCallCard({
  call,
  t,
  onClick,
}: {
  call: ToolCallCardData;
  t: (k: string, p?: Record<string, string | number>) => string;
  // v0.8.5: optional click handler. The card is
  // keyboard-activatable too (button role + Enter /
  // Space) so the detail modal is accessible without
  // a mouse. We only attach the handler + the role when
  // the parent actually wires one up — otherwise the
  // card stays a passive display element.
  onClick?: () => void;
}) {
  const outcomeTone =
    call.outcome === "denied"
      ? "bg-[var(--error)]/10 text-[var(--error)]"
      : call.outcome === "fail"
        ? "bg-[var(--error)]/5 text-[var(--error)]"
        : "bg-[var(--text-muted)]/10 text-[var(--text-muted)]";
  // v0.8.5: when an onClick handler is provided, the
  // card becomes a button (clickable + keyboard-
  // activatable). We pick <button> over a div with role
  // because the screen-reader experience of a real
  // button is much better (announces "button" + the
  // label we provide).
  const interactive = !!onClick;
  const className = `surface-2 rounded p-2 text-xs space-y-1 ${
    interactive
      ? "cursor-pointer hover:ring-1 hover:ring-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      : ""
  }`;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={className}
      data-testid={`observability-card-${call.tool}-${call.context.timestamp}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`px-1.5 py-0.5 rounded font-mono ${outcomeTone}`}
          data-testid={`observability-outcome-${call.outcome}`}
        >
          {t(`observability.outcome.${call.outcome}`)}
        </span>
        <span className="font-mono">{call.tool}</span>
        {call.reason ? (
          <span className="text-[var(--text-muted)]">
            · {t("observability.reason", { reason: call.reason })}
          </span>
        ) : null}
        <span className="ml-auto text-[var(--text-muted)]">
          {new Date(call.context.timestamp).toLocaleString()}
        </span>
      </div>
      {call.errorSample ? (
        <pre
          className="whitespace-pre-wrap break-words font-mono text-[var(--text)]"
          data-testid="observability-error-sample"
        >
          {call.errorSample}
        </pre>
      ) : null}
    </Tag>
  );
}
