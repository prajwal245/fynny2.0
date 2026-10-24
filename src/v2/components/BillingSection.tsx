import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Card, Modal, V, formatDate, type Tone } from "../ui";
import { useV2 } from "../store";
import { cancelPracticePlan, changePracticePlan, confirmPracticeCheckout, getPracticePayments, previewPracticeCoupon, redeemPracticeTrialCode, setPracticeLifecycleEmails, startPracticeCheckout } from "@/lib/practice/practice.functions";
import { monthName } from "@/lib/practice/billing/arrears";
import {
  PLANS,
  TRIAL_DAYS,
  TRIAL_MAX_ACTIVE_CLIENTS,
  TRIAL_MAX_DOCUMENTS,
  changeTiming,
  documentAllowance,
  validGstin,
  type Cycle,
  type PlanKey,
} from "@/lib/practice/billing/plans";
import { loadRazorpay, refreshBilling, setBilling, useBilling } from "../lib/billing";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

const STATUS: Record<string, { label: string; tone: Tone }> = {
  trial: { label: "Free trial", tone: "info" },
  active: { label: "Active", tone: "good" },
  past_due: { label: "Payment retrying", tone: "warn" },
  paused: { label: "Paused", tone: "bad" },
};

type RzpResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RzpCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: (r: { error?: { description?: string } }) => void) => void };

