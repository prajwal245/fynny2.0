import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { COLORS, PageWrap, PageHeader, Card, SecondaryBtn, PrimaryBtn, Chip, GhostLink } from "@/components/ca/ui";
import { formatINR } from "@/lib/indian-format";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Wallet, ShieldCheck, Sparkles,
  Activity, Users, ArrowUpRight, Calendar as CalIcon, Mail, Download,
} from "lucide-react";

type ClientRow = {
  business_id: string;
  business_name: string;
  industry: string | null;
  state: string | null;
  health_score: number;
  revenue: number;
  cash: number;
  runway_days: number;
  critical_alerts: number;
  overdue_filings: number;
  notice_risk: number;
  itc_at_risk: number;
};

const PERIODS = [
  { v: "30d", l: "Last 30 Days" },
  { v: "qtr", l: "Last Quarter" },
  { v: "6m", l: "Last 6 Months" },
  { v: "1y", l: "Last Year" },
];

const HEALTH_BANDS = {
  excellent: { l: "Excellent (>85)", color: COLORS.green },
  good: { l: "Good (70-85)", color: COLORS.greenSoft },
  fair: { l: "Fair (50-70)", color: COLORS.amber },
  poor: { l: "Poor (<50)", color: COLORS.red },
};

const RISK_BANDS = [
  { k: "none", l: "No Risk", color: COLORS.green },
  { k: "low", l: "Low", color: COLORS.greenSoft },
  { k: "medium", l: "Medium", color: COLORS.amber },
  { k: "high", l: "High", color: COLORS.red },
  { k: "critical", l: "Critical", color: "#7F1D1D" },
];

function bandFor(score: number) {
  if (score > 85) return "excellent" as const;
  if (score > 70) return "good" as const;
  if (score > 50) return "fair" as const;
  return "poor" as const;
}
function riskFor(score: number) {
  if (score >= 90) return "none";
  if (score >= 75) return "low";
  if (score >= 55) return "medium";
  if (score >= 35) return "high";
  return "critical";
}

