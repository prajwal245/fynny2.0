/**
 * TDS the client suffered (Form 26AS / Annual Tax Statement, Part I) against the TDS-receivable ledgers in the books.
 *
 *  - The 26AS text is read by code: each deductor's header (name, TAN, totals) and its transactions (section, date, status, amount, tax). Every
 *    deductor's lines are re-added against its own header, and the headers against each other, before anything is compared.
 *  - The books side comes from the Day Book: debits to the TDS-receivable ledgers (the credit taken when a receipt or a bill is booked),
 *    by section (from the ledger's name) and by party (the credit leg of the same voucher).
 *
 * Credit in books above 26AS is the dangerous direction: it can only be claimed once the deductor's statement shows it.
 * Pure code. Anything that cannot be tied is listed, never smoothed.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const MON: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const iso = (s: string) => { const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s); return m ? `${m[3]}-${MON[m[2]!.toLowerCase()] ?? "00"}-${m[1]}` : s; };

export interface As26Row { section: string; date: string; status: string; booked: string; amount: number; tax: number; deposited: number }
export interface As26Deductor { name: string; tan: string; amount: number; tax: number; deposited: number; rows: As26Row[] }
export interface As26 { pan: string | null; name: string | null; fy: string | null; deductors: As26Deductor[]; tcsPresent: boolean; notes: string[] }
export interface As26Check { id: string; label: string; ok: boolean; detail: string }

export function read26as(text: string): As26 {
  const lines = text.split(/\r?\n/);
  const out: As26 = { pan: null, name: null, fy: null, deductors: [], tcsPresent: false, notes: [] };
  if (!/annual tax statement/i.test(text) && !/form\s*26as/i.test(text)) { out.notes.push("This does not look like a Form 26AS / Annual Tax Statement."); return out; }
  out.pan = /Permanent Account Number \(PAN\)\s+([A-Z]{5}\d{4}[A-Z])/.exec(text)?.[1] ?? null;
  out.name = /Name of Assessee\s+(.+?)\s*$/m.exec(text)?.[1]?.trim() ?? null;
  out.fy = /Financial Year\s+(20\d{2}-\d{2})/.exec(text)?.[1] ?? null;
  const partI = lines.findIndex((l) => /^PART-I\s*-\s*Details of Tax Deducted at Source/i.test(l.trim()));
  const partII = lines.findIndex((l, i) => i > partI && /^PART-II\s*-?\s*Details/i.test(l.trim()));
  let cur: As26Deductor | null = null;
  const num = (s: string) => Number(s);
  for (const l of lines.slice(Math.max(partI, 0), partII > 0 ? partII : undefined)) {
    const d = /^\s*(\d+)\s+(.+?)\s+([A-Z]{4}\d{5}[A-Z])\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(l);
    if (d) { cur = { name: d[2]!.trim(), tan: d[3]!, amount: num(d[4]!), tax: num(d[5]!), deposited: num(d[6]!), rows: [] }; out.deductors.push(cur); continue; }
    const t = /^\s*(\d+)\s+(\d{3}[A-Z]{0,3})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(\w)\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(l);
    if (t && cur) cur.rows.push({ section: t[2]!, date: iso(t[3]!), status: t[4]!, booked: iso(t[5]!), amount: num(t[7]!), tax: num(t[8]!), deposited: num(t[9]!) });
  }
  const tcs = text.slice(text.search(/PART-VI-Details of Tax Collected/i));
  out.tcsPresent = /PART-VI-Details of Tax Collected[\s\S]{0,900}?Sr\. No\.\s+Section[\s\S]{0,400}?\n\s*1\s+206/i.test(tcs);
  if (!out.deductors.length) out.notes.push("No deductor found in Part I (or no transactions): nothing was deducted, or the PDF text is laid out differently.");
  return out;
}

export function prove26as(a: As26): As26Check[] {
  const checks: As26Check[] = [];
  const bad = a.deductors.filter((d) => Math.abs(r2(d.rows.reduce((s, r) => s + r.tax, 0)) - d.tax) > 0.5 || Math.abs(r2(d.rows.reduce((s, r) => s + r.amount, 0)) - d.amount) > 0.5);
  checks.push({
    id: "as26-lines", label: "Each deductor's lines add up to its own total", ok: bad.length === 0,
    detail: bad.length ? bad.map((d) => `${d.name}: lines ₹${r2(d.rows.reduce((s, r) => s + r.tax, 0)).toLocaleString("en-IN")} tax, header ₹${d.tax.toLocaleString("en-IN")}`).join("; ") : `${a.deductors.length} deductors, ${a.deductors.reduce((s, d) => s + d.rows.length, 0)} transactions.`,
  });
  const dep = a.deductors.filter((d) => Math.abs(d.tax - d.deposited) > 0.5);
  checks.push({ id: "as26-deposit", label: "Tax deducted equals tax deposited", ok: dep.length === 0, detail: dep.length ? `Not deposited in full: ${dep.map((d) => d.name).join(", ")}.` : "Every deductor has deposited what it deducted." });
  const unbooked = a.deductors.flatMap((d) => d.rows.filter((r) => r.status !== "F").map((r) => ({ d: d.name, r })));
  checks.push({ id: "as26-status", label: "Every line is in 'Final' booking status", ok: unbooked.length === 0, detail: unbooked.length ? `${unbooked.length} line(s) are not final (unmatched or provisional) and cannot be claimed yet.` : "All lines are final." });
  return checks;
}

/* ── the books side ─────────────────────────────────────── */

