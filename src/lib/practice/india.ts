/**
 * Indian accounting and tax rules used two ways:
 *  1. As context for every AI call (INDIA_CONTEXT), so the model reads and
 *     classifies documents the way an Indian CA firm does.
 *  2. As deterministic checks on what was read (GSTIN checksum, GST rate and
 *     IGST vs CGST/SGST, TDS section rates, PF/ESI, GST on gateway fees).
 *     The AI never decides these: code verifies, people decide.
 *
 * Rates are the commonly applicable ones; a check that fails is shown as
 * "check this" with the reason, never silently corrected (lower-deduction
 * certificates, no-PAN cases and transitional rates exist).
 */

export const INDIA_CONTEXT = `Context: Indian accounting (Ind AS / Indian GAAP, Tally conventions).
- Amounts are in INR; Indian digit grouping (₹1,25,000.50); dates are day-first (DD/MM/YYYY). Financial year runs April to March.
- Tally ledgers: Debit in the bank ledger is money received, Credit is money paid. Voucher types: Receipt and Sales = in; Payment and Purchase = out; Contra = transfer between own accounts; Journal = adjustment.
- GST: intra-state supply carries CGST + SGST in equal halves; inter-state carries IGST only. Common rates 0%, 5%, 18% and 40% (12% and 28% applied to periods before 22 Sep 2025). Bank charges and payment-gateway fees carry 18% GST. A GSTIN has 15 characters: 2-digit state code, PAN, entity number, "Z", check character.
- TDS (Income-tax Act, 2025 from 1 Apr 2026; registers still use 1961 section codes): 194C contractors 1% individual/HUF, 2% others; 194J professional fees 10%, technical services 2%; 194I rent 10% land/building, 2% plant/machinery; 194H commission 2%; 194A interest 10%; 194Q purchase of goods 0.1%; 192 salary at slab rates; 20% where no PAN. TDS is deposited by the 7th of the next month.
- Payroll: PF 12% of basic (employee and employer, basic commonly capped at ₹15,000); ESI applies when gross wages are up to ₹21,000 a month (employee 0.75%, employer 3.25%); PF and ESI are due by the 15th of the next month. GSTR-3B is filed by the 20th.
- Payment gateways (Razorpay, Cashfree, PayU) pay the bank net of fees and GST on fees; revenue is the gross amount collected.
- Tax payments (GST, TDS, advance tax), loans, capital and advances are not revenue or expenses.`;

// ── GSTIN ────────────────────────────────────────────────────────────────────

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The GSTN check-character algorithm (base 36, alternating weights 1 and 2). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** Why a GSTIN is not valid, in words a person can act on; null when it is valid. */
export function gstinProblem(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (!GSTIN_SHAPE.test(g))
    return "A GSTIN has 15 characters: state code, PAN, entity number, Z and a check character, like 27AABCS1429B1ZU.";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14])
    return `The last character of this GSTIN does not match the rest (it should be ${gstinCheckChar(g.slice(0, 14))} for these first 14), so one character is probably mistyped.`;
  return null;
}

export function validGstin(raw: string): boolean {
  const g = raw.trim().toUpperCase();
  return GSTIN_SHAPE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
}

// ── Checks ───────────────────────────────────────────────────────────────────

export interface ComplianceCheck {
  ok: boolean;
  label: string;
  detail: string;
}

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const listed = (bad: string[]) => `${bad.slice(0, 4).join("; ")}${bad.length > 4 ? `; and ${bad.length - 4} more` : ""}`;

/** TDS rates by section (fractions). More than one where the rate depends on the payee or nature. */
export const TDS_RATES: Record<string, number[]> = {
  "194A": [0.1],
  "194C": [0.01, 0.02],
  "194B": [0.3],
  "194BB": [0.3],
  "194D": [0.02, 0.05, 0.1],
  "194DA": [0.02, 0.05],
  "194EE": [0.1],
  "194G": [0.02, 0.05],
  "194K": [0.1],
  "194LA": [0.1],
  "194M": [0.02, 0.05],
  "194N": [0.02, 0.05],
  "194R": [0.1],
  "194S": [0.01],
  "194H": [0.02, 0.05],
  "194I": [0.02, 0.1],
  "194IA": [0.01],
  "194IB": [0.02, 0.05],
  "194J": [0.02, 0.1],
  "194O": [0.001, 0.01],
  "194Q": [0.001],
  "194T": [0.1],
};
const NO_PAN_RATE = 0.2;

