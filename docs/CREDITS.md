# WhatsApp credits

One credit sends one WhatsApp reminder from **FynHelp's shared number**. Everything else is free:

| Action | Credits |
|---|---|
| Email reminder | 0 (fair use) |
| WhatsApp reminder from FynHelp's number, sent as the **template** (client has not written in the last 23 hours) | 1 |
| WhatsApp reminder sent as **free text** inside the client's open 24-hour window | 0 (WhatsApp does not charge us either) |
| WhatsApp reminder from the firm's **own** linked number | 0 (the firm pays Meta directly) |
| Replies inside WhatsApp's 24-hour window, document intake | 0 |
| Document reading | 0 credits (has its own monthly document allowance) |
| Test accounts | 0 (sandbox) |

## Allowance and packs

| Plan | Credits added each month |
|---|---|
| Free trial | 25 once |
| Essential | 100 |
| Firm | 500 |
| Scale | 2,000 |

Top-up packs (GST extra): 500 for ₹499, 2,000 for ₹1,799, 5,000 for ₹3,999. Credits last **12 months**; a spend always takes from the lot that expires first.

Automatic top-up (monthly plans only): when the balance cannot cover a reminder, one chosen pack is added at once and billed as a Razorpay add-on, collected with the next plan payment. The firm sets how many packs it allows per month (1, 2, 3 or 5), which is the spending limit. If Razorpay refuses the add-on, the credits are taken back out.

Warnings: an in-app notice once a month when the balance drops to the last fifth of the monthly allowance (never fewer than 10), and once a month when it reaches 0. The Chaser page always shows "~N reminders left".

## How it works

- Database: `supabase/migrations/20261028090000_credits.sql` — lots, ledger, orders, settings, and four service-role-only functions (`ca_credits_balance/grant/spend/refund`). Each takes a per-firm lock, so concurrent sends can never spend the same credit twice. Plan allowances and payments are granted idempotently (unique keys).
- Server: `src/lib/practice/billing/credits.server.ts`. `sendChaseWhatsapp` spends 1 credit only when it is about to send the template on the shared number, and **refunds it if the message is not sent**. With no credits the reminder is not sent and the Chaser reports "Out of WhatsApp credits"; a WhatsApp-only chase is retried the next day, an Email + WhatsApp chase carries on by email.
- Top-ups: a Razorpay Order is created, the credits are added after the payment signature is verified, or by the `order.paid` webhook if the browser closed first. A payment id is unique, so a repeat never adds twice.
- Screens: Chaser (balance chip, low/out bar, channel choice), Settings → Billing (balance, history, auto top-up, Add credits).

## Setup (founder)

1. Apply the migration.
2. Razorpay Dashboard → Webhooks: add the event **`order.paid`** to the existing webhook (the same URL as the subscription events).
3. Nothing else: allowances are granted the first time a firm's credits are read or spent.

## Checks

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_credits.sql   # rolls back; prints "ok - …" lines
npm test -- tests/unit/practice/credits.test.ts
```

## Known limits

- A top-up is a one-time Razorpay payment; Razorpay does not issue a GST invoice for it automatically. Finance should issue a manual invoice from the payment list until this is automated.
- Automatic top-up credits are given at once and charged with the next plan payment, so a firm that cancels before that payment could leave a small unpaid add-on. The monthly pack limit caps it.
