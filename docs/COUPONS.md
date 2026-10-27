# Coupons (Admin → Coupons)

Pick what it gives and who it is for. FynHelp sets up everything else, including the discount in Razorpay.

## Making a code
1. Open **Admin → Coupons**. Use a **Quick start** (14 trial days, 20% off, ₹500 off, 10% for good) or choose **Free trial days / Percent off / Rupees off**.
2. Type a code, or press **Make one**. Set the amount. For money codes choose **First payment only** or **Every payment**.
3. Optional: expiry, total uses, and under **More options** the plans, billing cycle and uses per firm.
4. The preview shows the sentence a firm will see and the price on each plan. Press **Create code**.

There is **nothing to create in Razorpay**. Razorpay lets a plan be created through its API but not an offer, so FynHelp creates a discounted plan for each plan and billing cycle the code covers, at the discounted price with GST, named after the code. This happens when you press Create, so a problem shows in the admin panel and not to the first customer. If Razorpay refuses, nothing is created.

## What happens at checkout
- The firm enters the code in Settings → Billing and sees, for example, "20% off your first payment".
- The subscription starts on the discounted plan.
- **First payment only:** once the first payment is in, FynHelp moves the subscription back to the normal plan from the next period (Razorpay `schedule_change_at: cycle_end`). If Razorpay is not ready yet (UPI mandates can take a day), FynHelp keeps trying every hour.
- **Every payment:** the firm stays on the discounted plan. If it later changes plan, the discount ends.
- Trial-day codes extend the trial and need no payment.

## Limits
- Percent: 1 to 90. For a free first month or longer, use trial days. A code must leave every plan it covers at ₹1 or more.
- Older codes that carry a hand-made Razorpay offer keep working as before.
- The amount a UPI mandate allows is set when the firm first pays; a normal price above that limit would need the firm to re-authorise. Razorpay's default limit is well above FynHelp's plans.

## Setup
Apply `supabase/migrations/20261101090000_coupon_auto.sql`. No new environment variables.

## Checks
```bash
npm test -- tests/unit/practice/coupon-auto.test.ts
```
