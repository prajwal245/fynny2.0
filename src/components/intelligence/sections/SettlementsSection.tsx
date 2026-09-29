import { useMemo } from "react";
import { usePaymentSettlements, useMode } from "../DataSource";
import { IntelCard, KPI, fmtCompact } from "../_primitives";

export default function SettlementsSection() {
  const mode = useMode();
  const { data, isLoading } = usePaymentSettlements();
  const rows = data ?? [];

  const m = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rzpPending = rows.filter(r => r.gateway === "razorpay" && r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    const expectedToday = rows.filter(r => r.expected_date === today).reduce((s, r) => s + Number(r.amount), 0);
    const upiFloat = rows.filter(r => r.gateway === "upi" && r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const next7 = rows
      .filter(r => r.status === "pending" && r.expected_date && r.expected_date >= today && r.expected_date <= in7)
      .reduce((s, r) => s + Number(r.amount), 0);
    return { rzpPending, expectedToday, upiFloat, next7 };
  }, [rows]);

  const liveEmpty = mode === "live" && rows.length === 0 && !isLoading;

  if (liveEmpty) {
    return (
      <IntelCard title="Payment Settlements" sub="Razorpay, UPI & gateway pipeline">
        <p className="text-sm text-[rgba(23,18,8,0.62)] py-4 text-center">Connect Razorpay to see settlement tracking</p>
      </IntelCard>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPI label="Razorpay Pending" count={m.rzpPending} format={fmtCompact} sub="Awaiting settlement" tone="warning" />
      <KPI label="Expected Today" count={m.expectedToday} format={fmtCompact} sub="Hits bank today" />
      <KPI label="UPI Float" count={m.upiFloat} format={fmtCompact} sub="In-transit UPI" />
      <KPI label="Next 7 Days" count={m.next7} format={fmtCompact} sub="Forecast inflow" tone="healthy" />
    </div>
  );
}
