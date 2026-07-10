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
import { api, PilotApiError } from "../../lib/pilot";
import type { ComposeCatalog } from "../../lib/types";
import { T } from "@/components/I18n";
import { Hint } from "@/components/Hint";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import ComposeBoard from "./ComposeBoard";
import "./compose.module.css";

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

  return (
    <main>
      <h1>
        <T k="compose.h1" />
      </h1>
      <p className="subtitle">
        <T k="compose.subtitle" />
      </p>

      <div className="mb-2">
        <Hint summary="What is compose?">
          Compose is a visual canvas for arranging Pilot{" "}
          <GlossaryTerm term="capability">capabilities</GlossaryTerm> on a board
          — drag from the sidebar onto the canvas, snap them together, and
          explore how they connect. It's a sandbox / prototype tool, not a way
          to actually configure pi (use{" "}
          <GlossaryTerm term="profile">profiles</GlossaryTerm> for that). Useful
          for visualizing a stack before writing a long{" "}
          <code className="kbd">pilot forge</code> command.
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
