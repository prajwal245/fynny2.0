/**
 * Tally posting pages: a second credit type, next to WhatsApp credits, with the same rules
 * (monthly allowance by plan, top-up packs, 12-month validity, oldest-expiring first, refund when unused).
 * One credit is one page of a document posted to Tally. A PDF counts its real pages; other files
 * (Excel, CSV) count one page for every PAGE_ROWS lines, rounded up.
 * Pure rules only: the ledger and the payments are in pageCredits.server.ts.
 */
import { accessFor, type BillingRow, type PlanKey } from "./plans";
import { PAGE_PACKS, type PagePack } from "../tallyPricing";

export const PAGE_ROWS = 30;
export const PAGE_CREDIT_VALID_MONTHS = 12;
export const TRIAL_PAGES = 50;
/** Included every month, by plan. Unused pages roll over for PAGE_CREDIT_VALID_MONTHS. */
export const PLAN_PAGES: Record<PlanKey, number> = { starter: 100, professional: 500, scale: 2000 };

export const pageDocKey = (extractionId: string) => `pg:${extractionId}`;

/** Pages a document uses: its real page count when known, otherwise one per PAGE_ROWS lines. At least 1. */
export function pagesForDocument(input: { pdfPages?: number | null; rows: number }): number {
  const real = Math.floor(Number(input.pdfPages ?? 0));
  if (real > 0) return real;
  return Math.max(1, Math.ceil(Math.max(0, input.rows) / PAGE_ROWS));
}

export const pagePackByKey = (k: string | null | undefined): PagePack | null => PAGE_PACKS.find((p) => p.key === k) ?? null;
/** What a pack costs with GST in paise (what Razorpay charges). */
export const pagePackPaise = (p: PagePack, gstPercent: number) => Math.round(p.price * (100 + gstPercent));

export type PageLevel = "ok" | "low" | "out";
export const pageLowThreshold = (monthly: number) => Math.max(20, Math.ceil(monthly * 0.2));
export const pageLevel = (balance: number, monthly: number): PageLevel => (balance < 1 ? "out" : balance <= pageLowThreshold(monthly) ? "low" : "ok");

export interface PageGrant {
  kind: "plan" | "trial";
  credits: number;
  period: string;
}
export function pageAllowanceGrant(b: BillingRow, month: string, now: Date = new Date()): PageGrant | null {
  const a = accessFor(b, now);
  if (!a.canWork) return null;
  if (a.state === "trial") return { kind: "trial", credits: TRIAL_PAGES, period: "trial" };
  return { kind: "plan", credits: PLAN_PAGES[b.plan] ?? PLAN_PAGES.starter, period: month };
}
export const monthlyPages = (b: BillingRow, now: Date = new Date()): number =>
  accessFor(b, now).state === "trial" ? TRIAL_PAGES : (PLAN_PAGES[b.plan] ?? PLAN_PAGES.starter);
