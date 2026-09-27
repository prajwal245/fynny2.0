import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExternal } from "@/integrations/supabase/external";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR } from "@/lib/indian-format";
import { exportToCsv } from "@/utils/csvExport";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend,
} from "recharts";
import {
  RefreshCw, Download, AlertTriangle, AlertCircle, Info, TrendingUp,
  Sparkles, ArrowRight,
} from "lucide-react";

/* ────────────── Tax Intelligence (edge function) types ────────────── */
interface TaxIntelligenceResponse {
  compliance: {
    overall_compliance_rate: number;
    gst_compliance_rate: number;
    tds_compliance_rate: number;
    health: { label: string; color: string };
  };
  gst_summary: { total_filings: number; filed: number; on_time: number; overdue: number };
  tds_summary: { total_filings: number; filed: number; on_time: number; overdue: number };
  tax_liability: {
    current_liability: number;
    output_tax: number;
    input_tax: number;
    itc_utilization_percent: number;
    period: string | null;
  };
  trend: Array<{ month: string; output_tax: number; input_tax: number; net_liability: number }>;
  forecast: Array<{ month: string; estimated_liability: number; confidence: string }>;
  upcoming_deadlines: Array<{
    type: "GST" | "TDS"; filing_type: string; period: string; due_date: string; days_remaining: number;
  }>;
  alerts: Array<{ severity: "critical" | "warning" | "info"; title: string; message: string; action?: string }>;
  suggestions: Array<{ priority: "high" | "medium" | "low"; type: string; message: string; potential_savings?: number }>;
}

/* ────────────── Types ────────────── */

