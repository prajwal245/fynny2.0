import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, Building2, Ban, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { EmptyState } from "@/components/admin/EmptyState";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";

type Row = {
  business_id: string;
  business_name: string;
  daily_limit: number;
  used_today: number;
  remaining: number;
  used_7d: number;
  used_30d: number;
  blocked_today: number;
  last_used_at: string | null;
};

const LOW_CREDIT_PCT = 80; // >= 80% of the daily allowance used = low credit

export default function AdminAICreditsPage() {
  const { hasRole } = useAdminAuth();
  const canEditLimits = hasRole("super_admin", "ops_admin", "admin");

  const [rows, setRows] = useState<Row[]>([]);
  const [defaultLimit, setDefaultLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [overview, limits] = await Promise.all([
      supabase.rpc("admin_ai_usage_overview"),
      supabase.from("ai_usage_limits").select("daily_request_limit").is("business_id", null).maybeSingle(),
    ]);
    if (overview.error) toast.error(overview.error.message);
    setRows((overview.data as Row[]) ?? []);
    setDefaultLimit((limits.data as { daily_request_limit?: number } | null)?.daily_request_limit ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pctOf = (r: Row) => (r.daily_limit > 0 ? Math.min(100, Math.round((r.used_today / r.daily_limit) * 100)) : 0);

  const totals = useMemo(() => {
    const low = rows.filter((r) => pctOf(r) >= LOW_CREDIT_PCT);
    return {
      businesses: rows.length,
      usedToday: rows.reduce((a, r) => a + r.used_today, 0),
      low: low.length,
      blocked: rows.reduce((a, r) => a + r.blocked_today, 0),
    };
  }, [rows]);

  const alerts = useMemo(
    () => rows.filter((r) => pctOf(r) >= LOW_CREDIT_PCT).sort((a, b) => pctOf(b) - pctOf(a)),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.business_name.toLowerCase().includes(needle) || r.business_id.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  async function saveLimit(businessId: string, value: number) {
    if (!Number.isFinite(value) || value < 1 || value > 100000) {
      toast.error("Enter a daily limit between 1 and 100000");
      return;
    }
    setSaving(businessId);
    const { error } = await supabase
      .from("ai_usage_limits")
      .upsert({ business_id: businessId, daily_request_limit: Math.round(value) }, { onConflict: "business_id" });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Daily AI limit updated");
    void load();
  }

  return (
    <div>
      <PageHeader
        title="AI Credits & Usage"
        subtitle="Per-business AI request usage against the daily allowance (resets midnight IST)"
      />

      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Metric label="Businesses using AI" value={loading ? "…" : String(totals.businesses)} icon={<Building2 size={22} color="#8B6914" />} />
        <Metric label="AI requests today" value={loading ? "…" : totals.usedToday.toLocaleString("en-IN")} icon={<Gauge size={22} color="#8B6914" />} />
        <Metric label="Low credit alerts" value={loading ? "…" : String(totals.low)} icon={<AlertTriangle size={22} color={totals.low ? "#C41E1E" : "#8B6914"} />} tone={totals.low ? "danger" : undefined} />
        <Metric label="Blocked today (over limit)" value={loading ? "…" : String(totals.blocked)} icon={<Ban size={22} color={totals.blocked ? "#C41E1E" : "#8B6914"} />} tone={totals.blocked ? "danger" : undefined} />
      </div>

      {!loading && alerts.length > 0 && (
        <Card style={{ marginTop: 32, padding: 24, borderLeft: "4px solid #C41E1E" }}>
          <h3 style={{ ...h3Style, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color="#C41E1E" /> Low AI credit ({alerts.length})
          </h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {alerts.slice(0, 8).map((r) => (
              <div key={r.business_id} style={{ background: "rgba(196,30,30,0.05)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.business_name}</div>
                <div style={{ fontSize: 13, color: "#6B5B4A", marginTop: 2 }}>
                  {r.used_today} of {r.daily_limit} used · {r.remaining} left
                  {r.blocked_today > 0 && ` · ${r.blocked_today} blocked`}
                </div>
                <Bar pct={pctOf(r)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: "#9A8778" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business name or ID"
            style={{
              width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10,
              border: "1px solid rgba(23,18,8,0.14)", background: "#fff", fontSize: 14,
            }}
          />
        </div>
        <button onClick={() => void load()} style={btnStyle}>
          <RefreshCw size={14} /> Refresh
        </button>
        <span style={{ fontSize: 13, color: "#6B5B4A" }}>
          Default allowance: {defaultLimit ?? "—"} requests/business/day
        </span>
      </div>

      <Card style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24, color: "#6B5B4A" }}>Loading usage…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Gauge} title="No AI usage recorded" hint="Rows appear once a business sends AI requests." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "rgba(23,18,8,0.04)" }}>
                  {["Business", "Today", "Usage", "Remaining", "7d", "30d", "Daily limit"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const pct = pctOf(r);
                  return (
                    <tr key={r.business_id} style={{ borderTop: "1px solid rgba(23,18,8,0.06)", background: i % 2 ? "rgba(244,237,218,0.3)" : "#fff" }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{r.business_name}</div>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9A8778" }}>
                          {r.business_id.slice(0, 8)}…
                        </div>
                      </td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.used_today}</td>
                      <td style={{ ...td, minWidth: 170 }}>
                        <Bar pct={pct} />
                        <span style={{ fontSize: 12, color: pct >= LOW_CREDIT_PCT ? "#C41E1E" : "#6B5B4A" }}>{pct}%</span>
                      </td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums", color: r.remaining === 0 ? "#C41E1E" : undefined, fontWeight: r.remaining === 0 ? 700 : 400 }}>
                        {r.remaining}
                      </td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.used_7d}</td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.used_30d}</td>
                      <td style={td}>
                        {canEditLimits ? (
                          <LimitEditor
                            value={r.daily_limit}
                            busy={saving === r.business_id}
                            onSave={(v) => saveLimit(r.business_id, v)}
                          />
                        ) : (
                          r.daily_limit
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function LimitEditor({ value, busy, onSave }: { value: number; busy: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  const dirty = String(value) !== v.trim();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        value={v}
        inputMode="numeric"
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
        style={{ width: 72, padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(23,18,8,0.14)", fontSize: 13 }}
      />
      {dirty && (
        <button disabled={busy} onClick={() => onSave(Number(v))} style={{ ...btnStyle, padding: "6px 10px", fontSize: 12 }}>
          {busy ? "…" : "Save"}
        </button>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "#C41E1E" : pct >= LOW_CREDIT_PCT ? "#EAC43C" : "#1F5A46";
  return (
    <div style={{ height: 6, borderRadius: 999, background: "rgba(23,18,8,0.08)", overflow: "hidden", margin: "6px 0 4px" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "danger" }) {
  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, color: "#6B5B4A", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: tone === "danger" ? "#C41E1E" : "#171208", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </div>
        </div>
        {icon}
      </div>
    </Card>
  );
}

const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "#171208" };
const th: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "#6B5B4A", textTransform: "uppercase", letterSpacing: "0.04em" };
const td: React.CSSProperties = { padding: "12px 16px", fontSize: 14, color: "#171208" };
const btnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10,
  border: "1px solid rgba(23,18,8,0.14)", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
