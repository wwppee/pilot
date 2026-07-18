"use client";

/**
 * MessageView — render one chat message (user / assistant / tool /
 * system) and all its content blocks.
 *
 * v0.9.8: extracted from `app/try/page.tsx` (which had grown to
 * 710 lines). The 4 component split mirrors agegr/pi-web's
 * `MessageView.tsx` separation, so future enhancements (lazy
 * image render, syntax highlighting, mermaid diagrams) have a
 * single place to live.
 *
 * Block types:
 *   - `text`:     plain LLM response text
 *   - `thinking`: pi's internal reasoning (collapsed by default,
 *                 italic, low opacity — same as v0.5.15)
 *   - `toolCall`: a tool invocation. Five statuses:
 *       - `streaming`  — args still being parsed
 *       - `executing`  — call is running
 *       - `complete`   — call finished (success)
 *       - `denied`     — B1 policy blocked before run
 *                         (pilot-specific; `deniedBy` carries
 *                         the policy name)
 *       - `wrapped`    — A2 wrapper rewrote the args
 *                         (pilot-specific; `wrappedBy` carries
 *                         the wrapper name, `transformedArgs`
 *                         carries the rewritten args)
 *     The two `denied` / `wrapped` statuses are the v0.9.8
 *     differentiator — they let the user *see* the governance
 *     layer in action, not just feel it via the absence of
 *     a tool result. The runtime data source is a future
 *     v0.9.x+ pi hook (sandbox-hard-blocked today); the type
 *     + UI are ready so the visualization works the moment
 *     the hook starts emitting these events.
 *
 * v0.5.15 origin: this UI was originally inline in
 * `app/try/page.tsx`; the inline form is gone as of v0.9.8.
 */
import { T } from "@/components/I18n";
import type { ContentBlock, ChatMessage } from "@/lib/chat-stream";
import { BubbleActions } from "@/components/BubbleActions";

function safeStringify(v: unknown, maxLen = 200): string {
  try {
    return JSON.stringify(v).slice(0, maxLen);
  } catch {
    return "[unserializable]";
  }
}

/**
 * One chat message — the outer bubble (alignment, color,
 * per-message metadata line, fork button for user turns).
 */