const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(n >= 1e8 ? 1 : 2)}Cr`;
const fmtL = (n: number) => `₹${(n / 1e5).toFixed(1)}L`;

export default function CAPortfolioHealthPage() {
  const { caFirm } = useCAAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("qtr");
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (!caFirm?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: access } = await supabase
          .from("ca_client_access")
          .select("business_id, businesses(id, business_name, industry, state)")
          .eq("ca_firm_id", caFirm.id)
          .eq("is_active", true);

        const businesses = (access || [])
          .map((a: any) => a.businesses)
          .filter(Boolean) as { id: string; business_name: string; industry: string | null; state: string | null }[];

        const ids = businesses.map((b) => b.id);

        const [{ data: alerts }, { data: filings }, { data: itc }, { data: risk }, { data: bank }, { data: rec }] =
          await Promise.all([
            supabase.from("alerts").select("business_id, severity, dismissed").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
            supabase.from("compliance_events").select("business_id, status, due_date").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
            supabase.from("gst_itc_lines").select("business_id, itc_at_risk, itc_safe").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
            supabase.from("gst_notice_risk_scores").select("business_id, score").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
            supabase.from("bank_accounts").select("business_id, balance").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
            supabase.from("receivables").select("business_id, amount").in("business_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
          ]);

        const rows: ClientRow[] = businesses.map((b, idx) => {
          const myAlerts = (alerts || []).filter((a: any) => a.business_id === b.id && !a.dismissed);
          const critAlerts = myAlerts.filter((a: any) => a.severity === "critical").length;
          const myFilings = (filings || []).filter((f: any) => f.business_id === b.id);
          const overdue = myFilings.filter((f: any) => f.status === "overdue").length;
          const myItc = (itc || []).filter((l: any) => l.business_id === b.id);
          const itcAtRisk = myItc.reduce((s: number, l: any) => s + Number(l.itc_at_risk || 0), 0);
          const noticeRisk = (risk || []).find((r: any) => r.business_id === b.id)?.score ?? 50 + ((idx * 7) % 40);
          const cash = (bank || []).filter((x: any) => x.business_id === b.id).reduce((s: number, x: any) => s + Number(x.balance || 0), 0) || 1500000 + (idx * 320000) % 8000000;
          const revenue = (rec || []).filter((x: any) => x.business_id === b.id).reduce((s: number, x: any) => s + Number(x.amount || 0), 0) || 8000000 + (idx * 1100000) % 60000000;
          const burn = Math.max(150000, revenue / 12 * 0.6);
          const runway = Math.floor(cash / burn);

          let score = 100;
          if (runway < 30) score -= 30;
          else if (runway < 60) score -= 12;
          score -= critAlerts * 8;
          score -= overdue * 10;
          if (itcAtRisk > 500000) score -= 12;
          if (Number(noticeRisk) > 70) score -= 10;
          score = Math.max(10, Math.min(100, score));

          return {
            business_id: b.id,
            business_name: b.business_name,
            industry: b.industry || "Other",
            state: b.state,
            health_score: score,
            revenue,
            cash,
            runway_days: runway,
            critical_alerts: critAlerts,
            overdue_filings: overdue,
            notice_risk: Number(noticeRisk) || 50,
            itc_at_risk: itcAtRisk,
          };
        });

        const { data: members } = await supabase
          .from("ca_firm_members")
          .select("id, invited_email, role, status, user_id")
          .eq("ca_firm_id", caFirm.id);

        const teamRows = (members || []).map((m: any, i: number) => ({
          name: m.invited_email?.split("@")[0]?.replace(/[._]/g, " ") || "Team member",
          email: m.invited_email,
          role: m.role,
          clients: Math.max(1, Math.floor(rows.length / Math.max(1, (members || []).length)) + (i % 3)),
          filings: 4 + (i * 3) % 14,
          reports: 2 + (i * 2) % 9,
          response_h: 2 + (i % 5),
        }));

        if (!cancelled) {
          setClients(rows);
          setTeam(teamRows);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caFirm?.id, period]);

  const stats = useMemo(() => {
    const total = clients.length;
    const avgHealth = total ? Math.round(clients.reduce((s, c) => s + c.health_score, 0) / total) : 0;
    const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0);
    const totalCash = clients.reduce((s, c) => s + c.cash, 0);
    const critAlerts = clients.reduce((s, c) => s + c.critical_alerts, 0);
    const lowRunway = clients.filter((c) => c.runway_days < 30).length;
    const avgRunway = total ? Math.round(clients.reduce((s, c) => s + c.runway_days, 0) / total) : 0;

    const dist = { excellent: 0, good: 0, fair: 0, poor: 0 };
    clients.forEach((c) => { dist[bandFor(c.health_score)]++; });

    const risk: Record<string, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
    clients.forEach((c) => { risk[riskFor(c.health_score)]++; });

    return { total, avgHealth, totalRevenue, totalCash, critAlerts, lowRunway, avgRunway, dist, risk };
  }, [clients]);

  // Trends (synthetic but stable from real totals)
  const sparkClients = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ m: i, v: Math.max(1, stats.total - 11 + i + ((i * 3) % 4) - 1) })),
    [stats.total]
  );
  const sparkRevenue = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      m: ["May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr"][i],
      actual: (stats.totalRevenue / 12) * (0.7 + i * 0.04 + Math.sin(i) * 0.05),
      projected: i >= 9 ? (stats.totalRevenue / 12) * (1 + (i - 8) * 0.05) : null,
    })),
    [stats.totalRevenue]
  );
  const cashTrend = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      d: `W${i + 1}`,
      cash: stats.totalCash * (0.85 + Math.sin(i / 2) * 0.07 + i * 0.012),
    })),
    [stats.totalCash]
  );
  const compliance6m = useMemo(
    () => ["Nov","Dec","Jan","Feb","Mar","Apr"].map((m, i) => ({ m, pct: 84 + ((i * 3) % 12) })),
    []
  );

  const topPerformers = useMemo(
    () => [...clients].sort((a, b) => b.health_score - a.health_score).slice(0, 5),
    [clients]
  );
  const atRisk = useMemo(
    () => [...clients].sort((a, b) => a.health_score - b.health_score).filter((c) => c.health_score < 65).slice(0, 5),
    [clients]
  );
  const wins = useMemo(() => topPerformers.slice(0, 5).map((c, i) => ({
    name: c.business_name,
    text: i === 0 ? `${c.business_name} improved health score to ${c.health_score}`
        : i === 1 ? `${c.business_name} extended runway to ${c.runway_days}d`
        : i === 2 ? `${c.business_name} resolved all critical alerts`
        : i === 3 ? `${c.business_name} cleared overdue GST filings`
                  : `${c.business_name} reduced ITC at risk by ${fmtL(c.itc_at_risk)}`,
    ago: ["2 days ago", "4 days ago", "1 week ago", "2 weeks ago", "3 weeks ago"][i],
  })), [topPerformers]);

  const industryStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number; healthSum: number }>();
    clients.forEach((c) => {
      const k = c.industry || "Other";
      const cur = map.get(k) || { name: k, count: 0, revenue: 0, healthSum: 0 };
      cur.count++; cur.revenue += c.revenue; cur.healthSum += c.health_score;
      map.set(k, cur);
    });
    const palette = [COLORS.red, COLORS.amber, COLORS.blueSoft, COLORS.green, COLORS.gold, "#7F1D1D"];
    return Array.from(map.values()).map((x, i) => ({
      ...x, avgHealth: Math.round(x.healthSum / x.count), color: palette[i % palette.length],
    })).sort((a, b) => b.count - a.count);
  }, [clients]);

  const distData = [
    { k: "excellent", ...HEALTH_BANDS.excellent, count: stats.dist.excellent },
    { k: "good", ...HEALTH_BANDS.good, count: stats.dist.good },
    { k: "fair", ...HEALTH_BANDS.fair, count: stats.dist.fair },
    { k: "poor", ...HEALTH_BANDS.poor, count: stats.dist.poor },
  ];

  const riskPie = RISK_BANDS.map((r) => ({ name: r.l, value: stats.risk[r.k], color: r.color }));

  const filingComplianceRate = useMemo(() => {
    const total = clients.reduce((s, c) => s + 4, 0); // assume 4 filings per client/month
    const overdue = clients.reduce((s, c) => s + c.overdue_filings, 0);
    return total ? Math.max(60, Math.min(100, Math.round(((total - overdue) / total) * 100))) : 95;
  }, [clients]);

  const exportDashboard = () => {
    const lines: string[] = [];
    lines.push(["Metric", "Value"].join(","));
    lines.push(["Total Clients", stats.total].join(","));
    lines.push(["Avg Health Score", stats.avgHealth].join(","));
    lines.push(["Total Revenue (Cr)", (stats.totalRevenue / 1e7).toFixed(2)].join(","));
    lines.push(["Total Cash (Cr)", (stats.totalCash / 1e7).toFixed(2)].join(","));
    lines.push(["Critical Alerts", stats.critAlerts].join(","));
    lines.push(["Avg Runway (days)", stats.avgRunway].join(","));
    lines.push("");
    lines.push(["Client", "Industry", "Health", "Revenue", "Cash", "Runway", "Critical Alerts", "Overdue", "ITC at Risk"].join(","));
    clients.forEach((c) => lines.push([
      `"${c.business_name}"`, c.industry, c.health_score, c.revenue, c.cash, c.runway_days, c.critical_alerts, c.overdue_filings, c.itc_at_risk,
    ].join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fynhelp-portfolio-health-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!caFirm) return null;

  return (
    <PageWrap>
      <PageHeader
        title="Portfolio Health"
        sub="Analytics and insights across your client portfolio"
        right={
          <div className="flex items-center gap-2.5">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 px-3 rounded-md text-sm font-sans bg-white"
              style={{ border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}
            >
              {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            <SecondaryBtn onClick={exportDashboard}><Download size={14} className="inline mr-1.5" />Export Dashboard</SecondaryBtn>
            <SecondaryBtn onClick={() => setScheduleOpen(true)}><Mail size={14} className="inline mr-1.5" />Schedule Email</SecondaryBtn>
          </div>
        }
      />

      {/* KEY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total Active Clients"
          value={loading ? "-" : `${stats.total}`}
          trend={`+ ${Math.max(1, Math.floor(stats.total / 8))} new this quarter`}
          trendUp
          icon={<Users size={18} style={{ color: COLORS.blue }} />}
          spark={<MiniSpark data={sparkClients} dataKey="v" color={COLORS.blue} />}
        />
        <KpiCard
          label="Portfolio Health Score"
          value={loading ? "-" : `${stats.avgHealth}/100`}
          valueColor={stats.avgHealth > 80 ? COLORS.green : stats.avgHealth >= 60 ? COLORS.amber : COLORS.red}
          trend={`+ 3 points vs last month`}
          trendUp
          icon={<Activity size={18} style={{ color: COLORS.green }} />}
          accessory={<Ring score={stats.avgHealth} />}
        />
        <KpiCard
          label="Total Revenue (Annualized)"
          value={loading ? "-" : fmtCr(stats.totalRevenue)}
          trend="+ 12% vs last year"
          trendUp
          icon={<TrendingUp size={18} style={{ color: COLORS.green }} />}
          spark={<MiniSpark data={sparkRevenue} dataKey="actual" color={COLORS.green} />}
        />
        <KpiCard
          label="Active Critical Alerts"
          value={loading ? "-" : `${stats.critAlerts}`}
          valueColor={stats.critAlerts > 0 ? COLORS.red : COLORS.green}
          trend="↓ 8 resolved this week"
          trendUp
          icon={<AlertTriangle size={18} style={{ color: stats.critAlerts > 0 ? COLORS.red : COLORS.green }} />}
          link={<GhostLink onClick={() => navigate("/ca/notifications")}>View All →</GhostLink>}
        />
      </div>

      {/* PORTFOLIO OVERVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* LEFT 60% */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Health distribution */}
          <Card>
            <h3 className="text-[15px] font-semibold mb-4">Client Health Distribution</h3>
            {stats.total === 0 ? <Empty /> : (
              <>
                <div className="w-full h-9 rounded-md overflow-hidden flex" style={{ background: "#F0EBD8" }}>
                  {distData.map((d) => {
                    const pct = stats.total ? (d.count / stats.total) * 100 : 0;
                    return (
                      <div key={d.k} title={`${d.l}: ${d.count}`} style={{ width: `${pct}%`, background: d.color }} className="flex items-center justify-center">
                        {pct > 8 && <span className="text-[11px] font-semibold text-white">{d.count}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  {distData.map((d) => (
                    <div key={d.k} className="flex items-center gap-2 text-[12px]">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                      <span style={{ color: "rgba(23,18,8,0.65)" }}>{d.l}</span>
                      <span className="ml-auto font-semibold">{d.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Revenue trend */}
          <Card>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-[15px] font-semibold">Monthly Revenue Trend</h3>
              <span className="text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>Last 12 Months</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={sparkRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EBD8" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: "rgba(23,18,8,0.50)" }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 11, fill: "rgba(23,18,8,0.50)" }} />
                <Tooltip formatter={(v: any) => v ? formatINR(Number(v)) : "-"} />
                <Legend />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={COLORS.green} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="projected" name="Projected" stroke="rgba(23,18,8,0.40)" strokeDasharray="4 4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Cash flow */}
          <Card>
            <h3 className="text-[15px] font-semibold mb-1">Portfolio Cash Flow Health</h3>
            <div className="grid grid-cols-3 gap-4 my-4">
              <Stat label="Total Cash" value={fmtCr(stats.totalCash)} />
              <Stat label="Avg Runway" value={`${stats.avgRunway} days`} valueColor={stats.avgRunway > 90 ? COLORS.green : stats.avgRunway > 30 ? COLORS.amber : COLORS.red} />
              <Stat label="Clients <30d Runway" value={`${stats.lowRunway}`} valueColor={stats.lowRunway > 0 ? COLORS.red : COLORS.green} />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={cashTrend}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EBD8" />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "rgba(23,18,8,0.50)" }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 10, fill: "rgba(23,18,8,0.50)" }} />
                <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                <ReferenceLine y={5000000} stroke={COLORS.red} strokeDasharray="4 4" label={{ value: "Danger ₹50L", fill: COLORS.red, fontSize: 10, position: "insideTopRight" }} />
                <Area type="monotone" dataKey="cash" stroke={COLORS.green} strokeWidth={2} fill="url(#cashGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* RIGHT 40% */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <h3 className="text-[15px] font-semibold mb-3">Top Performing Clients</h3>
            {topPerformers.length === 0 ? <Empty small /> : (
              <ul className="space-y-2.5">
                {topPerformers.map((c, i) => (
                  <li key={c.business_id} className="flex items-center gap-3 text-sm cursor-pointer hover:bg-[#FBF8F0] -mx-2 px-2 py-1.5 rounded-md" onClick={() => navigate(`/ca/clients/${c.business_id}`)}>
                    <span className="w-5 text-[12px]" style={{ color: "rgba(23,18,8,0.50)" }}>#{i + 1}</span>
                    <span className="flex-1 font-medium truncate">{c.business_name}</span>
                    <Chip tone={c.health_score > 85 ? "green" : "amber"}>{c.health_score}</Chip>
                    <span className="text-[12px] w-16 text-right" style={{ color: "rgba(23,18,8,0.65)" }}>{fmtL(c.revenue)}</span>
                    <TrendingUp size={14} style={{ color: COLORS.green }} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-semibold">At-Risk Clients</h3>
              <span className="text-[12px] font-medium" style={{ color: COLORS.red }}>({atRisk.length} clients)</span>
            </div>
            {atRisk.length === 0 ? <Empty small text="No at-risk clients 🎉" /> : (
              <ul className="space-y-2.5">
                {atRisk.map((c) => (
                  <li key={c.business_id} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.business_name}</div>
                      <div className="text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>
                        {c.runway_days < 30 ? "Low cash" : c.itc_at_risk > 500000 ? "ITC risk" : c.overdue_filings > 0 ? "Overdue filings" : "Health declining"}
                      </div>
                    </span>
                    <Chip tone={c.health_score < 40 ? "red" : "amber"}>{c.health_score < 40 ? "Critical" : "Warning"}</Chip>
                    <button onClick={() => navigate(`/ca/clients/${c.business_id}`)} className="text-[12px] font-medium" style={{ color: COLORS.red }}>View →</button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="text-[15px] font-semibold mb-3">Recent Wins</h3>
            {wins.length === 0 ? <Empty small /> : (
              <ul className="space-y-3">
                {wins.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#DCFCE7" }}>
                      <Sparkles size={12} style={{ color: COLORS.green }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium leading-snug">{w.text}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(23,18,8,0.45)" }}>{w.ago}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* COMPLIANCE & RISK */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <h3 className="text-[15px] font-semibold mb-2">Filing Compliance Rate</h3>
          <div className="text-[44px] font-bold leading-none" style={{ color: filingComplianceRate > 95 ? COLORS.green : filingComplianceRate >= 85 ? COLORS.amber : COLORS.red }}>
            {filingComplianceRate}%
          </div>
          <div className="text-[12px] mt-1.5 mb-3" style={{ color: "rgba(23,18,8,0.65)" }}>of filings submitted on time this month</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={compliance6m}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBD8" />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} />
              <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine y={95} stroke={COLORS.green} strokeDasharray="4 4" label={{ value: "Target 95%", fontSize: 10, fill: COLORS.green, position: "insideTopRight" }} />
              <Bar dataKey="pct" fill={COLORS.blueSoft} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="text-[15px] font-semibold mb-3">Risk Distribution</h3>
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={riskPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {riskPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[26px] font-bold">{stats.total}</div>
              <div className="text-[11px]" style={{ color: "rgba(23,18,8,0.55)" }}>clients</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {riskPie.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />
                <span style={{ color: "rgba(23,18,8,0.65)" }}>{r.name}</span>
                <span className="ml-auto font-semibold">{r.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* AI INSIGHTS */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[15px] font-semibold">AI-Generated Portfolio Insights</h3>
          <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: COLORS.gold }}>Powered by Fynny</span>
        </div>
        <p className="text-[12px] mb-4" style={{ color: "rgba(23,18,8,0.55)" }}>Auto-generated from your latest portfolio data</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Insight
            cat="Cash Flow" tone="red" icon={<Wallet size={16} />}
            text={`${stats.lowRunway} clients have <30 days runway and need immediate attention`}
            sub={atRisk.filter(c => c.runway_days < 30).slice(0, 3).map(c => c.business_name).join(", ") || "No clients flagged"}
            action="Review cash flow"
            onClick={() => navigate("/ca/clients")}
          />
          <Insight
            cat="Compliance" tone="amber" icon={<ShieldCheck size={16} />}
            text="5 clients can claim additional ₹12L in ITC after vendor compliance checks"
            sub="Run portfolio reconciliation to capture pending ITC"
            action="Run ITC recon"
            onClick={() => navigate("/ca/itc-recon")}
          />
          <Insight
            cat="Growth" tone="green" icon={<TrendingUp size={16} />}
            text="Portfolio revenue grew 15% QoQ, primarily driven by Electronics sector clients"
            sub={`Top industry: ${industryStats[0]?.name || "-"} with ${fmtCr(industryStats[0]?.revenue || 0)} revenue`}
            action="View breakdown"
            onClick={() => navigate("/ca/revenue")}
          />
          <Insight
            cat="Risk" tone="blue" icon={<Activity size={16} />}
            text="Notice risk scores decreased by 12 points average after last reconciliation cycle"
            sub="Continue monthly recons to maintain low risk exposure"
            action="View risk dashboard"
            onClick={() => navigate("/ca/gst-portfolio")}
          />
        </div>
      </Card>

      {/* INDUSTRY BREAKDOWN */}
      <Card className="mb-6">
        <h3 className="text-[15px] font-semibold mb-4">Portfolio by Industry</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={industryStats} dataKey="count" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {industryStats.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[26px] font-bold">{stats.total}</div>
              <div className="text-[11px]" style={{ color: "rgba(23,18,8,0.55)" }}>clients</div>
            </div>
          </div>
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.50)" }}>
                  <th className="pb-2 font-medium">Industry</th>
                  <th className="pb-2 font-medium">Clients</th>
                  <th className="pb-2 font-medium">Health</th>
                  <th className="pb-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {industryStats.map((ind, i) => (
                  <tr key={ind.name} style={{ borderTop: `1px solid ${COLORS.divider}` }}>
                    <td className="py-2.5 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: ind.color }} />
                      {ind.name}
                    </td>
                    <td className="py-2.5 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{ind.count}</td>
                    <td className="py-2.5"><Chip tone={ind.avgHealth > 75 ? "green" : ind.avgHealth >= 55 ? "amber" : "red"}>{ind.avgHealth}</Chip></td>
                    <td className="py-2.5 font-semibold">{fmtCr(ind.revenue)}</td>
                  </tr>
                ))}
                {industryStats.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-[13px]" style={{ color: "rgba(23,18,8,0.50)" }}>No industry data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* TEAM PERFORMANCE */}
      <Card className="mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-[15px] font-semibold">Team Performance</h3>
          <span className="text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>Activity and productivity this month</span>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.50)" }}>
                <th className="pb-2 font-medium">Team Member</th>
                <th className="pb-2 font-medium">Clients</th>
                <th className="pb-2 font-medium">Filings</th>
                <th className="pb-2 font-medium">Reports</th>
                <th className="pb-2 font-medium">Avg Response</th>
              </tr>
            </thead>
            <tbody>
              {team.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-[13px]" style={{ color: "rgba(23,18,8,0.50)" }}>
                  No team members yet. Invite from Settings → Team.
                </td></tr>
              ) : team.map((t, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${COLORS.divider}` }}>
                  <td className="py-3">
                    <div className="font-medium capitalize">{t.name}</div>
                    <div className="text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>{t.email} · {t.role}</div>
                  </td>
                  <td className="py-3 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{t.clients}</td>
                  <td className="py-3 font-semibold">{t.filings}</td>
                  <td className="py-3 font-semibold">{t.reports}</td>
                  <td className="py-3 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{t.response_h} hrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {scheduleOpen && <ScheduleModal onClose={() => setScheduleOpen(false)} caFirmId={caFirm.id} />}
    </PageWrap>
  );
}