/** "TDS RECEIVABLE 94-C", "94 A TDS Receivable", "194-Q TDS RECEIVABLE", "TDS 94 J Receivable" → 194C, 194A, 194Q, 194J. No section in the name → null. */
export function sectionOf(name: string): string | null {
  const m = /(?:^|[^0-9])(?:1)?94\s*-?\s*([A-Z]{1,2})(?![A-Za-z])/i.exec(name);
  return m ? `194${m[1]!.toUpperCase()}` : null;
}

export interface BooksTdsVoucher { date: string; type: string; no: string; legs: { ledger: string; debit: number; credit: number }[] }
export interface BooksTds { total: number; bySection: Record<string, number>; unsectioned: number; byParty: { party: string; section: string | null; amount: number; vouchers: number }[]; ledgers: string[]; clearedInYear: { ledger: string; credit: number }[] }

export function booksTds(vouchers: BooksTdsVoucher[], ledgers: string[], range?: { start: string; end: string }): BooksTds {
  const set = new Set(ledgers);
  const bySection: Record<string, number> = {};
  const party = new Map<string, { party: string; section: string | null; amount: number; vouchers: number }>();
  const cleared = new Map<string, number>();
  let total = 0, unsectioned = 0;
  for (const v of vouchers) {
    if (range && (v.date < range.start || v.date > range.end)) continue;
    const mine = v.legs.filter((l) => set.has(l.ledger));
    if (!mine.length) continue;
    for (const l of mine) if (l.credit > 0) cleared.set(l.ledger, r2((cleared.get(l.ledger) ?? 0) + l.credit));
    const counter = v.legs.filter((l) => !set.has(l.ledger) && l.credit > 0).sort((a, b) => b.credit - a.credit)[0]?.ledger ?? "(no party leg)";
    for (const l of mine) {
      if (l.debit <= 0) continue;
      const sec = sectionOf(l.ledger);
      total = r2(total + l.debit);
      if (sec) bySection[sec] = r2((bySection[sec] ?? 0) + l.debit); else unsectioned = r2(unsectioned + l.debit);
      const k = `${counter}|${sec}`;
      const p = party.get(k) ?? { party: counter, section: sec, amount: 0, vouchers: 0 };
      p.amount = r2(p.amount + l.debit); p.vouchers++; party.set(k, p);
    }
  }
  return { total, bySection, unsectioned, byParty: [...party.values()].sort((a, b) => b.amount - a.amount), ledgers, clearedInYear: [...cleared].map(([ledger, credit]) => ({ ledger, credit })) };
}

