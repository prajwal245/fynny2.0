import { useMemo } from "react";
import { useInvoices, useExpenses, useBankTxns, useCustomers, useMode } from "../DataSource";
import { IntelCard, KPI, fmtCompact, fmtPct, ACCENT, EMPTY } from "../_primitives";

export default function InvestorTab() {
  const mode = useMode();
  const { data: invoices } = useInvoices();
  const { data: expenses } = useExpenses();
  const { data: bank } = useBankTxns();
  const { data: customers } = useCustomers();

  const m = useMemo(() => {
    const inv = invoices ?? [];
    const exp = expenses ?? [];
    const paid = inv.filter((i) => i.status === "paid");
    const totalRevenue = paid.reduce((s, i) => s + Number(i.paid_amount), 0);
    const c30 = new Date(Date.now() - 30 * 86400000);
    const mrr = paid.filter((i) => i.payment_date && new Date(i.payment_date) >= c30).reduce((s, i) => s + Number(i.paid_amount), 0);
    const arr = mrr * 12;
    const burn = exp.filter((e) => new Date(e.date) >= c30).reduce((s, e) => s + Number(e.amount), 0);
    const netBurn = burn - mrr;
    const cash = bank?.[0]?.balance ?? 0;
    const runway = netBurn > 0 && cash > 0 ? cash / netBurn : NaN;
    const burnMultiple = mrr > 0 ? Math.max(0, netBurn) / mrr : NaN;
    const arpa = customers?.length ? totalRevenue / customers.length : NaN;
    const ltv = Number.isFinite(arpa) ? arpa * 24 : NaN;
    const cac = Number.isFinite(arpa) ? arpa * 0.4 : NaN;
    const ltvCac = Number.isFinite(ltv) && Number.isFinite(cac) && cac > 0 ? ltv / cac : NaN;
    return { totalRevenue, mrr, arr, burn, netBurn, cash, runway, burnMultiple, arpa, ltv, cac, ltvCac };
  }, [invoices, expenses, bank, customers]);

  const liveEmpty = mode === "live" && (invoices?.length ?? 0) === 0;
  // Demo-only synthetic figures
  const nrr = mode === "demo" ? 118 : NaN;
  const gm = mode === "demo" ? 72 : NaN;
  const rule40 = mode === "demo" ? 48 : NaN;
  const payback = mode === "demo" ? 11.4 : NaN;

  return (
    <div className="space-y-6">
      <IntelCard title="Investor-Ready KPIs" sub="Board reporting package · Updated today">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="ARR" count={m.arr} format={fmtCompact} isEmpty={liveEmpty && m.arr === 0} delta={mode === "demo" ? "+18% QoQ" : undefined} deltaTone="up" tone={liveEmpty ? "neutral" : "healthy"} />
          <KPI label="MRR" count={m.mrr} format={fmtCompact} isEmpty={liveEmpty && m.mrr === 0} delta={mode === "demo" ? "+8.3% MoM" : undefined} deltaTone="up" tone={liveEmpty ? "neutral" : "healthy"} />
          <KPI label="NRR" value={Number.isFinite(nrr) ? `${nrr}%` : EMPTY} isEmpty={!Number.isFinite(nrr)} deltaTone="up" delta={Number.isFinite(nrr) ? "Healthy" : undefined} tone={Number.isFinite(nrr) ? "healthy" : "neutral"} />
          <KPI label="Gross Margin" value={Number.isFinite(gm) ? `${gm}%` : EMPTY} isEmpty={!Number.isFinite(gm)} deltaTone="up" tone={Number.isFinite(gm) ? "healthy" : "neutral"} />
        </div>
      </IntelCard>

      <div className="grid lg:grid-cols-2 gap-4">
        <IntelCard title="Capital Efficiency">
          <div className="space-y-3 text-sm">
            <Row label="Cash on hand" value={fmtCompact(m.cash)} />
            <Row label="Net Burn" value={`${fmtCompact(m.netBurn)}/mo`} />
            <Row label="Runway" value={Number.isFinite(m.runway) ? `${m.runway.toFixed(1)} months` : EMPTY} />
            <Row label="Burn Multiple" value={Number.isFinite(m.burnMultiple) ? `${m.burnMultiple.toFixed(2)}x` : EMPTY} tone={Number.isFinite(m.burnMultiple) ? (m.burnMultiple < 1.5 ? "up" : "down") : undefined} />
            <Row label="Rule of 40" value={Number.isFinite(rule40) ? String(rule40) : EMPTY} tone={Number.isFinite(rule40) ? "up" : undefined} />
          </div>
        </IntelCard>

        <IntelCard title="Unit Economics">
          <div className="space-y-3 text-sm">
            <Row label="LTV" value={Number.isFinite(m.ltv) ? fmtCompact(m.ltv) : EMPTY} />
            <Row label="CAC" value={Number.isFinite(m.cac) ? fmtCompact(m.cac) : EMPTY} />
            <Row label="LTV : CAC" value={Number.isFinite(m.ltvCac) ? `${m.ltvCac.toFixed(2)}x` : EMPTY} tone={Number.isFinite(m.ltvCac) && m.ltvCac >= 3 ? "up" : undefined} />
            <Row label="Payback Period" value={Number.isFinite(payback) ? `${payback} months` : EMPTY} />
            <Row label="ARPA" value={Number.isFinite(m.arpa) ? fmtCompact(m.arpa) : EMPTY} />
          </div>
        </IntelCard>
      </div>

      {mode === "demo" && (
        <IntelCard title="Board Highlights">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><span style={{ color: ACCENT.green }}>▲</span><span className="text-fyn-ink">MRR up 8.3% MoM, on track for ₹5Cr ARR in 8 months</span></li>
            <li className="flex items-start gap-2"><span style={{ color: ACCENT.green }}>▲</span><span className="text-fyn-ink">NRR 118% — expansion revenue driving 31% of growth</span></li>
            <li className="flex items-start gap-2"><span style={{ color: ACCENT.amber }}>●</span><span className="text-fyn-ink">Customer concentration in top 3 at 32% — diversification needed</span></li>
            {Number.isFinite(m.runway) && <li className="flex items-start gap-2"><span style={{ color: ACCENT.red }}>▼</span><span className="text-fyn-ink">Runway tightening at {m.runway.toFixed(1)} months — plan next raise</span></li>}
          </ul>
        </IntelCard>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[rgba(23,18,8,0.62)]">{label}</span>
      <span className="font-mono font-semibold" style={{ color: tone === "up" ? ACCENT.green : tone === "down" ? ACCENT.red : ACCENT.ink }}>{value}</span>
    </div>
  );
}
