/**
 * Shared primitives for the CA operating system modules.
 * Every module in the A-to-Z architecture composes from these so queues,
 * confidence, evidence and sign-off look and behave identically.
 */
import { CSSProperties, ReactNode } from "react";
import { CA, CABadge, CACard, CAEmpty, Tone, caTd, caTh } from "@/components/ca/portalUi";
import { useCARole, type CAPermission } from "@/hooks/useCARole";

export function ModuleHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
      <div>
        <h1 style={{ fontFamily: CA.serif, fontSize: 24, fontWeight: 700, color: CA.ink, letterSpacing: "-0.01em" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 6, maxWidth: 720 }}>{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function ConfidenceChip({ value }: { value: number | null | undefined }) {
  const v = Number(value ?? 0);
  const pct = v <= 1 ? Math.round(v * 100) : Math.round(v);
  const tone: Tone = pct >= 85 ? "green" : pct >= 60 ? "amber" : "red";
  return <CABadge tone={tone}>{pct}% confidence</CABadge>;
}

const REVIEW_TONES: Record<string, Tone> = {
  pending: "amber",
  auto_accepted: "teal",
  needs_review: "amber",
  reviewed: "teal",
  posted: "green",
  rejected: "red",
  failed: "red",
  open: "amber",
  in_progress: "teal",
  done: "green",
  closed: "green",
  overdue: "red",
};

export function StateChip({ value }: { value: string | null | undefined }) {
  const v = (value ?? "unknown").toLowerCase();
  return <CABadge tone={REVIEW_TONES[v] ?? "grey"}>{v.replace(/_/g, " ")}</CABadge>;
}

export function QueueTable({
  columns,
  rows,
  empty,
  emptyHint,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty: string;
  emptyHint?: string;
}) {
  if (!rows.length) return <CAEmpty title={empty} hint={emptyHint} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={caTh}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={caTd}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))`, gap: 12, marginBottom: 20 }}>
      {items.map((it) => (
        <CACard key={it.label} style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: CA.faint }}>
            {it.label}
          </div>
          <div style={{ fontFamily: CA.serif, fontSize: 24, fontWeight: 700, color: CA.ink, marginTop: 6 }}>{it.value}</div>
        </CACard>
      ))}
    </div>
  );
}

/** Renders children only when the signed-in member holds the permission. */
export function Gate({ permission, children, fallback = null }: { permission: CAPermission; children: ReactNode; fallback?: ReactNode }) {
  const { can, isLoading } = useCARole();
  if (isLoading) return null;
  return <>{can(permission) ? children : fallback}</>;
}

export function PermissionNotice({ permission }: { permission: string }) {
  return (
    <CACard style={{ padding: 20 }}>
      <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>
        Your role does not include the <strong style={{ color: CA.ink }}>{permission.replace(/_/g, " ")}</strong> permission. Ask a
        Partner or Manager at your firm for access.
      </div>
    </CACard>
  );
}

/**
 * Shell for architecture modules that are routed and role-gated but not yet
 * backed by a live data source. Never renders fabricated figures.
 */
export function ModuleInBuild({
  title,
  subtitle,
  capabilities,
  dependsOn,
}: {
  title: string;
  subtitle: string;
  capabilities: string[];
  dependsOn?: string;
}) {
  return (
    <div>
      <ModuleHeader title={title} subtitle={subtitle} right={<CABadge tone="amber">In build</CABadge>} />
      <CACard style={{ padding: 24 }}>
        <div style={{ fontFamily: CA.sans, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CA.faint }}>
          Planned capabilities
        </div>
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
          {capabilities.map((c) => (
            <li key={c} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: CA.sans, fontSize: 13.5, color: CA.ink }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: CA.teal, marginTop: 7, flexShrink: 0 }} />
              <span>{c}</span>
            </li>
          ))}
        </ul>
        {dependsOn && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${CA.line}`, fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
            Depends on: {dependsOn}
          </div>
        )}
        <div style={{ marginTop: 14, fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
          This module is intentionally empty until it has a real data source — no sample figures are shown.
        </div>
      </CACard>
    </div>
  );
}

export function AuditTimeline({
  events,
}: {
  events: { id: string; action: string; entity_type: string; created_at: string; actor_role: string | null; detail: unknown }[];
}) {
  if (!events.length) return <CAEmpty title="No activity yet" hint="Actions across this firm appear here as they happen." />;
  return (
    <div style={{ display: "grid", gap: 0 }}>
      {events.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: `0.5px solid ${CA.line}` }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: CA.teal, marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: CA.sans, fontSize: 13.5, fontWeight: 600, color: CA.ink }}>
              {e.action.replace(/_/g, " ")} · <span style={{ fontWeight: 500, color: CA.muted }}>{e.entity_type}</span>
            </div>
            <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 2 }}>
              {new Date(e.created_at).toLocaleString("en-IN")}
              {e.actor_role ? ` · ${e.actor_role}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export const caSectionGap: CSSProperties = { marginBottom: 20 };
