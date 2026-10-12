import type { Report } from "../store";

export type ReportState = { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" };

/** Newest report per client, month and template; anything older is superseded. */
export function latestIds(reports: Report[]): Set<string> {
  const seen = new Map<string, Report>();
  for (const r of reports) {
    const k = `${r.clientId}|${r.period}|${r.template}`;
    const cur = seen.get(k);
    if (!cur || r.generated > cur.generated || (r.generated === cur.generated && r.id > cur.id)) seen.set(k, r);
  }
  return new Set([...seen.values()].map((r) => r.id));
}

/** Draft, Signed off, Correction requested, Reopened or Superseded, in that order of precedence. */
export function reportState(r: Report, latest: Set<string>): ReportState {
  if (!latest.has(r.id) && !r.signedOff) return { label: "Superseded", tone: "neutral" };
  if (r.signedOff) return { label: latest.has(r.id) ? "Signed off" : "Signed off (older)", tone: "good" };
  if (r.correction && !r.correction.resolvedAt) return { label: /^Reopened/.test(r.correction.note) ? "Reopened" : "Correction requested", tone: "bad" };
  return { label: "Draft", tone: "info" };
}
