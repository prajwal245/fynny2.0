/**
 * The Portfolio worklist: one row per client, ordered by who needs a person first.
 * Pure, so the ordering rules, the filters and the stage counts are tested on their own.
 */
import { CLOSE_STAGES, type CloseStage, type CloseState } from "../store";

export type StageKey = CloseStage | "Closed";
export const FUNNEL: StageKey[] = [...CLOSE_STAGES, "Closed"];

export interface PortfolioRow {
  id: string;
  name: string;
  entityType: string;
  /** The stage the client is at, or "Closed" once the partner has signed off the MIS. */
  stage: StageKey;
  percent: number;
  steps: CloseState["steps"];
  exceptions: number;
  review: number;
  chases: number;
  next: CloseState["next"];
  /** The step the client is on right now, in the workflow's words ("Match the bank statement to the books"). */
  stepTitle: string;
}

export type SortMode = "attention" | "progress" | "name";
export const SORT_LABEL: Record<SortMode, string> = {
  attention: "Needs attention first",
  progress: "Closest to done",
  name: "Name",
};

/** A client is closed when every step is done: the partner has signed off the MIS for the month. */
export function rowOf(
  client: { id: string; name: string; entityType: string },
  close: CloseState,
  counts: { exceptions: number; review: number; chases: number },
): PortfolioRow {
  const closed = close.steps.length > 0 && close.steps.every((s) => s.done);
  return {
    id: client.id,
    name: client.name,
    entityType: client.entityType,
    stage: closed ? "Closed" : close.stage,
    percent: close.percent,
    steps: close.steps,
    ...counts,
    next: close.next,
    stepTitle: closed
      ? "Closed and signed off"
      : ((close.workflow ?? []).find((w) => w.status === "current")?.title ??
        ""),
  };
}

/** What waits on a person: exceptions weigh most (they block the MIS), then rows to confirm, then documents still with the client. */
const urgency = (r: PortfolioRow) =>
  r.stage === "Closed" ? -1 : r.exceptions * 100 + r.review * 10 + r.chases;

export function sortRows(rows: PortfolioRow[], mode: SortMode): PortfolioRow[] {
  const byName = (a: PortfolioRow, b: PortfolioRow) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const out = [...rows];
  if (mode === "name") return out.sort(byName);
  if (mode === "progress") {
    // Closed clients last: the point of this view is what can be finished next.
    return out.sort(
      (a, b) =>
        Number(a.stage === "Closed") - Number(b.stage === "Closed") ||
        b.percent - a.percent ||
        byName(a, b),
    );
  }
  return out.sort(
    (a, b) => urgency(b) - urgency(a) || b.percent - a.percent || byName(a, b),
  );
}

export function filterRows(
  rows: PortfolioRow[],
  f: { query?: string; stage?: StageKey | null },
): PortfolioRow[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.stage || r.stage === f.stage) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.entityType.toLowerCase().includes(q)),
  );
}

export function stageCounts(rows: PortfolioRow[]): Record<StageKey, number> {
  const out = Object.fromEntries(FUNNEL.map((s) => [s, 0])) as Record<
    StageKey,
    number
  >;
  for (const r of rows) out[r.stage]++;
  return out;
}

/** What is waiting, in the product's own words, or null when nothing is. */
export function waitingChips(
  r: PortfolioRow,
): { label: string; tone: "bad" | "warn" | "info" }[] {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const out: { label: string; tone: "bad" | "warn" | "info" }[] = [];
  if (r.exceptions)
    out.push({
      label: plural(r.exceptions, "exception", "exceptions"),
      tone: "bad",
    });
  if (r.review)
    out.push({
      label: plural(r.review, "row to review", "rows to review"),
      tone: "warn",
    });
  if (r.chases)
    out.push({
      label: plural(r.chases, "document chase", "document chases"),
      tone: "info",
    });
  return out;
}

/** The one button on a row, worded short enough to fit: what to do next, or open the MIS once the month is closed. */
export function rowAction(r: PortfolioRow): {
  label: string;
  title: string;
  tab: string;
} {
  if (r.stage === "Closed")
    return { label: "Open MIS", title: "Open the MIS", tab: "mis" };
  const full = r.next.label;
  const label = /^Clear /i.test(full)
    ? full
    : /^Confirm /i.test(full)
      ? `Confirm ${r.review} ${r.review === 1 ? "row" : "rows"}`
      : /recon/i.test(full)
        ? "Run recon"
        : /^Upload /i.test(full)
          ? "Upload documents"
          : /follow up/i.test(full)
            ? "Follow up"
            : /sign off/i.test(full)
              ? "Send for sign off"
              : /^Generate /i.test(full)
                ? "Generate MIS"
                : full;
  return { label, title: full, tab: r.next.tab };
}

/** What a client is waiting on, for the list: the chips, or a plain sentence when there are none. */
export function waitingText(r: PortfolioRow): string {
  if (r.stage === "Closed") return "Closed";
  if (r.stage === "MIS") return "Ready for sign off";
  return "Nothing waiting";
}

/** "3 of 12 clients closed for October 2026". */
export function closedLine(rows: PortfolioRow[], period: string): string {
  const closed = rows.filter((r) => r.stage === "Closed").length;
  return `${closed} of ${rows.length} client${rows.length === 1 ? "" : "s"} closed for ${period}`;
}

/* ── tabs: the same list seen by what it needs from a person ── */

export type TabKey = "all" | "attention" | "signoff" | "closed";
export const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "signoff", label: "Ready to sign off" },
  { key: "closed", label: "Closed" },
];

/** True when something is waiting on a person: exceptions, rows to review or documents still being chased. */
export const needsAttention = (r: PortfolioRow) =>
  r.stage !== "Closed" && r.exceptions + r.review + r.chases > 0;

export function inTab(r: PortfolioRow, tab: TabKey): boolean {
  if (tab === "attention") return needsAttention(r);
  if (tab === "signoff") return r.stage === "MIS";
  if (tab === "closed") return r.stage === "Closed";
  return true;
}

export function tabCounts(rows: PortfolioRow[]): Record<TabKey, number> {
  return {
    all: rows.length,
    attention: rows.filter((r) => inTab(r, "attention")).length,
    signoff: rows.filter((r) => inTab(r, "signoff")).length,
    closed: rows.filter((r) => inTab(r, "closed")).length,
  };
}

/** True when the one action on a row is for a person (vs the agents still working), so its button is the primary one. */
export const actionIsForYou = (r: PortfolioRow) =>
  r.stage === "MIS" || needsAttention(r);
