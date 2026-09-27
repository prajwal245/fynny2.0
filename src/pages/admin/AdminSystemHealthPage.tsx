import { useEffect, useState, useCallback } from "react";
import { Database, Bot, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, AlertOctagon, CalendarRange } from "lucide-react";
import { Card, PageHeader } from "./AdminDashboardPage";
import { EmptyState } from "@/components/admin/EmptyState";
import { supabase } from "@/integrations/supabase/client";

type ServiceStatus = "operational" | "degraded" | "down" | "unknown";
type Service = {
  key: string;
  name: string;
  icon: typeof Database;
  status: ServiceStatus;
  responseMs: number | null;
  detail: string;
};

const STATUS_META: Record<ServiceStatus, { color: string; bg: string; label: string; icon: typeof CheckCircle2 }> = {
  operational: { color: "#0F7B4F", bg: "rgba(16,185,129,0.12)", label: "Operational", icon: CheckCircle2 },
  degraded:    { color: "#B45309", bg: "rgba(245,158,11,0.15)", label: "Degraded",    icon: AlertTriangle },
  down:        { color: "#C41E1E", bg: "rgba(196,30,30,0.15)",  label: "Down",        icon: XCircle },
  unknown:     { color: "#6B7280", bg: "rgba(107,114,128,0.12)", label: "Unknown",    icon: AlertTriangle },
};

async function pingDatabase(): Promise<{ status: ServiceStatus; ms: number | null; detail: string }> {
  const start = performance.now();
  try {
    const { error } = await supabase.from("profiles").select("user_id", { count: "exact", head: true }).limit(1);
    const ms = Math.round(performance.now() - start);
    if (error) return { status: "down", ms, detail: error.message };
    if (ms > 1500) return { status: "degraded", ms, detail: "High latency" };
    return { status: "operational", ms, detail: "Query OK" };
  } catch (e: any) {
    return { status: "down", ms: null, detail: e?.message ?? "Unreachable" };
  }
}

async function pingAuth(): Promise<{ status: ServiceStatus; ms: number | null; detail: string }> {
  const start = performance.now();
  try {
    const { error } = await supabase.auth.getSession();
    const ms = Math.round(performance.now() - start);
    if (error) return { status: "down", ms, detail: error.message };
    return { status: "operational", ms, detail: "Auth reachable" };
  } catch (e: any) {
    return { status: "down", ms: null, detail: e?.message ?? "Unreachable" };
  }
}

export default function AdminSystemHealthPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [db, auth] = await Promise.all([pingDatabase(), pingAuth()]);
    setServices([
      { key: "db",   name: "Lovable Cloud Database", icon: Database, status: db.status,   responseMs: db.ms,   detail: db.detail },
      { key: "auth", name: "Authentication",        icon: Bot,      status: auth.status, responseMs: auth.ms, detail: auth.detail },
    ]);
    setLastChecked(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const degradedCount = services.filter((s) => s.status !== "operational" && s.status !== "unknown").length;
  const overall: ServiceStatus = services.length === 0
    ? "unknown"
    : services.some((s) => s.status === "down") ? "down"
    : degradedCount > 0 ? "degraded"
    : "operational";
  const Banner = STATUS_META[overall].icon;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <PageHeader title="System Health" subtitle="Live status of core platform services" />
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50"
          style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))" }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl p-5 mb-6 flex items-center gap-4"
        style={{ background: STATUS_META[overall].bg, border: `1px solid ${STATUS_META[overall].color}33` }}>
        <Banner size={32} color={STATUS_META[overall].color} />
        <div className="flex-1">
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: STATUS_META[overall].color }}>
            {overall === "operational" && "All Systems Operational"}
            {overall === "degraded" && `${degradedCount} Service${degradedCount > 1 ? "s" : ""} Degraded`}
            {overall === "down" && "Service Disruption"}
            {overall === "unknown" && "Checking…"}
          </div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)" }}>
            {lastChecked ? `Last checked ${lastChecked.toLocaleTimeString()}` : "Running checks…"} · auto-refresh every 60s
          </div>
        </div>
      </div>

      {/* Service status grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {services.map((s) => {
          const Icon = s.icon;
          const meta = STATUS_META[s.status];
          return (
            <Card key={s.key}>
              <div className="flex items-start justify-between mb-3">
                <span className="grid place-items-center rounded-2xl" style={{ width: 48, height: 48, background: "rgba(139,105,20,0.1)" }}>
                  <Icon size={24} color="#8B6914" />
                </span>
                <span style={{ padding: "3px 9px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
              </div>
              <div style={{ fontFamily: "Raleway, sans-serif", fontWeight: 700, fontSize: 16, color: "hsl(var(--fyn-ink))" }}>{s.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-3" style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12 }}>
                <div>
                  <div style={{ color: "hsl(var(--fyn-ink) / 0.5)" }}>Response</div>
                  <div style={{ color: "hsl(var(--fyn-ink))", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                    {s.responseMs != null ? `${s.responseMs}ms` : "-"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "hsl(var(--fyn-ink) / 0.5)" }}>Status</div>
                  <div style={{ color: "hsl(var(--fyn-ink))", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                    {s.status}
                  </div>
                </div>
              </div>
              <div className="mt-2" style={{ fontFamily: "Roboto, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.55)" }}>
                {s.detail}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Response time history, no historical store yet */}
      <Card className="mb-6">
        <h2 className="mb-2" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>
          Response Time History
        </h2>
        <EmptyState
          icon={Activity}
          title="Historical metrics coming soon"
          hint="Latency is measured live on each refresh. Long-term trends will appear once a metrics store is wired up."
        />
      </Card>

      {/* Error log, no error log table yet */}
      <Card className="mb-6">
        <h2 className="mb-2" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>
          Recent Errors
        </h2>
        <EmptyState
          icon={AlertOctagon}
          title="No errors recorded"
          hint="Centralised error logging will surface here once wired up."
        />
      </Card>

      {/* 30-day uptime, no uptime history yet */}
      <Card>
        <h2 className="mb-2" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>
          30-Day Uptime
        </h2>
        <EmptyState
          icon={CalendarRange}
          title="Uptime history coming soon"
          hint="Daily uptime will appear here once status snapshots are being recorded."
        />
      </Card>
    </div>
  );
}
