/**
 * /packages/[name] — single pack detail with install form.
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import { installPackForm } from '@/lib/actions';

interface PageProps {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ installed?: string; error?: string }>;
}

export default async function PackageDetailPage({ params, searchParams }: PageProps) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);
  const decoded = decodeURIComponent(name);

  let pack: Awaited<ReturnType<typeof api.packInfo>> | null = null;
  let error: string | null = null;
  try {
    pack = await api.packInfo(decoded);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/packages">← back to packages</Link>
      </div>

      {error && (
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          Couldn&apos;t fetch this pack: {error}
        </div>
      )}

      {sp.installed && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: 'var(--accent-2)', borderColor: 'var(--accent-2)' }}
        >
          ✓ Installed <code className="kbd">{decoded}</code> successfully.
        </div>
      )}
      {sp.error && (
        <div
          className="surface rounded-lg p-3 text-sm"
          style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
        >
          Install failed: {sp.error}
        </div>
      )}

      {pack && (
        <>
          <header className="surface rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold">
                  <code className="kbd">{pack.name}</code>
                </h1>
                <div className="text-sm text-[var(--text-muted)] mt-1">
                  v{pack.version} · {pack.source}
                </div>
              </div>
              {pack.kind && (
                <span
                  className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                  style={{
                    color: 'var(--accent)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {pack.kind}
                </span>
              )}
            </div>
            {pack.description && (
              <p className="text-sm mt-4 text-[var(--text-muted)]">
                {pack.description}
              </p>
            )}
          </header>

          <div className="surface rounded-lg p-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Source" value={pack.source} />
              <Field label="Enabled" value={pack.enabled ? 'yes' : 'no'} />
              <Field
                label="Homepage"
                value={
                  pack.homepage ? (
                    <a href={pack.homepage} className="text-xs break-all">
                      {pack.homepage}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
            </div>
          </div>

          <div className="surface rounded-lg p-4">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
              Install
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {pack.enabled
                ? 'Already installed. Re-run to update.'
                : 'Not yet installed. Install via the pilot CLI or this Web UI.'}
            </p>
            <form action={installPackForm} className="flex items-center gap-2">
              <input type="hidden" name="name" value={pack.name} />
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded text-[var(--bg)]"
                style={{ background: 'var(--accent-2)' }}
              >
                {pack.enabled ? 'Update' : 'Install'} {pack.name}
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                runs <code className="kbd">pilot pack install {pack.name}</code> under the hood
              </span>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  );
}
