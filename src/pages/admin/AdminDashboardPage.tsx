import { useEffect, useState } from "react";
import {
  Users, CreditCard, IndianRupee, ArrowUp, ArrowDown, ArrowRight,
  MessageCircle, TrendingUp, Activity, AlertTriangle, Bot, BarChart3, ServerCog,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import WaitlistStatsWidget from "@/components/admin/WaitlistStatsWidget";
import { EmptyState } from "@/components/admin/EmptyState";

const fmtINR = (n: number) =>
  n >= 10000000 ? `₹${(n / 10000000).toFixed(1)}Cr`
  : n >= 100000 ? `₹${(n / 100000).toFixed(1)}L`
  : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K`
  : `₹${n}`;

const PLAN_COLORS: Record<string, string> = {
  trial: "#94A3B8", free_trial: "#94A3B8",
  starter: "#3B82F6", pro: "#1F5A46", enterprise: "#8B4513",
};

type Live = {
  loading: boolean;
  totalUsers: number | null;
  totalUsersTrend: number | null;
  activeSubs: number | null;
  activeSubsTrend: number | null;
  monthlyRevenue: number | null;
  openTickets: number | null;
  userGrowth: { month: string; users: number }[];
  revenueByPlan: { plan: string; revenue: number }[];
  subDist: { name: string; value: number; color: string }[];
  support: { open: number; inProgress: number; resolvedToday: number; urgent: number };
  apiDaily: { day: string; queries: number }[];
  apiTotal: number;
  apiCostUsd: number;
  apiAvgMs: number;
  recentActivity: { id: string; action: string; created_at: string; admin_user_id: string }[];
};

const initial: Live = {
  loading: true, totalUsers: null, totalUsersTrend: null, activeSubs: null, activeSubsTrend: null,
  monthlyRevenue: null, openTickets: null, userGrowth: [], revenueByPlan: [], subDist: [],
  support: { open: 0, inProgress: 0, resolvedToday: 0, urgent: 0 },
  apiDaily: [], apiTotal: 0, apiCostUsd: 0, apiAvgMs: 0, recentActivity: [],
};

export default function AdminDashboardPage() {
  const [d, setD] = useState<Live>(initial);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = Date.now();
      const since30 = new Date(now - 30 * 86400000).toISOString();
      const since60 = new Date(now - 60 * 86400000).toISOString();
      const since6mo = new Date(now - 180 * 86400000).toISOString();
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);

      const [
        usersAllRes, usersLast30Res, usersPrev30Res,
        subsAllRes, subsLast30Res, subsPrev30Res,
        ticketsRes, ticketsResolvedTodayRes,
        profilesGrowthRes, aiLogsRes, auditRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", since30),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", since60).lt("created_at", since30),
        supabase.from("subscriptions").select("plan_type, mrr, status, created_at"),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active").gte("created_at", since30),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active").gte("created_at", since60).lt("created_at", since30),
        supabase.from("support_tickets").select("status, priority, resolved_at, created_at"),
        supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "resolved").gte("resolved_at", startToday.toISOString()),
        supabase.from("profiles").select("created_at").gte("created_at", since6mo).order("created_at", { ascending: true }),
        supabase.from("ai_usage_logs").select("created_at, cost_usd, response_time_ms").gte("created_at", since30),
        supabase.from("admin_audit_logs").select("id, action, created_at, admin_user_id").order("created_at", { ascending: false }).limit(10),
      ]);

      if (cancelled) return;

      // ---- Subscriptions aggregation
      const subsAll = (subsAllRes.data ?? []) as { plan_type: string | null; mrr: number | string | null; status: string }[];
      const activeSubs = subsAll.filter((s) => s.status === "active");
      const monthlyRevenue = activeSubs.reduce((sum, r) => sum + Number(r.mrr ?? 0), 0);
      const planRevMap: Record<string, number> = {};
      const planCountMap: Record<string, number> = {};
      activeSubs.forEach((s) => {
        const k = (s.plan_type ?? "unknown").toLowerCase();
        planRevMap[k] = (planRevMap[k] ?? 0) + Number(s.mrr ?? 0);
        planCountMap[k] = (planCountMap[k] ?? 0) + 1;
      });
      const revenueByPlan = Object.entries(planRevMap)
        .map(([plan, revenue]) => ({ plan: plan.charAt(0).toUpperCase() + plan.slice(1), revenue }))
        .sort((a, b) => b.revenue - a.revenue);
      const subDist = Object.entries(planCountMap)
        .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: PLAN_COLORS[name] ?? "#8B6914" }));

      // ---- Tickets
      const tickets = (ticketsRes.data ?? []) as { status: string; priority: string }[];
      const open = tickets.filter((t) => t.status === "open").length;
      const inProgress = tickets.filter((t) => t.status === "in_progress").length;
      const urgent = tickets.filter((t) => t.priority === "urgent" && !["resolved", "closed"].includes(t.status)).length;

      // ---- User growth (6 months)
      const monthBuckets: Record<string, number> = {};
      const labels: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const dt = new Date(); dt.setMonth(dt.getMonth() - i); dt.setDate(1);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        monthBuckets[key] = 0;
        labels.push(dt.toLocaleDateString("en-US", { month: "short" }));
      }
      ((profilesGrowthRes.data ?? []) as { created_at: string }[]).forEach((p) => {
        const dt = new Date(p.created_at);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        if (key in monthBuckets) monthBuckets[key] += 1;
      });
      const totalSoFar = (usersAllRes.count ?? 0);
      const recent6 = Object.values(monthBuckets).reduce((a, b) => a + b, 0);
      let cum = totalSoFar - recent6;
      const userGrowth = Object.values(monthBuckets).map((v, i) => {
        cum += v;
        return { month: labels[i], users: cum };
      });

      // ---- AI usage 30d
      const ai = (aiLogsRes.data ?? []) as { created_at: string; cost_usd: number | string | null; response_time_ms: number | null }[];
      const apiBuckets: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const k = new Date(now - i * 86400000).toISOString().slice(0, 10);
        apiBuckets[k] = 0;
      }
      ai.forEach((l) => {
        const k = l.created_at.slice(0, 10);
        if (k in apiBuckets) apiBuckets[k] += 1;
      });
      const apiDaily = Object.entries(apiBuckets).map(([k, v]) => ({
        day: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        queries: v,
      }));
      const apiCostUsd = ai.reduce((a, l) => a + Number(l.cost_usd ?? 0), 0);
      const apiAvgMs = ai.length ? ai.reduce((a, l) => a + Number(l.response_time_ms ?? 0), 0) / ai.length : 0;

      // ---- Trend deltas
      const u30 = usersLast30Res.count ?? 0;
      const uPrev = usersPrev30Res.count ?? 0;
      const totalUsersTrend = uPrev > 0 ? Math.round(((u30 - uPrev) / uPrev) * 100) : (u30 > 0 ? 100 : 0);

      const s30 = subsLast30Res.count ?? 0;
      const sPrev = subsPrev30Res.count ?? 0;
      const activeSubsTrend = sPrev > 0 ? Math.round(((s30 - sPrev) / sPrev) * 100) : (s30 > 0 ? 100 : 0);

      setD({
        loading: false,
        totalUsers: usersAllRes.count ?? 0,
        totalUsersTrend,
        activeSubs: activeSubs.length,
        activeSubsTrend,
        monthlyRevenue,
        openTickets: open + inProgress,
        userGrowth,
        revenueByPlan,
        subDist,
        support: {
          open, inProgress,
          resolvedToday: ticketsResolvedTodayRes.count ?? 0,
          urgent,
        },
        apiDaily,
        apiTotal: ai.length,
        apiCostUsd,
        apiAvgMs,
        recentActivity: (auditRes.data ?? []) as Live["recentActivity"],
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const fmtVal = (v: number | null, fmt: (n: number) => string) =>
    d.loading ? "…" : v === null ? "-" : fmt(v);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live overview of FYNHelp platform" />

      {/* Top metrics */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <MetricCard icon={<Users size={22} color="#8B6914" />} label="Total Users"
          value={fmtVal(d.totalUsers, (v) => v.toLocaleString("en-IN"))}
          trend={d.totalUsersTrend ?? undefined}
          trendLabel={d.totalUsersTrend === null ? undefined : `${d.totalUsersTrend >= 0 ? "+" : ""}${d.totalUsersTrend}% vs prev 30d`} />
        <MetricCard icon={<CreditCard size={22} color="#8B6914" />} label="Active Subscriptions"
          value={fmtVal(d.activeSubs, (v) => v.toLocaleString("en-IN"))}
          trend={d.activeSubsTrend ?? undefined}
          trendLabel={d.activeSubsTrend === null ? undefined : `${d.activeSubsTrend >= 0 ? "+" : ""}${d.activeSubsTrend}% vs prev 30d`} />
        <MetricCard icon={<IndianRupee size={22} color="#8B6914" />} label="Monthly Recurring Revenue"
          value={fmtVal(d.monthlyRevenue, fmtINR)} />
        <MetricCard icon={<MessageCircle size={22} color="#8B6914" />} label="Open Support Tickets"
          value={fmtVal(d.openTickets, (v) => v.toLocaleString("en-IN"))}
          trendLabel="Open + In Progress" />
      </div>

      {/* User growth + waitlist */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" style={{ minHeight: 380 }}>
          <h3 style={cardTitle}>User Growth (6 months)</h3>
          <div style={{ width: "100%", height: 300 }}>
            {d.loading ? <ChartSkeleton /> : d.userGrowth.every((p) => p.users === 0) ? (
              <EmptyState icon={Users} title="No users yet" hint="The growth chart will populate as users sign up." />
            ) : (
              <ResponsiveContainer>
                <AreaChart data={d.userGrowth} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminUserGrowth" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#C41E1E" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#8B6914" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                  <XAxis dataKey="month" stroke="rgba(23,18,8,0.5)" tickLine={false} axisLine={false} style={{ fontSize: 12 }} />
                  <YAxis stroke="rgba(23,18,8,0.5)" tickLine={false} axisLine={false} style={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={tipStyle} />
                  <Area type="monotone" dataKey="users" stroke="#C41E1E" strokeWidth={2} fill="url(#adminUserGrowth)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <WaitlistStatsWidget />
      </div>

      {/* Revenue + Pie */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card style={{ minHeight: 360 }}>
          <h3 style={cardTitle}>Revenue Breakdown by Plan</h3>
          <div style={{ width: "100%", height: 280 }}>
            {d.loading ? <ChartSkeleton /> : d.revenueByPlan.length === 0 ? (
              <EmptyState icon={IndianRupee} title="No revenue yet" hint="Revenue will appear once subscriptions are active." />
            ) : (
              <ResponsiveContainer>
                <BarChart data={d.revenueByPlan}>
                  <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                  <XAxis dataKey="plan" stroke="rgba(23,18,8,0.5)" tickLine={false} axisLine={false} style={{ fontSize: 12 }} />
                  <YAxis tickFormatter={fmtINR} stroke="rgba(23,18,8,0.5)" tickLine={false} axisLine={false} style={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => fmtINR(v)} contentStyle={tipStyle} />
                  <Bar dataKey="revenue" fill="#8B6914" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card style={{ minHeight: 360 }}>
          <h3 style={cardTitle}>Subscription Distribution</h3>
          <div style={{ width: "100%", height: 280 }}>
            {d.loading ? <ChartSkeleton /> : d.subDist.length === 0 ? (
              <EmptyState icon={CreditCard} title="No subscriptions yet" hint="Plan distribution will show up once users subscribe." />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.subDist} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={60} outerRadius={95} paddingAngle={2}
                    label={(e: any) => `${e.name}: ${e.value}`}>
                    {d.subDist.map((p) => <Cell key={p.name} fill={p.color} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Roboto, sans-serif" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Support metrics */}
      <h3 className="mt-10 mb-4" style={sectionTitle}>Support Overview</h3>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <SupportStat icon={MessageCircle} label="Open" value={d.support.open} />
        <SupportStat icon={Activity} label="In Progress" value={d.support.inProgress} />
        <SupportStat icon={TrendingUp} label="Resolved Today" value={d.support.resolvedToday} positive />
        <SupportStat icon={AlertTriangle} label="Urgent" value={d.support.urgent} negative={d.support.urgent > 0} />
      </div>

      {/* System Health (link out) + Engagement (empty) */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 style={cardTitle}>System Health</h3>
          <EmptyState
            icon={ServerCog}
            title="Live monitoring not connected"
            hint="Connect uptime monitoring to see API status, latency, and incidents."
          />
          <div className="mt-2 text-center">
            <Link to="/admin/system-health" style={{ color: "#8B6914", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13 }}>
              Open System Health →
            </Link>
          </div>
        </Card>

        <Card>
          <h3 style={cardTitle}>User Engagement</h3>
          <EmptyState
            icon={BarChart3}
            title="No engagement data yet"
            hint="DAU / MAU and feature adoption will appear once we capture product analytics events."
          />
        </Card>
      </div>

      {/* Alerts (empty) + API Usage */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 style={cardTitle}>Alerts &amp; Recommendations</h3>
          <EmptyState
            icon={AlertTriangle}
            title="No active alerts"
            hint="Operational alerts and growth recommendations will appear here."
          />
        </Card>

        <Card>
          <h3 style={cardTitle}>AI Usage (Lovable AI)</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <EngagementStat value={d.loading ? "…" : d.apiTotal.toLocaleString("en-IN")} label="Queries (30d)" />
            <EngagementStat value={d.loading ? "…" : `$${d.apiCostUsd.toFixed(2)}`} label="API Cost (30d)" />
            <EngagementStat value={d.loading ? "…" : `${(d.apiAvgMs / 1000).toFixed(1)}s`} label="Avg Response" />
          </div>
          <div style={{ width: "100%", height: 160 }}>
            {d.loading ? <ChartSkeleton /> : d.apiTotal === 0 ? (
              <EmptyState compact icon={Bot} title="No AI usage yet" />
            ) : (
              <ResponsiveContainer>
                <LineChart data={d.apiDaily}>
                  <XAxis dataKey="day" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={tipStyle} />
                  <Line type="monotone" dataKey="queries" stroke="#8B6914" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Recent activity (audit logs) */}
      <h3 className="mt-10 mb-4" style={sectionTitle}>Recent Admin Activity</h3>
      <Card style={{ padding: 0, maxHeight: 500, overflowY: "auto" }}>
        {d.loading ? (
          <div className="p-6"><ChartSkeleton compact /></div>
        ) : d.recentActivity.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet" hint="Admin actions will be logged here as they happen." />
        ) : d.recentActivity.map((a, i) => (
          <div key={a.id} className="flex items-start gap-4 px-5 py-4"
            style={{ borderBottom: i < d.recentActivity.length - 1 ? "1px solid rgba(23,18,8,0.05)" : "none" }}>
            <span className="grid place-items-center rounded-full text-white shrink-0"
              style={{ width: 32, height: 32, background: "linear-gradient(135deg,#C41E1E,#8B6914)" }}>
              <Activity size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: "Roboto, sans-serif", fontWeight: 500, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>
                {a.action}
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.5)" }}>
                {a.admin_user_id.slice(0, 8)}…
              </div>
            </div>
            <span style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.5)", whiteSpace: "nowrap" }}>
              {new Date(a.created_at).toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const cardTitle: React.CSSProperties = {
  fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 18, color: "hsl(var(--fyn-ink))", marginBottom: 12,
};
const sectionTitle: React.CSSProperties = {
  fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))",
};
const tipStyle: React.CSSProperties = {
  background: "#171208", border: "none", borderRadius: 8, color: "#fff", fontSize: 13,
};

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 36, color: "hsl(var(--fyn-ink))", lineHeight: 1.1 }}>
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2" style={{ fontFamily: "Raleway, sans-serif", fontSize: 16, color: "hsl(var(--fyn-ink) / 0.6)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className}
      style={{
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px) saturate(110%)",
        borderRadius: 20, border: "1px solid rgba(139,105,20,0.15)",
        boxShadow: "0 8px 32px rgba(23,18,8,0.08)", padding: 24, ...style,
      }}>{children}</div>
  );
}

function EngagementStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center p-3 rounded-lg" style={{ background: "rgba(139,105,20,0.06)" }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "hsl(var(--fyn-ink))" }}>{value}</div>
      <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.6)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SupportStat({ icon: Icon, label, value, positive, negative }: {
  icon: typeof MessageCircle; label: string; value: number; positive?: boolean; negative?: boolean;
}) {
  const color = negative ? "#C41E1E" : positive ? "#0F7B4F" : "hsl(var(--fyn-ink))";
  return (
    <Card style={{ minHeight: 130 }}>
      <Icon size={20} color="#8B6914" />
      <div className="mt-2" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 28, color }}>
        {value.toLocaleString("en-IN")}
      </div>
      <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)", marginTop: 4 }}>{label}</div>
    </Card>
  );
}

function MetricCard({ icon, label, value, trend, trendLabel }: {
  icon: React.ReactNode; label: string; value: string; trend?: number; trendLabel?: string;
}) {
  return (
    <Card style={{ minHeight: 140, position: "relative" }}>
      <div className="flex items-start justify-between">
        <span className="grid place-items-center rounded-full"
          style={{ width: 48, height: 48, background: "linear-gradient(135deg, rgba(196,30,30,0.1), rgba(139,105,20,0.1))" }}>
          {icon}
        </span>
        {typeof trend === "number" && <TrendBadge value={trend} />}
      </div>
      <div className="mt-4" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 38, color: "hsl(var(--fyn-ink))", lineHeight: 1 }}>
        {value}
      </div>
      <div className="mt-2" style={{ fontFamily: "Raleway, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}>
        {label}
      </div>
      {trendLabel && (
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.55)", marginTop: 6, fontWeight: 600 }}>
          {trendLabel}
        </div>
      )}
    </Card>
  );
}

function TrendBadge({ value }: { value: number }) {
  const color = value > 0 ? "#1F5A46" : value < 0 ? "#DC2626" : "rgba(23,18,8,0.5)";
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : ArrowRight;
  return (
    <span className="flex items-center gap-1" style={{ color, fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13 }}>
      <Icon size={14} /> {value > 0 ? "+" : ""}{value}%
    </span>
  );
}

function ChartSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="w-full h-full animate-pulse rounded-lg"
      style={{ minHeight: compact ? 80 : 200, background: "rgba(139,105,20,0.06)" }} />
  );
}
