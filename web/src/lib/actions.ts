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

export async function saveProfileForm(formData: FormData): Promise<void> {
  const name = formData.get("name");
  if (typeof name !== "string") return;

  const input: Record<string, unknown> = {};
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
  const result = await saveProfile(name, {});
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
