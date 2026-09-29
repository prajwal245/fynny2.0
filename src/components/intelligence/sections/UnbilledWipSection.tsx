import { useMemo } from "react";
import { useDeferredRevenue, useMode } from "../DataSource";
import { KPI, IntelCard, fmtCompact } from "../_primitives";

export default function UnbilledWipSection() {
  const mode = useMode();
  const { data, isLoading } = useDeferredRevenue();
  const rows = data ?? [];

  const m = useMemo(() => {
    const wip = rows.reduce((s, r) => s + Number(r.unbilled_revenue ?? 0), 0);
    const deferred = rows.reduce((s, r) => s + Number(r.deferred_balance ?? 0), 0);
    return { wip, deferred };
  }, [rows]);

  if (mode === "live" && rows.length === 0 && !isLoading) {
    return (
      <IntelCard title="Unbilled Work in Progress">
        <p className="text-sm text-[rgba(23,18,8,0.62)] py-4 text-center">No unbilled work found</p>
      </IntelCard>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <KPI label="Unbilled WIP" count={m.wip} format={fmtCompact} sub="Work delivered, not invoiced" tone={m.wip > 0 ? "warning" : "neutral"} />
      <KPI label="Deferred Revenue" count={m.deferred} format={fmtCompact} sub="Invoiced, not recognised" />
      <KPI label="Total Unrecognised" count={m.wip + m.deferred} format={fmtCompact} sub="WIP + deferred balance" tone="healthy" />
    </div>
  );
}
