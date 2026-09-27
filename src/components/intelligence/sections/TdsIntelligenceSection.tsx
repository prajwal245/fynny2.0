import { useMemo } from "react";
import { useTdsIntelligence } from "../DataSource";
import { IntelCard, Badge, BadgeTone, fmtCompact, ACCENT } from "../_primitives";
import { AlertTriangle } from "lucide-react";

const tone: Record<string, BadgeTone> = { filed: "green", deposited: "gold", mismatch: "red", overdue: "red", pending: "gray" };

export default function TdsIntelligenceSection() {
  const { data, isLoading } = useTdsIntelligence();
  const rows = data ?? [];

  const m = useMemo(() => {
    const deducted = rows.reduce((s, r) => s + Number(r.amount_deducted), 0);
    const deposited = rows.reduce((s, r) => s + Number(r.amount_deposited), 0);
    const allMatched = rows.length > 0 && rows.every(r => r.matched_26as);
    const allFiled = rows.length > 0 && rows.every(r => r.return_filed);
    const mismatches = rows.filter(r => r.status === "mismatch").length;
    return { deducted, deposited, allMatched, allFiled, mismatches };
  }, [rows]);

  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (rows.length === 0) return null;

  return (
    <IntelCard title="TDS Intelligence" sub="Section-wise deductions · FY 2026-27">
      <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
        <span className="text-[rgba(23,18,8,0.62)]">Deducted <span className="font-mono font-semibold text-fyn-ink ml-1">{fmtCompact(m.deducted)}</span></span>
        <span className="text-[rgba(23,18,8,0.62)]">Deposited <span className="font-mono font-semibold text-fyn-ink ml-1">{fmtCompact(m.deposited)}</span></span>
        <Badge tone={m.allMatched ? "green" : "amber"}>{m.allMatched ? "26AS Matched" : "Partial Match"}</Badge>
        <Badge tone={m.allFiled ? "green" : "gold"}>{m.allFiled ? "Return Filed" : "Return Pending"}</Badge>
      </div>

      {m.mismatches > 0 && (
        <div className="rounded-md p-3 mb-3 flex items-center gap-2" style={{ background: "rgba(169,56,56,0.08)", border: "1px solid rgba(169,56,56,0.2)" }}>
          <AlertTriangle className="w-4 h-4" style={{ color: ACCENT.red }} />
          <p className="text-xs text-fyn-ink"><strong>{m.mismatches} TDS mismatch{m.mismatches > 1 ? "es" : ""}</strong> found — reconcile before filing.</p>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(23,18,8,0.08)]">
            <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Section</th>
            <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Description</th>
            <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Deducted</th>
            <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Rate</th>
            <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 hover:bg-[rgba(169,56,56,0.04)] transition-colors">
              <td className="py-2.5 text-xs font-mono text-fyn-ink font-semibold">{r.section_code}</td>
              <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.description}</td>
              <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(r.amount_deducted))}</td>
              <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{Number(r.rate).toFixed(1)}%</td>
              <td className="py-2.5 text-right"><Badge tone={tone[r.status] ?? "gray"}>{r.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </IntelCard>
  );
}
