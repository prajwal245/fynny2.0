import { useRevenueQuality } from "../DataSource";
import { IntelCard, KPI, Badge, fmtCompact, fmtPct, ACCENT } from "../_primitives";

export default function RevenueQualitySection() {
  const { data, isLoading } = useRevenueQuality();
  const latest = (data ?? []).at(-1);

  if (isLoading) return <div className="h-32 bg-slate-50 animate-pulse rounded-md" />;
  if (!latest) return null;

  const recurringPct = latest.total_revenue > 0 ? (Number(latest.recurring_revenue) / Number(latest.total_revenue)) * 100 : 0;
  const top3 = Number(latest.top3_client_pct);
  const concTone = top3 > 40 ? "red" : top3 < 35 ? "green" : "gold";

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Recurring Revenue" value={fmtCompact(Number(latest.recurring_revenue))} sub={`${recurringPct.toFixed(0)}% of total`} tone="healthy" />
        <KPI label="Top 3 Concentration" value={fmtPct(top3, 1)} tone={top3 > 40 ? "critical" : "healthy"} delta={top3 > 40 ? "Risk" : "Diversified"} deltaTone={top3 > 40 ? "down" : "up"} />
        <KPI label="Bookings This Month" value={fmtCompact(Number(latest.bookings_total))} />
        <KPI label="Revenue at Risk" value={fmtCompact(Number(latest.revenue_at_risk))} tone="critical" delta="Churn risk" deltaTone="down" />
      </div>
      <IntelCard title="Revenue Mix" sub="By type">
        <div className="space-y-3">
          <div className="flex w-full h-3 rounded-full overflow-hidden" style={{ background: "rgba(23,18,8,0.06)" }}>
            <div style={{ width: `${Number(latest.recurring_pct)}%`, background: ACCENT.green }} />
            <div style={{ width: `${Number(latest.project_pct)}%`, background: ACCENT.gold }} />
            <div style={{ width: `${Number(latest.onetime_pct)}%`, background: ACCENT.red }} />
          </div>
          <div className="flex gap-4 text-xs text-fyn-ink">
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: ACCENT.green }} />Recurring {Number(latest.recurring_pct).toFixed(0)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: ACCENT.gold }} />Project {Number(latest.project_pct).toFixed(0)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: ACCENT.red }} />One-time {Number(latest.onetime_pct).toFixed(0)}%</span>
          </div>
        </div>
      </IntelCard>
    </>
  );
}
