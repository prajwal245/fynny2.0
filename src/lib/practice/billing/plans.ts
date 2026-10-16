/**
 * Plans, the trial, and what a firm may do in each billing state (pricing of
 * 16 Oct 2026). Pure functions: the server enforces them, the app and the
 * pricing page show them, tests pin them.
 *
 * Internal keys stay starter / professional / scale so existing records and
 * coupons keep working; people see Essential / Firm / Scale.
 */

export type PlanKey = "starter" | "professional" | "scale";
export type Cycle = "monthly" | "annual";
export type BillingStatus =
  | "trialing"
  | "pending" // card or UPI mandate set up, first charge not yet taken
  | "active"
  | "past_due" // a renewal charge failed; Razorpay is retrying
  | "halted" // Razorpay gave up retrying
  | "cancelled"; // stops at the end of the paid period

/** All list prices exclude GST; 18% is added on every invoice. */
export const GST_PERCENT = 18;

export interface Plan {
  key: PlanKey;
  name: string;
  recommendedFor: string;
  /** Rupees per month, billed monthly, before GST. */
  monthly: number;
  /** Rupees per year, billed yearly, before GST (two months free). */
  annual: number;
  /** Active clients covered by the base price. */
  clientsIncluded: number;
  /** Rupees for each active client above the included ones, per month. */
  extraClient: number;
  /** Most active clients the plan takes in a month; null means no cap. */
  maxActiveClients: number | null;
  /** Documents allowed per active client, pooled across the firm. */
  docsPerClient: number;
  whatsappChaser: boolean;
  /** Shared MIS links carry the firm's name instead of "Prepared with FynHelp". */
  firmBranding: boolean;
  support: string;
  onboarding: string;
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Essential",
    recommendedFor: "Solo CAs, up to 25 clients",
    monthly: 1999,
    annual: 19990,
    clientsIncluded: 10,
    extraClient: 149,
    maxActiveClients: 25,
    docsPerClient: 40,
    whatsappChaser: false,
    firmBranding: false,
    support: "WhatsApp and email, next business day",
    onboarding: "Self-serve guides and a weekly live group session",
  },
  professional: {
    key: "professional",
    name: "Firm",
    recommendedFor: "Firms with a team, 25 to 80 clients",
    monthly: 4499,
    annual: 44990,
    clientsIncluded: 30,
    extraClient: 119,
    maxActiveClients: null,
    docsPerClient: 50,
    whatsappChaser: true,
    firmBranding: true,
    support: "WhatsApp and email, same business day",
    onboarding: "Group session plus help importing clients",
  },
  scale: {
    key: "scale",
    name: "Scale",
    recommendedFor: "Multi-partner firms, 80+ clients",
    monthly: 9999,
    annual: 99990,
    clientsIncluded: 75,
    extraClient: 99,
    maxActiveClients: null,
    docsPerClient: 60,
    whatsappChaser: true,
    firmBranding: true,
    support: "Priority WhatsApp and a named contact",
    onboarding: "Assisted import of up to 100 clients and a quarterly review",
  },
};

export const PLAN_ORDER: PlanKey[] = ["starter", "professional", "scale"];

/** ₹499 for every 250 documents (or part) above the pooled allowance. */
export const OVERAGE_BLOCK_DOCS = 250;
export const OVERAGE_BLOCK_PRICE = 499;

/* ── trial ─────────────────────────────────────────────────── */

export const TRIAL_DAYS = 14;
/** The trial grows to this once the firm has run a reconciliation and made an MIS. */
export const TRIAL_ACTIVATED_DAYS = 30;
/** Trials get every Firm feature except the WhatsApp Chaser. */
export const TRIAL_PLAN: PlanKey = "professional";
export const TRIAL_MAX_ACTIVE_CLIENTS = 5;
export const TRIAL_MAX_DOCUMENTS = 200;
/** After the trial the firm can read and export its data for this long. */
export const READ_ONLY_DAYS = 30;

export interface BillingRow {
  plan: PlanKey;
  cycle: Cycle;
  status: BillingStatus;
  trial_ends_at: string;
  current_period_end: string | null;
  /** First upload; the trial clock runs from here. Null: not started yet. */
  trial_started_at?: string | null;
  /** First reconciliation and first MIS done: the trial is 30 days. */
  activated_at?: string | null;
}

