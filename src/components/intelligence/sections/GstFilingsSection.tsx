/**
 * Task 4 — GST filings read live from the external intelligence store,
 * ordered by due date. Status badge is derived: filed = green, overdue
 * (past due & not filed) = red, otherwise pending = amber.
 */
import { useEffect } from "react";
import { useExternalGstFilings, useLiveBusinessId } from "@/hooks/useExternalIntel";
import { useMode } from "../DataSource";
import { IntelCard, Badge, fmtINR } from "../_primitives";
import NoDataPrompt from "../NoDataPrompt";

function statusOf(status: string, dueDate: string | null) {
  if (status === "filed") return { label: "FILED", tone: "green" as const };
  if (dueDate && new Date(dueDate).getTime() < Date.now()) return { label: "OVERDUE", tone: "red" as const };
  return { label: (status || "pending").toUpperCase(), tone: "amber" as const };
}

export default function GstFilingsSection() {
  const mode = useMode();
  const businessId = useLiveBusinessId();
  const { data: filings, isLoading } = useExternalGstFilings();

  useEffect(() => {
    if (mode === "live") console.log("[fyn:tax] mount", { business_id: businessId, gst_filings: filings ?? [] });
  }, [mode, businessId, filings]);

  if (mode !== "live") return null;
  const rows = filings ?? [];

  return (
    <IntelCard title="GST Filing Schedule" sub="Live filing status by due date">
      {isLoading ? (
        <p className="text-sm text-fyn-ink/50">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["Filings", "Tax payable", "Input credit", "Overdue"].map((l) => (
              <div key={l} className="rounded-lg bg-white px-4 py-3" style={{ border: "1px solid rgba(23,18,8,0.08)" }}>
                <p className="text-[11px] uppercase tracking-wide text-fyn-ink/50">{l}</p>
                <p className="font-mono text-xl text-fyn-ink tabular-nums mt-1">{l === "Filings" || l === "Overdue" ? "0" : "₹0"}</p>
              </div>
            ))}
          </div>
          <NoDataPrompt />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fyn-ink/50 text-left">
                <th className="py-2 font-medium">Return</th>
                <th className="py-2 font-medium">Period</th>
                <th className="py-2 font-medium">Due date</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Tax payable</th>
                <th className="py-2 font-medium text-right">Input credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const s = statusOf(f.status, f.due_date);
                return (
                  <tr key={f.id} className="border-t border-[rgba(23,18,8,0.06)]">
                    <td className="py-2.5 text-fyn-ink font-medium">{f.return_type}</td>
                    <td className="py-2.5 text-fyn-ink/70">{f.filing_period}</td>
                    <td className="py-2.5 text-fyn-ink/70 font-mono tabular-nums">
                      {f.due_date ? new Date(f.due_date).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="py-2.5"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-fyn-ink">{fmtINR(Number(f.tax_payable || 0))}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-fyn-ink">{fmtINR(Number(f.input_tax_credit || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </IntelCard>
  );
}
