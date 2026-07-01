/**
 * /capabilities — list installed Capabilities (read-only).
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import { AutoRefresh, LivePulse } from '@/components/AutoRefresh';
import type { Capability } from '@/lib/types';

export default async function CapabilitiesPage() {
  const list = await api.listCapabilities().catch(() => [] as Capability[]);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={15_000} />

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Capabilities</h1>
          <p className="text-[var(--text-muted)] text-sm">
            {list.length} capability/capabilities installed · Forge ships in v0.4.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <LivePulse live />
          <span>auto-refresh 15s</span>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="surface rounded-lg px-3 py-6 text-sm text-[var(--text-muted)] italic text-center">
          No capabilities installed yet.{' '}
          <Link href="https://github.com/wwppee/pilot" className="text-xs">
            Forge
          </Link>{' '}
          ships in v0.4.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/capabilities/${c.id}`}
              className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block"
            >
              <div className="flex items-start justify-between gap-2">
                <code className="kbd">{c.id}</code>
                {c.type && (
                  <span
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
                    style={{
                      color: 'var(--accent)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {c.type}
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold mt-2">{c.title}</h3>
              {c.description && (
                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                  {c.description}
                </p>
              )}
              <div className="flex gap-4 mt-3 text-[10px] text-[var(--text-muted)] font-mono">
                <span>{c.sources.length} source(s)</span>
                {c.compatibility.requires.length > 0 && (
                  <span>requires {c.compatibility.requires.length}</span>
                )}
                {c.compatibility.conflicts.length > 0 && (
                  <span style={{ color: 'var(--warn)' }}>
                    conflicts {c.compatibility.conflicts.length}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
