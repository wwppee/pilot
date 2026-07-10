/**
 * /try — chat with pi from the browser, with session-tree actions.
 *
 * v0.5.15: real chat UI (user / assistant bubbles, streaming,
 *          thinking, tool calls).
 * v0.5.16: session-tree actions (rename / clone / fork per bubble).
 * v0.5.17: mobile-friendly layout. Status strip + SessionPanel +
 *          input bar collapse on <640px viewports; less-frequent
 *          actions move to a single overflow menu; chat bubbles
 *          go full-width on small screens; input bar is sticky.
 *
 * Architecture:
 *   - `usePiSession` gives us raw events + a typed `send()`.
 *   - `lib/chat-stream.ts` reduces events into ChatMessage[]
 *     (filters out user-role events so user bubbles come from
 *      localUserMessages only — avoids duplicate bubbles).
 *   - `SessionPanel` (compact mode on mobile) + `BubbleActions`
 *     (per-bubble) + `OverflowMenu` (mobile actions drawer).
 *   - State syncing via `get_state` on connect + after mutations.
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
import { OverflowMenu, OverflowMenuItem } from "@/components/OverflowMenu";
import { Hint } from "@/components/Hint";
import { GlossaryTerm } from "@/components/GlossaryTerm";

function safeStringify(v: unknown, maxLen = 200): string {
  try {
    return JSON.stringify(v).slice(0, maxLen);
  } catch {
    return "[unserializable]";
  }
}

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

  const [localUserMessages, setLocalUserMessages] = useState<ChatMessage[]>([]);

  const [sessionState, setSessionState] =
    useState<SessionState>(emptySessionState());
  const [forkedFrom, setForkedFrom] = useState<string | null>(null);
  const eventCounter = useRef(0);

  /** Re-fetch the session state via get_state. */
  const refreshSessionState = useCallback(async () => {
    if (session.state !== "connected") return;
    try {
      const data = (await session.send({ type: "get_state" })) as unknown;
      setSessionState(parseSessionState(data));
    } catch (e) {
      setLastError((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    if (session.state === "connected") {
      void refreshSessionState();
    }
  }, [session.state, refreshSessionState]);

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

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessageText(messages)]);

  useEffect(() => {
    if (forkedFrom && localUserMessages.length > 0) {
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
    setLocalUserMessages([]);
    setForkedFrom(null);
    await session.send({ type: "clone" });
    await refreshSessionState();
  };

  const handleFork = useCallback(
    async (bubble: ChatMessage) => {
      const textBlock = bubble.blocks.find((b) => b.type === "text");
      const bubbleText = textBlock?.type === "text" ? textBlock.text : "";
      if (!bubbleText) throw new Error("no text in bubble to fork from");

      const forkable = (await session.send({
        type: "get_fork_messages",
      })) as Array<{ entryId: string; text: string }> | unknown;
      const list = Array.isArray(forkable) ? forkable : [];
      const match = [...list].reverse().find((m) => m.text === bubbleText);
      if (!match) {
        throw new Error("could not find this message in pi's tree");
      }

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

  const connected = session.state === "connected";

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col gap-3 sm:gap-4 sm:h-[calc(100vh-6rem)]">
      <header className="surface rounded-lg p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-bold">
            <T k="try.h1" />
          </h1>
          <div className="flex-1" />
          {/* Mobile overflow menu: collapses New session / Abort /
              Disconnect / Rename / Clone. Connect / Send stay
              visible as primary actions. */}
          <div className="sm:hidden">
            <OverflowMenu ariaLabel="More actions">
              {connected ? (
                <>
                  <OverflowMenuItem
                    onClick={handleNewSession}
                    disabled={sending}
                  >
                    <T k="try.action.newSession" />
                  </OverflowMenuItem>
                  <OverflowMenuItem onClick={handleAbort} disabled={sending}>
                    <T k="try.action.abort" />
                  </OverflowMenuItem>
                  <OverflowMenuItem onClick={session.disconnect}>
                    <T k="try.action.disconnect" />
                  </OverflowMenuItem>
                  <OverflowMenuItem
                    onClick={() => {
                      // Click the inline rename button in the
                      // SessionPanel — we forward by ID. The
                      // component looks up its own state.
                      const btn = document.getElementById(
                        "session-panel-rename-btn",
                      );
                      btn?.click();
                    }}
                    disabled={!sessionState.sessionId}
                  >
                    <T k="try.session.rename" />
                  </OverflowMenuItem>
                  <OverflowMenuItem
                    onClick={handleClone}
                    disabled={!sessionState.sessionId}
                  >
                    <T k="try.session.clone" />
                  </OverflowMenuItem>
                </>
              ) : (
                <OverflowMenuItem
                  onClick={session.connect}
                  disabled={
                    session.state === "fetching-token" ||
                    session.state === "connecting"
                  }
                >
                  <T k="try.action.connect" />
                </OverflowMenuItem>
              )}
            </OverflowMenu>
          </div>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1 hidden sm:block">
          <T k="try.subtitle" />
        </p>
        <div className="mt-3 hidden sm:block">
          <Hint summary="What is this page?">
            This page opens a real pi session in your browser. Click{" "}
            <strong>Connect</strong>, type a message, and watch pi stream a
            reply. Every user bubble has a hidden{" "}
            <strong>Fork from here</strong> button (hover over it) — forking
            creates a new branch of the conversation from that exact prompt.
            Rename / Clone at the top save or duplicate the session.{" "}
            <GlossaryTerm term="rpc">RPC</GlossaryTerm> is the protocol pi
            speaks over WebSocket; the dev-details panel at the bottom shows the
            raw events if you're curious.
          </Hint>
        </div>
      </header>

      {/* Status strip — desktop only (mobile overflow menu covers it). */}
      <section className="hidden sm:flex surface rounded-lg p-3 items-center gap-3 flex-wrap">
        <span
          className="pill"
          style={{
            background: connected
              ? "color-mix(in srgb, var(--accent-2) 18%, transparent)"
              : "color-mix(in srgb, var(--text-muted) 12%, transparent)",
            color: connected ? "var(--accent-2)" : "var(--text-muted)",
          }}
        >
          {session.state}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          <T k={statusLabel} />
        </span>
        <div className="flex-1" />
        {connected ? (
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

      {/* Mobile: compact name + count, no inline buttons. */}
      <div className="sm:hidden">
        <SessionPanel
          sessionState={sessionState}
          onRename={handleRename}
          onClone={handleClone}
          forkedFrom={forkedFrom}
          compact
        />
      </div>
      {/* Desktop: full panel with rename + clone buttons. */}
      <div className="hidden sm:block">
        <SessionPanel
          sessionState={sessionState}
          onRename={handleRename}
          onClone={handleClone}
          forkedFrom={forkedFrom}
        />
      </div>

      <section
        ref={scrollRef}
        className="surface rounded-lg flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-0"
      >
        {messages.length === 0 ? (
          <p className="text-[var(--text-muted)] italic text-sm">
            <T
              k={
                connected
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

      {/* Input bar — sticky on mobile so the keyboard pushing the
          viewport doesn't hide it. */}
      <section className="surface rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 sticky bottom-2 sm:bottom-auto z-[1]">
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
            disabled={!connected || sending}
            placeholder={t("try.prompt.placeholder")}
            rows={2}
            className="w-full surface-2 rounded px-3 py-2 text-base sm:text-sm outline-none focus:border-[var(--accent)] resize-none min-h-[44px]"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={!connected || sending || !prompt.trim()}
            className="btn min-h-[44px] px-5"
          >
            <T k="try.action.send" />
          </button>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
            ⌘/Ctrl-Enter
          </span>
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
