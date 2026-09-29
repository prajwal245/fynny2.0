import { useMemo, useState } from "react";
import { useRegulatoryCompliance } from "../DataSource";
import { IntelCard, Badge, BadgeTone, ACCENT } from "../_primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const tone: Record<string, BadgeTone> = { compliant: "green", due_soon: "gold", overdue: "red", not_applicable: "gray" };
const icon: Record<string, string> = { compliant: "✓", due_soon: "⚠", overdue: "✗", not_applicable: "—" };
const iconColor: Record<string, string> = { compliant: ACCENT.green, due_soon: ACCENT.gold, overdue: ACCENT.red, not_applicable: ACCENT.gray };

export default function RegulatoryComplianceSection() {
  const { data, isLoading } = useRegulatoryCompliance();
  const rows = (data ?? []).slice().sort((a: any, b: any) => {
    const order: Record<string, number> = { overdue: 1, due_soon: 2, compliant: 3, not_applicable: 4 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });
  const [open, setOpen] = useState<any | null>(null);

  const m = useMemo(() => {
    const applicable = rows.filter(r => r.status !== "not_applicable");
    const compliant = applicable.filter(r => r.status === "compliant").length;
    const pct = applicable.length > 0 ? (compliant / applicable.length) * 100 : 0;
    return { compliant, total: applicable.length, pct };
  }, [rows]);

  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (rows.length === 0) return null;

  return (
    <>
      <IntelCard title="Regulatory Compliance" sub={`${m.compliant} / ${m.total} requirements compliant`}>
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-[rgba(23,18,8,0.62)]">Compliance score</span>
            <span className="font-mono font-semibold text-fyn-ink">{m.pct.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: m.pct >= 90 ? ACCENT.green : m.pct >= 70 ? ACCENT.gold : ACCENT.red }} />
          </div>
        </div>
        <ul className="divide-y divide-[rgba(23,18,8,0.06)]">
          {rows.map((r: any) => (
            <li key={r.id} onClick={() => setOpen(r)} className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-[rgba(169,56,56,0.04)] px-1 transition-colors rounded">
              <span className="text-base font-bold w-5 text-center" style={{ color: iconColor[r.status] ?? ACCENT.gray }}>{icon[r.status] ?? "·"}</span>
              <p className="flex-1 text-sm text-fyn-ink font-medium">{r.requirement_name}</p>
              <Badge tone={tone[r.status] ?? "gray"}>{r.status.replace("_", " ")}</Badge>
              <span className="text-xs text-[rgba(23,18,8,0.62)] font-mono w-24 text-right">{r.due_date ? new Date(r.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</span>
            </li>
          ))}
        </ul>
      </IntelCard>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.requirement_name}</DialogTitle></DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Status</span><Badge tone={tone[open.status] ?? "gray"}>{open.status.replace("_", " ")}</Badge></div>
                <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Due date</span><span className="font-mono text-fyn-ink">{open.due_date ?? "—"}</span></div>
                {open.notes && <p className="text-xs text-[#3D3530] pt-2 border-t border-[rgba(23,18,8,0.08)]">{open.notes}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