interface GSTFiling {
  id: string;
  business_id: string;
  return_type: string;
  filing_period: string;
  due_date: string;
  filed_date: string | null;
  status: string;
  taxable_sales: number | null;
  output_tax: number | null;
  input_tax_credit: number | null;
  tax_payable: number | null;
  arn_number: string | null;
  acknowledgement_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type TdsFiling = {
  id: string;
  business_id: string;
  quarter: string;
  form_type: string;
  due_date: string;
  filed_date: string | null;
  status: string;
  total_tds_deducted: number | null;
  total_tds_deposited: number | null;
  acknowledgement_number: string | null;
  challan_number: string | null;
  notes: string | null;
};

type Bucket = "on-time" | "late" | "overdue" | "pending" | "unknown";
const validBuckets = ["on-time", "late", "overdue", "pending", "unknown"] as const;
const bucketMeta: Record<Bucket, { label: string; color: string }> = {
  "on-time": { label: "On time", color: "#1A6B3C" },
  late: { label: "Filed late", color: "#8B5A00" },
  overdue: { label: "Overdue", color: "#C41E1E" },
  pending: { label: "Pending", color: "#171208" },
  unknown: { label: "Unknown", color: "#475569" },
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/* ────────────── Page ────────────── */

const GSTPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialTab =
    tabParam === "tds" || tabParam === "overview" ? tabParam : "gst";
  const [tab, setTab] = useState<string>(initialTab);

  const handleTabChange = (next: string) => {
    setTab(next);
    const sp = new URLSearchParams(searchParams);
    if (next === "gst") sp.delete("tab");
    else sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  /* shared URL filters (kept for back-compat with CompliancePage links) */
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const isValidDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromFilter = isValidDate(fromParam) ? (fromParam as string) : null;
  const toFilter = isValidDate(toParam) ? (toParam as string) : null;
  const hasDateFilter = !!(fromFilter || toFilter);

  const bucketParam = searchParams.get("bucket");
  const bucketFilter: Bucket | null =
    bucketParam && (validBuckets as readonly string[]).includes(bucketParam)
      ? (bucketParam as Bucket)
      : null;

  const clearDateFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("from");
    next.delete("to");
    setSearchParams(next, { replace: true });
  };
  const clearBucketFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("bucket");
    setSearchParams(next, { replace: true });
  };

  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusiness = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_id) setBusinessId(data.business_id);
    };
    fetchBusiness();
  }, []);

  /* ───── Queries ───── */

  const { data: gstFilings, isLoading: gstLoading } = useQuery({
    queryKey: ["gst-filings", businessId],
    queryFn: async (): Promise<GSTFiling[]> => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("gst_filings" as never)
        .select("*")
        .eq("business_id", businessId)
        .order("due_date", { ascending: false })
        .limit(24);
      return ((data as unknown) as GSTFiling[]) || [];
    },
    enabled: !!businessId,
  });

  const { data: taxData, isLoading: taxLoading, error: taxError, refetch: refetchTax, isFetching: taxFetching } = useQuery<TaxIntelligenceResponse>({
    queryKey: ["tax-intelligence", businessId],
    queryFn: async () => {
      if (!businessId) throw new Error("No business ID");
      const { data, error } = await supabaseExternal.functions.invoke("tax-intelligence", {
        body: { business_id: businessId, org_id: businessId },
      });
      if (error) throw error;
      return data as TaxIntelligenceResponse;
    },
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const { data: tdsFilings, isLoading: tdsLoading } = useQuery({
    queryKey: ["tds-filings", businessId],
    queryFn: async (): Promise<TdsFiling[]> => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("tds_filings" as never)
        .select("*")
        .eq("business_id", businessId)
        .order("due_date", { ascending: false })
        .limit(24);
      return ((data as unknown) as TdsFiling[]) || [];
    },
    enabled: !!businessId,
  });

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const inRange = (d: string | null | undefined) => {
    if (!d) return false;
    if (fromFilter && d < fromFilter) return false;
    if (toFilter && d > toFilter) return false;
    return true;
  };

  const visibleGst = hasDateFilter
    ? (gstFilings || []).filter((f) => inRange(f.due_date))
    : gstFilings || [];
  const visibleTds = hasDateFilter
    ? (tdsFilings || []).filter((f) => inRange(f.due_date))
    : tdsFilings || [];

  /* ───── GST stats ───── */
  const gstUpcoming = visibleGst.filter((f) => new Date(f.due_date) >= now && f.status === "pending");
  const gstOverdue = visibleGst.filter((f) => new Date(f.due_date) < now && f.status === "pending");
  const totalTaxPayable = visibleGst.reduce((s, f) => s + Number(f.tax_payable || 0), 0);
  const totalInputCredit = visibleGst.reduce((s, f) => s + Number(f.input_tax_credit || 0), 0);

  /* ───── TDS stats ───── */
  const tdsUpcoming = visibleTds.filter((f) => new Date(f.due_date) >= now && f.status === "pending");
  const tdsOverdue = visibleTds.filter((f) => new Date(f.due_date) < now && f.status === "pending");
  const totalDeducted = visibleTds.reduce((s, f) => s + Number(f.total_tds_deducted || 0), 0);
  const totalDeposited = visibleTds.reduce((s, f) => s + Number(f.total_tds_deposited || 0), 0);

  /* ───── Bucket logic (shared) ───── */
  const classifyGst = (f: GSTFiling): Bucket => {
    if (!f.due_date) return "unknown";
    const filed = f.status === "filed";
    if (filed && f.filed_date && f.filed_date <= f.due_date) return "on-time";
    if (filed) return "late";
    if (f.due_date < todayStr) return "overdue";
    return "pending";
  };
  const classifyTds = (f: TdsFiling): Bucket => {
    if (!f.due_date) return "unknown";
    const filed = f.status === "filed";
    if (filed && f.filed_date && f.filed_date <= f.due_date) return "on-time";
    if (filed) return "late";
    if (f.due_date < todayStr) return "overdue";
    return "pending";
  };

  const matchesGstBucket = (f: GSTFiling) => !bucketFilter || classifyGst(f) === bucketFilter;
  const matchesTdsBucket = (f: TdsFiling) => !bucketFilter || classifyTds(f) === bucketFilter;

  /* ───── Overview combined stats ───── */
  const overview = useMemo(() => {
    const all = [
      ...visibleGst.map((f) => ({
        bucket: classifyGst(f),
        due: f.due_date,
        type: "GST" as const,
        label: `${f.return_type} · ${f.filing_period}`,
        filed: f.status === "filed",
        filedDate: f.filed_date,
      })),
      ...visibleTds.map((f) => ({
        bucket: classifyTds(f),
        due: f.due_date,
        type: "TDS" as const,
        label: `${f.form_type} · ${f.quarter}`,
        filed: f.status === "filed",
        filedDate: f.filed_date,
      })),
    ];
    const filed = all.filter((r) => r.filed);
    const onTime = filed.filter((r) => r.bucket === "on-time").length;
    const onTimeRate = filed.length ? Math.round((onTime / filed.length) * 100) : null;
    const overdue = all.filter((r) => r.bucket === "overdue").length;
    const upcoming = all
      .filter((r) => r.due >= todayStr && !r.filed)
      .sort((a, b) => a.due.localeCompare(b.due));
    const recent = all
      .filter((r) => r.filed && r.filedDate)
      .sort((a, b) => (b.filedDate || "").localeCompare(a.filedDate || ""))
      .slice(0, 6);
    const next = upcoming[0] || null;

    let health: { label: string; tone: string; color: string } = {
      label: "Healthy",
      tone: "Filings on track",
      color: "#1A6B3C",
    };
    if (overdue > 0) health = { label: "At risk", tone: `${overdue} overdue filing${overdue > 1 ? "s" : ""}`, color: "#C41E1E" };
    else if (onTimeRate !== null && onTimeRate < 80) health = { label: "Watch", tone: `${100 - onTimeRate}% filed late`, color: "#8B5A00" };

    return { all, onTimeRate, overdue, upcoming, recent, next, health, filedCount: filed.length };
  }, [visibleGst, visibleTds, todayStr]);

  /* ───── Empty / loading flags ───── */
  const gstIsEmpty = !gstLoading && (!gstFilings || gstFilings.length === 0);
  const tdsIsEmpty = !tdsLoading && (!tdsFilings || tdsFilings.length === 0);
  const allEmpty = gstIsEmpty && tdsIsEmpty;

  /* ────────────── Render helpers ────────────── */

  const bucketBanner = bucketFilter && (
    <div
      className="flex flex-wrap items-center justify-between gap-2 mb-4 px-3 py-2 border rounded-md text-xs"
      style={{ background: `${bucketMeta[bucketFilter].color}0F`, borderColor: `${bucketMeta[bucketFilter].color}40` }}
    >
      <span className="text-fyn-ink/80 inline-flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: bucketMeta[bucketFilter].color }} aria-hidden />
        Highlighting <span className="font-medium" style={{ color: bucketMeta[bucketFilter].color }}>{bucketMeta[bucketFilter].label}</span> rows
      </span>
      <button onClick={clearBucketFilter} className="text-fyn-ink/70 hover:text-fyn-ink underline underline-offset-2">
        Clear bucket ✕
      </button>
    </div>
  );

  const dateBanner = hasDateFilter && (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-3 py-2 bg-fyn-beige-card border border-fyn-ink-10 rounded-md text-xs">
      <span className="text-fyn-ink/70">
        Showing filings due
        {fromFilter && <> from <span className="text-fyn-ink font-medium">{fmtDate(fromFilter)}</span></>}
        {toFilter && <> to <span className="text-fyn-ink font-medium">{fmtDate(toFilter)}</span></>}.
      </span>
      <button onClick={clearDateFilter} className="text-fyn-ink/70 hover:text-fyn-ink underline underline-offset-2">
        Clear date filter ✕
      </button>
    </div>
  );

  const Metric = ({ label, value, sub, danger }: { label: string; value: React.ReactNode; sub?: string; danger?: boolean }) => (
    <div className="bg-fyn-ink rounded-lg p-5">
      <p className="text-white/40 text-[13px] fyn-label">{label}</p>
      <p className={`text-[28px] font-bold mt-1 font-sans ${danger ? "text-[#C41E1E]" : "text-white"}`}>{value}</p>
      {sub && <p className="text-white/40 text-[11px] mt-1">{sub}</p>}
    </div>
  );

  const StatusBadge = ({ status, due }: { status: string; due: string }) => {
    const isOverdue = new Date(due) < now && status === "pending";
    const className =
      status === "filed"
        ? "bg-[#1A6B3C]/10 text-[#1A6B3C]"
        : isOverdue
        ? "bg-[#C41E1E]/10 text-[#C41E1E]"
        : "bg-muted text-muted-foreground/70";
    const label = status === "filed" ? "Filed" : isOverdue ? "Late" : "Pending";
    return <span className={`text-[11px] px-2 py-0.5 rounded ${className}`}>{label}</span>;
  };

  /* ────────────── GST tab ────────────── */
  const renderGstTab = () => {
    if (gstLoading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />)}
        </div>
      );
    }
    if (gstIsEmpty) {
      return (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-12 text-center">
          <h3 className="text-fyn-ink text-xl font-serif mb-2">No GST Data</h3>
          <p className="text-fyn-ink/60 text-sm mb-6">
            GST filings will appear here once you connect your accounting system or add them manually
          </p>
          <button
            onClick={() => navigate("/dashboard/settings/integrations")}
            className="bg-[#C41E1E] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Connect Accounting →
          </button>
        </div>
      );
    }
    return (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric label="UPCOMING FILINGS" value={gstUpcoming.length} sub="Pending GST returns" />
          <Metric label="OVERDUE FILINGS" value={gstOverdue.length} sub={gstOverdue.length > 0 ? "Requires attention" : "All on track"} danger={gstOverdue.length > 0} />
          <Metric label="TAX PAYABLE (YTD)" value={formatINR(totalTaxPayable)} sub="Across all returns" />
          <Metric label="INPUT TAX CREDIT" value={formatINR(totalInputCredit)} sub="Total ITC claimed" />
        </div>

        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">GST Returns</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-fyn-ink/40 text-xs fyn-label border-b border-fyn-ink-10">
                  <th className="text-left py-2">Return Type</th>
                  <th className="text-left py-2">Period</th>
                  <th className="text-left py-2">Due Date</th>
                  <th className="text-right py-2">Taxable Sales</th>
                  <th className="text-right py-2">Tax Payable</th>
                  <th className="text-right py-2">ITC</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-left py-2">ARN</th>
                </tr>
              </thead>
              <tbody>
                {visibleGst.map((f, i) => {
                  const isMatch = matchesGstBucket(f);
                  const dim = !!bucketFilter && !isMatch;
                  const baseBg = i % 2 === 0 ? "bg-[#FAF7F0]" : "bg-card";
                  return (
                    <tr
                      key={f.id}
                      className={`border-b border-fyn-ink-10 last:border-0 ${dim ? "opacity-40" : ""} ${baseBg}`}
                      style={bucketFilter && isMatch ? { boxShadow: `inset 3px 0 0 0 ${bucketMeta[bucketFilter].color}` } : undefined}
                    >
                      <td className="py-3 text-fyn-ink font-medium">{f.return_type}</td>
                      <td className="py-3 text-fyn-ink/70">{f.filing_period}</td>
                      <td className="py-3 text-fyn-ink/70 fyn-metric">{fmtDate(f.due_date)}</td>
                      <td className="py-3 text-right fyn-metric">{f.taxable_sales ? formatINR(Number(f.taxable_sales)) : "-"}</td>
                      <td className="py-3 text-right fyn-metric">{f.tax_payable ? formatINR(Number(f.tax_payable)) : "-"}</td>
                      <td className="py-3 text-right fyn-metric">{f.input_tax_credit ? formatINR(Number(f.input_tax_credit)) : "-"}</td>
                      <td className="py-3 text-center"><StatusBadge status={f.status} due={f.due_date} /></td>
                      <td className="py-3 text-fyn-ink/70 fyn-metric">{f.arn_number || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  /* ────────────── TDS tab ────────────── */
  const renderTdsTab = () => {
    if (tdsLoading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />)}
        </div>
      );
    }
    if (tdsIsEmpty) {
      return (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-12 text-center">
          <h3 className="text-fyn-ink text-xl font-serif mb-2">No TDS Data</h3>
          <p className="text-fyn-ink/60 text-sm mb-6">
            TDS filings will appear here once you connect your accounting system or TRACES.
          </p>
          <button
            onClick={() => navigate("/dashboard/settings/integrations")}
            className="bg-[#C41E1E] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Connect Accounting →
          </button>
        </div>
      );
    }
    return (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric label="UPCOMING FILINGS" value={tdsUpcoming.length} sub="Pending TDS returns" />
          <Metric label="OVERDUE FILINGS" value={tdsOverdue.length} sub={tdsOverdue.length > 0 ? "Requires attention" : "All on track"} danger={tdsOverdue.length > 0} />
          <Metric label="TDS DEDUCTED" value={formatINR(totalDeducted)} sub="YTD" />
          <Metric label="TDS DEPOSITED" value={formatINR(totalDeposited)} sub="YTD" />
        </div>

        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">TDS Returns</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-fyn-ink/40 text-xs fyn-label border-b border-fyn-ink-10">
                  <th className="text-left py-2">Quarter</th>
                  <th className="text-left py-2">Form Type</th>
                  <th className="text-left py-2">Due Date</th>
                  <th className="text-right py-2">TDS Deducted</th>
                  <th className="text-right py-2">TDS Deposited</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-left py-2">ACK Number</th>
                </tr>
              </thead>
              <tbody>
                {visibleTds.map((f, i) => {
                  const isMatch = matchesTdsBucket(f);
                  const dim = !!bucketFilter && !isMatch;
                  const baseBg = i % 2 === 0 ? "bg-[#FAF7F0]" : "bg-card";
                  return (
                    <tr
                      key={f.id}
                      className={`border-b border-fyn-ink-10 last:border-0 ${dim ? "opacity-40" : ""} ${baseBg}`}
                      style={bucketFilter && isMatch ? { boxShadow: `inset 3px 0 0 0 ${bucketMeta[bucketFilter].color}` } : undefined}
                    >
                      <td className="py-3 text-fyn-ink font-medium">{f.quarter}</td>
                      <td className="py-3 text-fyn-ink/70">{f.form_type}</td>
                      <td className="py-3 text-fyn-ink/70 fyn-metric">{fmtDate(f.due_date)}</td>
                      <td className="py-3 text-right fyn-metric">{formatINR(Number(f.total_tds_deducted || 0))}</td>
                      <td className="py-3 text-right fyn-metric">{formatINR(Number(f.total_tds_deposited || 0))}</td>
                      <td className="py-3 text-center"><StatusBadge status={f.status} due={f.due_date} /></td>
                      <td className="py-3 text-fyn-ink/70 fyn-metric">{f.acknowledgement_number || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  /* ────────────── Overview tab ────────────── */
  const handleExportTax = () => {
    if (!taxData) return;
    const rows: any[] = [
      { metric: "Overall Compliance %", value: taxData.compliance.overall_compliance_rate.toFixed(1) },
      { metric: "GST Compliance %", value: taxData.compliance.gst_compliance_rate.toFixed(1) },
      { metric: "TDS Compliance %", value: taxData.compliance.tds_compliance_rate.toFixed(1) },
      { metric: "Current Liability", value: taxData.tax_liability.current_liability },
      { metric: "Output Tax", value: taxData.tax_liability.output_tax },
      { metric: "Input Tax (ITC)", value: taxData.tax_liability.input_tax },
      { metric: "ITC Utilization %", value: taxData.tax_liability.itc_utilization_percent.toFixed(1) },
    ];
    exportToCsv(rows, "tax-intelligence");
  };

  const renderOverviewTab = () => {
    if (gstLoading || tdsLoading || (taxLoading && !taxData)) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />)}
          </div>
          <div className="h-64 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-48 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />
            <div className="h-48 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />
          </div>
        </div>
      );
    }
    if (taxError) {
      return (
        <div className="bg-fyn-beige-dark border border-[#C41E1E]/30 rounded-lg p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-[#C41E1E] mb-3" />
          <h3 className="text-fyn-ink text-lg font-serif mb-2">Couldn't load tax intelligence</h3>
          <p className="text-fyn-ink/60 text-sm mb-5">{(taxError as Error).message}</p>
          <button onClick={() => refetchTax()} className="bg-fyn-ink text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );
    }
    const isAllZero = taxData
      ? taxData.tax_liability.current_liability === 0 &&
        taxData.tax_liability.output_tax === 0 &&
        taxData.gst_summary.total_filings === 0 &&
        taxData.tds_summary.total_filings === 0
      : allEmpty;

    if (isAllZero) {
      return (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-12 text-center">
          <TrendingUp className="w-12 h-12 mx-auto text-fyn-ink/40 mb-3" />
          <h3 className="text-fyn-ink text-xl font-serif mb-2">No tax data yet</h3>
          <p className="text-fyn-ink/60 text-sm mb-6">Upload filings or connect your accounting system to see live compliance and forecasts.</p>
          <button
            onClick={() => navigate("/dashboard/data-import")}
            className="bg-[#C41E1E] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Upload Data →
          </button>
        </div>
      );
    }

    if (!taxData) return null;

    const itcPct = taxData.tax_liability.itc_utilization_percent;
    const itcBadgeColor = itcPct > 70 ? "#1A6B3C" : itcPct >= 50 ? "#8B5A00" : "#C41E1E";
    const itcBadgeLabel = itcPct > 70 ? "Healthy" : itcPct >= 50 ? "Watch" : "Low";

    const sevIcon = (s: string) =>
      s === "critical" ? <AlertTriangle className="w-4 h-4 text-[#C41E1E]" /> :
      s === "warning" ? <AlertCircle className="w-4 h-4 text-[#8B5A00]" /> :
      <Info className="w-4 h-4 text-fyn-ink/60" />;
    const sevBg = (s: string) =>
      s === "critical" ? "bg-[#C41E1E]/5 border-[#C41E1E]/30" :
      s === "warning" ? "bg-[#8B5A00]/5 border-[#8B5A00]/30" :
      "bg-fyn-ink/5 border-fyn-ink-10";

    const priorityBadge = (p: string) => {
      const c = p === "high" ? "#C41E1E" : p === "medium" ? "#8B5A00" : "#1A6B3C";
      return <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium" style={{ background: `${c}15`, color: c }}>{p}</span>;
    };

    return (
      <>
        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p className="text-fyn-ink/60 text-xs">
            Live compliance · refreshed every minute{taxFetching ? " · updating…" : ""}
          </p>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={() => refetchTax()} disabled={taxFetching} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-fyn-ink-10 text-fyn-ink hover:bg-fyn-beige-card disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${taxFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={handleExportTax} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-fyn-ink-10 text-fyn-ink hover:bg-fyn-beige-card">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-fyn-ink-10 text-fyn-ink hover:bg-fyn-beige-card">
              Print
            </button>
          </div>
        </div>

        {/* Combined health metrics (existing) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric
            label="ON-TIME FILING %"
            value={`${taxData.compliance.overall_compliance_rate.toFixed(0)}%`}
            sub={`${taxData.gst_summary.filed + taxData.tds_summary.filed} filings completed`}
          />
          <Metric
            label="OVERDUE (TOTAL)"
            value={taxData.gst_summary.overdue + taxData.tds_summary.overdue}
            sub={taxData.gst_summary.overdue + taxData.tds_summary.overdue > 0 ? "Requires attention" : "All on track"}
            danger={taxData.gst_summary.overdue + taxData.tds_summary.overdue > 0}
          />
          <Metric
            label="NEXT DEADLINE"
            value={taxData.upcoming_deadlines[0] ? fmtDate(taxData.upcoming_deadlines[0].due_date) : "-"}
            sub={taxData.upcoming_deadlines[0] ? `${taxData.upcoming_deadlines[0].type} · ${taxData.upcoming_deadlines[0].filing_type}` : "No upcoming filings"}
          />
          <Metric
            label="TAX HEALTH"
            value={<span style={{ color: taxData.compliance.health.color }}>{taxData.compliance.health.label}</span>}
          />
        </div>

        {/* Tax Liability section */}
        <h3 className="text-fyn-ink font-serif text-lg mb-3">Tax Liability {taxData.tax_liability.period && <span className="text-fyn-ink/50 text-sm">· {taxData.tax_liability.period}</span>}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric label="CURRENT LIABILITY" value={formatINR(taxData.tax_liability.current_liability)} sub="Net payable" />
          <Metric label="OUTPUT TAX" value={formatINR(taxData.tax_liability.output_tax)} sub="GST on sales" />
          <Metric label="INPUT TAX (ITC)" value={formatINR(taxData.tax_liability.input_tax)} sub="Credit available" />
          <div className="bg-fyn-ink rounded-lg p-5">
            <p className="text-white/40 text-[13px] fyn-label">ITC UTILIZATION</p>
            <p className="text-[28px] font-bold mt-1 font-sans text-white">{itcPct.toFixed(0)}%</p>
            <span className="inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium mt-1" style={{ background: `${itcBadgeColor}30`, color: itcBadgeColor }}>{itcBadgeLabel}</span>
          </div>
        </div>

        {/* Trend chart */}
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5 mb-6">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">12-Month Tax Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={taxData.trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C41E1E" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#C41E1E" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A6B3C" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#1A6B3C" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#17120815" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#171208" }} />
                <YAxis tick={{ fontSize: 11, fill: "#171208" }} tickFormatter={(v) => formatINR(v)} />
                <RTooltip
                  contentStyle={{ background: "#171208", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  formatter={(v: any, name: string) => [formatINR(Number(v)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="output_tax" stackId="1" stroke="#C41E1E" fill="url(#outputGrad)" name="Output Tax" />
                <Area type="monotone" dataKey="input_tax" stackId="2" stroke="#1A6B3C" fill="url(#inputGrad)" name="Input Tax (ITC)" />
                <Line type="monotone" dataKey="net_liability" stroke="#171208" strokeWidth={2} dot={{ r: 3 }} name="Net Liability" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Forecast */}
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5 mb-6">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">3-Month Liability Forecast</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={taxData.forecast} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17120815" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#171208" }} />
                <YAxis tick={{ fontSize: 11, fill: "#171208" }} tickFormatter={(v) => formatINR(v)} />
                <RTooltip
                  contentStyle={{ background: "#171208", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  formatter={(v: any, _n, p: any) => [`${formatINR(Number(v))} (${p?.payload?.confidence})`, "Estimate"]}
                />
                <Line type="monotone" dataKey="estimated_liability" stroke="#8B6914" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 5, fill: "#8B6914" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {taxData.forecast.map((f) => (
              <span key={f.month} className="text-[11px] px-2 py-0.5 rounded bg-fyn-ink/5 text-fyn-ink/70">
                {f.month}: <span className="fyn-metric text-fyn-ink">{formatINR(f.estimated_liability)}</span> · {f.confidence}
              </span>
            ))}
          </div>
        </div>

        {/* Compliance breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {[
            { label: "GST Compliance", rate: taxData.compliance.gst_compliance_rate, on: taxData.gst_summary.on_time, total: taxData.gst_summary.filed, tab: "gst" },
            { label: "TDS Compliance", rate: taxData.compliance.tds_compliance_rate, on: taxData.tds_summary.on_time, total: taxData.tds_summary.filed, tab: "tds" },
          ].map((c) => {
            const r = Math.round(c.rate);
            const color = r >= 80 ? "#1A6B3C" : r >= 50 ? "#8B5A00" : "#C41E1E";
            const circ = 2 * Math.PI * 36;
            return (
              <button
                key={c.label}
                onClick={() => handleTabChange(c.tab)}
                className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5 text-left hover:border-fyn-ink/30 transition-colors flex items-center gap-5"
              >
                <svg width="92" height="92" viewBox="0 0 92 92">
                  <circle cx="46" cy="46" r="36" stroke="#17120815" strokeWidth="8" fill="none" />
                  <circle cx="46" cy="46" r="36" stroke={color} strokeWidth="8" fill="none"
                    strokeDasharray={`${(circ * r) / 100} ${circ}`} strokeLinecap="round"
                    transform="rotate(-90 46 46)" />
                  <text x="46" y="51" textAnchor="middle" fontSize="18" fontWeight="700" fill="#171208" fontFamily="JetBrains Mono, monospace">{r}%</text>
                </svg>
                <div>
                  <p className="text-fyn-ink font-serif text-lg">{c.label}</p>
                  <p className="text-fyn-ink/60 text-sm fyn-metric">{c.on}/{c.total} on time</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Upcoming deadlines table + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
            <h3 className="text-fyn-ink font-serif text-lg mb-3">Upcoming Deadlines</h3>
            {taxData.upcoming_deadlines.length === 0 ? (
              <p className="text-fyn-ink/60 text-sm">Nothing pending. You're caught up.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-fyn-ink/40 text-[11px] fyn-label border-b border-fyn-ink-10">
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">Filing</th>
                      <th className="text-left py-2">Period</th>
                      <th className="text-left py-2">Due</th>
                      <th className="text-right py-2">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxData.upcoming_deadlines.slice(0, 8).map((d, i) => {
                      const days = d.days_remaining;
                      const tone = days <= 7 ? "#C41E1E" : days <= 15 ? "#8B5A00" : "#1A6B3C";
                      return (
                        <tr key={i} onClick={() => handleTabChange(d.type === "GST" ? "gst" : "tds")}
                          className="border-b border-fyn-ink-10 last:border-0 cursor-pointer hover:bg-fyn-beige-card"
                          style={{ boxShadow: `inset 3px 0 0 0 ${tone}` }}
                        >
                          <td className="py-2 text-fyn-ink font-medium text-xs">{d.type}</td>
                          <td className="py-2 text-fyn-ink/80 text-xs">{d.filing_type}</td>
                          <td className="py-2 text-fyn-ink/70 text-xs">{d.period}</td>
                          <td className="py-2 text-fyn-ink/70 fyn-metric text-xs">{fmtDate(d.due_date)}</td>
                          <td className="py-2 text-right">
                            <span className="text-[11px] px-2 py-0.5 rounded fyn-metric" style={{ background: `${tone}15`, color: tone }}>
                              {days <= 0 ? "Today" : `${days}d`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
            <h3 className="text-fyn-ink font-serif text-lg mb-3">Alerts</h3>
            {taxData.alerts.length === 0 ? (
              <p className="text-fyn-ink/60 text-sm">No active alerts. Everything looks good.</p>
            ) : (
              <ul className="space-y-2">
                {taxData.alerts.map((a, i) => (
                  <li key={i} className={`border rounded-md p-3 ${sevBg(a.severity)}`}>
                    <div className="flex items-start gap-2">
                      {sevIcon(a.severity)}
                      <div className="min-w-0 flex-1">
                        <p className="text-fyn-ink text-sm font-medium">{a.title}</p>
                        <p className="text-fyn-ink/70 text-xs mt-0.5">{a.message}</p>
                        {a.action && <p className="text-fyn-ink/60 text-[11px] mt-1 italic">→ {a.action}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Suggestions */}
        {taxData.suggestions.length > 0 && (
          <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-fyn-gold" />
              <h3 className="text-fyn-ink font-serif text-lg">Tax Optimization Suggestions</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {taxData.suggestions.map((s, i) => (
                <div key={i} className="border border-fyn-ink-10 rounded-md p-4 bg-card flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    {priorityBadge(s.priority)}
                    <span className="text-[10px] uppercase tracking-wider text-fyn-ink/50">{s.type.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-fyn-ink text-sm flex-1">{s.message}</p>
                  {s.potential_savings && s.potential_savings > 0 && (
                    <p className="text-fyn-success text-xs fyn-metric mt-2">Est. savings: {formatINR(s.potential_savings)}</p>
                  )}
                  <button className="mt-3 inline-flex items-center gap-1 text-xs text-fyn-ink hover:underline self-start">
                    Review <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  /* ────────────── Layout ────────────── */

  return (
    <DashboardLayout>
      {/* Breadcrumb + title */}
      <div className="mb-5">
        <p className="text-fyn-ink/50 text-xs mb-1">
          <button onClick={() => navigate("/dashboard/cockpit")} className="hover:text-fyn-ink underline-offset-2 hover:underline">Dashboard</button>
          <span className="mx-2">→</span>
          <span className="text-fyn-ink/70">Tax Intelligence</span>
        </p>
        <h1 className="font-serif text-fyn-ink text-3xl">Tax Intelligence</h1>
        <p className="text-fyn-ink/60 text-sm mt-1">Unified GST &amp; TDS compliance, deadlines and audit readiness.</p>
      </div>

      {dateBanner}
      {bucketBanner}

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-5 bg-fyn-beige-card border border-fyn-ink-10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-fyn-ink data-[state=active]:text-white">Tax Overview</TabsTrigger>
          <TabsTrigger value="gst" className="data-[state=active]:bg-fyn-ink data-[state=active]:text-white">GST Filings</TabsTrigger>
          <TabsTrigger value="tds" className="data-[state=active]:bg-fyn-ink data-[state=active]:text-white">TDS Filings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{renderOverviewTab()}</TabsContent>
        <TabsContent value="gst">{renderGstTab()}</TabsContent>
        <TabsContent value="tds">{renderTdsTab()}</TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default GSTPage;
