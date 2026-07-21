/**
 * /context/edit-rules — v1.1.1: server wrapper for the
 * discovery-rules editor. The page resolves the current
 * locale and reads the current rules from the server, then
 * hands off to `<ContextRulesEditor>` (client) for the form.
 */
import { headers } from "next/headers";
import { api } from "@/lib/pilot";
import { negotiateLocale } from "@/lib/i18n";
import { ContextRulesEditor } from "@/components/ContextRulesEditor";

export const dynamic = "force-dynamic";

export default async function ContextEditRulesPage() {
  let acceptLanguage: string | null = null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch {
    /* static generation */
  }
  const locale = negotiateLocale(acceptLanguage);

  const initial = await api.readContextRules().catch(() => ({
    filenames: ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"],
    searchPaths: ["agentDir", "cwd", "ancestor"],
    infoFiles: ["README.md", ".cursor/rules", "CONTRIBUTING.md"],
  }));

  return <ContextRulesEditor initial={initial} locale={locale} />;
}
