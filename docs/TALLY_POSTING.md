# Tally posting: approve in FynHelp, write to Tally

Reads were already live (the connector sends the Day Book). This adds the write side, always behind a person's approval.

## What it does
- Bank lines that are not matched to Tally show in the document panel (Documents, open a bank statement) under **Post to Tally**.
- FynHelp suggests an **existing** Tally ledger (never invents one). A partner or manager approves a line with that ledger.
- Approving queues exactly one voucher. The **FynHelp Connector 1.1** on the Tally PC writes it **only if its config has `"allowWrite": true`**, then reports what Tally answered. Only a clear single creation becomes "In Tally".
- Voucher types: Receipt (money in), Payment (money out), **Contra** (transfer between own bank or cash ledgers), and a **split** for a charge with its GST (CGST + SGST or IGST) that adds up to the bank amount to the paisa.
- Not supported on purpose: Journal vouchers for bank lines (a bank movement is always a Receipt, Payment or Contra), creating ledgers (create them in Tally, then sync), handwritten documents.

## Safety rules
- A bank line can be queued once (database index). Each carries a fixed id used as the voucher's REMOTEID.
- A line whose result never came back is **held**, not retried (Tally may already have it). A person checks Tally and either approves again or presses **It is in Tally: mark as posted** (note required, kept in the history).
- A ledger renamed or deleted in Tally after approval stops the write.
- Tally offline: the line waits as "Approved, waiting for Tally".
- The XML now has the shape of a real TallyPrime import file and is checked against it in tests; what Tally does on a live company (resend with the same id, manual numbering, billwise parties) is **not yet proven**. Test on a test company first (`docs/ACCURACY.md` has the checklist).
- From connector 1.4.0, after Tally says "created" the connector **reads the voucher back** and checks type, date, ledgers and amounts. Only a match becomes "In Tally"; otherwise the line is held as "Needs a look" with the reason.

## Tally posting pages (credits, like WhatsApp credits)
- 1 credit = 1 page of a document posted to Tally. PDF: real pages (when known); Excel/CSV: 1 page per 30 lines, minimum 1. Taken **once per document**, when its first line is approved; refunded if the approval is not queued. Cancelling later does not refund (the document was used).
- Included monthly by plan: Essential 100, Firm 500, Scale 2,000; trial 50. Packs (ex GST), **15% below the reference Docs by Ira packs**: 200 pages ₹340, 400 ₹680, 600 ₹1,020, 3,000 ₹2,550. The 400 and 600 reference prices were not visible in the source screenshot and assume ₹2 per page: confirm.
- Top-ups: Settings, Billing, **Tally posting pages** (under WhatsApp credits), and on the Pricing page. Paid through Razorpay orders; the existing `order.paid` webhook also grants pages (order notes `kind: "pages"`). A payment id adds pages once.
- No automatic top-up for pages yet.

## Setup
1. Apply `supabase/apply_tally_posting.sql` in the Supabase SQL Editor (or the two migrations `20261109090000_tally_posting.sql` and `20261109100000_page_credits.sql`). Until then the new panels return errors.
2. Razorpay: nothing new if `order.paid` is already on the webhook.
3. On the Tally PC: download connector 1.1, set `"allowWrite": true` in `fynhelp-connector.json` only when ready, restart it.

## Checks
```bash
npm test -- tests/unit/practice/tally-voucher.test.ts tests/unit/practice/page-credits.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_page_credits.sql   # rolls back
```
