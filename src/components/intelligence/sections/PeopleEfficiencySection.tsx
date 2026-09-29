import { usePeopleEfficiency } from "../DataSource";
import { KPI, fmtCompact, fmtPct } from "../_primitives";

export default function PeopleEfficiencySection() {
  const { data, isLoading } = usePeopleEfficiency();
  const latest = (data ?? []).at(-1);
  if (isLoading) return <div className="h-24 bg-slate-50 animate-pulse rounded-md" />;
  if (!latest) return null;

  const util = Number(latest.utilisation_rate);
  const utilTone = util > 70 ? "healthy" : util >= 60 ? "warning" : "critical";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPI label="Utilisation Rate" value={fmtPct(util, 1)} tone={utilTone} delta={util > 70 ? "Strong" : util >= 60 ? "Stretch" : "Underused"} deltaTone={util > 70 ? "up" : "down"} />
      <KPI label="Revenue / Billable Hour" value={`₹${Number(latest.revenue_per_billable_hour).toLocaleString("en-IN")}`} sub="Latest month" />
      <KPI label="Overtime" value={`${Number(latest.overtime_hours).toFixed(0)} hrs`} sub={fmtCompact(Number(latest.overtime_cost))} tone={Number(latest.overtime_hours) > 150 ? "warning" : "neutral"} />
      <KPI label="Training Spend" value={fmtCompact(Number(latest.training_spend))} sub="Capability investment" />
    </div>
  );
}