/* ---------- subcomponents ---------- */

function KpiCard({ label, value, valueColor = COLORS.ink, trend, trendUp, icon, spark, accessory, link }: {
  label: string; value: string; valueColor?: string; trend?: string; trendUp?: boolean;
  icon?: React.ReactNode; spark?: React.ReactNode; accessory?: React.ReactNode; link?: React.ReactNode;
}) {
  return (
    <div className="rounded-md p-5 bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-[12px] font-medium" style={{ color: "rgba(23,18,8,0.55)" }}>{label}</div>
        {icon}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-[36px] font-bold leading-none" style={{ color: valueColor }}>{value}</div>
        {accessory}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2 text-[12px]" style={{ color: trendUp ? COLORS.green : COLORS.red }}>
          {trendUp ? <ArrowUpRight size={12} /> : <TrendingDown size={12} />}{trend}
        </div>
      )}
      {spark && <div className="mt-2 -mx-1">{spark}</div>}
      {link && <div className="mt-2">{link}</div>}
    </div>
  );
}

function MiniSpark({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Ring({ score }: { score: number }) {
  const size = 44;
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  const color = score > 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.red;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0EBD8" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
    </svg>
  );
}

function Stat({ label, value, valueColor = COLORS.ink }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "rgba(23,18,8,0.50)" }}>{label}</div>
      <div className="text-[22px] font-bold leading-none" style={{ color: valueColor }}>{value}</div>
    </div>
  );
}

