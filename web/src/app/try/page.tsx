/**
 * /try — chat with pi from the browser.
 *
 * v0.5.15: rebuilt from the v0.5.14 Playground (raw event log)
 * into a real chat interface. The page:
 *
 *   - Connects to the Pilot WebSocket bridge (via `usePiSession`).
 *   - Sends the user's prompt with `session.send({ type: "prompt" })`.
 *   - Reduces pi's raw event stream into a chat-shaped message
 *     list via `lib/chat-stream.ts`.
 *   - Renders user + assistant bubbles, thinking blocks, tool calls.
 *   - Collapses the raw event stream into a "Developer details"
 *     panel so devs can still debug the bridge.
 *
 * Why not just dump events: pi's event stream is a developer
 * surface (message_start/update/end with delta contentIndex, plus
 * tool_execution_* events). End users want a chat. The reducer
 * (`chat-stream.ts`) is pure + unit-tested so the chat view is
 * reliable without depending on the live SDK.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePiSession } from "@/lib/usePiSession";
import { T, useT } from "@/components/I18n";
import {
  reduceStream,
  userMessage,
  type ChatMessage,
  type ContentBlock,
} from "@/lib/chat-stream";

/**
 * Safely stringify a value for the developer-details log row.
 * Pi event payloads can contain circular structures; degrade
 * gracefully so the UI keeps working.
 */
function safeStringify(v: unknown, maxLen = 200): string {
  try {
    return JSON.stringify(v).slice(0, maxLen);
  } catch {
    return "[unserializable]";
  }
}

