/**
 * The close conductor: for each client and month, the next step, who has it, what it is blocked on, and how late it is.
 * It builds on the close checklist (close/steps.ts), so it can never disagree with it. It creates no message and changes no figure.
 */
import { deriveSteps, type CloseFacts, type StepState } from "../close/steps";

export type Owner = "agent" | "junior" | "manager" | "partner" | "client";
export type Urgency = "overdue" | "due_soon" | "on_track" | "done";

export interface ClientMonth {
  clientId: string;
  clientName: string;
  /** "2026-10" */
  period: string;
  facts: CloseFacts;
  /** The Chaser's open requests for this client, when known. */
  chase?: { open: number; escalated: number };
}

export interface NextAction {
  clientId: string;
  clientName: string;
  period: string;
  stepKey: string | null;
  action: string;
  owner: Owner;
  blockedOn: string | null;
  dueOn: string | null;
  urgency: Urgency;
  daysLate: number;
}

/** Days after the due date before a step counts as overdue, and how close counts as due soon. */
export const DUE_SOON_DAYS = 2;
const istToday = (now: Date) =>
  new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );

interface OwnerContext {
  bankLines: number;
  chase?: { open: number; escalated: number };
}

function ownerOf(
  step: StepState,
  cm: OwnerContext,
): { owner: Owner; blockedOn: string | null } {
  switch (step.key) {
    case "docs_received":
      return {
        owner: "client",
        blockedOn: cm.chase?.escalated
          ? "Escalated: the client has not replied to the reminders."
          : "Waiting for the client's statements.",
      };
    case "statements_verified":
      return step.status === "blocked"
        ? {
            owner: "manager",
            blockedOn:
              "A held statement needs a partner or manager to accept it or replace the file.",
          }
        : { owner: "junior", blockedOn: null };
    case "recon_done":
      return cm.bankLines === 0
        ? { owner: "client", blockedOn: "No bank lines yet." }
        : { owner: "agent", blockedOn: null };
    case "exceptions_explained":
      return { owner: "junior", blockedOn: null };
    case "gst":
    case "tds":
    case "provisions":
      return { owner: "manager", blockedOn: null };
    case "mis_prepared":
      return { owner: "junior", blockedOn: null };
    case "mis_reviewed":
      return { owner: "manager", blockedOn: null };
    default:
      return { owner: "partner", blockedOn: null };
  }
}

export function nextAction(cm: ClientMonth, now: Date): NextAction {
  return nextActionFromSteps(
    { clientId: cm.clientId, clientName: cm.clientName, period: cm.period },
    deriveSteps(cm.period, cm.facts),
    { bankLines: cm.facts.recon.bank, chase: cm.chase },
    now,
  );
}

/** The same decision from steps that were already derived (what the Close page holds), so the two can never disagree. */
export function nextActionFromSteps(
  who: { clientId: string; clientName: string; period: string },
  steps: StepState[],
  cm: OwnerContext,
  now: Date,
): NextAction {
  const step = steps.find((s) => s.status !== "done");
  const base = who;
  if (!step)
    return {
      ...base,
      stepKey: null,
      action: "Closed. Nothing left to do.",
      owner: "agent",
      blockedOn: null,
      dueOn: null,
      urgency: "done",
      daysLate: 0,
    };
  const { owner, blockedOn } = ownerOf(step, cm);
  const late = daysBetween(step.dueOn, istToday(now));
  const urgency: Urgency =
    late > 0 ? "overdue" : late >= -DUE_SOON_DAYS ? "due_soon" : "on_track";
  return {
    ...base,
    stepKey: step.key,
    action: `${step.label}. ${step.detail}`.trim(),
    owner,
    blockedOn,
    dueOn: step.dueOn,
    urgency,
    daysLate: Math.max(0, late),
  };
}

const RANK: Record<Urgency, number> = {
  overdue: 0,
  due_soon: 1,
  on_track: 2,
  done: 3,
};
/** Most overdue first, then due soon, then by due date; closed months last. Stable for equal items. */
export function rankPortfolio(list: NextAction[]): NextAction[] {
  return [...list].sort(
    (a, b) =>
      RANK[a.urgency] - RANK[b.urgency] ||
      b.daysLate - a.daysLate ||
      (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") ||
      a.clientName.localeCompare(b.clientName) ||
      a.period.localeCompare(b.period),
  );
}

/** The "needs you" list for one role: what is theirs now, most urgent first. */
export function needsYou(list: NextAction[], owner: Owner): NextAction[] {
  return rankPortfolio(
    list.filter((a) => a.owner === owner && a.urgency !== "done"),
  );
}
