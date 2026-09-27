import { useState } from "react";
import { useProjectsList } from "../DataSource";
import { IntelCard, Badge, BadgeTone, fmtCompact, fmtPct } from "../_primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusTone: Record<string, BadgeTone> = { active: "gold", completed: "green", pipeline: "gray", cancelled: "gray" };

export default function ProjectEconomicsSection() {
  const { data, isLoading } = useProjectsList();
  const rows = data ?? [];
  const [open, setOpen] = useState<any | null>(null);

  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (rows.length === 0) return null;

  const avgMargin = rows.reduce((s, r) => s + Number(r.gross_margin_pct), 0) / rows.length;

  const marginTone = (m: number): BadgeTone => m > 70 ? "green" : m >= 50 ? "gold" : "red";

  return (
    <>
      <IntelCard title="Project Economics" sub="Per-project gross margin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(23,18,8,0.08)]">
              <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Project</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Client</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Quoted</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Margin</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} onClick={() => setOpen(r)} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                <td className="py-2.5 text-xs text-fyn-ink font-medium">{r.project_name}</td>
                <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.client_name ?? "—"}</td>
                <td className="py-2.5 text-right font-mono text-xs text-fyn-ink font-semibold">{fmtCompact(Number(r.quoted_amount))}</td>
                <td className="py-2.5 text-right"><Badge tone={marginTone(Number(r.gross_margin_pct))}>{fmtPct(Number(r.gross_margin_pct), 0)}</Badge></td>
                <td className="py-2.5 text-right"><Badge tone={statusTone[r.status] ?? "gray"}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 pt-3 border-t border-[rgba(23,18,8,0.08)] flex justify-between text-sm">
          <span className="text-[rgba(23,18,8,0.62)]">Average project margin</span>
          <span className="font-mono font-semibold text-fyn-ink">{fmtPct(avgMargin, 1)}</span>
        </div>
      </IntelCard>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.project_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <Row label="Client" value={open.client_name ?? "—"} />
                <Row label="Quoted" value={fmtCompact(Number(open.quoted_amount))} />
                <Row label="Actual Cost" value={fmtCompact(Number(open.actual_cost))} />
                <Row label="Gross Margin" value={fmtPct(Number(open.gross_margin_pct), 1)} />
                <Row label="Status" value={open.status} />
                <Row label="Start" value={open.start_date ?? "—"} />
                <Row label="End" value={open.end_date ?? "—"} />
                {open.notes && <p className="text-xs text-[rgba(23,18,8,0.62)] pt-2 border-t border-[rgba(23,18,8,0.08)]">{open.notes}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">{label}</span><span className="font-mono text-fyn-ink font-semibold">{value}</span></div>
  );
}
