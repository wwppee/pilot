"use client";

/**
 * SessionTreeExplorer — interactive view of a session's DAG tree.
 *
 * Adds three affordances over the static v0.3.0 tree:
 *
 *   1. **Expand / collapse** subtrees by clicking the chevron. All
 *      subtrees start expanded (we don't want users to land on a
 *      blank page); collapsing hides children + descendants.
 *
 *   2. **Keyword search** in the toolbar highlights matches in the
 *      node preview text and auto-collapses non-matching subtrees so
 *      the relevant nodes rise to the top. Empty query restores the
 *      tree to fully expanded.
 *   3. **Type filter** (chips above the tree) toggles which entry
 *      types are visible. All on by default. Hiding "tool" is the
 *      most common case — sessions with lots of bash/read churn are
 *      a lot easier to read with tools hidden.
 *
 * v0.5.8+: chip set expanded to cover pi v3 meta types (model_change,
 * thinking_level_change) and bucketizes everything else under
 * "system" (compaction / branch_summary / label / session_info /
 * custom / custom_message / bashExecution / branchSummary /
 * compactionSummary / toolResult). The actual `node.type` is still
 * shown in the row label so users can tell what kind of meta entry
 * they're looking at.
 *
 * i18n: takes a `t` function from the parent so it stays consistent
 * with the rest of the page.
 */

import { useCallback, useMemo, useState } from "react";
import type { SessionTreeNode, SessionTreeNodeType } from "@/lib/types";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";

/**
 * The 6 filter buckets the UI exposes. The server can emit ~16 distinct
 * type strings (see `SessionTreeNodeType`); we bucket the rare ones
 * under `system` so the chip row stays scannable.
 */
export type NodeTypeFilter =
  | "user"
  | "assistant"
  | "tool"
  | "system"
  | "model_change"
  | "thinking_level_change";

const ALL_TYPES: NodeTypeFilter[] = [
  "user",
  "assistant",
  "tool",
  "system",
  "model_change",
  "thinking_level_change",
];

/**
 * Bucketize a server-emitted type into one of the 6 filter buckets.
 * Anything we haven't enumerated falls under `system` (the "rare
 * meta" bucket) so the chip set doesn't grow unbounded.
 */
function bucketOf(type: SessionTreeNodeType): NodeTypeFilter {
  switch (type) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool":
    case "toolResult":
    case "bashExecution":
      // v3 names for what legacy called "tool".
      return "tool";
    case "model_change":
      return "model_change";
    case "thinking_level_change":
      return "thinking_level_change";
    case "system":
    case "compaction":
    case "branch_summary":
    case "custom":
    case "custom_message":
    case "label":
    case "session_info":
    case "branchSummary":
    case "compactionSummary":
    case "empty":
    default:
      return "system";
  }
}

/** CSS color variable for a bucket — falls back to --type-unknown. */
function colorVarForBucket(bucket: NodeTypeFilter): string {
  return `var(--type-${bucket}, var(--type-unknown))`;
}

/** Friendly label for the type shown in the row (capitalized). */
function displayLabelForType(type: SessionTreeNodeType): string {
  if (!type) return "—";
  // Most v3 meta types are snake_case — split and capitalize so the
  // label doesn't shout MODEL_CHANGE at users. Camel-case v3 roles
  // get a space inserted before capitals.
  return type
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  root: SessionTreeNode;
  /**
   * Locale to render UI strings in. The component imports
   * `translate` directly so it can render on either side of the
   * server/client boundary without a function prop (RSC forbids
   * passing functions across the boundary, which used to crash
   * this page with "Functions cannot be passed directly to Client
   * Components" — v0.5.6).
   */
  locale: Locale;
}

export function SessionTreeExplorer({ root, locale }: Props) {
  // Thin wrapper so existing call sites read `t(k, params)` instead
  // of `translate(locale, k, params)` everywhere.
  const t = useCallback(
    (k: string, params?: Record<string, string | number>) =>
      translate(locale, k, params),
    [locale],
  );
  const [query, setQuery] = useState("");
  const [hiddenTypes, setHiddenTypes] = useState<Set<NodeTypeFilter>>(
    new Set(),
  );
  // Set of node ids whose subtree is collapsed. Default empty = all
  // expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const trimmedQuery = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!trimmedQuery) return null;
    const set = new Set<string>();
    walk(root, (n) => {
      if ((n.preview ?? "").toLowerCase().includes(trimmedQuery)) {
        set.add(n.id);
      }
    });
    return set;
  }, [root, trimmedQuery]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleType = (type: NodeTypeFilter) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const ids = new Set<string>();
    walk(root, (n) => {
      if (n.children.length > 0) ids.add(n.id);
    });
    setCollapsed(ids);
  };

  return (
    <div className="space-y-3">
      <Toolbar
        query={query}
        onQuery={setQuery}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleType}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        t={t}
      />
      <ol className="font-mono text-xs space-y-0.5">
        <Row
          node={root}
          depth={0}
          hiddenTypes={hiddenTypes}
          matches={matches}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          query={trimmedQuery}
          t={t}
        />
      </ol>
      {matches && (
        <p className="text-[10px] text-[var(--text-muted)] italic">
          {t("sessions.tree.matchCount", { n: matches.size })}
        </p>
      )}
    </div>
  );
}

