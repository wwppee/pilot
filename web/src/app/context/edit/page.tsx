/**
 * /context/edit — v1.0.3: edit a single context file in the browser.
 *
 * Mounts `<ContextEditor>` with the path/cwd from the query string.
 * The editor is a client component (controlled textarea + save
 * button) because the save action calls `api.writeContextFile`
 * which is a POST — the page itself just resolves the file and
 * passes the content in.
 *
 * The path is in `?path=` (not `[path]`) so we don't have to
 * encode/decode slashes. The server re-checks the path against
 * `discoverProjectContext(cwd)` so a stale / hand-crafted URL
 * for an unrelated file just gets a 404.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { api } from "@/lib/pilot";
import { T } from "@/components/I18n";
import { negotiateLocale, renderT } from "@/lib/i18n";
import { ContextEditor } from "@/components/ContextEditor";

export const dynamic = "force-dynamic";

export default async function ContextEditPage({
  searchParams,
}: {
  searchParams: Promise<{ cwd?: string; path?: string }>;
}) {
  const sp = await searchParams;
  const cwd = sp.cwd ?? process.cwd();
  const path = sp.path;

  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  if (!path) {
    return (
      <div className="space-y-4 context-page">
        <p className="context-error">
          <T k="context.edit.noPath" />
        </p>
        <Link href="/context" className="hub-link">
          <T k="context.edit.back" />
        </Link>
      </div>
    );
  }

  const result = await api.readContextFile(cwd, path).catch(() => null);

  if (!result) {
    return (
      <div className="space-y-4 context-page">
        <p className="context-error">
          <T k="context.edit.notFound" />
        </p>
        <Link href="/context" className="hub-link">
          <T k="context.edit.back" />
        </Link>
      </div>
    );
  }

  const { content, ref } = result;
  const writable = ref.loaded;
  const subtitle = renderT(locale, "context.edit.subtitle", {
    filename: ref.filename,
    location: ref.location,
  });

  return (
    <div className="space-y-6 context-page">
      <header>
        <h1 className="hub-h1">
          <T k="context.edit.h1" />
        </h1>
        <p className="hub-subtitle">{subtitle}</p>
        <p className="context-path" aria-label="path">
          {ref.path}
        </p>
      </header>

      <ContextEditor
        initialContent={content}
        path={path}
        cwd={cwd}
        writable={writable}
        locale={locale}
      />

      <footer className="context-edit-footer">
        <Link href="/context" className="hub-link">
          <T k="context.edit.back" />
        </Link>
      </footer>
    </div>
  );
}
