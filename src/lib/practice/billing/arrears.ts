/**
 * What a firm owes for a finished month on top of its plan: extra active
 * clients and document overage, billed in arrears. The plan price itself is
 * paid in advance through the Razorpay subscription, so it is not part of this.
 */
import { GST_PERCENT, monthlyBill, PLANS, type Cycle, type PlanKey, type Usage } from "./plans";

export interface Arrears {
  extraClients: number;
  extraClientsAmount: number;
  overageBlocks: number;
  overageAmount: number;
  /** Before GST, in rupees. */
  subtotal: number;
  gst: number;
  total: number;
  /** What Razorpay is asked to charge (GST included), in paise. */
  paise: number;
}

export function arrearsFor(plan: PlanKey, cycle: Cycle, usage: Usage, gstPercent = GST_PERCENT): Arrears {
  const b = monthlyBill(plan, cycle, usage, gstPercent);
  const subtotal = b.extraClientsAmount + b.overageAmount;
  const gst = Math.round(subtotal * gstPercent) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;
  return {
    extraClients: b.extraClients,
    extraClientsAmount: b.extraClientsAmount,
    overageBlocks: b.overageBlocks,
    overageAmount: b.overageAmount,
    subtotal,
    gst,
    total,
    paise: Math.round(total * 100),
  };
}

/**
 * Monthly plans add the extras to the next subscription payment (a Razorpay
 * add-on). Yearly plans renew once a year, so their extras go out as a
 * separate Razorpay invoice the firm pays by link.
 */
export const arrearsMethod = (cycle: Cycle): "addon" | "invoice" => (cycle === "monthly" ? "addon" : "invoice");

/** "2026-09" for "2026-10". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** One line per charge, for emails, the Razorpay item and Settings. */
export function arrearsLines(plan: PlanKey, a: Arrears): string[] {
  const p = PLANS[plan];
  const out: string[] = [];
  if (a.extraClients > 0)
    out.push(`${a.extraClients} active client${a.extraClients === 1 ? "" : "s"} over the ${p.clientsIncluded} in ${p.name} at ₹${p.extraClient} each: ₹${a.extraClientsAmount.toLocaleString("en-IN")}`);
  if (a.overageBlocks > 0)
    out.push(`${a.overageBlocks} block${a.overageBlocks === 1 ? "" : "s"} of 250 documents over your pooled allowance at ₹499 each: ₹${a.overageAmount.toLocaleString("en-IN")}`);
  return out;
}
