/**
 * Tally posting pages, server side. Same safety as WhatsApp credits: every balance change goes through
 * the ca_pages_* database functions (per-firm lock), a payment id can add pages only once, and the
 * pages for a document are taken once however many of its lines are approved.
 */
import type { Db, FirmContext } from "../db.server";
import { canSignOff, logActivity } from "../db.server";
import { PracticeError } from "../core";
import { assertNotTest, isTestFirm } from "../testMode.server";
import { billingMonth } from "./usage.server";
import { PAGE_PACKS } from "../tallyPricing";
import { PAGE_CREDIT_VALID_MONTHS, monthlyPages, pageAllowanceGrant, pageDocKey, pageLevel, pagePackByKey, pagePackPaise } from "./pageCredits";

const rpcNumber = async (db: Db, fn: string, args: Record<string, unknown>): Promise<number> => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return Number(data ?? 0);
};

export async function ensurePageAllowance(db: Db, firmId: string, now: Date = new Date()): Promise<void> {
  const { loadBilling } = await import("../billing.server");
  const grant = pageAllowanceGrant(await loadBilling(db, firmId), billingMonth(now), now);
  if (!grant) return;
  const { error } = await db.rpc("ca_pages_grant", {
    p_firm: firmId,
    p_kind: grant.kind,
    p_credits: grant.credits,
    p_period: grant.period,
    p_ref: null,
    p_months: PAGE_CREDIT_VALID_MONTHS,
    p_note: grant.kind === "trial" ? "Free trial pages" : `Monthly pages ${grant.period}`,
  });
  if (error) console.error(`[pages] allowance: ${error.message}`);
}

export type PageSpend = { ok: true; charged: boolean; pages: number; balance: number | null } | { ok: false; needed: number; balance: number };

/** Takes the pages for one document, once. Test firms are not charged. Returns charged=false when this document was already paid for. */
export async function spendForDocument(db: Db, firmId: string, extractionId: string, pages: number): Promise<PageSpend> {
  if (await isTestFirm(db, firmId)) return { ok: true, charged: false, pages, balance: null };
  await ensurePageAllowance(db, firmId);
  const ref = pageDocKey(extractionId);
  const { data: prior } = await db.from("ca_page_ledger").select("id").eq("ca_firm_id", firmId).eq("reason", "spend").eq("ref", ref).limit(1);
  const { data: refunded } = await db.from("ca_page_ledger").select("id").eq("ca_firm_id", firmId).eq("reason", "refund").eq("ref", ref).limit(1);
  const alreadyPaid = Boolean(prior?.length) && !refunded?.length;
  const left = await rpcNumber(db, "ca_pages_spend", { p_firm: firmId, p_amount: pages, p_ref: ref });
  if (left < 0) return { ok: false, needed: pages, balance: await rpcNumber(db, "ca_pages_balance", { p_firm: firmId }) };
  return { ok: true, charged: !alreadyPaid, pages, balance: left };
}

export async function refundDocument(db: Db, firmId: string, extractionId: string): Promise<void> {
  await rpcNumber(db, "ca_pages_refund", { p_firm: firmId, p_ref: pageDocKey(extractionId) }).catch((e) => console.error(`[pages] refund: ${(e as Error).message}`));
}

/* ── top-ups ──────────────────────────────────────────────── */

export async function createPageOrder(db: Db, ctx: FirmContext, packKey: string) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can buy pages.");
  const pack = pagePackByKey(packKey);
  if (!pack) throw new PracticeError("invalid", "Pick one of the page packs.");
  const billing = await import("../billing.server");
  if (!billing.razorpayReady()) throw new PracticeError("payments_not_ready", "Online payments are being set up. Email support@fynhelp.com and we will add the pages.");
  const amount = pagePackPaise(pack, billing.gstPercent());
  const order = await billing.razorpayApi<{ id: string }>(
    "POST",
    "/orders",
    { amount, currency: "INR", receipt: `pg_${Date.now().toString(36)}`, notes: { kind: "pages", firm_id: ctx.firmId, pack: pack.key, pages: String(pack.pages) } },
    "Razorpay could not start the payment. Try again in a minute, or email support@fynhelp.com.",
  );
  const { error } = await db.from("ca_page_orders").insert({ order_id: order.id, ca_firm_id: ctx.firmId, pack: pack.key, credits: pack.pages, amount_paise: amount });
  if (error) throw new PracticeError("db_error", "Could not save the order. Try again.");
  return { keyId: process.env["RAZORPAY_KEY_ID"]!, orderId: order.id, amount, firmName: ctx.firmName, packLabel: `${pack.pages.toLocaleString("en-IN")} pages` };
}

