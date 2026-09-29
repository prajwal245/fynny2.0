import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { track } from "@/lib/analytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Upload } from "lucide-react";
import { useBankTxns, useInvoices, useExpenses, useCustomers, useVendors, useMode } from "../DataSource";
import { IntelCard, KPI, Badge, WithData, AnimatedBar, fmtCompact, fmtINR, fmtPct, ACCENT, CHART, ChartGradients, EMPTY } from "../_primitives";
import { RemindButton, ScenarioPlannerDialog, OptimizeScheduleDialog, ViewAllLink, useOpenDrawer } from "../actions";
import SettlementsSection from "../sections/SettlementsSection";
import FxExposureSection from "../sections/FxExposureSection";
import UnbilledWipSection from "../sections/UnbilledWipSection";
import ActionItemsSection from "../sections/ActionItemsSection";
import NoDataPrompt from "../NoDataPrompt";

import { useLiquidityMetrics, useLiveBusinessId } from "@/hooks/useExternalIntel";


function daysBetween(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default function LiquidityTab() {
  useEffect(() => { track("intelligence_tab_viewed", { tab: "liquidity" }); }, []);
  const navigate = useNavigate();
  const mode = useMode();
  const { data: bank, isLoading: bankL } = useBankTxns();
  const { data: invoices, isLoading: invL } = useInvoices();
  const { data: expenses, isLoading: expL } = useExpenses();
  const { data: customers } = useCustomers();
  const { data: vendors } = useVendors();

  const m = useMemo(() => {
    const inv = invoices ?? [];
    const exp = expenses ?? [];
    const bk = bank ?? [];

    const cashBalance = bk[0]?.balance ?? 0;
    const restricted = cashBalance * 0.08;
    const operating = cashBalance - restricted;

    const now = new Date();
    const c30 = new Date(now.getTime() - 30 * 86400000);
    const grossBurn = exp.filter((e) => new Date(e.date) >= c30).reduce((s, e) => s + Number(e.amount), 0);
    const revenue30 = inv.filter((i) => i.status === "paid" && i.payment_date && new Date(i.payment_date) >= c30).reduce((s, i) => s + Number(i.paid_amount), 0);
    // Net burn = total expenses − total paid invoices (last 30 days). Can be negative if profitable.
    const netBurn = grossBurn - revenue30;
    const runwayMonths = netBurn > 0 && cashBalance > 0 ? cashBalance / netBurn : NaN;


    // AR aging
    const aging = { current: 0, d31_60: 0, d61_90: 0, d90: 0 };
    inv.forEach((i) => {
      if (i.status === "paid" || i.status === "cancelled") return;
      const d = daysBetween(i.due_date || i.invoice_date, new Date().toISOString());
      const amt = Number(i.outstanding_amount);
      if (d <= 30) aging.current += amt;
      else if (d <= 60) aging.d31_60 += amt;
      else if (d <= 90) aging.d61_90 += amt;
      else aging.d90 += amt;
    });

    // Overdue
    const overdue = inv
      .filter((i) => i.status === "overdue" || (i.outstanding_amount > 0 && i.due_date && new Date(i.due_date) < now))
      .map((i) => ({ ...i, daysOver: i.due_date ? Math.max(0, daysBetween(i.due_date, new Date().toISOString())) : 0, customer_name: customers?.find((c) => c.id === i.customer_id)?.customer_name ?? "—" }))
      .sort((a, b) => b.daysOver - a.daysOver)
      .slice(0, 6);

    // Major payments due
    const payments = exp
      .filter((e) => e.payment_status !== "Paid" && e.due_date)
      .map((e) => ({ ...e, vendor_name: vendors?.find((v) => v.id === e.vendor_id)?.vendor_name ?? "—" }))
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 5);

    // CCC / DSO / DPO  (rough — net sales over 90d / receivables)
    const c90 = new Date(now.getTime() - 90 * 86400000);
    const sales90 = inv.filter((i) => new Date(i.invoice_date) >= c90).reduce((s, i) => s + Number(i.total_amount), 0);
    const recv = inv.reduce((s, i) => s + Number(i.outstanding_amount), 0);
    const pay = exp.filter((e) => e.payment_status !== "Paid").reduce((s, e) => s + Number(e.amount), 0);
    const cogs90 = exp.filter((e) => new Date(e.date) >= c90).reduce((s, e) => s + Number(e.amount), 0);
    const dso = sales90 > 0 ? (recv / sales90) * 90 : NaN;
    const dpo = cogs90 > 0 ? (pay / cogs90) * 90 : NaN;
    const dio = mode === "demo" ? 12 : NaN; // placeholder — real DIO needs inventory data
    const ccc = Number.isFinite(dso) && Number.isFinite(dpo) && Number.isFinite(dio) ? dso + dio - dpo : NaN;

    const quickRatio = pay > 0 ? (cashBalance + recv) / pay : NaN;
    const currentRatio = pay > 0 ? (cashBalance + recv) / pay : NaN;
    const workingCapital = cashBalance + recv - pay;


    // 13-week forecast
    const weekly: { week: string; inflow: number; outflow: number; net: number }[] = [];
    for (let w = 1; w <= 13; w++) {
      const inflow = revenue30 / 4.3;
      const outflow = grossBurn / 4.3;
      weekly.push({ week: `W${w}`, inflow, outflow, net: inflow - outflow });
    }

    return { cashBalance, operating, restricted, grossBurn, netBurn, runwayMonths, revenue30, dso, dpo, ccc, quickRatio, currentRatio, workingCapital, aging, overdue, payments, weekly };
  }, [bank, invoices, expenses, customers, vendors]);

  const isEmpty = !invL && !bankL && !expL && (invoices?.length ?? 0) === 0 && (expenses?.length ?? 0) === 0 && (bank?.length ?? 0) === 0;
  const isLive = mode === "live";
  const liveEmpty = isLive && isEmpty;
  const fmtMonths = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} mo` : EMPTY);
  const fmtDays = (n: number) => (Number.isFinite(n) ? `${n.toFixed(0)}d` : EMPTY);
  const burnTone = liveEmpty ? "neutral" : m.netBurn > 0 && m.netBurn / Math.max(1, m.cashBalance) > 0.2 ? "critical" : m.netBurn > 0 ? "warning" : "healthy";
  const runwayTone = liveEmpty || !Number.isFinite(m.runwayMonths) ? "neutral" : m.runwayMonths < 6 ? "critical" : m.runwayMonths < 12 ? "warning" : "healthy";
  const zeroDate = useMemo(() => {
    if (!Number.isFinite(m.runwayMonths) || m.netBurn <= 0 || m.cashBalance <= 0) return null;
    const days = (m.cashBalance / m.netBurn) * 30;
    const d = new Date();
    d.setDate(d.getDate() + Math.round(days));
    return d.toISOString().slice(0, 10);
  }, [m]);
  const hasCriticalAlert = !liveEmpty && (m.aging.d61_90 + m.aging.d90) > 0;

  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  
  const openDrawer = useOpenDrawer();

  /* ── Real computed liquidity metrics (external intelligence store) ── */
  const liveBizId = useLiveBusinessId();
  const { data: liq, isLoading: liqL } = useLiquidityMetrics();
  useEffect(() => {
    if (isLive) console.log("[fyn:liquidity] mount", { business_id: liveBizId, liquidity_metrics: liq ?? null });
  }, [isLive, liveBizId, liq]);

  const lm = {
    cash: Number(liq?.cash_position ?? 0),
    runwayMonths: Number(liq?.runway_months ?? 0),
    runwayDays: Number(liq?.runway_days ?? 0),
    burn: Number(liq?.burn_rate_current ?? 0),
    score: Math.max(0, Math.min(100, Number(liq?.health_score ?? 0))),
    status: liq?.health_status ?? "—",
  };
  const scoreTone: "green" | "amber" | "red" = lm.score >= 70 ? "green" : lm.score >= 40 ? "amber" : "red";
  const scoreColor = scoreTone === "green" ? ACCENT.green : scoreTone === "amber" ? ACCENT.amber : ACCENT.red;

  return (
    <div className="space-y-6 fyn-stagger">
      

      {isLive && (
        <IntelCard
          title="Liquidity Position"
          sub={liq ? `Computed ${new Date(liq.recorded_at).toLocaleString("en-IN")}` : "Awaiting your first data import"}
          action={<Badge tone={scoreTone}>{String(lm.status).toUpperCase()}</Badge>}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI label="Cash Position" value={fmtINR(lm.cash)} tone={lm.cash > 0 ? "healthy" : "neutral"} />
              <KPI label="Runway" value={`${lm.runwayMonths.toFixed(1)} mo`} sub={`${lm.runwayDays.toFixed(0)} days`} tone={lm.runwayMonths < 3 ? "critical" : lm.runwayMonths < 6 ? "warning" : "healthy"} />
              <KPI label="Burn Rate" value={`${fmtINR(lm.burn)}/mo`} />
              <KPI label="Health Score" value={`${lm.score.toFixed(0)}/100`} />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-fyn-ink/60 mb-1">
                <span>Financial health</span>
                <span className="font-mono tabular-nums">{lm.score.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={lm.score} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full transition-all duration-700" style={{ width: `${lm.score}%`, background: scoreColor }} />
              </div>
            </div>
            {!liqL && !liq && (
              <NoDataPrompt text="Upload your bank statement to see your liquidity metrics." />
            )}
          </div>
        </IntelCard>
      )}

      {liveEmpty && (
        <div className="bg-white rounded-md px-5 py-4 flex items-center gap-4" style={{ border: "1px solid rgba(23,18,8,0.08)", borderLeft: "4px solid #C41E1E" }}>
          <Upload className="w-5 h-5 flex-shrink-0" style={{ color: "#C41E1E" }} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-fyn-ink">No liquidity data yet</div>
            <div className="text-xs text-fyn-ink/60">Import a bank statement CSV to see your real cash position, burn rate, and runway.</div>
          </div>
          <button
            onClick={() => navigate("/dashboard/import")}
            className="text-white text-sm font-semibold px-4 py-2 rounded-md"
            style={{ background: "#C41E1E" }}
          >
            Import bank statement
          </button>
        </div>
      )}
      {/* Alert ticker */}
      <div className={`bg-white rounded-md px-4 py-2 flex items-center gap-3 overflow-hidden ${hasCriticalAlert ? "fyn-alert-critical" : ""}`} style={{ border: "1px solid rgba(23,18,8,0.08)" }}>
        {hasCriticalAlert && <span className="w-1.5 h-1.5 rounded-full fyn-dot-blink flex-shrink-0" style={{ background: ACCENT.red }} />}
        <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT.red }} />
        <div className="flex gap-8 text-xs text-fyn-ink animate-[ticker-scroll_30s_linear_infinite] whitespace-nowrap">
          <span>Receivables {fmtCompact(m.aging.d61_90 + m.aging.d90)} overdue 60+ days</span>
          <span>•</span>
          <span>Burn multiple {m.revenue30 > 0 ? (m.netBurn / m.revenue30).toFixed(2) : EMPTY}x</span>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI href="/dashboard/invoices?status=paid" label="Cash Balance" count={m.cashBalance} format={fmtCompact} sub={`Operating ${fmtCompact(m.operating)}`} tone={liveEmpty ? "neutral" : m.cashBalance > 0 ? "healthy" : "critical"} />
        <KPI label="Runway" value={fmtMonths(m.runwayMonths)} isEmpty={liveEmpty || !Number.isFinite(m.runwayMonths)} emptySub={liveEmpty ? "Upload data to calculate" : "Profitable — no burn"} sub={zeroDate ? `Zero by ${zeroDate}` : undefined} deltaTone={Number.isFinite(m.runwayMonths) && m.runwayMonths < 6 ? "down" : "up"} delta={Number.isFinite(m.runwayMonths) ? (m.runwayMonths < 6 ? "Low" : "Healthy") : undefined} tone={runwayTone} />
        <KPI href="/dashboard/expenses" label="Net Burn" value={`${fmtCompact(m.netBurn)}/mo`} sub={`Gross ${fmtCompact(m.grossBurn)}`} isEmpty={liveEmpty} tone={burnTone} />
        <KPI href="/dashboard/invoices?status=overdue" label="Working Capital" count={m.workingCapital} format={fmtCompact} sub={Number.isFinite(m.quickRatio) ? `Quick Ratio ${m.quickRatio.toFixed(2)}` : undefined} isEmpty={liveEmpty} tone={liveEmpty ? "neutral" : m.workingCapital >= 0 ? "healthy" : "critical"} />
      </div>

      <SettlementsSection />


      {/* Cash position + CCC */}
      <div className="grid lg:grid-cols-3 gap-4">
        <IntelCard title="Cash Conversion Cycle" sub="DSO + DIO − DPO">
          <div className="space-y-3">
            <div>
              <p className="font-mono text-3xl text-fyn-ink font-semibold">{Number.isFinite(m.ccc) ? m.ccc.toFixed(0) : EMPTY} <span className="text-sm text-[rgba(23,18,8,0.62)] font-sans">days</span></p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[rgba(23,18,8,0.08)]">
              <div><p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)]">DSO</p><p className="font-mono text-base text-fyn-ink">{fmtDays(m.dso)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)]">DIO</p><p className="font-mono text-base text-fyn-ink">{mode === "demo" ? "12d" : "—"}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)]">DPO</p><p className="font-mono text-base text-fyn-ink">{fmtDays(m.dpo)}</p></div>
            </div>
          </div>
        </IntelCard>

        <IntelCard title="Liquidity Ratios">
          <div className="space-y-3">
            <Row label="Quick Ratio" value={Number.isFinite(m.quickRatio) ? m.quickRatio.toFixed(2) : EMPTY} />
            <Row label="Current Ratio" value={Number.isFinite(m.currentRatio) ? m.currentRatio.toFixed(2) : EMPTY} />
            <Row label="Cash Balance" value={fmtCompact(m.cashBalance)} />
            <Row label="Restricted Cash" value={fmtCompact(m.restricted)} />
          </div>
        </IntelCard>

        <IntelCard title="Scenario Planning" sub="Runway under different revenue scenarios">
          <div className="space-y-2">
            {[
              { label: "Best Case (+20%)", months: m.runwayMonths * 1.35 },
              { label: "Base Case", months: m.runwayMonths },
              { label: "Worst Case (−20%)", months: m.runwayMonths * 0.68 },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-fyn-ink">{s.label}</span>
                <span className="font-mono text-fyn-ink font-semibold">{fmtMonths(s.months)}</span>
              </div>
            ))}
            <button onClick={() => setScenarioOpen(true)} className="w-full mt-3 text-xs font-medium py-2 rounded-md text-white hover:opacity-90 transition-opacity" style={{ background: ACCENT.red }}>Model Custom Scenario</button>
          </div>
        </IntelCard>

      </div>

      <FxExposureSection />


      {/* 13-week forecast */}
      <IntelCard title="13-Week Cash Forecast" sub="Net cash flow per week">
        <WithData data={isEmpty ? [] : m.weekly} isLoading={bankL && expL}>
          {(d) => (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <ChartGradients />
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompact(v)} />
                  <Tooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmtCompact(v)} />
                  <Bar dataKey="net" fill={`url(#${CHART.redGrad.id})`} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </WithData>
      </IntelCard>

      {/* Receivables aging + overdue */}
      <div className="grid lg:grid-cols-2 gap-4">
        <IntelCard title="Accounts Receivable Aging">
          <div className="space-y-2">
            {[
              { label: "Current (0-30 days)", value: m.aging.current, tone: "green" as const },
              { label: "31-60 days", value: m.aging.d31_60, tone: "gold" as const },
              { label: "61-90 days", value: m.aging.d61_90, tone: "amber" as const },
              { label: "90+ days", value: m.aging.d90, tone: "red" as const },
            ].map((row, i) => {
              const total = m.aging.current + m.aging.d31_60 + m.aging.d61_90 + m.aging.d90 || 1;
              const pct = (row.value / total) * 100;

              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fyn-ink">{row.label}</span>
                    <span className="font-mono text-fyn-ink font-semibold">{fmtCompact(row.value)}</span>
                  </div>
                  <AnimatedBar
                    pct={pct}
                    delay={i * 100}
                    color={row.tone === "green" ? ACCENT.green : row.tone === "gold" ? ACCENT.gold : row.tone === "amber" ? ACCENT.amber : ACCENT.red}
                  />
                </div>
              );
            })}

          </div>
        </IntelCard>

        <IntelCard title="Overdue Invoices" sub="Action required" action={<div className="flex items-center gap-2"><Badge tone="red">{m.overdue.length} overdue</Badge><ViewAllLink to="/dashboard/invoices?status=overdue" /></div>}>
          <WithData data={m.overdue} emptyTitle="No overdue invoices" emptyDescription="All receivables on track." cta={null}>
            {(rows) => (
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => openDrawer("invoice", r.id)} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                      <td className="py-2.5">
                        <p className="text-fyn-ink font-medium text-xs">{r.customer_name}</p>
                        <p className="text-[11px] text-[rgba(23,18,8,0.62)]">{r.invoice_number}</p>
                      </td>
                      <td className="py-2.5 text-right">
                        <p className="font-mono text-xs font-semibold text-fyn-ink">{fmtCompact(r.outstanding_amount)}</p>
                        <Badge tone={r.daysOver > 60 ? "red" : "amber"}>{r.daysOver}d overdue</Badge>
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <RemindButton customerName={r.customer_name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </WithData>
        </IntelCard>
      </div>

      <UnbilledWipSection />


      {/* Payments due */}
      <IntelCard title="Major Payments Due (next 30 days)" action={<div className="flex items-center gap-2"><ViewAllLink to="/dashboard/expenses" /><button onClick={() => setOptimizeOpen(true)} className="text-xs font-medium px-3 py-1.5 rounded text-white hover:opacity-90 transition-opacity" style={{ background: ACCENT.red }}>Optimize Schedule</button></div>}>
        <WithData data={m.payments} emptyTitle="No pending payments" cta={null}>
          {(rows) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(23,18,8,0.08)]">
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Vendor</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Category</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Amount</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openDrawer("expense", r.id)} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                    <td className="py-2.5 text-xs text-fyn-ink font-medium">{r.vendor_name}</td>
                    <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.category ?? "—"}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-fyn-ink font-semibold">{fmtCompact(r.amount)}</td>
                    <td className="py-2.5 text-right text-xs text-[rgba(23,18,8,0.62)]">{r.due_date?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WithData>
      </IntelCard>
      {/* Recent bank activity */}
      <IntelCard title="Recent Bank Activity" sub="Latest 8 transactions" action={<ViewAllLink to="/dashboard/banking" />}>
        <WithData data={(bank ?? []).slice(0, 8)} isLoading={bankL} emptyTitle="No transactions yet" cta={null}>
          {(rows) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(23,18,8,0.08)]">
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Date</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Description</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Category</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Amount</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t: any) => (
                  <tr
                    key={t.id}
                    onClick={() => openDrawer("bank_txn", t.id)}
                    className="border-b border-[rgba(23,18,8,0.06)] last:border-0 cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors"
                  >
                    <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{t.date?.slice(0, 10)}</td>
                    <td className="py-2.5 text-xs text-fyn-ink font-medium max-w-[280px] truncate">{t.description ?? "—"}</td>
                    <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{t.category ?? "—"}</td>
                    <td className={`py-2.5 text-right font-mono text-xs font-semibold ${t.type === "credit" ? "text-emerald-600" : "text-fyn-ink"}`}>
                      {t.type === "credit" ? "+" : "−"}{fmtCompact(Number(t.amount))}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{fmtCompact(Number(t.balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WithData>
      </IntelCard>

      {/* Priority action */}
      <ActionItemsSection />

      <ScenarioPlannerDialog open={scenarioOpen} onOpenChange={setScenarioOpen} baseRunwayMonths={m.runwayMonths} baseBurn={m.netBurn} baseRevenue={m.revenue30} />
      <OptimizeScheduleDialog open={optimizeOpen} onOpenChange={setOptimizeOpen} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[rgba(23,18,8,0.62)]">{label}</span>
      <span className="font-mono text-fyn-ink font-semibold">{value}</span>
    </div>
  );
}
