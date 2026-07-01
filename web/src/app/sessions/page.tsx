/**
 * /sessions — list all sessions.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { SessionInfo } from '@/lib/types';

export default async function SessionsPage() {
  const result = await api.sessions().catch(() => null as SessionInfo[] | null);
  const sessions = (result ?? []) as SessionInfo[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Sessions</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · most recent first
        </p>
      </header>

      <div className="surface rounded-lg overflow-hidden">
        {sessions.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)] italic px-3 py-6 text-center">
            No sessions yet. Run pi to create one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="surface-2 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">CWD</th>
                <th className="px-3 py-2 font-medium">Last used</th>
                <th className="px-3 py-2 font-medium text-right">Entries</th>
                <th className="px-3 py-2 font-medium text-right">Size</th>
                <th className="px-3 py-2 font-medium">Model</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
                  <td className="px-3 py-2">
                    <Link href={`/sessions/${s.id}`} className="kbd">
                      {s.id.slice(0, 20)}
                      {s.id.length > 20 ? '…' : ''}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)] max-w-xs truncate">
                    {s.cwd}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {s.lastUsedAt ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.entries}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {prettyBytes(s.size)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.model ? <code className="kbd">{s.model}</code> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}