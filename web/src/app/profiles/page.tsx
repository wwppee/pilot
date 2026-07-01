/**
 * /profiles — list all named profiles.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { Profile } from '@/lib/types';

export default async function ProfilesPage() {
  const result = await api.profiles().catch(() => null as Profile[] | null);
  const profiles = (result ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Profiles</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {profiles.length} profile{profiles.length === 1 ? '' : 's'} · stored under{' '}
          <code className="kbd">~/.pilot/profiles/</code>
        </p>
      </header>

      {profiles.length === 0 ? (
        <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
          No profiles yet. Try <code className="kbd">pilot profile create my-work</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <Link
              key={p.name}
              href={`/profiles/${p.name}`}
              className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block"
            >
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
          ))}
        </div>
      )}
    </div>
  );
}