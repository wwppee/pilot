/**
 * chat-stream tests — verify the streaming reducer turns pi's raw
 * event stream into a chat-shaped message list.
 *
 * v0.5.15: the new /try page uses this reducer to render user +
 * assistant bubbles + tool calls. Tests cover the key transitions:
 *   - text_delta accumulation into a streaming block
 *   - thinking_delta accumulation (separate block)
 *   - toolcall_start/end paired with tool_execution_start/end
 *   - message_end flips status to "complete"
 */

import { describe, it, expect } from "vitest";
import {
  reduceStream,
  userMessage,
  type ChatMessage,
} from "../src/lib/chat-stream";

function findText(msg: ChatMessage, idx = 0): string {
  const block = msg.blocks[idx];
  if (!block || block.type !== "text") throw new Error(`block ${idx} not text`);
  return block.text;
}

function findThinking(msg: ChatMessage, idx = 0): string {
  const block = msg.blocks[idx];
  if (!block || block.type !== "thinking")
    throw new Error(`block ${idx} not thinking`);
  return block.text;
}

describe("reduceStream", () => {
  it("accumulates text deltas into a single streaming block", () => {
    const messages = reduceStream([
      { type: "message_start", message: { role: "assistant", timestamp: 1 } },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_start",
          contentIndex: 0,
        },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Hello",
        },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: ", world",
        },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_end",
          contentIndex: 0,
          content: "Hello, world",
        },
      },
      { type: "message_end", message: { role: "assistant" } },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("assistant");
    expect(messages[0]!.status).toBe("complete");
    expect(findText(messages[0]!)).toBe("Hello, world");
  });

  it("keeps thinking and text in separate blocks", () => {
    const messages = reduceStream([
      { type: "message_start", message: { role: "assistant", timestamp: 2 } },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "thinking_delta",
          contentIndex: 0,
          delta: "Let me think...",
        },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "thinking_delta",
          contentIndex: 0,
          delta: " more",
        },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: { type: "text_start", contentIndex: 1 },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 1,
          delta: "Answer: 42",
        },
      },
      { type: "message_end", message: { role: "assistant" } },
    ]);
    expect(messages[0]!.blocks).toHaveLength(2);
    expect(findThinking(messages[0]!, 0)).toBe("Let me think... more");
    expect(findText(messages[0]!, 1)).toBe("Answer: 42");
  });

  it("tracks tool calls through start/update/end", () => {
    const messages = reduceStream([
      { type: "message_start", message: { role: "assistant", timestamp: 3 } },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: 0,
        },
      },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: { id: "tc_1", name: "bash", arguments: { cmd: "ls" } },
        },
      },
      {
        type: "tool_execution_start",
        toolCallId: "tc_1",
        toolName: "bash",
        args: { cmd: "ls" },
      },
      {
        type: "tool_execution_end",
        toolCallId: "tc_1",
        toolName: "bash",
        result: "file.txt\n",
        isError: false,
      },
      { type: "message_end", message: { role: "assistant" } },
    ]);
    const tcBlock = messages[0]!.blocks[0]!;
    expect(tcBlock.type).toBe("toolCall");
    if (tcBlock.type !== "toolCall") throw new Error();
    expect(tcBlock.id).toBe("tc_1");
    expect(tcBlock.name).toBe("bash");
    expect(tcBlock.status).toBe("complete");
    expect(tcBlock.result).toBe("file.txt\n");
    expect(tcBlock.isError).toBe(false);
  });

  it("marks message as 'streaming' while updates arrive", () => {
    const messages = reduceStream([
      { type: "message_start", message: { role: "assistant", timestamp: 4 } },
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "partial",
        },
      },
    ]);
    expect(messages[0]!.status).toBe("streaming");
    expect(findText(messages[0]!)).toBe("partial");
  });

  it("ignores unknown event types and lifecycle events", () => {
    const messages = reduceStream([
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "turn_end", message: { role: "assistant" } },
      { type: "agent_end", messages: [] },
      { type: "garbage_event", foo: 42 },
    ]);
    expect(messages).toHaveLength(0);
  });

  it("userMessage() produces a complete user bubble", () => {
    const u = userMessage("hi");
    expect(u.role).toBe("user");
    expect(u.status).toBe("complete");
    expect(u.blocks[0]).toEqual({ type: "text", text: "hi" });
  });
});
