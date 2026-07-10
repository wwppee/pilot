/**
 * chat-stream — turn pi's raw event stream into a chat-shaped model.
 *
 * pi emits an `AgentEvent` stream (agent_start, turn_start,
 * message_start/update/end, tool_execution_start/update/end). For
 * the chat UI we want a simpler model:
 *
 *   ChatMessage = { id, role, blocks: ContentBlock[], status }
 *
 * with `ContentBlock` ∈ { text, thinking, toolCall } where each
 * block carries its own streaming state. The reducer is pure: given
 * an array of events, return the resulting message list. Callers
 * re-run the reducer on every new event (cheap; messages are small).
 *
 * v0.5.15: rebuilt the `/try` page around this. Previously the
 * playground just dumped events as raw JSON; the chat UI lives
 * inside the `ChatMessage` model produced here.
 *
 * IMPORTANT: types below are intentionally loose-typed — pi's full
 * `AgentEvent` lives in `@earendil-works/pi-coding-agent` (Node
 * only), and we don't want to pull that into the browser bundle.
 * We narrow as we go.
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "toolCall";
      id: string;
      name: string;
      args?: unknown;
      partialResult?: unknown;
      result?: unknown;
      isError?: boolean;
      status: "streaming" | "executing" | "complete";
    };

export type ChatMessage = {
  /** Stable id. For pi messages we use the message timestamp; for
   * synthetic (user) messages we synthesize one from the prompt. */
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  blocks: ContentBlock[];
  /** "streaming" while message_update events are still arriving,
   * "complete" once message_end arrives (or "aborted" if the turn
   * was cut short). */
  status: "streaming" | "complete" | "aborted";
  timestamp: number;
  /** LLM provider / model for assistant messages. */
  provider: string;
  model: string;
};

/**
 * Loose event shape — narrowed from pi's AgentEvent. The unknown
 * fields let us work without importing pi's SDK into the browser
 * bundle.
 */
