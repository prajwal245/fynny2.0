/**
 * A Tally Day Book export read as vouchers: date, type, number, narration and every ledger leg. The review checks (cash day by day,
 * adjustment entries, ledger mapping, GST ledgers) all read this one shape, so none of them parses the file again.
 *
 * Tally prints a voucher as a header row (date, the first ledger, type, number, its amount) followed by one row per further leg, and the
 * narration as a row with text and no amount. Debits and credits are separate columns; an amount may end Dr or Cr.
 */
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (s: string): string | null => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(String(s).trim());
  if (!m) return null;
  const i = MON.indexOf(m[2]!.toLowerCase());
  if (i < 0) return null;
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${String(i + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
};
const amt = (v: unknown): number => {
  const s = String(v ?? "").replace(/[₹,\s]/g, "").replace(/(dr|cr)$/i, "");
  return s && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : 0;
};

export interface Leg { ledger: string; debit: number; credit: number }
export interface Voucher { date: string; type: string; no: string; narration: string; legs: Leg[]; row: number }

export function readDayBookVouchers(rows: string[][]): Voucher[] {
  const head = rows.findIndex((r) => r.some((c) => /^particulars$/i.test(String(c).trim())) && r.some((c) => /vch\s*type/i.test(String(c))));
  if (head < 0) return [];
  const h = rows[head]!.map((c) => String(c).trim().toLowerCase());
  const col = (re: RegExp, d: number) => { const i = h.findIndex((c) => re.test(c)); return i >= 0 ? i : d; };
  const cD = col(/^date$/, 0), cP = col(/^particulars$/, 1), cT = col(/vch\s*type/, 4), cN = col(/vch\s*no/, 5), cDr = col(/^debit$/, 6), cCr = col(/^credit$/, 7);
  const out: Voucher[] = [];
  let cur: Voucher | null = null;
  rows.slice(head + 1).forEach((r, i) => {
    const name = String(r[cP] ?? "").trim();
    const date = day(String(r[cD] ?? ""));
    const type = String(r[cT] ?? "").trim();
    if (date && type) {
      cur = { date, type, no: String(r[cN] ?? "").trim(), narration: "", legs: [], row: head + 2 + i };
      out.push(cur);
    }
    if (!cur || !name) return;
    const dr = amt(r[cDr]), cr = amt(r[cCr]);
    if (dr || cr) cur.legs.push({ ledger: name, debit: dr, credit: cr });
    else if (!date) cur.narration = `${cur.narration} ${name}`.trim();
  });
  return out;
}
