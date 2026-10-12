/**
 * Plans, the 14-day trial, and what a firm may do in each billing state.
 * Pure functions: the server enforces them, the app shows them, tests pin them.
 */

export type PlanKey = "starter" | "professional" | "scale";
export type Cycle = "monthly" | "annual";
export type BillingStatus =
  | "trialing" // free trial of Starter
  | "pending" // card or UPI mandate set up, first charge not yet taken
  | "active"
  | "past_due" // a renewal charge failed; Razorpay is retrying
  | "halted" // Razorpay gave up retrying
  | "cancelled"; // stops at the end of the paid period

export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanKey = "starter";
/** How many client entities a firm may add during the trial. */
export const TRIAL_MAX_CLIENTS = 15;

export interface Plan {
  key: PlanKey;
  name: string;
  /** Rupees per month, billed monthly. */
  monthly: number;
  /** Rupees per year, billed yearly (15% off). */
  annual: number;
  clientsIncluded: number;
  /** Hard cap on client entities; null means no cap. */
  maxClients: number | null;
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: { key: "starter", name: "Starter", monthly: 2999, annual: 30590, clientsIncluded: 15, maxClients: 25 },
  professional: { key: "professional", name: "Professional", monthly: 5999, annual: 61190, clientsIncluded: 40, maxClients: null },
  scale: { key: "scale", name: "Scale", monthly: 12999, annual: 132590, clientsIncluded: 100, maxClients: null },
};

export interface BillingRow {
  plan: PlanKey;
  cycle: Cycle;
  status: BillingStatus;
  trial_ends_at: string;
  current_period_end: string | null;
}

export type AccessState = "trial" | "active" | "past_due" | "paused";

export interface Access {
  state: AccessState;
  /** New uploads, recon runs, new MIS and new chases are allowed. */
  canWork: boolean;
  /** Days left in the trial, counting a part day as one (1 = the last 24 hours); null outside the trial. */
  trialDaysLeft: number | null;
  maxClients: number | null;
  /** Why work is paused, written for the person who sees it. */
  reason: string | null;
}

const DAY = 86_400_000;

export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY);
}

export const PAUSED_MESSAGE =
  "Your free trial has ended. A partner can choose a plan in Settings, Billing to keep working. Your data is safe and can still be viewed and exported.";
const HALTED_MESSAGE =
  "Your plan's payment did not go through after several tries, so new work is paused. A partner can update the payment in Settings, Billing. Your data is safe.";
const ENDED_MESSAGE =
  "Your plan has ended. A partner can choose a plan in Settings, Billing to keep working. Your data is safe and can still be viewed and exported.";

export function accessFor(b: BillingRow, now: Date = new Date()): Access {
  const plan = PLANS[b.plan] ?? PLANS.starter;
  const periodLeft = b.current_period_end ? new Date(b.current_period_end).getTime() > now.getTime() : false;
  switch (b.status) {
    case "active":
    case "pending":
      return { state: "active", canWork: true, trialDaysLeft: null, maxClients: plan.maxClients, reason: null };
    case "past_due":
      return { state: "past_due", canWork: true, trialDaysLeft: null, maxClients: plan.maxClients, reason: null };
    case "cancelled":
      return periodLeft
        ? { state: "active", canWork: true, trialDaysLeft: null, maxClients: plan.maxClients, reason: null }
        : { state: "paused", canWork: false, trialDaysLeft: null, maxClients: plan.maxClients, reason: ENDED_MESSAGE };
    case "halted":
      return { state: "paused", canWork: false, trialDaysLeft: null, maxClients: plan.maxClients, reason: HALTED_MESSAGE };
    case "trialing":
    default: {
      const left = new Date(b.trial_ends_at).getTime() - now.getTime();
      if (left > 0)
        return {
          state: "trial",
          canWork: true,
          trialDaysLeft: Math.max(1, Math.ceil(left / DAY)),
          maxClients: TRIAL_MAX_CLIENTS,
          reason: null,
        };
      return { state: "paused", canWork: false, trialDaysLeft: null, maxClients: TRIAL_MAX_CLIENTS, reason: PAUSED_MESSAGE };
    }
  }
}

/** Razorpay subscription status → ours. */
export function statusFromRazorpay(s: string): BillingStatus | null {
  switch (s) {
    case "authenticated":
      return "pending";
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "halted":
    case "paused":
      return "halted";
    case "cancelled":
    case "completed":
    case "expired":
      return "cancelled";
    default:
      return null; // "created": checkout not finished yet
  }
}

export function planEnvKey(plan: PlanKey, cycle: Cycle): string {
  return `RAZORPAY_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
}

/** What one billing period of a plan costs, in paise, with GST added on top when a rate is given. */
export function planAmountPaise(plan: PlanKey, cycle: Cycle, gstPercent = 0): number {
  const rupees = cycle === "annual" ? PLANS[plan].annual : PLANS[plan].monthly;
  const gst = Number.isFinite(gstPercent) && gstPercent > 0 ? gstPercent : 0;
  return Math.round(rupees * 100 * (1 + gst / 100));
}