interface ToolbarProps {
  query: string;
  onQuery: (v: string) => void;
  hiddenTypes: Set<NodeTypeFilter>;
  onToggleType: (type: NodeTypeFilter) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  t: (k: string, params?: Record<string, string | number>) => string;
}

function Toolbar({
  query,
  onQuery,
  hiddenTypes,
  onToggleType,
  onExpandAll,
  onCollapseAll,
  t,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t("sessions.tree.searchPlaceholder")}
        aria-label={t("sessions.tree.searchLabel")}
        className="flex-1 min-w-[180px] surface-2 rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
      />
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={t("sessions.tree.filterLabel")}
      >
        {ALL_TYPES.map((type) => {
          const hidden = hiddenTypes.has(type);
          const color = colorVarForBucket(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={!hidden}
              onClick={() => onToggleType(type)}
              className="px-2 py-0.5 rounded text-[10px] tracking-wide border"
              style={{
                color: hidden ? "var(--text-muted)" : color,
                borderColor: hidden ? "var(--surface-2)" : color,
                background: hidden ? "transparent" : "var(--surface-2)",
              }}
            >
              {t(`sessions.tree.types.${type}`)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={onExpandAll}
          className="px-2 py-0.5 rounded text-[10px] surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
        >
          {t("sessions.tree.expandAll")}
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          className="px-2 py-0.5 rounded text-[10px] surface-2 hover:bg-[var(--accent)] hover:text-[var(--bg)]"
        >
          {t("sessions.tree.collapseAll")}
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  node: SessionTreeNode;
  depth: number;
  hiddenTypes: Set<NodeTypeFilter>;
  matches: Set<string> | null;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  query: string;
  t: (k: string, params?: Record<string, string | number>) => string;
}

function Row({
  node,
  depth,
  hiddenTypes,
  matches,
  collapsed,
  onToggleCollapse,
  query,
  t: _t,
}: RowProps) {
  const bucket = bucketOf(node.type);
  const isHidden = hiddenTypes.has(bucket);
  if (isHidden) return null;

  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;

  // When filtering by query: hide non-matching subtrees unless any
  // descendant matches (so a matching descendant keeps its ancestor
  // chain visible).
  const ancestorMatch = matches && matches.has(node.id);
  if (matches && !ancestorMatch && depth > 0) {
    // Defer to the parent's decision: only render if any descendant
    // matches. We don't have ancestor visibility here, so we check
    // the node itself + a quick subtree walk.
    const hasDescendantMatch = hasAnyMatch(node, matches);
    if (!hasDescendantMatch) return null;
  }

  return (
    <li>
      <div
        className="flex items-start gap-2 py-0.5"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <button
          type="button"
          onClick={() => onToggleCollapse(node.id)}
          disabled={!hasChildren}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          aria-label={
            hasChildren
              ? isCollapsed
                ? "expand subtree"
                : "collapse subtree"
              : "leaf node"
          }
          className="w-4 text-center text-[var(--text-muted)] disabled:opacity-0"
        >
          {hasChildren ? (isCollapsed ? "▸" : "▾") : "·"}
        </button>
        <span
          className="tracking-wide text-[10px] font-medium"
          style={{
            color: colorVarForBucket(bucket),
            minWidth: "80px",
          }}
          title={node.type}
        >
          {displayLabelForType(node.type)}
        </span>
        <span
          className="flex-1 text-[var(--text-muted)] line-clamp-2"
          dangerouslySetInnerHTML={{
            __html: highlight(node.preview ?? "", query),
          }}
        />
        {node.model && <code className="kbd text-[10px]">{node.model}</code>}
      </div>
      {hasChildren && !isCollapsed && (
        <ol>
          {node.children.map((c) => (
            <Row
              key={c.id}
              node={c}
              depth={depth + 1}
              hiddenTypes={hiddenTypes}
              matches={matches}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              query={query}
              t={_t}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

/** Walk the whole tree, calling fn on every node. */
function walk(node: SessionTreeNode, fn: (n: SessionTreeNode) => void): void {
  fn(node);
  for (const c of node.children) walk(c, fn);
}

/** True if `node` or any descendant is in `matches`. */
function hasAnyMatch(node: SessionTreeNode, matches: Set<string>): boolean {
  if (matches.has(node.id)) return true;
  for (const c of node.children) {
    if (hasAnyMatch(c, matches)) return true;
  }
  return false;
}

/**
 * Wrap each occurrence of `query` in <mark>. Case-insensitive. The
 * surrounding text is HTML-escaped first so user-supplied content
 * can't inject markup.
 */
function highlight(text: string, query: string): string {
  const escaped = escapeHtml(text);
  if (!query) return escaped;
  const re = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  return escaped.replace(
    re,
    '<mark class="bg-[var(--accent)]/30 rounded px-0.5">$1</mark>',
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
