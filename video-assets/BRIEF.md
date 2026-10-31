# FynHelp video: what is real today

## Brand (from src/v2/ui.tsx and the logo PNGs)
- Beige: #EADBC8  (page background #F7F6F3, cream #F3EADC)
- Red: #D92B2B  (deep red #8E1B1F)
- Text: #141210  (on dark backgrounds: #FAF7F2)
- Logo red #E5322D, cream #FDEFE2 (PNG, transparent)

## Agents that exist: use ONLY these
| Card | Real name | What it does |
|---|---|---|
| 1 | Extract | Reads an uploaded bank statement or Tally day book, counts transactions ("7 transactions structured") |
| 2 | Recon | Runs by itself once books are in. Matches exact, fuzzy and rule-based. Leaves exceptions with reason codes |
| 3 | Narrate | Generates the client-ready MIS |
| 4 | Chaser | Email/WhatsApp follow-ups to clients for missing documents |

There is NO separate "Intake" or "Exceptions" agent. Exceptions are Recon's output plus a queue a person decides. Sign-off is a partner step, not an agent.
Rename recording 3 to "Recon: exceptions" and use Recon's colour for it. Rename recording 1 to "Extract".

## Demo data (invented, safe)
Sample pack in this folder: client Sundara Textiles Pvt Ltd, Sept 2026.
Upload the statement CSV, then the Tally day book. Expected: 7 transactions read, 5 of 7 matched, 2 exceptions, closing balance 4,86,484.30.
Use "Rao Steels Accounts" etc. only as WhatsApp contact names on the phone.
