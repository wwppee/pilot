/**
 * /playground — interactive pi session via WebSocket.
 *
 * v0.5.14+: ships with the v0.5.13 release but kept tiny on
 * purpose — it's a demo page for the new RPC bridge, not a full
 * pi UI replacement. Click Connect to open the WS, type a prompt,
 * watch streaming events arrive in the log. Abort / new session
 * buttons exercise the SDK's control plane.
 *
 * What this page proves:
 *   - Browser → Next.js → WS → Pilot server → RpcClient → pi works
 *     end-to-end with the standard pi RPC protocol.
 *   - The Pilot server correctly proxies pi's events + responses
 *     back to the browser.
 *
 * What this page does NOT do:
 *   - Render pi's rich UIs (multi-select, file picker, etc.). For
 *     those, pi needs a real terminal — `/playground` is for testing
 *     the data plane, not the UI plane.
 *   - Persist conversation history. Each `new session` starts fresh.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { usePiSession } from "@/lib/usePiSession";
import { T, useT } from "@/components/I18n";

/**
 * Safely stringify a value for the log row. Pi event payloads can
 * contain circular structures (e.g. an `args` object that points
 * back at the parent `event`). JSON.stringify throws on those;
 * we degrade gracefully to a placeholder so the UI keeps working.
 */
function safeStringify(v: unknown, maxLen = 80): string {
  try {
    return JSON.stringify(v).slice(0, maxLen);
  } catch {
    return "[unserializable]";
  }
}

export default function PlaygroundPage() {
  const session = usePiSession();
  const t = useT();
  const [prompt, setPrompt] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Counter — used as part of the React key so a single ts can
  // disambiguate two events that arrive in the same millisecond.
  // Avoids P2#10 (array index as key — re-renders lose focus).
  const eventCounter = useRef(0);

  // Auto-scroll the log to the bottom as events arrive.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.events.length]);

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setSending(true);
    setLastError(null);
    try {
      await session.send({ type: "prompt", message: prompt });
    } catch (e) {
      setLastError((e as Error).message);
    } finally {
      setSending(false);
      setPrompt("");
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
    try {
      await session.send({ type: "new_session" });
    } catch (e) {
      setLastError((e as Error).message);
    }
  };

  const statusLabel = (() => {
    switch (session.state) {
      case "idle":
        return "playground.status.idle";
      case "fetching-token":
        return "playground.status.fetchingToken";
      case "connecting":
        return "playground.status.connecting";
      case "connected":
        return "playground.status.connected";
      case "disconnected":
        return "playground.status.disconnected";
      case "error":
        return session.error ?? "playground.status.errorUnknown";
    }
  })();

  return (
    <main className="space-y-6">
      <header className="surface rounded-lg p-4">
        <h1 className="text-xl font-bold">
          <T k="playground.h1" />
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          <T k="playground.body" />{" "}
          <code className="kbd">@earendil-works/pi-coding-agent</code>{" "}
          <T k="playground.bodyWs" /> <code className="kbd">pi --mode rpc</code>{" "}
          <T k="playground.bodySpawn" />
        </p>
      </header>

      <section className="surface rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
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
          <span className="text-sm">
            <T k={statusLabel} />
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.state === "connected" ? (
            <>
              <button
                type="button"
                onClick={handleNewSession}
                disabled={sending}
                className="btn secondary"
              >
                <T k="playground.action.newSession" />
              </button>
              <button
                type="button"
                onClick={handleAbort}
                disabled={sending}
                className="btn danger"
              >
                <T k="playground.action.abort" />
              </button>
              <button
                type="button"
                onClick={session.disconnect}
                className="btn secondary"
              >
                <T k="playground.action.disconnect" />
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
              <T k="playground.action.connect" />
            </button>
          )}
        </div>
      </section>

      <section className="surface rounded-lg p-4 space-y-3">
        <label className="block">
          <span className="section-h2">
            <T k="playground.prompt.label" />
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={session.state !== "connected" || sending}
            placeholder={t("playground.prompt.placeholder")}
            rows={3}
            className="mt-2 w-full surface-2 rounded px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]"
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
            <T k="playground.action.send" />
          </button>
          {lastError && (
            <span className="text-sm text-[var(--error)]">{lastError}</span>
          )}
        </div>
      </section>

      <section className="surface rounded-lg p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="section-h2">
            <T k="playground.events.title" /> ({session.events.length})
          </h2>
          {session.events.length > 0 && (
            <button
              type="button"
              onClick={() => session.events.length && location.reload()}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <T k="playground.events.clear" />
            </button>
          )}
        </div>
        <div
          ref={logRef}
          className="font-mono text-xs space-y-1 max-h-[480px] overflow-y-auto bg-[var(--surface-2)] rounded p-3"
        >
          {session.events.length === 0 ? (
            <p className="text-[var(--text-muted)] italic">
              {session.state === "connected" ? (
                <T k="playground.events.emptyConnected" />
              ) : (
                <T k="playground.events.emptyDisconnected" />
              )}
            </p>
          ) : (
            session.events.map((e) => {
              // Stable key: timestamp + type + monotonic counter.
              // Avoids the "array index as key" anti-pattern
              // (re-renders would lose focus / animations).
              const key = `${e.event.type}-${++eventCounter.current}`;
              return (
                <div key={key} className="flex gap-3">
                  <span className="text-[var(--text-muted)] shrink-0 text-[10px]">
                    {eventCounter.current.toString().padStart(3, " ")}
                  </span>
                  <span className="text-[var(--accent)] shrink-0">
                    {e.event.type}
                  </span>
                  <span className="text-[var(--text-muted)] truncate">
                    {summarizeEvent(e)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * Pick the most informative field out of an event's payload for the
 * one-line log row. Pi events have wildly different shapes
 * (agent_start, message, tool_execution_start, etc.) — we just
 * show whatever non-type field is most useful.
 *
 * Uses `safeStringify` (try/catch around JSON.stringify) so a
 * circular `args` reference doesn't crash the log renderer.
 */
function summarizeEvent(e: { event: Record<string, unknown> }): string {
  const ev = e.event;
  // Common patterns first.
  if (typeof ev.message === "string") return ev.message.slice(0, 200);
  if (typeof ev.text === "string") return ev.text.slice(0, 200);
  if (typeof ev.toolName === "string")
    return `${ev.toolName}${ev.args ? " " + safeStringify(ev.args, 80) : ""}`;
  if (typeof ev.command === "string") return ev.command;
  if (typeof ev.error === "string") return `error: ${ev.error}`;
  // Fallback: show all non-type fields joined.
  const rest = Object.entries(ev).filter(([k]) => k !== "type");
  if (rest.length === 0) return "";
  return rest
    .map(
      ([k, v]) =>
        `${k}=${typeof v === "string" ? v.slice(0, 60) : safeStringify(v, 60)}`,
    )
    .join(" ");
}
