import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router-compat";
import {
  Wallet, TrendingDown, TrendingUp, Users, RefreshCw, Download,
  AlertTriangle, AlertCircle, Info, ArrowUpRight, ArrowDownRight,
  Database, ShieldAlert, Lightbulb, Layers, BarChart3,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ReferenceLine,
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

interface CostResponse {
  cost_metrics?: {
    total_spend?: number;
    total_outstanding?: number;
    mom_change_percent?: number;
    concentration_risk?: number;
    avg_monthly_spend?: number;
    vendor_count?: number;
    invoice_count?: number;
    period_days?: number;
  };
  top_vendors?: Array<{ id?: string; vendor: string; total_spend: number; outstanding: number; invoice_count: number; percentage?: number }>;
  category_breakdown?: Array<{ category: string; amount: number; percentage?: number }>;
  trend?: Array<{ month: string; spend: number }>;
  trend_average?: number;
  anomalies?: Array<{ severity: "warning" | "info"; type: string; message: string; value?: number; threshold?: number }>;
  alerts?: Array<{ severity: "critical" | "warning" | "info"; message: string; title?: string }>;
  suggestions?: Array<{ priority: "high" | "medium" | "low"; type: string; message: string; potential_savings?: number }>;
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

const PERIOD_OPTIONS = [30, 60, 90, 180];

export default function CostPage() {
  const { businessId } = useAuth();
  const [periodDays, setPeriodDays] = useState(90);
  const [sortDesc, setSortDesc] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useQuery<CostResponse>({
    queryKey: ["cost-intelligence", businessId, periodDays],
    queryFn: async () => {
      if (!businessId) throw new Error("No business ID");
      const { data, error } = await supabaseExternal.functions.invoke(
        "cost-intelligence",
        { body: { business_id: businessId, org_id: businessId, period_days: periodDays } },
      );
      if (error) throw error;
      return data as CostResponse;
    },
    enabled: !!businessId,
    refetchInterval: 60_000,
  });

  const isEmpty = useMemo(() => {
    if (!data) return false;
    const m = data.cost_metrics || {};
    return num(m.total_spend) === 0 && num(m.invoice_count) === 0;
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const m = data.cost_metrics || {};
    const summary = [
      { metric: "Total Spend", value: num(m.total_spend) },
      { metric: "Outstanding", value: num(m.total_outstanding) },
      { metric: "MoM Change %", value: num(m.mom_change_percent) },
      { metric: "Concentration Risk %", value: num(m.concentration_risk) },
      { metric: "Avg Monthly Spend", value: num(m.avg_monthly_spend) },
      { metric: "Vendor Count", value: num(m.vendor_count) },
      { metric: "Invoice Count", value: num(m.invoice_count) },
    ];
    const vendors = (data.top_vendors || []).map((v) => ({
      vendor: v.vendor,
      total_spend: v.total_spend,
      outstanding: v.outstanding,
      invoice_count: v.invoice_count,
      percentage: v.percentage?.toFixed(2),
    }));
    exportToCsv([...summary, {}, ...vendors as any], "cost-intelligence");
  };

  const handleRefresh = async () => {
    await refetch();
    toast.success("Cost data refreshed");
  };

  return (
    <DashboardLayout>
      <FynPage>
        <div className="flex items-start justify-between gap-fyn-md flex-wrap">
          <FynPageTitle sub="Spend, vendor concentration, anomalies and savings opportunities">
            Cost Intelligence
          </FynPageTitle>
          <div className="flex items-center gap-fyn-sm flex-wrap">
            <div className="flex items-center gap-1 rounded-md border border-fyn-ink/15 bg-fyn-beige p-0.5" role="group" aria-label="Period selector">
              {PERIOD_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriodDays(d)}
                  className={`px-fyn-sm py-1 text-fyn-small rounded transition ${
                    periodDays === d ? "bg-fyn-ink text-fyn-beige" : "text-fyn-ink-60 hover:text-fyn-ink"
                  }`}
                  aria-pressed={periodDays === d}
                >
                  {d}d
                </button>
              ))}
            </div>
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
                <h3 className="font-serif text-fyn-h3 text-fyn-ink mb-fyn-xs">Couldn't load cost data</h3>
                <p className="text-fyn-body text-fyn-ink-60 mb-fyn-md">
                  {(error as Error).message || "The cost engine is unreachable right now."}
                </p>
                <FynButton onClick={handleRefresh}>Try again</FynButton>
              </div>
            </div>
          </FynCard>
        )}

        {!isLoading && !error && data && isEmpty && (
          <FynEmpty
            icon={<TrendingDown className="h-7 w-7" />}
            title="No cost data yet"
            description="Upload vendor payments or connect your accounting software to see spend analytics, vendor concentration and savings opportunities."
            action={
              <Link to="/dashboard/data-import">
                <FynButton>Upload data</FynButton>
              </Link>
            }
          />
        )}

        {!isLoading && !error && data && !isEmpty && (
          <CostContent data={data} sortDesc={sortDesc} setSortDesc={setSortDesc} />
        )}
      </FynPage>
    </DashboardLayout>
  );
}

