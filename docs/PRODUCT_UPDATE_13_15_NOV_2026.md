# Product update: 13 to 15 Nov 2026

What changed in FynHelp in the last 48 hours, in plain words, for the team, testers and clients.

## For CA firms

**Bank statements are read as the bank prints them, and now proved against the bank's own figures.**
- ICICI, Indian Bank, Union Bank and HDFC PDF statements are read by position, keeping own-account transfers and naming UPI / IMPS / NEFT types.
- Each statement is tied to what the bank prints on it: the summary row, debit and credit counts, totals, opening and closing balance, serial numbers and page counts. A statement that does not tie is held for a person instead of being filed wrong. The upload card shows the tie-out as a strip of checks.

**New: GST page (Checks → GST).**
- Drop your purchase register and the GSTR-2B from the portal (JSON or Excel). You get: ITC matched, ITC at risk, invoices on GSTR-2B you have not booked, and amount differences.
- A supplier follow-up list: each supplier whose invoices are missing from GSTR-2B, with the tax credit at risk, a ready message (copy, or open in WhatsApp) and a downloadable list.
- 30+ GST checks on any sales, purchase or GSTR-2B register: GSTIN check character and shape, state code, duplicate and repeated invoice numbers, number length and characters, series gaps, dates in the future or before GST, ITC time limit, IGST vs CGST/SGST, rate slabs, invoice total, HSN length, IRN shape, reverse charge and blocked ITC. These also run automatically on registers uploaded to Documents.
- Read-only: nothing is filed or changed. On this page the files are read in your browser and are not uploaded.

**Zoho Books:** pulling a month again now replaces every earlier copy, so an entry deleted in Zoho disappears here.

**Follow-ups (WhatsApp and email):** templates are found reliably, errors say what Meta returned, every message uses a Utility template name, the page shows whether the follow-up job and email are really running, and firms with no billing record are reached.

**Help:** Settings → Help has a guide for each part of the product and a Report a problem form. Reports go to support@fynhelp.com and prajwal@fynhelp.com.

## For admins

- **Gemini cost is now tracked accurately** (API usage and cost page). It had been under-counting: thinking tokens (billed as output), the Nov 2026 price list, failed-but-billed calls and Fynny chat were missing. Totals are now in ₹ with $ beside them, days can be viewed in India time or Pacific time (how Google bills), and a "Check against Google's bill" box shows the gap against what Google charged.
- Scans and photos use the free OCR.space reader first; files over its free 1 MB limit go straight to the AI reader.
- **Plans and credits:** change a firm's plan, assign a subscription manually, add or take back credits, waive a failed usage charge.
- **Mark as test / real:** with Undo, an animated bulk bar, a guard for paying firms, and the Test banner clears as soon as a firm is real.
- robots.txt names Googlebot and Applebot and keeps /app and /dashboard out of every crawler.

## Needs a person after this release

1. Redeploy the edge functions so their usage is recorded properly: `supabase functions deploy practice-ai fynny-chat extract-document-ai`.
2. Run `supabase/apply_nov_2026.sql` in the Supabase SQL editor (token and cost columns) if not done.
3. In Vercel set `USD_INR_RATE` and pin `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` to a version; set `OCR_SPACE_API_KEY` if scans should use OCR first.

## Not in this release (still planned)

Rules and ledger-mapping screen, bulk approve for bank lines, purchase and sales vouchers from Excel registers for Tally, and the published accuracy benchmark.
