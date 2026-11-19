/**
 * The one result shape every Verify check returns, so the screen, the Close checklist and the evidence pack read them the same way.
 *
 * A check says exactly what it compared, from which file and where in it, by which rule, and what a person decided about each
 * difference. A check that cannot run says which file it needs. Nothing in a check is posted, filed or changed anywhere.
 */
export type VerifyKind = "bank" | "opening" | "gst_sales" | "gst_outward" | "gst_itc" | "gst_rcm" | "billwise";

/** passed: nothing open. differences: something is open. cannot_run: a file is missing or did not tie out. stale: an input changed since. */
export type VerifyStatus = "passed" | "differences" | "cannot_run" | "stale";

export interface VerifySource {
  /** The file as the person knows it. */
  document: string;
  /** Where in it: a sheet and row, a page, or the line's own label. */
  where: string;
}

export interface VerifyFigure {
  label: string;
  amount: number;
  source: VerifySource;
}

export type VerifyLineState = "matched" | "differs" | "only_in_a" | "only_in_b" | "explained";

export interface VerifyDecision {
  by: string;
  role: string;
  at: string;
  reason: string;
}

export interface VerifyLine {
  id: string;
  label: string;
  state: VerifyLineState;
  /** Both sides when both exist, one when only one does. */
  figures: VerifyFigure[];
  /** b minus a, in rupees; 0 when matched. */
  difference: number;
  /** The rule, so a CA can see why a line was flagged. */
  ruleId: string;
  ruleText: string;
  decision?: VerifyDecision;
}

export interface VerifyMissing {
  file: string;
  why: string;
  howToGetIt: string;
}

export interface VerifyTotals {
  checked: number;
  matched: number;
  differs: number;
  explained: number;
  /** Differences with no decision yet, and lines present on one side only with no decision. */
  open: number;
}

export interface VerifyCheck {
  id: string;
  kind: VerifyKind;
  title: string;
  status: VerifyStatus;
  /** One plain sentence for the top of the screen: what is true now. */
  summary: string;
  missing: VerifyMissing[];
  lines: VerifyLine[];
  totals: VerifyTotals;
  /** Hash of everything the check read. If the inputs change, the stored result is stale and must be run again. */
  inputsHash: string;
  /** What was found and what was not, for the person who uploaded the files. */
  notes: string[];
}

/** A canonical JSON string: object keys sorted, so the same inputs always give the same text. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** A fast, stable 53-bit hash (cyrb53) of any JSON-able value, as 14 hex characters. It detects change; it is not a security hash. */
export function inputsHash(parts: unknown): string {
  const s = stableStringify(parts);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function totalsOf(lines: VerifyLine[]): VerifyTotals {
  const count = (s: VerifyLineState) => lines.filter((l) => l.state === s).length;
  return {
    checked: lines.length,
    matched: count("matched"),
    differs: count("differs"),
    explained: count("explained"),
    open: lines.filter((l) => (l.state === "differs" || l.state === "only_in_a" || l.state === "only_in_b") && !l.decision).length,
  };
}

export function statusOf(lines: VerifyLine[], missing: VerifyMissing[]): VerifyStatus {
  if (missing.length) return "cannot_run";
  return totalsOf(lines).open > 0 ? "differences" : "passed";
}

/** True when the stored result was computed from different inputs than the ones now on file. */
export const isStale = (check: Pick<VerifyCheck, "inputsHash">, currentHash: string) => check.inputsHash !== currentHash;

/** The same check, marked stale when its inputs changed; a stale check never reads as passed. */
export function withStaleness<T extends VerifyCheck>(check: T, currentHash: string): T {
  return isStale(check, currentHash) ? { ...check, status: "stale", summary: "A file changed since this was run. Run it again before relying on it." } : check;
}
