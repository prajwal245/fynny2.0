/**
 * Task 3 — cost anomalies, read live from the external intelligence store.
 * Severity colour-coded, acknowledgeable, with a green all-clear + zero-spend
 * summary from bank_transactions when nothing is flagged.
 */
import { useEffect } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import {
  useCostAnomalies, useAcknowledgeAnomaly, useExternalBankTxns, useLiveBusinessId,
} from "@/hooks/useExternalIntel";
import { useMode } from "../DataSource";
import { IntelCard, Badge, ACCENT, fmtINR } from "../_primitives";
import NoDataPrompt from "../NoDataPrompt";

const SEV: Record<string, { tone: "green" | "amber" | "red" | "gray"; color: string }> = {
  info: { tone: "gray", color: "#2563EB" },
  warning: { tone: "amber", color: ACCENT.amber },
  critical: { tone: "red", color: ACCENT.red },
};

export default function CostAnomaliesSection() {
  const mode = useMode();
  const businessId = useLiveBusinessId();
  const { data: anomalies, isLoading } = useCostAnomalies();
  const { data: txns } = useExternalBankTxns();
  const acknowledge = useAcknowledgeAnomaly();

  useEffect(() => {
    if (mode === "live") console.log("[fyn:cost] mount", { business_id: businessId, cost_anomalies: anomalies ?? [] });
  }, [mode, businessId, anomalies]);

  if (mode !== "live") return null;

  const rows = anomalies ?? [];
  const totalSpend = (txns ?? [])
    .filter((t) => String(t.type).toLowerCase().startsWith("deb") || Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);

  return (
    <IntelCard title="Cost Anomalies" sub="Detected deviations from expected spend">
      {isLoading ? (
        <p className="text-sm text-fyn-ink/50">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="space-y-4">
          <div
            className="rounded-lg px-4 py-3 flex items-center gap-3"
            style={{ border: `1px solid ${ACCENT.green}44`, background: `${ACCENT.green}0F` }}
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: ACCENT.green }} />
            <div>
              <p className="text-sm font-semibold text-fyn-ink">No cost anomalies detected</p>
              <p className="text-xs text-fyn-ink/60">
                Total tracked spend: <span className="font-mono tabular-nums">{fmtINR(totalSpend)}</span>
              </p>
            </div>
          </div>
          {totalSpend === 0 && <NoDataPrompt />}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const sev = SEV[a.severity] ?? SEV.info;
            const dev = Number(a.deviation_pct ?? 0);
            return (
              <div
                key={a.id}
                className="rounded-lg bg-white px-4 py-3"
                style={{ border: "1px solid rgba(23,18,8,0.08)", borderLeft: `4px solid ${sev.color}`, opacity: a.is_acknowledged ? 0.55 : 1 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ShieldAlert className="w-4 h-4 flex-shrink-0" style={{ color: sev.color }} />
                      <span className="text-sm font-semibold text-fyn-ink">{a.category}</span>
                      <Badge tone={sev.tone}>{String(a.severity).toUpperCase()}</Badge>
                      <span className="font-mono text-xs tabular-nums" style={{ color: sev.color }}>
                        {dev >= 0 ? "+" : ""}{dev.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-fyn-ink/70 mt-1 font-mono tabular-nums">
                      Actual {fmtINR(Number(a.actual_amount || 0))} vs expected {fmtINR(Number(a.expected_amount || 0))}
                    </p>
                    {a.explanation && <p className="text-xs text-fyn-ink/60 mt-1 leading-relaxed">{a.explanation}</p>}
                  </div>
                  {a.is_acknowledged ? (
                    <Badge tone="green">Acknowledged</Badge>
                  ) : (
                    <button
                      onClick={() => acknowledge(a.id)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-md text-white flex-shrink-0"
                      style={{ background: ACCENT.red }}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </IntelCard>
  );
}