/** Settings → Billing: trial status, plan choice, Razorpay Checkout, and changing or cancelling a plan. */
export function BillingSection() {
  const b = useBilling();
  const { session } = useV2();
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [busy, setBusy] = useState<PlanKey | "cancel" | null>(null);
  const [billingName, setBillingName] = useState("");
  const [gstin, setGstin] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; description: string } | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof getPracticePayments>> | null>(null);

  const hasPlan = !!b && b.hasSubscription && (b.status === "active" || b.status === "pending" || b.status === "past_due");
  useEffect(() => {
    if (!b?.hasSubscription) return;
    let live = true;
    getPracticePayments().then((p) => live && setPayments(p)).catch(() => live && setPayments([]));
    return () => { live = false; };
  }, [b?.hasSubscription, b?.plan, b?.cycle, b?.status]);
  useEffect(() => {
    if (b?.billingName && !billingName) setBillingName(b.billingName);
    if (b?.billingGstin && !gstin) setGstin(b.billingGstin);
    if (hasPlan && b) setCycle(b.cycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.billingName, b?.billingGstin, hasPlan]);

  if (!b) return null;
  const a = b.access;
  const status = b.cancelAtPeriodEnd ? { label: "Cancelled", tone: "warn" as Tone } : STATUS[a.state];
  const gstinBad = gstin.trim() !== "" && !validGstin(gstin);

  const buy = async (plan: PlanKey) => {
    if (gstinBad) { toast.error("Check the GSTIN, or leave it blank."); return; }
    setBusy(plan);
    try {
      const [co] = await Promise.all([startPracticeCheckout({ data: { plan, cycle, billingName: billingName.trim() || null, gstin: gstin.trim() || null, coupon: applied?.code ?? null } }), loadRazorpay()]);
      const Razorpay = (window as unknown as { Razorpay: RzpCtor }).Razorpay;
      const rzp = new Razorpay({
        key: co.keyId,
        subscription_id: co.subscriptionId,
        name: "FynHelp",
        description: co.planName,
        prefill: { email: session?.email ?? "", name: session?.name ?? "" },
        notes: { firm: co.firmName },
        theme: { color: "#8A1E18" },
        modal: { ondismiss: () => setBusy(null) },
        handler: async (r: RzpResponse) => {
          try {
            setBilling(await confirmPracticeCheckout({ data: r }));
            toast.success("Plan active. Thank you.");
          } catch (e) {
            toast.error(errMsg(e));
            void refreshBilling();
          } finally {
            setBusy(null);
          }
        },
      });
      rzp.on("payment.failed", (r) => {
        toast.error(r.error?.description ?? "The payment did not go through. Try again or use another method.");
        setBusy(null);
      });
      rzp.open();
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(null);
    }
  };

  const applyCode = async () => {
    if (code.trim().length < 3) return;
    setCodeBusy(true);
    try {
      const c = await previewPracticeCoupon({ data: { code: code.trim() } });
      if (c.kind === "trial_days") {
        setBilling(await redeemPracticeTrialCode({ data: { code: c.code } }));
        toast.success(`Code applied: ${c.description}.`);
        setCode("");
      } else {
        setApplied({ code: c.code, description: c.description });
        toast.success(`${c.code}: ${c.description} on the plan you choose.`);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCodeBusy(false);
    }
  };

  const change = async (plan: PlanKey) => {
    setBusy(plan);
    try {
      const r = await changePracticePlan({ data: { plan, cycle } });
      setBilling(r.view);
      toast.success(r.timing === "now" ? `Switched to ${PLANS[plan].name}. Only the pro-rated difference is charged.` : `${PLANS[plan].name} starts from your next renewal.`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const r = await cancelPracticePlan({ data: { reason } });
      setBilling(r.view);
      setCancelOpen(false);
      toast.success(r.refunded ? "Plan cancelled. Your payment is being refunded in full." : "Plan cancelled. It will not renew.");
    } catch (e) {
      toast.error(errMsg(e));
      void refreshBilling();
    } finally {
      setBusy(null);
    }
  };

  const price = (k: PlanKey) => (cycle === "monthly" ? inr(PLANS[k].monthly) : inr(PLANS[k].annual));
  const current = hasPlan ? { plan: b.plan, cycle: b.cycle } : null;

  return (
    <Card style={{ marginBottom: 16 }}>
      <div id="billing" style={{ scrollMarginTop: 90 }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15.5, margin: 0 }}>Billing</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p style={{ fontSize: 13, color: V.muted, margin: "6px 0 16px", lineHeight: 1.6 }} data-testid="billing-summary">
        {a.state === "trial" &&
          (a.trialNotStarted
            ? `Your ${TRIAL_DAYS}-day free trial starts with your first upload. It covers up to ${TRIAL_MAX_ACTIVE_CLIENTS} active clients and ${TRIAL_MAX_DOCUMENTS} documents, with every Firm feature except the WhatsApp Chaser. No card needed.`
            : `Free trial until ${formatDate(b.trial_ends_at)}${a.trialDaysLeft != null ? ` (${a.trialDaysLeft <= 1 ? "last day" : `${a.trialDaysLeft} days left`})` : ""}. Choose a plan any time; you are charged only from the day you choose.`)}
        {a.state === "active" &&
          (b.cancelAtPeriodEnd || b.status === "cancelled"
            ? `${PLANS[b.plan].name}, billed ${b.cycle === "annual" ? "yearly" : "monthly"}. Cancelled: full access until ${formatDate(b.current_period_end ?? "")}, then it stops. You will not be charged again.`
            : `${PLANS[b.plan].name}, billed ${b.cycle === "annual" ? "yearly" : "monthly"}${b.current_period_end ? `. Renews ${formatDate(b.current_period_end ?? "")}` : ""}.`)}
        {a.state === "past_due" && "Your last renewal did not go through. Razorpay is retrying; update the payment from the link in Razorpay's email."}
        {a.state === "paused" && a.reason}
      </p>
      {b.scheduled && !b.cancelAtPeriodEnd && (
        <p style={{ fontSize: 13, margin: "-6px 0 14px", color: V.ink }} data-testid="billing-scheduled">
          Switches to {PLANS[b.scheduled.plan].name}, billed {b.scheduled.cycle === "annual" ? "yearly" : "monthly"}, from {formatDate(b.current_period_end ?? "")}.
        </p>
      )}

      <UsageMeter b={b} />

      {!(hasPlan && b.cancelAtPeriodEnd) && (
        <>
          <div role="group" aria-label="Billing period" style={{ display: "inline-flex", gap: 4, background: V.gray, padding: 4, borderRadius: 999, marginBottom: 14 }}>
            {(["monthly", "annual"] as Cycle[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                className={`v2-btn v2-btn-sm ${cycle === c ? "v2-btn-primary" : "v2-btn-ghost"}`}
                onClick={() => setCycle(c)}
              >
                {c === "monthly" ? "Monthly" : "Yearly, 2 months free"}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))" }}>
            {(Object.keys(PLANS) as PlanKey[]).map((k) => {
              const p = PLANS[k];
              const ready = b.available.some((x) => x.plan === k && x.cycle === cycle);
              const timing = current ? changeTiming(current, { plan: k, cycle }) : null;
              return (
                <div key={k} style={{ border: `1px solid ${timing === "same" ? V.maroon : "rgba(42,15,12,.1)"}`, borderRadius: 14, padding: 16, display: "grid", gap: 8, alignContent: "start" }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: V.muted, marginTop: -4 }}>{p.recommendedFor}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                    {price(k)}
                    <span style={{ fontSize: 13, fontWeight: 500, color: V.muted }}>{cycle === "monthly" ? " /month" : " /year"} + GST</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: V.muted }}>
                    {p.clientsIncluded} active clients included, then {inr(p.extraClient)} each{p.maxActiveClients ? `, up to ${p.maxActiveClients} in total` : ""}. {p.docsPerClient} documents per active client. Unlimited users. Prices exclude 18% GST.
                  </div>
                  {timing === "same" ? (
                    <div style={{ fontSize: 13, fontWeight: 600, color: V.maroon, padding: "8px 0" }}>Your plan</div>
                  ) : current ? (
                    <button type="button" className="v2-btn v2-btn-ghost" disabled={!ready || busy !== null} onClick={() => void change(k)} data-testid={`switch-${k}`}>
                      {busy === k ? "Switching…" : timing === "now" ? `Upgrade to ${p.name}` : `Switch at renewal`}
                    </button>
                  ) : (
                    <button type="button" className="v2-btn v2-btn-primary" disabled={!ready || busy !== null || gstinBad} onClick={() => void buy(k)} data-testid={`choose-${k}`}>
                      {busy === k ? "Opening Razorpay…" : `Choose ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!current && (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", marginTop: 14 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
                Name on the invoice
                <input className="v2-input" value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="Firm's registered name" maxLength={120} data-testid="billing-name" />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
                GSTIN (optional, to claim input tax credit)
                <input className="v2-input" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" maxLength={15} aria-invalid={gstinBad} data-testid="billing-gstin" />
                {gstinBad && <span style={{ color: V.maroon }}>15 characters, like 29ABCDE1234F1Z5.</span>}
              </label>
            </div>
          )}
          {!current && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12, fontSize: 13 }} data-testid="coupon-box">
              <span style={{ color: V.muted }}>Have a code?</span>
              <input className="v2-input" style={{ width: 160, textTransform: "uppercase" }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={32} data-testid="coupon-input" />
              <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" disabled={codeBusy || code.trim().length < 3} onClick={() => void applyCode()} data-testid="coupon-apply">
                {codeBusy ? "Checking…" : "Apply"}
              </button>
              {applied && (
                <span style={{ color: V.ink }} data-testid="coupon-applied">
                  {applied.code}: {applied.description}.{" "}
                  <button type="button" className="v2-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }} onClick={() => setApplied(null)}>Remove</button>
                </span>
              )}
            </div>
          )}
          {current && (
            <p style={{ fontSize: 12.5, color: V.muted, margin: "12px 0 0" }}>
              Upgrades start now and Razorpay charges only the pro-rated difference. A lower plan, or switching between monthly and yearly, starts from your next renewal.
            </p>
          )}
          {!b.paymentsReady && (
            <p style={{ fontSize: 12.5, color: V.muted, margin: "12px 0 0" }} data-testid="payments-not-ready">
              Online payment is being set up. To start a plan now, email support@fynhelp.com and we will activate it for you.
            </p>
          )}
        </>
      )}

      {payments && payments.length > 0 && (
        <div style={{ marginTop: 18 }} data-testid="payment-history">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Payments</div>
          <table className="v2-table" style={{ fontSize: 13 }}>
            <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Invoice</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.date ? formatDate(p.date) : "—"}</td>
                  <td className="num">{inr(p.amount)}</td>
                  <td style={{ textTransform: "capitalize" }}>{p.status.replace(/_/g, " ")}</td>
                  <td>{p.url ? <a className="v2-link" href={p.url} target="_blank" rel="noreferrer">View</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UsageCharges b={b} />
      <EmailPrefs b={b} />

      <p style={{ fontSize: 12, color: V.muted, margin: "16px 0 0", lineHeight: 1.6 }}>
        Prices are before GST; 18% GST is added at checkout. Payments are processed by Razorpay; FynHelp never sees your card or UPI details. By choosing a plan you agree to the{" "}
        <a className="v2-link" href="/terms" target="_blank" rel="noreferrer">Terms</a> and the{" "}
        <a className="v2-link" href="/refund-policy" target="_blank" rel="noreferrer">Refund and Cancellation Policy</a>.
        {hasPlan && !b.cancelAtPeriodEnd && (
          <>
            {" "}
            <button type="button" className="v2-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: V.maroon }} onClick={() => setCancelOpen(true)} data-testid="cancel-plan">
              Cancel subscription
            </button>
          </>
        )}
      </p>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel subscription">
        <div style={{ display: "grid", gap: 12, fontSize: 14, lineHeight: 1.6 }} data-testid="cancel-modal">
          {b.refundUntil ? (
            <p style={{ margin: 0 }}>
              You are within 30 days of your first yearly payment, so the plan stops <b>now</b> and the payment is <b>refunded in full</b> to the card or account you paid from. Banks usually credit it in 5 to 7 business days.
            </p>
          ) : b.status === "pending" ? (
            <p style={{ margin: 0 }}>The plan has not been charged yet, so it stops now and nothing is taken.</p>
          ) : (
            <p style={{ margin: 0 }}>
              You keep full access until <b>{formatDate(b.current_period_end ?? "")}</b>. The plan will not renew and you will not be charged again. Fees already paid are not refunded.
            </p>
          )}
          <p style={{ margin: 0, color: V.muted, fontSize: 13 }}>Your data stays available to view and export for 30 days after the plan ends.</p>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: V.muted }}>
            Why are you cancelling? (optional)
            <textarea className="v2-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="v2-btn v2-btn-ghost" onClick={() => setCancelOpen(false)}>Keep my plan</button>
            <button type="button" className="v2-btn v2-btn-primary" disabled={busy === "cancel"} onClick={() => void cancel()} data-testid="confirm-cancel">
              {busy === "cancel" ? "Cancelling…" : b.refundUntil ? "Cancel and refund" : "Cancel subscription"}
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}


type BillingData = NonNullable<ReturnType<typeof useBilling>>;

/** This month's active clients and documents against the trial limits or the plan's allowance. */
function UsageMeter({ b }: { b: BillingData }) {
  const a = b.access;
  const trial = a.state === "trial";
  const u = b.usage;
  const plan = PLANS[b.plan];
  const clientLimit = trial ? TRIAL_MAX_ACTIVE_CLIENTS : (plan.maxActiveClients ?? null);
  const docLimit = trial ? TRIAL_MAX_DOCUMENTS : documentAllowance(b.plan, u.activeClients);
  const monthLabel = new Date(`${u.month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const bar = (used: number, limit: number | null, label: string, note: string, testId: string) => {
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const tone = limit && used >= limit ? V.maroon : limit && used >= limit * 0.8 ? "#B45309" : "#1F6B45";
    return (
      <div style={{ display: "grid", gap: 6 }} data-testid={testId}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>{label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {used.toLocaleString("en-IN")}
            {limit != null ? ` / ${limit.toLocaleString("en-IN")}` : ""}
          </span>
        </div>
        {limit != null && (
          <div style={{ height: 6, borderRadius: 6, background: "rgba(23,18,8,.08)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: tone, borderRadius: 6, transition: "width .6s cubic-bezier(.16,1,.3,1)" }} />
          </div>
        )}
        <div style={{ fontSize: 12, color: V.muted }}>{note}</div>
      </div>
    );
  };
  return (
    <div style={{ background: V.gray, borderRadius: 14, padding: "14px 16px", margin: "0 0 16px", display: "grid", gap: 14 }} data-testid="usage-meter">
      <div style={{ fontSize: 12, fontWeight: 650, textTransform: "uppercase", letterSpacing: ".08em", color: V.muted }}>{monthLabel} so far</div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))" }}>
        {bar(
          u.activeClients,
          trial ? clientLimit : plan.clientsIncluded,
          "Active clients",
          trial
            ? `The trial covers ${TRIAL_MAX_ACTIVE_CLIENTS}. A client is active once a document is read or a reconciliation runs for them this month.`
            : `${plan.clientsIncluded} included, then ${inr(plan.extraClient)} each${clientLimit ? ` (up to ${clientLimit})` : ""}. Clients you don't work on this month are free.`,
          "usage-clients",
        )}
        {bar(
          u.documents,
          docLimit,
          "Documents",
          trial
            ? `The trial covers ${TRIAL_MAX_DOCUMENTS} documents.`
            : `${plan.docsPerClient} per active client, pooled. Past it, ₹499 per 250 documents on the next invoice; work is never blocked.`,
          "usage-documents",
        )}
      </div>
      {!trial && (
        <div style={{ fontSize: 13 }} data-testid="usage-bill">
          This month comes to <b>{inr(b.bill.subtotal)}</b> + {inr(b.bill.gst)} GST
          {b.bill.extraClients > 0 && ` (includes ${b.bill.extraClients} extra active client${b.bill.extraClients === 1 ? "" : "s"})`}
          {b.bill.overageAmount > 0 && ` and ${inr(b.bill.overageAmount)} document overage`}.
        </div>
      )}
      {b.warning && (
        <div role="status" style={{ fontSize: 13, color: b.warning.level === "100" ? V.maroon : "#92400E" }} data-testid="usage-warning">
          {b.warning.level === "100"
            ? `You have used your ${b.warning.limit.toLocaleString("en-IN")} documents for this month. Uploads carry on; extra documents are billed at ₹499 per 250.`
            : `You have used 80% of this month's ${b.warning.limit.toLocaleString("en-IN")} documents.`}
        </div>
      )}
    </div>
  );
}

const CHARGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Inside plan", tone: "neutral" },
  pending: { label: "Being billed", tone: "info" },
  billed: { label: "Billed", tone: "info" },
  paid: { label: "Paid", tone: "good" },
  failed: { label: "Retrying", tone: "warn" },
  waived: { label: "Waived", tone: "neutral" },
};

/** Extras billed for past months: extra active clients and document overage. */
function UsageCharges({ b }: { b: NonNullable<ReturnType<typeof useBilling>> }) {
  if (!b.usageCharges?.length) return null;
  return (
    <div style={{ marginTop: 18 }} data-testid="usage-charges">
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Monthly usage</div>
      <p style={{ fontSize: 12, color: V.muted, margin: "0 0 8px", lineHeight: 1.6 }}>
        Extra active clients and documents over the allowance are billed after each month ends: monthly plans with the next payment, yearly plans by a Razorpay invoice.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="v2-table" style={{ fontSize: 13, minWidth: 460 }}>
          <thead>
            <tr><th>Month</th><th>Active clients</th><th>Documents</th><th>Extras</th><th>Status</th></tr>
          </thead>
          <tbody>
            {b.usageCharges.map((c) => {
              const st = CHARGE_STATUS[c.status] ?? { label: c.status, tone: "neutral" as Tone };
              return (
                <tr key={c.month}>
                  <td>{monthName(c.month)}</td>
                  <td className="num">{c.activeClients}</td>
                  <td className="num">{c.documents.toLocaleString("en-IN")}</td>
                  <td className="num">
                    {c.total > 0 ? (
                      <span title={`${inr(c.subtotal)} + GST`}>
                        {inr(c.total)}
                        <span style={{ color: V.muted }}> incl. GST</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {c.status === "billed" && c.method === "invoice" && c.payUrl && (
                      <>
                        {" "}
                        <a className="v2-link" href={c.payUrl} target="_blank" rel="noreferrer">Pay</a>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Trial reminders, usage summaries and tips by email. Billing emails always go. */
function EmailPrefs({ b }: { b: NonNullable<ReturnType<typeof useBilling>> }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setPracticeLifecycleEmails({ data: { on } });
      setBilling({ ...b, lifecycleEmails: on });
      toast.success(on ? "Tips and reminders are on." : "Tips and reminders are off. Billing emails still come.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, fontSize: 13, lineHeight: 1.5, cursor: busy ? "wait" : "pointer" }}>
      <input type="checkbox" checked={b.lifecycleEmails} disabled={busy} onChange={(e) => void toggle(e.target.checked)} data-testid="lifecycle-emails" style={{ marginTop: 3 }} />
      <span>
        <b>Email the firm tips, trial reminders and monthly usage summaries</b>
        <br />
        <span style={{ color: V.muted }}>Sent to the firm's email, at most one a day. Emails about charges and renewals always go.</span>
      </span>
    </label>
  );
}
