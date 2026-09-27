import { useConversionFunnel } from "../DataSource";
import { IntelCard, ACCENT } from "../_primitives";

export default function ConversionFunnelSection() {
  const { data, isLoading } = useConversionFunnel();
  const latest = (data ?? []).at(-1);

  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (!latest) return null;

  const steps = [
    { label: "Leads", value: latest.leads_total, sub: "Top of funnel" },
    { label: `Trials (${Number(latest.activation_rate).toFixed(1)}%)`, value: latest.trials_started, sub: "Activation" },
    { label: "Activated", value: latest.activated, sub: "Used product" },
    { label: `Paid (${Number(latest.trial_to_paid_rate).toFixed(1)}%)`, value: latest.converted_to_paid, sub: "Converted" },
    { label: "Retained 90d", value: latest.retained_90d, sub: "Stuck around" },
  ];
  const max = Math.max(...steps.map(s => s.value));

  return (
    <IntelCard title="Conversion Funnel" sub="Lead → Trial → Activated → Paid → Retained">
      <div className="space-y-2">
        {steps.map((s, i) => {
          const pct = max > 0 ? (s.value / max) * 100 : 0;
          return (
            <div key={s.label} className="relative">
              <div className="h-9 rounded-md flex items-center px-3 transition-all" style={{
                width: `${pct}%`,
                minWidth: "180px",
                background: `linear-gradient(90deg, ${ACCENT.red} 0%, ${ACCENT.redLight} 100%)`,
                opacity: 1 - i * 0.12,
              }}>
                <span className="text-xs font-semibold text-white flex-1">{s.label}</span>
                <span className="font-mono text-sm text-white font-bold tabular-nums">{s.value.toLocaleString("en-IN")}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[rgba(23,18,8,0.08)] text-xs">
        <div><p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)]">Avg Days to Convert</p><p className="font-mono text-base text-fyn-ink font-semibold">{latest.avg_days_to_convert}d</p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)]">Best Channel</p><p className="text-fyn-ink font-medium">{latest.best_channel ?? "—"}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)]">Worst Channel</p><p className="text-fyn-ink font-medium">{latest.worst_channel ?? "—"}</p></div>
      </div>
    </IntelCard>
  );
}
