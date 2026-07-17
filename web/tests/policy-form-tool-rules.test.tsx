/**
 * v0.8.6: RTL test for the per-tool rules editor inside
 * `<PolicyForm>`. v0.8.0 added the `toolRules` schema,
 * v0.8.4 added the read-only viewer on the policy list;
 * v0.8.6 makes it editable from the form, which closes
 * the B1 governance loop.
 *
 * Scope: 5 tests covering the new user-facing surface:
 *   1. Empty state — no rows when the policy has no
 *      `toolRules`; the empty hint renders.
 *   2. Pre-populated rows — rows render in the order
 *      returned by `Object.entries(toolRules)`.
 *   3. Add row — clicking "+ Add per-tool rule" appends
 *      an empty row.
 *   4. Edit + save — filling a row's tool name + 4
 *      sub-fields and submitting the form calls
 *      `api.setPolicy` with the per-tool rules shaped as
 *      `Record<tool, PerToolRule>`.
 *   5. Remove row — clicking the remove button on a
 *      pre-existing row drops it; saving sends `{}`.
 *   6. All-empty sub-fields — a row with a tool name
 *      but no sub-fields is dropped on save (avoids
 *      persisting empty overrides).
 *
 * a11y / state plumbing (busy / disabled / aria labels)
 * is exercised through these flows. The per-component
 * `<NodeFields>` / `<ConfirmDialog>` style tests are
 * intentionally NOT used here because the per-tool rule
 * editor is integrated into the existing form; we test
 * through the public form surface instead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/components/I18n";

vi.mock("@/lib/pilot-browser", () => ({
  api: {
    setPolicy: vi.fn(),
    applyPolicy: vi.fn(),
    unapplyPolicy: vi.fn(),
    deletePolicy: vi.fn(),
  },
}));
import { api } from "@/lib/pilot-browser";
const mockSetPolicy = vi.mocked(api.setPolicy);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import PolicyForm from "../src/app/policy/[name]/edit/PolicyForm";
import type { ToolPolicy } from "../src/lib/types";

function makePolicy(overrides: Partial<ToolPolicy> = {}): ToolPolicy {
  return {
    name: "test-policy",
    description: "Test policy for per-tool rules",
    allow: [],
    deny: [],
    denyPaths: [],
    denyCommands: [],
    sensitivePatterns: [],
    requireApproval: [],
    toolRules: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderForm(policy: ToolPolicy) {
  return render(
    <I18nProvider initialLocale="en">
      <PolicyForm initialPolicy={policy} />
    </I18nProvider>,
  );
}

function clickSave(): void {
  // The save button is the form's primary submit. Its
  // visible text is locale-dependent ("Save changes" /
  // "Saved" / "保存修改" / "已保存") and is also driven
  // by dirty state, so we grab the button by `type="submit"`
  // rather than by name. The form has only one such button.
  const btn = document.querySelector<HTMLButtonElement>(
    'form.policy-edit-form button[type="submit"]',
  );
  if (!btn) throw new Error("save button not found");
  fireEvent.click(btn);
}

beforeEach(() => {
  mockSetPolicy.mockReset();
  mockSetPolicy.mockResolvedValue(makePolicy());
});

describe("v0.8.6: <PolicyForm> per-tool rules editor", () => {
  it("renders the empty state when toolRules is {}", () => {
    renderForm(makePolicy({ toolRules: {} }));
    expect(screen.getByTestId("policy-tool-rules-section")).toBeTruthy();
    expect(screen.getByTestId("policy-tool-rules-empty")).toBeTruthy();
  });

  it("pre-populates rows from initialPolicy.toolRules", () => {
    renderForm(
      makePolicy({
        toolRules: {
          bash: {
            deny: ["ls /etc"],
            requireApproval: [],
            denyPaths: [],
            denyCommands: [],
          },
          write: {
            deny: [],
            requireApproval: ["*"],
            denyPaths: ["**/.env"],
            denyCommands: [],
          },
        },
      }),
    );
    // Two rows rendered. Their tool names appear in the
    // per-row input fields.
    expect(screen.getByTestId("policy-tool-rule-row-0")).toBeTruthy();
    expect(screen.getByTestId("policy-tool-rule-row-1")).toBeTruthy();
    expect(
      (screen.getByTestId("policy-tool-rule-tool-0") as HTMLInputElement)
        .value,
    ).toBe("bash");
    expect(
      (screen.getByTestId("policy-tool-rule-tool-1") as HTMLInputElement)
        .value,
    ).toBe("write");
    // The bash row's deny sub-field is "ls /etc".
    expect(
      (screen.getByTestId("policy-tool-rule-deny-0") as HTMLTextAreaElement)
        .value,
    ).toBe("ls /etc");
  });

  it("adds an empty row when '+ Add per-tool rule' is clicked", () => {
    renderForm(makePolicy({ toolRules: {} }));
    expect(screen.queryByTestId("policy-tool-rule-row-0")).toBeNull();
    fireEvent.click(screen.getByTestId("policy-tool-rule-add"));
    expect(screen.getByTestId("policy-tool-rule-row-0")).toBeTruthy();
    // The new row's tool input is empty by default.
    expect(
      (screen.getByTestId("policy-tool-rule-tool-0") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("persists per-tool rules on save (Record<tool, PerToolRule>)", async () => {
    renderForm(makePolicy({ toolRules: {} }));
    fireEvent.click(screen.getByTestId("policy-tool-rule-add"));
    fireEvent.change(screen.getByTestId("policy-tool-rule-tool-0"), {
      target: { value: "bash" },
    });
    fireEvent.change(screen.getByTestId("policy-tool-rule-deny-0"), {
      target: { value: "rm -rf\nmkfs" },
    });
    fireEvent.change(
      screen.getByTestId("policy-tool-rule-requireApproval-0"),
      { target: { value: "*" } },
    );
    clickSave();
    await waitFor(() => {
      expect(mockSetPolicy).toHaveBeenCalledTimes(1);
    });
    const [name, input] = mockSetPolicy.mock.calls[0]!;
    expect(name).toBe("test-policy");
    expect(input.toolRules).toEqual({
      bash: {
        deny: ["rm -rf", "mkfs"],
        requireApproval: ["*"],
        denyPaths: [],
        denyCommands: [],
      },
    });
  });

  it("removes a pre-existing row when the remove button is clicked", async () => {
    renderForm(
      makePolicy({
        toolRules: {
          bash: {
            deny: ["ls /etc"],
            requireApproval: [],
            denyPaths: [],
            denyCommands: [],
          },
        },
      }),
    );
    expect(screen.getByTestId("policy-tool-rule-row-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("policy-tool-rule-remove-0"));
    // After removal, the empty state is back.
    await waitFor(() => {
      expect(screen.getByTestId("policy-tool-rules-empty")).toBeTruthy();
    });
    clickSave();
    await waitFor(() => {
      expect(mockSetPolicy).toHaveBeenCalled();
    });
    const [, input] = mockSetPolicy.mock.calls[0]!;
    expect(input.toolRules).toEqual({});
  });

  it("drops a row with a tool name but all-empty sub-fields on save", async () => {
    // A row with a tool name but no actual rules is noise —
    // the form skips it on save so the persisted TOML stays
    // clean (the global rules already cover that tool).
    renderForm(makePolicy({ toolRules: {} }));
    fireEvent.click(screen.getByTestId("policy-tool-rule-add"));
    fireEvent.change(screen.getByTestId("policy-tool-rule-tool-0"), {
      target: { value: "read" },
    });
    // No sub-fields filled in.
    clickSave();
    await waitFor(() => {
      expect(mockSetPolicy).toHaveBeenCalled();
    });
    const [, input] = mockSetPolicy.mock.calls[0]!;
    expect(input.toolRules).toEqual({});
  });
});
