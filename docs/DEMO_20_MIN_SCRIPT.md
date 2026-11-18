# 20-minute FynHelp demo: founder script (qualify, build trust, show, close)

Audience: a partner or manager at a CA firm. Goal: they leave believing "my team would close books faster, and I can trust what it tells me", and they agree to a pilot on one real client.
Pack: `demo/sample-pack/` (fictional client Sunrise Traders Private Limited, September 2026). Download it from https://www.fynhelp.com/samples. Keep all seven files in one folder. Use a clean firm with no Sunrise client.

Principles for the whole call
- Ask before you show. Whatever they say in the first five minutes decides which two or three moments you linger on.
- Say "AI reads, code proves, people approve" once, then show it.
- Be plain about limits. A CA firm trusts the founder who says "that is not built yet" more than the one who says yes to everything.
- Talk about their month end, not our features.

## Before the call (10 minutes, once)

1. Use a fresh firm with no Sunrise client, and the seven files in one folder (https://www.fynhelp.com/samples).
2. **Invite one teammate** in Settings, so you can assign an exception to a real person during the demo. Alone you can only assign to yourself.
3. After you add Sunrise, set its **expected bank accounts** (HDFC 5678 and ICICI 4411) so the "all expected statements received" step can also flag a missing account. Without this the step still ticks from the statements uploaded.
4. Open the app once to warm it, then sign out and in again so the first screen is clean.

Timing at a glance
| Time | Block |
|------|-------|
| 0:00 to 2:00 | Founder intro and why this call is useful for them |
| 2:00 to 5:00 | Qualification: six questions |
| 5:00 to 7:30 | Add the client and a statement that proves itself |
| 7:30 to 9:00 | A statement that is refused |
| 9:00 to 13:30 | Reconciliation and three decisions |
| 13:30 to 15:30 | Work the exceptions like a team |
| 15:30 to 17:00 | Month-end close |
| 17:00 to 18:00 | GST, only if they said GST matters |
| 18:00 to 20:00 | Trust, limits, pilot ask |

---

## 0:00 to 2:00  Founder intro (trust first)

Open friendly and short. Fill the brackets yourself with true details; do not invent credentials.

Say:
"Thank you for the time, [Name]. I am [your name], I started FynHelp. [One true sentence on why you built it, for example the month-end problem you saw at a firm you worked with.]
Here is how I would like to use the twenty minutes. First, five minutes where I ask about how your firm closes a month, because I would rather show you what is relevant than everything. Then about twelve minutes on the product with fictional data, so nothing of any client is on screen. Then three minutes where you tell me honestly whether it is worth a trial. If it is not a fit, I will say so myself. Is that fine?"

Why it works: it sets an agenda, gives them control of the end, and promises honesty before any pitch.

Do not: open with a feature list, a funding story or a claim like "100% accurate".

## 2:00 to 5:00  Qualification: ask, listen, note

Ask these in order. Write the answers down where they can see you doing it; it signals respect.

1. "How many active clients do you do monthly books or bank reconciliation for, and how many people work on them?" (Size and seats. Under about 10 clients, they may not feel the pain yet.)
2. "What do you work from: Tally, Zoho, Busy, something else? And do clients send you bank PDFs, Excel, or net-banking exports?" (Fit. Tally Day Book and text-based bank PDFs are the strongest today.)
3. "Walk me through last month. Which client took the longest to close, and what slowed it?" (Pain in their own words. Quote it back later.)
4. "When a reconciliation has a difference, how does your team find out, and who reviews it before it goes to the client?" (Review process, and whether a second partner or manager exists.)
5. "Who decides on a tool like this, and who would use it day to day?" (Decision maker versus champion. If the decision maker is absent, plan a second short call.)
6. "If this worked well, what would make it an obvious yes: time saved, fewer errors, or something your clients can see?" (Success criteria, which become your pilot goal.)

Then qualify the fit in your head (do not say it aloud):
- Strong: 15 or more clients, Tally, a team of 3 or more, a stated pain on month end.
- Possible: under 15 clients or mixed tools. Show it, but position it as a pilot on one client.
- Weak: no recurring bank reconciliation work, or only scanned image statements. Be honest that the scanned-statement AI reader is available but not yet proven by us on real files.

Say before moving on:
"That is very helpful. Based on what you said about [their pain from Q3], I will focus on [two moments from below]. Let me show you."

## 5:00 to 7:30  Add the client and a statement that proves itself

Do: Clients, Add client, "Sunrise Traders Private Limited". Documents, upload `01_HDFC_Current_Sep2026.pdf`. You do not choose a type: FynHelp reads the content and files it as Bank or Books itself, and says which.
Say: "One client is one workspace: documents, reconciliation, exceptions, the close checklist, GST."
When it finishes: "26 lines. It did not just say done. It checked the running balance line by line and tied to the bank's own printed totals: 14 debits, 12 credits. That check is the part you can sign under."

## 7:30 to 9:00  A statement that is refused

Do: upload `03_HDFC_Current_Sep2026_one_line_missing.pdf`.
Say: "Same statement with one line dropped, the way a scan or an AI can silently do. It shows **Held**. It says the bank prints 14 debits and we read 13, and the totals are Rs 3,10,000 short. Nothing downstream uses it until a partner accepts it with a written reason."
Do: open the held card, point at the reason box, then remove file 03.
Land it: "That is the difference between an AI demo and something a firm can rely on."
If they raised errors or liability in Q3 or Q4, pause here and ask: "Is this the kind of safeguard your partners would want?"

## 9:00 to 13:30  Reconciliation and three decisions

Do: upload `02_ICICI_Current_Sep2026.pdf` and `04_Tally_DayBook_Sep2026.xlsx`. Optionally `05_Axis_Loan_Account_Statement.pdf` to show a loan statement is recognised and kept out of bank lines.
Do: stay on September 2026. Reconciliation **starts by itself** once the books are in; there is no Run button to press (there is a "Start over" button, used below).
Say: "32 bank lines. 26 matched on their own. Four are set aside, and I can show you why."
Do: open the set-aside list. Show the Rs 5,00,000 own-account transfer (HDFC to ICICI, same reference), the reversed UPI payment, and say the two contra legs in the Day Book were set aside with it. Click Undo once on the transfer pair to show nothing is hidden. For "undo everything", use **Start over** on the client's Recon tab: it clears the automatic matches and set-asides for the month and matches again, and keeps anything a person matched by hand.
Say: "Three identical Rs 42,500 EMIs, two Rs 50,000 receipts on the same day from different parties, and a payment with Rs 29.21 of bank charges. These usually break reconciliation tools. They matched."
Do: open the three exceptions.
1. Kaveri Fashions: bank Rs 1,00,000, books Rs 98,000. "A genuine Rs 2,000 difference. It does not guess, it asks."
2. Rs 25,000 NEFT credit from an unknown remitter. "Nobody booked it."
3. Cheque 004512 to Vasudeva, Rs 30,000, in books only, dated 30 Sep. "Issued, not presented. Timing."

## 13:30 to 15:30  Work the exceptions like a team

Do: on the cheque choose **Accept as timing**, pick the reason "Cheque issued, not yet presented", add "clears 3 Oct". Assign the Rs 25,000 to the teammate you invited and set Query sent. Add a note on Kaveri. Then open the client's **Activity**: every one of these actions is listed with the person's name.
Say: "Every change is logged and cannot be edited afterwards. Your assistant works it, the manager reviews."
Be honest: "Client query messages are copy-ready templates today. The system does not send them yet."

## 15:30 to 17:00  Month-end close

Do: Close, September.
Say: "Ten steps. Documents received, statements verified, reconciliation done and exceptions explained tick automatically from what it has proven. With the three exceptions still open, the fourth waits; once you accepted or resolved them it ticks, and the month reads **Bank and Books Closed**. It becomes Fully Closed after GST, TDS, provisions, the MIS review and the partner's sign-off. GST, TDS and provisions are ticked by a person with the right role. The partner signs off last."
Do: show auto steps ticked, manual steps open, the due-days chip.

## 17:00 to 18:00  GST (only if they said GST matters in Q3 or Q6)

Do: menu **GST reconciliation**, choose the client Sunrise, upload `06_Purchase_Register_Sep2026.xlsx` and `07_GSTR2B_Sep2026.json`, then **Save to client**. The files go into Sunrise's Documents and the result into its Activity; reload the page and choose Sunrise again to show they come back.
Say: "4 matched, one differs by Rs 1,800 of tax, and Kaveri Packers is not on the portal, so Rs 7,560 of ITC is at risk. The vendor follow-up message is ready to copy."
If GST did not matter to them, skip this and use the minute for questions.

## 18:00 to 20:00  Trust, limits, and the pilot ask

Say (limits, plainly):
"So you are not surprised later: we do not file GST, we do not post back into Tally, and client queries are not sent automatically yet. On scanned image statements, the AI reader exists, and every result goes through the same tie-out, but we have not yet proven it across many real scanned files, so I would start you on text PDFs and Excel."

Say (data and trust):
"Today's data was fictional. On a real client, data stays in your firm's workspace, each person sees what their role allows, and every action is in an activity log."

Pilot ask (use their words from Q3 and Q6):
"You told me [their slowest client and what slowed it]. Let us take that client's last closed month, run it here, and compare with what your team did by hand. If it matches, you will have a clear answer in about an hour. Which client and which month shall we use, and who from your team should be on that call?"

Close with one concrete next step and a date. Send the follow-up within an hour: the samples link, the pilot date, and a two-line recap of their stated pain and success criteria.

---

## If something misbehaves
- A file will not upload: move to the next one; every step stands alone.
- Running late: drop GST and the loan statement first, never the refused-statement moment or the trust close.
- A question you cannot answer: "I do not know yet. I will find out and reply today." Then do.

## What not to claim
No GST filing, no posting back into Tally, no automatic sending of client queries, no senior-review flow until the firm has a second partner seat, and no claim of proven accuracy on scanned statements.

## After the call (two minutes)
Note: firm size, tools, the pain quote, decision maker, objections, agreed pilot client and date. Mark the lead Strong, Possible or Weak using the Q1 to Q6 rules above.
