/**
 * /profiles — list all named profiles + create form.
 */
import Link from "next/link";
import { api } from "@/lib/pilot";
import { createProfileForm, deleteProfileForm } from "@/lib/actions";
import { DeleteButton } from "@/components/Buttons";
import type { Profile } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ProfilesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const result = await api.profiles().catch(() => null as Profile[] | null);
  const profiles = (result ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Profiles</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {profiles.length} profile{profiles.length === 1 ? "" : "s"} · stored
          under <code className="kbd">~/.pilot/profiles/</code>
        </p>
      </header>

      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: "var(--error)" }}
        >
          {sp.error}
        </div>
      )}

      <form
        action={createProfileForm}
        className="surface rounded-lg p-4 flex items-end gap-2"
      >
        <label className="flex-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            New profile name (kebab-case)
          </span>
          <input
            name="name"
            type="text"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="my-work"
            required
            className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded text-[var(--bg)]"
          style={{ background: "var(--accent)" }}
        >
          Create
        </button>
      </form>

      {profiles.length === 0 ? (
        <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
          No profiles yet. Use the form above to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <div
              key={p.name}
              className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block relative"
            >
              <Link href={`/profiles/${p.name}`} className="block">
                <h3 className="text-base font-semibold mb-2">{p.name}</h3>
                <div className="space-y-1 text-xs text-[var(--text-muted)]">
                  {p.model && (
                    <div>
                      model: <code className="kbd">{p.model}</code>
                    </div>
                  )}
                  {p.thinking && <div>thinking: {p.thinking}</div>}
                  {p.packages && p.packages.length > 0 && (
                    <div>{p.packages.length} package(s)</div>
                  )}
                </div>
              </Link>
              <div className="absolute top-3 right-3">
                <DeleteButton
                  name={p.name}
                  label="delete"
                  action={deleteProfileForm}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
