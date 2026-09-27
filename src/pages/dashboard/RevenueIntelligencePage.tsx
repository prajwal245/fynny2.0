import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import {
  TrendingUp, TrendingDown, Users, DollarSign, RefreshCw, Download,
  AlertTriangle, AlertCircle, Info, LineChart as LineChartIcon, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import {
  FynPage, FynPageTitle, FynCard, FynCardTitle, FynSectionTitle,
  FynLabel, FynBadge, FynButton, FynLoading, FynEmpty,
  FynTable, FynTH, FynTR, FynTD,
} from "@/components/dashboard/ui";
import { supabaseExternal } from "@/integrations/supabase/external";
import { useAuth } from "@/contexts/AuthContext";
import { formatINR } from "@/lib/indian-format";
import { exportToCsv } from "@/utils/csvExport";
import { toast } from "sonner";

interface RevenueResponse {
  revenue_metrics?: {
    mrr?: number;
    arr?: number;
    growth_rate?: number;
    customer_count?: number;
    arpu?: number;
    ltv?: number;
    churn_rate?: number;
    avg_customer_age_months?: number;
  };
  breakdown?: {
    new_revenue?: number;
    expansion_revenue?: number;
    churned_revenue?: number;
    net_revenue?: number;
  };
  trend?: Array<{ month: string; mrr?: number; customers?: number; growth_rate?: number }>;
  revenue_by_plan?: Array<{ plan: string; mrr: number; percentage?: number }>;
  top_customers?: Array<{ name: string; revenue: number; percentage?: number }>;
  concentration_risk?: number;
  cohorts?: Array<{ cohort: string; customers: number; mrr: number; retention_rate: number }>;
  alerts?: Array<{ severity: "critical" | "warning" | "info"; message: string; title?: string }>;
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

export default function RevenueIntelligencePage() {
  const { businessId } = useAuth();
  const [sortDesc, setSortDesc] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useQuery<RevenueResponse>({
    queryKey: ["revenue-intelligence", businessId],
    queryFn: async () => {
      if (!businessId) throw new Error("No business ID");
      const { data, error } = await supabaseExternal.functions.invoke(
        "revenue-intelligence",
        { body: { business_id: businessId, org_id: businessId } },
      );
      if (error) throw error;
      return data as RevenueResponse;
    },
    enabled: !!businessId,
    refetchInterval: 60_000,
  });

  const isEmpty = useMemo(() => {
    if (!data) return false;
    const m = data.revenue_metrics || {};
    return num(m.mrr) === 0 && num(m.arr) === 0 && num(m.customer_count) === 0;
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const m = data.revenue_metrics || {};
    const b = data.breakdown || {};
    const rows = [
      { metric: "MRR", value: num(m.mrr) },
      { metric: "ARR", value: num(m.arr) },
      { metric: "Growth Rate (%)", value: num(m.growth_rate) },
      { metric: "Customer Count", value: num(m.customer_count) },
      { metric: "ARPU", value: num(m.arpu) },
      { metric: "LTV", value: num(m.ltv) },
      { metric: "Churn Rate (%)", value: num(m.churn_rate) },
      { metric: "Avg Customer Age (months)", value: num(m.avg_customer_age_months) },
      { metric: "New Revenue", value: num(b.new_revenue) },
      { metric: "Expansion Revenue", value: num(b.expansion_revenue) },
      { metric: "Churned Revenue", value: num(b.churned_revenue) },
      { metric: "Net Revenue", value: num(b.net_revenue) },
      { metric: "Concentration Risk (%)", value: num(data.concentration_risk) },
    ];
    exportToCsv(rows, "revenue-intelligence");
  };

  const handleRefresh = async () => {
    await refetch();
    toast.success("Revenue refreshed");
  };

  return (
    <DashboardLayout>
      <FynPage>
        <div className="flex items-start justify-between gap-fyn-md flex-wrap">
          <FynPageTitle sub="Real-time view of MRR, ARR, growth, retention and concentration risk">
            Revenue Intelligence
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
                <h3 className="font-serif text-fyn-h3 text-fyn-ink mb-fyn-xs">Couldn't load revenue data</h3>
                <p className="text-fyn-body text-fyn-ink-60 mb-fyn-md">
                  {(error as Error).message || "The revenue engine is unreachable right now."}
                </p>
                <FynButton onClick={handleRefresh}>Try again</FynButton>
              </div>
            </div>
          </FynCard>
        )}

        {!isLoading && !error && data && isEmpty && (
          <FynEmpty
            icon={<LineChartIcon className="h-7 w-7" />}
            title="No revenue data yet"
            description="Connect Razorpay or Stripe to track subscriptions automatically, or upload subscription data via CSV."
            action={
              <Link to="/dashboard/data-import">
                <FynButton>Upload data</FynButton>
              </Link>
            }
          />
        )}

        {!isLoading && !error && data && !isEmpty && (
          <RevenueContent data={data} sortDesc={sortDesc} setSortDesc={setSortDesc} />
        )}
      </FynPage>
    </DashboardLayout>
  );
}

function RevenueContent({
  data, sortDesc, setSortDesc,
}: { data: RevenueResponse; sortDesc: boolean; setSortDesc: (v: boolean) => void }) {
  const m = data.revenue_metrics || {};
  const b = data.breakdown || {};
  const growth = num(m.growth_rate);
  const growthTone = growth > 10 ? "success" : growth >= 0 ? "warning" : "danger";
  const growthLabel = growth > 10 ? "Healthy" : growth >= 0 ? "Stable" : "Declining";

  const trend = (data.trend || []).map(t => ({
    month: t.month,
    mrr: num(t.mrr),
    customers: num(t.customers),
    growth_rate: num(t.growth_rate),
  }));

  const planTotal = (data.revenue_by_plan || []).reduce((s, p) => s + num(p.mrr), 0);
  const plans = (data.revenue_by_plan || [])
    .slice().sort((a, c) => num(c.mrr) - num(a.mrr)).slice(0, 5)
    .map(p => ({
      plan: p.plan,
      mrr: num(p.mrr),
      percentage: p.percentage != null ? num(p.percentage) : (planTotal > 0 ? (num(p.mrr) / planTotal) * 100 : 0),
    }));

  const customersTotal = (data.top_customers || []).reduce((s, c) => s + num(c.revenue), 0);
  const customers = (data.top_customers || [])
    .slice()
    .sort((a, c) => sortDesc ? num(c.revenue) - num(a.revenue) : num(a.revenue) - num(c.revenue))
    .slice(0, 10)
    .map(c => ({
      ...c,
      revenue: num(c.revenue),
      percentage: c.percentage != null ? num(c.percentage) : (customersTotal > 0 ? (num(c.revenue) / customersTotal) * 100 : 0),
    }));

  const concentration = num(data.concentration_risk);
  const concTone = concentration < 30 ? "success" : concentration <= 50 ? "warning" : "danger";
  const concLabel = concentration < 30 ? "Healthy" : concentration <= 50 ? "Moderate Risk" : "High Risk";
  const concBar = concentration < 30 ? "bg-[#16A34A]" : concentration <= 50 ? "bg-amber-500" : "bg-fyn-red";

  return (
    <>
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-fyn-md">
        <Kpi
          icon={<DollarSign className="h-5 w-5" />}
          label="MRR"
          value={formatINR(num(m.mrr))}
          badge={
            <FynBadge tone={growth >= 0 ? "success" : "danger"}>
              {growth >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
              {" "}{Math.abs(growth).toFixed(1)}%
            </FynBadge>
          }
        />
        <Kpi
          icon={<TrendingUp className="h-5 w-5" />}
          label="ARR"
          value={formatINR(num(m.arr))}
          footer="Annual Run Rate"
        />
        <Kpi
          icon={growth >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          label="Growth Rate"
          value={`${growth.toFixed(1)}%`}
          badge={<FynBadge tone={growthTone}>{growthLabel}</FynBadge>}
        />
        <Kpi
          icon={<Users className="h-5 w-5" />}
          label="Active Customers"
          value={num(m.customer_count).toLocaleString("en-IN")}
          footer={`ARPU: ${formatINR(num(m.arpu))}`}
        />
      </div>

      {/* Revenue Breakdown */}
      <div>
        <FynSectionTitle>Revenue Breakdown</FynSectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-fyn-md">
          <FynCard><MiniMetric label="New Revenue" value={formatINR(num(b.new_revenue))} positive /></FynCard>
          <FynCard><MiniMetric label="Expansion" value={formatINR(num(b.expansion_revenue))} positive /></FynCard>
          <FynCard><MiniMetric label="Churned" value={formatINR(num(b.churned_revenue))} negative /></FynCard>
          <FynCard>
            <MiniMetric
              label="Net Revenue"
              value={formatINR(num(b.net_revenue))}
              positive={num(b.net_revenue) >= 0}
              negative={num(b.net_revenue) < 0}
            />
          </FynCard>
        </div>
      </div>

      {/* MRR Trend */}
      {trend.length > 0 && (
        <div>
          <FynSectionTitle>MRR Trend (Last 12 Months)</FynSectionTitle>
          <FynCard>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" />
                  <XAxis dataKey="month" tick={{ fill: "#171208", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
                  <Tooltip
                    contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
                    formatter={(v: number, name: string) => name === "MRR" ? formatINR(v) : v}
                    labelFormatter={(l) => `Month: ${l}`}
                  />
                  <Line type="monotone" dataKey="mrr" stroke="#C41E1E" strokeWidth={2.5} dot={{ r: 4, fill: "#C41E1E" }} name="MRR" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </FynCard>
        </div>
      )}

      {/* Revenue by Plan */}
      {plans.length > 0 && (
        <div>
          <FynSectionTitle>Revenue by Plan</FynSectionTitle>
          <FynCard>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plans} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
                  <YAxis dataKey="plan" type="category" tick={{ fill: "#171208", fontSize: 12 }} width={120} />
                  <Tooltip
                    contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
                    formatter={(v: number, _n, p: any) => [`${formatINR(v)} (${(p.payload.percentage || 0).toFixed(1)}%)`, "MRR"]}
                  />
                  <Bar dataKey="mrr" fill="#8B6914" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </FynCard>
        </div>
      )}

      {/* Concentration Risk */}
      <div>
        <FynSectionTitle>Concentration Risk</FynSectionTitle>
        <FynCard>
          <div className="flex items-center justify-between mb-fyn-sm flex-wrap gap-fyn-sm">
            <div>
              <FynLabel>Top 3 customers represent</FynLabel>
              <p className="font-mono text-fyn-metric text-fyn-ink mt-fyn-xs">{concentration.toFixed(1)}%</p>
              <p className="text-fyn-small text-fyn-ink-60 mt-fyn-xs">of total revenue</p>
            </div>
            <FynBadge tone={concTone}>{concLabel}</FynBadge>
          </div>
          <div className="w-full h-3 rounded-full bg-fyn-ink-10 overflow-hidden" role="progressbar" aria-valuenow={concentration} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${concBar} transition-all`} style={{ width: `${Math.min(100, concentration)}%` }} />
          </div>
        </FynCard>
      </div>

      {/* Top Customers */}
      {customers.length > 0 && (
        <div>
          <FynSectionTitle>Top Customers</FynSectionTitle>
          <FynCard className="p-0 overflow-hidden">
            <FynTable>
              <thead>
                <FynTR>
                  <FynTH>Customer</FynTH>
                  <FynTH align="right">
                    <button
                      type="button"
                      onClick={() => setSortDesc(!sortDesc)}
                      className="hover:text-fyn-ink"
                      aria-label="Sort by revenue"
                    >
                      Revenue {sortDesc ? "↓" : "↑"}
                    </button>
                  </FynTH>
                  <FynTH align="right">% of Total</FynTH>
                </FynTR>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <FynTR key={i} className={c.percentage > 20 ? "bg-fyn-red/5" : ""}>
                    <FynTD>
                      {c.name}
                      {c.percentage > 20 && (
                        <FynBadge tone="danger" className="ml-fyn-sm">Concentration</FynBadge>
                      )}
                    </FynTD>
                    <FynTD align="right" mono>{formatINR(c.revenue)}</FynTD>
                    <FynTD align="right" mono>{c.percentage.toFixed(1)}%</FynTD>
                  </FynTR>
                ))}
              </tbody>
            </FynTable>
          </FynCard>
        </div>
      )}

      {/* Cohorts */}
      {data.cohorts && data.cohorts.length > 0 && (
        <div>
          <FynSectionTitle>Cohort Analysis</FynSectionTitle>
          <FynCard className="p-0 overflow-hidden">
            <FynTable>
              <thead>
                <FynTR>
                  <FynTH>Cohort</FynTH>
                  <FynTH align="right">Customers</FynTH>
                  <FynTH align="right">MRR</FynTH>
                  <FynTH align="right">Retention</FynTH>
                </FynTR>
              </thead>
              <tbody>
                {data.cohorts.slice(0, 12).map((c, i) => {
                  const r = num(c.retention_rate);
                  const tone = r >= 80 ? "success" : r >= 50 ? "warning" : "danger";
                  return (
                    <FynTR key={i}>
                      <FynTD>{c.cohort}</FynTD>
                      <FynTD align="right" mono>{num(c.customers).toLocaleString("en-IN")}</FynTD>
                      <FynTD align="right" mono>{formatINR(num(c.mrr))}</FynTD>
                      <FynTD align="right">
                        <FynBadge tone={tone as any}>{r.toFixed(1)}%</FynBadge>
                      </FynTD>
                    </FynTR>
                  );
                })}
              </tbody>
            </FynTable>
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

      {/* Additional metrics */}
      <div>
        <FynSectionTitle>Customer Economics</FynSectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-fyn-md">
          <FynCard><MiniMetric label="ARPU" value={formatINR(num(m.arpu))} /></FynCard>
          <FynCard><MiniMetric label="LTV" value={formatINR(num(m.ltv))} /></FynCard>
          <FynCard><MiniMetric label="Churn Rate" value={`${num(m.churn_rate).toFixed(1)}%`} negative={num(m.churn_rate) > 5} /></FynCard>
          <FynCard><MiniMetric label="Avg Customer Age" value={`${num(m.avg_customer_age_months).toFixed(1)} mo`} /></FynCard>
        </div>
      </div>
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
