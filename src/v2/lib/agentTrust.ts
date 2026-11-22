/**
 * Trust signals for what the agents do (pure, so the wording and the rules are tested).
 *
 * Three rules, from docs/UX_AGENTIC_MICROINTERACTIONS.md:
 *  1. Never a bare "Done" or a bare percentage: a confidence level in words, with the reason it is not higher.
 *  2. The weight of the interaction follows the risk and reversibility of the action: a reversible one gets a light cue and proceeds;
 *     one that cannot be taken back (a message to a client, a write into the books, a sign-off) gets a pause window or an explicit gate.
 *  3. A hand-off is a visible state change that says what was done, why it stops here, and who has it now.
 */

export type ConfidenceLevel = "sure" | "likely" | "check" | "unsure";
export interface ConfidenceView { level: ConfidenceLevel; label: string; tone: "good" | "info" | "warn" | "bad"; percent: number }

/** A score in [0,1] as a level in words. The thresholds match the review queue's 70% line: below it a person sees the row. */
export function confidenceView(score: number): ConfidenceView {
  const s = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  const percent = Math.round(s * 100);
  if (s >= 0.9) return { level: "sure", label: "Confident", tone: "good", percent };
  if (s >= 0.7) return { level: "likely", label: "Likely right", tone: "info", percent };
  if (s >= 0.4) return { level: "check", label: "Check this", tone: "warn", percent };
  return { level: "unsure", label: "Not sure", tone: "bad", percent };
}

export type Gate = "light" | "undo" | "confirm";
export interface ActionRisk { id: string; label: string; reversible: boolean; gate: Gate; /** Seconds the person can take it back, for an "undo" gate. */ undoSeconds?: number; note: string }

/**
 * Every agent or agent-assisted action, by how far it can be taken back. The screens read the gate from here instead of each deciding on its own.
 */
export const ACTIONS: ActionRisk[] = [
  { id: "extract_read", label: "Read a document into lines", reversible: true, gate: "light", note: "Low-confidence lines wait in the Review Queue. A file can be read again." },
  { id: "recon_match", label: "Match bank lines to books", reversible: true, gate: "light", note: "Start over clears automatic matches; manual ones stay. A self-check runs after every run." },
  { id: "memory_learn", label: "Remember a correction for next month", reversible: true, gate: "light", note: "Shown as 'remembered'; rules can be removed." },
  { id: "draft_mis", label: "Draft the MIS", reversible: true, gate: "light", note: "A draft until a partner signs it off." },
  { id: "ledger_map_confirm", label: "Confirm the ledger map", reversible: true, gate: "confirm", note: "Partner or manager only; confirming again changes it." },
  { id: "party_master_save", label: "Save the party master", reversible: true, gate: "confirm", note: "Identity fields only; saved by a partner or manager." },
  { id: "chase_send", label: "Send a request to a client", reversible: false, gate: "undo", undoSeconds: 8, note: "Goes out by WhatsApp or email. A short window to take it back before it leaves." },
  { id: "chase_resolve", label: "Close a chase", reversible: true, gate: "light", note: "Stops follow-ups; the chase can be reopened." },
  {
    id: "query_send",
    label: "Send a question to a client",
    reversible: false,
    gate: "undo",
    undoSeconds: 8,
    note: "A grouped question about open items goes by WhatsApp or email. A short window to take it back before it leaves; a person approves every message at first.",
  },
  {
    id: "classify_suggest",
    label: "Suggest how to treat a line",
    reversible: true,
    gate: "light",
    note: "A suggestion with its reason. Nothing changes until a person accepts it.",
  },
  {
    id: "review_run",
    label: "Run the pre-sign-off review",
    reversible: true,
    gate: "light",
    note: "Read-only: it lists what to check and edits nothing.",
  },
  {
    id: "conductor_plan",
    label: "Plan the next step of a close",
    reversible: true,
    gate: "light",
    note: "Works out the next step and who has it. It creates no message and changes no figure.",
  },
  {
    id: "gst_supplier_send",
    label: "Send a GST follow-up to a supplier",
    reversible: false,
    gate: "confirm",
    note: "A message to a third party about missing credit. A partner approves each one, and it needs its own consent and compliance review.",
  },
  {
    id: "rule_promote",
    label: "Let a rule act with less supervision",
    reversible: true,
    gate: "confirm",
    note: "Partner only. Allowed only after enough decisions with almost no overrides; any override moves it back down.",
  },
  { id: "mis_signoff", label: "Sign off an MIS", reversible: false, gate: "confirm", note: "Partner only; a correction can be requested after." },
  { id: "period_lock", label: "Lock a month", reversible: false, gate: "confirm", note: "Partner only; the lock records a fingerprint and goes stale if inputs change." },
  { id: "books_post", label: "Write an entry into Tally or Zoho", reversible: false, gate: "confirm", note: "Off by default; preview, partner approval, and the client's own switch are all needed." },
];

export const riskOf = (id: string): ActionRisk => ACTIONS.find((a) => a.id === id) ?? { id, label: id, reversible: false, gate: "confirm", note: "Unknown action: treated as irreversible." };

/** An action nobody has classified is treated as irreversible, so a new one starts with a gate rather than without. */
export const needsPause = (id: string): boolean => riskOf(id).gate !== "light";

/* ── the pause window ── */

export interface Undoable { cancel: () => boolean; done: Promise<"ran" | "cancelled"> }

/** Runs `run` after `seconds`, unless cancelled first. Timers are injectable so the window is tested without waiting. */
export function undoable(run: () => void | Promise<void>, seconds: number, timers: { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void } = { set: setTimeout, clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }): Undoable {
  let state: "waiting" | "ran" | "cancelled" = "waiting";
  let finish!: (v: "ran" | "cancelled") => void;
  const done = new Promise<"ran" | "cancelled">((r) => { finish = r; });
  const h = timers.set(() => { if (state !== "waiting") return; state = "ran"; void Promise.resolve(run()).finally(() => finish("ran")); }, Math.max(0, seconds) * 1000);
  return { cancel: () => { if (state !== "waiting") return false; state = "cancelled"; timers.clear(h); finish("cancelled"); return true; }, done };
}

/* ── a hand-off, in words ── */

export interface Handoff { title: string; did: string; why: string; now: string }

/** The chase that stopped: what the Chaser did, why it stops, who has it. */
export function chaseHandoff(c: { followUps: number; type: string; contact: string; timeline: { at: string; text: string }[] }): Handoff {
  const last = [...c.timeline].reverse().find((t) => !/escalat|created/i.test(t.text));
  return {
    title: "Handed to you",
    did: `The Chaser asked ${c.contact || "the client"} for ${c.type.toLowerCase()}${c.followUps ? ` and followed up ${c.followUps} time${c.followUps === 1 ? "" : "s"}` : ""}${last ? `. Last: ${last.text.replace(/\.$/, "")}` : ""}.`,
    why: "There was no reply, and the Chaser does not keep sending after the last follow-up.",
    now: "A person should call or send it by hand. Mark it resolved when the document arrives.",
  };
}
