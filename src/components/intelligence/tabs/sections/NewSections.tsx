/**
 * New intelligence sections wired to the 16 new tables.
 * Shared section components for Revenue / Cost / GST / Governance / HR tabs.
 */
import { useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  useCAC, useCohorts, useSalesPipeline, useRevenueBreakdowns, useDeferredRevenue,
  useSubscriptionAudit, useContractRenewals, useEwayBills, useHsnMaster, useTaxPlanning,
  useBalanceSheet, useRiskRegister, useInsurancePolicies, useEsopGrants, useHiringPipeline,
  useCompBenchmarks, useEmployees,
} from "../../DataSource";
import { IntelCard, KPI, Badge, WithData, fmtCompact, fmtPct, ACCENT, CHART, ChartGradients, AnimatedBar } from "../../_primitives";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useOpenDrawer } from "../../actions";

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const daysUntil = (d?: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : 0;

/* ════════════════════════════════════════════════════════════
   REVENUE TAB SECTIONS
   ════════════════════════════════════════════════════════════ */

export function CustomerAcquisitionSection() {
  const { data, isLoading } = useCAC();
  const rows = data ?? [];
  const latest = rows.at(-1);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Customer Acquisition</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="CAC" value={latest ? fmtCompact(Number(latest.cac)) : "—"} isEmpty={!latest} sub="Latest month" />
        <KPI label="LTV:CAC Ratio" value={latest ? Number(latest.ltv_cac_ratio).toFixed(1) : "—"} isEmpty={!latest} tone={latest && Number(latest.ltv_cac_ratio) >= 3 ? "healthy" : "neutral"} />
        <KPI label="Payback Period" value={latest ? `${Number(latest.payback_months).toFixed(1)} mo` : "—"} isEmpty={!latest} />
        <KPI label="Magic Number" value={latest ? Number(latest.magic_number).toFixed(2) : "—"} isEmpty={!latest} tone={latest && Number(latest.magic_number) >= 1 ? "healthy" : "neutral"} />
      </div>
      <IntelCard title="CAC Trend" sub="Last 6 months">
        <WithData data={rows} isLoading={isLoading}>
          {(d) => (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.map((r) => ({ m: new Date(r.period_start).toLocaleString("en", { month: "short" }), cac: Number(r.cac) }))} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="m" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmtCompact(v)} />
                  <Line type="monotone" dataKey="cac" stroke={ACCENT.red} strokeWidth={2} dot={{ r: 3, fill: ACCENT.red }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function CohortRetentionSection() {
  const { data, isLoading } = useCohorts();
  const grid = useMemo(() => {
    const cohorts = new Map<string, any[]>();
    (data ?? []).forEach((r) => {
      const k = new Date(r.cohort_month).toISOString().slice(0, 7);
      if (!cohorts.has(k)) cohorts.set(k, []);
      cohorts.get(k)!.push(r);
    });
    return [...cohorts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Cohort Retention</h2>
      <IntelCard title="Retention Heatmap" sub="% of customers active each month post-acquisition">
        <WithData data={grid} isLoading={isLoading}>
          {(g) => (
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] uppercase text-[rgba(23,18,8,0.62)] font-medium pr-3 py-1">Cohort</th>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <th key={i} className="text-center text-[10px] uppercase text-[rgba(23,18,8,0.62)] font-medium px-2 py-1">M{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.map(([month, rows]) => {
                    const label = new Date(month + "-01").toLocaleString("en", { month: "short", year: "2-digit" });
                    return (
                      <tr key={month}>
                        <td className="text-fyn-ink py-1 pr-3 font-medium">{label}</td>
                        {Array.from({ length: 6 }).map((_, i) => {
                          const r = rows.find((x: any) => x.month_number === i);
                          if (!r) return <td key={i} />;
                          const v = Number(r.retention_rate);
                          const bg = v >= 80 ? `rgba(16,185,129,${v / 100})` : v >= 60 ? `rgba(212,175,55,${v / 100})` : `rgba(169,56,56,${v / 100})`;
                          return (
                            <td key={i} className="px-1 py-0.5">
                              <div className="w-14 h-7 rounded text-center text-[11px] font-mono font-semibold flex items-center justify-center text-white" style={{ background: bg }}>
                                {v.toFixed(0)}%
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { title: "Revenue per Cohort", key: "revenue_current" as const, fmt: (v: number) => fmtCompact(v) },
          { title: "Customers Churned", key: "customers_churned" as const, fmt: (v: number) => String(v) },
          { title: "NRR by Cohort", key: "nrr" as const, fmt: (v: number) => `${v}%` },
        ].map((c) => (
          <IntelCard key={c.title} title={c.title}>
            {grid.map(([month, rows]) => {
              const last = rows[rows.length - 1];
              const label = new Date(month + "-01").toLocaleString("en", { month: "short", year: "2-digit" });
              return (
                <div key={month} className="flex justify-between text-sm py-1.5 border-b border-[rgba(23,18,8,0.06)] last:border-0">
                  <span className="text-[rgba(23,18,8,0.62)]">{label}</span>
                  <span className="font-mono text-fyn-ink font-semibold">{c.fmt(Number(last?.[c.key] ?? 0))}</span>
                </div>
              );
            })}
          </IntelCard>
        ))}
      </div>
    </>
  );
}

export function SalesPipelineSection() {
  const { data, isLoading } = useSalesPipeline();
  const openDrawer = useOpenDrawer();
  const m = useMemo(() => {
    const rows = data ?? [];
    const open = rows.filter((d) => !d.is_won && !d.is_lost);
    const totalPipeline = open.reduce((s, d) => s + Number(d.deal_value), 0);
    const weighted = open.reduce((s, d) => s + Number(d.deal_value) * Number(d.probability) / 100, 0);
    const won = rows.filter((d) => d.is_won).length;
    const lost = rows.filter((d) => d.is_lost).length;
    const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
    const avg = rows.length > 0 ? rows.reduce((s, d) => s + Number(d.deal_value), 0) / rows.length : 0;

    const stages = ["Prospect", "Qualified", "Proposal", "Negotiation", "Closed Won"];
    const funnel = stages.map((s) => {
      const items = rows.filter((d) => d.stage === s);
      return { stage: s, count: items.length, value: items.reduce((sum, d) => sum + Number(d.deal_value), 0) };
    });
    return { totalPipeline, weighted, winRate, avg, funnel, rows };
  }, [data]);

  const stageTone: Record<string, "gray" | "amber" | "gold" | "green"> = {
    Prospect: "gray", Qualified: "amber", Proposal: "gold", Negotiation: "gold", "Closed Won": "green", "Closed Lost": "gray",
  };

  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Sales Pipeline</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Pipeline" value={fmtCompact(m.totalPipeline)} />
        <KPI label="Weighted Pipeline" value={fmtCompact(m.weighted)} sub="Probability-adj." />
        <KPI label="Win Rate" value={fmtPct(m.winRate, 0)} tone={m.winRate >= 25 ? "healthy" : "neutral"} />
        <KPI label="Avg Deal Size" value={fmtCompact(m.avg)} />
      </div>
      <IntelCard title="Pipeline Funnel">
        <div className="space-y-2">
          {m.funnel.map((f, i) => {
            const max = Math.max(...m.funnel.map((x) => x.value), 1);
            return (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-fyn-ink">{f.stage} <span className="text-[rgba(23,18,8,0.62)] text-xs">({f.count})</span></span>
                  <span className="font-mono text-fyn-ink font-semibold">{fmtCompact(f.value)}</span>
                </div>
                <AnimatedBar pct={(f.value / max) * 100} delay={i * 80} height={10} color={`linear-gradient(to right, ${ACCENT.gold}, ${ACCENT.goldLight})`} />
              </div>
            );
          })}
        </div>
      </IntelCard>
      <IntelCard title="Open Deals">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Deal</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Customer</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Stage</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Value</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Prob.</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Close</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} onClick={() => openDrawer("deal", d.id)} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                      <td className="py-2.5 text-xs font-medium text-fyn-ink">{d.deal_name}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{d.customer_name}</td>
                      <td className="py-2.5"><Badge tone={stageTone[d.stage] ?? "gray"}>{d.stage}</Badge></td>
                      <td className="py-2.5 text-right font-mono text-xs font-semibold text-fyn-ink">{fmtCompact(Number(d.deal_value))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{Number(d.probability)}%</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] pl-3">{fmtDate(d.close_date)}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{d.owner_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function RevenueBreakdownSection({ active, setActive }: { active: "product" | "segment" | "channel"; setActive: (v: any) => void }) {
  const { data, isLoading } = useRevenueBreakdowns();
  const rows = (data ?? []).filter((r) => r.breakdown_type === active).sort((a, b) => Number(b.revenue_amount) - Number(a.revenue_amount));
  const total = rows.reduce((s, r) => s + Number(r.revenue_amount), 0);
  return (
    <IntelCard title="Revenue Breakdown" action={
      <div className="flex gap-1 text-xs bg-slate-100 rounded-md p-0.5">
        {(["product", "segment", "channel"] as const).map((b) => (
          <button key={b} onClick={() => setActive(b)} className={`px-2.5 py-1 rounded capitalize ${active === b ? "bg-white text-fyn-ink font-medium shadow-xs" : "text-[rgba(23,18,8,0.62)]"}`}>By {b}</button>
        ))}
      </div>
    }>
      <WithData data={rows} isLoading={isLoading}>
        {(d) => (
          <div className="space-y-3">
            {d.map((r, i) => {
              const pct = total > 0 ? (Number(r.revenue_amount) / total) * 100 : 0;
              return (
                <div key={r.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-fyn-ink">{r.category_name}</span>
                    <span className="font-mono text-fyn-ink font-semibold">{fmtCompact(Number(r.revenue_amount))} <span className="text-[rgba(23,18,8,0.62)] text-xs">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <AnimatedBar pct={pct} delay={i * 80} height={8} color={`linear-gradient(to right, ${ACCENT.gold}, ${ACCENT.goldLight})`} />
                </div>
              );
            })}
          </div>
        )}
      </WithData>
    </IntelCard>
  );
}

export function DeferredRevenueSection() {
  const { data, isLoading } = useDeferredRevenue();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      deferred: rows.reduce((s, r) => s + Number(r.deferred_balance), 0),
      unbilled: rows.reduce((s, r) => s + Number(r.unbilled_revenue), 0),
      monthly: rows.reduce((s, r) => s + Number(r.monthly_recognition), 0),
    };
  }, [data]);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Revenue Recognition</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPI label="Total Deferred" value={fmtCompact(m.deferred)} />
        <KPI label="Unbilled Revenue" value={fmtCompact(m.unbilled)} />
        <KPI label="Monthly Recognition" value={fmtCompact(m.monthly)} />
      </div>
      <IntelCard title="Contracts in Recognition">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Customer</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Contract</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Collected</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Recognized</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Deferred</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Unbilled</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row">
                      <td className="py-2.5 text-xs font-medium text-fyn-ink">{r.customer_name}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(r.contract_value))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{fmtCompact(Number(r.collected))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{fmtCompact(Number(r.recognized))}</td>
                      <td className="py-2.5 text-right font-mono text-xs font-semibold text-fyn-ink">{fmtCompact(Number(r.deferred_balance))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{fmtCompact(Number(r.unbilled_revenue))}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] pl-3 capitalize">{r.recognition_method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   COST TAB SECTIONS
   ════════════════════════════════════════════════════════════ */

export function SubscriptionAuditSection() {
  const { data, isLoading } = useSubscriptionAudit();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      monthly: rows.reduce((s, r) => s + Number(r.monthly_cost), 0),
      savings: rows.reduce((s, r) => s + Number(r.potential_savings), 0),
      dupes: rows.filter((r) => r.is_duplicate).length,
      under: rows.filter((r) => r.status === "underutilized").length,
    };
  }, [data]);
  const statusTone: Record<string, "green" | "gold" | "red" | "gray"> = {
    active: "green", underutilized: "gold", duplicate: "red", unused: "gray",
  };
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">SaaS Subscription Audit</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total SaaS Spend" value={fmtCompact(m.monthly)} sub="/ month" />
        <KPI label="Potential Savings" value={fmtCompact(m.savings)} sub="/ year" tone="healthy" />
        <KPI label="Duplicates Found" value={String(m.dupes)} tone={m.dupes > 0 ? "warning" : "neutral"} />
        <KPI label="Underutilized" value={String(m.under)} tone={m.under > 0 ? "warning" : "neutral"} />
      </div>
      <IntelCard title="Subscription Inventory">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Vendor</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Product</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Cost/mo</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Licenses</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Utilization</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Action</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row">
                      <td className="py-2.5 text-xs font-medium text-fyn-ink">{r.vendor}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.product}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(r.monthly_cost))}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] pl-3 font-mono">{r.licenses_used}/{r.licenses_purchased}</td>
                      <td className="py-2.5 w-32">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full" style={{ width: `${Math.min(100, Number(r.utilization_pct))}%`, background: Number(r.utilization_pct) >= 80 ? ACCENT.green : Number(r.utilization_pct) >= 50 ? ACCENT.gold : ACCENT.red }} />
                          </div>
                          <span className="font-mono text-[11px] text-[rgba(23,18,8,0.62)] w-8 text-right">{Number(r.utilization_pct).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5"><Badge tone={statusTone[r.status] ?? "gray"}>{r.status}</Badge></td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.action}</td>
                      <td className="py-2.5 text-right font-mono text-xs font-semibold text-emerald-600">{Number(r.potential_savings) > 0 ? fmtCompact(Number(r.potential_savings)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function ContractRenewalsSection() {
  const { data, isLoading } = useContractRenewals();
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Contract Renewals</h2>
      <IntelCard title="Upcoming Renewals" sub="Sorted by end date">
        <WithData data={data ?? []} isLoading={isLoading}>
          {(rows) => (
            <div className="grid md:grid-cols-2 gap-3">
              {rows.map((r) => {
                const days = daysUntil(r.end_date);
                const urgent = days <= 60 && days >= 0;
                return (
                  <div key={r.id} className="p-4 rounded-lg fyn-card-hover" style={{ background: urgent ? "rgba(212,175,55,0.08)" : "#FBF9F4", border: `1px solid ${urgent ? "rgba(212,175,55,0.4)" : "rgba(23,18,8,0.08)"}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-fyn-ink text-sm">{r.vendor_name}</p>
                        <p className="font-mono text-xs text-[rgba(23,18,8,0.62)] mt-0.5">{fmtCompact(Number(r.annual_value))} / yr</p>
                      </div>
                      <Badge tone={r.auto_renew ? "green" : "amber"}>{r.auto_renew ? "Auto-renew" : "Manual"}</Badge>
                    </div>
                    <div className="flex justify-between items-end mt-3">
                      <span className="text-xs text-[rgba(23,18,8,0.62)]">Ends {fmtDate(r.end_date)}</span>
                      <span className={`font-mono text-xs font-semibold ${urgent ? "text-amber-600" : "text-fyn-ink"}`}>
                        {days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   GST TAB SECTIONS
   ════════════════════════════════════════════════════════════ */

export function EwayBillSection() {
  const { data, isLoading } = useEwayBills();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      active: rows.filter((r) => r.status === "active").length,
      expired: rows.filter((r) => r.status === "expired").length,
      nonCompliant: rows.filter((r) => !r.is_compliant).length,
    };
  }, [data]);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">E-Way Bill Tracking</h2>
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Active Bills" value={String(m.active)} tone="healthy" />
        <KPI label="Expired" value={String(m.expired)} tone={m.expired > 0 ? "warning" : "neutral"} />
        <KPI label="Non-Compliant" value={String(m.nonCompliant)} tone={m.nonCompliant > 0 ? "critical" : "neutral"} />
      </div>
      <IntelCard title="Recent E-Way Bills">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Bill #</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Invoice</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Date</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">From → To</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Value</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Status</th>
                    <th className="text-center text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Compliant</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row">
                      <td className="py-2.5 font-mono text-xs text-fyn-ink">{r.bill_number}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.invoice_number}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{fmtDate(r.document_date)}</td>
                      <td className="py-2.5 text-xs text-fyn-ink">{r.from_location} → {r.to_location}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(r.value))}</td>
                      <td className="py-2.5 pl-3"><Badge tone={r.status === "active" ? "green" : r.status === "expired" ? "amber" : "gray"}>{r.status}</Badge></td>
                      <td className="py-2.5 text-center">{r.is_compliant ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" /> : <XCircle className="w-4 h-4 text-red-600 inline" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function HsnMasterSection() {
  const { data, isLoading } = useHsnMaster();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      total: rows.length,
      valid: rows.filter((r) => r.validation_status === "valid").length,
      review: rows.filter((r) => r.validation_status === "needs_review").length,
    };
  }, [data]);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">HSN/SAC Code Registry</h2>
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Total Codes" value={String(m.total)} />
        <KPI label="Valid" value={String(m.valid)} tone="healthy" />
        <KPI label="Needs Review" value={String(m.review)} tone={m.review > 0 ? "warning" : "neutral"} />
      </div>
      <IntelCard title="HSN / SAC Codes">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Code</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Description</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Type</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">GST Rate</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Usage</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row">
                      <td className="py-2.5 font-mono text-xs text-fyn-ink font-semibold">{r.code}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.description}</td>
                      <td className="py-2.5"><Badge tone={r.code_type === "goods" ? "gold" : "amber"}>{r.code_type}</Badge></td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{Number(r.gst_rate)}%</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{r.usage_count}</td>
                      <td className="py-2.5 pl-3"><Badge tone={r.validation_status === "valid" ? "green" : "gold"}>{r.validation_status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function TaxPlanningSection() {
  const { data, isLoading } = useTaxPlanning();
  const latest = (data ?? [])[0];
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Tax Planning & Optimization</h2>
      <WithData data={data ?? []} isLoading={isLoading}>
        {() => latest ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI label="Effective Tax Rate" value={`${Number(latest.effective_tax_rate)}%`} sub={latest.financial_year} tone="healthy" />
              <KPI label="Section 80IAC" value={latest.section_80iac_status ?? "—"} sub={latest.section_80iac_year ? `Year ${latest.section_80iac_year} of 3` : ""} tone="healthy" />
              <KPI label="Carry-fwd Losses" value={fmtCompact(Number(latest.carry_forward_losses))} />
              <KPI label="Depreciation" value={fmtCompact(Number(latest.depreciation))} sub={`${latest.depreciation_method} method`} />
            </div>
            <IntelCard title="Tax Optimization Strategies">
              <ul className="space-y-2 text-sm">
                {(Array.isArray(latest.strategies) ? latest.strategies : []).map((s: any, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={s.status === "completed" ? "text-emerald-600" : s.status === "active" ? "text-emerald-600" : s.status === "planned" ? "text-amber-600" : "text-[rgba(23,18,8,0.62)]"}>
                      {s.status === "completed" || s.status === "active" ? "✓" : "○"}
                    </span>
                    <div className="flex-1">
                      <span className="text-fyn-ink">{s.label}</span>
                      <Badge tone={s.status === "active" || s.status === "completed" ? "green" : s.status === "planned" ? "gold" : "gray"}>{s.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </IntelCard>
          </>
        ) : null}
      </WithData>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   GOVERNANCE TAB SECTIONS
   ════════════════════════════════════════════════════════════ */

export function BalanceSheetSection() {
  const { data, isLoading } = useBalanceSheet();
  const sorted = (data ?? []).slice().sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const latest = sorted.at(-1);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Balance Sheet</h2>
      <WithData data={sorted} isLoading={isLoading}>
        {() => latest ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI label="Total Assets" value={fmtCompact(Number(latest.total_assets))} sub={fmtDate(latest.snapshot_date)} />
              <KPI label="Total Liabilities" value={fmtCompact(Number(latest.total_liabilities))} />
              <KPI label="Total Equity" value={fmtCompact(Number(latest.total_equity))} tone="healthy" />
              <KPI label="Debt-to-Equity" value={Number(latest.debt_to_equity).toFixed(2)} tone={Number(latest.debt_to_equity) < 1 ? "healthy" : "warning"} />
            </div>
            <IntelCard title="Assets vs Liabilities" sub="Last 3 snapshots">
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sorted.map((r) => ({
                    m: new Date(r.snapshot_date).toLocaleString("en", { month: "short" }),
                    Cash: Number(r.cash), AR: Number(r.accounts_receivable), Inventory: Number(r.inventory), Fixed: Number(r.fixed_assets), Other: Number(r.other_assets),
                    AP: -Number(r.accounts_payable), STD: -Number(r.short_term_debt), Accrued: -Number(r.accrued), LTD: -Number(r.long_term_debt),
                  }))} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} stackOffset="sign">
                    <ChartGradients />
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="m" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
                    <Tooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmtCompact(Math.abs(v))} />
                    <Bar dataKey="Cash" stackId="a" fill={ACCENT.green} />
                    <Bar dataKey="AR" stackId="a" fill={ACCENT.goldLight} />
                    <Bar dataKey="Inventory" stackId="a" fill={ACCENT.gold} />
                    <Bar dataKey="Fixed" stackId="a" fill={ACCENT.amber} />
                    <Bar dataKey="Other" stackId="a" fill="#CBA98E" />
                    <Bar dataKey="AP" stackId="b" fill={ACCENT.red} />
                    <Bar dataKey="STD" stackId="b" fill={ACCENT.redLight} />
                    <Bar dataKey="Accrued" stackId="b" fill="#E48B8B" />
                    <Bar dataKey="LTD" stackId="b" fill="#7B2828" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </IntelCard>
          </>
        ) : null}
      </WithData>
    </>
  );
}

export function RiskRegisterSection() {
  const { data, isLoading } = useRiskRegister();
  const openDrawer = useOpenDrawer();
  const rows = (data ?? []).filter((r) => r.is_active).sort((a, b) => Number(b.risk_score) - Number(a.risk_score));
  const avg = rows.length ? rows.reduce((s, r) => s + Number(r.risk_score), 0) / rows.length : 0;
  const sevTone = (s: number): "red" | "gold" | "amber" | "green" => s > 70 ? "red" : s >= 50 ? "gold" : s >= 30 ? "amber" : "green";
  const mitTone = (s: string): "green" | "gold" | "gray" => s === "mitigated" ? "green" : s === "in_progress" ? "gold" : "gray";
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Risk Register</h2>
      <div className="grid lg:grid-cols-4 gap-4">
        <IntelCard title="Composite Risk">
          <div className="flex flex-col items-center py-2">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(23,18,8,0.08)" strokeWidth="10" />
                <circle cx="50" cy="50" r="42" fill="none" stroke={avg > 70 ? ACCENT.red : avg >= 50 ? ACCENT.gold : ACCENT.green} strokeWidth="10" strokeDasharray={`${(avg / 100) * 263.9} 263.9`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-mono text-xl font-bold text-fyn-ink">{avg.toFixed(0)}</p>
                <p className="text-[10px] text-[rgba(23,18,8,0.62)]">/ 100</p>
              </div>
            </div>
            <Badge tone={sevTone(avg)}>{avg > 70 ? "Critical" : avg >= 50 ? "High" : avg >= 30 ? "Medium" : "Low"}</Badge>
          </div>
        </IntelCard>
        <div className="lg:col-span-3">
          <WithData data={rows} isLoading={isLoading}>
            {(d) => (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {d.map((r) => (
                  <div key={r.id} onClick={() => openDrawer("risk", r.id)} className="p-4 bg-white rounded-lg fyn-card-hover cursor-pointer" style={{ border: "1px solid rgba(23,18,8,0.08)", borderLeft: `3px solid ${sevTone(Number(r.risk_score)) === "red" ? ACCENT.red : sevTone(Number(r.risk_score)) === "gold" ? ACCENT.gold : sevTone(Number(r.risk_score)) === "amber" ? ACCENT.amber : ACCENT.green}`, boxShadow: "0 2px 8px rgba(23,18,8,0.06)" }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-fyn-ink text-sm leading-tight">{r.risk_name}</p>
                      <Badge tone={sevTone(Number(r.risk_score))}>{Number(r.risk_score).toFixed(0)}</Badge>
                    </div>
                    <p className="text-[11px] text-[rgba(23,18,8,0.62)] mb-2">{r.risk_category} · Likelihood {r.likelihood}/5 × Impact {r.impact}/5</p>
                    <div className="flex justify-between items-end">
                      <span className="font-mono text-xs text-fyn-ink">{Number(r.current_exposure) > 0 ? fmtCompact(Number(r.current_exposure)) : "—"}</span>
                      <Badge tone={mitTone(r.mitigation_status)}>{r.mitigation_status.replace("_", " ")}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </WithData>
        </div>
      </div>
    </>
  );
}

export function InsuranceSection() {
  const { data, isLoading } = useInsurancePolicies();
  const openDrawer = useOpenDrawer();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      coverage: rows.reduce((s, r) => s + Number(r.coverage_amount), 0),
      premium: rows.reduce((s, r) => s + Number(r.annual_premium), 0),
      active: rows.filter((r) => r.status === "active").length,
      issues: rows.filter((r) => !r.is_adequate).length,
    };
  }, [data]);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Insurance Coverage</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Coverage" value={fmtCompact(m.coverage)} />
        <KPI label="Annual Premiums" value={fmtCompact(m.premium)} />
        <KPI label="Active Policies" value={String(m.active)} tone="healthy" />
        <KPI label="Adequacy Issues" value={String(m.issues)} tone={m.issues > 0 ? "warning" : "neutral"} />
      </div>
      <WithData data={m.rows} isLoading={isLoading}>
        {(rows) => (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((p) => (
              <div key={p.id} onClick={() => openDrawer("insurance", p.id)} className="p-4 bg-white rounded-lg fyn-card-hover cursor-pointer" style={{ border: "1px solid rgba(23,18,8,0.08)", borderLeft: `3px solid ${p.is_adequate ? ACCENT.green : ACCENT.gold}`, boxShadow: "0 2px 8px rgba(23,18,8,0.06)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge tone="gold">{p.policy_type}</Badge>
                  {!p.is_adequate && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                </div>
                <p className="font-semibold text-fyn-ink text-sm">{p.provider}</p>
                <p className="font-mono text-xl text-fyn-ink font-bold mt-1">{fmtCompact(Number(p.coverage_amount))}</p>
                <p className="text-[11px] text-[rgba(23,18,8,0.62)]">coverage</p>
                <div className="mt-3 pt-3 border-t border-[rgba(23,18,8,0.08)] flex justify-between text-xs">
                  <span className="text-[rgba(23,18,8,0.62)]">Premium <span className="font-mono text-fyn-ink">{fmtCompact(Number(p.annual_premium))}/yr</span></span>
                  <span className="text-[rgba(23,18,8,0.62)]">Exp {fmtDate(p.expiry_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </WithData>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   HR TAB SECTIONS
   ════════════════════════════════════════════════════════════ */

export function EsopSection() {
  const { data, isLoading } = useEsopGrants();
  const { data: emps } = useEmployees();
  const openDrawer = useOpenDrawer();
  const empByName = useMemo(() => {
    const map = new Map<string, string>();
    (emps ?? []).forEach((e: any) => map.set(String(e.name || "").toLowerCase(), e.id));
    return map;
  }, [emps]);
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      total: rows.reduce((s, r) => s + Number(r.total_options), 0),
      vested: rows.reduce((s, r) => s + Number(r.vested_options), 0),
      poolValue: rows.reduce((s, r) => s + Number(r.total_options) * Number(r.current_fair_value), 0),
      avgStrike: rows.length ? rows.reduce((s, r) => s + Number(r.strike_price), 0) / rows.length : 0,
    };
  }, [data]);
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">ESOP Pool</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Options Granted" value={m.total.toLocaleString("en-IN")} />
        <KPI label="Vested" value={m.vested.toLocaleString("en-IN")} sub="Pre-cliff" />
        <KPI label="Pool Value" value={fmtCompact(m.poolValue)} sub="At fair value" tone="healthy" />
        <KPI label="Avg Strike" value={`₹${m.avgStrike.toFixed(0)}`} />
      </div>
      <IntelCard title="ESOP Grants">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Employee</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Grant Date</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Options</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Vested</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Strike</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Fair Value</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Cliff</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const empId = empByName.get(String(r.employee_name || "").toLowerCase());
                    return (
                      <tr
                        key={r.id}
                        onClick={() => empId && openDrawer("employee", empId)}
                        className={`border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row ${empId ? "cursor-pointer hover:bg-[rgba(169,56,56,0.04)]" : ""} transition-colors`}
                      >
                        <td className="py-2.5 text-xs font-medium text-fyn-ink">{r.employee_name}</td>
                        <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{fmtDate(r.grant_date)}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{Number(r.total_options).toLocaleString("en-IN")}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{Number(r.vested_options).toLocaleString("en-IN")}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">₹{r.strike_price}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">₹{r.current_fair_value}</td>
                        <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] pl-3">{fmtDate(r.cliff_date)}</td>
                        <td className="py-2.5"><Badge tone="green">{r.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function HiringPipelineSection() {
  const { data, isLoading } = useHiringPipeline();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      open: rows.filter((r) => !["filled", "cancelled"].includes(r.status)).length,
      critical: rows.filter((r) => r.priority === "critical").length,
      interviewing: rows.filter((r) => r.status === "interviewing").length,
      offers: rows.filter((r) => r.status === "offer").length,
    };
  }, [data]);
  const prioTone: Record<string, "red" | "gold" | "gray"> = { critical: "red", high: "gold", medium: "gray", low: "gray" };
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Hiring Pipeline</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Open Positions" value={String(m.open)} />
        <KPI label="Critical Priority" value={String(m.critical)} tone={m.critical > 0 ? "warning" : "neutral"} />
        <KPI label="In Interview" value={String(m.interviewing)} />
        <KPI label="Offers Pending" value={String(m.offers)} />
      </div>
      <IntelCard title="Open Requisitions">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Position</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Department</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Priority</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Budget</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Candidates</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Target Join</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row">
                      <td className="py-2.5 text-xs font-medium text-fyn-ink">{r.position}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.department}</td>
                      <td className="py-2.5"><Badge tone={prioTone[r.priority] ?? "gray"}>{r.priority}</Badge></td>
                      <td className="py-2.5"><Badge tone={r.status === "offer" ? "green" : r.status === "interviewing" ? "gold" : "gray"}>{r.status}</Badge></td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(r.budget))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{r.candidates_count}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] pl-3">{fmtDate(r.target_join_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}

export function CompBenchmarksSection() {
  const { data, isLoading } = useCompBenchmarks();
  const m = useMemo(() => {
    const rows = data ?? [];
    return {
      rows,
      at: rows.filter((r) => r.competitiveness === "at_market").length,
      below: rows.filter((r) => r.competitiveness === "below_market").length,
      above: rows.filter((r) => r.competitiveness === "above_market").length,
    };
  }, [data]);
  const compTone: Record<string, "red" | "green" | "amber"> = { below_market: "red", at_market: "green", above_market: "amber" };
  return (
    <>
      <h2 className="font-serif text-xl text-fyn-ink font-semibold pt-2">Compensation Benchmarking</h2>
      <div className="grid grid-cols-3 gap-3">
        <KPI label="At Market" value={String(m.at)} tone="healthy" />
        <KPI label="Below Market" value={String(m.below)} tone={m.below > 0 ? "critical" : "neutral"} sub="Retention risk" />
        <KPI label="Above Market" value={String(m.above)} />
      </div>
      <IntelCard title="Role Benchmarks" sub="Internal vs market percentiles">
        <WithData data={m.rows} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Role</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Dept</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Internal</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">P50</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">P75</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3 w-48">Position</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row">
                      <td className="py-2.5 text-xs font-medium text-fyn-ink">{r.role}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.department}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(r.internal_ctc))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{fmtCompact(Number(r.market_50th))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[rgba(23,18,8,0.62)]">{fmtCompact(Number(r.market_75th))}</td>
                      <td className="py-2.5 pl-3">
                        <div className="relative h-2 bg-slate-100 rounded-full">
                          <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-200 via-amber-200 to-red-200 rounded-full" />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white" style={{ left: `${Math.min(95, Math.max(0, Number(r.percentile_position)))}%`, background: ACCENT.ink, transform: "translate(-50%, -50%)" }} />
                        </div>
                        <p className="text-[10px] text-[rgba(23,18,8,0.62)] mt-1 font-mono">P{Number(r.percentile_position).toFixed(0)}</p>
                      </td>
                      <td className="py-2.5"><Badge tone={compTone[r.competitiveness] ?? "gray"}>{r.competitiveness.replace("_", " ")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>
    </>
  );
}
