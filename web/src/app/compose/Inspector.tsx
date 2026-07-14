/**
 * Inspector.tsx — the right-hand panel that shows block + connection
 * details. v0.6.11 split out of `ComposeBoard.tsx` to keep that
 * file under the per-version size budget. The components in here
 * are pure renderers — they receive props + callbacks and emit
 * user events. The actual mutation logic (commit + setState) stays
 * in `ComposeBoard.tsx`.
 *
 * Components:
 *   - `BlockInspector`     the right-panel for the selected block
 *   - `ConnectingPicker`   the "Connect to…" inline picker
 *   - `ConnectionList`     the list of edges touching this block
 *                          with label editor + disconnect button
 *   - `InspectorDetailFields`  kind-specific real-entity fields
 *
 * Visual metadata for each entity kind (emoji + tint) lives in
 * `KIND_META` so the picker emoji stays consistent with the
 * inspector header card.
 */

import { useEffect, useState } from "react";
import type {
  ComposeBlock,
  ComposeConnection,
  ComposeEntity,
  ComposeEntityDetail,
  ComposeEntityKind,
  ConnectionLabelKind,
} from "../../lib/types";
import { api, PilotApiError } from "../../lib/pilot-browser";
import { useT } from "@/components/I18n";

/**
 * Per-kind visual metadata. `label` is a translator function so we
 * can localize the entity names without having to keep them in sync
 * via constants. Emoji + tint stay constant — they map to brand
 * colors that don't vary by locale.
 */
type KindMeta = { label: string; emoji: string; tint: string };
type KindMetaBuilder = (t: (k: string) => string) => KindMeta;
export const KIND_META: Record<ComposeEntityKind, KindMetaBuilder> = {
  session: (t) => ({
    label: t("compose.entity.session"),
    emoji: "💬",
    tint: "var(--accent)",
  }),
  pack: (t) => ({
    label: t("compose.entity.pack"),
    emoji: "📦",
    tint: "var(--cozy-accent-2)",
  }),
  profile: (t) => ({
    label: t("compose.entity.profile"),
    emoji: "🎛",
    tint: "var(--cozy-profile)",
  }),
  policy: (t) => ({
    label: t("compose.entity.policy"),
    emoji: "🛡",
    tint: "var(--hitl)",
  }),
  capability: (t) => ({
    label: t("compose.entity.capability"),
    emoji: "🧩",
    tint: "var(--cozy-accent)",
  }),
};

// ─── Inspector ─────────────────────────────────────────────

