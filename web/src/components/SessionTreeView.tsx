/**
 * SessionTree — visualize pi's session as a branching tree.
 *
 * v0.5.20: shows the full conversation DAG so users can see where
 * they've branched. Built from `GET /sessions/:id/tree` which
 * parses the JSONL `parentId` links.
 *
 * We render the tree as a nested unordered list (no SVG / canvas —
 * keeps it accessible + responsive). Each user node is a fork
 * point; clicking it calls `fork(entryId)` exactly the same way
 * the bubble-level "Fork from here" action does.
 *
 * Note on "current path": pi doesn't emit a public "current leaf"
 * event when the user switches. We approximate by highlighting the
 * most recent path of nodes that share a timestamp with the
 * recently-arrived events. If we can't determine the current path
 * (e.g. just connected, no events yet) we render the tree without
 * highlighting.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { T, useI18n, useT } from "@/components/I18n";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import type { SessionTree, SessionTreeNode } from "@/lib/types";

interface SessionTreeViewProps {
  /** The session id to load. Pass `null` while connecting. */
  sessionId: string | null;
  /**
   * Event stream (from usePiSession). We use the latest event
   * timestamp to guess the "current path" — see file header.
   */
  latestEventTimestamp: number | undefined;
  /** Triggered when the user clicks "fork from here" on a user node. */
  onFork: (entryId: string, prompt: string) => Promise<void> | void;
  /** Triggered when the user clicks a node to inspect it. */
  onSelect?: (node: SessionTreeNode) => void;
}

type NodeRow = {
  node: SessionTreeNode;
  depth: number;
  /** Index among siblings — used for branch number badges. */
  siblingIndex: number;
  siblingCount: number;
};

/**
 * Flatten the tree depth-first so we can render a single ordered
 * list with depth-based indentation. Each row carries its depth
 * and sibling metadata.
 */
function flatten(
  node: SessionTreeNode,
  depth: number,
  out: NodeRow[],
  siblingIndex: number,
  siblingCount: number,
): void {
  out.push({ node, depth, siblingIndex, siblingCount });
  for (let i = 0; i < node.children.length; i++) {
    flatten(node.children[i]!, depth + 1, out, i, node.children.length);
  }
}

/**
 * Mark the deepest row whose timestamp is <= `latestTs` as the
 * "current" node, then walk up marking its ancestors too. This is
 * a best-effort highlight: the events stream doesn't tell us which
 * leaf we're on, but timestamps correlate.
 */
function findCurrentPath(rows: NodeRow[], latestTs: number): Set<string> {
  const current = new Set<string>();
  let chosen: NodeRow | null = null;
  for (const r of rows) {
    const t = r.node.timestamp ? Date.parse(r.node.timestamp) : 0;
    if (t <= latestTs) {
      // Use >= (not >) so a node whose timestamp exactly matches
      // the latest event still wins. Guard the chosen timestamp:
      // a node without a timestamp is always treated as "older" so
      // we don't get stuck on it.
      const chosenT = chosen?.node.timestamp
        ? Date.parse(chosen.node.timestamp)
        : -Infinity;
      if (!chosen || t >= chosenT) {
        chosen = r;
      }
    }
  }
  if (!chosen) return current;
  // Walk up via a parent map (we re-derive it from the rows).
  const byId = new Map<string, NodeRow>();
  for (const r of rows) byId.set(r.node.id, r);
  let cur: NodeRow | null = chosen;
  while (cur) {
    current.add(cur.node.id);
    // Find a row whose children list contains this node — its
    // predecessor row in depth-first order. The parent's
    // siblingIndex is on `cur`; parent's parent is the row just
    // before `cur` in the flat list where depth = cur.depth - 1.
    const parentDepth = cur.depth - 1;
    if (parentDepth < 0) break;
    // Find the closest preceding row at parentDepth whose
    // children include this node's id. Simpler: walk back from
    // cur's index in `rows`.
    const idx = rows.indexOf(cur);
    for (let i = idx - 1; i >= 0; i--) {
      const r = rows[i]!;
      if (r.depth === parentDepth) {
        if (r.node.children.some((c) => c.id === cur!.node.id)) {
          cur = r;
          break;
        }
        // If this row is at the right depth but is NOT the parent,
        // we don't need to look further back at the same depth.
        break;
      }
    }
    if (cur && cur.depth === 0) {
      // Will be picked up in the next iteration if needed.
    }
  }
  return current;
}

