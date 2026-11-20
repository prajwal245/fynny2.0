/**
 * "Needs you", arranged the way a CA works the day (pure, so the rules are tested on their own).
 *
 *  - Grouped by the KIND of work, because each kind is done in one sitting with one mindset: calling, fixing, deciding, signing.
 *  - The order follows the role. A partner's day starts with what only a partner can do (sign off) and what has gone cold (the client who did not
 *    answer); a junior's starts with what blocks the month (a file that failed) and the judgment calls (exceptions, lines to confirm).
 *  - Each group shows its first few items and says how many more, so a long list never becomes a wall.
 *  - Every item can be snoozed until tomorrow; a chase the person has dealt with can be closed from here. Nothing else is closed from here: an exception
 *    or a line to confirm goes away only when it is actually decided, so the list never hides real work.
 */
export type NeedKind = "chase" | "doc" | "corr" | "ex" | "exo" | "rv" | "mis" | "so";
export type NeedGroupKey = "signoff" | "call" | "fix" | "decide";

export interface NeedLike { key: string; rank: number }

export const kindOf = (key: string): NeedKind => key.split(":")[0] as NeedKind;

const GROUP_OF: Record<NeedKind, NeedGroupKey> = { so: "signoff", mis: "signoff", chase: "call", doc: "fix", corr: "fix", ex: "decide", exo: "decide", rv: "decide" };

export const GROUP_META: Record<NeedGroupKey, { label: string; blurb: string }> = {
  signoff: { label: "Sign off", blurb: "Only a partner can do these." },
  call: { label: "Call or chase", blurb: "The client has not answered." },
  fix: { label: "Fix first", blurb: "These hold up the month." },
  decide: { label: "Decide", blurb: "Judgment calls the agents left for you." },
};

const ORDER: Record<"Partner" | "Junior", NeedGroupKey[]> = {
  Partner: ["signoff", "call", "fix", "decide"],
  Junior: ["fix", "decide", "call", "signoff"],
};

export interface NeedGroup<T extends NeedLike> { key: NeedGroupKey; label: string; blurb: string; items: T[] }

export function groupNeeds<T extends NeedLike>(items: T[], role: "Partner" | "Junior"): NeedGroup<T>[] {
  return ORDER[role]
    .map((key) => ({ key, ...GROUP_META[key], items: items.filter((i) => GROUP_OF[kindOf(i.key)] === key).sort((a, b) => a.rank - b.rank) }))
    .filter((g) => g.items.length > 0);
}

export type CloseOption = { id: "snooze" | "chase_resolved"; label: string; hint: string };

/** What can be done to an item without opening it, by its kind. */
export function closeOptions(key: string): CloseOption[] {
  const out: CloseOption[] = [{ id: "snooze", label: "Remind me tomorrow", hint: "Hides it until tomorrow. It comes back if it is still open." }];
  if (kindOf(key) === "chase") out.unshift({ id: "chase_resolved", label: "The client has sent it: mark resolved", hint: "Closes the chase and stops the follow-ups." });
  return out;
}

/* ── snooze: until the start of the next day, remembered in this browser ── */

export type Snoozed = Record<string, number>;
export const tomorrow = (now = Date.now()): number => { const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime(); };

export function visible<T extends NeedLike>(items: T[], snoozed: Snoozed, now = Date.now()): { shown: T[]; hidden: T[] } {
  const shown: T[] = [], hidden: T[] = [];
  for (const i of items) ((snoozed[i.key] ?? 0) > now ? hidden : shown).push(i);
  return { shown, hidden };
}

/* ── the next date that matters ── */

/** "October 2026" → "2026-10". */
export function periodKey(label: string): string | null {
  const d = new Date(`1 ${label}`);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const DEADLINES: { key: string; label: string; day: number }[] = [
  { key: "tds", label: "TDS", day: 7 },
  { key: "gstr1", label: "GSTR-1", day: 11 },
  { key: "gstr3b", label: "GSTR-3B", day: 20 },
];

/** The next of the month's three statutory dates that has not passed, with how many days are left. After the 20th: nothing is due for that month. */
export function nextDeadline(period: string, now = new Date()): { label: string; due: string; days: number } | null {
  const key = periodKey(period);
  if (!key) return null;
  const [y, m] = key.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const d of DEADLINES) {
    const t = new Date(ny, nm - 1, d.day).getTime();
    if (t >= today) return { label: d.label, due: `${ny}-${String(nm).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, days: Math.round((t - today) / 86_400_000) };
  }
  return null;
}