export function BlockInspector({
  block,
  onDelete,
  onDuplicate,
  onMoveToTop,
  onMoveToBottom,
  catalogEntity,
  allBlocks,
  connections,
  connectingFromId,
  onStartConnect,
  onCancelConnect,
  onConnect,
  onDisconnect,
  onUpdateLabel,
}: {
  block: ComposeBlock;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  catalogEntity: ComposeEntity | undefined;
  allBlocks: ComposeBlock[];
  connections: ComposeConnection[];
  connectingFromId: string | null;
  onStartConnect: () => void;
  onCancelConnect: () => void;
  onConnect: (toId: string) => void;
  onDisconnect: (connectionId: string) => void;
  onUpdateLabel: (
    connectionId: string,
    label: string | undefined,
    kind: ConnectionLabelKind | undefined,
  ) => void;
}) {
  const t = useT();
  const meta = KIND_META[block.kind](t);
  const stale = !catalogEntity;
  const href = block.href ?? catalogEntity?.href;

  // v0.6.5: fetch the real entity detail so the inspector can
  // show actual fields (cwd / size / packages / policy rules /
  // etc.) instead of just the cached label. Re-fetches when the
  // selected block changes; `stale` is handled separately.
  //
  // `hydrated` is the post-hydration guard. During SSR + the first
  // client paint, the detail block must render the same thing on
  // both sides (else React #418 hydration mismatch — `formatRelative`
  // uses `Date.now()` so it diverges between server and client).
  // We keep `detail` undefined until the first useEffect fires, and
  // only render the rich fields after `hydrated` is true.
  const [detail, setDetail] = useState<ComposeEntityDetail | null | undefined>(
    undefined,
  );
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    let cancelled = false;
    setDetail(undefined);
    api
      .composeEntityDetail(block.kind, block.refId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDetail(null);
          if (!(e instanceof PilotApiError && e.status === 404)) {
            console.warn("compose detail fetch failed", e);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [block.kind, block.refId]);

  return (
    <div className="compose-inspector-body">
      <header
        className="compose-inspector-card"
        style={{ borderLeftColor: meta.tint }}
      >
        <span className="emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        <div>
          <div className="title" title={block.label}>
            {block.label}
          </div>
          <div className="muted small">
            {meta.label}
            {block.sublabel ? ` · ${block.sublabel}` : ""}
          </div>
        </div>
      </header>

      {stale ? (
        <p className="warn small">⚠ {t("compose.inspector.stale")}</p>
      ) : null}

      <dl className="compose-inspector-fields">
        <dt>{t("compose.inspector.field.id")}</dt>
        <dd className="mono small" title={block.id}>
          {block.id.slice(0, 8)}
        </dd>
        <dt>{t("compose.inspector.field.kind")}</dt>
        <dd>{block.kind}</dd>
        <dt>{t("compose.inspector.field.refId")}</dt>
        <dd className="mono small" title={block.refId}>
          {block.refId}
        </dd>
        <dt>{t("compose.inspector.field.position")}</dt>
        <dd>
          ({Math.round(block.x)}, {Math.round(block.y)})
        </dd>
      </dl>

      {hydrated && detail !== undefined ? (
        detail === null ? null : (
          <InspectorDetailFields detail={detail} />
        )
      ) : null}

      {/* v0.6.7: connections — incoming + outgoing edges for this
          block, with per-edge disconnect buttons. The "Connect to…"
          button toggles a small picker panel below. */}
      <div className="compose-inspector-connections">
        <div className="compose-inspector-connections-header">
          <h4>{t("compose.inspector.connections")}</h4>
          {connectingFromId === block.id ? (
            <button
              type="button"
              className="btn small secondary"
              onClick={onCancelConnect}
              aria-label={t("compose.inspector.cancelConnect")}
            >
              ✕
            </button>
          ) : allBlocks.length > 1 ? (
            <button
              type="button"
              className="btn small secondary"
              onClick={onStartConnect}
              title={t("compose.inspector.connect")}
            >
              + {t("compose.inspector.connect")}
            </button>
          ) : null}
        </div>
        {connectingFromId === block.id ? (
          <ConnectingPicker
            allBlocks={allBlocks}
            excludeId={block.id}
            existingConnections={connections}
            onPick={onConnect}
            onCancel={onCancelConnect}
          />
        ) : (
          <ConnectionList
            block={block}
            allBlocks={allBlocks}
            connections={connections}
            onDisconnect={onDisconnect}
            onUpdateLabel={onUpdateLabel}
          />
        )}
      </div>

      <div className="compose-inspector-actions">
        {href ? (
          <a className="btn small" href={href}>
            {t("compose.inspector.openDetail")}
          </a>
        ) : null}
        <button
          type="button"
          className="btn small secondary"
          onClick={onDuplicate}
          title={t("compose.inspector.duplicateTitle")}
          aria-label={t("compose.inspector.duplicateTitle")}
        >
          ⎘ {t("compose.inspector.duplicate")}
        </button>
        <button
          type="button"
          className="btn small secondary"
          onClick={onMoveToTop}
          aria-label={`${t("compose.inspector.moveTop")}`}
        >
          ⤒ {t("compose.inspector.moveTop")}
        </button>
        <button
          type="button"
          className="btn small secondary"
          onClick={onMoveToBottom}
          aria-label={t("compose.inspector.moveBottom")}
        >
          ⤓ {t("compose.inspector.moveBottom")}
        </button>
        <button type="button" className="btn small danger" onClick={onDelete}>
          {t("compose.inspector.remove")}
        </button>
      </div>
    </div>
  );
}

/**
 * v0.6.7: "Connect to..." picker — shown inside the inspector
 * when the user clicks the + button. Lists every other block
 * with a "Connect" button. Already-connected targets are
 * labelled as such so the user knows the edge already exists.
 */
function ConnectingPicker({
  allBlocks,
  excludeId,
  existingConnections,
  onPick,
  onCancel,
}: {
  allBlocks: ComposeBlock[];
  excludeId: string;
  existingConnections: ComposeConnection[];
  onPick: (toId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const candidates = allBlocks.filter((b) => b.id !== excludeId);
  if (candidates.length === 0) {
    return (
      <p className="muted small">{t("compose.inspector.noConnections")}</p>
    );
  }
  return (
    <ul
      className="compose-connect-picker"
      role="listbox"
      aria-label={t("compose.inspector.connectTo", { label: "" })}
    >
      {candidates.map((b) => {
        const alreadyConnected = existingConnections.some(
          (c) => c.from === excludeId && c.to === b.id,
        );
        return (
          <li key={b.id}>
            <button
              type="button"
              className="btn small secondary compose-connect-picker-item"
              disabled={alreadyConnected}
              onClick={() => onPick(b.id)}
              title={b.label}
            >
              <span className="muted small">{KIND_LABEL_FOR(b.kind)}</span>
              <span className="compose-connect-picker-label">{b.label}</span>
              {alreadyConnected ? (
                <span className="muted small">✓</span>
              ) : (
                <span className="muted small">→</span>
              )}
            </button>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          className="btn small secondary"
          onClick={onCancel}
        >
          ✕ {t("compose.inspector.closeDrawer")}
        </button>
      </li>
    </ul>
  );
}

/** Helper: pull the i18n key for a kind label without an i18n
 * function (the picker is rendered above the BlockInspector t). */
function KIND_LABEL_FOR(kind: ComposeEntityKind): string {
  switch (kind) {
    case "session":
      return "💬";
    case "pack":
      return "📦";
    case "profile":
      return "🎛";
    case "policy":
      return "🛡";
    case "capability":
      return "🧩";
  }
}

/**
 * v0.6.7: list the edges touching this block (incoming +
 * outgoing) with per-edge disconnect buttons. Empty state
 * shows a "no connections yet" hint.
 *
 * v0.6.9: each edge now also gets an inline label editor
 * (text input for the free-text label + <select> for the
 * semantic kind). See `onUpdateLabel` in the props.
 */
export function ConnectionList({
  block,
  allBlocks,
  connections,
  onDisconnect,
  onUpdateLabel,
}: {
  block: ComposeBlock;
  allBlocks: ComposeBlock[];
  connections: ComposeConnection[];
  onDisconnect: (connectionId: string) => void;
  onUpdateLabel: (
    connectionId: string,
    label: string | undefined,
    kind: ConnectionLabelKind | undefined,
  ) => void;
}) {
  const t = useT();
  const outgoing = connections.filter((c) => c.from === block.id);
  const incoming = connections.filter((c) => c.to === block.id);
  const all = [
    ...outgoing.map((c) => ({
      c,
      other: allBlocks.find((b) => b.id === c.to),
      dir: "from" as const,
    })),
    ...incoming.map((c) => ({
      c,
      other: allBlocks.find((b) => b.id === c.from),
      dir: "to" as const,
    })),
  ];
  if (all.length === 0) {
    return (
      <p className="muted small">{t("compose.inspector.noConnections")}</p>
    );
  }
  return (
    <ul className="compose-connection-list">
      {all.map(({ c, other, dir }) => (
        <li key={c.id} className="compose-connection-item">
          <div className="compose-connection-item-header">
            <span className="muted small" aria-hidden="true">
              {dir === "from" ? "→" : "←"}
            </span>
            <span
              className="compose-connection-peer"
              title={other?.label ?? "?"}
            >
              {other?.label ?? "?"}
            </span>
            <button
              type="button"
              className="btn small secondary compose-connection-disconnect"
              onClick={() => onDisconnect(c.id)}
              aria-label={t("compose.inspector.disconnect")}
              title={t("compose.inspector.disconnect")}
            >
              ×
            </button>
          </div>
          <div className="compose-connection-item-editor">
            <input
              type="text"
              className="compose-connection-label-input"
              value={c.label ?? ""}
              placeholder={t("compose.inspector.connectionLabel.placeholder")}
              aria-label={t("compose.inspector.connectionLabel")}
              title={t("compose.connectionLabel.tooltip")}
              onChange={(e) =>
                onUpdateLabel(
                  c.id,
                  e.target.value === "" ? undefined : e.target.value,
                  c.kind,
                )
              }
            />
            <select
              className="compose-connection-kind-select"
              value={c.kind ?? ""}
              aria-label={t("compose.inspector.connectionLabel")}
              title={t("compose.connectionLabel.tooltip")}
              onChange={(e) => {
                const v = e.target.value;
                onUpdateLabel(
                  c.id,
                  c.label,
                  v === "" ? undefined : (v as ConnectionLabelKind),
                );
              }}
            >
              <option value="">
                {t("compose.inspector.connectionLabel.none")}
              </option>
              <option value="flows">
                {t("compose.connectionLabel.kind.flows")}
              </option>
              <option value="uses">
                {t("compose.connectionLabel.kind.uses")}
              </option>
              <option value="feeds">
                {t("compose.connectionLabel.kind.feeds")}
              </option>
              <option value="depends">
                {t("compose.connectionLabel.kind.depends")}
              </option>
              <option value="produces">
                {t("compose.connectionLabel.kind.produces")}
              </option>
              <option value="manual">
                {t("compose.connectionLabel.kind.manual")}
              </option>
            </select>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * v0.6.5: kind-specific real-entity field renderer. Shows the
 * fields that make the entity actually useful — not just the
 * cached label/sublabel.
 */
function InspectorDetailFields({ detail }: { detail: ComposeEntityDetail }) {
  const t = useT();
  switch (detail.kind) {
    case "session":
      return (
        <dl className="compose-inspector-fields">
          {detail.cwd ? (
            <>
              <dt>{t("compose.inspector.detail.cwd")}</dt>
              <dd className="mono small" title={detail.cwd}>
                {detail.cwd}
              </dd>
            </>
          ) : null}
          {detail.model ? (
            <>
              <dt>{t("compose.inspector.detail.model")}</dt>
              <dd>{detail.model}</dd>
            </>
          ) : null}
          <>
            <dt>{t("compose.inspector.detail.entries")}</dt>
            <dd>{detail.entries}</dd>
          </>
          <>
            <dt>{t("compose.inspector.detail.size")}</dt>
            <dd>{formatBytes(detail.sizeBytes)}</dd>
          </>
          {detail.startedAt ? (
            <>
              <dt>{t("compose.inspector.detail.firstUsed")}</dt>
              <dd className="mono small" title={detail.startedAt}>
                {formatRelative(detail.startedAt)}
              </dd>
            </>
          ) : null}
          {detail.lastUsedAt ? (
            <>
              <dt>{t("compose.inspector.detail.lastUsed")}</dt>
              <dd className="mono small" title={detail.lastUsedAt}>
                {formatRelative(detail.lastUsedAt)}
              </dd>
            </>
          ) : null}
          {detail.firstUserPreview ? (
            <>
              <dt>{t("compose.inspector.detail.preview")}</dt>
              <dd title={detail.firstUserPreview}>
                {detail.firstUserPreview.length > 80
                  ? `${detail.firstUserPreview.slice(0, 80)}…`
                  : detail.firstUserPreview}
              </dd>
            </>
          ) : null}
        </dl>
      );
    case "pack":
      return (
        <dl className="compose-inspector-fields">
          <dt>{t("compose.inspector.detail.source")}</dt>
          <dd className="mono small" title={detail.source}>
            {detail.source}
          </dd>
          <dt>{t("compose.inspector.detail.enabled")}</dt>
          <dd>{detail.enabled ? "✓" : "—"}</dd>
          <dt>{t("compose.inspector.detail.title")}</dt>
          <dd>{detail.name}</dd>
          <dt>{t("compose.inspector.field.kind")}</dt>
          <dd>{detail.packKind}</dd>
        </dl>
      );
    case "profile":
      return (
        <dl className="compose-inspector-fields">
          {detail.model ? (
            <>
              <dt>{t("compose.inspector.detail.model")}</dt>
              <dd>{detail.model}</dd>
            </>
          ) : null}
          {detail.provider ? (
            <>
              <dt>{t("compose.inspector.detail.provider")}</dt>
              <dd>{detail.provider}</dd>
            </>
          ) : null}
          {detail.thinking ? (
            <>
              <dt>{t("compose.inspector.detail.thinking")}</dt>
              <dd>{detail.thinking}</dd>
            </>
          ) : null}
          {detail.team ? (
            <>
              <dt>{t("compose.inspector.detail.team")}</dt>
              <dd>{detail.team}</dd>
            </>
          ) : null}
          {detail.description ? (
            <>
              <dt>{t("compose.inspector.detail.description")}</dt>
              <dd>{detail.description}</dd>
            </>
          ) : null}
          <dt>{t("compose.inspector.detail.packages")}</dt>
          <dd className="mono small" title={detail.packages.join("\n")}>
            {detail.packages.length > 0
              ? detail.packages.join(", ")
              : t("compose.inspector.detail.noneCount")}
          </dd>
        </dl>
      );
    case "policy":
      return (
        <dl className="compose-inspector-fields">
          {detail.description ? (
            <>
              <dt>{t("compose.inspector.detail.description")}</dt>
              <dd>{detail.description}</dd>
            </>
          ) : null}
          {renderRuleList(t, t("compose.inspector.detail.allow"), detail.allow)}
          {renderRuleList(t, t("compose.inspector.detail.deny"), detail.deny)}
          {renderRuleList(
            t,
            t("compose.inspector.detail.denyPaths"),
            detail.denyPaths,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.denyCommands"),
            detail.denyCommands,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.sensitivePatterns"),
            detail.sensitivePatterns,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.requireApproval"),
            detail.requireApproval,
          )}
        </dl>
      );
    case "capability":
      return (
        <dl className="compose-inspector-fields">
          {detail.title ? (
            <>
              <dt>{t("compose.inspector.detail.title")}</dt>
              <dd>{detail.title}</dd>
            </>
          ) : null}
          {detail.type ? (
            <>
              <dt>{t("compose.inspector.detail.type")}</dt>
              <dd>{detail.type}</dd>
            </>
          ) : null}
          {detail.description ? (
            <>
              <dt>{t("compose.inspector.detail.description")}</dt>
              <dd>{detail.description}</dd>
            </>
          ) : null}
          {renderRuleList(
            t,
            t("compose.inspector.detail.sources"),
            detail.sources.map((s) => s.ref),
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.conflicts"),
            detail.conflicts,
          )}
          {renderRuleList(
            t,
            t("compose.inspector.detail.requires"),
            detail.requires,
          )}
        </dl>
      );
  }
}

function renderRuleList(
  t: (k: string) => string,
  label: string,
  items: string[],
) {
  return (
    <>
      <dt>
        {label} ({items.length})
      </dt>
      <dd
        className="small"
        title={
          items.length > 0
            ? items.join("\n")
            : t("compose.inspector.detail.noneCount")
        }
      >
        {items.length > 0
          ? items.join(", ")
          : t("compose.inspector.detail.noneCount")}
      </dd>
    </>
  );
}

/** Format bytes as KB / MB so the inspector shows something readable. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format an ISO timestamp as a short relative time. Avoids a
 * runtime dep on a date-fns-style library — the inspector is a
 * small surface, "3 days ago" is enough.
 */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}
