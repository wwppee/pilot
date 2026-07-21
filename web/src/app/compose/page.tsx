/**
 * /compose — visual canvas for arranging Pilot entities.
 *
 * v0.4.4: the start of the "box garden" cockpit. The page is mostly
 * a server component that fetches the catalog (so the initial paint
 * is fast) and renders a client-side interactive board.
 *
 * Data flow:
 *   1. Server: fetch `ComposeCatalog` from pilot server (read-only)
 *   2. Pass to <ComposeBoard> as initial state
 *   3. Client: drag from sidebar → canvas, drag on canvas, click → inspector
 *   4. Persistence: localStorage auto-save, JSON export/import
 */

import { Suspense } from "react";
import { headers } from "next/headers";
import { Workflow } from "lucide-react";
import { api, PilotApiError } from "../../lib/pilot";
import type { ComposeCatalog } from "../../lib/types";
import { T } from "@/components/I18n";
import { Hint } from "@/components/Hint";
import { RichT } from "@/components/RichT";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { PageHeader } from "@/components/PageHeader";
import { negotiateLocale, type Locale } from "@/lib/i18n";
import ComposeBoard from "./ComposeBoard";
import "./compose.css";

export const dynamic = "force-dynamic";

async function loadCatalog(): Promise<{
  catalog: ComposeCatalog | null;
  error: string | null;
}> {
  try {
    const catalog = await api.composeCatalog();
    return { catalog, error: null };
  } catch (e) {
    return {
      catalog: null,
      error:
        e instanceof PilotApiError
          ? `${e.status}: ${e.message}`
          : (e as Error).message,
    };
  }
}

export default async function ComposePage() {
  const { catalog, error } = await loadCatalog();

  let locale: Locale = "en";
  const acceptLanguage = (await headers()).get("accept-language");
  if (acceptLanguage) {
    locale = negotiateLocale(acceptLanguage);
  }

  return (
    <main>
      <PageHeader
        icon={<Workflow size={20} strokeWidth={1.75} />}
        title={<T k="compose.h1" />}
        subtitle={<T k="compose.subtitle" />}
      />

      <div className="mb-2">
        <Hint summary={<T k="compose.hint.summary" />}>
          <RichT
            locale={locale}
            k="compose.hint.body"
            values={{
              capability: (
                <GlossaryTerm term="capability" locale={locale}>
                  capabilities
                </GlossaryTerm>
              ),
              profile: (
                <GlossaryTerm term="profile" locale={locale}>
                  profiles
                </GlossaryTerm>
              ),
              c1: <code className="kbd">pilot forge</code>,
            }}
          />
        </Hint>
      </div>
      {error ? (
        <section className="card error">
          <h2>
            <T k="error.couldntLoad.title" />: catalog
          </h2>
          <pre>{error}</pre>
          <p className="hint">
            <T k="error.couldntLoad.body" />
          </p>
        </section>
      ) : catalog ? (
        <Suspense
          fallback={
            <p>
              <T k="loading.catalog" />
            </p>
          }
        >
          <ComposeBoard initialCatalog={catalog} />
        </Suspense>
      ) : null}
    </main>
  );
}
