/**
 * /profiles/[name] — read-only profile detail with edit form.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import { saveProfileForm, deleteProfileForm } from '@/lib/actions';
import { SubmitButton, DeleteButton } from '@/components/Buttons';
import type { Profile } from '@/lib/types';

interface PageProps {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ saved?: string; created?: string; error?: string }>;
}

export default async function ProfileDetailPage({ params, searchParams }: PageProps) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);
  const decoded = decodeURIComponent(name);

  let profile: Profile | null = null;
  let error: string | null = null;
  try {
    profile = await api.profile(decoded);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('404') || msg.includes('not found')) {
      error = 'not found';
    } else {
      error = msg;
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/profiles">← back to profiles</Link>
      </div>

      {sp.created && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: 'var(--accent-2)' }}
        >
          ✓ Created <code className="kbd">{decoded}</code>.
        </div>
      )}
      {sp.saved && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: 'var(--accent-2)' }}
        >
          ✓ Saved <code className="kbd">{decoded}</code>.
        </div>
      )}
      {sp.error && (
        <div className="surface rounded-lg p-3 text-sm" style={{ color: 'var(--error)' }}>
          {sp.error}
        </div>
      )}

      {error === 'not found' && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          Profile <code className="kbd">{decoded}</code> not found.
        </div>
      )}

      {profile && (
        <>
          <header className="surface rounded-lg p-4">
            <h1 className="text-xl font-bold">{profile.name}</h1>
            {profile.notes && (
              <p className="text-sm text-[var(--text-muted)] mt-2">{profile.notes}</p>
            )}
          </header>

          {/* Edit form */}
          <form action={saveProfileForm} className="surface rounded-lg p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Edit
            </h2>
            <input type="hidden" name="name" value={profile.name} />
            <Field
              label="model"
              placeholder="e.g. claude-opus-4.6"
              defaultValue={profile.model ?? ''}
            />
            <Field
              label="thinking"
              placeholder="low / medium / high"
              defaultValue={profile.thinking ?? ''}
            />
            <Field
              label="packages (comma-separated)"
              placeholder="npm:pi-lens, npm:pi-subagents"
              defaultValue={(profile.packages ?? []).join(', ')}
            />
            <Field
              label="notes"
              placeholder="What is this profile for?"
              defaultValue={profile.notes ?? ''}
              multiline
            />
            <div className="flex gap-2 pt-2">
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              <Link
                href={`/profiles/${profile.name}`}
                className="px-4 py-2 text-sm rounded surface-2 text-[var(--text-muted)]"
              >
                Cancel
              </Link>
            </div>
          </form>

          {/* Current state */}
          {profile.env && Object.keys(profile.env).length > 0 && (
            <div className="surface rounded-lg p-4">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
                env (read-only — edit TOML directly)
              </h2>
              <pre className="text-xs font-mono bg-[var(--bg)] border border-[var(--border)] rounded p-2 overflow-x-auto">
                {Object.entries(profile.env)
                  .map(([k, v]) => `${k}=${v}`)
                  .join('\n')}
              </pre>
            </div>
          )}

          {/* Delete */}
          <div className="pt-2">
            <DeleteButton
              name={profile.name}
              label="Delete this profile"
              action={deleteProfileForm}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  placeholder,
  defaultValue,
  multiline,
}: {
  label: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      {multiline ? (
        <textarea
          name={label.split(' ')[0]}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)] font-mono"
        />
      ) : (
        <input
          name={label.split(' ')[0]}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="mt-1 w-full surface-2 rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      )}
    </label>
  );
}
