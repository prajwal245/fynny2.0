import { useState, useMemo, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/indian-format";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Link, useNavigate } from "@/lib/router-compat";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  Droplet, TrendingUp, DollarSign, FileText, Shield, Users,
  Brain, BarChart, CreditCard, Briefcase, Lock, CheckCircle,
  ArrowUpRight, ArrowDownRight, MessageCircle, Sparkles, X,
  Receipt, FileSpreadsheet, Bell,
} from "lucide-react";
import { logRealtimeEvent } from "@/lib/realtimeAudit";
import { track } from "@/lib/analytics";
import {
  FynCard, FynPageTitle, FynBadge, FynLabel, FynSectionTitle,
} from "@/components/dashboard/ui";
import LiveCockpitPanel from "@/components/dashboard/LiveCockpitPanel";

const REFETCH_MS = 30000;

// ── Demo data ────────────────────────────────────────────
const DEMO = {
  cashBalance: 4_200_000,
  cashTrend: 12,
  runwayDays: 114,
  monthlyBurn: 1_100_000,
  burnTrend: 8,
  receivablesOverdue: 320_000,
  duePayables: 240_000,
  cashFlow: Array.from({ length: 30 }).map((_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    cashIn: 80_000 + Math.round(Math.random() * 60_000),
    cashOut: 60_000 + Math.round(Math.random() * 50_000),
  })),
  activity: [
    { type: "transfer", desc: "Bank transfer received from Acme Corp", amount: 50_000, time: "2 hours ago" },
    { type: "invoice", desc: "Invoice #INV-234 paid by Stellar Pvt Ltd", amount: 25_000, time: "5 hours ago" },
    { type: "gst", desc: "GSTR-3B filed for August 2025", amount: null, time: "1 day ago" },
    { type: "customer", desc: "New customer added: Horizon Industries", amount: null, time: "2 days ago" },
    { type: "payable", desc: "Vendor payment scheduled to Tata Power", amount: -18_000, time: "3 days ago" },
  ],
  insight:
    "Burn rate increased 8% this month, driven primarily by payroll and SaaS subscriptions. Review vendor costs in Cost Intelligence, three vendors account for 42% of discretionary spend.",
};

// ── Module catalogue (mapped to existing /dashboard routes) ──
type ModuleStatus = "active" | "soon";
interface Module {
  id: string;
  name: string;
  desc: string;
  path: string;
  icon: typeof Droplet;
  status: ModuleStatus;
  lockReason: string;
}

const MODULES: Module[] = [
  { id: "liquidity",  name: "Liquidity Intelligence",   icon: Droplet,      status: "active", desc: "Cash flow, runway forecast, burn alerts",        path: "/dashboard/liquidity",       lockReason: "Connect a bank account to unlock" },
  { id: "revenue",    name: "Revenue Intelligence",     icon: TrendingUp,   status: "active", desc: "MRR/ARR, cohorts, churn signals",                path: "/dashboard/revenue-intelligence",     lockReason: "Connect Razorpay or upload invoices" },
  { id: "cost",       name: "Cost Intelligence",        icon: DollarSign,   status: "active", desc: "Expense categorization, vendor spend",           path: "/dashboard/cost",            lockReason: "Upload transactions to unlock" },
  { id: "gst",        name: "Tax Intelligence",         icon: FileText,     status: "active", desc: "Unified GST + TDS compliance, deadlines, audit", path: "/dashboard/gst",             lockReason: "Connect GST data to unlock" },
  { id: "governance", name: "Governance Intelligence",  icon: Shield,       status: "soon",   desc: "Board reporting, compliance automation",         path: "/dashboard/compliance",      lockReason: "Coming soon" },
  { id: "hr",         name: "HR & Workforce",            icon: Users,        status: "soon",   desc: "Payroll analytics, cost-per-employee",           path: "/dashboard/hr",              lockReason: "Coming soon" },
  { id: "simulator",  name: "Decision Simulator",        icon: Brain,        status: "active", desc: "AI what-if scenarios",                           path: "/dashboard/simulator",       lockReason: "Connect data to run simulations" },
  { id: "market",     name: "Market & Growth",           icon: BarChart,     status: "soon",   desc: "Competitive analysis, growth insights",          path: "/dashboard/market-growth",   lockReason: "Coming soon" },
  { id: "banking",    name: "Banking & Fintech",         icon: CreditCard,   status: "active", desc: "Bank balances and reconciliation",               path: "/dashboard/banking",         lockReason: "Connect a bank to unlock" },
  { id: "ca",         name: "CA Partner Ecosystem",      icon: Briefcase,    status: "active", desc: "Connect with chartered accountants",             path: "/dashboard/ca-partner",      lockReason: "Invite a CA to collaborate" },
];

