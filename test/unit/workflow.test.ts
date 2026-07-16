/**
 * v0.7.0: unit tests for the workflow persistence core.
 *
 * Same shape as `compose-boards.test.ts` — we exercise the
 * real filesystem under a fake `$HOME` so the schema's
 * "kebab-case id" check, atomic write, and createdAt /
 * updatedAt handling all run end-to-end. The test covers
 * the round-trip path: list empty → save one → list shows
 * it → load returns it → save again preserves createdAt →
 * delete removes it.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteWorkflow,
  isValidWorkflowId,
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  type WorkflowInput,
} from "../../src/core/workflow.js";

let fakeHome: string;

beforeEach(async () => {
  fakeHome = await mkdtemp(join(tmpdir(), "pilot-workflow-test-"));
});

afterEach(async () => {
  await rm(fakeHome, { recursive: true, force: true });
});

function sampleInput(id: string): WorkflowInput {
  return {
    id,
    name: "Research a library",
    description: "Read README, summarise API, suggest tests",
    version: 1,
    nodes: [
      {
        id: "n1",
        name: "Read README",
        kind: "step",
        model: { provider: "anthropic", model: "claude-haiku-4-5" },
        systemPrompt: "Read the README and extract the API surface.",
        inputTemplate: "",
        outputVar: "readme",
        tools: ["read_file"],
        onFailure: "stop",
        position: { x: 0, y: 0 },
      },
      {
        id: "n2",
        name: "Suggest tests",
        kind: "step",
        model: { provider: "anthropic", model: "claude-sonnet-4-5" },
        systemPrompt: "Given the API, suggest 3-5 tests.",
        inputTemplate: "{{steps.n1.outputVar}}",
        outputVar: "tests",
        tools: [],
        onFailure: "retry",
        retryCount: 2,
        position: { x: 240, y: 0 },
      },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2" }],
  };
}

describe("v0.7.0: workflow persistence", () => {
  it("accepts a kebab-case id and rejects anything else", () => {
    expect(isValidWorkflowId("research-and-test")).toBe(true);
    expect(isValidWorkflowId("Research-And-Test")).toBe(false);
    expect(isValidWorkflowId("research_and_test")).toBe(false);
    expect(isValidWorkflowId("../etc/passwd")).toBe(false);
    expect(isValidWorkflowId("")).toBe(false);
    expect(isValidWorkflowId("a".repeat(65))).toBe(false);
  });

  it("starts with an empty list when ~/.pilot/workflows doesn't exist", async () => {
    expect(await listWorkflows(fakeHome)).toEqual([]);
    expect(await loadWorkflow("anything", fakeHome)).toBeNull();
  });

  it("save → load round-trips a workflow with full schema", async () => {
    const input = sampleInput("research-and-test");
    const saved = await saveWorkflow(input, fakeHome);
    expect(saved.id).toBe("research-and-test");
    expect(saved.metadata.createdAt).toBeTruthy();
    expect(saved.metadata.updatedAt).toBeTruthy();
    // The two should be equal at first save.
    expect(saved.metadata.createdAt).toBe(saved.metadata.updatedAt);
    expect(saved.nodes).toHaveLength(2);
    expect(saved.edges).toHaveLength(1);

    const loaded = await loadWorkflow("research-and-test", fakeHome);
    expect(loaded).toEqual(saved);
  });

  it("preserves createdAt across saves (only updatedAt advances)", async () => {
    const input = sampleInput("research-and-test");
    const first = await saveWorkflow(input, fakeHome);
    // Sleep a tick so updatedAt is strictly later than createdAt.
    await new Promise((r) => setTimeout(r, 10));
    const second = await saveWorkflow(
      { ...input, name: "Updated name" },
      fakeHome,
    );
    expect(second.metadata.createdAt).toBe(first.metadata.createdAt);
    expect(second.metadata.updatedAt > first.metadata.updatedAt).toBe(true);
    expect(second.name).toBe("Updated name");
  });

  it("listWorkflows returns summaries with the right counts", async () => {
    await saveWorkflow(sampleInput("a-flow"), fakeHome);
    await saveWorkflow(sampleInput("b-flow"), fakeHome);
    const summaries = await listWorkflows(fakeHome);
    expect(summaries).toHaveLength(2);
    // Newest first.
    expect(summaries[0]?.id).toBe("b-flow");
    expect(summaries[0]?.nodeCount).toBe(2);
    expect(summaries[0]?.edgeCount).toBe(1);
    expect(summaries[1]?.id).toBe("a-flow");
  });

  it("skips files that aren't valid id directories", async () => {
    // Manually create a non-conforming directory inside
    // ~/.pilot/workflows to make sure listWorkflows doesn't
    // crash on it.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(fakeHome, "workflows", "not-a-valid-id"), {
      recursive: true,
    });
    await saveWorkflow(sampleInput("real-flow"), fakeHome);
    const summaries = await listWorkflows(fakeHome);
    expect(summaries.map((s) => s.id)).toEqual(["real-flow"]);
  });

  it("deleteWorkflow removes the directory and is idempotent", async () => {
    await saveWorkflow(sampleInput("to-delete"), fakeHome);
    expect(await deleteWorkflow("to-delete", fakeHome)).toBe(true);
    expect(await loadWorkflow("to-delete", fakeHome)).toBeNull();
    // Second call is a no-op (returns false, not throws).
    expect(await deleteWorkflow("to-delete", fakeHome)).toBe(false);
  });

  it("saveWorkflow rejects an invalid id at the boundary", async () => {
    await expect(
      saveWorkflow(sampleInput("../escape"), fakeHome),
    ).rejects.toThrow();
  });

  it("loadWorkflow returns null on an invalid id without throwing", async () => {
    expect(await loadWorkflow("../escape", fakeHome)).toBeNull();
  });
});
