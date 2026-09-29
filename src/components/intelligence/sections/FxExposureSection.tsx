import { useMemo } from "react";
import { useFxExposure, useMode } from "../DataSource";
import { IntelCard, KPI, Badge, fmtCompact } from "../_primitives";

export default function FxExposureSection() {
  const mode = useMode();
  const { data, isLoading } = useFxExposure();
  const rows = data ?? [];

  const m = useMemo(() => {
    const expense = rows.filter(r => r.exposure_type === "expense");
    const totalInr = expense.reduce((s, r) => s + Number(r.monthly_amount_inr), 0);
    const rate = rows[0]?.exchange_rate ?? 83.5;
    const allHedged = rows.length > 0 && rows.every(r => r.hedged);
    return { totalInr, rate, allHedged, expense };
  }, [rows]);

  if (mode === "live" && rows.length === 0 && !isLoading) {
    return (
      <IntelCard title="FX Exposure">
        <p className="text-sm text-[rgba(23,18,8,0.62)] py-4 text-center">No FX exposure detected</p>
      </IntelCard>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPI label="Total FX Exposure (INR)" count={m.totalInr} format={fmtCompact} sub="Monthly outflow" tone={m.totalInr > 500000 ? "warning" : "neutral"} />
        <KPI label="USD/INR Rate" value={`₹${m.rate.toFixed(2)}`} sub="Latest" />
        <KPI label="Hedging Status" value={m.allHedged ? "Hedged" : "Unhedged"} tone={m.allHedged ? "healthy" : "warning"} />
      </div>
      <IntelCard title="USD Vendors & Clients" sub="Foreign-currency exposure">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(23,18,8,0.08)]">
              <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Vendor / Client</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Type</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">CCY</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Monthly (INR)</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                <td className="py-2.5 text-xs text-fyn-ink font-medium">{r.vendor_or_client}</td>
                <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] capitalize">{r.exposure_type}</td>
                <td className="py-2.5 text-xs font-mono text-fyn-ink">{r.currency}</td>
                <td className="py-2.5 text-right font-mono text-xs text-fyn-ink font-semibold">{fmtCompact(Number(r.monthly_amount_inr))}</td>
                <td className="py-2.5 text-right"><Badge tone={r.hedged ? "green" : "gold"}>{r.hedged ? "Hedged" : "Unhedged"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </IntelCard>
    </>
  );
}
