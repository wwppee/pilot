/**
 * /try — chat with pi from the browser, with session-tree actions.
 *
 * v0.5.15: rebuilt from v0.5.14 Playground into a real chat UI.
 * v0.5.16: added session-tree actions (rename / clone / fork per
 *          user bubble). Each user bubble can spawn a new branch
 *          via `fork(entryId)`; the header shows the current
 *          session name + message count + a "forked from X"
 *          indicator when the latest action was a fork.
 *
 * Architecture:
 *   - `usePiSession` gives us raw events + a typed `send()`.
 *   - `lib/chat-stream.ts` reduces events into ChatMessage[].
 *   - `SessionPanel` (top strip) + `BubbleActions` (per-bubble)
 *     surface tree ops.
 *   - State syncing: we call `get_state` on connect + after each
 *     mutation (rename / clone / fork). There's no public
 *     tree-change event from pi, so polling-on-mutation is the
 *     simplest reliable strategy.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePiSession } from "@/lib/usePiSession";
import { T, useT } from "@/components/I18n";
import {
  reduceStream,
  userMessage,
  type ChatMessage,
  type ContentBlock,
} from "@/lib/chat-stream";
import {
  SessionPanel,
  emptySessionState,
  type SessionState,
} from "@/components/SessionPanel";
import { BubbleActions } from "@/components/BubbleActions";

/**
 * Safely stringify a value for the developer-details log row.
 */
function safeStringify(v: unknown, maxLen = 200): string {
  try {
    return JSON.stringify(v).slice(0, maxLen);
  } catch {
    return "[unserializable]";
  }
}

