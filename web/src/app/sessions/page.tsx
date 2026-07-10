/**
 * /sessions — list all sessions.
 *
 * v0.5.9+: added a Topic column showing the first user message
 * preview (≤120 chars). Each row is now self-describing — users can
 * scan their history without clicking into each one.
 *
 * v0.5.18+: added a "what is a session" Hint so beginners understand
 * what they're looking at.
 */
import Link from "next/link";
export const dynamic = "force-dynamic";
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import type { SessionInfo } from "@/lib/types";
import { T } from "@/components/I18n";
import { EmptyState } from "@/components/EmptyState";
import { RichT } from "@/components/RichT";
import { Hint } from "@/components/Hint";
import { negotiateLocale, renderT } from "@/lib/i18n";

export default async function SessionsPage() {
  const result = await api.sessions().catch(() => null as SessionInfo[] | null);
  const sessions = (result ?? []) as SessionInfo[];

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);
  const home = renderT(locale, "brand.name");
  const subtitle = renderT(locale, "sessions.subtitle", {
    n: sessions.length,
    s: sessions.length === 1 ? "" : "s",
    home,
  });
  const topicEmpty = renderT(locale, "sessions.topic.empty");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="sessions.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm mb-3">{subtitle}</p>
        <Hint summary={<T k="sessions.hint.summary" />}>
          <RichT
            locale={locale}
            k="sessions.hint.body"
            values={{
              s1: <strong>session</strong>,
              c1: <code className="kbd">~/.pi/agent/sessions/</code>,
            }}
          />
        </Hint>
      </header>

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <EmptyState
            title={renderT(locale, "sessions.empty")}
            hint={
              <RichT
                locale={locale}
                k="sessions.empty.hint"
                values={{
                  dir: <code className="kbd">~/.pi/agent/sessions/</code>,
                  cmd: <code className="kbd">pi</code>,
                }}
              />
            }
          />
        ) : (
          <div className="surface rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="surface-2 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.topic" />
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.cwd" />
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.lastUsed" />
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    <T k="sessions.col.entries" />
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    <T k="sessions.col.size" />
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <T k="sessions.col.model" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-3 py-2">
                      <Link href={`/sessions/${s.id}`} className="kbd">
                        {s.id.slice(0, 20)}
                        {s.id.length > 20 ? "…" : ""}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-md">
                      {s.firstUserPreview ? (
                        <span className="text-[var(--text)] line-clamp-2">
                          {s.firstUserPreview}
                        </span>
                      ) : (
                        <span className="italic text-[var(--text-muted)]">
                          {topicEmpty}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)] max-w-xs truncate">
                      {s.cwd}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {s.lastUsedAt ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.entries}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {prettyBytes(s.size)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.model ? <code className="kbd">{s.model}</code> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
