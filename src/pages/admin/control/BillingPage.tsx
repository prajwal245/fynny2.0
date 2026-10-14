import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminLedger, adminLedgerCsv, adminRefund, adminSubscriptions } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { useAdminSession } from "@/components/admin/AdminSessionGate";
import { SUPPORT_REFUND_LIMIT } from "@/lib/admin/rbac";
import { Btn, Empty, ErrorNote, Kpi, PageHead, Panel, Pill, Table, Td, day, inr, inr2, line, muted, when } from "./ui";

const STATE_TONE = { trial: "info", paid: "good", paused: "warn", cancelled: "bad" } as const;

export default function BillingPage() {
  const { can } = useAdminSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"subs" | "ledger">("subs");
  const [days, setDays] = useState(90);
  const [refundFor, setRefundFor] = useState<{ paymentId: string; max: number } | null>(null);
  const subs = useQuery({ queryKey: ["admin", "subs"], queryFn: () => adminCall(() => adminSubscriptions()) });
  const ledger = useQuery({ queryKey: ["admin", "ledger", days], queryFn: () => adminCall(() => adminLedger({ data: { days } })), enabled: tab === "ledger" });

  const exportCsv = async () => {
    try {
      const csv = await adminCall(() => adminLedgerCsv({ data: { days } }));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `fynhelp-ledger-last-${days}-days.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(adminError(e));
    }
  };

  const paid = (subs.data ?? []).filter((s) => s.state === "paid");
  const mrr = paid.reduce((a, s) => a + s.mrr, 0);
  return (
    <div>
      <PageHead title="Billing & Ledger" sub="Subscriptions, every payment and refund through Razorpay, with the GST inside each amount." />
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <Kpi label="Paying firms" value={paid.length} />
        <Kpi label="MRR (incl. GST)" value={inr(mrr)} />
        <Kpi label="GST inside MRR" value={inr((mrr * 18) / 118)} hint="18% included in list prices" />
        <Kpi label="Cancelling at period end" value={(subs.data ?? []).filter((s) => s.status === "cancelling").length} />
      </div>
      <div className="flex gap-2 mb-4" role="tablist">
        <Btn kind={tab === "subs" ? "primary" : "ghost"} onClick={() => setTab("subs")}>Subscriptions</Btn>
        <Btn kind={tab === "ledger" ? "primary" : "ghost"} onClick={() => setTab("ledger")} testId="tab-ledger">Transaction ledger</Btn>
      </div>
      {tab === "subs" && (
        <Panel>
          <ErrorNote error={subs.error} />
          {subs.data?.length === 0 && <Empty>No subscriptions yet.</Empty>}
          {!!subs.data?.length && (
            <Table head={["Firm", "Plan", "State", "MRR", "Renews / trial ends", "Code", "Razorpay"]} testId="subs-table">
              {subs.data.map((s) => (
                <tr key={s.firmId}>
                  <Td><b>{s.firm}</b></Td>
                  <Td>{s.plan} · {s.cycle === "annual" ? "yearly" : "monthly"}</Td>
                  <Td><Pill tone={STATE_TONE[s.state]}>{s.status}</Pill></Td>
                  <Td className="tabular-nums">{s.mrr ? inr(s.mrr) : "—"}</Td>
                  <Td>{s.trialEnds ? `trial to ${day(s.trialEnds)}` : day(s.renews)}</Td>
                  <Td>{s.coupon ?? "—"}</Td>
                  <Td mono>{s.subscriptionId ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}
      {tab === "ledger" && (
        <Panel
          action={
            <div className="flex gap-2 items-center">
              <select className="rounded-lg border px-2 py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last 12 months</option>
              </select>
              {can("billing.export") && <Btn onClick={() => void exportCsv()} testId="ledger-csv">Export CSV</Btn>}
            </div>
          }
          title="Payments and refunds"
        >
          <ErrorNote error={ledger.error} />
          {ledger.data?.length === 0 && <Empty>No payments in this period.</Empty>}
          {!!ledger.data?.length && (
            <Table head={["When", "Firm", "Event", "Payment", "Amount", "GST", "Net", ""]} testId="ledger-table">
              {ledger.data.map((r) => (
                <tr key={r.id}>
                  <Td>{when(r.at)}</Td>
                  <Td>{r.firm}</Td>
                  <Td>{r.event}{r.method ? <div className="text-xs" style={{ color: muted }}>{r.method}</div> : null}</Td>
                  <Td mono>{r.paymentId ?? "—"}{r.refundId ? <div>{r.refundId}</div> : null}</Td>
                  <Td className="tabular-nums">{inr2(r.amount)}</Td>
                  <Td className="tabular-nums">{inr2(r.gst)}</Td>
                  <Td className="tabular-nums">{inr2(r.net)}</Td>
                  <Td>{r.amount > 0 && r.paymentId && can("billing.refund") && <Btn testId={`refund-${r.paymentId}`} onClick={() => setRefundFor({ paymentId: r.paymentId!, max: r.amount })}>Refund</Btn>}</Td>
                </tr>
              ))}
            </Table>
          )}
          {can("billing.refund") && (
            <div className="mt-4 text-sm flex flex-wrap items-center gap-2">
              <span style={{ color: muted }}>Refund a payment not listed here:</span>
              <Btn onClick={() => setRefundFor({ paymentId: "", max: 0 })} testId="refund-other">Refund by payment ID</Btn>
            </div>
          )}
        </Panel>
      )}
      {refundFor && (
        <RefundModal
          initial={refundFor}
          capped={!can("billing.refund.unlimited")}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            void qc.invalidateQueries({ queryKey: ["admin", "ledger"] });
          }}
        />
      )}
    </div>
  );
}

function RefundModal({ initial, capped, onClose, onDone }: { initial: { paymentId: string; max: number }; capped: boolean; onClose: () => void; onDone: () => void }) {
  const [paymentId, setPaymentId] = useState(initial.paymentId);
  const [full, setFull] = useState(!capped);
  const [amount, setAmount] = useState(capped ? Math.min(initial.max || SUPPORT_REFUND_LIMIT, SUPPORT_REFUND_LIMIT) : initial.max);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await adminCall(() => adminRefund({ data: { paymentId: paymentId.trim(), amount: full ? null : amount, reason } }));
      toast.success(`Refund ${r.refundId} started for ${inr2(r.amount)}. Razorpay credits it in 5 to 7 business days.`);
      onDone();
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Refund">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 grid gap-3 text-sm" data-testid="refund-modal">
        <h2 className="text-lg font-semibold">Refund a payment</h2>
        <label className="grid gap-1">Razorpay payment ID
          <input className="rounded-lg border px-3 py-2 font-mono" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="pay_…" data-testid="refund-payment" />
        </label>
        {!capped && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Refund everything not yet refunded</label>
        )}
        {!full && (
          <label className="grid gap-1">Amount (₹, GST included)
            <input type="number" min={1} step="0.01" className="rounded-lg border px-3 py-2" value={amount} onChange={(e) => setAmount(Number(e.target.value))} data-testid="refund-amount" />
          </label>
        )}
        {capped && <p className="rounded-lg px-3 py-2" style={{ background: "rgba(23,18,8,.05)" }}>Support can refund up to {inr(SUPPORT_REFUND_LIMIT)} per payment. For more, ask Finance.</p>}
        <label className="grid gap-1">Reason (goes on the refund and the audit log)
          <textarea className="rounded-lg border px-3 py-2" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="refund-reason" />
        </label>
        <p className="text-xs" style={{ color: muted }}>Issue a GST credit note against the original invoice for every refund (Refund Policy, clause 9).</p>
        <div className="flex justify-end gap-2" style={{ borderTop: `1px solid ${line}`, paddingTop: 12 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={busy || reason.trim().length < 3 || !paymentId.trim()} onClick={() => void submit()} testId="refund-submit">{busy ? "Refunding…" : "Refund"}</Btn>
        </div>
      </div>
    </div>
  );
}
