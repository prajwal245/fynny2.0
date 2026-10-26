# FynHelp tester guide (for testers)

You are testing FynHelp before it goes live. This guide tells you what to open, what to try, and how to report what you find. You do not need any technical knowledge.

**You cannot break anything real.** Your account is a test account: no real client data is visible, nothing you do is billed, and nothing reaches real people or the company's analytics. A blue **Test account** banner at the top of every page reminds you.

---

## 1. Sign in
1. Open the link you were sent (it ends in `/login`).
2. Sign in with the email and password the team gave you. If you have not received them, ask the founder.
3. You should see the blue **Test account** banner. **If you do not see it, stop and tell the founder.**

> **Known for now:** photo and PDF *reading* is not switched on yet. Bank statements and ledgers as CSV or Excel are read fully. Please do not report "no fields on a PDF or photo" as a problem.

## 2. What you may use
| You can | Notes |
|---|---|
| Everything in the app: clients, documents, Chaser, reports, settings | Create as much sample data as you like. |
| Email | Emails you trigger reach **only** your own `@fynhelp.com` address (or addresses the founder added). Others show as "recorded, nothing was sent". |
| WhatsApp | Messages reach **only** the phone numbers the founder added for testing. Others show "recorded, nothing was sent". |
| Payments | Not available on a test account. Payment tests happen on a separate test link; the founder will give you one if needed. |

Use **made-up clients** (for example "Acme Traders"). Never type a real client's details.

## 3. Quick test (10 minutes, every time)
- [ ] The blue Test account banner is visible.
- [ ] Dashboard, Clients, Documents, Reports, Chaser and Settings all open without an error.
- [ ] Add a client. Refresh the page; it is still there.
- [ ] In Documents, upload a **bank statement as a CSV or Excel file**. It is read and fields appear.
  *Reading of PDFs and photos is not switched on yet: they are saved and shown under Documents, but no fields appear. That is expected, not a failure.*
- [ ] Sign out and in again; your data is still there.

## 4. Chaser tests (when asked)
Create a chase with a made-up client, using **your own email and your own phone number** (the founder must have added them first).

- [ ] **Email only:** the email arrives in your inbox and the Activity shows it.
- [ ] **WhatsApp only:** a WhatsApp message arrives on your phone. It has four buttons: **Upload documents**, **Sending today**, **Need more time**, **Stop reminders**.
  - Tap **Upload documents**: a page opens with no login. Add a **CSV or Excel bank statement**. You see "Received" and a thank-you, and the file appears in the app under Documents with its fields read. (A photo or PDF also uploads and appears, but no fields are read yet.)
  - Tap **Sending today**: you get a thank-you reply. In the app, the chase's Activity says the client is sending it today.
  - Tap **Need more time**: you get "When can you send it?" with **Tomorrow / In 3 days / Next week**. Tap one; the Activity shows the promised date.
  - Tap **Stop reminders**: you get a confirmation. The Activity says reminders are off for this client.
- [ ] **Email + WhatsApp:** both arrive.
- [ ] Send a file on WhatsApp (use a CSV or Excel file if you want its fields read): you get "Received your file. Thank you."
- [ ] A WhatsApp chase with **no phone number** is refused with a clear message.
- [ ] Mark a chase **Resolved**: no more reminders arrive.
- [ ] The next reminders (day 3 and day 7) use different wording: a gentle reminder, then a final reminder. The founder can speed this up for you.

## 5. Upload link tests
Open the upload link from a reminder on your **phone**.
- [ ] The page is easy to read and the buttons are easy to tap.
- [ ] A CSV or Excel file, a PDF and a photo all upload (only CSV and Excel are read for now). A made-up `.exe` or a renamed text file is refused with a clear message.
- [ ] A file over 15 MB is refused.
- [ ] Open the link a day after the expiry date the page shows (founder can help): it says the link has expired.

## 6. Credits (when asked)
Test accounts are not charged, so you will see **Test account: not charged** in Settings → Billing. The founder will run paid-path tests on a separate test link.

## 7. If something looks wrong
1. Take a screenshot.
2. Write: what you did, what you expected, what happened, the time, and which browser/phone.
3. Send it to the founder labelled:
   - **BLOCKER** – you could see real data, something was charged, or a real person got a message.
   - **MAJOR** – a feature does not work.
   - **MINOR** – wording or layout.
4. **Stop and tell the founder at once** if you ever see a client you do not recognise, a real payment page asking for real money, or a message that reached someone who is not on your team.

## 8. What to say when you finish
Reply to the founder with **Passed** (and the list of sections you ran) or the list of problems.
