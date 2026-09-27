import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import {
  Wallet, Clock, TrendingDown, Scale, RefreshCw, Download,
  AlertTriangle, AlertCircle, Info, Database, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import {
  FynPage, FynPageTitle, FynCard, FynCardTitle, FynSectionTitle,
  FynLabel, FynBadge, FynButton, FynLoading, FynEmpty,
} from "@/components/dashboard/ui";
import { supabaseExternal } from "@/integrations/supabase/external";
import { useAuth } from "@/contexts/AuthContext";
import { formatINR } from "@/lib/indian-format";
import { exportToCsv } from "@/utils/csvExport";
import { toast } from "sonner";

interface LiquidityResponse {
  liquidity_position?: {
    cash_on_hand?: number;
    current_assets?: number;
    current_liabilities?: number;
    working_capital?: number;
    current_ratio?: number;
    quick_ratio?: number;
  };
  runway?: { days?: number; months?: number; status?: string };
  cash_flow?: {
    monthly_burn?: number;
    total_inflows?: number;
    total_outflows?: number;
    net_cash_flow?: number;
  };
  trend?: Array<{ period: string; inflow?: number; outflow?: number; net?: number; balance?: number }>;
  forecast?: Array<{ month: string; ending_balance: number }>;
  alerts?: Array<{ severity: "critical" | "warning" | "info"; message: string; title?: string }>;
  expense_categories?: Array<{ category: string; amount: number }>;
  revenue_categories?: Array<{ category: string; amount: number }>;
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

export default function LiquidityIntelligencePage() {
  const { businessId } = useAuth();

  const { data, isLoading, error, refetch, isFetching } = useQuery<LiquidityResponse>({
    queryKey: ["liquidity-intelligence", businessId],
    queryFn: async () => {
      if (!businessId) throw new Error("No business ID");
      const { data, error } = await supabaseExternal.functions.invoke(
        "liquidity-intelligence",
        { body: { business_id: businessId, org_id: businessId } },
      );
      if (error) throw error;
      return data as LiquidityResponse;
    },
    enabled: !!businessId,
    refetchInterval: 60_000,
  });

  const isEmpty = useMemo(() => {
    if (!data) return false;
    return (
      num(data.liquidity_position?.cash_on_hand) === 0 &&
      num(data.cash_flow?.monthly_burn) === 0 &&
      num(data.cash_flow?.total_inflows) === 0 &&
      num(data.cash_flow?.total_outflows) === 0
    );
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const lp = data.liquidity_position || {};
    const cf = data.cash_flow || {};
    const rows = [
      { metric: "Cash on Hand", value: num(lp.cash_on_hand) },
      { metric: "Current Assets", value: num(lp.current_assets) },
      { metric: "Current Liabilities", value: num(lp.current_liabilities) },
      { metric: "Working Capital", value: num(lp.working_capital) },
      { metric: "Current Ratio", value: num(lp.current_ratio) },
      { metric: "Quick Ratio", value: num(lp.quick_ratio) },
      { metric: "Runway (days)", value: num(data.runway?.days) },
      { metric: "Monthly Burn", value: num(cf.monthly_burn) },
      { metric: "Total Inflows (90d)", value: num(cf.total_inflows) },
      { metric: "Total Outflows (90d)", value: num(cf.total_outflows) },
      { metric: "Net Cash Flow", value: num(cf.net_cash_flow) },
    ];
    exportToCsv(rows, "liquidity-intelligence");
  };

  const handleRefresh = async () => {
    await refetch();
    toast.success("Liquidity refreshed");
  };

  return (
    <DashboardLayout>
      <FynPage>
        <div className="flex items-start justify-between gap-fyn-md flex-wrap">
          <FynPageTitle sub="Real-time view of cash, runway, working capital and risk">
            Liquidity Intelligence
          </FynPageTitle>
          <div className="flex items-center gap-fyn-sm">
            <FynButton variant="secondary" onClick={handleRefresh} disabled={isFetching} aria-label="Refresh data">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </FynButton>
            <FynButton variant="secondary" onClick={handleExport} disabled={!data || isEmpty} aria-label="Export to CSV">
              <Download className="h-4 w-4" />
              Export
            </FynButton>
          </div>
        </div>

        {isLoading && <FynLoading rows={4} />}

        {error && !isLoading && (
          <FynCard className="border-fyn-red/40">
            <div className="flex items-start gap-fyn-md">
              <AlertCircle className="h-5 w-5 text-fyn-red shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-serif text-fyn-h3 text-fyn-ink mb-fyn-xs">Couldn't load liquidity data</h3>
                <p className="text-fyn-body text-fyn-ink-60 mb-fyn-md">
                  {(error as Error).message || "The liquidity engine is unreachable right now."}
                </p>
                <FynButton onClick={handleRefresh}>Try again</FynButton>
              </div>
            </div>
          </FynCard>
        )}

        {!isLoading && !error && data && isEmpty && (
          <FynEmpty
            icon={<Database className="h-7 w-7" />}
            title="No liquidity data yet"
            description="Upload your bank statements and transactions to see live runway, burn and working-capital analysis."
            action={
              <Link to="/dashboard/data-import">
                <FynButton>Upload data</FynButton>
              </Link>
            }
          />
        )}

        {!isLoading && !error && data && !isEmpty && (
          <LiquidityContent data={data} />
        )}
      </FynPage>
    </DashboardLayout>
  );
}

function LiquidityContent({ data }: { data: LiquidityResponse }) {
  const lp = data.liquidity_position || {};
  const cf = data.cash_flow || {};
  const runwayDays = num(data.runway?.days);
  const runwayMonths = runwayDays / 30;
  // Tier badge: Safe (>6mo) / Watch (3-6mo) / Critical (<3mo), ported from RunwayPage
  const runwayTone = runwayMonths > 6 ? "success" : runwayMonths >= 3 ? "warning" : "danger";
  const runwayLabel = runwayMonths > 6 ? "Safe" : runwayMonths >= 3 ? "Watch" : "Critical";
  const crisisDate = runwayDays > 0 && runwayDays < 3650
    ? new Date(Date.now() + runwayDays * 86400000).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;

  const trend = (data.trend || []).map((t) => ({
    period: t.period,
    inflow: num(t.inflow),
    outflow: num(t.outflow),
    net: num(t.net ?? num(t.inflow) - num(t.outflow)),
    balance: num(t.balance),
  }));

  const forecast = (data.forecast || []).map((f) => ({
    month: f.month,
    balance: num(f.ending_balance),
  }));

  const expenseCats = (data.expense_categories || [])
    .slice()
    .sort((a, b) => num(b.amount) - num(a.amount))
    .slice(0, 5);
  const revenueCats = (data.revenue_categories || [])
    .slice()
    .sort((a, b) => num(b.amount) - num(a.amount))
    .slice(0, 5);

  return (
    <>
      {/* Top KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-fyn-md">
        <Kpi
          icon={<Wallet className="h-5 w-5" />}
          label="Cash on Hand"
          value={formatINR(num(lp.cash_on_hand))}
        />
        <Kpi
          icon={<Clock className="h-5 w-5" />}
          label="Runway"
          value={`${runwayDays} days`}
          badge={<FynBadge tone={runwayTone}>{runwayLabel}</FynBadge>}
          footer={crisisDate ? `Crisis date: ${crisisDate}` : undefined}
        />
        <Kpi
          icon={<TrendingDown className="h-5 w-5" />}
          label="Monthly Burn"
          value={formatINR(num(cf.monthly_burn))}
        />
        <Kpi
          icon={<Scale className="h-5 w-5" />}
          label="Working Capital"
          value={formatINR(num(lp.working_capital))}
        />
      </div>

      {/* Liquidity Position */}
      <div>
        <FynSectionTitle>Liquidity Position</FynSectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-fyn-md">
          <FynCard><MiniMetric label="Current Assets" value={formatINR(num(lp.current_assets))} /></FynCard>
          <FynCard><MiniMetric label="Current Liabilities" value={formatINR(num(lp.current_liabilities))} /></FynCard>
          <FynCard><MiniMetric label="Current Ratio" value={num(lp.current_ratio).toFixed(2)} /></FynCard>
          <FynCard><MiniMetric label="Quick Ratio" value={num(lp.quick_ratio).toFixed(2)} /></FynCard>
        </div>
      </div>

      {/* Cash Flow */}
      <div>
        <div className="flex items-center justify-between gap-fyn-md flex-wrap">
          <FynSectionTitle>Cash Flow (Last 90 Days)</FynSectionTitle>
          <Link to="/dashboard/cash-flow">
            <FynButton variant="secondary">View All Transactions →</FynButton>
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-fyn-md mb-fyn-md">
          <FynCard>
            <MiniMetric label="Total Inflows" value={formatINR(num(cf.total_inflows))} positive />
          </FynCard>
          <FynCard>
            <MiniMetric label="Total Outflows" value={formatINR(num(cf.total_outflows))} negative />
          </FynCard>
          <FynCard>
            <MiniMetric label="Net Cash Flow" value={formatINR(num(cf.net_cash_flow))} positive={num(cf.net_cash_flow) >= 0} negative={num(cf.net_cash_flow) < 0} />
          </FynCard>
        </div>

        {trend.length > 0 && (
          <FynCard>
            <FynCardTitle>Cash Flow Trend</FynCardTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inflowFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16A34A" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outflowFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C41E1E" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#C41E1E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" />
                  <XAxis dataKey="period" tick={{ fill: "#171208", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
                  <Tooltip
                    contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
                    formatter={(v: number) => formatINR(v)}
                  />
                  <Area type="monotone" dataKey="inflow" stroke="#16A34A" fill="url(#inflowFill)" strokeWidth={2} name="Inflow" />
                  <Area type="monotone" dataKey="outflow" stroke="#C41E1E" fill="url(#outflowFill)" strokeWidth={2} name="Outflow" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </FynCard>
        )}
      </div>

      {/* Forecast */}
      {forecast.length > 0 && (
        <div>
          <FynSectionTitle>6-Month Cash Forecast</FynSectionTitle>
          <FynCard>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecast} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" />
                  <XAxis dataKey="month" tick={{ fill: "#171208", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
                  <Tooltip
                    contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
                    formatter={(v: number) => formatINR(v)}
                  />
                  <Line type="monotone" dataKey="balance" stroke="#C41E1E" strokeWidth={2.5} dot={{ r: 4, fill: "#C41E1E" }} name="Ending Balance" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </FynCard>
        </div>
      )}

      {/* Alerts */}
      {data.alerts && data.alerts.length > 0 && (
        <div>
          <FynSectionTitle>Alerts</FynSectionTitle>
          <div className="space-y-fyn-sm">
            {data.alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
          </div>
        </div>
      )}

      {/* Category breakdowns */}
      {(expenseCats.length > 0 || revenueCats.length > 0) && (
        <div>
          <FynSectionTitle>Category Breakdown</FynSectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-md">
            {expenseCats.length > 0 && (
              <FynCard>
                <FynCardTitle>Top 5 Expense Categories</FynCardTitle>
                <CategoryChart data={expenseCats} color="#C41E1E" />
              </FynCard>
            )}
            {revenueCats.length > 0 && (
              <FynCard>
                <FynCardTitle>Top 5 Revenue Categories</FynCardTitle>
                <CategoryChart data={revenueCats} color="#16A34A" />
              </FynCard>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ icon, label, value, badge, footer }: { icon: React.ReactNode; label: string; value: string; badge?: React.ReactNode; footer?: string }) {
  return (
    <FynCard>
      <div className="flex items-start justify-between mb-fyn-sm">
        <div className="text-fyn-ink-45">{icon}</div>
        {badge}
      </div>
      <FynLabel>{label}</FynLabel>
      <p className="font-mono text-fyn-metric text-fyn-ink mt-fyn-xs">{value}</p>
      {footer && <p className="text-fyn-small text-fyn-ink-60 mt-fyn-xs">{footer}</p>}
    </FynCard>
  );
}

function MiniMetric({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div>
      <FynLabel>{label}</FynLabel>
      <p
        className={`font-mono text-[22px] font-semibold mt-fyn-xs ${
          positive ? "text-[#16A34A]" : negative ? "text-fyn-red" : "text-fyn-ink"
        }`}
      >
        {positive && <ArrowUpRight className="inline h-4 w-4 mr-1" />}
        {negative && <ArrowDownRight className="inline h-4 w-4 mr-1" />}
        {value}
      </p>
    </div>
  );
}

function AlertRow({ alert }: { alert: { severity: string; message: string; title?: string } }) {
  const tone = alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "neutral";
  const Icon = alert.severity === "critical" ? AlertCircle : alert.severity === "warning" ? AlertTriangle : Info;
  const iconColor =
    alert.severity === "critical" ? "text-fyn-red" :
    alert.severity === "warning" ? "text-[#8B5A00]" : "text-[#475569]";
  return (
    <FynCard className="py-fyn-md">
      <div className="flex items-start gap-fyn-md">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-fyn-sm mb-fyn-xs">
            {alert.title && <span className="font-medium text-fyn-ink">{alert.title}</span>}
            <FynBadge tone={tone as any}>{alert.severity}</FynBadge>
          </div>
          <p className="text-fyn-body text-fyn-ink-60">{alert.message}</p>
        </div>
      </div>
    </FynCard>
  );
}

function CategoryChart({ data, color }: { data: Array<{ category: string; amount: number }>; color: string }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
          <YAxis dataKey="category" type="category" tick={{ fill: "#171208", fontSize: 12 }} width={110} />
          <Tooltip
            contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
            formatter={(v: number) => formatINR(v)}
          />
          <Bar dataKey="amount" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