export function SessionTreeView({
  sessionId,
  latestEventTimestamp,
  onFork,
}: SessionTreeViewProps) {
  const t = useT();
  const { locale } = useI18n();
  const [tree, setTree] = useState<SessionTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingForkId, setPendingForkId] = useState<string | null>(null);

  // Re-fetch the tree whenever the session id changes.
  useEffect(() => {
    if (!sessionId) {
      setTree(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/pilot/sessions/${encodeURIComponent(sessionId)}/tree`, {
      cache: "no-store",
    })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((data: SessionTree) => {
        if (!cancelled) setTree(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Flatten for rendering.
  const rows = useMemo<NodeRow[]>(() => {
    if (!tree) return [];
    const out: NodeRow[] = [];
    flatten(tree.root, 0, out, 0, 1);
    return out;
  }, [tree]);

  // Mark current path.
  const currentIds = useMemo(() => {
    if (!latestEventTimestamp) return new Set<string>();
    return findCurrentPath(rows, latestEventTimestamp);
  }, [rows, latestEventTimestamp]);

  // Stats.
  const stats = useMemo(() => {
    if (!tree) return null;
    const branches = countBranches(tree.root);
    return {
      totalNodes: tree.totalNodes,
      maxDepth: tree.maxDepth,
      branches,
    };
  }, [tree]);

  const handleFork = useCallback(
    async (row: NodeRow) => {
      if (!row.node.preview) return;
      setPendingForkId(row.node.id);
      try {
        await onFork(row.node.id, row.node.preview);
      } finally {
        setPendingForkId(null);
      }
    },
    [onFork],
  );

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-baseline gap-3 text-[var(--text-muted)]">
        {loading && <span>Loading…</span>}
        {error && <span className="text-[var(--error)]">{error}</span>}
        {stats && !loading && !error && (
          <>
            <span>
              <T k="try.tree.stats" params={{ n: stats.totalNodes }} />
            </span>
            <span>
              <T k="try.tree.branches" params={{ n: stats.branches }} />
            </span>
            <span>
              <T k="try.tree.depth" params={{ n: stats.maxDepth }} />
            </span>
          </>
        )}
      </div>

      {tree && rows.length > 0 ? (
        <ul className="font-mono space-y-0.5 max-h-[320px] overflow-y-auto bg-[var(--surface-2)] rounded p-2">
          {rows.map((row) => (
            <NodeRowView
              key={row.node.id}
              row={row}
              current={currentIds.has(row.node.id)}
              forking={pendingForkId === row.node.id}
              onFork={() => void handleFork(row)}
              t={t}
            />
          ))}
        </ul>
      ) : !loading && !error ? (
        <p className="text-[var(--text-muted)] italic">
          <T k="try.tree.empty" />
        </p>
      ) : null}

      <p className="text-[10px] text-[var(--text-muted)] italic">
        <GlossaryTerm term="fork" locale={locale}>
          fork
        </GlossaryTerm>{" "}
        · <T k="try.tree.hint" />
      </p>
    </div>
  );
}

/** Count the number of internal nodes with > 1 child (i.e. branch points). */
function countBranches(node: SessionTreeNode): number {
  let n = node.children.length > 1 ? 1 : 0;
  for (const c of node.children) n += countBranches(c);
  return n;
}

function NodeRowView({
  row,
  current,
  forking,
  onFork,
  t,
}: {
  row: NodeRow;
  current: boolean;
  forking: boolean;
  onFork: () => void;
  t: (k: string, params?: Record<string, string | number>) => string;
}) {
  const isUser = row.node.type === "user";
  const isAssistant = row.node.type === "assistant";
  const color = isUser
    ? "var(--accent)"
    : isAssistant
      ? "var(--accent-2)"
      : "var(--text-muted)";
  // Indent each level by 12px. Cap at depth 6 to keep the column
  // readable on narrow viewports.
  const indent = Math.min(row.depth, 6) * 12;
  // Connector: vertical bar on the left for visual nesting.
  return (
    <li
      className="flex items-baseline gap-2 hover:bg-[var(--surface)] rounded px-1 group"
      style={{
        marginLeft: indent,
        borderLeft: row.depth > 0 ? "1px solid var(--border)" : undefined,
        paddingLeft: row.depth > 0 ? 6 : undefined,
        background: current
          ? "color-mix(in srgb, var(--accent) 10%, transparent)"
          : undefined,
      }}
      data-current={current ? "true" : undefined}
    >
      <span
        className="text-[10px] shrink-0 w-12"
        style={{ color }}
        title={row.node.type}
      >
        {row.node.type}
      </span>
      <span className="truncate flex-1" title={row.node.preview}>
        {row.node.preview}
      </span>
      {isUser && (
        <button
          type="button"
          onClick={onFork}
          disabled={forking}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          title={t("try.session.forkHere")}
        >
          ↳
        </button>
      )}
    </li>
  );
}
