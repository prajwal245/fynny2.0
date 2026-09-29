import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useInvoices, useCustomers, useMode } from "../DataSource";
import { IntelCard, KPI, Badge, WithData, AnimatedBar, fmtCompact, fmtINR, fmtPct, ACCENT, CHART, ChartGradients, EMPTY } from "../_primitives";
import NoDataPrompt from "../NoDataPrompt";
import { useRevenueMetrics, useLiveBusinessId } from "@/hooks/useExternalIntel";
import { CustomerAcquisitionSection, CohortRetentionSection, SalesPipelineSection, RevenueBreakdownSection, DeferredRevenueSection } from "./sections/NewSections";
import { GenerateReportButton, ViewAllLink } from "../actions";
import RevenueQualitySection from "../sections/RevenueQualitySection";
import ConversionFunnelSection from "../sections/ConversionFunnelSection";
import RevenueAlertsSection from "../sections/RevenueAlertsSection";
import { EmptyCard } from "@/components/intelligence/EmptyCard";
import CohortChurnSection from "../sections/CohortChurnSection";

export default function RevenueTab() {
  useEffect(() => { track("intelligence_tab_viewed", { tab: "revenue" }); }, []);
  const mode = useMode();
  const { data: invoices, isLoading } = useInvoices();
  const { data: customers } = useCustomers();
  const [breakdownBy, setBreakdownBy] = useState<"product" | "segment" | "channel">("product");

  const m = useMemo(() => {
    const inv = invoices ?? [];
    const paid = inv.filter((i) => i.status === "paid");
    const totalRevenue = paid.reduce((s, i) => s + Number(i.paid_amount), 0);

    // Monthly trend (12 months)
    const map = new Map<string, number>();
    paid.forEach((i) => {
      if (!i.payment_date) return;
      const d = new Date(i.payment_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(k, (map.get(k) || 0) + Number(i.paid_amount));
    });
    const trend = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, v]) => {
      const [y, mo] = k.split("-");
      const date = new Date(Number(y), Number(mo) - 1);
      return { month: date.toLocaleString("en", { month: "short" }), revenue: v };
    });

    // Last month vs prev — for delta
    const tArr = trend.map((t) => t.revenue);
    const last = tArr.at(-1) ?? 0;
    const prev = tArr.at(-2) ?? 0;
    const mom = prev > 0 ? ((last - prev) / prev) * 100 : NaN;

    // Revenue growth: trailing 3 months vs prior 3 months (annualized)
    const t3 = tArr.slice(-3).reduce((s, v) => s + v, 0);
    const p3 = tArr.slice(-6, -3).reduce((s, v) => s + v, 0);
    const growthRate = p3 > 0 ? ((t3 - p3) / p3) * 100 : NaN;

    // Customer revenue
    const custMap = new Map<string, number>();
    paid.forEach((i) => {
      if (!i.customer_id) return;
      custMap.set(i.customer_id, (custMap.get(i.customer_id) || 0) + Number(i.paid_amount));
    });
    const top10 = [...custMap.values()].sort((a, b) => b - a).slice(0, 10);
    const top10Revenue = top10.reduce((s, v) => s + v, 0);
    const concentration = totalRevenue > 0 ? (top10Revenue / totalRevenue) * 100 : NaN;
    const activeCustomers = custMap.size;
    const arpa = activeCustomers > 0 ? totalRevenue / activeCustomers : NaN;

    // Churn: customers active in prior 90d window who are NOT active in last 90d.
    const now = Date.now();
    const c90 = new Date(now - 90 * 86400000);
    const c180 = new Date(now - 180 * 86400000);
    const recent = new Set<string>();
    const priorWindow = new Set<string>();
    inv.forEach((i) => {
      if (!i.customer_id) return;
      const d = new Date(i.invoice_date);
      if (d >= c90) recent.add(i.customer_id);
      if (d >= c180 && d < c90) priorWindow.add(i.customer_id);
    });
    let churnedCount = 0;
    priorWindow.forEach((id) => { if (!recent.has(id)) churnedCount += 1; });
    const churn = priorWindow.size > 0 ? Math.max(0, (churnedCount / priorWindow.size) * 100) : NaN;

    // Profit margin — unavailable without real P&L in live mode
    const profitMargin = NaN;
    // Rule of 40 = growth rate + profit margin, clamped to plausible range
    const rule = Number.isFinite(growthRate) && Number.isFinite(profitMargin)
      ? Math.max(-50, Math.min(80, growthRate + profitMargin))
      : NaN;

    // Demo NRR; in live mode show "—" unless we can compute
    const nrr = mode === "demo" ? 118 : NaN;

    const ltv = mode === "demo" && Number.isFinite(arpa) ? arpa * 12 * 1.5 : NaN;
    const cac = mode === "demo" && Number.isFinite(arpa) ? arpa * 0.55 : NaN;
    const ltvCac = Number.isFinite(ltv) && Number.isFinite(cac) && cac > 0 ? ltv / cac : NaN;
    const payback = Number.isFinite(ltvCac) && ltvCac > 0 ? 12 / ltvCac : NaN;

    // Breakdown removed in live mode — fabricated splits are misleading
    const breakdown: { label: string; value: number; pct: number }[] = [];

    return { totalRevenue, mom, growthRate, trend, activeCustomers, arpa, churn, nrr, ltv, cac, ltvCac, payback, concentration, top10Revenue, rule, breakdown };
  }, [invoices, mode]);

  const liveEmpty = mode === "live" && (invoices?.length ?? 0) === 0;

  /* ── Real computed revenue metrics (external intelligence store) ── */
  const liveBizId = useLiveBusinessId();
  const { data: rev, isLoading: revL } = useRevenueMetrics();
  useEffect(() => {
    if (mode === "live") console.log("[fyn:revenue] mount", { business_id: liveBizId, revenue_metrics: rev ?? null });
  }, [mode, liveBizId, rev]);

  const rm = {
    mrr: Number(rev?.mrr ?? 0),
    arr: Number(rev?.arr ?? 0),
    net: Number(rev?.net_revenue ?? 0),
    customers: Number(rev?.customer_count ?? 0),
    arpu: Number(rev?.arpu ?? 0),
    growth: Number(rev?.revenue_growth_rate ?? 0),
    period: rev?.period_start ? new Date(rev.period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "No period",
  };
  const growthUp = rm.growth >= 0;

  return (
    <div className="space-y-6">
      {mode === "live" && (
        <IntelCard
          title="Revenue Position"
          sub={`Reporting period · ${rm.period}`}
          action={
            <Badge tone={growthUp ? "green" : "red"}>
              {growthUp ? "▲" : "▼"} {Math.abs(rm.growth).toFixed(1)}%
            </Badge>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KPI label="MRR" value={fmtINR(rm.mrr)} tone={rm.mrr > 0 ? "healthy" : "neutral"} />
              <KPI label="ARR" value={fmtINR(rm.arr)} />
              <KPI label="Net Revenue" value={fmtINR(rm.net)} />
              <KPI label="Customers" value={String(rm.customers)} />
              <KPI label="ARPU" value={fmtINR(rm.arpu)} />
            </div>
            {!revL && !rev && (
              <NoDataPrompt text="Upload your sales data or connect your accounting software to see your revenue metrics." />
            )}
          </div>
        </IntelCard>
      )}

      {mode === "live" && <CohortChurnSection />}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="NRR" value={Number.isFinite(m.nrr) ? fmtPct(m.nrr, 0) : EMPTY} isEmpty={!Number.isFinite(m.nrr)} delta={Number.isFinite(m.nrr) ? "+3.2% QoQ" : undefined} deltaTone="up" tone={Number.isFinite(m.nrr) && m.nrr >= 110 ? "healthy" : "neutral"} />
        <KPI label="Churn Rate" value={fmtPct(m.churn, 1)} isEmpty={!Number.isFinite(m.churn)} delta={Number.isFinite(m.churn) ? (m.churn < 8 ? "Below benchmark" : "Above benchmark") : undefined} deltaTone={Number.isFinite(m.churn) && m.churn < 8 ? "up" : "down"} tone={!Number.isFinite(m.churn) ? "neutral" : m.churn < 5 ? "healthy" : m.churn < 10 ? "warning" : "critical"} />
        <KPI label="LTV:CAC" value={Number.isFinite(m.ltvCac) ? m.ltvCac.toFixed(2) : EMPTY} isEmpty={!Number.isFinite(m.ltvCac)} delta={Number.isFinite(m.ltvCac) ? (m.ltvCac >= 3 ? "Healthy" : "Sub-3x") : undefined} deltaTone={Number.isFinite(m.ltvCac) && m.ltvCac >= 3 ? "up" : "down"} tone={!Number.isFinite(m.ltvCac) ? "neutral" : m.ltvCac >= 3 ? "healthy" : "warning"} />
        <KPI label="Payback Period" value={Number.isFinite(m.payback) ? `${m.payback.toFixed(1)} mo` : EMPTY} isEmpty={!Number.isFinite(m.payback)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="ARPA" count={Number.isFinite(m.arpa) ? m.arpa : 0} format={fmtCompact} isEmpty={!Number.isFinite(m.arpa)} />
        <KPI label="LTV" count={Number.isFinite(m.ltv) ? m.ltv : 0} format={fmtCompact} isEmpty={!Number.isFinite(m.ltv)} />
        <KPI label="Rule of 40" value={Number.isFinite(m.rule) ? m.rule.toFixed(0) : EMPTY} isEmpty={!Number.isFinite(m.rule)} deltaTone={Number.isFinite(m.rule) && m.rule >= 40 ? "up" : "down"} delta={Number.isFinite(m.rule) ? (m.rule >= 40 ? "Pass" : "Below") : undefined} tone={!Number.isFinite(m.rule) ? "neutral" : m.rule >= 40 ? "healthy" : "warning"} />
        <KPI href="/dashboard/invoices?status=paid" label="Total Revenue" count={m.totalRevenue} format={fmtCompact} isEmpty={liveEmpty && m.totalRevenue === 0} delta={Number.isFinite(m.mom) ? `${m.mom >= 0 ? "+" : ""}${m.mom.toFixed(1)}% MoM` : undefined} deltaTone={Number.isFinite(m.mom) && m.mom >= 0 ? "up" : "down"} />
      </div>

      <RevenueQualitySection />



      {/* Trend chart */}
      <IntelCard title="Revenue Trend" sub="Last 12 months" action={<GenerateReportButton label="Export" />}>
        <WithData data={m.trend} isLoading={isLoading}>
          {(d) => (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <ChartGradients />
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmtCompact(v)} />
                  <Bar dataKey="revenue" fill={`url(#${CHART.goldGrad.id})`} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </WithData>
      </IntelCard>


      {/* Pipeline + health */}
      <div className="grid lg:grid-cols-2 gap-4">
        <EmptyCard title="Sales Pipeline" hint="Connect your CRM or import deal data to see your pipeline here." />
        <EmptyCard title="Revenue Health Breakdown" hint="Revenue breakdown by type will appear once enough invoice history is available." />
      </div>
      <EmptyCard title="Revenue Breakdown" hint="Revenue breakdown by category will appear after data import." />

      {/* ── New wired sections ─────────────────────────────── */}
      <CustomerAcquisitionSection />
      <ConversionFunnelSection />
      <CohortRetentionSection />
      <SalesPipelineSection />
      <RevenueBreakdownSection active={breakdownBy} setActive={setBreakdownBy} />
      <DeferredRevenueSection />
      <RevenueAlertsSection />
    </div>
  );
}
