/**
 * /profiles/[name] — read-only profile detail.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { Profile } from '@/lib/types';

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function ProfileDetailPage({ params }: PageProps) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  let profile: Profile | null = null;
  let error: string | null = null;
  try {
    profile = await api.profile(decoded);
  } catch (e) {
    const msg = (e as Error).message;
    error = msg;
    if (msg.includes('404') || msg.includes('not found')) {
      // Fall through to not-found UI
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/profiles">← back to profiles</Link>
      </div>

      {error && !profile && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          Profile <code className="kbd">{decoded}</code> not found.
        </div>
      )}

      {profile && (
        <>
          <header className="surface rounded-lg p-4">
            <h1 className="text-xl font-bold">{profile.name}</h1>
            {profile.notes && (
              <p className="text-sm text-[var(--text-muted)] mt-2">
                {profile.notes}
              </p>
            )}
          </header>

          <div className="surface rounded-lg p-4">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              Settings
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {profile.model && (
                <DLRow label="model" value={<code className="kbd">{profile.model}</code>} />
              )}
              {profile.thinking && (
                <DLRow label="thinking" value={profile.thinking} />
              )}
              {profile.packages && profile.packages.length > 0 && (
                <DLRow
                  label="packages"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {profile.packages.map((pkg) => (
                        <code key={pkg} className="kbd">
                          {pkg}
                        </code>
                      ))}
                    </div>
                  }
                />
              )}
              {profile.capabilities && profile.capabilities.length > 0 && (
                <DLRow
                  label="capabilities"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {profile.capabilities.map((c) => (
                        <code key={c} className="kbd">
                          {c}
                        </code>
                      ))}
                    </div>
                  }
                />
              )}
              {profile.env && Object.keys(profile.env).length > 0 && (
                <DLRow
                  label="env"
                  value={
                    <pre className="text-xs font-mono bg-[var(--bg)] border border-[var(--border)] rounded p-2 overflow-x-auto">
                      {Object.entries(profile.env)
                        .map(([k, v]) => `${k}=${v}`)
                        .join('\n')}
                    </pre>
                  }
                />
              )}
              {!profile.model &&
                !profile.thinking &&
                !profile.packages &&
                !profile.capabilities &&
                !profile.env && (
                  <div className="text-sm text-[var(--text-muted)] italic">
                    Empty profile.
                  </div>
                )}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

function DLRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}