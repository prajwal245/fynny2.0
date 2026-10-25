/**
 * The rules of the referral programme as pure functions (tested on their own): what a code looks
 * like, who may be referred, how the reward is given, and the limits that stop abuse.
 */

export const REFERRAL_REWARD_MONTHS = 1;
/** A reward month added to a trial is this many days. */
export const REWARD_DAYS = 30;
/** Most reward months a firm can earn as a referrer in any 365 days. */
export const MAX_REWARD_MONTHS_PER_YEAR = 12;
/** A firm may take a referral code only in its first days. */
export const ATTACH_WINDOW_DAYS = 7;

// No 0/O/1/I/L: codes are read out and typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newReferralCode = (rand: () => number = Math.random): string =>
  "FH" + Array.from({ length: 6 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");

/** The code as typed or pasted: any case, spaces and dashes ignored. Null when it cannot be one of ours. */
export function parseReferralCode(raw: unknown): string | null {
  const c = String(raw ?? "").replace(/[\s-]/g, "").toUpperCase();
  return /^FH[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(c) ? c : null;
}

export const referralLink = (origin: string, code: string) => `${origin.replace(/\/+$/, "")}/?ref=${code}`;

export interface FirmFacts {
  id: string;
  userId: string | null;
  email: string | null;
  createdAt: string;
  isDemo: boolean;
}

export type Eligibility = { ok: true } | { ok: false; reason: "self" | "same_owner" | "same_email" | "demo" | "not_new" | "already_referred" };

/** Whether `referred` may join with a code from `referrer`. Each refusal is a different abuse pattern. */
export function eligibleToRefer(referrer: FirmFacts, referred: FirmFacts, alreadyReferred: boolean, now: Date = new Date()): Eligibility {
  if (referrer.id === referred.id) return { ok: false, reason: "self" };
  if (referrer.isDemo || referred.isDemo) return { ok: false, reason: "demo" };
  if (alreadyReferred) return { ok: false, reason: "already_referred" };
  if (referrer.userId && referrer.userId === referred.userId) return { ok: false, reason: "same_owner" };
  const a = referrer.email?.trim().toLowerCase();
  const b = referred.email?.trim().toLowerCase();
  if (a && b && a === b) return { ok: false, reason: "same_email" };
  if (now.getTime() - Date.parse(referred.createdAt) > ATTACH_WINDOW_DAYS * 86_400_000) return { ok: false, reason: "not_new" };
  return { ok: true };
}

export const REFUSAL_TEXT: Record<Exclude<Eligibility, { ok: true }>["reason"], string> = {
  self: "You cannot use your own referral code.",
  same_owner: "This code belongs to a firm with the same owner, so it cannot be used.",
  same_email: "This code belongs to a firm with the same email address, so it cannot be used.",
  demo: "Referral codes are not available for demo firms.",
  not_new: "A referral code can only be added in a firm's first week.",
  already_referred: "This firm has already used a referral code.",
};

export type RewardMode = "trial_extension" | "billing_credit";

/**
 * A trialing firm gets 30 more days of trial straight away. A firm that pays (or has paid) gets one
 * month's fee credited by the billing team, because refunds and credit notes are handled by people.
 */
export const rewardMode = (billingStatus: string | null | undefined): RewardMode => (billingStatus === "trialing" ? "trial_extension" : "billing_credit");

/** New trial end after a reward: from whichever is later, now or the current end (a paused trial restarts). */
export function extendTrial(trialEndsAt: string | null | undefined, now: Date = new Date(), days = REWARD_DAYS): string {
  const base = Math.max(now.getTime(), trialEndsAt ? Date.parse(trialEndsAt) || 0 : 0);
  return new Date(base + days * 86_400_000).toISOString();
}

/** Referrer reward months earned in the last 365 days still leave room for another? */
export const referrerHasRoom = (monthsEarnedLast365: number, add = REFERRAL_REWARD_MONTHS) => monthsEarnedLast365 + add <= MAX_REWARD_MONTHS_PER_YEAR;

/** What a reward month is worth on a paid plan, before GST, for the billing team's note. */
export function monthlyValue(plan: { monthly: number; annual: number }, cycle: "monthly" | "annual"): number {
  return Math.round(cycle === "annual" ? plan.annual / 12 : plan.monthly);
}
