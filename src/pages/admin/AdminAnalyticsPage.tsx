import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Download, Users, IndianRupee, TrendingDown, BarChart3, LayoutGrid, Wallet } from "lucide-react";
import { Card, PageHeader } from "./AdminDashboardPage";
import { EmptyState } from "@/components/admin/EmptyState";
import { supabase } from "@/integrations/supabase/client";

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [userGrowth, setUserGrowth] = useState<{ date: string; users: number }[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<{ month: string; mrr: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [profsRes, subsRes] = await Promise.all([
        supabase.from("profiles").select("created_at").gte("created_at", since).order("created_at", { ascending: true }),
        supabase.from("subscriptions").select("mrr, started_at, status").eq("status", "active").order("started_at", { ascending: true }),
      ]);
      if (cancelled) return;

      const daily: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        daily[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0;
      }
      ((profsRes.data ?? []) as { created_at: string }[]).forEach((p) => {
        const d = new Date(p.created_at).toISOString().slice(0, 10);
        if (d in daily) daily[d] += 1;
      });
      setUserGrowth(Object.entries(daily).map(([date, users]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        users,
      })));

      const monthly: Record<string, number> = {};
      ((subsRes.data ?? []) as { mrr: number | string; started_at: string }[]).forEach((s) => {
        const m = new Date(s.started_at).toISOString().slice(0, 7);
        monthly[m] = (monthly[m] || 0) + Number(s.mrr || 0);
      });
      let running = 0;
      const sorted = Object.keys(monthly).sort();
      const trend = sorted.map((m) => {
        running += monthly[m];
        return {
          month: new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          mrr: Math.round(running),
        };
      });
      setRevenueTrend(trend);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const hasUsers = userGrowth.some((p) => p.users > 0);
  const hasRevenue = revenueTrend.length > 0;

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <PageHeader title="Analytics" subtitle="Live insights into growth, revenue, and engagement" />
        <select value={range} onChange={(e) => setRange(e.target.value)}
          style={{
            height: 44, padding: "0 14px", borderRadius: 12, border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
            fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))",
          }}>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      <Section title="Live Platform Trends">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card style={{ height: 320 }}>
            <h4 style={subTitle}>User Growth (Last 30 days)</h4>
            <div style={{ width: "100%", height: 250 }}>
              {loading ? <Skel /> : !hasUsers ? (
                <EmptyState icon={Users} title="No new users in last 30 days" hint="The chart will populate as users sign up." />
              ) : (
                <ResponsiveContainer>
                  <AreaChart data={userGrowth}>
                    <defs>
                      <linearGradient id="usersGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#8B6914" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#8B6914" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 11 }} interval={4} />
                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={tipStyle} />
                    <Area type="monotone" dataKey="users" stroke="#8B6914" strokeWidth={2} fill="url(#usersGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card style={{ height: 320 }}>
            <h4 style={subTitle}>Cumulative MRR</h4>
            <div style={{ width: "100%", height: 250 }}>
              {loading ? <Skel /> : !hasRevenue ? (
                <EmptyState icon={IndianRupee} title="No revenue yet" hint="Cumulative MRR will appear once subscriptions are active." />
              ) : (
                <ResponsiveContainer>
                  <AreaChart data={revenueTrend}>
                    <defs>
                      <linearGradient id="mrrGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#C41E1E" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#C41E1E" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: 12 }} tickFormatter={(v) => v >= 1000 ? `₹${Math.round(v / 1000)}K` : `₹${v}`} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "MRR"]} />
                    <Area type="monotone" dataKey="mrr" stroke="#C41E1E" strokeWidth={3} fill="url(#mrrGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Revenue Metrics">
        <Card><EmptyState icon={Wallet} title="Revenue movement not tracked yet" hint="New / Expansion / Churn MRR breakdowns will appear once we record subscription change events." /></Card>
      </Section>

      <Section title="Churn Analysis">
        <Card><EmptyState icon={TrendingDown} title="No churn data yet" hint="Churn rates and reasons will populate once subscriptions begin churning and exit reasons are captured." /></Card>
      </Section>

      <Section title="Usage Metrics">
        <Card><EmptyState icon={BarChart3} title="No usage analytics yet" hint="DAU / MAU, session times, and feature adoption will appear once product analytics events are wired up." /></Card>
      </Section>

      <Section title="Cohort Retention">
        <Card><EmptyState icon={LayoutGrid} title="Not enough data for cohorts" hint="Cohort retention will be available after at least 2 monthly cohorts of users." /></Card>
      </Section>

      <Section title="Customer Lifetime Value">
        <Card><EmptyState icon={IndianRupee} title="No LTV data yet" hint="LTV and CAC will be calculated once we have subscription history and acquisition cost inputs." /></Card>
      </Section>

      <div className="mt-8 flex flex-wrap gap-3">
        <button style={primaryBtn}><Download size={16} /> Export as PDF</button>
        <button style={secondaryBtn}><Download size={16} /> Export as CSV</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 24, color: "hsl(var(--fyn-ink))", marginBottom: 16 }}>{title}</h3>
      {children}
    </section>
  );
}

function Skel() {
  return <div className="w-full h-full animate-pulse rounded-lg" style={{ background: "rgba(139,105,20,0.06)" }} />;
}

const subTitle: React.CSSProperties = { fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 16, color: "hsl(var(--fyn-ink))", marginBottom: 8 };
const tipStyle: React.CSSProperties = { background: "#171208", border: "none", borderRadius: 8, color: "#fff", fontFamily: "Roboto, sans-serif", fontSize: 13 };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 18px", borderRadius: 12, background: "linear-gradient(135deg,#C41E1E,#8B6914)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14 };
const secondaryBtn: React.CSSProperties = { ...primaryBtn, background: "transparent", color: "hsl(var(--fyn-ink))", border: "2px solid rgba(23,18,8,0.15)" };
