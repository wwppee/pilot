"use server";

/**
 * Pilot server actions — for Web UI write operations.
 *
 * These wrap pilot server calls that need CSRF + the auth token.
 * Browser never talks to pilot directly; the Next.js server proxies
 * with the right credentials.
 *
 * The top-level `'use server'` makes every export a Server Action —
 * the form `<form action={fn}>` posts to this file's auto-generated
 * handler.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pilotWithCsrf } from "./pilot";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Install a pack by npm name. */
export async function installPack(name: string): Promise<ActionResult> {
  try {
    const res = await pilotWithCsrf("/packs/install", {
      method: "POST",
      body: JSON.stringify({ source: `npm:${name}` }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || res.statusText };
    }
    revalidatePath("/packages");
    revalidatePath(`/packages/${name}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Uninstall a pack by npm name. v0.4.12 — completes the CRUD loop.
 * (Install was always available; uninstall was the missing half.)
 */
export async function uninstallPack(name: string): Promise<ActionResult> {
  try {
    const res = await pilotWithCsrf("/packs/uninstall", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || res.statusText };
    }
    revalidatePath("/packages");
    revalidatePath(`/packages/${name}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * v0.4.12: create-or-update a ToolPolicy (used by the "new policy"
 * form on /policy to seed a starter template). Mirrors the server's
 * PUT /policies/:name endpoint — setPolicy is upsert.
 */
export async function setPolicy(
  name: string,
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const res = await pilotWithCsrf(`/policies/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || res.statusText };
    }
    revalidatePath("/policy");
    revalidatePath(`/policy/${name}/edit`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Create or update a profile (merge input into existing). */
export async function saveProfile(
  name: string,
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const res = await pilotWithCsrf(
      `/profiles/${encodeURIComponent(name).replace(/%40/g, "@")}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || res.statusText };
    }
    revalidatePath("/profiles");
    revalidatePath(`/profiles/${name}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Delete a profile by name. */
export async function deleteProfile(name: string): Promise<ActionResult> {
  try {
    const res = await pilotWithCsrf(
      `/profiles/${encodeURIComponent(name).replace(/%40/g, "@")}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || res.statusText };
    }
    revalidatePath("/profiles");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Form-friendly wrappers — accept FormData, used by <form action={…}>. */

export async function installPackForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;
  const result = await installPack(name);
  if (result.ok) {
    redirect(`/packages/${name}?installed=1`);
  } else {
    redirect(`/packages/${name}?error=${encodeURIComponent(result.error)}`);
  }
}

/**
 * v0.4.12: uninstall form action — mirrors installPackForm. On
 * success redirects with `?uninstalled=1`; on failure uses the
 * existing `?error=` query param so the existing error banner
 * renders it.
 */
export async function uninstallPackForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;
  const result = await uninstallPack(name);
  if (result.ok) {
    redirect(`/packages/${name}?uninstalled=1`);
  } else {
    redirect(`/packages/${name}?error=${encodeURIComponent(result.error)}`);
  }
}

/**
 * v0.4.12: create a new ToolPolicy from a starter template.
 * Templates are small starter rule sets so users get something
 * sensible out of the box rather than a blank page. After creation,
 * redirects to the edit page so they can refine.
 */
export async function createPolicyForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;
  const template = formData.get("template");
  if (typeof template !== "string") return;

  // Starter templates — picked to be useful defaults, not exhaustive.
  const input: Record<string, unknown> = (() => {
    switch (template) {
      case "safe-bash":
        return {
          description:
            "Sane defaults for bash — block destructive patterns and require approval for risky ones.",
          deny: ["shell-wrapper"],
          denyCommands: ["^\\s*rm\\s+-rf\\s+/\\s*$"],
          denyPaths: ["**/.env", "**/.env.*", "**/secrets/**"],
          requireApproval: ["bash", "write"],
        };
      case "readonly":
        return {
          description: "Read-only — deny every tool that mutates.",
          deny: ["bash", "write", "edit"],
        };
      case "empty":
      default:
        return {
          description: "Empty starter — fill in the rules on the next page.",
        };
    }
  })();

  const result = await setPolicy(name, input as never);
  if (result.ok) {
    redirect(`/policy/${name}/edit?created=1`);
  } else {
    redirect(`/policy?error=${encodeURIComponent(result.error)}`);
  }
}