export function MessageBubble({
  message,
  onFork,
}: {
  message: ChatMessage;
  onFork: (() => Promise<void> | void) | undefined;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} group`}
      data-role={message.role}
    >
      <div
        className={`max-w-[92%] sm:max-w-[80%] rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-sm sm:text-sm space-y-2 ${
          isUser
            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
            : "surface-2 text-[var(--text)]"
        }`}
      >
        {message.blocks.length === 0 && message.status === "streaming" ? (
          <p className="italic opacity-70">
            <T k="try.streaming" />
          </p>
        ) : (
          message.blocks.map((b, i) => (
            <BlockView
              key={i}
              block={b}
              isLast={i === message.blocks.length - 1}
              messageStatus={message.status}
            />
          ))
        )}
        {message.model && !isUser && (
          <p className="text-[10px] opacity-50 font-mono">
            {message.provider}/{message.model}
          </p>
        )}
        {isUser && onFork && (
          <div className="flex justify-end">
            <BubbleActions onFork={onFork} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One content block inside a message. The text and thinking
 * branches stayed the same as v0.5.15; the toolCall branch
 * moved into its own `<ToolCallBlock>` for the v0.9.8 status
 * enum + governance annotations.
 */
function BlockView({
  block,
  isLast,
  messageStatus,
}: {
  block: ContentBlock;
  isLast: boolean;
  messageStatus: ChatMessage["status"];
}) {
  switch (block.type) {
    case "text":
      if (!block.text && messageStatus === "streaming" && isLast) return null;
      return (
        <p className="whitespace-pre-wrap break-words text-[15px] sm:text-sm leading-relaxed">
          {block.text}
        </p>
      );
    case "thinking":
      if (!block.text) return null;
      return (
        <details className="text-xs opacity-70">
          <summary className="cursor-pointer italic">
            <T k="try.thinking" />
          </summary>
          <p className="mt-1 whitespace-pre-wrap">{block.text}</p>
        </details>
      );
    case "toolCall":
      return <ToolCallBlock block={block} />;
  }
}

/**
 * Tool call rendering with pilot's v0.9.8 governance
 * visualization. Five statuses; the last two (denied /
 * wrapped) are pilot-specific and carry a policy / wrapper
 * name in a sub-label.
 */
function ToolCallBlock({ block }: { block: Extract<ContentBlock, { type: "toolCall" }> }) {
  const isError = block.isError;
  const isDenied = block.status === "denied";
  const isWrapped = block.status === "wrapped";

  // v0.9.8: pick a tinted background per status.
  // - isError  → red tint
  // - isDenied  → red tint + a `🚫` marker, by policy
  // - isWrapped → blue tint + a `🔄` marker, by wrapper
  // - default   → surface tint
  const bgClass = isError || isDenied
    ? "bg-[color-mix(in_srgb,var(--error)_15%,transparent)]"
    : isWrapped
      ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
      : "bg-[var(--surface)]";

  return (
    <details
      className={`text-xs rounded px-2 py-1 ${bgClass}`}
      open={block.status !== "complete"}
      data-tool-status={block.status}
    >
      <summary className="cursor-pointer font-mono">
        {isDenied ? "🚫" : isWrapped ? "🔄" : "🔧"}{" "}
        {block.name || "tool"}{" "}
        {block.status === "executing" && (
          <span className="opacity-60">
            (<T k="try.tool.executing" params={{ tool: block.name }} />)
          </span>
        )}
        {isError && (
          <span className="text-[var(--error)] ml-2">
            ⚠ <T k="try.tool.error" />
          </span>
        )}
        {isDenied && block.deniedBy && (
          <span className="ml-2 italic">
            <T
              k="try.tool.denied"
              params={{ policy: block.deniedBy }}
            />
          </span>
        )}
        {isWrapped && block.wrappedBy && (
          <span className="ml-2 italic opacity-80">
            <T
              k="try.tool.wrapped"
              params={{ wrapper: block.wrappedBy }}
            />
          </span>
        )}
      </summary>

      {/* v0.9.8: when wrapped, show original args first
          (struck through) then the transformed args. This
          makes the wrapper's behavior *visible* — the user
          can see exactly what the wrapper rewrote. */}
      {isWrapped && block.args !== undefined && (
        <div className="mt-1">
          <p className="opacity-60">
            <T k="try.tool.args" /> <span className="italic">(<T k="try.tool.preWrap" />)</span>:
          </p>
          <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1 line-through opacity-60">
            {safeStringify(block.args, 1000)}
          </pre>
        </div>
      )}
      {isWrapped && block.transformedArgs !== undefined && (
        <div className="mt-1">
          <p className="opacity-60">
            <T k="try.tool.args" /> <span className="italic">(<T k="try.tool.postWrap" />)</span>:
          </p>
          <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1">
            {safeStringify(block.transformedArgs, 1000)}
          </pre>
        </div>
      )}

      {!isWrapped && block.args !== undefined && (
        <div className="mt-1">
          <p className="opacity-60">
            <T k="try.tool.args" />:
          </p>
          <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1">
            {safeStringify(block.args, 1000)}
          </pre>
        </div>
      )}

      {/* v0.9.8: when denied, surface the policy's reason
          so the user knows *why* the call was blocked. */}
      {isDenied && block.deniedReason && (
        <div className="mt-1">
          <p className="opacity-60">
            <T k="try.tool.reason" />:
          </p>
          <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1 italic">
            {block.deniedReason}
          </pre>
        </div>
      )}

      {block.result !== undefined && (
        <div className="mt-1">
          <p className="opacity-60">
            <T k="try.tool.result" />:
          </p>
          <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1 max-h-40">
            {safeStringify(block.result, 1000)}
          </pre>
        </div>
      )}
    </details>
  );
}
