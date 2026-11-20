# Agentic micro-interactions: how FynHelp earns trust (21 Nov 2026)

**Core thesis.** People abandon an AI agent in the first session when the only choices are to accept it blindly or to ignore it. Calibrated trust comes from small, moment-specific signals that say *what* the agent is doing, *why*, and *how sure* it is, with a weight that follows the risk of the action.

## The four patterns
1. **Graduated confidence.** Never a bare "Done" or a bare percentage. A level in words (Confident, Likely right, Check this, Not sure) with the number beside it and the reason it is not higher. Code: `confidenceView()` and `ConfidenceBadge`.
2. **Action-level narration.** No generic spinner: one line saying what is happening ("Matching 418 bank lines to the Day Book"). Silence reads as either false confidence or a crash. Code: the run cards and `ShimmerText` carry the stage.
3. **Inline verification.** Every figure opens the lines behind it; a source is one click, not a trip elsewhere.
4. **First-class hand-offs.** When an agent stops and a person takes over, it is a visible state change that says what was done, why it stopped, and who has it now. Code: `HandoffNote`, `chaseHandoff()`.

## The reversibility rule
The weight of the interaction follows the risk.

| Action | Reversible? | Friction |
|---|---|---|
| Read a document, match lines, remember a correction, draft the MIS | Yes | Light cue: confidence in words and a one-line status; the agent proceeds |
| Close a chase | Yes (reopen) | Light |
| Confirm the ledger map, save the party master | Yes (change again) | Confirm, by a partner or manager |
| **Send a request to a client** | **No** | **Pause window: 8 seconds, visible, with Undo** |
| Sign off an MIS, lock a month | No | Explicit confirmation, partner only |
| Write an entry into Tally or Zoho | No | Off by default; preview, partner approval and the client's own switch |

The table is code (`ACTIONS` in `src/v2/lib/agentTrust.ts`), and the screens read the gate from it. A test makes sure an irreversible action never has only a light cue, and an action nobody has classified is treated as irreversible.

## Audit: silent actions (21 Nov 2026)
Read from the code and the screens; "gap" means a cue is missing, not that something is broken.

| Where the agent acts | Cue today | Status |
|---|---|---|
| Extract reads an upload | Run card with the stage; Activity feed; statement check Passed / Failed / Not available | Has cue |
| Review Queue lines the Extract agent was unsure about | Was a bare percentage; **now confidence in words with the reason on hover** | Fixed |
| Recon matches | Run card; self-check line; exception reasons and suggested matches | Has cue. Gap to check: how each matched line was matched is not shown in the list |
| Narrate drafts the MIS | Draft until signed; every figure links to its source | Has cue |
| Chaser first reminder (new chase, or "Request what is missing") | Was immediate; **now 8 seconds with Undo** | Fixed |
| Chaser scheduled follow-ups | Timeline entry per send; escalation shown in Needs you | Gap: a scheduled follow-up goes out with no pause by design. A daily digest of what the Chaser sent would close it |
| Chaser stops and hands over | Was one line in the detail; **now a hand-off note: done, why it stopped, now** | Fixed |
| "Processing complete" WhatsApp to the client, once per file | Recorded in Activity; test firms simulated; per-client do-not-disturb | Gap: automatic and external. Keep the opt-out visible |
| Learning from a correction | "Your answer is remembered" in the Needs you text | Has cue |
| Writing into Tally or Zoho | Off | Gated |

## Handoffs
- Chaser to person: `HandoffNote` in the chase detail, and the item in Needs you under "Call or chase".
- Agent to partner: MIS ready for sign-off appears under "Sign off", partner only.
- Add one whenever a new agent can stop and wait for a person.

## When adding an agent or an action
1. Add it to `ACTIONS` with its reversibility and gate.
2. Give it a one-line narration while it runs.
3. Show confidence in words wherever it produces a judgment.
4. If it can stop, write its hand-off (`did`, `why`, `now`).
5. If it leaves the firm and cannot come back, use `sendWithUndo()`.
