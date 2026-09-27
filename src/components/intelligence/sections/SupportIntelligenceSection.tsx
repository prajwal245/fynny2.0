import { useSupportIntelligence } from "../DataSource";
import { IntelCard, KPI, ACCENT } from "../_primitives";

export default function SupportIntelligenceSection() {
  const { data, isLoading } = useSupportIntelligence();
  const rows = (data ?? []).slice().sort((a: any, b: any) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime());
  const latest = rows.at(-1);
  if (isLoading) return <div className="h-32 bg-slate-50 animate-pulse rounded-md" />;
  if (!latest) return null;

  const csat = Number(latest.satisfaction_score);
  const csatTone = csat > 4 ? "healthy" : csat >= 3 ? "warning" : "critical";

  const maxTickets = Math.max(...rows.map((r: any) => Number(r.total_tickets)));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Tickets" value={Number(latest.total_tickets).toLocaleString("en-IN")} sub="This month" />
        <KPI label="Avg Resolution" value={`${Number(latest.avg_resolution_hours).toFixed(1)} hrs`} />
        <KPI label="Cost per Ticket" value={`₹${Number(latest.cost_per_ticket).toLocaleString("en-IN")}`} />
        <KPI label="CSAT Score" value={`${csat.toFixed(1)} / 5`} tone={csatTone} delta={csat > 4 ? "Strong" : csat >= 3 ? "Watch" : "Critical"} deltaTone={csat > 4 ? "up" : "down"} />
      </div>
      {rows.length >= 2 && (
        <IntelCard title="Ticket Volume" sub="Last 6 months">
          <div className="flex items-end gap-2 h-24">
            {rows.map((r: any) => {
              const pct = maxTickets > 0 ? (Number(r.total_tickets) / maxTickets) * 100 : 0;
              const label = new Date(r.period_start).toLocaleString("en", { month: "short" });
              return (
                <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t" style={{ height: `${pct}%`, background: `linear-gradient(180deg, ${ACCENT.gold} 0%, ${ACCENT.goldLight} 100%)`, minHeight: 4 }} />
                  <span className="text-[10px] text-[rgba(23,18,8,0.62)]">{label}</span>
                </div>
              );
            })}
          </div>
        </IntelCard>
      )}
    </>
  );
}
