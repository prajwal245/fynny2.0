import { useState } from "react";
import { toast } from "sonner";
import { Badge, Card, V, formatDate, type Tone } from "../ui";
import { useV2 } from "../store";
import { confirmPracticeCheckout, startPracticeCheckout } from "@/lib/practice/practice.functions";
import { PLANS, type Cycle, type PlanKey } from "@/lib/practice/billing/plans";
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

/** Settings → Billing: trial status, plan choice and Razorpay Checkout. */
export function BillingSection() {
  const b = useBilling();
  const { session, firm } = useV2();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [busy, setBusy] = useState<PlanKey | null>(null);

  if (!b) return null;
  const a = b.access;
  const status = STATUS[a.state];
  const isPaid = b.hasSubscription && (b.status === "active" || b.status === "pending" || b.status === "past_due");

  const buy = async (plan: PlanKey) => {
    setBusy(plan);
    try {
      const [co] = await Promise.all([startPracticeCheckout({ data: { plan, cycle } }), loadRazorpay()]);
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

  return (
    <Card style={{ marginBottom: 16 }}>
      <div id="billing" style={{ scrollMarginTop: 90 }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15.5, margin: 0 }}>Billing</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p style={{ fontSize: 13, color: V.muted, margin: "6px 0 16px", lineHeight: 1.6 }} data-testid="billing-summary">
        {a.state === "trial" &&
          `Free trial of Starter until ${formatDate(b.trial_ends_at)}${a.trialDaysLeft != null ? ` (${a.trialDaysLeft <= 1 ? "last day" : `${a.trialDaysLeft} days left`})` : ""}, up to ${a.maxClients} clients. Choose a plan any time; you are charged only from the day you choose.`}
        {a.state === "active" &&
          `${PLANS[b.plan].name}, billed ${b.cycle === "annual" ? "yearly" : "monthly"}${b.current_period_end ? `. Renews ${formatDate(b.current_period_end)}` : ""}${b.status === "cancelled" ? " (cancelled, works until then)" : ""}.`}
        {a.state === "past_due" && "Your last renewal did not go through. Razorpay is retrying; update the payment from the link in Razorpay's email."}
        {a.state === "paused" && a.reason}
      </p>

      {isPaid ? (
        <p style={{ fontSize: 13, margin: 0 }}>
          To change or cancel your plan, email <b>support@fynhelp.com</b> from {firm?.email || "the firm's email"} and we will do it the same day.
        </p>
      ) : (
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
                {c === "monthly" ? "Monthly" : "Yearly, save 15%"}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))" }}>
            {(Object.keys(PLANS) as PlanKey[]).map((k) => {
              const p = PLANS[k];
              const ready = b.available.some((x) => x.plan === k && x.cycle === cycle);
              return (
                <div key={k} style={{ border: "1px solid rgba(42,15,12,.1)", borderRadius: 14, padding: 16, display: "grid", gap: 8, alignContent: "start" }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                    {cycle === "monthly" ? inr(p.monthly) : inr(p.annual)}
                    <span style={{ fontSize: 13, fontWeight: 500, color: V.muted }}>{cycle === "monthly" ? " /month" : " /year"}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: V.muted }}>
                    {p.clientsIncluded} clients included{p.maxClients ? `, up to ${p.maxClients}` : ""}. Unlimited users. Plus GST.
                  </div>
                  <button
                    type="button"
                    className="v2-btn v2-btn-primary"
                    disabled={!ready || busy !== null}
                    onClick={() => void buy(k)}
                    data-testid={`choose-${k}`}
                  >
                    {busy === k ? "Opening Razorpay…" : `Choose ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          {!b.paymentsReady && (
            <p style={{ fontSize: 12.5, color: V.muted, margin: "12px 0 0" }} data-testid="payments-not-ready">
              Online payment is being set up. To start a plan now, email support@fynhelp.com and we will activate it for you.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