function CostContent({
  data, sortDesc, setSortDesc,
}: { data: CostResponse; sortDesc: boolean; setSortDesc: (v: boolean) => void }) {
  const navigate = useNavigate();
  const m = data.cost_metrics || {};
  const totalSpend = num(m.total_spend);
  const totalOutstanding = num(m.total_outstanding);
  const mom = num(m.mom_change_percent);
  const concentration = num(m.concentration_risk);

  const outstandingTone = totalSpend > 0 && totalOutstanding > totalSpend * 0.5 ? "danger" : "neutral";
  const momTone = mom < 0 ? "success" : mom > 20 ? "danger" : "warning";
  const momLabel = mom < 0 ? "Costs down" : mom > 20 ? "Spike" : "Stable";
  const concTone = concentration < 30 ? "success" : concentration <= 50 ? "warning" : "danger";
  const concLabel = concentration < 30 ? "Healthy" : concentration <= 50 ? "Moderate" : "High Risk";
  const concBar = concentration < 30 ? "bg-[#16A34A]" : concentration <= 50 ? "bg-amber-500" : "bg-fyn-red";

  const trend = (data.trend || []).map((t) => ({ month: t.month, spend: num(t.spend) }));
  const trendAvg = num(data.trend_average);

  const topVendors = (data.top_vendors || []).slice(0, 10);
  const categories = (data.category_breakdown || []).slice(0, 10);

  const vendorTable = [...(data.top_vendors || [])].sort((a, b) =>
    sortDesc ? num(b.total_spend) - num(a.total_spend) : num(a.total_spend) - num(b.total_spend)
  );

  return (
    <>
      {/* Top KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-fyn-md">
        <Kpi
          icon={<Wallet className="h-5 w-5" />}
          label="Total Spend"
          value={formatINR(totalSpend)}
          footer={`Last ${num(m.period_days) || 90} days`}
        />
        <Kpi
          icon={<TrendingDown className="h-5 w-5" />}
          label="Outstanding Payables"
          value={formatINR(totalOutstanding)}
          badge={outstandingTone === "danger" ? <FynBadge tone="danger">High</FynBadge> : undefined}
          footer={totalSpend > 0 ? `${((totalOutstanding / totalSpend) * 100).toFixed(0)}% of spend` : undefined}
        />
        <Kpi
          icon={mom < 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
          label="MoM Change"
          value={`${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`}
          badge={<FynBadge tone={momTone}>{momLabel}</FynBadge>}
        />
        <Kpi
          icon={<Users className="h-5 w-5" />}
          label="Vendor Concentration"
          value={`${concentration.toFixed(1)}%`}
          badge={<FynBadge tone={concTone}>{concLabel}</FynBadge>}
          footer="Top 3 vendors"
        />
      </div>

      {/* Trend */}
      {trend.length > 0 && (
        <div>
          <FynSectionTitle>Spend Trend (Last 6 Months)</FynSectionTitle>
          <FynCard>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" />
                  <XAxis dataKey="month" tick={{ fill: "#171208", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
                  <Tooltip
                    contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
                    formatter={(v: number) => [
                      `${formatINR(v)}${trendAvg > 0 ? ` (${(((v - trendAvg) / trendAvg) * 100).toFixed(0)}% vs avg)` : ""}`,
                      "Spend",
                    ]}
                  />
                  {trendAvg > 0 && (
                    <ReferenceLine y={trendAvg} stroke="#8B6914" strokeDasharray="4 4" label={{ value: `Avg ${formatINR(trendAvg)}`, fill: "#8B6914", fontSize: 11, position: "right" }} />
                  )}
                  <Line type="monotone" dataKey="spend" stroke="#C41E1E" strokeWidth={2.5} dot={{ r: 4, fill: "#C41E1E" }} name="Spend" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </FynCard>
        </div>
      )}

      {/* Vendor + Category breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-md">
        {topVendors.length > 0 && (
          <FynCard>
            <FynCardTitle>Spend by Vendor (Top 10)</FynCardTitle>
            <CategoryChart
              data={topVendors.map((v) => ({ category: v.vendor, amount: v.total_spend, percentage: v.percentage }))}
              color="#C41E1E"
              tooltipExtra={(p: any) => {
                const v = topVendors.find((x) => x.vendor === p.payload.category);
                return v ? `Outstanding: ${formatINR(v.outstanding)} • ${v.invoice_count} invoices` : "";
              }}
            />
          </FynCard>
        )}
        {categories.length > 0 && (
          <FynCard>
            <FynCardTitle>Spend by Category</FynCardTitle>
            <CategoryChart
              data={categories}
              color="#8B6914"
            />
          </FynCard>
        )}
      </div>

      {/* Concentration Risk Widget */}
      <div>
        <FynSectionTitle>Vendor Dependency Risk</FynSectionTitle>
        <FynCard>
          <div className="flex items-center justify-between mb-fyn-sm flex-wrap gap-fyn-sm">
            <div>
              <FynLabel>Top 3 vendors represent</FynLabel>
              <p className="font-mono text-fyn-metric text-fyn-ink mt-fyn-xs">{concentration.toFixed(1)}%</p>
              <p className="text-fyn-small text-fyn-ink-60 mt-fyn-xs">of total spend</p>
            </div>
            <FynBadge tone={concTone}>{concLabel}</FynBadge>
          </div>
          <div className="w-full h-3 rounded-full bg-fyn-ink-10 overflow-hidden" role="progressbar" aria-valuenow={concentration} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${concBar} transition-all`} style={{ width: `${Math.min(100, concentration)}%` }} />
          </div>
          <div className="flex justify-between text-fyn-small text-fyn-ink-60 mt-fyn-xs">
            <span>0% diversified</span>
            <span>30%</span>
            <span>50%</span>
            <span>100% concentrated</span>
          </div>
        </FynCard>
      </div>

      {/* Anomalies */}
      {data.anomalies && data.anomalies.length > 0 && (
        <div>
          <FynSectionTitle>Anomalies Detected</FynSectionTitle>
          <div className="space-y-fyn-sm">
            {data.anomalies.map((a, i) => {
              const tone = a.severity === "warning" ? "warning" : "neutral";
              const Icon = a.severity === "warning" ? AlertTriangle : Info;
              const dev = a.value && a.threshold ? ((a.value / a.threshold - 1) * 100) : 0;
              return (
                <FynCard key={i}>
                  <div className="flex items-start gap-fyn-md">
                    <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${a.severity === "warning" ? "text-[#8B5A00]" : "text-[#475569]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-fyn-sm mb-fyn-xs flex-wrap">
                        <FynBadge tone={tone as any}>{a.type}</FynBadge>
                        <FynBadge tone={a.severity === "warning" ? "warning" : "neutral"}>{a.severity}</FynBadge>
                      </div>
                      <p className="text-fyn-body text-fyn-ink mb-fyn-xs">{a.message}</p>
                      {a.value != null && a.threshold != null && (
                        <>
                          <div className="flex justify-between text-fyn-small text-fyn-ink-60 mb-1">
                            <span>Threshold: {formatINR(a.threshold)}</span>
                            <span className="font-mono">{formatINR(a.value)} ({dev >= 0 ? "+" : ""}{dev.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-fyn-ink-10 overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (a.value / Math.max(a.threshold, 1)) * 50)}%` }} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </FynCard>
              );
            })}
          </div>
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

      {/* Suggestions */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div>
          <FynSectionTitle>Cost Optimization Suggestions</FynSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-fyn-md">
            {data.suggestions.map((s, i) => {
              const priorityTone = s.priority === "high" ? "danger" : s.priority === "medium" ? "warning" : "neutral";
              const TypeIcon = s.type === "diversification" ? ShieldAlert : s.type === "consolidation" ? Layers : BarChart3;
              return (
                <FynCard key={i}>
                  <div className="flex items-start gap-fyn-md">
                    <div className="text-fyn-gold mt-1"><TypeIcon className="h-5 w-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-fyn-sm mb-fyn-xs flex-wrap">
                        <FynBadge tone={priorityTone as any}>{s.priority}</FynBadge>
                        <span className="text-fyn-small text-fyn-ink-60">{s.type.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-fyn-body text-fyn-ink mb-fyn-sm">{s.message}</p>
                      {s.potential_savings != null && s.potential_savings > 0 && (
                        <div className="flex items-center gap-fyn-sm mb-fyn-sm">
                          <Lightbulb className="h-4 w-4 text-[#16A34A]" />
                          <span className="text-fyn-small text-fyn-ink-60">Potential savings:</span>
                          <span className="font-mono text-fyn-body text-[#16A34A] font-semibold">~{formatINR(s.potential_savings)}</span>
                        </div>
                      )}
                      <FynButton variant="secondary" onClick={() => navigate("/dashboard/vendors")}>Review</FynButton>
                    </div>
                  </div>
                </FynCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Vendor Details Table */}
      {vendorTable.length > 0 && (
        <div>
          <FynSectionTitle>Vendor Details</FynSectionTitle>
          <FynCard className="p-0 overflow-hidden">
            <FynTable>
              <thead>
                <FynTR>
                  <FynTH>Vendor</FynTH>
                  <FynTH align="right">
                    <button type="button" onClick={() => setSortDesc(!sortDesc)} className="hover:text-fyn-ink" aria-label="Sort by spend">
                      Total Spend {sortDesc ? "↓" : "↑"}
                    </button>
                  </FynTH>
                  <FynTH align="right">Outstanding</FynTH>
                  <FynTH align="right">Invoices</FynTH>
                  <FynTH align="right">% of Total</FynTH>
                </FynTR>
              </thead>
              <tbody>
                {vendorTable.map((v, i) => {
                  const pct = num(v.percentage);
                  const isConc = pct > 20;
                  return (
                    <FynTR
                      key={i}
                      className={`cursor-pointer hover:bg-fyn-beige ${isConc ? "bg-fyn-red/5" : ""}`}
                      onClick={() => navigate(`/dashboard/vendors?vendor=${encodeURIComponent(v.vendor)}`)}
                    >
                      <FynTD>
                        {v.vendor}
                        {isConc && <FynBadge tone="danger" className="ml-fyn-sm">Concentration</FynBadge>}
                      </FynTD>
                      <FynTD align="right" mono>{formatINR(num(v.total_spend))}</FynTD>
                      <FynTD align="right" mono>{formatINR(num(v.outstanding))}</FynTD>
                      <FynTD align="right" mono>{num(v.invoice_count)}</FynTD>
                      <FynTD align="right" mono>{pct.toFixed(1)}%</FynTD>
                    </FynTR>
                  );
                })}
              </tbody>
            </FynTable>
          </FynCard>
        </div>
      )}

      {/* Additional metrics */}
      <div>
        <FynSectionTitle>Additional Metrics</FynSectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-fyn-md">
          <FynCard><MiniMetric label="Avg Monthly Spend" value={formatINR(num(m.avg_monthly_spend))} /></FynCard>
          <FynCard><MiniMetric label="Active Vendors" value={num(m.vendor_count).toLocaleString("en-IN")} /></FynCard>
          <FynCard><MiniMetric label="Period" value={`${num(m.period_days) || 90} days`} /></FynCard>
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
      <p className={`font-mono text-[22px] font-semibold mt-fyn-xs ${positive ? "text-[#16A34A]" : negative ? "text-fyn-red" : "text-fyn-ink"}`}>
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

function CategoryChart({
  data, color, tooltipExtra,
}: {
  data: Array<{ category: string; amount: number; percentage?: number }>;
  color: string;
  tooltipExtra?: (p: any) => string;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.08)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#171208", fontSize: 12 }} tickFormatter={(v) => formatINR(v)} />
          <YAxis dataKey="category" type="category" tick={{ fill: "#171208", fontSize: 12 }} width={130} />
          <Tooltip
            contentStyle={{ background: "#FBF7EC", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 8 }}
            formatter={(v: number, _n, p: any) => {
              const pct = p.payload.percentage != null ? ` (${num(p.payload.percentage).toFixed(1)}%)` : "";
              const extra = tooltipExtra ? tooltipExtra(p) : "";
              return [`${formatINR(v)}${pct}${extra ? `, ${extra}` : ""}`, "Spend"];
            }}
          />
          <Bar dataKey="amount" fill={color} radius={[0, 4, 4, 0]}
            label={{ position: "right", formatter: (v: number) => {
              const total = data.reduce((s, d) => s + d.amount, 0);
              return total > 0 ? `${((v / total) * 100).toFixed(0)}%` : "";
            }, fill: "#171208", fontSize: 11 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
