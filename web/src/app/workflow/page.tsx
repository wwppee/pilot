/**
 * /workflow — v2.0.6: real Workflow module.
 *
 * v1.0.1 was a placeholder; v2.0.6 turns it into a 3-card
 * gateway into the three legacy sub-surfaces (Compose /
 * Plans / Workflows). Each card is a plain <Link> to the
 * legacy route — we don't re-implement Compose, Plans, or
 * Workflows here. The cards surface the v0.9-era terminology
 * so existing users find what they expect.
 *
 * Why gateway instead of merge?
 *  - Compose has its own canvas / inspector client island
 *    (see /compose/ComposeBoard) — moving it would be a
 *    v1.x refactor on its own.
 *  - Plans has its own PlanEditor client island — same.
 *  - Workflows is template management; same.
 *
 * A true merge is Phase 4 / Phase 5 per the v1.0.0 roadmap
 * (workflow references capability hub, session → workflow
 * extraction, template marketplace). For v2.0.6 the user
 * gets a single menu entry that lands somewhere useful.
 */
import Link from "next/link";
import { Workflow, ListChecks, LayoutGrid, ArrowRight } from "lucide-react";
import { T } from "@/components/I18n";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface SubModule {
  href: string;
  titleKey: string;
  descKey: string;
  Icon: typeof Workflow;
  /** Accent token used to color the icon. "primary" (cyan)
   *  or "info" (purple). We only have two accents per the
   *  strict 1-primary palette; rotate to keep the gateway
   *  visually varied. */
  accent: "primary" | "info" | "success";
}

const SUB_MODULES: readonly SubModule[] = [
  {
    href: "/compose",
    titleKey: "workflow.sub.compose.title",
    descKey: "workflow.sub.compose.desc",
    Icon: LayoutGrid,
    accent: "primary",
  },
  {
    href: "/plans",
    titleKey: "workflow.sub.plans.title",
    descKey: "workflow.sub.plans.desc",
    Icon: ListChecks,
    accent: "info",
  },
  {
    href: "/workflows",
    titleKey: "workflow.sub.workflows.title",
    descKey: "workflow.sub.workflows.desc",
    Icon: Workflow,
    accent: "success",
  },
];

export default function WorkflowPage() {
  return (
    <div className="space-y-6 workflow-page">
      <PageHeader
        icon={<Workflow size={20} strokeWidth={1.75} />}
        title={<T k="workflow.h1" />}
        subtitle={<T k="workflow.subtitle" />}
      />

      <div className="workflow-grid" aria-label="Workflow sub-modules">
        {SUB_MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`workflow-card workflow-card--${m.accent}`}
          >
            <div className="workflow-card-icon" aria-hidden="true">
              <m.Icon size={22} strokeWidth={1.75} />
            </div>
            <div className="workflow-card-main">
              <div className="workflow-card-title">
                <T k={m.titleKey} />
              </div>
              <div className="workflow-card-desc">
                <T k={m.descKey} />
              </div>
            </div>
            <div className="workflow-card-arrow" aria-hidden="true">
              <ArrowRight size={18} strokeWidth={1.75} />
            </div>
          </Link>
        ))}
      </div>

      <EmptyState
        title="Coming soon"
        hint="Phase 4 will merge these three sub-surfaces into a single workflow editor with a unified plan/workflow data model."
      />
    </div>
  );
}
