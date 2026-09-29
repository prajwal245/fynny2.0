import { useAdvanceTaxSchedule } from "../DataSource";
import { IntelCard, Badge, BadgeTone, fmtCompact, ACCENT } from "../_primitives";

const tone: Record<string, BadgeTone> = { exempt: "green", paid: "green", upcoming: "gray", overdue: "red" };

export default function AdvanceTaxSection() {
  const { data, isLoading } = useAdvanceTaxSchedule();
  const rows = data ?? [];
  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (rows.length === 0) return null;

  const exempt = rows[rows.length - 1]?.section_80iac_exempt;

  return (
    <IntelCard title="Advance Tax Schedule" sub="Quarterly instalments · FY 2026-27">
      {exempt && (
        <div className="rounded-md p-3 mb-4" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <p className="text-xs text-fyn-ink"><strong style={{ color: ACCENT.green }}>Section 80IAC Tax Holiday Active</strong> — ₹0 advance tax due this FY.</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-lg p-3" style={{ border: "1px solid rgba(23,18,8,0.08)", background: "#fff" }}>
            <p className="text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium">Q{r.instalment_number} · {Number(r.cumulative_pct)}% cumulative</p>
            <p className="font-mono text-sm text-fyn-ink mt-1">{new Date(r.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            <p className="font-mono text-lg text-fyn-ink font-semibold mt-1">{fmtCompact(Number(r.amount_due))}</p>
            <div className="mt-2"><Badge tone={tone[r.status] ?? "gray"}>{r.status}</Badge></div>
          </div>
        ))}
      </div>
    </IntelCard>
  );
}
