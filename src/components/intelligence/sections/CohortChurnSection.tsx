import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import {
  useCohortAnalysis,
  useChurnSignals,
  useAcknowledgeChurnSignal,
  useRevenueMetrics,
  useLiveBusinessId,
  type CohortRow,
} from "@/hooks/useExternalIntel";
import { IntelCard } from "../_primitives";
import NoDataPrompt from "../NoDataPrompt";
import { toast } from "@/hooks/use-toast";

const INK = "#1A1A1A";
const TEAL = "#0F6E56";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v || 0);

const pctCell = (retained: number | null, size: number) => {
  if (!size) return null;
  const pct = ((retained ?? 0) / size) * 100;
  const bg = pct >= 80 ? "rgba(16,185,129,0.14)" : pct >= 50 ? "rgba(180,120,20,0.14)" : "rgba(169,56,56,0.12)";
  const fg = pct >= 80 ? "#0B7A56" : pct >= 50 ? "#8B6914" : "#A93838";
  return { pct, bg, fg };
};

function CohortTable({ rows }: { rows: CohortRow[] }) {
  if (rows.length === 0) {
    return <NoDataPrompt text="Upload invoice data to see cohort retention analysis." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.62)" }}>
            <th className="py-2 pr-3 font-medium">Cohort Month</th>
            <th className="py-2 pr-3 font-medium">Cohort Size</th>
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <th key={m} className="py-2 px-2 font-medium text-center">{`M${m}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? r.cohort_month} className="border-t" style={{ borderColor: "rgba(23,18,8,0.08)" }}>
              <td className="py-2 pr-3" style={{ color: INK, fontFamily: MONO }}>{r.cohort_month}</td>
              <td className="py-2 pr-3" style={{ color: INK, fontFamily: MONO }}>{r.cohort_size}</td>
              {[1, 2, 3, 4, 5, 6].map((m) => {
                const retained = (r as unknown as Record<string, number | null>)[`retained_m${m}`] ?? null;
                const rev = (r as unknown as Record<string, number | null>)[`revenue_m${m}`] ?? 0;
                const c = pctCell(retained, r.cohort_size);
                return (
                  <td key={m} className="py-1 px-2 text-center">
                    {c ? (
                      <span
                        title={`Revenue ${inr(Number(rev))}`}
                        className="inline-block rounded px-2 py-1 text-xs"
                        style={{ background: c.bg, color: c.fg, fontFamily: MONO }}
                      >
                        {c.pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: "#9A9A9A" }}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChurnPanel() {
  const { data: signals } = useChurnSignals();
  const { data: rev } = useRevenueMetrics();
  const ack = useAcknowledgeChurnSignal();

  const atRisk = Number((rev as unknown as Record<string, unknown> | null)?.at_risk_customers ?? 0);
  const churned = Number((rev as unknown as Record<string, unknown> | null)?.churned_customers ?? 0);
  const list = signals ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4" style={{ border: "0.5px solid rgba(26,26,26,0.15)" }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.62)" }}>At Risk</p>
          <p className="text-2xl font-semibold" style={{ fontFamily: MONO, color: "#8B6914" }}>{atRisk}</p>
        </div>
        <div className="rounded-xl bg-white p-4" style={{ border: "0.5px solid rgba(26,26,26,0.15)" }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.62)" }}>Churned</p>
          <p className="text-2xl font-semibold" style={{ fontFamily: MONO, color: "#A93838" }}>{churned}</p>
        </div>
      </div>

      {list.length === 0 ? (
        <NoDataPrompt text="No active churn signals. All customers invoiced within 60 days." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.62)" }}>
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 pr-3 font-medium">Last Invoice</th>
                <th className="py-2 pr-3 font-medium">Days Since</th>
                <th className="py-2 pr-3 font-medium">Risk Level</th>
                <th className="py-2 pr-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const critical = s.severity === "critical";
                return (
                  <tr key={s.id} className="border-t" style={{ borderColor: "rgba(23,18,8,0.08)" }}>
                    <td className="py-2 pr-3" style={{ color: INK }}>{s.customer_name || s.customer_id}</td>
                    <td className="py-2 pr-3" style={{ color: INK, fontFamily: MONO }}>
                      {s.last_invoice_date
                        ? new Date(s.last_invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="py-2 pr-3" style={{ color: INK, fontFamily: MONO }}>{s.days_since_invoice}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: critical ? "rgba(169,56,56,0.12)" : "rgba(180,120,20,0.14)",
                          color: critical ? "#A93838" : "#8B6914",
                        }}
                      >
                        <AlertTriangle size={11} />
                        {critical ? "Critical" : "Warning"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        disabled={ack.isPending}
                        onClick={() =>
                          ack.mutate(s.id, {
                            onSuccess: () => toast({ title: "Signal acknowledged" }),
                            onError: (e: unknown) =>
                              toast({
                                title: "Could not acknowledge",
                                description: e instanceof Error ? e.message : "Please try again.",
                                variant: "destructive",
                              }),
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ border: `0.5px solid ${TEAL}`, color: TEAL, background: "transparent" }}
                      >
                        <CheckCircle2 size={12} /> Acknowledge
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CohortChurnSection() {
  const [tab, setTab] = useState<"cohort" | "churn">("cohort");
  const businessId = useLiveBusinessId();
  const { data: cohorts } = useCohortAnalysis();
  const { data: signals } = useChurnSignals();
  const { data: rev } = useRevenueMetrics();

  useEffect(() => {
    console.log("[fyn:revenue-intel] mount", {
      business_id: businessId,
      cohort_rows: cohorts?.length ?? 0,
      churn_signals: signals?.length ?? 0,
      ltv: (rev as unknown as Record<string, unknown> | null)?.ltv ?? null,
    });
  }, [businessId, cohorts, signals, rev]);

  return (
    <IntelCard
      title="Retention & Churn"
      sub="Computed from your invoice history"
      action={
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "rgba(26,26,26,0.05)" }}>
          {(["cohort", "churn"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: tab === t ? "#FFFFFF" : "transparent",
                color: tab === t ? TEAL : "rgba(23,18,8,0.62)",
                border: tab === t ? "0.5px solid rgba(26,26,26,0.12)" : "0.5px solid transparent",
              }}
            >
              {t === "cohort" ? "Cohort Analysis" : "Churn Signals"}
            </button>
          ))}
        </div>
      }
    >
      {tab === "cohort" ? <CohortTable rows={cohorts ?? []} /> : <ChurnPanel />}
    </IntelCard>
  );
}
