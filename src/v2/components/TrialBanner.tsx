import { Link } from "@tanstack/react-router";
import { V } from "../ui";
import { useBilling } from "../lib/billing";

/** One line above every page: days left in the trial, or why new work is paused. */
export function TrialBanner({ partnerView }: { partnerView: boolean }) {
  const b = useBilling();
  if (!b) return null;
  const a = b.access;
  const action = partnerView ? (
    <Link to="/app/settings" hash="billing" className="v2-btn v2-btn-sm v2-btn-primary" style={{ flexShrink: 0 }}>
      Choose a plan
    </Link>
  ) : (
    <span style={{ fontSize: 12.5, color: V.muted }}>A partner can choose a plan in Settings.</span>
  );
  if (a.state === "paused")
    return (
      <div role="alert" data-testid="billing-paused" style={bar(true)}>
        <span style={{ minWidth: 0 }}>
          <b>New work is paused.</b> {a.reason}
        </span>
        {action}
      </div>
    );
  if (a.state === "past_due")
    return (
      <div role="status" style={bar(true)}>
        <span style={{ minWidth: 0 }}>
          <b>Your last payment did not go through.</b> Razorpay will retry. Update the card or UPI mandate from the link in Razorpay's email to avoid a pause.
        </span>
      </div>
    );
  if (a.state === "trial" && a.trialDaysLeft != null)
    return (
      <div role="status" data-testid="trial-banner" style={bar(a.trialDaysLeft <= 3)}>
        <span style={{ minWidth: 0 }}>
          <b>
            {a.trialDaysLeft <= 1 ? "Last day of your free trial." : `${a.trialDaysLeft} days left in your free trial.`}
          </b>{" "}
          Everything in Starter, up to {a.maxClients} clients. No card needed until you choose a plan.
        </span>
        {action}
      </div>
    );
  return null;
}

const bar = (urgent: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "10px 14px",
  marginBottom: 18,
  borderRadius: 12,
  fontSize: 13,
  lineHeight: 1.5,
  background: urgent ? "#FBE9E6" : V.gray,
  color: urgent ? V.maroon : V.ink,
  border: `1px solid ${urgent ? "rgba(138,30,24,.18)" : "rgba(0,0,0,.05)"}`,
});
