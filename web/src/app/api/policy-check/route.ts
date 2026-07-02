/**
 * POST /api/policy-check — dry-run a tool call against a policy.
 *
 * Form-style endpoint (used by the /policy "Try a rule" form).
 * Returns a small HTML snippet so we can stay zero-JS.
 */

import { NextRequest, NextResponse } from "next/server";
import { api, PilotApiError } from "../../../lib/pilot";
import type { PolicyDecision } from "../../../lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const name = String(form.get("name") ?? "");
  const tool = String(form.get("tool") ?? "");
  const argsRaw = String(form.get("args") ?? "{}");

  if (!name || !tool) {
    return NextResponse.json(
      { error: "name and tool are required" },
      { status: 400 },
    );
  }

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsRaw);
  } catch {
    return NextResponse.json(
      { error: "args must be valid JSON" },
      { status: 400 },
    );
  }

  try {
    const { decision } = await api.checkPolicy(name, tool, args);
    return NextResponse.json(decision as PolicyDecision);
  } catch (e) {
    if (e instanceof PilotApiError) {
      return NextResponse.json(
        { error: e.message, status: e.status },
        { status: e.status },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
