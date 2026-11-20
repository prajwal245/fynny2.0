---
name: agentic-micro-interactions
description: Use when designing or changing any screen where an AI agent acts, decides, hands off or sends something (extraction, reconciliation, the Chaser, MIS drafts, books posting). Applies graduated confidence signals, one-line narration, inline verification and hand-off cues, scaled by how reversible the action is.
---

# Agentic micro-interactions

Read `docs/UX_AGENTIC_MICROINTERACTIONS.md` first; it has the audit and the reversibility table. The code is in `src/v2/lib/agentTrust.ts`, `src/v2/lib/sendWithUndo.tsx` and `src/v2/components/kit/Kit.tsx` (`ConfidenceBadge`, `HandoffNote`).

## Rules
1. **Never binary trust.** No bare "Done", no bare percentage. Show a level in words with the number and the reason: `ConfidenceBadge`.
2. **No silent actions and no generic spinners.** One line saying what the agent is doing, and to what ("Matching 418 bank lines to the Day Book").
3. **Verify in place.** Every figure opens the lines behind it.
4. **Hand-offs are state changes.** Say what was done, why it stopped, and who has it now: `HandoffNote`.
5. **Weight follows reversibility.** Look the action up in `ACTIONS`.
   - Reversible: a light cue, and the agent proceeds.
   - Cannot be taken back and leaves the firm: `sendWithUndo()`, a visible pause with Undo.
   - Cannot be taken back inside the product (sign-off, lock, write to the books): an explicit confirmation by the right role.
   - Not classified: treat as irreversible.

## Before shipping a screen
- Is there a place where the agent acts with no uncertainty state and no one-line status? Fix it.
- Is the action in `ACTIONS`, with the right gate?
- If it can stop for a person, does the person see an explicit hand-off, and does the receiving person know what was done?
- Add or update the test in `tests/unit/agent-trust.test.ts`.
