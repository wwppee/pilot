/**
 * /capabilities/[id] — single Capability detail (read-only).
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { Capability } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CapabilityDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  let cap: Capability | null = null;
  let error: string | null = null;
  try {
    cap = await api.getCapability(decoded);
  } catch (e) {
    if (!(e as Error).message?.includes('404')) {
      error = (e as Error).message;
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/capabilities">← back to capabilities</Link>
      </div>

      {error && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {cap && <Detail cap={cap} />}
      {!cap && !error && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] italic">
          Capability <code className="kbd">{decoded}</code> not found.
        </div>
      )}
    </div>
  );
}

function Detail({ cap }: { cap: Capability }) {
  return (
    <>
      <header className="surface rounded-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">
              <code className="kbd">{cap.id}</code>
            </h1>
            <div className="text-base text-[var(--text-muted)] mt-1">
              {cap.title}
            </div>
          </div>
          {cap.type && (
            <span
              className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
              style={{
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              {cap.type}
            </span>
          )}
        </div>
        {cap.description && (
          <p className="text-sm mt-4 text-[var(--text-muted)]">
            {cap.description}
          </p>
        )}
      </header>

      {cap.sources.length > 0 && (
        <div className="surface rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
            Sources ({cap.sources.length})
          </h2>
          <ul className="space-y-2 text-sm font-mono">
            {cap.sources.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="kbd text-[10px]">{s.type}</span>
                <code className="kbd text-[10px] flex-1 truncate">
                  {s.ref}
                </code>
                {s.mode && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    {s.mode}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(cap.compatibility.conflicts.length > 0 ||
        cap.compatibility.requires.length > 0) && (
        <div className="surface rounded-lg p-4 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
            Compatibility
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cap.compatibility.requires.length > 0 && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  requires
                </dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {cap.compatibility.requires.map((r) => (
                    <code key={r} className="kbd text-[10px]">
                      {r}
                    </code>
                  ))}
                </dd>
              </div>
            )}
            {cap.compatibility.conflicts.length > 0 && (
              <div>
                <dt
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--warn)' }}
                >
                  conflicts
                </dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {cap.compatibility.conflicts.map((r) => (
                    <code
                      key={r}
                      className="kbd text-[10px]"
                      style={{ color: 'var(--warn)' }}
                    >
                      {r}
                    </code>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="surface rounded-lg p-4 text-xs text-[var(--text-muted)] font-mono space-y-1">
        <div>created: {cap.metadata.createdAt}</div>
        <div>updated: {cap.metadata.updatedAt}</div>
      </div>
    </>
  );
}