/** Narrow a loose object into our SessionState view of pi's state. */
function parseSessionState(raw: unknown): SessionState {
  const empty = emptySessionState();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  return {
    sessionId: typeof r.sessionId === "string" ? r.sessionId : "",
    sessionName: typeof r.sessionName === "string" ? r.sessionName : "",
    sessionFile: typeof r.sessionFile === "string" ? r.sessionFile : "",
    messageCount: typeof r.messageCount === "number" ? r.messageCount : 0,
    isStreaming: r.isStreaming === true,
  };
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

  // Session state (synced via get_state on connect + after mutations).
  const [sessionState, setSessionState] =
    useState<SessionState>(emptySessionState());
  const [forkedFrom, setForkedFrom] = useState<string | null>(null);
  // Cache the previous session name when forking, so we can show
  // "↳ forked from X" until the user sends a new message.
  const prevSessionNameRef = useRef<string>("");

  // Counter for stable React keys on the developer-details log.
  const eventCounter = useRef(0);

  /** Re-fetch the session state via get_state. */
  const refreshSessionState = useCallback(async () => {
    if (session.state !== "connected") return;
    try {
      const data = (await session.send({ type: "get_state" })) as unknown;
      setSessionState(parseSessionState(data));
    } catch (e) {
      // get_state can fail mid-stream — ignore, the state pill
      // already shows the connection status.
      setLastError((e as Error).message);
    }
  }, [session]);

  // Refresh state on every connect.
  useEffect(() => {
    if (session.state === "connected") {
      void refreshSessionState();
    }
  }, [session.state, refreshSessionState]);

  // Reduce the raw event stream to assistant / tool messages.
  const streamMessages = useMemo(() => {
    const events = session.events.map((e) => e.event) as Array<
      Record<string, unknown>
    >;
    return reduceStream(events as Parameters<typeof reduceStream>[0]);
  }, [session.events]);

  // Merge user bubbles + assistant bubbles by timestamp.
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

  // Clear forkedFrom indicator once a new user message is sent.
  useEffect(() => {
    if (forkedFrom && localUserMessages.length > 0) {
      // Only clear if the latest user message is after the fork
      // (i.e. they actually sent something new in the new branch).
      setForkedFrom(null);
    }
  }, [localUserMessages.length, forkedFrom]);

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
      // Refresh message count after a turn completes.
      void refreshSessionState();
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
    setLocalUserMessages([]);
    setForkedFrom(null);
    try {
      await session.send({ type: "new_session" });
      void refreshSessionState();
    } catch (e) {
      setLastError((e as Error).message);
    }
  };

  const handleRename = async (next: string) => {
    await session.send({ type: "set_session_name", name: next });
    void refreshSessionState();
  };

  const handleClone = async () => {
    // Capture the name BEFORE clone so we can show "Cloned — now in X".
    prevSessionNameRef.current = sessionState.sessionName;
    setLocalUserMessages([]);
    setForkedFrom(null);
    await session.send({ type: "clone" });
    await refreshSessionState();
    // Friendly toast-style confirmation. The new name is now in
    // sessionState.sessionName (since refreshSessionState already
    // ran). The "from X" hint is implicit in the session panel
    // (user can rename + see old name in their file browser).
  };

  /**
   * Fork from a specific user message bubble. We need to map the
   * bubble's text → pi's entryId, since pi identifies tree nodes
   * by entryId (not our synthetic `user-<ts>`).
   *
   * 1. Call get_fork_messages() to get [{entryId, text}].
   * 2. Find the entry whose text matches the bubble.
   * 3. Call fork(entryId).
   * 4. Refresh state + show "forked from <oldName>".
   */
  const handleFork = useCallback(
    async (bubble: ChatMessage) => {
      const textBlock = bubble.blocks.find((b) => b.type === "text");
      const bubbleText = textBlock?.type === "text" ? textBlock.text : "";
      if (!bubbleText) throw new Error("no text in bubble to fork from");

      const forkable = (await session.send({
        type: "get_fork_messages",
      })) as Array<{ entryId: string; text: string }> | unknown;
      const list = Array.isArray(forkable) ? forkable : [];
      // Match by exact text. If multiple matches (same prompt
      // twice), pick the last — that's the most recent occurrence.
      const match = [...list].reverse().find((m) => m.text === bubbleText);
      if (!match) {
        throw new Error("could not find this message in pi's tree");
      }

      prevSessionNameRef.current = sessionState.sessionName;
      setForkedFrom(sessionState.sessionName || t("try.session.unnamed"));
      setLocalUserMessages([]);
      await session.send({ type: "fork", entryId: match.entryId });
      await refreshSessionState();
    },
    [session, sessionState.sessionName, refreshSessionState, t],
  );

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

      <SessionPanel
        sessionState={sessionState}
        onRename={handleRename}
        onClone={handleClone}
        forkedFrom={forkedFrom}
      />

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
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onFork={m.role === "user" ? () => handleFork(m) : undefined}
            />
          ))
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

function lastMessageText(messages: ChatMessage[]): string {
  const m = messages[messages.length - 1];
  if (!m) return "";
  const last = m.blocks[m.blocks.length - 1];
  if (!last) return "";
  if (last.type === "text" || last.type === "thinking") return last.text;
  return "";
}

/** Render a single chat message. User bubbles get a fork action. */
function MessageBubble({
  message,
  onFork,
}: {
  message: ChatMessage;
  // Pass undefined explicitly — exactOptionalPropertyTypes
  // disallows `prop?: T` where the source value is `T | undefined`.
  onFork: (() => Promise<void> | void) | undefined;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} group`}
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
      return <p className="whitespace-pre-wrap break-words">{block.text}</p>;
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
                (<T k="try.tool.executing" params={{ tool: block.name }} />)
              </span>
            )}
            {block.isError && (
              <span className="text-[var(--error)] ml-2">
                ⚠ <T k="try.tool.error" />
              </span>
            )}
          </summary>
          {block.args !== undefined && (
            <div className="mt-1">
              <p className="opacity-60">
                <T k="try.tool.args" />:
              </p>
              <pre className="overflow-x-auto bg-[var(--surface-2)] rounded p-1">
                {safeStringify(block.args, 1000)}
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
}