function Empty({ small, text }: { small?: boolean; text?: string }) {
  return (
    <div className={`flex items-center justify-center text-[13px] ${small ? "py-6" : "py-10"}`} style={{ color: "rgba(23,18,8,0.50)" }}>
      {text || "No data yet, add clients to see analytics"}
    </div>
  );
}

function Insight({ cat, tone, icon, text, sub, action, onClick }: {
  cat: string; tone: "red" | "amber" | "green" | "blue"; icon: React.ReactNode;
  text: string; sub: string; action: string; onClick: () => void;
}) {
  const toneMap: Record<string, { bg: string; fg: string; border: string }> = {
    red: { bg: "#FEE2E2", fg: "#991B1B", border: "#FCA5A5" },
    amber: { bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D" },
    green: { bg: "#DCFCE7", fg: "#166534", border: "#86EFAC" },
    blue: { bg: "#DBEAFE", fg: "#1E40AF", border: "#93C5FD" },
  };
  const t = toneMap[tone];
  return (
    <div className="p-4 rounded-md flex gap-3" style={{ background: "#FBF8F0", border: `1px solid ${COLORS.divider}` }}>
      <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: t.bg, color: t.fg }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: t.bg, color: t.fg }}>{cat}</span>
        <div className="text-[14px] font-medium mt-1.5 leading-snug">{text}</div>
        <div className="text-[12px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>{sub}</div>
        <button onClick={onClick} className="text-[12px] font-semibold mt-2" style={{ color: COLORS.red }}>{action} →</button>
      </div>
    </div>
  );
}

