import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Users, DollarSign, Clock, Bot, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { EmptyState } from "@/components/admin/EmptyState";

type Log = {
  id: string; user_id: string | null; business_id: string | null;
  prompt: string; model: string; cost_usd: number | null;
  response_time_ms: number | null; status: string; error_message: string | null;
  created_at: string;
};

export default function AdminAIMonitoringPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("ai_usage_logs")
        .select("id,user_id,business_id,prompt,model,cost_usd,response_time_ms,status,error_message,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false }).limit(2000);
      if (cancelled) return;
      setLogs((data as Log[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const metrics = useMemo(() => {
    if (logs.length === 0) return { queries: 0, users: 0, cost: 0, avgMs: 0 };
    const users = new Set(logs.map((l) => l.user_id).filter(Boolean)).size;
    const cost = logs.reduce((a, l) => a + Number(l.cost_usd ?? 0), 0);
    const avgMs = logs.reduce((a, l) => a + Number(l.response_time_ms ?? 0), 0) / logs.length;
    return { queries: logs.length, users, cost, avgMs };
  }, [logs]);

  const dailyData = useMemo(() => {
    const byDay: Record<string, { queries: number; cost: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      byDay[d] = { queries: 0, cost: 0 };
    }
    for (const l of logs) {
      const d = l.created_at.slice(0, 10);
      if (!byDay[d]) byDay[d] = { queries: 0, cost: 0 };
      byDay[d].queries += 1;
      byDay[d].cost += Number(l.cost_usd ?? 0);
    }
    return Object.entries(byDay).map(([date, v]) => ({
      d: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      queries: v.queries,
      cost: Number(v.cost.toFixed(2)),
    }));
  }, [logs]);

  const topUsers = useMemo(() => {
    const map: Record<string, { user: string; queries: number; totalMs: number; cost: number }> = {};
    for (const l of logs) {
      const k = l.user_id ?? "anon";
      if (!map[k]) map[k] = { user: k, queries: 0, totalMs: 0, cost: 0 };
      map[k].queries += 1;
      map[k].totalMs += Number(l.response_time_ms ?? 0);
      map[k].cost += Number(l.cost_usd ?? 0);
    }
    return Object.values(map).sort((a, b) => b.queries - a.queries).slice(0, 10);
  }, [logs]);

  const responseBuckets = useMemo(() => {
    const b = [
      { b: "0-1s", v: 0, c: "#1F5A46" },
      { b: "1-2s", v: 0, c: "#1F5A46" },
      { b: "2-3s", v: 0, c: "#1F5A46" },
      { b: "3-5s", v: 0, c: "#EAC43C" },
      { b: "5-10s", v: 0, c: "#EAC43C" },
      { b: "10s+", v: 0, c: "#C41E1E" },
    ];
    for (const l of logs) {
      const s = Number(l.response_time_ms ?? 0) / 1000;
      const i = s < 1 ? 0 : s < 2 ? 1 : s < 3 ? 2 : s < 5 ? 3 : s < 10 ? 4 : 5;
      b[i].v += 1;
    }
    return b;
  }, [logs]);

  const successPie = useMemo(() => {
    let success = 0, failed = 0, timeout = 0;
    for (const l of logs) {
      if (l.status === "success") success += 1;
      else if (l.status === "timeout") timeout += 1;
      else failed += 1;
    }
    const total = success + failed + timeout || 1;
    const pct = (n: number) => Number(((n / total) * 100).toFixed(1));
    return {
      success, failed, timeout, total: success + failed + timeout,
      data: [
        { name: "Success", value: pct(success) },
        { name: "Failed", value: pct(failed) },
        { name: "Timeout", value: pct(timeout) },
      ].filter((x) => x.value > 0),
      successPct: pct(success),
    };
  }, [logs]);

  const recentErrors = useMemo(
    () => logs.filter((l) => l.status !== "success").slice(0, 10),
    [logs]
  );

  return (
    <div>
      <PageHeader title="AI System Monitoring" subtitle="Track Lovable AI usage, cost, and performance" />

      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Metric label="Total AI Queries (30d)" value={loading ? "…" : metrics.queries.toLocaleString("en-IN")} icon={<MessageCircle size={22} color="#8B6914" />} />
        <Metric label="Active AI Users" value={loading ? "…" : String(metrics.users)} icon={<Users size={22} color="#8B6914" />} />
        <Metric label="Total AI Cost (USD)" value={loading ? "…" : `$${metrics.cost.toFixed(2)}`} icon={<DollarSign size={22} color="#8B6914" />} />
        <Metric label="Avg Response Time" value={loading ? "…" : metrics.avgMs ? `${(metrics.avgMs / 1000).toFixed(1)}s` : "-"} icon={<Clock size={22} color="#8B6914" />} />
      </div>

      <Card style={{ marginTop: 32, padding: 32, height: 400 }}>
        <h3 style={h3Style}>AI Usage (Last 30 days)</h3>
        <div style={{ width: "100%", height: 310 }}>
          {loading ? <Skel /> : logs.length === 0 ? (
            <EmptyState icon={Bot} title="No AI usage yet" hint="Charts will populate as users send queries to Fynny." />
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={dailyData}>
                <defs>
                  <linearGradient id="aiCost" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8B6914" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8B6914" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                <XAxis dataKey="d" tickLine={false} axisLine={false} style={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} style={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} style={{ fontSize: 11 }} unit="$" />
                <Tooltip contentStyle={tip} />
                <Legend />
                <Area yAxisId="right" type="monotone" dataKey="cost" name="Cost (USD)" stroke="#8B6914" strokeWidth={2} fill="url(#aiCost)" />
                <Line yAxisId="left" type="monotone" dataKey="queries" name="Queries" stroke="#C41E1E" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Section title="Top AI Users">
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {loading ? <div className="p-6"><Skel /></div> : topUsers.length === 0 ? (
            <EmptyState icon={Users} title="No AI users yet" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(23,18,8,0.04)" }}>
                  {["User ID", "Queries", "Avg Time", "Total Cost"].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u, i) => (
                  <tr key={u.user} style={{ borderTop: "1px solid rgba(23,18,8,0.06)", background: i % 2 ? "rgba(244,237,218,0.3)" : "#fff" }}>
                    <td style={{ ...td, fontFamily: "JetBrains Mono, monospace" }}>{u.user.slice(0, 12)}…</td>
                    <td style={td}>{u.queries.toLocaleString("en-IN")}</td>
                    <td style={td}>{(u.totalMs / u.queries / 1000).toFixed(1)}s</td>
                    <td style={td}>${u.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Section>

      <Section title="Performance Metrics">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card style={{ height: 340 }}>
            <h4 style={h4Style}>Response Time Distribution</h4>
            <div style={{ width: "100%", height: 270 }}>
              {loading ? <Skel /> : logs.length === 0 ? (
                <EmptyState icon={Clock} title="No response data yet" />
              ) : (
                <ResponsiveContainer>
                  <BarChart data={responseBuckets}>
                    <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                    <XAxis dataKey="b" tickLine={false} axisLine={false} style={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tip} />
                    <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                      {responseBuckets.map((r, i) => <Cell key={i} fill={r.c} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card style={{ height: 340, position: "relative" }}>
            <h4 style={h4Style}>Success vs Failure</h4>
            <div style={{ width: "100%", height: 270 }}>
              {loading ? <Skel /> : successPie.total === 0 ? (
                <EmptyState icon={Bot} title="No queries yet" />
              ) : (
                <>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={105} data={successPie.data}>
                        {["#1F5A46", "#C41E1E", "#EAC43C"].map((c, i) => <Cell key={i} fill={c} />)}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "55%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 24, color: "hsl(var(--fyn-ink))" }}>{successPie.successPct}%</div>
                    <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)" }}>Success</div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Recent Errors">
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {loading ? <div className="p-6"><Skel /></div> : recentErrors.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No errors recorded" hint="AI failures and timeouts will appear here." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(23,18,8,0.04)" }}>
                  {["Timestamp", "User", "Status", "Error", "Response Time"].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((l, i) => (
                  <tr key={l.id} style={{ borderTop: "1px solid rgba(23,18,8,0.06)", background: i % 2 ? "rgba(244,237,218,0.3)" : "#fff" }}>
                    <td style={td}>{new Date(l.created_at).toLocaleString("en-IN")}</td>
                    <td style={{ ...td, fontFamily: "JetBrains Mono, monospace" }}>{l.user_id ? l.user_id.slice(0, 8) + "…" : "-"}</td>
                    <td style={td}>{l.status}</td>
                    <td style={td}>{l.error_message ?? "-"}</td>
                    <td style={td}>{l.response_time_ms ? `${(l.response_time_ms / 1000).toFixed(1)}s` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Section>

      <Section title="Common Queries">
        <Card><EmptyState icon={MessageCircle} title="Query analytics not enabled" hint="Top queries across all users require an aggregation pipeline that hasn't been wired up yet." /></Card>
      </Section>

      <Section title="Cost Analysis by Plan">
        <Card><EmptyState icon={DollarSign} title="No cost-by-plan breakdown yet" hint="This will appear once we have active subscriptions paired with AI usage." /></Card>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10"><h3 style={h3Style}>{title}</h3>{children}</section>;
}
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card style={{ minHeight: 140 }}>
      <span className="grid place-items-center rounded-full"
        style={{ width: 48, height: 48, background: "linear-gradient(135deg, rgba(196,30,30,0.1), rgba(139,105,20,0.1))" }}>{icon}</span>
      <div className="mt-4" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 36, color: "hsl(var(--fyn-ink))", lineHeight: 1 }}>{value}</div>
      <div className="mt-2" style={{ fontFamily: "Raleway, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}>{label}</div>
    </Card>
  );
}
function Skel() { return <div className="w-full h-full animate-pulse rounded-lg" style={{ background: "rgba(139,105,20,0.06)", minHeight: 80 }} />; }

const h3Style: React.CSSProperties = { fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))", marginBottom: 16 };
const h4Style: React.CSSProperties = { fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 15, color: "hsl(var(--fyn-ink))", marginBottom: 8 };
const tip: React.CSSProperties = { background: "#171208", border: "none", borderRadius: 8, color: "#fff", fontFamily: "Roboto, sans-serif", fontSize: 13 };
const th: React.CSSProperties = { padding: "14px 16px", textAlign: "left", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))" };
const td: React.CSSProperties = { padding: "12px 16px", fontFamily: "Roboto, sans-serif", fontSize: 13.5, color: "hsl(var(--fyn-ink) / 0.85)" };
