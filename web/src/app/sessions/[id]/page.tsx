/**
 * /sessions/[id] — single session tree view.
 *
 * The pilot server returns a recursive tree (`{ root, totalNodes, … }`).
 * We render it as nested ordered lists with depth-indent and type
 * coloring (user/assistant/tool/system).
 */
import Link from 'next/link';
import { api } from '@/lib/pilot';
import type { SessionInfo, SessionTree, SessionTreeNode } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function load(id: string): Promise<{
  tree: SessionTree | null;
  session: SessionInfo | null;
  error: string | null;
}> {
  try {
    const [tree, sessions] = await Promise.all([
      api.sessionTree(id),
      api.sessions(),
    ]);
    const session = sessions.find((s) => s.id === id) ?? null;
    return { tree, session, error: null };
  } catch (e) {
    return { tree: null, session: null, error: (e as Error).message };
  }
}

export default async function SessionTreePage({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const { tree, session, error } = await load(decoded);

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-xs text-[var(--text-muted)]">
          <Link href="/sessions">← back to sessions</Link>
        </div>
        <div className="surface rounded-lg p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="surface rounded-lg p-4 text-sm text-[var(--text-muted)] italic">
        No tree data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-[var(--text-muted)]">
        <Link href="/sessions">← back to sessions</Link>
      </div>

      <header className="surface rounded-lg p-4">
        <h1 className="text-lg font-bold">
          <code className="kbd">{tree.id}</code>
        </h1>
        <div className="text-xs text-[var(--text-muted)] mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="cwd" value={session?.cwd ?? '—'} mono />
          <Stat label="total nodes" value={String(tree.totalNodes)} />
          <Stat label="max depth" value={String(tree.maxDepth)} />
          <Stat
            label="models"
            value={tree.models.length === 0 ? '—' : tree.models.join(', ')}
            mono
          />
        </div>
      </header>

      <div className="surface rounded-lg p-4 overflow-x-auto">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-3">
          Tree
        </h2>
        <ol className="font-mono text-xs space-y-0.5">
          <NodeRow node={tree.root} depth={0} />
        </ol>
      </div>
    </div>
  );
}

function NodeRow({ node, depth }: { node: SessionTreeNode; depth: number }) {
  const color =
    node.type === 'user'
      ? 'var(--accent)'
      : node.type === 'assistant'
      ? 'var(--accent-2)'
      : node.type === 'tool'
      ? 'var(--warn)'
      : 'var(--text-muted)';

  return (
    <li>
      <div
        className="flex items-start gap-2 py-0.5"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <span
          className="uppercase tracking-wide text-[10px]"
          style={{ color, minWidth: '64px' }}
        >
          {node.type}
        </span>
        <span className="flex-1 text-[var(--text-muted)] line-clamp-2">
          {node.preview}
        </span>
        {node.model && (
          <code className="kbd text-[10px]">{node.model}</code>
        )}
      </div>
      {node.children.length > 0 && (
        <ol>
          {node.children.map((c) => (
            <NodeRow key={c.id} node={c} depth={depth + 1} />
          ))}
        </ol>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`text-sm mt-0.5 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  );
}
