import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { LiveBadge } from "@/components/admin/LiveBadge";
import { useRealtime } from "@/hooks/useRealtime";
import { exportToCsv } from "@/utils/csvExport";

type Log = {
  id: string; admin_user_id: string; action: string;
  target_type: string | null; target_id: string | null;
  ip_address: string | null; user_agent: string | null;
  details: any; created_at: string;
};

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  view: { bg: "rgba(59,130,246,0.1)", fg: "#3B82F6" },
  update: { bg: "rgba(139,105,20,0.1)", fg: "#8B6914" },
  delete: { bg: "rgba(196,30,30,0.1)", fg: "#C41E1E" },
  create: { bg: "rgba(16,185,129,0.1)", fg: "#1F5A46" },
  login: { bg: "rgba(59,130,246,0.1)", fg: "#3B82F6" },
  grant: { bg: "rgba(16,185,129,0.1)", fg: "#1F5A46" },
  revoke: { bg: "rgba(196,30,30,0.1)", fg: "#C41E1E" },
};

function colorFor(action: string) {
  const k = Object.keys(ACTION_COLORS).find((p) => action?.toLowerCase().includes(p));
  return k ? ACTION_COLORS[k] : { bg: "rgba(23,18,8,0.06)", fg: "hsl(var(--fyn-ink))" };
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState<Log | null>(null);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setLogs((data as Log[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const liveStatus = useRealtime(
    "audit_logs_changes",
    [{ table: "admin_audit_logs", event: "INSERT" }],
    ({ new: row, eventType }) => {
      if (eventType === "POLL") { fetchLogs(); return; }
      if (row) setLogs((prev) => [row as Log, ...prev].slice(0, 200));
    },
  );


  const types = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.action && set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (type !== "all" && l.action !== type) return false;
      if (!s) return true;
      return [l.action, l.target_type, l.target_id, l.admin_user_id]
        .some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [logs, q, type]);

  const exportLogs = () => {
    exportToCsv(visible.map((l) => ({
      timestamp: new Date(l.created_at).toLocaleString(),
      admin_user_id: l.admin_user_id,
      action: l.action,
      target_type: l.target_type ?? "",
      target_id: l.target_id ?? "",
      details: JSON.stringify(l.details ?? {}),
    })), "fynhelp-audit-logs");
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader title="Audit Logs" subtitle="Every admin action, immutable & timestamped" />
        <div className="flex items-center gap-2">
          <LiveBadge status={liveStatus} />
          <button onClick={exportLogs} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:opacity-80"
            style={{ background: "rgba(139,105,20,0.1)", border: "1px solid rgba(139,105,20,0.2)", fontFamily: "Raleway, sans-serif", fontSize: 13, fontWeight: 600, color: "#8B6914" }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative" style={{ minWidth: 240, flex: "1 1 280px" }}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color="hsl(var(--fyn-ink) / 0.4)" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search action, admin, target…"
              style={{
                width: "100%", height: 48, padding: "0 14px 0 38px", borderRadius: 12,
                border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
                fontFamily: "Roboto, sans-serif", fontSize: 15, color: "hsl(var(--fyn-ink))", outline: "none",
              }}
            />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)}
            style={{
              height: 48, padding: "0 14px", borderRadius: 12,
              border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
              fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))", minWidth: 200,
            }}>
            <option value="all">All actions</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(23,18,8,0.04)", borderBottom: "2px solid rgba(139,105,20,0.2)" }}>
                {["Timestamp","Admin","Action","Target","IP","Details"].map((h) => (
                  <th key={h} style={{ padding: 16, textAlign: "left", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", fontFamily: "Roboto, sans-serif", color: "hsl(var(--fyn-ink) / 0.5)" }}>Loading logs…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", fontFamily: "Roboto, sans-serif", color: "hsl(var(--fyn-ink) / 0.5)" }}>No audit logs match these filters.</td></tr>
              )}
              {visible.map((l, i) => {
                const c = colorFor(l.action);
                return (
                  <tr key={l.id} onClick={() => setOpen(l)}
                    style={{
                      background: i % 2 ? "rgba(244,237,218,0.3)" : "#fff",
                      borderBottom: "1px solid rgba(23,18,8,0.06)",
                      borderLeft: `4px solid ${c.fg}`,
                      cursor: "pointer",
                    }}>
                    <td style={cell}>{new Date(l.created_at).toLocaleString("en-IN")}</td>
                    <td style={cell}>{l.admin_user_id.slice(0, 8)}…</td>
                    <td style={cell}>
                      <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: c.bg, color: c.fg, fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 12 }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={cell}>{l.target_type ? `${l.target_type}${l.target_id ? ` · ${l.target_id.slice(0, 8)}…` : ""}` : "-"}</td>
                    <td style={cell}>{l.ip_address ?? "-"}</td>
                    <td style={cell}>
                      <button onClick={(e) => { e.stopPropagation(); setOpen(l); }}
                        style={{ color: "#8B6914", background: "transparent", border: "none", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setOpen(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl"
            style={{
              background: "rgba(255,255,255,0.98)", backdropFilter: "blur(20px)",
              borderRadius: 20, border: "1px solid rgba(139,105,20,0.2)",
              boxShadow: "0 24px 60px rgba(23,18,8,0.25)", maxHeight: "85vh", overflow: "auto",
            }}>
            <div className="flex items-start justify-between p-6"
              style={{ borderBottom: "1px solid rgba(23,18,8,0.08)" }}>
              <div>
                <h3 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 24, color: "hsl(var(--fyn-ink))" }}>
                  Audit Log Detail
                </h3>
                <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>
                  {new Date(open.created_at).toLocaleString("en-IN")}
                </p>
              </div>
              <button onClick={() => setOpen(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <X size={22} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <DetailRow label="Action" value={open.action} />
              <DetailRow label="Admin User" value={open.admin_user_id} />
              <DetailRow label="Target" value={open.target_type ? `${open.target_type} · ${open.target_id ?? "-"}` : "-"} />
              <DetailRow label="IP Address" value={open.ip_address ?? "-"} />
              <DetailRow label="User Agent" value={open.user_agent ?? "-"} />
              <div>
                <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.55)", marginBottom: 6 }}>
                  Details
                </div>
                <pre style={{
                  background: "#171208", color: "#F4EDDA", borderRadius: 12, padding: 16,
                  fontFamily: "JetBrains Mono, monospace", fontSize: 12, overflow: "auto",
                }}>{JSON.stringify(open.details ?? {}, null, 2)}</pre>
              </div>
            </div>
            <div className="flex justify-end p-6"
              style={{ borderTop: "1px solid rgba(23,18,8,0.08)" }}>
              <button onClick={() => setOpen(null)}
                style={{
                  height: 44, padding: "0 22px", borderRadius: 12, background: "transparent",
                  border: "2px solid rgba(23,18,8,0.15)", color: "hsl(var(--fyn-ink))",
                  fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px,1fr] gap-3 items-start"
      style={{ paddingBottom: 10, borderBottom: "1px solid rgba(23,18,8,0.06)" }}>
      <span style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.55)" }}>{label}</span>
      <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 500, fontSize: 13, color: "hsl(var(--fyn-ink))", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "14px 16px", fontFamily: "Roboto, sans-serif", fontSize: 14,
  color: "hsl(var(--fyn-ink) / 0.85)", verticalAlign: "middle",
};
