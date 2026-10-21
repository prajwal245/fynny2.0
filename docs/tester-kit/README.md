# FynHelp Tester Kit

One workbook for the whole tester routine: **`FynHelp_Tester_Sheet.xlsx`**.
Check in, do your tasks, log what you find, check out. About **2 to 3 hours a day**, no experience needed.

If you only read one thing, read section 1.

---

## 1. Your day in five steps

| When | Open this sheet | Time | What to do |
|---|---|---|---|
| **Start of day** | **Check-in** | 2 min | Add one row: date, your name, start time, which Day of the plan you are on. |
| **Work** | **Tasks** | 2 to 3 hours | Do today's Day, in order. Change **Status** as you go: Not started, In progress, Done, Blocked. |
| **Found something broken** | **Bugs** | 3 to 5 min each | One row per problem, straight away, with a screenshot and a Severity. |
| **Confusing, slow or ugly, but it works** | **UX Notes** | 2 min each | Say what confused you and what you expected. |
| **End of day** | **Check-out** | 5 min | End time, tasks done, what is left and why, one thing you learned, plan for tomorrow. |
| *Team lead only* | **Dashboard** | | Live summary. Testers look, never type. |

The **READ ME** tab inside the workbook says the same thing in one page. The **Lists** tab is hidden; it feeds the dropdowns.

---

## 2. Bug or UX Note? Ask one question

- **Is it wrong or broken?** A number is wrong, a button does nothing, a page crashes, something you saved is gone. → **Bugs**.
- **Does it work, but feels bad?** Confusing words, too many clicks, slow, hard on a phone, you did not know what to do next. → **UX Notes**.
- **Not sure?** File a bug with Severity **Minor**. Your lead will move it. A wasted row costs nothing; a missed bug does.

---

## 3. Colour codes (the same on every sheet)

The palette is FynHelp's own: deep maroon, brand red, cream, with green for good.

| Colour | Meaning |
|---|---|
| **Deep maroon, white text** | Column headings. Do not type. |
| **Cream cell** | Your cell. Type here. |
| **Grey italic cell** | Fills itself in. Do not type. |
| **Beige italic row** | An *EXAMPLE* row showing the format. Copy its style, then ignore it. |
| **Green** | Good: Done, Closed, Fixed, a day of 2 hours or more. |
| **Amber** | Needs attention: In progress, New bug, Minor, Medium impact, a day under 2 hours. |
| **Red (soft)** | Stuck or serious: Blocked, Reopened, High impact. |
| **Solid red, white text** | Severity **Major** bug. |
| **Solid maroon, white text** | Severity **Blocker** bug. Message your lead as well. |
| **Light grey** | Parked: Skipped, Duplicate, Cosmetic, Low impact. |

---

## 4. Severity: how bad is the bug?

| Severity | Use when | Example |
|---|---|---|
| **Blocker** | You cannot go on, data is lost, a money figure is wrong, or something private is shown to the wrong person. | MIS revenue does not equal the transactions behind it. |
| **Major** | The feature fails, but there is a way round. | Excel export is empty; PDF works. |
| **Minor** | It works, but something is off. | Wrong message after an upload; a filter forgets your choice. |
| **Cosmetic** | Looks wrong. | Spelling, spacing, alignment, a cut-off word. |

---

## 5. A good bug in 60 seconds

1. **Where:** the screen name as the menu calls it (for example *Documents*).
2. **Title:** one line that says what is wrong. Good: *"Upload shows 8 transactions, file has 7"*. Bad: *"Upload broken"*.
3. **Steps:** numbered and short. A person who has never seen the app must be able to repeat them.
4. **Expected vs Actual:** what should happen and what did, with real numbers.
5. **Proof:** a screenshot or short recording, saved in the shared folder and named with the task ID (for example `D2-02.png`). Paste the link.
6. **Severity:** pick from the dropdown. Unsure? Pick one lower and say why in the title.

---

## 6. Golden rules