/** Adds the pages for a paid order, once. Used after Checkout and by the Razorpay webhook. */
export async function grantPaidPageOrder(db: Db, orderId: string, paymentId: string): Promise<{ firmId: string; pages: number } | null> {
  const { data: order } = await db.from("ca_page_orders").select("order_id, ca_firm_id, credits").eq("order_id", orderId).maybeSingle();
  if (!order) return null;
  const firmId = String(order.ca_firm_id);
  const { error } = await db.rpc("ca_pages_grant", { p_firm: firmId, p_kind: "topup", p_credits: Number(order.credits), p_period: null, p_ref: paymentId, p_months: PAGE_CREDIT_VALID_MONTHS, p_note: "Top-up" });
  if (error) throw new Error(`pages grant: ${error.message}`);
  await db.from("ca_page_orders").update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString() }).eq("order_id", orderId).eq("status", "created");
  return { firmId, pages: Number(order.credits) };
}

export async function confirmPageTopUp(db: Db, ctx: FirmContext, p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const billing = await import("../billing.server");
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!secret) throw new PracticeError("payments_not_ready", "Online payments are being set up.");
  const { data: order } = await db.from("ca_page_orders").select("ca_firm_id").eq("order_id", p.razorpay_order_id).maybeSingle();
  if (!order || order.ca_firm_id !== ctx.firmId) throw new PracticeError("mismatch", "This payment is not for this firm. Email support@fynhelp.com.");
  if (!(await billing.checkoutSignatureValid(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature, secret)))
    throw new PracticeError("bad_signature", "The payment could not be verified. If money was taken, email support@fynhelp.com and we will add the pages.");
  const done = await grantPaidPageOrder(db, p.razorpay_order_id, p.razorpay_payment_id);
  if (done) await logActivity(db, ctx.firmId, null, "system", `${done.pages} Tally posting pages added (payment ${p.razorpay_payment_id}).`);
  return pagesView(db, ctx);
}

/* ── what the screens show ───────────────────────────────── */

export async function pagesView(db: Db, ctx: FirmContext) {
  const test = await isTestFirm(db, ctx.firmId);
  const billing = await import("../billing.server");
  const row = await billing.loadBilling(db, ctx.firmId);
  const monthly = monthlyPages(row);
  if (!test) await ensurePageAllowance(db, ctx.firmId);
  const [lots, ledger] = await Promise.all([
    db.from("ca_page_lots").select("kind, credits, remaining, expires_at").eq("ca_firm_id", ctx.firmId).gt("remaining", 0).gt("expires_at", new Date().toISOString()).order("expires_at").limit(50),
    db.from("ca_page_ledger").select("delta, reason, note, created_at").eq("ca_firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(12),
  ]);
  const live = lots.data ?? [];
  const balance = live.reduce((s, l) => s + Number(l.remaining), 0);
  const gst = billing.gstPercent();
  return {
    unmetered: test,
    balance,
    monthly,
    level: pageLevel(balance, monthly),
    nextExpiry: live[0] ? { pages: Number(live[0].remaining), expiresAt: String(live[0].expires_at) } : null,
    packs: PAGE_PACKS.map((p) => ({ ...p, totalWithGst: Math.round(pagePackPaise(p, gst)) / 100 })),
    gstPercent: gst,
    paymentsReady: billing.razorpayReady(),
    recent: (ledger.data ?? []).map((l) => ({ delta: Number(l.delta), reason: String(l.reason), note: (l.note as string | null) ?? null, at: String(l.created_at) })),
  };
}
export type PagesView = Awaited<ReturnType<typeof pagesView>>;