export type AccessState = "trial" | "active" | "past_due" | "paused";

export interface Access {
  state: AccessState;
  /** New uploads, recon runs, new MIS and new chases are allowed. */
  canWork: boolean;
  /** The trial has not started: it begins at the first upload. */
  trialNotStarted: boolean;
  /** Days left in the trial, counting a part day as one; null outside a running trial. */
  trialDaysLeft: number | null;
  /** The plan whose features apply now (Firm during the trial). */
  features: PlanKey;
  /** Active clients this month, at most; null means no cap. */
  maxActiveClients: number | null;
  /** Documents this month during the trial; null outside it (paid plans have a soft allowance). */
  maxDocuments: number | null;
  whatsappChaser: boolean;
  /** Why work is paused, written for the person who sees it. */
  reason: string | null;
}

const DAY = 86_400_000;

export function trialEndFrom(start: Date, activated = false): Date {
  return new Date(start.getTime() + (activated ? TRIAL_ACTIVATED_DAYS : TRIAL_DAYS) * DAY);
}

export const PAUSED_MESSAGE =
  "Your free trial has ended. A partner can choose a plan in Settings, Billing to keep working. Your data stays readable and exportable for 30 days.";
const HALTED_MESSAGE =
  "Your plan's payment did not go through after several tries, so new work is paused. A partner can update the payment in Settings, Billing. Your data is safe.";
const ENDED_MESSAGE =
  "Your plan has ended. A partner can choose a plan in Settings, Billing to keep working. Your data is safe and can still be viewed and exported.";

export function accessFor(b: BillingRow, now: Date = new Date()): Access {
  const plan = PLANS[b.plan] ?? PLANS.starter;
  const paid = (canWork: boolean, state: AccessState, reason: string | null): Access => ({
    state,
    canWork,
    trialNotStarted: false,
    trialDaysLeft: null,
    features: plan.key,
    maxActiveClients: plan.maxActiveClients,
    maxDocuments: null,
    whatsappChaser: plan.whatsappChaser,
    reason,
  });
  const periodLeft = b.current_period_end ? new Date(b.current_period_end).getTime() > now.getTime() : false;
  switch (b.status) {
    case "active":
    case "pending":
      return paid(true, "active", null);
    case "past_due":
      return paid(true, "past_due", null);
    case "cancelled":
      return periodLeft ? paid(true, "active", null) : paid(false, "paused", ENDED_MESSAGE);
    case "halted":
      return paid(false, "paused", HALTED_MESSAGE);
    case "trialing":
    default: {
      const trial = (canWork: boolean, daysLeft: number | null, notStarted: boolean, reason: string | null): Access => ({
        state: canWork ? "trial" : "paused",
        canWork,
        trialNotStarted: notStarted,
        trialDaysLeft: daysLeft,
        features: TRIAL_PLAN,
        maxActiveClients: TRIAL_MAX_ACTIVE_CLIENTS,
        maxDocuments: TRIAL_MAX_DOCUMENTS,
        whatsappChaser: false,
        reason,
      });
      if (b.trial_started_at === null) return trial(true, null, true, null);
      const left = new Date(b.trial_ends_at).getTime() - now.getTime();
      if (left > 0) return trial(true, Math.max(1, Math.ceil(left / DAY)), false, null);
      return trial(false, null, false, PAUSED_MESSAGE);
    }
  }
}

/* ── usage and the monthly bill ────────────────────────────── */

export interface Usage {
  activeClients: number;
  documents: number;
}

/** Pooled documents allowed this month: per-client allowance × active clients (never fewer than the included clients). */
export function documentAllowance(plan: PlanKey, activeClients: number): number {
  const p = PLANS[plan];
  return p.docsPerClient * Math.max(activeClients, p.clientsIncluded);
}

export interface BillBreakdown {
  base: number;
  extraClients: number;
  extraClientsAmount: number;
  overageBlocks: number;
  overageAmount: number;
  /** Before GST. */
  subtotal: number;
  gst: number;
  total: number;
}

/**
 * One month's bill: base price (the monthly share for annual plans) + each
 * active client above the included ones + ₹499 per 250 documents over the
 * pooled allowance, plus GST. Extras and overage are what the firm pays in
 * arrears on top of the subscription.
 */