export function tdsSection(raw: string): string | null {
  // "194I(a)" / "194I (b)" are clauses of 194I, not section 194IA / 194IB.
  if (/194\s*I\s*\(\s*[ab]\s*\)/i.test(raw)) return "194I";
  const m = raw.toUpperCase().replace(/[\s()]/g, "").match(/19[24][A-Z]{0,2}/);
  if (!m) return null;
  const s = m[0];
  // "194IA"/"194IB" are their own sections; "194I(a)" is 194I.
  return TDS_RATES[s] ? s : TDS_RATES[s.slice(0, 4)] ? s.slice(0, 4) : s;
}

export function checkTds(entries: { party: string; section: string; paid: number; tds: number }[]): ComplianceCheck[] {
  const bad: string[] = [];
  let checked = 0;
  for (const e of entries) {
    const sec = tdsSection(e.section);
    const rates = sec ? TDS_RATES[sec] : undefined;
    if (!rates || !e.paid) continue;
    checked++;
    const ok = [...rates, NO_PAN_RATE].some((r) => near(e.paid * r, e.tds, Math.max(1, e.paid * 0.0005)));
    if (!ok) bad.push(`${e.party || "an entry"} under ${sec}: ${inr(e.tds)} on ${inr(e.paid)} (${((e.tds / e.paid) * 100).toFixed(2)}%, expected ${rates.map((r) => `${r * 100}%`).join(" or ")})`);
  }
  if (!checked) return [];
  return [
    bad.length
      ? { ok: false, label: "TDS rates", detail: `Check ${bad.length} entr${bad.length === 1 ? "y" : "ies"} against the section rate (a lower-deduction certificate may explain it): ${listed(bad)}.` }
      : { ok: true, label: "TDS rates", detail: `All ${checked} entries match the rate for their section.` },
  ];
}

/** Rates seen on Indian tax invoices: current slabs, pre-Sep-2025 slabs and special rates. */
const GST_RATES = [0, 0.001, 0.0025, 0.015, 0.03, 0.05, 0.06, 0.12, 0.18, 0.28, 0.4];

export function checkGst(
  entries: { ref: string; gstin?: string; taxable: number; igst: number; cgst: number; sgst: number }[],
): ComplianceCheck[] {
  if (!entries.length) return [];
  const badGstin: string[] = [];
  const mixed: string[] = [];
  const halves: string[] = [];
  const rate: string[] = [];
  let withGstin = 0;
  for (const e of entries) {
    const ref = e.ref || "an invoice";
    if (e.gstin && e.gstin.trim()) {
      withGstin++;
      if (!validGstin(e.gstin)) badGstin.push(`${ref} (${e.gstin.trim()})`);
    }
    if (e.igst > 0 && (e.cgst > 0 || e.sgst > 0)) mixed.push(ref);
    if (!near(e.cgst, e.sgst)) halves.push(`${ref}: CGST ${inr(e.cgst)}, SGST ${inr(e.sgst)}`);
    const tax = e.igst + e.cgst + e.sgst;
    if (e.taxable > 0 && !GST_RATES.some((r) => near(e.taxable * r, tax, Math.max(1, e.taxable * 0.0005))))
      rate.push(`${ref}: ${inr(tax)} on ${inr(e.taxable)} (${((tax / e.taxable) * 100).toFixed(2)}%)`);
  }
  const out: ComplianceCheck[] = [];
  if (withGstin)
    out.push(
      badGstin.length
        ? { ok: false, label: "GSTIN", detail: `${badGstin.length} GSTIN${badGstin.length === 1 ? " fails" : "s fail"} the check-character test, so it is mistyped or not genuine: ${listed(badGstin)}.` }
        : { ok: true, label: "GSTIN", detail: `All ${withGstin} GSTINs pass the check-character test.` },
    );
  out.push(
    mixed.length || halves.length
      ? { ok: false, label: "IGST vs CGST/SGST", detail: [mixed.length ? `${listed(mixed)} carr${mixed.length === 1 ? "ies" : "y"} both IGST and CGST/SGST` : "", halves.length ? `CGST and SGST differ on ${listed(halves)}` : ""].filter(Boolean).join(". ") + "." }
      : { ok: true, label: "IGST vs CGST/SGST", detail: "Every invoice is either inter-state (IGST) or intra-state (equal CGST and SGST)." },
  );
  out.push(
    rate.length
      ? { ok: false, label: "GST rate", detail: `Tax is not a standard GST rate on ${listed(rate)}.` }
      : { ok: true, label: "GST rate", detail: "Tax on every invoice is a standard GST rate." },
  );
  return out;
}

