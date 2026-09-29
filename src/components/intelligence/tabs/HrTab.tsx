import { useMemo, useState } from "react";
import { useEmployees, useInvoices } from "../DataSource";
import { IntelCard, KPI, WithData, fmtCompact, fmtPct, ACCENT } from "../_primitives";
import { EsopSection, HiringPipelineSection, CompBenchmarksSection } from "./sections/NewSections";
import { HrmsDialog, ViewAllLink, useOpenDrawer } from "../actions";

export default function HrTab() {
  const { data: emps, isLoading } = useEmployees();
  const { data: invoices } = useInvoices();

  const m = useMemo(() => {
    const active = (emps ?? []).filter((e) => e.status === "Active");
    const total = active.length;
    const payroll = active.reduce((s, e) => s + Number(e.salary), 0);
    const ctc = active.reduce((s, e) => s + Number(e.cost_to_company), 0);
    const avgSalary = total > 0 ? payroll / total : 0;
    const revenue = (invoices ?? []).filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.paid_amount), 0);
    const revPerEmp = total > 0 ? revenue / total : 0;

    const deptMap = new Map<string, number>();
    active.forEach((e) => deptMap.set(e.department ?? "Other", (deptMap.get(e.department ?? "Other") || 0) + 1));
    const byDept = [...deptMap.entries()].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count);

    return { total, payroll, ctc, avgSalary, revPerEmp, byDept, active };
  }, [emps, invoices]);

  const [hrmsOpen, setHrmsOpen] = useState(false);
  const openDrawer = useOpenDrawer();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button onClick={() => setHrmsOpen(true)} className="text-xs font-medium px-3 py-1.5 rounded text-white hover:opacity-90 transition-opacity" style={{ background: ACCENT.red }}>Connect HRMS</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Employees" value={m.total} sub="Active headcount" />
        <KPI label="Monthly Payroll" value={fmtCompact(m.payroll)} />
        <KPI label="Avg CTC" value={fmtCompact(m.ctc / Math.max(1, m.total))} sub="Per employee" />
        <KPI label="Revenue / Employee" value={fmtCompact(m.revPerEmp)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <IntelCard title="Headcount by Department">
          <WithData data={m.byDept} isLoading={isLoading}>
            {(rows) => (
              <div className="space-y-2">
                {rows.map((r) => {
                  const pct = m.total > 0 ? (r.count / m.total) * 100 : 0;
                  return (
                    <div key={r.department}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-fyn-ink">{r.department}</span>
                        <span className="font-mono text-fyn-ink font-semibold">{r.count} <span className="text-[rgba(23,18,8,0.62)] text-xs">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full" style={{ width: `${pct * 2}%`, background: `linear-gradient(to right, ${ACCENT.gold}, ${ACCENT.goldLight})` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </WithData>
        </IntelCard>

        <IntelCard title="Compensation Summary">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Monthly Payroll</span><span className="font-mono font-semibold text-fyn-ink">{fmtCompact(m.payroll)}</span></div>
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Annual CTC</span><span className="font-mono font-semibold text-fyn-ink">{fmtCompact(m.ctc * 12)}</span></div>
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Average Salary</span><span className="font-mono font-semibold text-fyn-ink">{fmtCompact(m.avgSalary)}</span></div>
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Headcount Growth (YoY)</span><span className="font-mono font-semibold text-fyn-ink">—</span></div>
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Attrition (TTM)</span><span className="font-mono font-semibold text-fyn-ink">—</span></div>
          </div>
        </IntelCard>
      </div>

      <IntelCard title="Personnel Table" action={<ViewAllLink to="/dashboard/employees" />}>
        <WithData data={m.active} isLoading={isLoading}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(23,18,8,0.08)]">
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Name</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Department</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Designation</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Salary</th>
                    <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">CTC</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2 pl-3">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} onClick={() => openDrawer("employee", e.id)} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                      <td className="py-2.5 text-xs font-medium text-fyn-ink">{e.name}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{e.department ?? "—"}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{e.designation ?? "—"}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(e.salary))}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-fyn-ink">{fmtCompact(Number(e.cost_to_company))}</td>
                      <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)] pl-3">{e.joining_date?.slice(0, 10) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WithData>
      </IntelCard>

      <EsopSection />
      <HiringPipelineSection />
      <CompBenchmarksSection />

      <HrmsDialog open={hrmsOpen} onOpenChange={setHrmsOpen} />
    </div>
  );
}
