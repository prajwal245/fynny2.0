/**
 * The party master filled from Tally's ledger masters: GSTIN, PAN, state and the bill-wise flag for every debtor, creditor and any ledger with a GSTIN.
 *
 *  - PAN comes from the master, else from the GSTIN (characters 3 to 12 of a GSTIN are the PAN). A PAN in the master that disagrees with the one
 *    inside the GSTIN is flagged: one of the two is mistyped.
 *  - Ledgers that share a GSTIN are the same party (e.g. "Malkhed ... (Furniture)" and "... (IT Works)"): grouped, the first is the name and the others its aliases.
 *  - Credit period, Udyam status and related-party flags are NOT in Tally's masters, so they are left empty for the CA to fill; nothing is guessed.
 */
import type { MasterRow } from "./trialBalance";

export interface PartyRow { party: string; aliases: string[]; gstin: string | null; pan: string | null; panFrom: "master" | "gstin" | null; state: string | null; billWise: boolean; group: string }
export interface PartyIssue { party: string; kind: "pan_gstin_mismatch" | "gstin_shared" | "no_pan_no_gstin"; detail: string }
export interface PartyMasterBuild { parties: PartyRow[]; issues: PartyIssue[]; withGstin: number; withPan: number; billWise: number }

const PARTY_GROUP = /^(sundry debtors|sundry creditors)$/i;

export function buildPartyMaster(masters: MasterRow[]): PartyMasterBuild {
  const eligible = masters.filter((m) => PARTY_GROUP.test(m.primary) || m.gstin);
  const issues: PartyIssue[] = [];
  const byGstin = new Map<string, MasterRow[]>();
  const rest: MasterRow[] = [];
  for (const m of eligible) { if (m.gstin) (byGstin.get(m.gstin) ?? byGstin.set(m.gstin, []).get(m.gstin)!).push(m); else rest.push(m); }
  const toRow = (head: MasterRow, others: MasterRow[]): PartyRow => {
    const fromGstin = head.gstin ? head.gstin.slice(2, 12) : null;
    const pan = head.pan ?? fromGstin;
    if (head.pan && fromGstin && head.pan !== fromGstin) issues.push({ party: head.name, kind: "pan_gstin_mismatch", detail: `PAN ${head.pan} in the master, but the GSTIN ${head.gstin} contains ${fromGstin}.` });
    return { party: head.name, aliases: others.map((o) => o.name), gstin: head.gstin, pan, panFrom: head.pan ? "master" : fromGstin ? "gstin" : null, state: head.state, billWise: [head, ...others].some((x) => x.billWise), group: head.primary };
  };
  const parties: PartyRow[] = [];
  for (const group of byGstin.values()) {
    // The party-group ledger is the name; a ledger under another group (an expense or an advance) with the same GSTIN is an alias.
    const sorted = [...group].sort((a, b) => Number(PARTY_GROUP.test(b.primary)) - Number(PARTY_GROUP.test(a.primary)));
    parties.push(toRow(sorted[0]!, sorted.slice(1)));
    if (group.length > 1) issues.push({ party: sorted[0]!.name, kind: "gstin_shared", detail: `${group.length} ledgers share GSTIN ${sorted[0]!.gstin}: ${sorted.slice(1).map((x) => x.name).join("; ")}. Treated as one party.` });
  }
  for (const m of rest) {
    parties.push(toRow(m, []));
    if (!m.pan && PARTY_GROUP.test(m.primary)) issues.push({ party: m.name, kind: "no_pan_no_gstin", detail: "Neither a GSTIN nor a PAN: TDS, 2B matching and 43B(h) cannot be tested for this party." });
  }
  parties.sort((a, b) => a.party.localeCompare(b.party));
  return { parties, issues, withGstin: parties.filter((p) => p.gstin).length, withPan: parties.filter((p) => p.pan).length, billWise: parties.filter((p) => p.billWise).length };
}