export interface TdsSectionRow { section: string; as26: number; books: number; diff: number; status: "agree" | "books_higher" | "books_lower" }
export interface TdsCompare { rows: TdsSectionRow[]; as26Total: number; booksTotal: number; unsectioned: number; notes: string[] }

/** By section: 26AS tax against the books' debit to the TDS-receivable ledgers. Books above 26AS is the one that matters (credit not yet in the deductor's statement). */
export function compareTds(a: As26, b: BooksTds, tol = 1): TdsCompare {
  const as26: Record<string, number> = {};
  for (const d of a.deductors) for (const r of d.rows) as26[r.section] = r2((as26[r.section] ?? 0) + r.tax);
  const secs = [...new Set([...Object.keys(as26), ...Object.keys(b.bySection)])].sort();
  const rows = secs.map((section) => {
    const x = as26[section] ?? 0, y = b.bySection[section] ?? 0, diff = r2(y - x);
    return { section, as26: x, books: y, diff, status: Math.abs(diff) <= tol ? "agree" as const : diff > 0 ? "books_higher" as const : "books_lower" as const };
  });
  const notes: string[] = [];
  if (b.unsectioned) notes.push(`₹${b.unsectioned.toLocaleString("en-IN")} was debited to TDS ledgers whose name carries no section, so it is not in any row above.`);
  notes.push("Books above 26AS means credit taken that the deductor's statement does not show yet: it cannot be claimed until it does. Books below 26AS means TDS deducted from the client that the books have not recognised.");
  return { rows, as26Total: r2(Object.values(as26).reduce((s, n) => s + n, 0)), booksTotal: b.total, unsectioned: b.unsectioned, notes };
}

const STOP = new Set(["private", "pvt", "ltd", "limited", "llp", "and", "the", "of", "co", "company", "india", "indian"]);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));

const near = (a: string, b: string) => {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, miss = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++miss > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return miss + (a.length - i) + (b.length - j) <= 1;
};

export interface DeductorMatch { deductor: As26Deductor; parties: string[]; books: number; diff: number }
/**
 * Which books parties belong to which deductor? A party goes to the deductor it shares the most significant words with (a word one letter off
 * counts, "Virajit"/"Virajith"); one deductor can have several parties ("Malkhed ... (Furniture)", "(IT Works)"). A suggestion with the parties named,
 * never silently applied. Parties that match no deductor come back separately: TDS the books took from someone 26AS does not list, or a name that differs.
 */
export function matchDeductors(a: As26, b: BooksTds): { matches: DeductorMatch[]; unassigned: { party: string; amount: number }[] } {
  const dt = a.deductors.map((d) => tokens(d.name));
  const assigned = new Map<number, string[]>();
  const unassigned: { party: string; amount: number }[] = [];
  for (const party of new Set(b.byParty.map((x) => x.party))) {
    const pt = tokens(party);
    let best = -1, bestScore = 0;
    dt.forEach((t, i) => {
      const shared = [...t].filter((w) => [...pt].some((x) => near(w, x))).length;
      const score = shared / Math.max(1, Math.min(t.size, pt.size));
      if (shared && score >= 0.5 && score > bestScore) { best = i; bestScore = score; }
    });
    if (best < 0) unassigned.push({ party, amount: r2(b.byParty.filter((x) => x.party === party).reduce((s, x) => s + x.amount, 0)) });
    else assigned.set(best, [...(assigned.get(best) ?? []), party]);
  }
  const matches = a.deductors.map((d, i) => {
    const parties = assigned.get(i) ?? [];
    const books = r2(b.byParty.filter((x) => parties.includes(x.party)).reduce((s, x) => s + x.amount, 0));
    return { deductor: d, parties, books, diff: r2(books - d.tax) };
  });
  return { matches, unassigned };
}
