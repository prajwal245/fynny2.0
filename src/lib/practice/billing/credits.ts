/**
 * FynHelp Credits: one credit pays for one WhatsApp reminder sent from FynHelp's shared number.
 * Email reminders, replies inside WhatsApp's 24-hour window, a firm's own WhatsApp number and
 * document reading are not charged in credits (documents have their own monthly allowance).
 * Pure rules only; the ledger and the payments are in credits.server.ts.
 */
import { accessFor, type BillingRow, type PlanKey } from "./plans";

export const CREDITS_PER_REMINDER = 1;
/** Credits stay valid this long after they are added. */
export const CREDIT_VALID_MONTHS = 12;
export const TRIAL_CREDITS = 25;

/** Included every month, by plan. Unused credits roll over (see CREDIT_VALID_MONTHS). */
export const PLAN_CREDITS: Record<PlanKey, number> = { starter: 100, professional: 500, scale: 2000 };

export interface CreditPack {
  key: "c500" | "c2000" | "c5000";
  credits: number;
  /** Rupees before GST. */
  price: number;
  label: string;
  /** Shown as a tag on the pack. */
  tag?: string;
}
export const CREDIT_PACKS: CreditPack[] = [
  { key: "c500", credits: 500, price: 499, label: "500 credits" },
  { key: "c2000", credits: 2000, price: 1799, label: "2,000 credits", tag: "Most popular" },
  { key: "c5000", credits: 5000, price: 3999, label: "5,000 credits", tag: "Best value" },
];
export const packByKey = (k: string | null | undefined): CreditPack | null => CREDIT_PACKS.find((p) => p.key === k) ?? null;

/** What one pack costs with GST, in paise (what Razorpay charges). */
export const packPaise = (p: CreditPack, gstPercent: number) => Math.round(p.price * (100 + gstPercent));
export const pricePerCredit = (p: CreditPack) => Math.round((p.price / p.credits) * 100) / 100;

/** Automatic top-ups: how many packs a month at most. */
export const AUTO_MAX_CHOICES = [1, 2, 3, 5] as const;

export type CreditLevel = "ok" | "low" | "out";
/** "Low" is the last fifth of the monthly allowance, never fewer than 10 credits. */
export const lowThreshold = (monthly: number) => Math.max(10, Math.ceil(monthly * 0.2));
export function creditLevel(balance: number, monthly: number): CreditLevel {
  if (balance < CREDITS_PER_REMINDER) return "out";
  return balance <= lowThreshold(monthly) ? "low" : "ok";
}

export interface CreditGrant {
  kind: "plan" | "trial";
  credits: number;
  period: string;
}

/** The allowance a firm should have in `month` ("2026-10"), or null when it has none (trial over, plan ended). */
export function allowanceGrant(b: BillingRow, month: string, now: Date = new Date()): CreditGrant | null {
  const a = accessFor(b, now);
  if (!a.canWork) return null;
  if (a.state === "trial") return { kind: "trial", credits: TRIAL_CREDITS, period: "trial" };
  return { kind: "plan", credits: PLAN_CREDITS[b.plan] ?? PLAN_CREDITS.starter, period: month };
}

/** The monthly allowance the firm sees as its "size" (trial firms: the trial gift). */
export function monthlyAllowance(b: BillingRow, now: Date = new Date()): number {
  return accessFor(b, now).state === "trial" ? TRIAL_CREDITS : (PLAN_CREDITS[b.plan] ?? PLAN_CREDITS.starter);
}

/** "~N reminders left" wording. */
export function remindersLeft(balance: number): string {
  const n = Math.floor(balance / CREDITS_PER_REMINDER);
  return n === 1 ? "1 reminder left" : `${n.toLocaleString("en-IN")} reminders left`;
}