type StreamEvent = {
  type: string;
  message?: {
    role?: string;
    timestamp?: number;
    provider?: string;
    model?: string;
    content?: Array<{
      type?: string;
      text?: string;
      thinking?: string;
      id?: string;
      name?: string;
      arguments?: unknown;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  };
  /** agent_end payload — array of messages after the agent finished. */
  messages?: unknown[];
  assistantMessageEvent?: {
    type: string;
    contentIndex?: number;
    delta?: string;
    content?: string;
    toolCall?: {
      id?: string;
      name?: string;
      arguments?: unknown;
    };
    [k: string]: unknown;
  };
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  partialResult?: unknown;
  result?: unknown;
  isError?: boolean;
  /** Loose catch-all for any other fields we don't model. */
  [k: string]: unknown;
};

/** Build a brand-new message list from a snapshot of events. */
export function reduceStream(events: StreamEvent[]): ChatMessage[] {
  const out: ChatMessage[] = [];

  /** Helper: most recent assistant message (still streaming). */
  const lastAssistant = () =>
    out.length > 0 && out[out.length - 1]!.role === "assistant"
      ? out[out.length - 1]
      : null;

  for (const ev of events) {
    switch (ev.type) {
      case "message_start": {
        const m = ev.message;
        if (!m) break;
        const role = (m.role ?? "assistant") as ChatMessage["role"];
        const id = `msg-${m.timestamp ?? out.length}-${out.length}`;
        out.push({
          id,
          role,
          blocks: [],
          status: "streaming",
          timestamp: typeof m.timestamp === "number" ? m.timestamp : 0,
          provider: typeof m.provider === "string" ? m.provider : "",
          model: typeof m.model === "string" ? m.model : "",
        });
        break;
      }
      case "message_update": {
        const ame = ev.assistantMessageEvent;
        const msg = lastAssistant();
        if (!msg || !ame) break;
        applyAssistantEvent(msg, ame);
        break;
      }
      case "message_end": {
        const msg = out.find((m) => m.status === "streaming");
        if (msg) msg.status = "complete";
        break;
      }
      case "tool_execution_start": {
        // A new tool call starts executing — upsert into the most
        // recent assistant message's blocks (the assistant turn
        // that issued the call).
        const msg = lastAssistant();
        if (!msg || !ev.toolCallId) break;
        const idx = msg.blocks.findIndex(
          (b) => b.type === "toolCall" && b.id === ev.toolCallId,
        );
        const block: ContentBlock = {
          type: "toolCall",
          id: ev.toolCallId,
          name: ev.toolName ?? "",
          args: ev.args,
          status: "executing",
        };
        if (idx >= 0) {
          msg.blocks[idx] = { ...msg.blocks[idx], ...block };
        } else {
          msg.blocks.push(block);
        }
        break;
      }
      case "tool_execution_update": {
        const msg = lastAssistant();
        if (!msg || !ev.toolCallId) break;
        const block = msg.blocks.find(
          (b) => b.type === "toolCall" && b.id === ev.toolCallId,
        );
        if (block && block.type === "toolCall") {
          block.partialResult = ev.partialResult;
          if (ev.args !== undefined) block.args = ev.args;
        }
        break;
      }
      case "tool_execution_end": {
        const msg = lastAssistant();
        if (!msg || !ev.toolCallId) break;
        const block = msg.blocks.find(
          (b) => b.type === "toolCall" && b.id === ev.toolCallId,
        );
        if (block && block.type === "toolCall") {
          if (ev.result !== undefined) block.result = ev.result;
          block.isError = ev.isError === true;
          block.status = "complete";
        }
        break;
      }
      // agent_start / agent_end / turn_start / turn_end: no UI
      // effect for the chat view (lifecycle is shown via the
      // status pill + connection state elsewhere).
      default:
        break;
    }
  }

  return out;
}

/**
 * Append an AssistantMessageEvent (text_delta / thinking_delta /
 * toolcall_delta / ...) onto the streaming message's blocks.
 *
 * The block at `contentIndex` is created lazily — we don't know
 * what kind of block it is until the first delta arrives. From
 * then on we just append.
 */
function applyAssistantEvent(
  msg: ChatMessage,
  ame: NonNullable<StreamEvent["assistantMessageEvent"]>,
): void {
  const idx = ame.contentIndex ?? 0;
  switch (ame.type) {
    case "text_start":
      ensureBlock(msg, idx, { type: "text", text: "" });
      return;
    case "text_delta":
      ensureBlock(msg, idx, { type: "text", text: "" });
      appendText(msg, idx, ame.delta ?? "");
      return;
    case "text_end":
      // Final content (often already accumulated via deltas) —
      // overwrite in case the SDK sends the full string at the end.
      if (typeof ame.content === "string") {
        setBlock(msg, idx, { type: "text", text: ame.content });
      }
      return;
    case "thinking_start":
      ensureBlock(msg, idx, { type: "thinking", text: "" });
      return;
    case "thinking_delta":
      ensureBlock(msg, idx, { type: "thinking", text: "" });
      appendText(msg, idx, ame.delta ?? "");
      return;
    case "thinking_end":
      if (typeof ame.content === "string") {
        setBlock(msg, idx, { type: "thinking", text: ame.content });
      }
      return;
    case "toolcall_start": {
      const tc = ame.toolCall ?? {};
      ensureBlock(msg, idx, {
        type: "toolCall",
        id: tc.id ?? `tc-${idx}`,
        name: tc.name ?? "",
        args: tc.arguments,
        status: "streaming",
      });
      return;
    }
    case "toolcall_delta": {
      // Pi streams tool args as JSON deltas. We can't safely
      // concatenate JSON fragments without a real parser, so we
      // just remember the latest partial and let the SDK's
      // toolcall_end event deliver the parsed object.
      const block = msg.blocks[idx];
      if (block && block.type === "toolCall" && ame.toolCall) {
        if (ame.toolCall.arguments !== undefined) {
          block.args = ame.toolCall.arguments;
        }
      }
      return;
    }
    case "toolcall_end": {
      const tc = ame.toolCall ?? {};
      const block = msg.blocks[idx];
      if (block && block.type === "toolCall") {
        if (tc.id) block.id = tc.id;
        if (tc.name) block.name = tc.name;
        if (tc.arguments !== undefined) block.args = tc.arguments;
        block.status = "executing";
      } else {
        msg.blocks[idx] = {
          type: "toolCall",
          id: tc.id ?? `tc-${idx}`,
          name: tc.name ?? "",
          args: tc.arguments,
          status: "executing",
        };
      }
      return;
    }
    case "done":
    case "error":
      // The matching `message_end` event flips status to "complete"
      // — we don't change role/blocks here.
      return;
    default:
      // Unknown inner event — ignore (forward-compat).
      return;
  }
}

function ensureBlock(msg: ChatMessage, idx: number, block: ContentBlock): void {
  // Grow the blocks array if needed, padding with empty text blocks
  // so the target slot exists.
  while (msg.blocks.length <= idx) msg.blocks.push({ type: "text", text: "" });
  // Don't clobber an existing block — deltas follow `_start` and
  // re-issuing the same ensure call must not reset accumulated text.
  // Only initialize if the slot is empty text (the padding) or wrong
  // shape entirely (e.g. switched from text → thinking mid-stream).
  const existing = msg.blocks[idx];
  const sameShape =
    existing &&
    ((block.type === "text" && existing.type === "text") ||
      (block.type === "thinking" && existing.type === "thinking") ||
      (block.type === "toolCall" && existing.type === "toolCall"));
  if (!existing || !sameShape) {
    msg.blocks[idx] = block;
  }
}

function setBlock(msg: ChatMessage, idx: number, block: ContentBlock): void {
  while (msg.blocks.length <= idx) msg.blocks.push({ type: "text", text: "" });
  msg.blocks[idx] = block;
}

function appendText(msg: ChatMessage, idx: number, delta: string): void {
  const block = msg.blocks[idx];
  if (!block) return;
  if (block.type === "text" || block.type === "thinking") {
    block.text += delta;
  }
}

/**
 * Build a synthetic user message for display. We don't get a
 * `message_start` event for the user's prompt (pi just echoes the
 * user message into the session), so we synthesize one in the
 * `send()` handler.
 */
export function userMessage(text: string): ChatMessage {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role: "user",
    blocks: [{ type: "text", text }],
    status: "complete",
    timestamp: Date.now(),
    provider: "",
    model: "",
  };
}
