/**
 * Monthly billing of extras, in arrears. Early each month, for every firm on
 * a paid plan, FynHelp counts last month's active clients and documents (only
 * from the day the firm started paying), works out extra active clients and
 * document overage, and charges them:
 *   - monthly plans: a Razorpay add-on on the subscription, collected with the
 *     next monthly payment;
 *   - yearly plans: a Razorpay invoice the firm pays by link within 15 days.
 * Each firm and month gets exactly one ca_usage_charges row (unique key), so a
 * month can never be billed twice; failed attempts are retried up to 5 times.
 * Set FYNHELP_ARREARS_BILLING=off to stop all charging.
 */
import type { Db } from "../db.server";
import { arrearsFor, arrearsLines, arrearsMethod, monthName, previousMonth } from "./arrears";
import { billingMonth, monthRange, usageFor } from "./usage.server";
import type { Cycle, PlanKey } from "./plans";

const MAX_ATTEMPTS = 5;
const INVOICE_DAYS = 15;

interface PaidRow {
  ca_firm_id: string;
  plan: PlanKey;
  cycle: Cycle;
  status: string;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  first_paid_at: string | null;
  billing_name: string | null;
  ca_firms: { firm_name: string; email: string | null; is_demo: boolean | null; is_test?: boolean | null } | null;
}

export interface ArrearsRunResult {
  month: string;
  checked: number;
  charged: number;
  nothingDue: number;
  failed: number;
  skipped?: string;
}

export async function runArrearsBilling(db: Db, now: Date = new Date()): Promise<ArrearsRunResult> {
  const month = previousMonth(billingMonth(now));
  const result: ArrearsRunResult = { month, checked: 0, charged: 0, nothingDue: 0, failed: 0 };
  if ((process.env["FYNHELP_ARREARS_BILLING"] ?? "").toLowerCase() === "off") return { ...result, skipped: "turned off" };
  const billing = await import("../billing.server");
  if (!billing.razorpayReady()) return { ...result, skipped: "payments not configured" };

  const { start, end } = monthRange(month);
  const { data, error } = await db
    .from("ca_billing")
    .select("ca_firm_id, plan, cycle, status, razorpay_subscription_id, razorpay_customer_id, first_paid_at, billing_name, ca_firms(firm_name, email, is_demo, is_test)")
    .in("status", ["active", "past_due"])
    .not("razorpay_subscription_id", "is", null)
    .lt("first_paid_at", end)
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as PaidRow[];
  if (!rows.length) return result;

  const { data: existing } = await db
    .from("ca_usage_charges")
    .select("ca_firm_id, status, attempts")
    .eq("month", month)
    .in("ca_firm_id", rows.map((r) => r.ca_firm_id));
  const done = new Map((existing ?? []).map((e) => [String(e.ca_firm_id), e as { status: string; attempts: number }]));

  for (const r of rows) {
    if (r.ca_firms?.is_demo || r.ca_firms?.is_test) continue; // never bill demo or test firms
    const prior = done.get(r.ca_firm_id);
    if (prior && !(prior.status === "failed" && prior.attempts < MAX_ATTEMPTS)) continue;
    result.checked++;
    const usage = await usageFor(db, r.ca_firm_id, month, r.first_paid_at && r.first_paid_at > start ? r.first_paid_at : null);
    const a = arrearsFor(r.plan, r.cycle, usage, billing.gstPercent());
    const base = {
      ca_firm_id: r.ca_firm_id,
      month,
      plan: r.plan,
      cycle: r.cycle,
      active_clients: usage.activeClients,
      documents: usage.documents,
      extra_clients: a.extraClients,
      extra_clients_amount: a.extraClientsAmount,
      overage_blocks: a.overageBlocks,
      overage_amount: a.overageAmount,
      subtotal: a.subtotal,
      gst: a.gst,
      total: a.total,
      updated_at: new Date().toISOString(),
    };

    if (a.paise <= 0) {
      // Nothing over the plan: record the month for the usage summary.
      if (!prior) await db.from("ca_usage_charges").insert({ ...base, method: "none", status: "none" });
      else await db.from("ca_usage_charges").update({ ...base, method: "none", status: "none", error: null }).eq("ca_firm_id", r.ca_firm_id).eq("month", month);
      result.nothingDue++;
      continue;
    }

    const method = arrearsMethod(r.cycle);
    // Claim the month first, so two overlapping runs cannot both charge it.
    if (!prior) {
      const { error: claimErr } = await db.from("ca_usage_charges").insert({ ...base, method, status: "pending" });
      if (claimErr) continue;
    } else {
      const { data: reclaimed } = await db
        .from("ca_usage_charges")
        .update({ ...base, method, status: "pending" })
        .eq("ca_firm_id", r.ca_firm_id)
        .eq("month", month)
        .eq("status", "failed")
        .select("id");
      if (!reclaimed?.length) continue;
    }

    const name = `FynHelp usage, ${monthName(month)}`;
    const description = `${arrearsLines(r.plan, a).join("; ")}. Includes ₹${a.gst.toLocaleString("en-IN")} GST.`.slice(0, 250);
    const notes = { firm_id: r.ca_firm_id, month, kind: "usage" };
    try {
      if (method === "addon") {
        const addon = await billing.razorpayApi<{ id: string }>(
          "POST",
          `/subscriptions/${r.razorpay_subscription_id}/addons`,
          { item: { name, amount: a.paise, currency: "INR", description }, quantity: 1 },
          "Razorpay could not add the usage charge.",
        );
        await db
          .from("ca_usage_charges")
          .update({ status: "billed", razorpay_ref: addon.id, billed_at: new Date().toISOString(), error: null })
          .eq("ca_firm_id", r.ca_firm_id)
          .eq("month", month);
      } else {
        const customer = r.razorpay_customer_id
          ? { customer_id: r.razorpay_customer_id }
          : { customer: { name: (r.billing_name || r.ca_firms?.firm_name || "FynHelp customer").slice(0, 50), email: r.ca_firms?.email ?? undefined } };
        const invoice = await billing.razorpayApi<{ id: string; short_url?: string }>(
          "POST",
          "/invoices",
          {
            type: "invoice",
            description: name,
            ...customer,
            line_items: [{ name, description, amount: a.paise, currency: "INR", quantity: 1 }],
            currency: "INR",
            email_notify: 1,
            sms_notify: 0,
            expire_by: Math.floor(now.getTime() / 1000) + INVOICE_DAYS * 86_400,
            notes,
          },
          "Razorpay could not create the usage invoice.",
        );
        await db
          .from("ca_usage_charges")
          .update({ status: "billed", razorpay_ref: invoice.id, pay_url: invoice.short_url ?? null, billed_at: new Date().toISOString(), error: null })
          .eq("ca_firm_id", r.ca_firm_id)
          .eq("month", month);
      }
      await db.from("ca_billing_events").insert({
        id: `usage:${r.ca_firm_id}:${month}`,
        event: "app.usage_billed",
        ca_firm_id: r.ca_firm_id,
        payload: { month, method, plan: r.plan, cycle: r.cycle, total: a.total, subtotal: a.subtotal, gst: a.gst, lines: arrearsLines(r.plan, a) },
      });
      result.charged++;
    } catch (e) {
      await db
        .from("ca_usage_charges")
        .update({ status: "failed", attempts: (prior?.attempts ?? 0) + 1, error: (e as Error).message.slice(0, 300) })
        .eq("ca_firm_id", r.ca_firm_id)
        .eq("month", month);
      result.failed++;
    }
  }
  return result;
}