export function checkPayroll(entries: { name: string; basic?: number; gross: number; pf?: number; esi?: number }[]): ComplianceCheck[] {
  const pfBad: string[] = [];
  const esiBad: string[] = [];
  let pfChecked = 0;
  let esiChecked = 0;
  for (const e of entries) {
    if (e.pf !== undefined && e.basic) {
      pfChecked++;
      // Employee share, or employee + employer together; on full basic or the ₹15,000 ceiling.
      const expected = [0.12, 0.24].flatMap((r) => [e.basic! * r, Math.min(e.basic!, 15000) * r]);
      if (!expected.some((x) => near(x, e.pf!, 1))) pfBad.push(`${e.name}: PF ${inr(e.pf)} on basic ${inr(e.basic)}`);
    }
    if (e.esi !== undefined) {
      esiChecked++;
      // Employee 0.75%, employer 3.25%, or both (4%), only up to ₹21,000 gross.
      const options = e.gross <= 21000 ? [0.0075, 0.0325, 0.04].map((r) => e.gross * r) : [0];
      if (!options.some((due) => near(Math.ceil(due), e.esi!, 1) || near(due, e.esi!, 1)))
        esiBad.push(`${e.name}: ESI ${inr(e.esi!)} on gross ${inr(e.gross)}${e.gross > 21000 ? " (above the ₹21,000 limit, so none is due)" : ""}`);
    }
  }
  const out: ComplianceCheck[] = [];
  if (pfChecked)
    out.push(pfBad.length ? { ok: false, label: "PF", detail: `PF is not 12% of basic for ${listed(pfBad)}.` } : { ok: true, label: "PF", detail: `PF is 12% of basic for all ${pfChecked} employees.` });
  if (esiChecked)
    out.push(esiBad.length ? { ok: false, label: "ESI", detail: `Check ESI for ${listed(esiBad)}.` } : { ok: true, label: "ESI", detail: `ESI is 0.75% of gross where wages are up to ₹21,000, for all ${esiChecked} employees.` });
  return out;
}

export function checkGatewayGst(fee: number, tax: number): ComplianceCheck[] {
  if (!fee) return [];
  return near(fee * 0.18, tax, Math.max(1, fee * 0.001))
    ? [{ ok: true, label: "GST on gateway fees", detail: `${inr(tax)} is 18% of fees of ${inr(fee)}.` }]
    : [{ ok: false, label: "GST on gateway fees", detail: `${inr(tax)} is not 18% of fees of ${inr(fee)} (expected ${inr(Math.round(fee * 18) / 100)}).` }];
}

// ── Statutory calendar ───────────────────────────────────────────────────────

/** What falls due next month for statutory payments seen in this month's bank lines. */
export function statutoryDueDates(periodEnd: string, narrations: string[]): { label: string; due: string }[] {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const next = (day: number) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, day));
    return d.toISOString().slice(0, 10);
  };
  const text = narrations.join(" ").toLowerCase();
  const out: { label: string; due: string }[] = [];
  // TDS deducted in March is due by 30 April; every other month by the 7th.
  if (/\btds\b|194[a-z]|tax deducted/.test(text)) out.push({ label: "TDS deducted this month to be deposited", due: end.getUTCMonth() === 2 ? next(30) : next(7) });
  if (/\bpf\b|provident|epf|\besi\b|esic/.test(text)) out.push({ label: "PF and ESI for this month's wages", due: next(15) });
  if (/\bgst\b|cgst|sgst|igst|gstr/.test(text)) out.push({ label: "GSTR-3B and GST payment for this month", due: next(20) });
  return out;
}