- Use **only** the test site, the test account and the sample files. **Never real client data.**
- Never connect a real Gmail, WhatsApp, Zoho or Tally account, never pay with a real card, never message a real person.
- Update the sheet **as you go**, not at the end of the day.
- **One problem = one row.**
- Stuck for **15 minutes**? Mark the task **Blocked**, write why in Notes, message your lead, move to the next task.
- Never delete a row. Wrong entry? Fix the cell, or mark the bug **Duplicate**.
- Only edit your own rows, and only the cream cells.

---

## 7. Week 1 plan (about 2.5 hours of tasks a day, plus 10 to 15 minutes of check-in and check-out)

Nobody needs experience. Day 1 teaches the product and the sheet; each later day adds one skill.

| Day | Theme | You will | Task time |
|---|---|---|---|
| **1** | Meet the product | Set up the kit, read the product guide, create a test account and a first client, click every menu item, practise filing one bug, check on your phone. | 150 min |
| **2** | Documents | Download the sample pack, upload a bank statement and a Tally day book, check numbers against the file, try bad uploads, clear the Review Queue. | 150 min |
| **3** | Recon and MIS | Resolve exceptions, trace matched lines to their source, generate the Monthly MIS, add it up by hand, export it three ways, sign it off. | 165 min |
| **4** | Chaser and Settings | Create and send a follow-up, tour Settings and the Tally connector screen, check pricing against the website, repeat in a second browser. | 150 min |
| **5** | The whole site | Sweep the website, test sign-in protection on your own account, keyboard-only and zoom checks, speed notes, retest fixed bugs, week wrap-up. | 150 min |
| Bonus | Finished early? | Five optional tasks (break-it session, privacy page, Hindi names, slow internet, the bigger July pack). | 100 min |

The full list, with steps and what should happen, is in the **Tasks** sheet. Task IDs look like `D2-05` (Day 2, task 5).

### Test data

- Open **`/samples`** on the test site. Download the September 2026 pack for the client *Sundara Textiles Pvt Ltd*.
- Expected results, so you know what "right" looks like:
  - Bank statement: **7 transactions read, 1 line sent to Review** (the USD Stripe payout). Closing balance **4,86,484.30**.
  - Tally day book: **6 transactions read**, and Recon runs on its own.
  - Recon: **5 matched, 2 exceptions** (Cafe Coffee Day card spend, and the 17.70 SMS charges).
  - Monthly MIS (if you decide exceptions as in the walkthrough): revenue **1,65,000**, expenses **78,515**, net **86,484**. If yours differs, note which exceptions you decided.

---

## 8. For the team lead

**Set up once (10 minutes)**
1. In the **READ ME** tab, fill the Set-up box (test site link, test login, your contact, shared screenshot folder) and replace the example names in **Team** with your testers' names. Those names feed every Tester dropdown and the Dashboard.
2. Create a shared screenshot folder and paste its link.
3. Upload the workbook to Google Sheets or OneDrive, or keep it on a shared drive, and share it as **edit**. Dropdowns, colours and formulas carry over to both. Give each tester a short walk-through of section 1.

**Every day (10 minutes)**
1. Open **Dashboard**. Red = a Blocker or Major bug still *New*, or any bug *Reopened*. Amber on Check-ins/Check-outs = someone checked in but not out.
2. In **Bugs**, set Status to **Seen** once you have read a bug, **Fixed** when a developer fixes it (the tester retests), **Duplicate** if it repeats another. Use *Lead's note* to answer.
3. Skim **UX Notes**. Recurring confusion is a product signal.
4. Look at **Check-out**: hours under 2 show amber, a Blockers entry shows red.

**Things to know**
- IDs (`BUG-001`), planned minutes, start time, hours and counts are formulas. Do not overwrite the grey cells.
- Bugs holds 300 rows, the other logs 200. Copy the workbook for week 2 and clear the cream cells.
- The sample pack and expected results come from `public/samples`; update the Tasks sheet if those change.
- "Tasks done" on the Dashboard counts a tester's name written in the task's *Notes* column, so ask testers to sign off a task by putting their name there when several people share one sheet.

---

## Files

| File | What it is |
|---|---|
| `FynHelp_Tester_Sheet.xlsx` | The workbook: READ ME, Check-in, Tasks, Bugs, UX Notes, Check-out, Dashboard. |
| `README.md` | This file. |