/** Razorpay told us an invoice was paid, or a subscription payment went through. */
export async function markUsagePaid(db: Db, opts: { invoiceId?: string | null; firmId?: string | null; subscriptionCharged?: boolean }) {
  const paidAt = new Date().toISOString();
  if (opts.invoiceId)
    await db.from("ca_usage_charges").update({ status: "paid", paid_at: paidAt }).eq("razorpay_ref", opts.invoiceId).eq("method", "invoice");
  if (opts.subscriptionCharged && opts.firmId)
    // Add-ons ride on the next subscription payment, so a charged payment settles them.
    await db.from("ca_usage_charges").update({ status: "paid", paid_at: paidAt }).eq("ca_firm_id", opts.firmId).eq("method", "addon").eq("status", "billed");
}

export interface UsageChargeRow {
  month: string;
  activeClients: number;
  documents: number;
  extraClients: number;
  overageBlocks: number;
  subtotal: number;
  total: number;
  method: "none" | "addon" | "invoice";
  status: string;
  payUrl: string | null;
}

export async function recentUsageCharges(db: Db, firmId: string, limit = 6): Promise<UsageChargeRow[]> {
  const { data } = await db
    .from("ca_usage_charges")
    .select("month, active_clients, documents, extra_clients, overage_blocks, subtotal, total, method, status, pay_url")
    .eq("ca_firm_id", firmId)
    .order("month", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    month: String(r.month),
    activeClients: Number(r.active_clients),
    documents: Number(r.documents),
    extraClients: Number(r.extra_clients),
    overageBlocks: Number(r.overage_blocks),
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    method: r.method as UsageChargeRow["method"],
    status: String(r.status),
    payUrl: (r.pay_url as string | null) ?? null,
  }));
}