// ── Quick stat card with 3D tilt ────────────────────────
function StatCard({
  icon: Icon, label, value, trend, trendLabel, accent = "ink",
}: {
  icon: typeof Droplet; label: string; value: string;
  trend?: number; trendLabel?: string;
  accent?: "ink" | "red" | "gold" | "green";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 6, y: px * 6 });
  };
  const reset = () => setTilt({ x: 0, y: 0 });

  const accentColor = {
    ink: "hsl(var(--fyn-ink))", red: "hsl(var(--fyn-red))",
    gold: "hsl(var(--fyn-gold))", green: "#16A34A",
  }[accent];

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      animate={{ rotateX: tilt.x, rotateY: tilt.y }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
      className="bg-card border border-border rounded-lg p-fyn-lg shadow-[0_2px_8px_rgba(23,18,8,0.04)] hover:shadow-[0_12px_30px_rgba(23,18,8,0.10)] transition-shadow"
    >
      <div className="flex items-center gap-fyn-sm mb-fyn-sm">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center"
          style={{ background: `${accentColor}15`, color: accentColor }}
        >
          <Icon size={18} />
        </div>
        <FynLabel className="text-foreground">{label}</FynLabel>
      </div>
      <p className="font-mono text-fyn-metric text-foreground">{value}</p>
      {trend !== undefined && (
        <div className="mt-fyn-xs flex items-center gap-1.5 text-fyn-small">
          {trend >= 0 ? (
            <ArrowUpRight size={14} style={{ color: "#16A34A" }} />
          ) : (
            <ArrowDownRight size={14} style={{ color: "#DC2626" }} />
          )}
          <span style={{ color: trend >= 0 ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
            {trendLabel}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ── Module card with 3D tilt ─────────────────────────────
function ModuleCard({ module, locked, onOpen }: { module: Module; locked: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const Icon = module.icon;
  const isSoon = module.status === "soon";

  const handleMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 8, y: px * 8 });
  };
  const reset = () => setTilt({ x: 0, y: 0 });

  return (
    <motion.button
      ref={ref}
      onClick={onOpen}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      animate={{ rotateX: tilt.x, rotateY: tilt.y }}
      transition={{ type: "spring", stiffness: 250, damping: 22 }}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
      className="text-left bg-card border border-border rounded-xl p-6 h-full w-full flex flex-col hover:border-fyn-red transition-colors shadow-[0_2px_8px_rgba(23,18,8,0.04)] hover:shadow-[0_14px_30px_rgba(23,18,8,0.12)] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-fyn-red"
    >
      <div className="flex items-start justify-between mb-fyn-sm">
        <div
          className="w-11 h-11 rounded-md flex items-center justify-center"
          style={{
            background: isSoon ? "rgba(23,18,8,0.06)" : "linear-gradient(135deg, hsl(var(--fyn-red) / 0.10) 0%, hsl(var(--fyn-gold) / 0.10) 100%)",
            color: isSoon ? "hsl(var(--fyn-ink) / 0.40)" : "hsl(var(--fyn-red))",
          }}
        >
          <Icon size={20} />
        </div>
        {isSoon ? (
          <FynBadge tone="neutral">Soon</FynBadge>
        ) : locked ? (
          <Lock size={14} className="text-fyn-ink/40" />
        ) : (
          <CheckCircle size={14} style={{ color: "#16A34A" }} />
        )}
      </div>
      <h3 className="font-serif text-foreground text-base mb-fyn-xs">{module.name}</h3>
      <p className="text-fyn-small text-muted-foreground leading-relaxed mb-fyn-sm flex-grow">{module.desc}</p>
      <p className="text-fyn-tiny font-medium uppercase tracking-[0.08em] mt-auto"
        style={{ color: isSoon ? "hsl(var(--fyn-ink) / 0.35)" : locked ? "hsl(var(--fyn-gold))" : "#16A34A" }}>
        {isSoon ? "Coming soon" : locked ? "Locked" : "Active"}
      </p>
    </motion.button>
  );
}

// ── Activity icon ────────────────────────────────────────
const ActivityIcon = ({ type }: { type: string }) => {
  const map: Record<string, typeof Droplet> = {
    transfer: ArrowDownRight, invoice: Receipt, gst: FileText,
    customer: Users, payable: ArrowUpRight,
  };
  const Icon = map[type] || Bell;
  return <Icon size={14} className="text-fyn-ink/60" />;
};

// ── Main page ────────────────────────────────────────────
const CockpitPage = () => {
  const { businessId, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [demoMode, setDemoMode] = useState(false);
  const [showFynnyChat, setShowFynnyChat] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 300], [0, -30]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0.85]);

  // Realtime invalidation (kept from previous version)
  useEffect(() => { track("dashboard_viewed"); }, []);

  // Realtime invalidation (kept from previous version)
  useEffect(() => {
    if (!businessId) return;
    const filter = `business_id=eq.${businessId}`;
    const subs = [
      { table: "receivables", queryKey: "receivables-top" },
      { table: "payables", queryKey: "payables" },
      { table: "alerts", queryKey: "alerts" },
      { table: "bank_accounts", queryKey: "bank-accounts" },
      { table: "transactions", queryKey: "transactions-180" },
    ];
    const channelName = `cockpit-live-${businessId}`;
    const channel = supabase.channel(channelName);
    subs.forEach(({ table, queryKey }) => {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, filter },
        (payload: any) => {
          void logRealtimeEvent({
            channel_name: channelName, table_name: table,
            event_type: (payload?.eventType ?? "*") as "INSERT" | "UPDATE" | "DELETE" | "*",
            business_id: businessId,
            row_id: (payload?.new as any)?.id ?? (payload?.old as any)?.id ?? null,
            context: { queryKey }, handler_status: "invalidated",
          });
          queryClient.invalidateQueries({ queryKey: [queryKey, businessId] });
        }
      );
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId, queryClient]);

  // Live data queries
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("balance").eq("business_id", businessId!);
      if (error) throw error; return data || [];
    },
    enabled: !!businessId, refetchInterval: REFETCH_MS,
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-180", businessId],
    queryFn: async () => {
      const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("transactions")
        .select("amount, direction, date").eq("business_id", businessId!)
        .gte("date", since).order("date", { ascending: true });
      if (error) throw error; return data || [];
    },
    enabled: !!businessId, refetchInterval: REFETCH_MS,
  });
  const { data: receivables = [] } = useQuery({
    queryKey: ["receivables-top", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("receivables").select("*")
        .eq("business_id", businessId!).eq("status", "outstanding")
        .order("due_date", { ascending: true }).limit(5);
      if (error) throw error; return data || [];
    },
    enabled: !!businessId, refetchInterval: REFETCH_MS,
  });
  const { data: payables = [] } = useQuery({
    queryKey: ["payables", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payables").select("*")
        .eq("business_id", businessId!).in("status", ["pending", "overdue"]);
      if (error) throw error; return data || [];
    },
    enabled: !!businessId, refetchInterval: REFETCH_MS,
  });
  const { data: brief } = useQuery({
    queryKey: ["fynny-brief", businessId],
    queryFn: async () => {
      const { data } = await supabase.from("fynny_briefs").select("*")
        .eq("business_id", businessId!).order("brief_date", { ascending: false })
        .limit(1).maybeSingle();
      return data;
    },
    enabled: !!businessId,
  });
  const { data: business } = useQuery({
    queryKey: ["business-onboarding", businessId],
    queryFn: async () => {
      const { data } = await supabase.from("businesses").select("onboarding_completed")
        .eq("id", businessId!).maybeSingle();
      return data;
    },
    enabled: !!businessId,
  });

  // Derived live metrics
  const liveCash = useMemo(
    () => bankAccounts.reduce((s, a: any) => s + Number(a.balance || 0), 0),
    [bankAccounts]
  );
  const { liveBurn, liveRunway, liveCashFlow } = useMemo(() => {
    const since90 = Date.now() - 90 * 86400000;
    let totalOut = 0;
    const buckets = new Map<string, { cashIn: number; cashOut: number }>();
    transactions.forEach((t: any) => {
      const ts = new Date(t.date).getTime();
      const amt = Number(t.amount) || 0;
      const isOut = ["debit", "out", "outflow"].includes(t.direction);
      if (ts >= since90 && isOut) totalOut += amt;
      const key = new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const b = buckets.get(key) || { cashIn: 0, cashOut: 0 };
      if (isOut) b.cashOut += amt; else b.cashIn += amt;
      buckets.set(key, b);
    });
    const monthly = totalOut / 3;
    const daily = totalOut / 90;
    return {
      liveBurn: monthly,
      liveRunway: daily > 0 ? liveCash / daily : 0,
      liveCashFlow: Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v })),
    };
  }, [transactions, liveCash]);

  const liveReceivablesOverdue = useMemo(() => {
    const now = Date.now();
    return receivables.filter((r: any) => r.due_date && new Date(r.due_date).getTime() < now)
      .reduce((s, r: any) => s + Number(r.outstanding || r.amount || 0), 0);
  }, [receivables]);

  const liveDuePayables = useMemo(() => {
    const in7 = Date.now() + 7 * 86400000;
    return payables.filter((p: any) => p.due_date && new Date(p.due_date).getTime() <= in7)
      .reduce((s, p: any) => s + Number(p.outstanding || p.amount || 0), 0);
  }, [payables]);

  const hasLiveData = bankAccounts.length > 0 || transactions.length > 0;
  const view = demoMode
    ? {
        cash: DEMO.cashBalance, cashTrend: DEMO.cashTrend,
        runway: DEMO.runwayDays, burn: DEMO.monthlyBurn, burnTrend: DEMO.burnTrend,
        receivables: DEMO.receivablesOverdue, payables: DEMO.duePayables,
        cashFlow: DEMO.cashFlow, activity: DEMO.activity, insight: DEMO.insight,
      }
    : {
        cash: liveCash, cashTrend: undefined as number | undefined,
        runway: liveRunway, burn: liveBurn, burnTrend: undefined as number | undefined,
        receivables: liveReceivablesOverdue, payables: liveDuePayables,
        cashFlow: liveCashFlow, activity: [] as typeof DEMO.activity,
        insight: brief?.content as string | undefined,
      };

  const hasData = demoMode || hasLiveData;
  const onboardingDone = !!business?.onboarding_completed;

  return (
    <DashboardLayout>
      <div className="min-h-full bg-background text-foreground">
      {/* Header: title + demo toggle */}
      <div className="flex items-start justify-between gap-fyn-md mb-fyn-lg flex-wrap">
        <FynPageTitle sub={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}, here's your business at a glance.`}>
          Cockpit
        </FynPageTitle>
        <div className="flex items-center gap-fyn-sm">
          <span className="text-fyn-tiny font-medium uppercase tracking-[0.08em] text-muted-foreground">Demo mode</span>
          <button
            onClick={() => setDemoMode((v) => !v)}
            aria-pressed={demoMode}
            aria-label="Toggle demo mode"
            className="relative h-6 w-11 rounded-full transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-fyn-red"
            style={{
              background: demoMode
                ? "linear-gradient(135deg, hsl(var(--fyn-red)) 0%, hsl(var(--fyn-gold)) 100%)"
                : "hsl(var(--fyn-ink) / 0.20)",
            }}
          >
            <motion.span
              animate={{ x: demoMode ? 22 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-0.5 w-5 h-5 rounded-full bg-card shadow-md"
            />
          </button>
          {demoMode && <FynBadge tone="warning">DEMO</FynBadge>}
        </div>
      </div>

      {/* Live data panel — wired to seeded customers/invoices/expenses/etc. */}
      <div className="mb-fyn-lg">
        <LiveCockpitPanel />
      </div>



      {/* Onboarding banner */}
      {!onboardingDone && !demoMode && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-fyn-lg rounded-lg p-fyn-md flex items-center justify-between gap-fyn-md flex-wrap"
          style={{
            background: "linear-gradient(135deg, hsl(var(--fyn-red) / 0.08) 0%, hsl(var(--fyn-gold) / 0.08) 100%)",
            border: "1px solid hsl(var(--fyn-red) / 0.20)",
          }}
        >
          <div>
            <p className="font-semibold text-fyn-body text-fyn-red">Complete your setup</p>
            <p className="text-fyn-small text-fyn-ink-60 mt-0.5">
              Connect your bank and accounting to unlock AI-powered financial intelligence.
            </p>
          </div>
          <button
            onClick={() => navigate("/onboarding")}
            className="px-5 py-2.5 rounded-md text-white font-medium text-fyn-small whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, hsl(var(--fyn-red)) 0%, hsl(var(--fyn-gold)) 100%)",
              boxShadow: "0 4px 12px hsl(var(--fyn-red) / 0.30)",
            }}
          >
            Complete Setup →
          </button>
        </motion.div>
      )}

      {/* Hero KPIs (parallax) */}
      <motion.div
        ref={heroRef}
        style={{ y: heroY, opacity: heroOpacity }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-fyn-md mb-fyn-lg"
      >
        <StatCard icon={Droplet} label="Cash Position" accent="ink"
          value={hasData ? formatINR(view.cash) : "-"}
          trend={view.cashTrend} trendLabel={view.cashTrend !== undefined ? `+${view.cashTrend}% this month` : undefined} />
        <StatCard icon={TrendingUp} label="Runway" accent="green"
          value={hasData && view.runway > 0 ? `${view.runway.toFixed(0)} days` : "-"} />
        <StatCard icon={DollarSign} label="Monthly Burn" accent="red"
          value={hasData && view.burn > 0 ? formatINR(Math.round(view.burn)) : "-"}
          trend={view.burnTrend !== undefined ? -view.burnTrend : undefined}
          trendLabel={view.burnTrend !== undefined ? `+${view.burnTrend}% this month` : undefined} />
        <StatCard icon={FileText} label="Receivables Overdue" accent="gold"
          value={hasData ? formatINR(view.receivables) : "-"} />
      </motion.div>

      {/* Cash flow chart */}
      <FynCard className="mb-fyn-lg bg-card border-border">
        <div className="flex items-center justify-between mb-fyn-md">
          <h3 className="font-serif text-fyn-h3 text-foreground">Cash Flow</h3>
          <Link to="/dashboard/cash-flow" className="text-fyn-small font-medium text-fyn-red hover:underline">
            View detail →
          </Link>
        </div>
        {view.cashFlow.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center">
            <p className="text-muted-foreground text-fyn-small italic">
              No transactions yet. Toggle Demo mode to preview.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={view.cashFlow}>
              <defs>
                <linearGradient id="ckIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="ckOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#DC2626" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="#DC2626" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "rgba(23,18,8,0.45)" }}
                interval={Math.max(0, Math.floor(view.cashFlow.length / 8))} />
              <YAxis tick={{ fontSize: 11, fill: "rgba(23,18,8,0.45)" }}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--foreground))", border: "none", borderRadius: 8, color: "hsl(var(--background))" }}
                labelStyle={{ color: "hsl(var(--background) / 0.5)" }}
              />
              <Area type="monotone" dataKey="cashIn" stroke="#16A34A" strokeWidth={2} fill="url(#ckIn)" />
              <Area type="monotone" dataKey="cashOut" stroke="#DC2626" strokeWidth={2} fill="url(#ckOut)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </FynCard>

      {/* Intelligence Modules */}
      <FynSectionTitle>Intelligence Modules</FynSectionTitle>
      <motion.div
        initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-fyn-lg"
      >
        {MODULES.map((m) => (
          <motion.div
            key={m.id}
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
            className="h-full"
          >
            <ModuleCard
              module={m}
              locked={!hasData && m.status === "active"}
              onOpen={() => {
                if (m.status === "soon") return;
                navigate(m.path);
              }}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom: Fynny insight + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-lg mb-fyn-lg">
        {/* Fynny insight */}
        <div className="rounded-lg p-fyn-lg bg-card border border-border shadow-[0_12px_30px_rgba(23,18,8,0.18)]">
          <div className="flex items-start gap-fyn-sm">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(var(--fyn-red)) 0%, hsl(var(--fyn-gold)) 100%)" }}
            >
              F
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-fyn-tiny font-medium uppercase tracking-[0.08em] text-muted-foreground mb-fyn-xs">
                Latest insight from CFO Fynny
              </p>
              <p className="text-foreground text-fyn-body leading-relaxed">
                {view.insight ||
                  "Connect your bank account to receive your first financial intelligence brief within 24 hours."}
              </p>
              <button
                onClick={() => setShowFynnyChat(true)}
                className="mt-fyn-md inline-flex items-center gap-2 px-4 py-2 rounded-md text-fyn-small font-medium bg-muted text-foreground border border-border hover:bg-muted/80"
              >
                <MessageCircle size={14} /> Chat with Fynny
              </button>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <FynCard className="bg-card border-border">
          <h3 className="font-serif text-fyn-h3 text-foreground mb-fyn-md">Recent Activity</h3>
          {view.activity.length > 0 ? (
            <ul className="space-y-fyn-sm">
              {view.activity.map((a, idx) => (
                <li key={idx} className="flex items-start gap-fyn-sm pb-fyn-sm border-b border-fyn-ink-10 last:border-0 last:pb-0">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center bg-muted flex-shrink-0">
                    <ActivityIcon type={a.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-fyn-small text-foreground">{a.desc}</p>
                    <p className="text-fyn-tiny text-muted-foreground mt-0.5">{a.time}</p>
                  </div>
                  {a.amount !== null && (
                    <span
                      className="font-mono text-fyn-small font-semibold"
                      style={{ color: a.amount >= 0 ? "#16A34A" : "#DC2626" }}
                    >
                      {a.amount >= 0 ? "+" : "−"}₹{Math.abs(a.amount).toLocaleString("en-IN")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-fyn-lg">
              <p className="text-foreground text-fyn-body font-semibold">No activity yet</p>
              <p className="text-fyn-small text-muted-foreground mt-fyn-xs">
                Connect your accounts to see transactions appear here.
              </p>
            </div>
          )}
        </FynCard>
      </div>

      {/* Floating Fynny FAB */}
      <motion.button
        onClick={() => setShowFynnyChat(true)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white"
        style={{
          background: "linear-gradient(135deg, hsl(var(--fyn-red)) 0%, hsl(var(--fyn-gold)) 100%)",
          boxShadow: "0 10px 28px hsl(var(--fyn-red) / 0.40)",
        }}
        aria-label="Chat with CFO Fynny"
      >
        <Sparkles size={22} />
      </motion.button>

      {/* Fynny modal */}
      <AnimatePresence>
        {showFynnyChat && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-fyn-md"
            style={{ background: "rgba(23,18,8,0.55)", backdropFilter: "blur(6px)" }}
            onClick={() => setShowFynnyChat(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-lg p-fyn-lg bg-card border border-border"
            >
              <div className="flex items-start justify-between mb-fyn-md">
                <div className="flex items-center gap-fyn-sm">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: "linear-gradient(135deg, hsl(var(--fyn-red)) 0%, hsl(var(--fyn-gold)) 100%)" }}
                  >
                    F
                  </div>
                  <div>
                    <h3 className="font-serif text-fyn-h3 text-foreground">CFO Fynny</h3>
                    <p className="text-fyn-tiny text-muted-foreground">Your financial intelligence assistant</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFynnyChat(false)}
                  aria-label="Close"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={20} />
                </button>
              </div>
               <p className="text-fyn-small text-muted-foreground mb-fyn-md">
                Open the full chat to get AI-powered insights and recommendations.
              </p>
              <Link
                to="/dashboard/fynny-chat"
                onClick={() => setShowFynnyChat(false)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-white font-medium text-fyn-small"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--fyn-red)) 0%, hsl(var(--fyn-gold)) 100%)",
                  boxShadow: "0 4px 12px hsl(var(--fyn-red) / 0.30)",
                }}
              >
                Open Fynny Chat →
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

export default CockpitPage;
