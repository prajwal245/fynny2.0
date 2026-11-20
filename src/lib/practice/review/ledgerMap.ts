/**
 * Suggests what every ledger is, from its name and (when known) its Tally group, so a CA confirms a map once per client instead of
 * building one. Real clients name ledgers freely ("18% SUB CONTRACTOR SERVICES", "Input Cgst CF 26-27", "RCM CGST PAYABLE", "94-C Tds
 * Receivable Fy 2021-22"), so the name carries the rate, the tax head, the nature and sometimes the year. A suggestion is only a
 * suggestion: nothing reads a ledger through the map until a person has confirmed it.
 */
export type Family =
  | "sales" | "purchase" | "expense" | "input_tax" | "input_tax_carry_forward" | "output_tax" | "rcm_liability" | "rcm_input" | "gst_payment"
  | "gst_late_fee_interest" | "cess" | "tds_payable" | "tds_receivable" | "cash" | "bank" | "loan" | "owner" | "round_off" | "party_or_other";

export interface MapSuggestion {
  ledger: string;
  family: Family;
  gstHead: "cgst" | "sgst" | "igst" | null;
  rate: number | null;
  /** A year in the name ("Fy 2021-22", "CF 26-27"): an old-year balance is a review point, not a current asset. */
  year: string | null;
  /** "name" when only the name decided it, "group" when the group did. */
  basis: "name" | "group";
  note: string | null;
}

const head = (n: string): MapSuggestion["gstHead"] => (/igst/i.test(n) ? "igst" : /cgst/i.test(n) ? "cgst" : /sgst|utgst/i.test(n) ? "sgst" : null);
const rateOf = (n: string) => { const m = /(\d{1,2}(?:\.\d+)?)\s*%/.exec(n); return m ? Number(m[1]) : null; };
const yearOf = (n: string) => /\b(?:fy\s*)?(20\d{2}\s*-\s*\d{2}|\d{2}\s*-\s*\d{2})\b/i.exec(n)?.[1]?.replace(/\s+/g, "") ?? null;

const RULES: [Family, RegExp, string | null][] = [
  ["round_off", /round(ing)?[\s-]*off/i, null],
  ["rcm_liability", /\brcm\b.*\bpayable\b|\bpayable\b.*\brcm\b/i, "Paid in cash only: never set off against credit."],
  ["rcm_input", /\brcm\b.*\binput\b|\binput\b.*\brcm\b/i, "Credit on reverse charge: claimed in 3B 4A(3) only after the tax is paid."],
  ["input_tax_carry_forward", /\binput\b.*\b(cf|c\s*f|carry\s*forward)\b|\b(cf|carry\s*forward)\b.*\binput\b/i, "Credit booked now and claimed in a later return: a timing item, not an error."],
  ["input_tax", /^\s*input\s*(c|s|i|u)gst|\binput\s*(c|s|i|u)gst\b|^\d+%\s*(c|s|i)gst\s*input/i, null],
  ["output_tax", /^\s*output\s*(c|s|i|u)gst|\boutput\s*(c|s|i|u)gst\b|^\d+%\s*(c|s|i)gst\s*output/i, null],
  ["gst_payment", /^\s*gst\s*\(\s*cgst\s*\+\s*sgst\s*\+\s*igst\s*\)|gst\s*payable|gst\s*payment/i, "The set-off and payment ledger: its entries are tested against GSTR-3B table 6.1 and the cash ledger."],
  ["gst_late_fee_interest", /gst.*(late\s*fee|interest|intrest)|(late\s*fee|interest|intrest).*gst/i, "Paid in cash; not allowed as a deduction. Kept out of the tax ledgers."],
  ["cess", /\bcess\b/i, "Not GST: kept out of the GST totals."],
  ["tds_receivable", /\b(tds|tcs)\s*receivable|receivable.*\b(tds|tcs)\b/i, null],
  ["tds_payable", /\btds\s*payable|\b19\d?\s*-?\s*[a-z]\b.*\btds\b|\btds\b.*\b19\d?[a-z]?\b/i, null],
  ["sales", /(^|\s)(gst\s*)?sales?\b|\bsale\b|\b(work|works)\s*$|irrigation work|soft\s*scape/i, null],
  ["purchase", /\b(goods\s*)?purchases?\b|\d+%.*\bgoods\b/i, null],
  ["expense", /sub\s*contractor|subcontractor|transport|freight|labour|rent\b|rates\s*&\s*taxes|repairs?|salary|wages|postal|professional|audit fee/i, null],
  ["cash", /^(petty\s+)?cash(\s*-?\s*in\s*-?\s*hand)?(\s+a\/c)?$/i, null],
  ["loan", /\b(gecl|term\s*loan|vehicle\s*loan|cc\s*a\/c|cash\s*credit|od\s*a\/c|loan\s*-?\s*\d)\b/i, null],
  ["owner", /\b(director|partner|proprietor|drawings?)\b|^capital\b/i, null],
];
const BANK = /\b(bank|hdfc|icici|sbi|axis|kotak|yes bank|idfc|indusind|federal|canara|pnb|union bank|ubi)\b/i;
const GROUP_FAMILY: [Family, RegExp][] = [
  ["sales", /^sales accounts$/i], ["purchase", /^purchase accounts$/i], ["expense", /expenses$/i], ["bank", /^bank accounts$|bank od|bank occ/i], ["cash", /^cash-in-hand$/i],
  ["loan", /loans? \(liability\)|secured loans|unsecured loans/i], ["owner", /^capital account$/i],
];