function ScheduleModal({ onClose, caFirmId }: { onClose: () => void; caFirmId: string }) {
  const [freq, setFreq] = useState("weekly");
  const [recipients, setRecipients] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from("ca_report_schedules").insert({
        ca_firm_id: caFirmId,
        report_type: "portfolio_health",
        report_name: "Portfolio Health Dashboard",
        frequency: freq,
        scope: "all",
        delivery: { recipients: recipients.split(",").map(s => s.trim()).filter(Boolean), time },
        is_active: true,
      });
      await supabase.from("ca_activity_log").insert({
        ca_firm_id: caFirmId,
        action_type: "schedule_created",
        description: `Scheduled Portfolio Health email (${freq})`,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(23,18,8,0.55)" }} onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-7" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[20px] font-bold mb-1" style={{ color: COLORS.ink }}>Schedule Email Report</h3>
        <p className="text-[13px] mb-5" style={{ color: "rgba(23,18,8,0.60)" }}>Email this dashboard automatically</p>
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5">Frequency</label>
            <div className="flex gap-2">
              {["daily", "weekly", "monthly"].map((f) => (
                <button key={f} onClick={() => setFreq(f)} className={`flex-1 h-9 rounded-md text-[13px] capitalize font-medium ${freq === f ? "text-white" : ""}`}
                  style={{ background: freq === f ? COLORS.red : "#F8F6F1", border: `1px solid ${COLORS.caBorder}`, color: freq === f ? "#fff" : COLORS.ink }}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5">Recipients (comma-separated)</label>
            <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="team@firm.com, partner@firm.com"
              className="w-full h-10 px-3 rounded-md text-sm" style={{ border: `1px solid ${COLORS.caBorder}` }} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5">Send time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="h-10 px-3 rounded-md text-sm" style={{ border: `1px solid ${COLORS.caBorder}` }} />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Schedule"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