export function monthlyBill(plan: PlanKey, cycle: Cycle, u: Usage, gstPercent = GST_PERCENT): BillBreakdown {
  const p = PLANS[plan];
  const base = cycle === "annual" ? Math.round(p.annual / 12) : p.monthly;
  const extraClients = Math.max(0, u.activeClients - p.clientsIncluded);
  const extraClientsAmount = extraClients * p.extraClient;
  const over = Math.max(0, u.documents - documentAllowance(plan, u.activeClients));
  const overageBlocks = Math.ceil(over / OVERAGE_BLOCK_DOCS);
  const overageAmount = overageBlocks * OVERAGE_BLOCK_PRICE;
  const subtotal = base + extraClientsAmount + overageAmount;
  const gst = Math.round(subtotal * gstPercent) / 100;
  return { base, extraClients, extraClientsAmount, overageBlocks, overageAmount, subtotal, gst, total: subtotal + gst };
}

/** The cheapest plan for a number of active clients in a month (before GST, monthly billing). */
export function cheapestPlan(activeClients: number): { plan: PlanKey; subtotal: number } {
  let best: { plan: PlanKey; subtotal: number } | null = null;
  for (const key of PLAN_ORDER) {
    const cap = PLANS[key].maxActiveClients;
    if (cap != null && activeClients > cap) continue;
    const subtotal = monthlyBill(key, "monthly", { activeClients, documents: 0 }).subtotal;
    if (!best || subtotal < best.subtotal) best = { plan: key, subtotal };
  }
  return best!;
}

export type UsageWarning = { level: "80" | "100"; kind: "documents"; used: number; limit: number };

/** Soft-limit warnings for documents at 80% and 100% of the pooled allowance. Work is never blocked by these. */
export function documentWarning(plan: PlanKey, u: Usage): UsageWarning | null {
  const limit = documentAllowance(plan, u.activeClients);
  if (u.documents >= limit) return { level: "100", kind: "documents", used: u.documents, limit };
  if (u.documents >= limit * 0.8) return { level: "80", kind: "documents", used: u.documents, limit };
  return null;
}

/* ── Razorpay ──────────────────────────────────────────────── */

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

/** What one billing period of a plan costs, in paise, with GST added on top. */
export function planAmountPaise(plan: PlanKey, cycle: Cycle, gstPercent = GST_PERCENT): number {
  const rupees = cycle === "annual" ? PLANS[plan].annual : PLANS[plan].monthly;
  const gst = Number.isFinite(gstPercent) && gstPercent > 0 ? gstPercent : 0;
  return Math.round(rupees * 100 * (1 + gst / 100));
}

const RANK: Record<PlanKey, number> = { starter: 0, professional: 1, scale: 2 };

/**
 * When a plan change takes effect (Refund and Cancellation Policy, clause 5):
 * a higher plan at once, with Razorpay charging the pro-rated difference; a
 * lower plan, or the same plan on another cycle, from the next renewal.
 */
export function changeTiming(from: { plan: PlanKey; cycle: Cycle }, to: { plan: PlanKey; cycle: Cycle }): "same" | "now" | "renewal" {
  if (from.plan === to.plan && from.cycle === to.cycle) return "same";
  return RANK[to.plan] > RANK[from.plan] ? "now" : "renewal";
}

/** Money-back guarantee: a full refund within 30 days of starting an annual plan. */
export const REFUND_WINDOW_DAYS = 30;

/** When the money-back window on a first annual payment closes, or null when it does not apply. */
export function refundWindowEnd(
  b: { first_paid_at?: string | null; first_paid_cycle?: string | null; first_payment_id?: string | null; refund_used?: boolean | null },
  now: Date = new Date(),
): Date | null {
  if (b.refund_used || b.first_paid_cycle !== "annual" || !b.first_paid_at || !b.first_payment_id) return null;
  const end = new Date(new Date(b.first_paid_at).getTime() + REFUND_WINDOW_DAYS * DAY);
  return end.getTime() > now.getTime() ? end : null;
}

/** GSTIN: 2-digit state code, PAN, entity number, Z, check character. */
export function validGstin(s: string): boolean {
  return /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s.trim().toUpperCase());
}