export async function saveProfileForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;

  const input: Record<string, unknown> = {};
  // v0.5.6: also forward provider + description (newly supported
  // in core's ProfileSchema). Without these, model + packages still
  // saved but provider was silently dropped and the Web form had
  // to lie about what it could persist.
  const provider = formData.get("provider");
  if (typeof provider === "string" && provider.trim().length > 0) {
    input["provider"] = provider.trim();
  }
  const model = formData.get("model");
  if (typeof model === "string" && model.trim().length > 0) {
    input["model"] = model.trim();
  }
  const thinking = formData.get("thinking");
  if (typeof thinking === "string" && thinking.trim().length > 0) {
    input["thinking"] = thinking.trim();
  }
  const packages = formData.get("packages");
  if (typeof packages === "string" && packages.trim().length > 0) {
    input["packages"] = packages
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
  const description = formData.get("description");
  if (typeof description === "string" && description.trim().length > 0) {
    input["description"] = description.trim();
  }
  const notes = formData.get("notes");
  if (typeof notes === "string" && notes.trim().length > 0) {
    input["notes"] = notes.trim();
  }

  const result = await saveProfile(name, input);
  if (result.ok) {
    redirect(`/profiles/${name}?saved=1`);
  } else {
    redirect(`/profiles/${name}?error=${encodeURIComponent(result.error)}`);
  }
}

export async function createProfileForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;

  // v0.4.13: when `/profiles?from=<sessionId>` pre-fills the form,
  // the hidden `model` field is populated from the session template.
  // We forward it as the initial profile model so the new profile
  // matches the session's model without the user retyping.
  //
  // Tool names are *informational* — shown in the pre-fill banner as
  // a hint, but not persisted to profile TOML (Profile TOML doesn't
  // have a tools field). Users who want a specific tool allow-list
  // should create a policy after the profile is in place.
  const input: Record<string, unknown> = {};
  const model = formData.get("model");
  if (typeof model === "string" && model.length > 0) {
    input.model = model;
  }

  const result = await saveProfile(name, input);
  if (result.ok) {
    redirect(`/profiles/${name}?created=1`);
  } else {
    redirect(`/profiles?error=${encodeURIComponent(result.error)}`);
  }
}

export async function deleteProfileForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;
  await deleteProfile(name);
  redirect("/profiles");
}

// ─── Forge (v0.4.14+) ────────────────────────────────────────

/**
 * v0.4.14: absorb a package into a Capability via the Web.
 *
 * On success → redirect to /capabilities/[id]?absorbed=1.
 * On failure → redirect to /forge/[name]?error=… with a code so the
 * page can render the right banner (404 / 400 invalid-id / 422 schema).
 */
export async function forgeAbsorbForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  const asIdRaw = formData.get("asId");
  if (typeof name !== "string") return;
  const asId =
    typeof asIdRaw === "string" && asIdRaw.trim().length > 0
      ? asIdRaw.trim()
      : undefined;

  const res = await pilotWithCsrf("/forge/absorb", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, asId }),
  });

  if (res.ok) {
    const body = (await res.json()) as { id?: string };
    const id = body.id ?? "unknown";
    redirect(`/capabilities/${id}?absorbed=1`);
  } else {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    const err = body.error ?? `absorb failed (${res.status})`;
    const code = body.code ?? "io";
    redirect(
      `/forge/${encodeURIComponent(name)}?error=${encodeURIComponent(err)}&code=${encodeURIComponent(code)}`,
    );
  }
}

// ─── Avatars (v0.5+) ─────────────────────────────────────────

