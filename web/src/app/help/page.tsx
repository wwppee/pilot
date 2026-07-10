/**
 * /help — glossary + how-tos for beginners.
 *
 * v0.5.18: every jargon term used in Pilot gets an entry here.
 * Each entry has a short definition + a deeper paragraph for
 * beginners. The page also links out to the most common tasks
 * (first session, first install, etc).
 *
 * v0.5.22: became a Server Component with Accept-Language
 * negotiation, so the "How do I…" cards and the glossary
 * entries both render in the active locale. Glossary data
 * lives in `web/src/lib/glossary.ts` so the same definition
 * is used by `<GlossaryTerm>` elsewhere — keeping the
 * explanation consistent across the UI.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { T } from "@/components/I18n";
import { definitionFor, shortFor, type GlossaryKey } from "@/lib/glossary";
import { negotiateLocale, type Locale } from "@/lib/i18n";

interface HowDoEntry {
  titleKey: string;
  bodyKey: string;
  href: string;
}

const HOW_DO_ENTRIES: HowDoEntry[] = [
  {
    titleKey: "help.howDo.firstSession.title",
    bodyKey: "help.howDo.firstSession.body",
    href: "/try",
  },
  {
    titleKey: "help.howDo.findSession.title",
    bodyKey: "help.howDo.findSession.body",
    href: "/sessions",
  },
  {
    titleKey: "help.howDo.installTool.title",
    bodyKey: "help.howDo.installTool.body",
    href: "/packages",
  },
  {
    titleKey: "help.howDo.switchModel.title",
    bodyKey: "help.howDo.switchModel.body",
    href: "/profiles",
  },
  {
    titleKey: "help.howDo.blockDangerous.title",
    bodyKey: "help.howDo.blockDangerous.body",
    href: "/policy",
  },
  {
    titleKey: "help.howDo.checkSpending.title",
    bodyKey: "help.howDo.checkSpending.body",
    href: "/usage",
  },
];

export default async function HelpPage() {
  const acceptLanguage = (await headers()).get("accept-language");
  const locale: Locale = acceptLanguage
    ? negotiateLocale(acceptLanguage)
    : "en";

  const glossaryKeys: GlossaryKey[] = [
    "pilot",
    "pi",
    "session",
    "capability",
    "profile",
    "avatar",
    "pack",
    "tool",
    "policy",
    "context",
    "contextWindow",
    "token",
    "rpc",
    "plan",
    "fork",
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-1">
          <T k="help.h1" />
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          <T k="help.subtitle" />
        </p>
      </header>

      <section>
        <h2 className="section-h2 mb-3">
          <T k="help.section.howDoI" />
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HOW_DO_ENTRIES.map((entry) => (
            <HowToCard
              key={entry.href}
              href={entry.href}
              titleKey={entry.titleKey}
              bodyKey={entry.bodyKey}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-h2 mb-3">
          <T k="help.section.glossary" />
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          <T k="help.section.glossaryHint" />
        </p>
        <div className="surface rounded-lg divide-y divide-[var(--border)]">
          {glossaryKeys.map((key) => (
            <article key={key} className="p-4" id={`term-${key}`}>
              <h3 className="text-sm font-semibold mb-1">
                {shortFor(key, locale)}
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                {definitionFor(key, locale)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-h2 mb-3">
          <T k="help.section.architecture" />
        </h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-3xl">
          <T k="help.section.architectureBody" />
        </p>
      </section>
    </div>
  );
}

function HowToCard({
  href,
  titleKey,
  bodyKey,
}: {
  href: string;
  titleKey: string;
  bodyKey: string;
}) {
  return (
    <Link
      href={href}
      className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block"
    >
      <h3 className="text-sm font-semibold mb-1">
        <T k={titleKey} />
      </h3>
      <p className="text-xs text-[var(--text-muted)]">
        <T k={bodyKey} />
      </p>
      <span
        className="text-xs mt-2 inline-block"
        style={{ color: "var(--accent)" }}
      >
        →
      </span>
    </Link>
  );
}