export function suggestLedgerMap(ledgers: { name: string; group?: string | null }[]): MapSuggestion[] {
  return ledgers.map(({ name, group }) => {
    const hit = RULES.find(([, re]) => re.test(name));
    let family: Family | null = hit?.[0] ?? null;
    let basis: MapSuggestion["basis"] = "name";
    if (!family && BANK.test(name) && !/charges?|interest|gst/i.test(name)) family = "bank";
    if (!family && group) { const g = GROUP_FAMILY.find(([, re]) => re.test(group.trim())); if (g) { family = g[0]; basis = "group"; } }
    const f = family ?? "party_or_other";
    const tax = ["input_tax", "input_tax_carry_forward", "output_tax", "rcm_liability", "rcm_input"].includes(f);
    return { ledger: name, family: f, gstHead: tax ? head(name) : null, rate: ["sales", "purchase", "expense"].includes(f) ? rateOf(name) : null, year: yearOf(name), basis, note: hit?.[2] ?? null };
  });
}

/** Two ledgers that read as one ("18% SUB CONTRACTOR SERVICES" and "18% SUBCONTRACTOR SERVICESS"). Reported, because their groups can differ and change gross profit. */
export function nearDuplicates(names: string[]): [string, string][] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]/g, "");
  const lev = (a: string, b: string) => {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)] as number[]);
    for (let j = 1; j <= b.length; j++) d[0]![j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length]![b.length]!;
  };
  const ks = names.map((n) => ({ n, k: key(n) })).filter((x) => x.k.length >= 12);
  const out: [string, string][] = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    if (ks[i]!.k[0] !== ks[j]!.k[0]) continue;
    // CGST against SGST, or ledgers that differ only by an account or serial number, are different ledgers by design.
    const skel = (k: string) => k.replace(/[cisu]gst/g, "gst").replace(/\d/g, "");
    if (skel(ks[i]!.k) === skel(ks[j]!.k)) continue;
    const d = lev(ks[i]!.k, ks[j]!.k);
    // Differing only by a rate or a number is not a duplicate ("12% Goods Purchase" and "18% Goods Purchase").
    if (d >= 1 && d <= 2 && rateOf(ks[i]!.n) === rateOf(ks[j]!.n) && yearOf(ks[i]!.n) === yearOf(ks[j]!.n) && !/\d/.test(ks[i]!.k.replace(/^\d+%/, "")) === !/\d/.test(ks[j]!.k.replace(/^\d+%/, ""))) out.push([ks[i]!.n, ks[j]!.n]);
  }
  return out;
}
