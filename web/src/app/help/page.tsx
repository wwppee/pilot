/**
 * /help — glossary + how-tos for beginners.
 *
 * v0.5.18: every jargon term used in Pilot gets an entry here.
 * Each entry has a short definition + a deeper paragraph for
 * beginners. The page also links out to the most common tasks
 * (first session, first install, etc).
 *
 * Glossary data lives in `web/src/lib/glossary.ts` so the same
 * definition is used by `<GlossaryTerm>` elsewhere — keeping the
 * explanation consistent across the UI.
 */
import Link from "next/link";
import { T } from "@/components/I18n";
import glossary, { type GlossaryKey } from "@/lib/glossary";

export default function HelpPage() {
  const entries = Object.entries(glossary) as Array<
    [GlossaryKey, (typeof glossary)[GlossaryKey]]
  >;

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
          <HowToCard
            href="/try"
            title="Start my first pi session"
            body="Click Try pi, then Connect. Type a prompt, watch pi stream a reply."
          />
          <HowToCard
            href="/sessions"
            title="Find a past session"
            body="Sessions lists every conversation pi has had. Click any row to see the full transcript."
          />
          <HowToCard
            href="/packages"
            title="Install a new tool"
            body="Packages → search → Install. Restart pi to pick up the new tool."
          />
          <HowToCard
            href="/profiles"
            title="Switch pi's model / behavior"
            body="Profiles bundle model + tools + thinking level. Pick one in the dropdown on /try."
          />
          <HowToCard
            href="/policy"
            title="Stop pi from running a dangerous command"
            body="Policy → add the tool name to the block list, or require confirmation."
          />
          <HowToCard
            href="/usage"
            title="Check how much I've spent"
            body="Usage → set the date range, see token + cost by model and by day."
          />
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
          {entries.map(([key, entry]) => (
            <article key={key} className="p-4" id={`term-${key}`}>
              <h3 className="text-sm font-semibold mb-1">{entry.short}</h3>
              <p className="text-sm text-[var(--text-muted)]">
                {entry.definition}
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
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="surface rounded-lg p-4 hover:bg-[var(--surface-2)] block"
    >
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-muted)]">{body}</p>
      <span
        className="text-xs mt-2 inline-block"
        style={{ color: "var(--accent)" }}
      >
        →
      </span>
    </Link>
  );
}