export default function TryPage() {
  const session = usePiSession();
  const t = useT();
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showDevDetails, setShowDevDetails] = useState(false);

  // User-authored messages are NOT in the event stream — we
  // synthesize them locally and prepend to the reducer output.
  const [localUserMessages, setLocalUserMessages] = useState<ChatMessage[]>([]);

  // Counter for stable React keys on the developer-details log
  // (avoids the array-index-as-key anti-pattern).
  const eventCounter = useRef(0);

  // Reduce the raw event stream to assistant / tool messages. We
  // re-run on every event; the reducer is pure + cheap.
  const streamMessages = useMemo(() => {
    // Cast the loose event shape — usePiSession already gives us a
    // generic { type: string; [k: string]: unknown } event.
    const events = session.events.map((e) => e.event) as Array<
      Record<string, unknown>
    >;
    return reduceStream(events as Parameters<typeof reduceStream>[0]);
  }, [session.events]);

  // Synthesize a user message every time we send a prompt so it
  // shows up immediately in the chat (before pi echoes its events).
  const handleSend = async () => {
    const text = prompt.trim();
    if (!text) return;
    setSending(true);
    setLastError(null);
    setLocalUserMessages((prev) => [...prev, userMessage(text)]);
    setPrompt("");
    try {
      await session.send({ type: "prompt", message: text });
    } catch (e) {
      setLastError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleAbort = async () => {
    try {
      await session.send({ type: "abort" });
    } catch (e) {
      setLastError((e as Error).message);
    }
  };

  const handleNewSession = async () => {
    // Reset local user-bubble history too — a fresh pi session
    // shouldn't show our previous turns.
    setLocalUserMessages([]);
    try {
      await session.send({ type: "new_session" });
    } catch (e) {
      setLastError((e as Error).message);
    }
  };

  // Merge user bubbles + assistant bubbles, preserving order. User
  // bubbles carry their own timestamps; assistant bubbles inherit
  // order from the reducer.
  const messages = useMemo<ChatMessage[]>(() => {
    const merged: ChatMessage[] = [];
    let userIdx = 0;
    let streamIdx = 0;
    while (
      userIdx < localUserMessages.length ||
      streamIdx < streamMessages.length
    ) {
      const u = localUserMessages[userIdx];
      const s = streamMessages[streamIdx];
      if (u && (!s || (u.timestamp ?? 0) <= (s.timestamp ?? 0))) {
        merged.push(u);
        userIdx++;
      } else if (s) {
        merged.push(s);
        streamIdx++;
      }
    }
    return merged;
  }, [localUserMessages, streamMessages]);

  // Auto-scroll the chat to the bottom as new content arrives.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessageText(messages)]);

  const statusLabel = (() => {
    switch (session.state) {
      case "idle":
        return "try.status.idle";
      case "fetching-token":
        return "try.status.fetchingToken";
      case "connecting":
        return "try.status.connecting";
      case "connected":
        return "try.status.connected";
      case "disconnected":
        return "try.status.disconnected";
      case "error":
        return session.error ?? "try.status.errorUnknown";
    }
  })();

  return (
    <main className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <header className="surface rounded-lg p-4">
        <h1 className="text-xl font-bold">
          <T k="try.h1" />
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          <T k="try.subtitle" />
        </p>
      </header>

      <section className="surface rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <span
          className="pill"
          style={{
            background:
              session.state === "connected"
                ? "color-mix(in srgb, var(--accent-2) 18%, transparent)"
                : "color-mix(in srgb, var(--text-muted) 12%, transparent)",
            color:
              session.state === "connected"
                ? "var(--accent-2)"
                : "var(--text-muted)",
          }}
        >
          {session.state}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          <T k={statusLabel} />
        </span>
        <div className="flex-1" />
        {session.state === "connected" ? (
          <>
            <button
              type="button"
              onClick={handleNewSession}
              disabled={sending}
              className="btn secondary"
            >
              <T k="try.action.newSession" />
            </button>
            <button
              type="button"
              onClick={handleAbort}
              disabled={sending}
              className="btn danger"
            >
              <T k="try.action.abort" />
            </button>
            <button
              type="button"
              onClick={session.disconnect}
              className="btn secondary"
            >
              <T k="try.action.disconnect" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={session.connect}
            disabled={
              session.state === "fetching-token" ||
              session.state === "connecting"
            }
            className="btn"
          >
            <T k="try.action.connect" />
          </button>
        )}
      </section>

      <section
        ref={scrollRef}
        className="surface rounded-lg flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {messages.length === 0 ? (
          <p className="text-[var(--text-muted)] italic text-sm">
            <T
              k={
                session.state === "connected"
                  ? "try.chat.emptyConnected"
                  : "try.chat.emptyDisconnected"
              }
            />
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} t={t} />)
        )}
        {lastError && (
          <p className="text-sm text-[var(--error)]">{lastError}</p>
        )}
      </section>

      <section className="surface rounded-lg p-4 space-y-3">
        <label className="block">
          <span className="sr-only">
            <T k="try.prompt.label" />
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl-Enter to send (Enter alone just inserts a newline).
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={session.state !== "connected" || sending}
            placeholder={t("try.prompt.placeholder")}
            rows={2}
            className="w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)] resize-none"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={
              session.state !== "connected" || sending || !prompt.trim()
            }
            className="btn"
          >
            <T k="try.action.send" />
          </button>
          <span className="text-xs text-[var(--text-muted)]">⌘/Ctrl-Enter</span>
        </div>
      </section>

      <details
        className="surface rounded-lg p-3 text-xs"
        open={showDevDetails}
        onToggle={(e) =>
          setShowDevDetails((e.target as HTMLDetailsElement).open)
        }
      >
        <summary className="cursor-pointer font-medium">
          <T k="try.developerDetails" /> ({session.events.length})
        </summary>
        <p className="text-[var(--text-muted)] mt-2 mb-2">
          <T k="try.developerDetailsHint" />
        </p>
        <div className="font-mono space-y-1 max-h-[280px] overflow-y-auto bg-[var(--surface-2)] rounded p-2">
          {session.events.length === 0 ? (
            <p className="text-[var(--text-muted)] italic">
              <T k="try.events.emptyDisconnected" />
            </p>
          ) : (
            session.events.map((e) => {
              const counter = ++eventCounter.current;
              return (
                <div key={`${e.event.type}-${counter}`} className="flex gap-2">
                  <span className="text-[var(--text-muted)] shrink-0 w-10 text-right">
                    {counter}
                  </span>
                  <span className="text-[var(--accent)] shrink-0">
                    {e.event.type}
                  </span>
                  <span className="text-[var(--text-muted)] truncate">
                    {summarizeEvent(e.event as Record<string, unknown>)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </details>
    </main>
  );
}

/**
 * Pick the most informative field out of an event payload for the
 * developer-details row.
 */
function summarizeEvent(ev: Record<string, unknown>): string {
  if (typeof ev.message === "string") return ev.message.slice(0, 200);
  if (typeof ev.text === "string") return ev.text.slice(0, 200);
  if (typeof ev.toolName === "string")
    return `${ev.toolName}${ev.args ? " " + safeStringify(ev.args, 80) : ""}`;
  if (typeof ev.command === "string") return ev.command;
  if (typeof ev.error === "string") return `error: ${ev.error}`;
  if (typeof ev.reason === "string") return `reason: ${ev.reason}`;
  const rest = Object.entries(ev).filter(([k]) => k !== "type");
  if (rest.length === 0) return "";
  return rest
    .map(
      ([k, v]) =>
        `${k}=${typeof v === "string" ? v.slice(0, 60) : safeStringify(v, 60)}`,
    )
    .join(" ");
}

/** Last text-ish bit of any message — used as auto-scroll dep. */
function lastMessageText(messages: ChatMessage[]): string {
  const m = messages[messages.length - 1];
  if (!m) return "";
  const last = m.blocks[m.blocks.length - 1];
  if (!last) return "";
  if (last.type === "text" || last.type === "thinking") return last.text;
  return "";
}

/** Render a single chat message (user or assistant or tool). */
function MessageBubble({
  message,
  t,
}: {
  message: ChatMessage;
  t: (k: string, params?: Record<string, string | number>) => string;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-role={message.role}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm space-y-2 ${
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
              t={t}
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
      </div>
    </div>
  );
}

/** Render a single ContentBlock (text / thinking / toolCall). */
function BlockView({
  block,
  t,
  isLast,
  messageStatus,
}: {
  block: ContentBlock;
  t: (k: string, params?: Record<string, string | number>) => string;
  isLast: boolean;
  messageStatus: ChatMessage["status"];
}) {
  switch (block.type) {
    case "text":
      // Empty trailing text blocks on a still-streaming message
      // are noise — skip them.
      if (!block.text && messageStatus === "streaming" && isLast) return null;
      return <p className="whitespace-pre-wrap break-words">{block.text}</p>;
    case "thinking":
      if (!block.text) return null;
      return (
        <details className="text-xs opacity-70">
          <summary className="cursor-pointer italic">
            {messageStatus === "streaming" && isLast
              ? t("try.thinking")
              : t("try.thinking").replace("…", "")}
          </summary>
          <p className="mt-1 whitespace-pre-wrap">{block.text}</p>
        </details>
      );
    case "toolCall":
      return (
        <details
          className={`text-xs rounded px-2 py-1 ${
            block.isError
              ? "bg-[color-mix(in_srgb,var(--error)_15%,transparent)]"
              : "bg-[var(--surface)]"
          }`}
          open={block.status !== "complete"}
        >
          <summary className="cursor-pointer font-mono">
            🔧 {block.name || "tool"}{" "}
            {block.status === "executing" && (
              <span className="opacity-60">
                ({t("try.tool.executing", { tool: block.name })})
              </span>
            )}
            {block.isError && (
              <span className="text-[var(--error)] ml-2">
                ⚠ {t("try.tool.error")}
              </span>
            )}
          </summary>
          {block.args !== undefined && (
            <div className="mt-1">
              <p className="opacity-60">{t("try.tool.args")}:</p>
              <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1">
                {safeStringify(block.args, 1000)}
              </pre>
            </div>
          )}
          {block.result !== undefined && (
            <div className="mt-1">
              <p className="opacity-60">{t("try.tool.result")}:</p>
              <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1 max-h-40">
                {safeStringify(block.result, 1000)}
              </pre>
            </div>
          )}
        </details>
      );
  }
}
