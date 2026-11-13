/**
 * Rules for what an admin may change on a firm's plan, credits and monthly charges. Pure, so they are tested on
 * their own and the server and the screen say the same thing.
 */
import { PLANS, type Cycle, type PlanKey } from "../practice/billing/plans";

const DAY = 86_400_000;

/** Most credits one adjustment may add or take away. Bigger moves are done in several visible steps. */
export const MAX_CREDIT_ADJUST = 10_000;
/** Longest a manual (complimentary) plan may run in one go. */
export const MAX_MANUAL_PLAN_DAYS = 400;
export const MIN_REASON = 5;

export const cleanReason = (s: string | null | undefined) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 300);

/** Null when the credit change is allowed, otherwise what to tell the admin. */
export function creditAdjustProblem(delta: number, reason: string, balance?: number): string | null {
  if (!Number.isInteger(delta) || delta === 0) return "Enter a whole number of credits, more or less than zero.";
  if (Math.abs(delta) > MAX_CREDIT_ADJUST) return `At most ${MAX_CREDIT_ADJUST.toLocaleString("en-IN")} credits at a time.`;
  if (cleanReason(reason).length < MIN_REASON) return "Say why, so the team knows later.";
  if (delta < 0 && balance != null && -delta > balance) return `The firm has only ${balance.toLocaleString("en-IN")} credits, so that many cannot be taken away.`;
  return null;
}

/** A manual plan's end date must be a real future day, and not absurdly far. */
export function manualPlanEnd(endsOn: string, now: Date = new Date()): { ok: true; endsAt: string } | { ok: false; problem: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { ok: false, problem: "Choose the day the plan should end." };
  // The plan runs through the whole of that day, India time.
  const end = new Date(`${endsOn}T23:59:59+05:30`);
  if (Number.isNaN(end.getTime())) return { ok: false, problem: "That is not a real date." };
  if (end.getTime() <= now.getTime() + DAY / 2) return { ok: false, problem: "The end date must be at least tomorrow." };
  if (end.getTime() > now.getTime() + MAX_MANUAL_PLAN_DAYS * DAY) return { ok: false, problem: `A manual plan can run for at most ${MAX_MANUAL_PLAN_DAYS} days. Renew it later.` };
  return { ok: true, endsAt: end.toISOString() };
}

/** A plan that cannot hold the firm's active clients this month would lock the firm out of work. */
export function planFitsUsage(plan: PlanKey, activeClients: number): string | null {
  const cap = PLANS[plan].maxActiveClients;
  if (cap != null && activeClients > cap)
    return `${PLANS[plan].name} covers up to ${cap} active clients a month and this firm has worked on ${activeClients} so far. Choose a bigger plan.`;
  return null;
}

/** Only a charge that failed to go out can be waived; one already raised in Razorpay is settled there. */
export const canWaiveCharge = (status: string) => status === "failed";

export type PlanKind = "razorpay" | "manual";

/** Which route a plan change takes: firms paying through Razorpay switch there; the rest get a dated manual plan. */
export function planRoute(b: { razorpay_subscription_id: string | null; status: string; cancel_at_period_end?: boolean | null }): PlanKind | "blocked" {
  const live = !!b.razorpay_subscription_id && ["pending", "active", "past_due"].includes(b.status);
  if (!live) return "manual";
  return b.cancel_at_period_end ? "blocked" : "razorpay";
}

export const cycleLabel = (c: Cycle) => (c === "annual" ? "yearly" : "monthly");