/**
 * v0.5.0: capture the current Pilot state into an Avatar for the
 * encoded cwd. Redirects to /avatars?captured=1&cwd=<id> on success
 * or to /avatars?error=… on failure.
 */
export async function captureAvatarForm(formData: FormData): Promise<void> {
  const cwd = formData.get("cwd");
  if (typeof cwd !== "string" || cwd.length === 0) return;

  const res = await pilotWithCsrf(
    `/avatars/${encodeURIComponent(cwd)}/capture`,
    {
      method: "POST",
    },
  );

  if (res.ok) {
    redirect(`/avatars?captured=1&cwd=${encodeURIComponent(cwd)}`);
  } else {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    redirect(
      `/avatars?error=${encodeURIComponent(body.error ?? "capture failed")}`,
    );
  }
}

/**
 * v0.5.0: delete an Avatar by encoded cwd. Redirects to
 * /avatars?deleted=1 on success or ?error=… on failure.
 */
export async function deleteAvatarForm(formData: FormData): Promise<void> {
  // <DeleteButton> sends hidden "name" — accept either "name" or "cwd".
  const cwd = formData.get("cwd") ?? formData.get("name");
  if (typeof cwd !== "string" || cwd.length === 0) return;

  const res = await pilotWithCsrf(`/avatars/${encodeURIComponent(cwd)}`, {
    method: "DELETE",
  });

  if (res.ok) {
    redirect(`/avatars?deleted=1&cwd=${encodeURIComponent(cwd)}`);
  } else {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    redirect(
      `/avatars?error=${encodeURIComponent(body.error ?? "delete failed")}`,
    );
  }
}

/**
 * v0.5.2: apply an Avatar. Returns the report via the URL so the
 * detail page can render the success/failure summary without an
 * extra fetch. On error, redirects back with `?error=…`.
 */
export async function applyAvatarForm(formData: FormData): Promise<void> {
  const cwd = formData.get("cwd");
  if (typeof cwd !== "string" || cwd.length === 0) return;

  const res = await pilotWithCsrf(`/avatars/${encodeURIComponent(cwd)}/apply`, {
    method: "POST",
  });

  if (res.ok) {
    const report = (await res.json()) as {
      installed: string[];
      activated?: string;
      skipped: string[];
      failed: string[];
    };
    const summary = JSON.stringify(report);
    redirect(
      `/avatars/${encodeURIComponent(cwd)}?applied=1&report=${encodeURIComponent(summary)}`,
    );
  } else {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    redirect(
      `/avatars/${encodeURIComponent(cwd)}?error=${encodeURIComponent(body.error ?? "apply failed")}`,
    );
  }
}

/**
 * v0.5.3: dry-run variant of applyAvatarForm. Same shape, same
 * report, same redirect — but the `?dry=1` query flag tells the server
 * to skip every side-effect. The /avatars/[cwd] page detects `dry=1`
 * in the report (and `applied=1` in the URL) and switches the banner
 * to "(dry run — no changes made)".
 *
 * Kept separate from applyAvatarForm so the UI can offer it as its
 * own button without needing a client component to switch behavior.
 */
export async function dryRunAvatarForm(formData: FormData): Promise<void> {
  const cwd = formData.get("cwd");
  if (typeof cwd !== "string" || cwd.length === 0) return;

  const res = await pilotWithCsrf(
    `/avatars/${encodeURIComponent(cwd)}/apply?dry=1`,
    { method: "POST" },
  );

  if (res.ok) {
    const report = (await res.json()) as {
      installed: string[];
      activated?: string;
      skipped: string[];
      failed: string[];
    };
    const summary = JSON.stringify(report);
    redirect(
      `/avatars/${encodeURIComponent(cwd)}?applied=1&dry=1&report=${encodeURIComponent(summary)}`,
    );
  } else {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    redirect(
      `/avatars/${encodeURIComponent(cwd)}?error=${encodeURIComponent(body.error ?? "dry run failed")}`,
    );
  }
}
