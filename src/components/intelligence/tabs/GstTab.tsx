import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { useGstFilings, useExpenses, useInvoices } from "../DataSource";
import { IntelCard, KPI, Badge, WithData, fmtCompact, fmtPct, ACCENT } from "../_primitives";
import { EwayBillSection, HsnMasterSection, TaxPlanningSection } from "./sections/NewSections";
import { GstFilingDialog, useOpenDrawer } from "../actions";
import TdsIntelligenceSection from "../sections/TdsIntelligenceSection";
import AdvanceTaxSection from "../sections/AdvanceTaxSection";
import RegulatoryComplianceSection from "../sections/RegulatoryComplianceSection";
import { EmptyCard } from "@/components/intelligence/EmptyCard";
import GstFilingsSection from "../sections/GstFilingsSection";
import { computeGstSummary, type ExpenseLike } from "@/lib/gstCompute";

export default function GstTab() {
  useEffect(() => { track("intelligence_tab_viewed", { tab: "gst" }); }, []);
  const { data: filings, isLoading } = useGstFilings();
  const { data: invoices } = useInvoices();
  const { data: expenses } = useExpenses();

  // Category-aware GST estimation lives in @/lib/gstCompute (pure + unit-tested):
  // payroll, rent, interest and taxes carry no recoverable ITC; transport,
  // travel and food use concessional rates; everything else defaults to 18%.
  // An explicit tax_amount / gst_rate on the row always wins over the estimate.
  const m = useMemo(() => {
    const { outputGst, inputGst, netPayable } = computeGstSummary(
      (invoices ?? []) as { tax_amount?: number | string | null }[],
      (expenses ?? []) as ExpenseLike[],
    );
    const itcAvailable = inputGst;
    const itcClaimed = NaN;
    const itcGap = itcAvailable > 0 ? ((itcAvailable - itcClaimed) / itcAvailable) * 100 : 0;
    const itcBlocked = NaN;
    return { outputGst, inputGst, netPayable, itcAvailable, itcClaimed, itcGap, itcBlocked };
  }, [invoices, expenses]);



  const statusTone = (status: string) => {
    if (/filed/i.test(status)) return "green" as const;
    if (/pending|overdue/i.test(status)) return "red" as const;
    if (/not due/i.test(status)) return "gray" as const;
    return "amber" as const;
  };

  const [filingOpen, setFilingOpen] = useState<string | null>(null);
  const openDrawer = useOpenDrawer();

  return (
    <div className="space-y-6">
      <GstFilingsSection />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Output GST" value={fmtCompact(m.outputGst)} sub="Collected" />
        <div title="Estimated — categorized by expense type (payroll & rent excluded). Verify against actual GST invoices before filing.">
          <KPI label="Input GST (est.)" value={fmtCompact(m.inputGst)} sub="Estimate · verify vs invoices" />
        </div>

        <KPI label="Net Payable" value={fmtCompact(m.netPayable)} deltaTone="down" delta="Due this period" />
        <KPI label="ITC Gap" value={fmtPct(m.itcGap, 1)} deltaTone={m.itcGap < 5 ? "up" : "down"} delta={m.itcGap < 5 ? "Healthy" : "Reconcile"} />
      </div>

      {/* Filing Status */}
      <IntelCard title="Filing Status">
        <WithData data={filings ?? []} isLoading={isLoading}>
          {(rows) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(23,18,8,0.08)]">
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Type</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Period</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Due</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] font-medium py-2">Amount</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openDrawer("gst_filing", r.id)} className="border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
                    <td className="py-2.5 text-xs font-medium text-fyn-ink">{r.filing_type}</td>
                    <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.period}</td>
                    <td className="py-2.5"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className="py-2.5 text-xs text-[rgba(23,18,8,0.62)]">{r.due_date?.slice(0, 10) ?? "—"}</td>
                    <td className="py-2.5 text-right font-mono text-xs font-semibold text-fyn-ink">{fmtCompact(r.net_payable)}</td>
                    <td className="py-2.5 text-right">
                      {/pending/i.test(r.status) && <button onClick={() => setFilingOpen(r.period)} className="text-[11px] font-medium px-2 py-1 rounded text-white hover:opacity-90" style={{ background: ACCENT.red }}>File Now →</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WithData>
      </IntelCard>

      {/* ITC Recon */}
      <div className="grid lg:grid-cols-2 gap-4">
        <IntelCard title="ITC Reconciliation" sub="Input Tax Credit matching">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Total ITC Available</span><span className="font-mono font-semibold text-fyn-ink">{fmtCompact(m.itcAvailable)}</span></div>
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">ITC Claimed</span><span className="font-mono font-semibold text-fyn-ink">{fmtCompact(m.itcClaimed)}</span></div>
            <div className="flex justify-between"><span className="text-[rgba(23,18,8,0.62)]">Blocked ITC</span><span className="font-mono font-semibold text-fyn-ink">{fmtCompact(m.itcBlocked)}</span></div>
            <div className="pt-2 border-t border-[rgba(23,18,8,0.08)] flex justify-between"><span className="text-fyn-ink font-semibold">Gap</span><Badge tone={m.itcGap < 5 ? "green" : "amber"}>{fmtPct(m.itcGap, 1)}</Badge></div>
          </div>
        </IntelCard>

        <EmptyCard title="Compliance Health" hint="Compliance health metrics will be computed from your GST filing history." />
      </div>

      <EmptyCard title="GSTIN Reconciliation" hint="Vendor GSTIN matching against GSTR-2B will appear once GST filing data is imported." />

      <TdsIntelligenceSection />
      <EwayBillSection />
      <AdvanceTaxSection />
      <HsnMasterSection />
      <TaxPlanningSection />
      <RegulatoryComplianceSection />

      <GstFilingDialog open={!!filingOpen} onOpenChange={(v) => !v && setFilingOpen(null)} period={filingOpen ?? undefined} />
    </div>
  );
}
