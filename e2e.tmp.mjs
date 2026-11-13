// ../../../tmp/claude-0/-home-user-fynny2-0/f1942684-1163-55a4-835f-3c411fedaf3e/scratchpad/e2e.ts
import fs from "fs";

// src/lib/practice/aiPricing.ts
var DEFAULT_RATES = [
  ["flash-lite", [0.1, 0.4]],
  ["flash", [0.3, 2.5]],
  ["llama-3.3-70b", [0.59, 0.79]],
  ["llama", [0.2, 0.2]]
];
var FALLBACK = [0.3, 2.5];
function overrides() {
  const raw = typeof process !== "undefined" ? process.env["AI_PRICING_JSON"] : void 0;
  if (!raw) return [];
  try {
    const o = JSON.parse(raw);
    return Object.entries(o).flatMap(
      ([k, v]) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && n >= 0) ? [[k.toLowerCase(), [v[0], v[1]]]] : []
    );
  } catch {
    return [];
  }
}
function rateFor(model) {
  const m = (model ?? "").toLowerCase();
  for (const [k, r] of [...overrides(), ...DEFAULT_RATES]) if (m.includes(k)) return r;
  return FALLBACK;
}
function tokenCostUsd(model, inputTokens, outputTokens) {
  if (inputTokens == null && outputTokens == null) return null;
  const [pin, pout] = rateFor(model);
  const usd = ((inputTokens ?? 0) * pin + (outputTokens ?? 0) * pout) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}
function ocrCostUsd() {
  const n = Number(typeof process !== "undefined" ? process.env["OCR_SPACE_COST_USD_PER_CALL"] : "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function usageFields(res) {
  const input_tokens = res.usage?.input_tokens ?? null;
  const output_tokens = res.usage?.output_tokens ?? null;
  return { input_tokens, output_tokens, cost_usd: tokenCostUsd(res.model, input_tokens, output_tokens) };
}

// src/lib/practice/core.ts
var TXN_CATEGORIES = [
  "receipt",
  "payment",
  "bank_charge",
  "interest",
  "tax",
  "salary",
  "transfer",
  "sales_invoice",
  "purchase_invoice",
  "journal",
  "other"
];
var toPaise = (rupees) => Math.round(rupees * 100);
var round2 = (n) => Math.round(n * 100) / 100;
var MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};
var pad = (n) => String(n).padStart(2, "0");
function validYmd(y, m, d) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31))
    return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
var fullYear = (y) => y.length === 2 ? 2e3 + Number(y) : Number(y);
function parseDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return validYmd(
      raw.getUTCFullYear(),
      raw.getUTCMonth() + 1,
      raw.getUTCDate()
    );
  }
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) return validYmd(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(
    /^(\d{1,2})[-/.\s]([A-Za-z]{3,9})[-/.,\s]+(\d{2}|\d{4})(?:\s.*)?$/
  );
  if (m && MONTHS[m[2].toLowerCase()])
    return validYmd(fullYear(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()])
    return validYmd(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 2e4 && serial < 8e4) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 864e5);
      return validYmd(
        dt.getUTCFullYear(),
        dt.getUTCMonth() + 1,
        dt.getUTCDate()
      );
    }
  }
  return null;
}
function normaliseText(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function normaliseRef(s) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
}
function dedupeKey(t) {
  const ref = normaliseRef(t.reference);
  const desc = ref ? "" : normaliseText(t.description).slice(0, 80);
  return [
    t.business_id ?? "unassigned",
    t.side,
    t.date,
    t.direction,
    toPaise(t.amount),
    ref,
    desc
  ].join("|");
}

// src/lib/practice/india.ts
var INDIA_CONTEXT = `Context: Indian accounting (Ind AS / Indian GAAP, Tally conventions).
- Amounts are in INR; Indian digit grouping (\u20B91,25,000.50); dates are day-first (DD/MM/YYYY). Financial year runs April to March.
- Tally ledgers: Debit in the bank ledger is money received, Credit is money paid. Voucher types: Receipt and Sales = in; Payment and Purchase = out; Contra = transfer between own accounts; Journal = adjustment.
- GST: intra-state supply carries CGST + SGST in equal halves; inter-state carries IGST only. Common rates 0%, 5%, 18% and 40% (12% and 28% applied to periods before 22 Sep 2025). Bank charges and payment-gateway fees carry 18% GST. A GSTIN has 15 characters: 2-digit state code, PAN, entity number, "Z", check character.
- TDS (Income-tax Act, 2025 from 1 Apr 2026; registers still use 1961 section codes): 194C contractors 1% individual/HUF, 2% others; 194J professional fees 10%, technical services 2%; 194I rent 10% land/building, 2% plant/machinery; 194H commission 2%; 194A interest 10%; 194Q purchase of goods 0.1%; 192 salary at slab rates; 20% where no PAN. TDS is deposited by the 7th of the next month.
- Payroll: PF 12% of basic (employee and employer, basic commonly capped at \u20B915,000); ESI applies when gross wages are up to \u20B921,000 a month (employee 0.75%, employer 3.25%); PF and ESI are due by the 15th of the next month. GSTR-3B is filed by the 20th.
- Payment gateways (Razorpay, Cashfree, PayU) pay the bank net of fees and GST on fees; revenue is the gross amount collected.
- Tax payments (GST, TDS, advance tax), loans, capital and advances are not revenue or expenses.
- Tally files, as they arrive: a Day Book or "Vouchers" XML has one VOUCHER per entry with ALLLEDGERENTRIES.LIST legs. In AMOUNT a DEBIT is NEGATIVE and a credit positive, so a bank leg of -358608.83 is money received. ISDEEMEDPOSITIVE Yes marks the debit leg. The PARTYLEDGERNAME is the customer or supplier; BANKALLOCATIONS carries the cheque, UTR or transfer reference. Sales, Purchase, Journal, Credit Note and Debit Note vouchers with no bank leg are not bank movements.
- A bank or cash book exported as XML (Ledger Vouchers) is flat tags per line: DSPVCHDATE (4-Sep-26), DSPVCHLEDACCOUNT (the OTHER ledger), INFOFIELD (narration), DSPVCHTYPE (Rcpt, Pymt, Ctra, Jrnl, Sale, Purc), then DSPVCHDRAMT (money in, written negative) or DSPVCHCRAMT (money out). "(as per details)" means the entry touches several ledgers (rent with TDS, GST heads, an invoice with its taxes); the bank line is the net amount actually paid. A customer or supplier ledger holds invoices and the receipts or payments against them: it is not a bank book and its invoice lines are not money movements.
- A masters file (All Masters, LEDGER NAME, PARENT group, OPENINGBALANCE: debit negative) lists ledgers, never transactions. Opening debits must equal opening credits. A cheque "not yet presented" is in the books and not in the bank yet: a timing difference, not an error. A payment in cash never reaches the bank statement; a cash withdrawal or deposit is a Contra between the bank and Cash.`;
var GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + p % 36;
  }
  return GSTIN_CHARS[(36 - sum % 36) % 36];
}
function validGstin(raw) {
  const g = raw.trim().toUpperCase();
  return GSTIN_SHAPE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
}
var near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
var inr = (n) => `\u20B9${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
var listed = (bad) => `${bad.slice(0, 4).join("; ")}${bad.length > 4 ? `; and ${bad.length - 4} more` : ""}`;
var TDS_RATES = {
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
  "194O": [1e-3, 0.01],
  "194Q": [1e-3],
  "194T": [0.1]
};
var NO_PAN_RATE = 0.2;
function tdsSection(raw) {
  if (/194\s*I\s*\(\s*[ab]\s*\)/i.test(raw)) return "194I";
  const m = raw.toUpperCase().replace(/[\s()]/g, "").match(/19[24][A-Z]{0,2}/);
  if (!m) return null;
  const s = m[0];
  return TDS_RATES[s] ? s : TDS_RATES[s.slice(0, 4)] ? s.slice(0, 4) : s;
}
function checkTds(entries) {
  const bad = [];
  let checked = 0;
  for (const e of entries) {
    const sec = tdsSection(e.section);
    const rates = sec ? TDS_RATES[sec] : void 0;
    if (!rates || !e.paid) continue;
    checked++;
    const ok = [...rates, NO_PAN_RATE].some(
      (r) => near(e.paid * r, e.tds, Math.max(1, e.paid * 5e-4))
    );
    if (!ok)
      bad.push(
        `${e.party || "an entry"} under ${sec}: ${inr(e.tds)} on ${inr(e.paid)} (${(e.tds / e.paid * 100).toFixed(2)}%, expected ${rates.map((r) => `${r * 100}%`).join(" or ")})`
      );
  }
  if (!checked) return [];
  return [
    bad.length ? {
      ok: false,
      label: "TDS rates",
      detail: `Check ${bad.length} entr${bad.length === 1 ? "y" : "ies"} against the section rate (a lower-deduction certificate may explain it): ${listed(bad)}.`
    } : {
      ok: true,
      label: "TDS rates",
      detail: `All ${checked} entries match the rate for their section.`
    }
  ];
}
var GST_RATES = [
  0,
  1e-3,
  25e-4,
  0.015,
  0.03,
  0.05,
  0.06,
  0.12,
  0.18,
  0.28,
  0.4
];
function checkGst(entries) {
  if (!entries.length) return [];
  const badGstin = [];
  const mixed = [];
  const halves = [];
  const rate = [];
  let withGstin = 0;
  for (const e of entries) {
    const ref = e.ref || "an invoice";
    if (e.gstin && e.gstin.trim()) {
      withGstin++;
      if (!validGstin(e.gstin)) badGstin.push(`${ref} (${e.gstin.trim()})`);
    }
    if (e.igst > 0 && (e.cgst > 0 || e.sgst > 0)) mixed.push(ref);
    if (!near(e.cgst, e.sgst))
      halves.push(`${ref}: CGST ${inr(e.cgst)}, SGST ${inr(e.sgst)}`);
    const tax = e.igst + e.cgst + e.sgst;
    if (e.taxable > 0 && !GST_RATES.some(
      (r) => near(e.taxable * r, tax, Math.max(1, e.taxable * 5e-4))
    ))
      rate.push(
        `${ref}: ${inr(tax)} on ${inr(e.taxable)} (${(tax / e.taxable * 100).toFixed(2)}%)`
      );
  }
  const out = [];
  if (withGstin)
    out.push(
      badGstin.length ? {
        ok: false,
        label: "GSTIN",
        detail: `${badGstin.length} GSTIN${badGstin.length === 1 ? " fails" : "s fail"} the check-character test, so it is mistyped or not genuine: ${listed(badGstin)}.`
      } : {
        ok: true,
        label: "GSTIN",
        detail: `All ${withGstin} GSTINs pass the check-character test.`
      }
    );
  out.push(
    mixed.length || halves.length ? {
      ok: false,
      label: "IGST vs CGST/SGST",
      detail: [
        mixed.length ? `${listed(mixed)} carr${mixed.length === 1 ? "ies" : "y"} both IGST and CGST/SGST` : "",
        halves.length ? `CGST and SGST differ on ${listed(halves)}` : ""
      ].filter(Boolean).join(". ") + "."
    } : {
      ok: true,
      label: "IGST vs CGST/SGST",
      detail: "Every invoice is either inter-state (IGST) or intra-state (equal CGST and SGST)."
    }
  );
  out.push(
    rate.length ? {
      ok: false,
      label: "GST rate",
      detail: `Tax is not a standard GST rate on ${listed(rate)}.`
    } : {
      ok: true,
      label: "GST rate",
      detail: "Tax on every invoice is a standard GST rate."
    }
  );
  return out;
}
function checkPayroll(entries) {
  const pfBad = [];
  const esiBad = [];
  let pfChecked = 0;
  let esiChecked = 0;
  for (const e of entries) {
    if (e.pf !== void 0 && e.basic) {
      pfChecked++;
      const expected = [0.12, 0.24].flatMap((r) => [
        e.basic * r,
        Math.min(e.basic, 15e3) * r
      ]);
      if (!expected.some((x) => near(x, e.pf, 1)))
        pfBad.push(`${e.name}: PF ${inr(e.pf)} on basic ${inr(e.basic)}`);
    }
    if (e.esi !== void 0) {
      esiChecked++;
      const options = e.gross <= 21e3 ? [75e-4, 0.0325, 0.04].map((r) => e.gross * r) : [0];
      if (!options.some(
        (due) => near(Math.ceil(due), e.esi, 1) || near(due, e.esi, 1)
      ))
        esiBad.push(
          `${e.name}: ESI ${inr(e.esi)} on gross ${inr(e.gross)}${e.gross > 21e3 ? " (above the \u20B921,000 limit, so none is due)" : ""}`
        );
    }
  }
  const out = [];
  if (pfChecked)
    out.push(
      pfBad.length ? {
        ok: false,
        label: "PF",
        detail: `PF is not 12% of basic for ${listed(pfBad)}.`
      } : {
        ok: true,
        label: "PF",
        detail: `PF is 12% of basic for all ${pfChecked} employees.`
      }
    );
  if (esiChecked)
    out.push(
      esiBad.length ? {
        ok: false,
        label: "ESI",
        detail: `Check ESI for ${listed(esiBad)}.`
      } : {
        ok: true,
        label: "ESI",
        detail: `ESI is 0.75% of gross where wages are up to \u20B921,000, for all ${esiChecked} employees.`
      }
    );
  return out;
}
function checkGatewayGst(fee, tax) {
  if (!fee) return [];
  return near(fee * 0.18, tax, Math.max(1, fee * 1e-3)) ? [
    {
      ok: true,
      label: "GST on gateway fees",
      detail: `${inr(tax)} is 18% of fees of ${inr(fee)}.`
    }
  ] : [
    {
      ok: false,
      label: "GST on gateway fees",
      detail: `${inr(tax)} is not 18% of fees of ${inr(fee)} (expected ${inr(Math.round(fee * 18) / 100)}).`
    }
  ];
}

// src/lib/practice/extract/classify.ts
var CONFIDENCE_THRESHOLD = 0.75;
var RULES = [
  {
    re: /\b(chrgs?|chgs?|charges?|sms ?chgs?|amc|min(imum)? bal|annual fee|service fee|gst on|cgst on|sgst on|igst on)\b/i,
    category: "bank_charge"
  },
  {
    re: /\b(int(erest)?\.? ?(pd|paid|cr|credit)|interest|int\.coll|sb int|fd int)\b/i,
    category: "interest"
  },
  {
    re: /\b(gst ?(pmt|payment|challan)|gstn|tds|cbdt|advance tax|income tax|itns|oltas|pf ?contribution|epfo|esic|professional tax)\b/i,
    category: "tax"
  },
  { re: /\b(salary|salaries|sal ?cr|payroll|wages)\b/i, category: "salary" },
  {
    re: /\b(self|own a\/?c|own account|sweep|fd booking|fd closure|inter ?account|contra)\b/i,
    category: "transfer"
  }
];
function categorise(description, direction, side) {
  for (const r of RULES) if (r.re.test(description)) return r.category;
  if (side === "books" && /\b(invoice|inv no|bill no|tax invoice)\b/i.test(description)) {
    return direction === "in" ? "sales_invoice" : "purchase_invoice";
  }
  return direction === "in" ? "receipt" : "payment";
}
var PROTOCOL = /^(upi|neft|rtgs|imps|ach|nach|ecs|pos|atm|cms|mmt|trf|transfer|by|to|from|dr|cr|p2a|p2m|inb|ib|mob|net|clg|chq|cheque|inw|otw|ft|nfs|bil|billpay|payment|pmt|ref|utr|txn|a\/c|ac|acct)$/i;
var IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
function counterpartyFromNarration(narration) {
  const tokens3 = narration.split(/[/\-|:*]+|\s{2,}/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens3) {
    if (t.includes("@")) continue;
    if (IFSC.test(t)) continue;
    const words = t.split(/\s+/).filter((w) => !PROTOCOL.test(w));
    const cleaned = words.join(" ").trim();
    if (cleaned.length < 3) continue;
    const letters = cleaned.replace(/[^a-z]/gi, "").length;
    const digits = cleaned.replace(/[^0-9]/g, "").length;
    if (letters < 3 || digits > letters) continue;
    if (/^(chq|cheque|clearing|cash|charges?|interest|salary|self)$/i.test(
      cleaned
    ))
      continue;
    return cleaned.replace(/\s+/g, " ").slice(0, 80);
  }
  return null;
}
function referenceFromNarration(narration) {
  const m = narration.match(/\b([A-Z]{4}[RHN]\d{10,18})\b/) || // NEFT/RTGS UTRs e.g. HDFCN52026091512345
  narration.match(/\b([A-Z]{4}\d{12,18})\b/) || narration.match(/\b(\d{12})\b/) || // UPI RRN / IMPS
  narration.match(/\b(?:chq|cheque)\s*(?:no\.?)?\s*(\d{6})\b/i);
  return m ? m[1] : null;
}
function applyHeuristics(row, side) {
  const description = row.description ?? "";
  return {
    ...row,
    category: row.category ?? categorise(description, row.direction, side),
    counterparty: row.counterparty ?? (side === "bank" ? counterpartyFromNarration(description) : null),
    reference: row.reference ?? referenceFromNarration(description)
  };
}
var CLASSIFY_SYSTEM_PROMPT = `You classify transactions for an Indian chartered accountancy firm.
You receive rows that were already read from a bank statement or accounting export.
Return STRICT JSON: {"rows":[{"index":<number>,"category":<one of ${TXN_CATEGORIES.join("|")}>,"counterparty":<string or null>,"confidence":<0..1>,"reason":<string>,"direction_doubt":<boolean>}]}
Rules:
- Never invent amounts, dates or references. You cannot change them.
- counterparty is the other party's name as written in the row, or null if the row does not name one.
- confidence is how sure you are that the category and counterparty are right AND that the row is a genuine transaction (not a total, balance or header line).
- Set direction_doubt true only if the narration clearly contradicts the given direction (e.g. "reversal", "refund" marked the other way).
- reason is mandatory when confidence is below 0.75. Keep it short and factual.

${INDIA_CONTEXT}`;
function classifyUserPrompt(rows, side) {
  return JSON.stringify({
    side,
    rows: rows.map((r) => ({
      index: r.row_index,
      date: r.date,
      amount: r.amount,
      direction: r.direction,
      description: r.description,
      reference: r.reference,
      counterparty_guess: r.counterparty,
      category_guess: r.category,
      raw_text: r.raw_text.slice(0, 400)
    }))
  });
}
var READ_SYSTEM_PROMPT = `You read Indian financial documents (bank statements, tax invoices, bills, receipts) and list every transaction or invoice in them.
Return STRICT JSON: {"document_kind":"bank_statement"|"invoice"|"bill"|"receipt"|"other","rows":[{"date":"YYYY-MM-DD","amount":<positive number>,"direction":"in"|"out","description":<string>,"counterparty":<string or null>,"reference":<string or null>,"category":<one of ${TXN_CATEGORIES.join("|")}>,"currency":"INR" or ISO code,"source_text":<the exact line(s) you read this from>,"confidence":<0..1>,"reason":<string>}]}
Rules:
- Only list values that are printed in the document. Never invent or compute amounts or dates.
- For invoices use the invoice total (including tax) as amount; direction "in" for a sales invoice issued by the client, "out" for a purchase bill.
- Skip opening/closing balance lines and totals.
- Parse Indian dates (DD/MM/YYYY) into YYYY-MM-DD.
- If a value is unclear (blurry, handwritten), lower confidence below 0.75 and say why in reason.
- If there is nothing to extract return {"document_kind":"other","rows":[]}.

${INDIA_CONTEXT}`;
var digitsOnly = (s) => s.replace(/[^0-9]/g, "");
function amountAppearsIn(amount2, text) {
  if (!text) return false;
  const plain = digitsOnly(text);
  const whole = Math.floor(amount2);
  const paise = Math.round((amount2 - whole) * 100);
  const candidates = [
    `${whole}${String(paise).padStart(2, "0")}`,
    paise === 0 ? `${whole}` : ""
  ].filter(Boolean);
  return candidates.some((c) => plain.includes(c));
}
function rowsFromAiRead(aiRows, sourceText) {
  const out = [];
  aiRows.forEach((r, i) => {
    const issues = [];
    const amountNum = typeof r.amount === "number" ? r.amount : Number(String(r.amount ?? "").replace(/[^0-9.]/g, ""));
    const amount2 = Number.isFinite(amountNum) && amountNum > 0 ? round2(amountNum) : null;
    const date = parseDate(r.date ?? "");
    const direction = r.direction === "in" || r.direction === "out" ? r.direction : null;
    let confidence = Math.min(0.9, Math.max(0, Number(r.confidence ?? 0.5)));
    if (!amount2) {
      issues.push("Amount could not be read");
      confidence = Math.min(confidence, 0.3);
    }
    if (!date) {
      issues.push("Date could not be read");
      confidence = Math.min(confidence, 0.4);
    }
    if (!direction) {
      issues.push("Money in/out unclear");
      confidence = Math.min(confidence, 0.5);
    }
    if (amount2) {
      const evidence = `${r.source_text ?? ""}
${sourceText}`;
      if (sourceText && !amountAppearsIn(amount2, sourceText)) {
        issues.push("Amount does not appear in the document text");
        confidence = Math.min(confidence, 0.4);
      } else if (!sourceText && !amountAppearsIn(amount2, evidence)) {
        issues.push("Amount could not be tied to a printed line");
        confidence = Math.min(confidence, 0.5);
      }
    }
    if (!sourceText) {
      confidence = Math.min(confidence, 0.8);
    }
    const currency = (r.currency || "INR").toUpperCase();
    if (currency !== "INR") {
      issues.push(`Amount is in ${currency}`);
      confidence = Math.min(confidence, 0.5);
    }
    if (r.reason && confidence < CONFIDENCE_THRESHOLD) issues.push(r.reason);
    const category = TXN_CATEGORIES.includes(r.category) ? r.category : null;
    out.push({
      row_index: i,
      raw_text: (r.source_text || r.description || "").slice(0, 2e3),
      date,
      amount: amount2,
      direction,
      description: (r.description ?? "").slice(0, 500),
      counterparty: r.counterparty ?? null,
      reference: r.reference ?? null,
      category,
      currency,
      balance: null,
      parse_confidence: confidence,
      parse_issues: issues
    });
  });
  return out;
}
function scoreRow(row, verdict, threshold = CONFIDENCE_THRESHOLD) {
  const issues = [...row.parse_issues];
  let confidence = row.parse_confidence;
  let category = row.category;
  let counterparty = row.counterparty;
  if (verdict) {
    if (verdict.category && TXN_CATEGORIES.includes(verdict.category))
      category = verdict.category;
    if (verdict.counterparty && normaliseText(verdict.counterparty)) {
      const hay = normaliseText(`${row.raw_text} ${row.description}`);
      if (hay.includes(normaliseText(verdict.counterparty)))
        counterparty = verdict.counterparty.slice(0, 120);
    }
    if (typeof verdict.confidence === "number" && Number.isFinite(verdict.confidence)) {
      confidence = Math.min(
        confidence,
        Math.max(0, Math.min(1, verdict.confidence))
      );
      if (verdict.confidence < threshold && verdict.reason)
        issues.push(verdict.reason);
    }
    if (verdict.direction_doubt) {
      issues.push(
        "Narration suggests the money in/out direction may be reversed"
      );
      confidence = Math.min(confidence, 0.6);
    }
  }
  if (!row.amount || !row.date || !row.direction)
    confidence = Math.min(confidence, 0.4);
  confidence = round2(confidence);
  const route = confidence >= threshold ? "transaction" : "review";
  return {
    ...row,
    category,
    counterparty,
    confidence,
    reason: route === "review" ? issues.join("; ") || "Low confidence" : null,
    route
  };
}

// src/lib/bankAmount.ts
var DEBIT_HEADERS = [
  "debit",
  "debits",
  "debit amount",
  "debit amt",
  "debit amt.",
  "withdrawals",
  "withdrawal",
  "withdrawal amt",
  "withdrawal amt.",
  "withdrawal amount",
  "dr",
  "dr amount",
  "dr amt",
  "paid out",
  "money out",
  "outflow",
  "out"
];
var CREDIT_HEADERS = [
  "credit",
  "credits",
  "credit amount",
  "credit amt",
  "credit amt.",
  "deposits",
  "deposit",
  "deposit amt",
  "deposit amt.",
  "deposit amount",
  "cr",
  "cr amount",
  "cr amt",
  "paid in",
  "money in",
  "inflow",
  "in"
];
var TYPE_HEADERS = [
  "type",
  "transaction type",
  "txn type",
  "dr/cr",
  "cr/dr",
  "drcr",
  "crdr",
  "mode",
  "direction",
  "voucher type",
  "vouchertype",
  "vch type"
];
var AMOUNT_HEADERS = [
  "amount",
  "transaction amount",
  "txn amount",
  "net amount",
  "amount (inr)",
  "value",
  "voucher amount"
];
var WITHDRAWAL_HEADERS = ["withdrawals", "withdrawal", "withdrawal amt", "withdrawal amt.", "withdrawal amount", "paid out", "money out"];
var DEPOSIT_HEADERS = ["deposits", "deposit", "deposit amt", "deposit amt.", "deposit amount", "paid in", "money in"];
var normHeader = (h) => (h || "").toLowerCase().trim().replace(/[^a-z0-9/]+/g, " ").trim();
function headerMatches(header, dictionary) {
  const h = normHeader(header);
  if (!h) return false;
  const dict = dictionary.map((d) => normHeader(d));
  if (dict.includes(h)) return true;
  return dict.some((d) => d.length > 2 && (h === d || h.startsWith(d + " ") || h.endsWith(" " + d) || h.includes(" " + d + " ")));
}
var isDebitHeader = (h) => headerMatches(h, DEBIT_HEADERS);
var isCreditHeader = (h) => headerMatches(h, CREDIT_HEADERS);
var isTypeHeader = (h) => headerMatches(h, TYPE_HEADERS);
var isAmountHeader = (h) => headerMatches(h, AMOUNT_HEADERS) && !isDebitHeader(h) && !isCreditHeader(h) && !/balance/i.test(h);
function findHeaderIndex(headers, test) {
  return headers.findIndex((h) => test(h));
}
var DEBIT_WORDS = [
  "debit",
  "dr",
  "d",
  "withdrawal",
  "withdraw",
  "withdrawn",
  "out",
  "outflow",
  "paid out",
  "money out",
  "payment",
  "expense",
  "purchase",
  "spent"
];
var CREDIT_WORDS = [
  "credit",
  "cr",
  "c",
  "deposit",
  "deposited",
  "in",
  "inflow",
  "paid in",
  "money in",
  "receipt",
  "received",
  "refund",
  "income"
];
function signFromType(rawType) {
  const t = String(rawType ?? "").toLowerCase().trim().replace(/[.]/g, "");
  if (!t) return 0;
  if (t === "dr/cr" || t === "cr/dr") return 0;
  if (CREDIT_WORDS.includes(t)) return 1;
  if (DEBIT_WORDS.includes(t)) return -1;
  if (/\bcredit\b|\bdeposit\b|\bcr\b|money in|paid in|inflow|receipt/.test(t)) return 1;
  if (/\bdebit\b|\bwithdraw|\bdr\b|money out|paid out|outflow|payment/.test(t)) return -1;
  return 0;
}
function parseMoneyCell(raw) {
  if (raw == null) return { value: 0, sign: 0 };
  if (typeof raw === "number") {
    if (!isFinite(raw) || raw === 0) return { value: 0, sign: 0 };
    return { value: Math.abs(raw), sign: raw < 0 ? -1 : 1 };
  }
  let s = String(raw).trim();
  if (!s) return { value: 0, sign: 0 };
  let sign = 0;
  const suffix = s.match(/(^|[\s(])(dr|cr|debit|credit)\.?\s*$/i);
  if (suffix) {
    sign = /^c/i.test(suffix[2]) ? 1 : -1;
    s = s.slice(0, suffix.index).trim();
  } else {
    const prefix = s.match(/^(dr|cr|debit|credit)\.?[\s:]+/i);
    if (prefix) {
      sign = /^c/i.test(prefix[1]) ? 1 : -1;
      s = s.slice(prefix[0].length).trim();
    }
  }
  const parens = /^\(.*\)$/.test(s);
  if (parens) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  if (/-\s*$/.test(s)) {
    sign = -1;
    s = s.replace(/-\s*$/, "").trim();
  }
  s = s.replace(/(?:^|\s)(rs\.?|inr|usd|eur|gbp)(?=[\s\d.]|$)/gi, " ").replace(/[₹$€£¥]/g, "").replace(/[,\s'_]/g, "");
  if (!s || s === "-" || s === ".") return { value: 0, sign: 0 };
  const leadingMinus = s.startsWith("-");
  if (leadingMinus) sign = -1;
  if (s.startsWith("+")) s = s.slice(1);
  const n = parseFloat(s);
  if (!isFinite(n) || isNaN(n)) return { value: 0, sign: 0 };
  if (n === 0) return { value: 0, sign: 0 };
  return { value: Math.abs(n), sign: sign === 0 ? n < 0 ? -1 : 1 : sign };
}
function normaliseAmount(rawAmount, rawType, rawDebit, rawCredit) {
  const debit = parseMoneyCell(rawDebit);
  const credit = parseMoneyCell(rawCredit);
  if (debit.value > 0 && credit.value > 0) {
    return debit.value >= credit.value ? -debit.value : credit.value;
  }
  if (debit.value > 0) return -debit.value;
  if (credit.value > 0) return credit.value;
  const amt = parseMoneyCell(rawAmount);
  if (amt.value === 0) return 0;
  const typeSign = signFromType(rawType);
  if (typeSign !== 0) return typeSign * amt.value;
  return (amt.sign === -1 ? -1 : 1) * amt.value;
}
function detectAmountPattern(headers, sampleRows = []) {
  const debitIdx = findHeaderIndex(headers, isDebitHeader);
  const creditIdx = findHeaderIndex(headers, isCreditHeader);
  const amountIdx = findHeaderIndex(headers, isAmountHeader);
  const typeIdx = findHeaderIndex(headers, isTypeHeader);
  let pattern = null;
  let label = "unknown";
  if (debitIdx !== -1 && creditIdx !== -1) {
    const isWithdrawDeposit = headerMatches(headers[debitIdx], WITHDRAWAL_HEADERS) || headerMatches(headers[creditIdx], DEPOSIT_HEADERS);
    pattern = isWithdrawDeposit ? 4 : 2;
    label = isWithdrawDeposit ? "Pattern 4 \u2014 withdrawal / deposit columns" : "Pattern 2 \u2014 separate debit / credit columns";
  } else if (amountIdx !== -1) {
    const cells2 = sampleRows.map((r) => r?.[amountIdx]).filter((c) => c != null && String(c).trim() !== "");
    const hasSuffix = cells2.some((c) => /\b(dr|cr)\.?\s*$/i.test(String(c)));
    const parsed = cells2.map((c) => parseMoneyCell(c));
    const hasNegative = parsed.some((p) => p.sign === -1 && p.value > 0);
    if (hasSuffix) {
      pattern = 5;
      label = "Pattern 5 \u2014 DR/CR suffix inside the amount cell";
    } else if (typeIdx !== -1 && !hasNegative) {
      pattern = 1;
      label = "Pattern 1 \u2014 single amount column + type column";
    } else if (hasNegative) {
      pattern = 3;
      label = "Pattern 3 \u2014 single signed amount column";
    } else if (typeIdx !== -1) {
      pattern = 1;
      label = "Pattern 1 \u2014 single amount column + type column";
    } else {
      pattern = 3;
      label = "Pattern 3 \u2014 single amount column (unsigned, treated as credit)";
    }
  } else if (debitIdx !== -1 || creditIdx !== -1) {
    pattern = 2;
    label = "Pattern 2 \u2014 single-sided debit or credit column";
  }
  return { pattern, debitIdx, creditIdx, amountIdx, typeIdx, label };
}

// src/lib/practice/extract/table.ts
function detectDelimiter(sample) {
  const lines2 = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", "	", ";", "|"]) {
    const counts = lines2.map((l) => splitDelimited(l, d).length);
    const common = counts.filter((c) => c > 1);
    const score = common.length ? common.length * Math.min(...common) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}
function splitDelimited(line, delim) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}
function parseDelimited(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const delim = detectDelimiter(clean);
  const rows = [];
  let buf = "";
  let quotes = 0;
  for (const line of clean.split(/\r?\n/)) {
    buf = buf ? `${buf}
${line}` : line;
    quotes += (line.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      rows.push(splitDelimited(buf, delim));
      buf = "";
      quotes = 0;
    }
  }
  if (buf) rows.push(splitDelimited(buf, delim));
  return rows.filter((r) => r.some((c) => c !== ""));
}
var norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
var has = (h, words) => words.some((w) => norm(h) === w || norm(h).includes(w));
var DATE_WORDS = [
  "txn date",
  "transaction date",
  "tran date",
  "posting date",
  "date"
];
var VALUE_DATE_WORDS = ["value date", "value dt"];
var DESC_WORDS = [
  "narration",
  "description",
  "particulars",
  "transaction remarks",
  "remarks",
  "details",
  "transaction details"
];
var REF_WORDS = [
  "chq ref no",
  "ref no cheque no",
  "cheque no",
  "chq no",
  "ref no",
  "reference",
  "utr",
  "instrument no",
  "transaction id",
  "voucher no",
  "vch no"
];
var PARTY_WORDS = [
  "party",
  "counterparty",
  "beneficiary",
  "payee",
  "ledger",
  "account name",
  "customer",
  "vendor",
  "supplier"
];
var BALANCE_WORDS = ["balance", "closing balance", "running balance"];
var VCH_TYPE_WORDS = ["vch type", "voucher type", "vchtype", "voucher type name", "vch typ"];
var CURRENCY_WORDS = ["currency", "ccy"];
function findBy(headers, words, exclude = []) {
  for (const w of words) {
    const i = headers.findIndex(
      (h, idx) => !exclude.includes(idx) && norm(h) === w
    );
    if (i !== -1) return i;
  }
  return headers.findIndex((h, idx) => !exclude.includes(idx) && has(h, words));
}
function mapColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const headers = rows[r].map((c) => String(c ?? ""));
    const lower = headers.map(norm);
    const hasDate = lower.some((h) => h.includes("date"));
    const hasMoney = headers.some(
      (h) => isDebitHeader(h) || isCreditHeader(h) || isAmountHeader(h)
    );
    if (!hasDate || !hasMoney) continue;
    const detected = detectAmountPattern(headers, rows.slice(r + 1, r + 21));
    const valueDate = findBy(headers, VALUE_DATE_WORDS);
    let date = findBy(headers, DATE_WORDS, valueDate === -1 ? [] : [valueDate]);
    if (date === -1) date = valueDate;
    const balance = findBy(headers, BALANCE_WORDS);
    return {
      headerRow: r,
      date,
      valueDate,
      description: findBy(headers, DESC_WORDS),
      reference: findBy(headers, REF_WORDS),
      counterparty: findBy(headers, PARTY_WORDS),
      balance,
      currency: findBy(headers, CURRENCY_WORDS),
      debit: detected.debitIdx,
      credit: detected.creditIdx,
      // A "balance" column must never be read as the amount.
      amount: detected.amountIdx === balance ? findHeaderIndex(
        headers.map((h, i) => i === balance ? "" : h),
        isAmountHeader
      ) : detected.amountIdx,
      type: detected.typeIdx,
      vchType: findBy(headers, VCH_TYPE_WORDS)
    };
  }
  return null;
}
var FOREIGN_CCY = /\b(USD|EUR|GBP|AED|SGD|JPY|AUD|CAD)\b|[$€£¥]/i;
var SUMMARY_LINE = /\b(total|totals|opening balance|closing balance|opening bal|closing bal|balance b\/?f|balance c\/?f|carried forward|brought forward|statement summary|grand total|sub ?total)\b/i;
function directionFromVoucherType(vch) {
  const v = vch.trim().toLowerCase();
  if (/^(receipt|sales|sale|debit note)\b/.test(v)) return "in";
  if (/^(payment|purchase|credit note)\b/.test(v)) return "out";
  return null;
}
function isTallyLedger(rows) {
  const map = mapColumns(rows);
  if (!map) return false;
  const headers = rows[map.headerRow].map((h) => norm(String(h ?? "")));
  const vchNo = headers.some((h) => /^(vch|voucher) ?no\b|^(vch|voucher) ?number/.test(h));
  return (map.vchType >= 0 || vchNo) && (map.debit >= 0 || map.credit >= 0);
}
function rowsFromTable(rows, side) {
  const map = mapColumns(rows);
  if (!map) return null;
  const booksDebitIn = side === "books" && (map.debit >= 0 || map.credit >= 0) && isTallyLedger(rows);
  const header = rows[map.headerRow];
  const cell = (r, i) => i >= 0 ? String(r[i] ?? "").trim() : "";
  const unsignedSingleColumn = map.debit === -1 && map.credit === -1 && map.type === -1;
  const tallyLayout = isTallyLedger(rows);
  let nameCol = -1;
  if (tallyLayout && map.description >= 0 && !String(header[map.description + 1] ?? "").trim()) {
    const first = rows.slice(map.headerRow + 1, map.headerRow + 60).map((r) => String(r[map.description] ?? "").trim()).filter(Boolean);
    const sideWords = first.filter((v) => /^(by|to|dr|cr)\.?$/i.test(v)).length;
    if (first.length && sideWords / first.length >= 0.6) nameCol = map.description + 1;
  }
  const dayBook = tallyLayout && rows.slice(0, map.headerRow).some((r) => /\bday ?book\b/i.test(r.join(" ")));
  const NON_BANK_VCH = /^(sales|sale|purchase|journal|credit note|debit note|memorandum|stock journal|rejections? (in|out))\b/i;
  const out = [];
  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawText = header.map((h, i) => `${h || `col${i + 1}`}: ${cell(row, i)}`).filter((s) => !s.endsWith(": ")).join(" | ");
    const dateCell = cell(row, map.date) || cell(row, map.valueDate);
    const date = parseDate(dateCell);
    const vchTypeCell = cell(row, map.vchType);
    const vchNoCell = header.findIndex((h) => /^(vch|voucher) ?no\b|^(vch|voucher) ?number/.test(norm(String(h ?? ""))));
    const rawDescription = nameCol >= 0 ? cell(row, nameCol) : cell(row, map.description);
    const description = /^(by|to|dr|cr)\.?$/i.test(rawDescription) || !rawDescription ? [vchTypeCell, vchNoCell >= 0 ? cell(row, vchNoCell) : ""].filter(Boolean).join(" ") || rawDescription : rawDescription;
    if (tallyLayout && !vchTypeCell && SUMMARY_LINE.test(row.join(" "))) continue;
    if (dayBook && NON_BANK_VCH.test(vchTypeCell)) continue;
    let signed2 = round2(
      normaliseAmount(
        cell(row, map.amount),
        cell(row, map.type),
        cell(row, map.debit),
        cell(row, map.credit)
      )
    );
    if (booksDebitIn) signed2 = -signed2;
    const vchDir = side === "books" ? directionFromVoucherType(cell(row, map.vchType)) : null;
    if (vchDir && signed2 !== 0) signed2 = vchDir === "in" ? Math.abs(signed2) : -Math.abs(signed2);
    if (tallyLayout && !date && signed2 !== 0) continue;
    if (!date && signed2 === 0) {
      const text = row.filter(Boolean).join(" ").trim();
      const prev = out[out.length - 1];
      if (prev && text && !SUMMARY_LINE.test(text)) {
        prev.description = `${prev.description} ${text}`.trim();
        prev.raw_text = `${prev.raw_text} | ${text}`;
      }
      continue;
    }
    if (signed2 === 0) continue;
    if (SUMMARY_LINE.test(description) || !date && SUMMARY_LINE.test(row.join(" ")))
      continue;
    const issues = [];
    let confidence = 0.97;
    if (!date) {
      issues.push(`Date "${dateCell}" could not be read`);
      confidence = 0.3;
    }
    if (unsignedSingleColumn && parseMoneyCell(cell(row, map.amount)).sign !== -1) {
      issues.push(
        "Statement has one unsigned amount column; money in/out was assumed"
      );
      confidence = Math.min(confidence, 0.6);
    }
    if (!description) {
      issues.push("No narration on this line");
      confidence = Math.min(confidence, 0.7);
    }
    const ccyCell = cell(row, map.currency);
    const rawMoney = `${cell(row, map.amount)} ${cell(row, map.debit)} ${cell(row, map.credit)}`;
    const foreign = ccyCell && !/^(inr|rs|₹)$/i.test(ccyCell) || FOREIGN_CCY.test(rawMoney);
    const currency = foreign ? (ccyCell || rawMoney.match(FOREIGN_CCY)?.[0] || "FOREIGN").toUpperCase() : "INR";
    if (foreign) {
      issues.push(
        `Amount is in ${currency}; multi-currency lines are reviewed by a person`
      );
      confidence = Math.min(confidence, 0.5);
    }
    const balanceCell = cell(row, map.balance);
    const balance = balanceCell ? normaliseAmount(balanceCell) : null;
    out.push({
      row_index: r,
      raw_text: rawText,
      date,
      amount: Math.abs(signed2),
      direction: signed2 < 0 ? "out" : "in",
      description,
      counterparty: cell(row, map.counterparty) || (nameCol >= 0 && rawDescription && !/^(by|to|dr|cr)\.?$/i.test(rawDescription) ? rawDescription : null),
      reference: cell(row, map.reference) || null,
      category: null,
      currency,
      balance: balanceCell ? round2(balance ?? 0) : null,
      parse_confidence: confidence,
      parse_issues: issues
    });
  }
  if (amountsAreDayNumbers(out)) return null;
  return out;
}
function amountsAreDayNumbers(rows) {
  const dated = rows.filter((r) => r.date && r.amount);
  if (dated.length < 8) return false;
  const same = dated.filter((r) => Number.isInteger(r.amount) && r.amount === Number(String(r.date).slice(8, 10))).length;
  return same / dated.length >= 0.8;
}
function looksLikeSpreadsheetBinary(bytes) {
  const zip = bytes[0] === 80 && bytes[1] === 75;
  const ole = bytes[0] === 208 && bytes[1] === 207 && bytes[2] === 17 && bytes[3] === 224;
  return zip || ole;
}

// src/lib/practice/extract/xml.ts
var ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'"
};
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code >= 32 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}
function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while (m = re.exec(s)) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  return attrs;
}
function parseXml(input) {
  const src = input.replace(/^\uFEFF/, "");
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      stack[stack.length - 1].text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i)
      stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      stack[stack.length - 1].text += src.slice(
        lt + 9,
        end === -1 ? src.length : end
      );
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src[lt + 1] === "?" || src[lt + 1] === "!") {
      const end = src.indexOf(">", lt);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    const gt = src.indexOf(">", lt);
    if (gt === -1) throw new Error("Malformed XML: unterminated tag");
    const body = src.slice(lt + 1, gt);
    i = gt + 1;
    if (body.startsWith("/")) {
      const name2 = body.slice(1).trim().toUpperCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === name2) {
          stack.length = s;
          break;
        }
      }
      continue;
    }
    const selfClosing = body.endsWith("/");
    const inner = selfClosing ? body.slice(0, -1) : body;
    const sp = inner.search(/\s/);
    const name = (sp === -1 ? inner : inner.slice(0, sp)).trim().toUpperCase();
    const node = {
      name,
      attrs: sp === -1 ? {} : parseAttrs(inner.slice(sp)),
      children: [],
      text: ""
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}
function findAll(node, name, out = []) {
  const upper = name.toUpperCase();
  for (const c of node.children) {
    if (c.name === upper) out.push(c);
    findAll(c, upper, out);
  }
  return out;
}
function childText(node, name) {
  const upper = name.toUpperCase();
  const c = node.children.find((x) => x.name === upper);
  return c ? c.text.trim() : "";
}
function children(node, name) {
  const upper = name.toUpperCase();
  return node.children.filter((x) => x.name === upper);
}

// src/lib/practice/extract/tally.ts
var TYPE_MAP = {
  receipt: { direction: "in", category: "receipt" },
  payment: { direction: "out", category: "payment" },
  sales: { direction: "in", category: "sales_invoice" },
  "credit note": { direction: "out", category: "sales_invoice" },
  purchase: { direction: "out", category: "purchase_invoice" },
  "debit note": { direction: "in", category: "purchase_invoice" },
  contra: { direction: null, category: "transfer" },
  journal: { direction: null, category: "journal" }
};
var NOT_BANK = /\b(charges?|interest|commission|fees?|gst|tds|loan)\b/i;
var BANK_HINT = /\b(bank|hdfc|icici|sbi|axis|kotak|yes bank|idfc|indusind|federal|canara|pnb|bob|union bank|cash)\b/i;
var CASH_LEDGER = /^(petty\s+)?cash(\s*-?\s*in\s*-?\s*hand)?(\s+a\/c)?$/i;
function ledgerEntries(v) {
  const lists = [
    ...children(v, "ALLLEDGERENTRIES.LIST"),
    ...children(v, "LEDGERENTRIES.LIST")
  ];
  return lists.map((l) => {
    const rawAlloc = children(l, "BANKALLOCATIONS.LIST")[0];
    const alloc = rawAlloc && (childText(rawAlloc, "AMOUNT") || childText(rawAlloc, "INSTRUMENTNUMBER") || childText(rawAlloc, "UNIQUEREFERENCEID") || childText(rawAlloc, "TRANSACTIONID") || childText(rawAlloc, "TRANSACTIONTYPE") || childText(rawAlloc, "BANKNAME") || childText(rawAlloc, "INSTRUMENTDATE")) ? rawAlloc : void 0;
    const instrument = alloc ? childText(alloc, "INSTRUMENTNUMBER") || childText(alloc, "UNIQUEREFERENCEID") || childText(alloc, "TRANSACTIONID") || null : null;
    const money = parseMoneyCell(childText(l, "AMOUNT"));
    const ledger = childText(l, "LEDGERNAME");
    return {
      ledger,
      amount: money.sign === -1 ? -money.value : money.value,
      // "Bank Charges" / "Bank Interest" are expense or income ledgers, not the bank account.
      isBank: Boolean(alloc) || BANK_HINT.test(ledger) && !NOT_BANK.test(ledger),
      isCash: !alloc && CASH_LEDGER.test(ledger.trim()),
      hasAllocation: Boolean(alloc),
      instrument
    };
  });
}
function isTallyXml(text) {
  const head2 = text.slice(0, 4e3).toUpperCase();
  return head2.includes("<ENVELOPE") || head2.includes("<TALLYMESSAGE") || head2.includes("<VOUCHER");
}
var NON_BANK_TYPES = /* @__PURE__ */ new Set([
  "sales",
  "purchase",
  "journal",
  "credit note",
  "debit note",
  "memorandum",
  "rejections out",
  "rejections in"
]);
function readTally(xml) {
  const doc = parseXml(xml);
  const vouchers = findAll(doc, "VOUCHER");
  const out = [];
  let skippedNonBank = 0;
  let skippedCancelled = 0;
  let skippedCash = 0;
  vouchers.forEach((v, idx) => {
    const vtype = (childText(v, "VOUCHERTYPENAME") || v.attrs.VCHTYPE || "").trim();
    const kind = TYPE_MAP[vtype.toLowerCase()] ?? null;
    const date = parseDate(
      childText(v, "DATE") || childText(v, "EFFECTIVEDATE")
    );
    const party = childText(v, "PARTYLEDGERNAME") || childText(v, "PARTYNAME") || null;
    const narration = childText(v, "NARRATION");
    const vno = childText(v, "VOUCHERNUMBER") || null;
    const entries = ledgerEntries(v);
    const cancelled = /^yes$/i.test(childText(v, "ISCANCELLED")) || /^yes$/i.test(childText(v, "ISOPTIONAL"));
    if (cancelled) {
      skippedCancelled++;
      return;
    }
    const issues = [];
    let confidence = 0.95;
    const bankEntry = entries.find((e) => e.hasAllocation) ?? entries.find((e) => e.isBank && !e.isCash);
    if (!bankEntry && entries.some((e) => e.isCash)) {
      skippedCash++;
      return;
    }
    const partyEntry = party ? entries.find((e) => e.ledger === party) : void 0;
    if (!bankEntry && NON_BANK_TYPES.has(vtype.toLowerCase())) {
      skippedNonBank++;
      return;
    }
    const pick = bankEntry ?? partyEntry ?? [...entries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const amount2 = pick ? round2(Math.abs(pick.amount)) : 0;
    let direction = null;
    if (bankEntry && bankEntry.amount !== 0)
      direction = bankEntry.amount < 0 ? "in" : "out";
    else if (kind?.direction) direction = kind.direction;
    if ((vtype.toLowerCase() === "payment" || vtype.toLowerCase() === "receipt") && kind?.direction && direction && direction !== kind.direction) {
      issues.push(`The bank leg's sign disagrees with the voucher type (${vtype}); read as ${kind.direction === "in" ? "money in" : "money out"}`);
      direction = kind.direction;
      confidence = Math.min(confidence, 0.8);
    }
    if (!direction) {
      direction = "out";
      issues.push(
        `${vtype || "Voucher"} has no bank ledger, so money in/out was assumed`
      );
      confidence = 0.55;
    }
    if (!kind) {
      issues.push(`Unfamiliar voucher type "${vtype}"`);
      confidence = Math.min(confidence, 0.7);
    }
    if (!date) {
      issues.push("Voucher date missing");
      confidence = 0.3;
    }
    if (!amount2) return;
    const partyIsBank = Boolean(party && entries.some((e) => e.ledger === party && (e.isBank || e.isCash || e.hasAllocation)));
    const counterparty = (party && !partyIsBank ? party : null) ?? entries.find((e) => !e.isBank && !e.isCash && !e.hasAllocation)?.ledger ?? (party && !partyIsBank ? party : null);
    const reference = bankEntry?.instrument || childText(v, "REFERENCE") || vno;
    const rawText = [
      `Voucher ${vtype} #${vno ?? "?"}`,
      `Date ${childText(v, "DATE")}`,
      party ? `Party ${party}` : "",
      narration ? `Narration ${narration}` : "",
      ...entries.map((e) => `${e.ledger}: ${e.amount}`)
    ].filter(Boolean).join(" | ");
    out.push({
      row_index: idx,
      raw_text: rawText,
      date,
      amount: amount2,
      direction,
      description: narration || [vtype, counterparty].filter(Boolean).join(" \u2014 "),
      counterparty,
      reference: reference || null,
      category: kind?.category ?? null,
      currency: "INR",
      balance: null,
      parse_confidence: confidence,
      parse_issues: issues
    });
  });
  return {
    rows: out,
    skippedNonBank,
    skippedCancelled,
    skippedCash,
    vouchers: vouchers.length
  };
}

// src/lib/practice/extract/tallyLedger.ts
var TAGS = [
  "DSPVCHDATE",
  "DSPVCHLEDACCOUNT",
  "NAMEFIELD",
  "INFOFIELD",
  "DSPVCHTYPE",
  "DSPVCHDRAMT",
  "DSPVCHCRAMT",
  "DSPEXPLVCHNUMBER",
  "DSPVCHEXPLACCOUNT",
  "DSPVCHEXPLDRAMTEXCELEXPORT",
  "DSPVCHEXPLCRAMTEXCELEXPORT"
];
var TYPES = {
  ctra: { name: "Contra", category: "transfer" },
  contra: { name: "Contra", category: "transfer" },
  pymt: { name: "Payment", category: "payment" },
  payment: { name: "Payment", category: "payment" },
  rcpt: { name: "Receipt", category: "receipt" },
  receipt: { name: "Receipt", category: "receipt" },
  jrnl: { name: "Journal", category: "journal" },
  journal: { name: "Journal", category: "journal" },
  sale: { name: "Sales", category: "sales_invoice" },
  sales: { name: "Sales", category: "sales_invoice" },
  purc: { name: "Purchase", category: "purchase_invoice" },
  purchase: { name: "Purchase", category: "purchase_invoice" },
  crnt: { name: "Credit Note", category: "sales_invoice" },
  "credit note": { name: "Credit Note", category: "sales_invoice" },
  dbnt: { name: "Debit Note", category: "purchase_invoice" },
  "debit note": { name: "Debit Note", category: "purchase_invoice" }
};
function isTallyLedgerXml(text) {
  const head2 = text.slice(0, 6e4);
  return /<DSPVCHDATE\b/i.test(head2) && !/<VOUCHER[\s>]/i.test(head2);
}
var AS_PER_DETAILS = /^\(as per details\)$/i;
function lines(xml) {
  const out = [];
  let cur = null;
  const re = new RegExp(
    `<(${TAGS.join("|")})\\b[^>]*?(?:/>|>([\\s\\S]*?)</\\1\\s*>)`,
    "gi"
  );
  for (const m of xml.matchAll(re)) {
    const tag2 = m[1].toUpperCase();
    const value = decodeEntities((m[2] ?? "").trim());
    if (tag2 === "DSPVCHDATE") {
      cur = {};
      out.push(cur);
    }
    if (!cur) {
      cur = {};
      out.push(cur);
    }
    if (tag2 === "DSPVCHEXPLACCOUNT") {
      (cur.expl ??= []).push({ account: value, amount: 0 });
      continue;
    }
    if (tag2 === "DSPVCHEXPLDRAMTEXCELEXPORT" || tag2 === "DSPVCHEXPLCRAMTEXCELEXPORT") {
      const last = cur.expl?.[cur.expl.length - 1];
      if (last && !last.amount) last.amount = amountOf(value);
      continue;
    }
    if (cur[tag2] === void 0 || cur[tag2] === "") cur[tag2] = value;
  }
  return out;
}
function amountOf(raw) {
  const t = (raw ?? "").replace(/[,\s₹]/g, "").replace(/(dr|cr)$/i, "");
  if (!t || t === "-") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? round2(Math.abs(n)) : 0;
}
var numberOf = (raw) => {
  const m = /No\.?\s*:?\s*([^)]*?)\s*\)?\s*$/i.exec(raw ?? "");
  const v = (m ? m[1] : raw ?? "").trim();
  return v || null;
};
var str = (l, k) => {
  const v = l[k];
  return typeof v === "string" ? v : void 0;
};
function readTallyLedgerXml(xml) {
  const all = lines(xml);
  const rows = [];
  let skipped = 0;
  let debitPaise = 0;
  let creditPaise = 0;
  const dates = [];
  all.forEach((l, idx) => {
    const date = parseDate(str(l, "DSPVCHDATE"));
    const dr = amountOf(str(l, "DSPVCHDRAMT"));
    const cr = amountOf(str(l, "DSPVCHCRAMT"));
    if (!date || !dr && !cr) {
      skipped++;
      return;
    }
    dates.push(date);
    const typeRaw = (str(l, "DSPVCHTYPE") ?? "").trim();
    const type = TYPES[typeRaw.toLowerCase()] ?? null;
    let particulars = (str(l, "DSPVCHLEDACCOUNT") ?? "").trim() || null;
    if (particulars && AS_PER_DETAILS.test(particulars)) {
      const biggest = [...l.expl ?? []].sort(
        (a, b) => b.amount - a.amount
      )[0];
      particulars = biggest?.account || null;
    }
    const narration = (str(l, "INFOFIELD") ?? "").trim();
    const vno = numberOf(str(l, "DSPEXPLVCHNUMBER"));
    const sides = [];
    if (dr) sides.push({ amount: dr, direction: "in" });
    if (cr) sides.push({ amount: cr, direction: "out" });
    for (const s of sides) {
      const issues = [];
      let confidence = 0.95;
      if (!type) {
        issues.push(`Unfamiliar voucher type "${typeRaw}"`);
        confidence = 0.7;
      }
      if (sides.length > 1) {
        issues.push(
          "This line has both a debit and a credit amount; both were kept"
        );
        confidence = Math.min(confidence, 0.8);
      }
      if (s.direction === "in") debitPaise += Math.round(s.amount * 100);
      else creditPaise += Math.round(s.amount * 100);
      rows.push({
        row_index: idx,
        raw_text: [
          `Ledger entry ${type?.name ?? typeRaw} #${vno ?? "?"}`,
          `Date ${str(l, "DSPVCHDATE")}`,
          particulars ? `Particulars ${particulars}` : "",
          narration ? `Narration ${narration}` : "",
          `${s.direction === "in" ? "Debit" : "Credit"} ${s.amount.toFixed(2)}`
        ].filter(Boolean).join(" | "),
        date,
        amount: s.amount,
        direction: s.direction,
        description: narration || [type?.name ?? typeRaw, particulars].filter(Boolean).join(" \u2014 "),
        counterparty: particulars,
        reference: vno,
        category: type?.category ?? null,
        currency: "INR",
        balance: null,
        parse_confidence: confidence,
        parse_issues: issues
      });
    }
  });
  const sorted = [...dates].sort();
  const isInvoice = (l) => {
    const t = TYPES[(str(l, "DSPVCHTYPE") ?? "").trim().toLowerCase()];
    return t?.category === "sales_invoice" || t?.category === "purchase_invoice";
  };
  const invoiceLines = all.filter(
    (l) => isInvoice(l) && AS_PER_DETAILS.test((str(l, "DSPVCHLEDACCOUNT") ?? "").trim())
  );
  const party = invoiceLines.length > 0;
  const amt = (l) => Math.round(
    (amountOf(str(l, "DSPVCHDRAMT")) || amountOf(str(l, "DSPVCHCRAMT"))) * 100
  );
  const salesSide = invoiceLines.filter(
    (l) => TYPES[(str(l, "DSPVCHTYPE") ?? "").trim().toLowerCase()]?.category === "sales_invoice"
  );
  const customer = salesSide.length >= invoiceLines.length - salesSide.length;
  const settlement = (l) => {
    const c = TYPES[(str(l, "DSPVCHTYPE") ?? "").trim().toLowerCase()]?.category;
    return c === "receipt" || c === "payment";
  };
  const seen = /* @__PURE__ */ new Set();
  const duplicateInvoices = [];
  for (const l of invoiceLines) {
    const n = numberOf(str(l, "DSPEXPLVCHNUMBER"));
    if (!n) continue;
    if (seen.has(n) && !duplicateInvoices.includes(n))
      duplicateInvoices.push(n);
    seen.add(n);
  }
  return {
    party,
    invoicePaise: invoiceLines.reduce((n, l) => n + amt(l), 0),
    settledPaise: all.filter(settlement).reduce((n, l) => n + amt(l), 0),
    customer,
    duplicateInvoices,
    rows,
    lines: all.length,
    skipped,
    debitPaise,
    creditPaise,
    firstDate: sorted[0] ?? null,
    lastDate: sorted[sorted.length - 1] ?? null
  };
}
function ledgerTotalsNote(r) {
  const money = (p) => `\u20B9${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const n = r.rows.length;
  return `Ledger export: ${n} entr${n === 1 ? "y" : "ies"} from ${r.firstDate} to ${r.lastDate}. Debits ${money(r.debitPaise)}, credits ${money(r.creditPaise)}. Check these totals against the ledger in Tally.`;
}
var inr2 = (p) => `\u20B9${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function partyLedgerSummary(r) {
  const who = r.customer ? "customer" : "supplier";
  const net = r.invoicePaise - r.settledPaise;
  return {
    entries: r.lines - r.skipped,
    totals: [
      {
        label: r.customer ? "Invoiced (sales)" : "Billed (purchases)",
        amount: r.invoicePaise / 100
      },
      { label: r.customer ? "Received" : "Paid", amount: r.settledPaise / 100 },
      {
        label: net >= 0 ? "Outstanding for the period" : "Settled in excess of the period's invoices",
        amount: Math.abs(net) / 100
      }
    ],
    checks: [
      {
        ok: r.duplicateInvoices.length === 0,
        label: "No invoice entered twice",
        detail: r.duplicateInvoices.length ? `Voucher numbers entered twice: ${r.duplicateInvoices.slice(0, 5).join(", ")}.` : "Every invoice number appears once."
      }
    ],
    note: `This is a ${who} ledger (${r.firstDate} to ${r.lastDate}), so it was kept for outstanding and ageing checks and not used as bank lines. ${inr2(r.invoicePaise)} ${r.customer ? "invoiced" : "billed"}, ${inr2(r.settledPaise)} ${r.customer ? "received" : "paid"}. The opening balance is not in the export, so add it in Tally to get the closing balance. To reconcile the bank, use the bank book or the Day Book.`
  };
}

// src/lib/practice/extract/tallyMasters.ts
function isTallyMastersXml(text) {
  const head2 = text.slice(0, 2e5);
  return /<LEDGER\s+NAME\s*=/i.test(head2) && !/<VOUCHER[\s>]/i.test(head2) && !/<DSPVCHDATE\b/i.test(head2);
}
var tag = (block, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, "i").exec(
    block
  );
  return m ? decodeEntities(m[1].trim()) || null : null;
};
function readTallyMasters(xml) {
  const ledgers = [];
  for (const m of xml.matchAll(
    /<LEDGER\s+NAME\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER\s*>/gi
  )) {
    const body = m[2];
    const opening = Number(
      (tag(body, "OPENINGBALANCE") ?? "0").replace(/[,\s₹]/g, "").replace(/(dr|cr)$/i, "")
    );
    ledgers.push({
      name: decodeEntities(m[1]).trim(),
      parent: tag(body, "PARENT") ?? "",
      opening: Number.isFinite(opening) ? opening : 0,
      gstin: tag(body, "PARTYGSTIN"),
      state: tag(body, "LEDSTATENAME")
    });
  }
  let debitPaise = 0;
  let creditPaise = 0;
  for (const l of ledgers) {
    const p = Math.round(Math.abs(l.opening) * 100);
    if (l.opening < 0) debitPaise += p;
    else if (l.opening > 0) creditPaise += p;
  }
  return {
    company: tag(xml, "SVCURRENTCOMPANY"),
    ledgers,
    debitPaise,
    creditPaise
  };
}
var inr3 = (p) => `\u20B9${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var BANK_GROUPS = /^(bank accounts|bank od a\/c|bank occ a\/c)$/i;
var CASH_GROUP = /^cash-in-hand$/i;
function mastersSummary(r) {
  const byGroup = /* @__PURE__ */ new Map();
  for (const l of r.ledgers) {
    const g = byGroup.get(l.parent || "(no group)") ?? { amount: 0, count: 0 };
    g.count++;
    g.amount += Math.abs(l.opening);
    byGroup.set(l.parent || "(no group)", g);
  }
  const names = /* @__PURE__ */ new Map();
  for (const l of r.ledgers)
    names.set(l.name.toLowerCase(), (names.get(l.name.toLowerCase()) ?? 0) + 1);
  const dupes = [...names].filter(([, n]) => n > 1).map(([k]) => k);
  const banks = r.ledgers.filter((l) => BANK_GROUPS.test(l.parent));
  const cash = r.ledgers.filter((l) => CASH_GROUP.test(l.parent));
  const noGroup = r.ledgers.filter((l) => !l.parent);
  const diff = r.debitPaise - r.creditPaise;
  return {
    entries: r.ledgers.length,
    totals: [
      { label: "Opening debits", amount: r.debitPaise / 100 },
      { label: "Opening credits", amount: r.creditPaise / 100 }
    ],
    groups: [...byGroup].map(([key, g]) => ({
      key,
      amount: Math.round(g.amount * 100) / 100,
      count: g.count
    })).sort((a, b) => b.count - a.count),
    checks: [
      {
        ok: Math.abs(diff) <= 100,
        label: "Opening balances balance",
        detail: Math.abs(diff) <= 100 ? `Debits and credits are both ${inr3(r.debitPaise)}.` : `Debits ${inr3(r.debitPaise)} and credits ${inr3(r.creditPaise)} differ by ${inr3(Math.abs(diff))}. Tally will not accept an opening position that does not balance; check the ledgers with an opening balance.`
      },
      {
        ok: banks.length > 0,
        label: "A bank ledger is present",
        detail: banks.length ? `${banks.map((b) => b.name).join(", ")}.` : "No ledger sits under Bank Accounts, so there is nothing for a bank statement to be reconciled with."
      },
      {
        ok: cash.length > 0,
        label: "A cash ledger is present",
        detail: cash.length ? `${cash.map((c) => c.name).join(", ")}.` : "No ledger sits under Cash-in-Hand, so a cash withdrawal cannot be recorded as a transfer."
      },
      {
        ok: dupes.length === 0,
        label: "No ledger name twice",
        detail: dupes.length ? `Names that appear twice: ${dupes.slice(0, 5).join(", ")}.` : "Every ledger name is unique."
      },
      {
        ok: noGroup.length === 0,
        label: "Every ledger has a group",
        detail: noGroup.length ? `${noGroup.length} ledger(s) have no group, for example ${noGroup[0].name}.` : "Every ledger sits under a group."
      }
    ],
    note: `${r.company ? `Ledgers of ${r.company}: ` : "Ledgers: "}${r.ledgers.length} in ${byGroup.size} groups. A masters file holds no transactions, so none were created. It is used to check that entries only go to ledgers that exist and that the opening position balances.`
  };
}

// src/lib/practice/extract/unsupported.ts
var cells = (row) => row.map((c) => String(c ?? "").trim()).filter(Boolean);
function unsupportedReport(table) {
  const numeric = /^[\d,.\-]+$|\d{1,2}[\/-][\w]{1,3}[\/-]\d{2,4}/;
  const titles = table.slice(0, 12).map(cells).filter((r) => r.length > 0 && r.length <= 2 && !r.some((c) => numeric.test(c))).map((r) => r.join(" ").toLowerCase());
  const hit = (re) => titles.some((t) => re.test(t));
  const how = "Export the bank ledger (Display More Reports, Account Books, Ledger) as Excel, or the Day Book, instead.";
  if (hit(/\btrial balance\b/)) return `This is a Trial Balance. FynHelp does not read trial balances yet, because they hold balances, not transactions. ${how}`;
  if (hit(/\b(ageing|aging)\b|\bbills? (receivable|payable)\b|\boutstandings?\b|\bdebtors?\b.*\b(ageing|aging)\b/))
    return `This looks like a debtors or creditors ageing report. FynHelp does not read ageing reports yet, because they list balances, not transactions. ${how}`;
  return null;
}
var TALLY_XML_NO_VOUCHERS = "This Tally XML has no vouchers and no ledger entries in it, so it is a report FynHelp does not use (for example a Trial Balance). In Tally, export the Day Book as XML, or the ledger as XML or Excel (Spreadsheet).";

// src/lib/practice/extract/registers.ts
var REGISTER_LABELS = {
  gst_sales_register: "GST sales register",
  gst_purchase_register: "GST purchase register",
  invoice_register: "Invoice register",
  gstr2b: "GSTR-2B",
  tds_register: "TDS register",
  payroll: "Payroll sheet",
  gateway_settlement: "Payment gateway settlement report",
  tally_masters: "Tally ledger masters",
  tally_party_ledger: "Tally customer or supplier ledger"
};
var norm2 = (s) => s.toLowerCase().replace(/[_\s]+/g, " ").replace(/[^a-z0-9% ]/g, "").trim();
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells2 = rows[i].map((c) => norm2(String(c ?? "")));
    if (cells2.filter(Boolean).length >= 3) return { index: i, cols: cells2 };
  }
  return null;
}
var has2 = (cols, ...words) => words.some(
  (w) => cols.some(
    (c) => typeof w === "string" ? c === w || c.includes(w) : w.test(c)
  )
);
function detectRegister(rows, filename) {
  const h = findHeader(rows);
  if (!h) return null;
  const c = h.cols;
  const name = filename.toLowerCase();
  const looksLikeBank = has2(c, "balance", "closing balance") && has2(c, "withdrawal", "deposit", "debit", "credit", "dr", "cr");
  if (/razorpay|cashfree|payu|stripe|paytm|phonepe|ccavenue|settlement/.test(
    name
  ) || has2(c, "settlement id", "settlement utr", "settlement") && has2(c, "fee", "fees")) {
    if (has2(c, "fee", "fees", "settled", "settlement"))
      return "gateway_settlement";
  }
  if (looksLikeBank) return null;
  if (/gstr ?-?2b/.test(name) || has2(c, "itc availability", "itc available", /^gstr/))
    return "gstr2b";
  if (has2(c, "employee", "emp code", "emp id", "employee name", "staff name") && has2(c, "basic", "hra", "gross", "net pay", "net salary", "pf", "esi", "ctc"))
    return "payroll";
  if (has2(c, "deductee", "tds amount", "tds deducted", "tax deducted") && has2(c, "section", "pan", "deductee"))
    return "tds_register";
  const gst = has2(c, "gstin", "taxable value", "taxable amount", "taxable") && has2(c, "cgst", "sgst", "igst", "gst amount", "tax amount", "gstin");
  const invoiceCols = has2(
    c,
    "invoice no",
    "invoice number",
    "inv no",
    "bill no",
    "invoice"
  );
  if (gst || invoiceCols && has2(c, "taxable", "cgst", "igst", "gstin")) {
    if (/sales|outward|gstr ?1\b|sale/.test(name) || has2(c, "customer", "buyer", "recipient"))
      return "gst_sales_register";
    if (/purchase|inward|expense|vendor|supplier/.test(name) || has2(c, "supplier", "vendor", "seller"))
      return "gst_purchase_register";
    return "invoice_register";
  }
  return null;
}
function amount(raw) {
  const s = String(raw ?? "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/(cr|dr)$/i, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
function summariseRegister(kind, rows) {
  const h = findHeader(rows);
  const body = rows.slice(h.index + 1).filter((r) => r.some((x) => String(x ?? "").trim()));
  const data = body.filter(
    (r) => !/^\s*(grand\s*)?total\b/i.test(String(r[0] ?? "")) && !r.some((x) => /^\s*(grand\s*)?total\s*$/i.test(String(x ?? "")))
  );
  const isRate = (c) => /%|\brate\b|percent/.test(c);
  const col = (...words) => {
    const ok = (c, w) => typeof w === "string" ? c === w || c.includes(w) : w.test(c);
    for (const w of words) {
      const i = h.cols.findIndex((c) => !isRate(c) && ok(c, w));
      if (i >= 0) return i;
    }
    return -1;
  };
  const sum = (i) => i < 0 ? 0 : round2(data.reduce((s, r) => s + (amount(r[i]) ?? 0), 0));
  const totals = [];
  const push = (label, i) => {
    if (i >= 0) totals.push({ label, amount: sum(i) });
  };
  let groups;
  let checks = [];
  const num = (r, i) => i >= 0 ? amount(r[i]) ?? 0 : 0;
  const txt = (r, i) => i >= 0 ? String(r[i] ?? "").trim() : "";
  let note = "Kept as a register. Its entries are not bank or book transactions, so it does not change Recon or the MIS.";
  if (kind === "gst_sales_register" || kind === "gst_purchase_register" || kind === "invoice_register" || kind === "gstr2b") {
    push("Taxable value", col("taxable value", "taxable amount", "taxable"));
    push("IGST", col("igst"));
    push("CGST", col("cgst"));
    push("SGST", col("sgst", "utgst"));
    const [ti, ii, ci, si] = [
      col("taxable value", "taxable amount", "taxable"),
      col("igst"),
      col("cgst"),
      col("sgst", "utgst")
    ];
    const totalCol = col(
      "invoice value",
      "invoice amount",
      "total value",
      "total amount",
      /^total$/,
      "grand total"
    );
    if (totalCol >= 0) push("Invoice total", totalCol);
    else if (ti >= 0)
      totals.push({
        label: "Invoice total",
        amount: round2(
          sum(ti) + sum(ii) + sum(ci) + sum(si) + sum(col("cess"))
        )
      });
    const gi = col("supplier gstin", "customer gstin", "party gstin", "gstin");
    const ri = col(
      "invoice no",
      "invoice number",
      "inv no",
      "bill no",
      "invoice"
    );
    if (ti >= 0)
      checks = checkGst(
        data.map((r) => ({
          ref: txt(r, ri),
          gstin: txt(r, gi),
          taxable: num(r, ti),
          igst: num(r, ii),
          cgst: num(r, ci),
          sgst: num(r, si)
        }))
      );
    if (kind === "gstr2b")
      note = "GSTR-2B summary kept for GST reconciliation. Not used in bank reconciliation.";
  } else if (kind === "tds_register") {
    const tdsCol = col(
      "tds deducted",
      "tds amount",
      "tax deducted",
      "tds deduction",
      /^tds$/,
      "tds"
    );
    push(
      "Amount paid / credited",
      col(
        "amount paid",
        "amount credited",
        "gross amount",
        /^amount$/,
        "payment amount",
        "bill amount",
        "invoice amount"
      )
    );
    push("TDS", tdsCol);
    const sec = col("section");
    if (sec >= 0 && tdsCol >= 0) {
      const by = /* @__PURE__ */ new Map();
      for (const r of data) {
        const k = String(r[sec] ?? "").trim() || "Unknown";
        const g = by.get(k) ?? { amount: 0, count: 0 };
        g.amount = round2(g.amount + (amount(r[tdsCol]) ?? 0));
        g.count++;
        by.set(k, g);
      }
      groups = [...by.entries()].map(([key, g]) => ({ key, ...g }));
    }
    const paidCol = col(
      "amount paid",
      "amount credited",
      "gross amount",
      /^amount$/,
      "payment amount",
      "bill amount",
      "invoice amount"
    );
    const party = col("deductee", "party", "name", "vendor");
    if (sec >= 0 && tdsCol >= 0 && paidCol >= 0)
      checks = checkTds(
        data.map((r) => ({
          party: txt(r, party),
          section: txt(r, sec),
          paid: num(r, paidCol),
          tds: num(r, tdsCol)
        }))
      );
  } else if (kind === "payroll") {
    push("Gross salary", col("gross", "gross salary", "gross pay", "ctc"));
    push("PF", col("pf", "provident fund", "epf"));
    push("ESI", col("esi", "esic"));
    push("Professional tax", col("professional tax", /^pt$/));
    push("TDS", col("tds", "income tax"));
    push("Net pay", col("net pay", "net salary", "net amount", "take home"));
    const [bi, gri, pfi, esii, ni] = [
      col(/^basic/),
      col("gross", "gross salary", "gross pay"),
      col(/^pf$/, "pf employee", "employee pf", "provident fund", "epf", "pf"),
      col(/^esi$/, "esi employee", "employee esi", "esic", "esi"),
      col("employee name", "name", "employee")
    ];
    if (gri >= 0 && (pfi >= 0 || esii >= 0))
      checks = checkPayroll(
        data.map((r) => ({
          name: txt(r, ni),
          basic: bi >= 0 ? num(r, bi) : void 0,
          gross: num(r, gri),
          pf: pfi >= 0 ? num(r, pfi) : void 0,
          esi: esii >= 0 ? num(r, esii) : void 0
        }))
      );
    note = "Payroll sheet kept for reference. The salary, PF and ESI payments themselves are matched from the bank statement and the books.";
  } else if (kind === "gateway_settlement") {
    const gross = col(
      /^amount$/,
      "gross amount",
      "gross",
      "order amount",
      "payment amount",
      /^amount/,
      "amount"
    );
    const fee = col("fee", "fees", "commission", "mdr");
    const tax = col(
      "gst on fee",
      /^tax$/,
      "tax on fee",
      "service tax",
      /^gst$/,
      "gst",
      "tax"
    );
    const net = col(
      "settled amount",
      "settlement amount",
      "net amount",
      "credit amount",
      "amount settled"
    );
    push("Gross collected", gross);
    push("Gateway fees", fee);
    push("GST on fees", tax);
    push("Net settled to bank", net);
    const sid = col("settlement id", "settlement utr", "settlement ref", "utr");
    const when = col(
      "settled at",
      "settlement date",
      "settled on",
      "settled_at",
      "created at",
      "date"
    );
    if (sid >= 0) {
      const by = /* @__PURE__ */ new Map();
      for (const r of data) {
        const k = String(r[sid] ?? "").trim();
        if (!k) continue;
        const g = by.get(k) ?? {
          amount: 0,
          count: 0,
          gross: 0,
          fee: 0,
          tax: 0,
          date: null
        };
        const gr = gross >= 0 ? amount(r[gross]) ?? 0 : 0;
        const fe = fee >= 0 ? amount(r[fee]) ?? 0 : 0;
        const tx = tax >= 0 ? amount(r[tax]) ?? 0 : 0;
        const n = net >= 0 ? amount(r[net]) : gross >= 0 ? round2(gr - fe - tx) : null;
        g.amount = round2(g.amount + (n ?? 0));
        g.gross = round2(g.gross + gr);
        g.fee = round2(g.fee + fe);
        g.tax = round2(g.tax + tx);
        g.count++;
        if (!g.date && when >= 0) {
          const d = String(r[when] ?? "").trim().slice(0, 10);
          g.date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
        }
        by.set(k, g);
      }
      groups = [...by.entries()].map(([key, g]) => ({ key, ...g }));
    }
    if (fee >= 0 && tax >= 0) checks = checkGatewayGst(sum(fee), sum(tax));
    note = "Settlement report kept as a reference: the bank already shows each payout once (net). Orders are not added to the bank side, so nothing is counted twice. Book the fees and GST on fees from the totals.";
  }
  return {
    kind,
    label: REGISTER_LABELS[kind],
    entries: data.length,
    totals,
    ...groups ? { groups } : {},
    ...checks.length ? { checks } : {},
    note
  };
}

// src/lib/practice/extract/sheets.ts
var LEGAL = /\b(pvt|private|ltd|limited|llp|llc|inc|co|company|the|and|m\/s|ms)\b/g;
var tokens = (s) => s.toLowerCase().replace(LEGAL, " ").replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length > 2);
var head = (rows) => rows.slice(0, 8).map((r) => r.join(" ")).join(" ");
var mentionsClient = (rows, client2) => {
  const want = tokens(client2 ?? "");
  if (!want.length) return false;
  const have = new Set(tokens(head(rows)));
  return want.every((t) => have.has(t));
};
function selectSheet(sheets, client2) {
  if (!sheets.length) return null;
  if (sheets.length === 1) return { sheet: sheets[0], note: null };
  const mine = sheets.filter((s) => mentionsClient(s.rows, client2));
  const chosen = mine.length ? mine[mine.length - 1] : sheets[sheets.length - 1];
  const others = sheets.length - 1;
  const note = mine.length ? `This file has ${sheets.length} sheets. FynHelp read "${chosen.name}", the latest sheet for ${client2}. The other ${others} sheet${others === 1 ? " was" : "s were"} not read. To avoid this, rename the file with the month before each Tally export.` : `This file has ${sheets.length} sheets and none of them names ${client2 ?? "this client"}. FynHelp read the last sheet, "${chosen.name}". Check that it belongs to this client. The other ${others} sheet${others === 1 ? " was" : "s were"} not read.`;
  return { sheet: chosen, note };
}
var norm3 = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
var NOT_TRANSACTIONS_NAME = /\b(tds|challan|gst|gstr|summary|index|cover|notes?|instructions?|ledger master|payroll|salary)\b/i;
var BANKISH_NAME = /\b(bank|cash|sbi|hdfc|icici|axis|kotak|statement|day ?book)\b/i;
function inspect(sheet, position, side) {
  const map = mapColumns(sheet.rows);
  let lines2 = 0;
  if (map) lines2 = rowsFromTable(sheet.rows, side)?.length ?? 0;
  const register = !!detectRegister(sheet.rows, sheet.name);
  const headerKey = map ? sheet.rows[map.headerRow].map(norm3).join("|") : null;
  return { sheet, position, lines: lines2, register, headerKey };
}
function looksLikeContinuation(rows, dateCol) {
  const filled = rows.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (filled.length < 1) return false;
  const dated = filled.filter((r) => parseDate(String(r[dateCol] ?? "").trim())).length;
  return dated / filled.length >= 0.6;
}
function chooseSheet(sheets, client2, side, sheetName) {
  if (!sheets.length) return null;
  const names = sheets.map((s) => `"${s.name}"`).join(", ");
  if (sheetName) {
    const pick = sheets.find((s) => s.name === sheetName);
    if (pick) return { sheet: pick, note: `Read the sheet "${pick.name}" that you chose. This file has ${sheets.length} sheets: ${names}.` };
  }
  if (sheets.length === 1) return { sheet: sheets[0], note: null };
  const info = sheets.map((s, i) => inspect(s, i, side));
  const usable = info.filter((i) => i.lines > 0 && !i.register);
  if (!usable.length) return selectSheet(sheets, client2);
  const rank = (i) => i.lines + (BANKISH_NAME.test(i.sheet.name) ? 0.5 : 0) - (NOT_TRANSACTIONS_NAME.test(i.sheet.name) ? 0.4 : 0);
  if (side === "bank") {
    const base = [...usable].sort((a, b) => rank(b) - rank(a) || a.position - b.position)[0];
    const baseMap = mapColumns(base.sheet.rows);
    const parts = [];
    const used = [];
    for (const i of info) {
      if (i === base) {
        parts.push(i.sheet.rows);
        used.push(i.sheet.name);
        continue;
      }
      if (i.register && !i.headerKey) continue;
      const m = mapColumns(i.sheet.rows);
      if (m && i.headerKey === base.headerKey) {
        parts.push(i.sheet.rows.slice(m.headerRow + 1));
        used.push(i.sheet.name);
      } else if (!m && looksLikeContinuation(i.sheet.rows, baseMap.date)) {
        parts.push(i.sheet.rows);
        used.push(i.sheet.name);
      }
    }
    const first = parts.findIndex((p) => p === base.sheet.rows);
    const ordered = first > 0 ? [parts[first], ...parts.filter((_, k) => k !== first)] : parts;
    const rows = ordered.flat();
    const skipped = sheets.filter((s) => !used.includes(s.name));
    const note = used.length > 1 ? `This statement was in ${used.length} sheets (${used.map((n) => `"${n}"`).join(", ")}). FynHelp joined them into one.${skipped.length ? ` Not read: ${skipped.map((s) => `"${s.name}"`).join(", ")}.` : ""}` : `This file has ${sheets.length} sheets. FynHelp read "${base.sheet.name}", the one with the transactions (${base.lines} lines). Not read: ${skipped.map((s) => `"${s.name}"`).join(", ")}. If that is the wrong sheet, choose another one.`;
    return { sheet: { name: used.join(" + "), rows }, note };
  }
  let chosen;
  if (usable.length === 1) chosen = usable[0];
  else {
    const mine = usable.filter((i) => mentionsClient(i.sheet.rows, client2));
    chosen = mine.length ? mine[mine.length - 1] : [...usable].sort((a, b) => rank(b) - rank(a) || b.position - a.position)[0];
  }
  const others = sheets.filter((s) => s !== chosen.sheet).map((s) => `"${s.name}"`);
  return {
    sheet: chosen.sheet,
    note: `This file has ${sheets.length} sheets (${names}). FynHelp read "${chosen.sheet.name}", the one with the bank entries (${chosen.lines} lines). Not read: ${others.join(", ")}. If that is the wrong sheet, choose another one.`
  };
}

// src/lib/practice/extract/pdfTable.ts
var DATE_START = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}-[A-Za-z]{3}-?|\d{4}-\d{2}-\d{2})/;
var AMOUNT = /^\(?-?\d{1,3}(?:,\d{2,3})*\.\d{1,2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$|^\(?-?\d+\.\d{2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$/;
var FOOTER = /computer[- ]generated|system[- ]generated|page\s*\d+\s*(of\s*\d+)?|generated on|toll[- ]free|customer care|registered office|www\.[a-z0-9-]+\.[a-z]{2,}|end of statement|^report\b|^rep\d+|^total\s*\(|chief man|authori[sz]ed signator|branch manager/i;
var HEADER_WORDS = /\b(date|narration|description|particulars|balance|debit|credit|withdrawals?|deposits?|cheque|chq|ref|value|dr|cr|amt|amount|remarks?|tran|txn|transaction)\b/gi;
var isHeaderLine = (items) => {
  const text = items.map((i) => i.str).join(" ");
  return (text.match(HEADER_WORDS)?.length ?? 0) >= 3 && !items.some((i) => AMOUNT.test(i.str));
};
var edgeLeft = (i) => i.x;
var edgeRight = (i) => i.x + i.width;
function moneyOf(raw) {
  const m = /^\(?(-?)([\d,]+(?:\.\d+)?)\)?\s?(CR|DR|Cr|Dr)?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  let v = m[1] ? -n : n;
  if (m[3] && m[3].toUpperCase() === "DR") v = -Math.abs(v);
  return round2(v);
}
function cluster(values, tol = 5) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.sum / last.count) <= tol) {
      last.sum += v;
      last.count++;
    } else out.push({ sum: v, count: 1 });
  }
  return out.map((c) => ({ at: c.sum / c.count, count: c.count }));
}
function toLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines2 = [];
  for (const it of sorted) {
    const last = lines2[lines2.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2.2) last.items.push(it);
    else lines2.push({ y: it.y, items: [it] });
  }
  for (const l of lines2) {
    l.items.sort((a, b) => a.x - b.x);
    const merged = [];
    for (const it of l.items) {
      const prev = merged[merged.length - 1];
      if (prev && /^(CR|DR|Cr|Dr)$/.test(it.str) && AMOUNT.test(prev.str) && it.x - (prev.x + prev.width) < 14) {
        merged[merged.length - 1] = {
          ...prev,
          str: `${prev.str}${it.str.toUpperCase()}`,
          width: it.x + it.width - prev.x
        };
      } else merged.push(it);
    }
    l.items = merged;
  }
  return lines2;
}
function splitGlued(it) {
  const m = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?=[A-Za-z]\w*$)/.exec(it.str);
  if (!m) return it;
  return {
    ...it,
    str: m[1],
    width: it.width * (m[1].length / it.str.length)
  };
}
function joinNarration(parts, wrapWidth) {
  let out = "";
  parts.forEach((p, k) => {
    const prev = parts[k - 1];
    if (!prev) out = p.str;
    else
      out += (prev.line !== p.line && prev.w >= wrapWidth && /[A-Za-z0-9/@.]$/.test(prev.str) ? "" : " ") + p.str;
  });
  return out.replace(/\s+/g, " ").trim();
}
function rowsFromPositioned(pagesIn) {
  const pages = pagesIn.map(
    (p) => p.map((i) => ({ ...i, str: i.str.trim() })).filter((i) => i.str).map(splitGlued)
  );
  const allLines = pages.map(toLines);
  const dateItems = pages.flatMap(
    (p) => p.filter((i) => DATE_START.test(i.str))
  );
  if (dateItems.length < 3) return null;
  const dateCols = cluster(dateItems.map(edgeLeft), 6);
  const maxCount = Math.max(...dateCols.map((c) => c.count));
  const dateCol = dateCols.filter((c) => c.count >= maxCount * 0.5).sort((a, b) => a.at - b.at)[0];
  const inDateCol = (i) => Math.abs(i.x - dateCol.at) <= 8;
  const amounts = allLines.flatMap(
    (ls) => ls.flatMap(
      (l) => l.items.filter(
        (i) => AMOUNT.test(i.str) && !inDateCol(i) && i.x > dateCol.at
      )
    )
  );
  if (amounts.length < 3) return null;
  const pick = (edge) => {
    const cs = cluster(amounts.map(edge), 5).filter(
      (c) => c.count >= (amounts.length < 60 ? 1 : Math.max(3, amounts.length * 0.015))
    );
    const covered = cs.reduce((n, c) => n + c.count, 0);
    return { cs: cs.sort((a, b) => a.at - b.at), covered, edge };
  };
  const right = pick(edgeRight);
  const left = pick(edgeLeft);
  const minGap = (cs) => cs.slice(1).reduce((m, c, k) => Math.min(m, c.at - cs[k].at), Infinity);
  const okRight = minGap(right.cs) >= 25;
  const okLeft = minGap(left.cs) >= 25;
  const chosen = okLeft && !okRight ? left : okRight && !okLeft ? right : left.covered > right.covered * 1.05 ? left : right;
  let cols = chosen.cs;
  if (cols.length < 2) return null;
  const balanceCol = cols[cols.length - 1];
  let money = cols.slice(0, -1);
  if (money.length > 2)
    money = [...money].sort((a, b) => b.count - a.count).slice(0, 2).sort((a, b) => a.at - b.at);
  cols = [...money, balanceCol];
  const colOf = (i) => {
    const e = chosen.edge(i);
    let best = -1;
    let bestD = Infinity;
    cols.forEach((c, k) => {
      const d = Math.abs(e - c.at);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return bestD <= (best === cols.length - 1 ? 26 : 14) ? best : -1;
  };
  const moneyLeft = Math.min(
    ...money.map((c) => c.at - (chosen.edge === edgeRight ? 70 : 6))
  );
  const isStart = (l) => {
    const k = l.items.findIndex((i) => inDateCol(i) && DATE_START.test(i.str));
    if (k < 0) return false;
    const next = l.items[k + 1];
    return !(next && /^\d{1,2}:\d{2}(:\d{2})?$/.test(next.str));
  };
  const startsPerPage = allLines.map((ls) => ls.filter(isStart));
  let withText = 0;
  let totalStarts = 0;
  allLines.forEach((ls, p) => {
    for (const first of startsPerPage[p]) {
      totalStarts++;
      void ls;
      if (first.items.some(
        (i) => !inDateCol(i) && i.x > dateCol.at && !AMOUNT.test(i.str) && !DATE_START.test(i.str) && !/^[-–:]+$/.test(i.str) && !/^(CR|DR)$/i.test(i.str)
      ))
        withText++;
    }
  });
  const centred = totalStarts > 0 && withText / totalStarts < 0.5;
  const blocks = [];
  allLines.forEach((ls, p) => {
    const starts = new Set(startsPerPage[p]);
    const pitch = (() => {
      const gaps = [];
      for (let k = 1; k < ls.length; k++) gaps.push(ls[k - 1].y - ls[k].y);
      gaps.sort((a, b) => a - b);
      return gaps.length ? Math.max(gaps[Math.floor(gaps.length * 0.25)], 5) : 10;
    })();
    const mine = ls.filter((l) => starts.has(l));
    if (!mine.length) return;
    const BARRIER = /brought forward|carried forward|\bb\/?f\b|\bc\/?f\b|opening balance|closing balance|statement of account|account statement|report for|\bpage\s*\d|printed|\d{1,2}:\d{2}:\d{2}/i;
    const barriers = ls.filter(
      (l) => !starts.has(l) && (isHeaderLine(l.items) || BARRIER.test(l.items.map((i) => i.str).join(" ")))
    );
    const blocked = (fromY, toY) => barriers.some((b) => b.y < fromY && b.y > toY);
    const made = mine.map((s) => ({ page: p, start: s, lines: [s] }));
    for (const l of ls) {
      if (starts.has(l) || isHeaderLine(l.items) || barriers.includes(l))
        continue;
      if (l.items.every((i) => FOOTER.test(i.str)) || FOOTER.test(l.items.map((i) => i.str).join(" ")))
        continue;
      let target = null;
      if (centred) {
        let bestD = Infinity;
        for (const b of made) {
          const d = Math.abs(b.start.y - l.y);
          if (d < bestD) {
            bestD = d;
            target = b;
          }
        }
        if (bestD > pitch * 4 || target && blocked(
          Math.max(target.start.y, l.y) + 0.1,
          Math.min(target.start.y, l.y) - 0.1
        ))
          target = null;
      } else {
        for (const b of made) if (b.start.y > l.y) target = b;
        if (target && (target.start.y - l.y > pitch * 12 || blocked(target.start.y, l.y)))
          target = null;
      }
      if (target) target.lines.push(l);
    }
    blocks.push(...made);
  });
  const widths = allLines.flatMap(
    (ls) => ls.filter((l) => !isHeaderLine(l.items)).flatMap((l) => l.items)
  ).filter(
    (i) => i.x > dateCol.at && !AMOUNT.test(i.str) && !DATE_START.test(i.str) && i.x < moneyLeft
  ).map((i) => i.width).sort((a, b) => a - b);
  const wrapWidth = widths.length ? widths[Math.floor(widths.length * 0.9)] * 0.93 : Infinity;
  const raws = [];
  for (const b of blocks) {
    const lines2 = [...b.lines].sort((a, z) => z.y - a.y || 0);
    let dateText = "";
    const parts = [];
    const moneyVals = money.map(() => null);
    let balance = null;
    let minus = false;
    let sawDateCol = false;
    let balanceSide = null;
    let lineNo = 0;
    for (const l of lines2) {
      lineNo++;
      for (const it of l.items) {
        if (inDateCol(it)) {
          if (DATE_START.test(it.str) && !sawDateCol) {
            dateText = it.str;
            sawDateCol = true;
          } else if (/^\d{4}$/.test(it.str) && /[-\s]$/.test(dateText))
            dateText += it.str;
          continue;
        }
        if (it.x <= dateCol.at) continue;
        if (/^(CR|DR)$/i.test(it.str) && edgeRight(it) <= balanceCol.at + 16 && edgeRight(it) >= balanceCol.at - 70 && chosen.edge === edgeRight) {
          balanceSide = it.str.toUpperCase();
          continue;
        }
        if (AMOUNT.test(it.str)) {
          const k = colOf(it);
          const v = moneyOf(it.str);
          if (k >= 0 && v !== null) {
            if (k === cols.length - 1) {
              if (balance === null) minus = /^\(?-/.test(it.str);
              balance = balance ?? v;
            } else if (moneyVals[k] === null) moneyVals[k] = Math.abs(v);
            continue;
          }
        }
        if (DATE_START.test(it.str)) continue;
        if (/^[-–]$/.test(it.str)) continue;
        if (chosen.edge(it) >= moneyLeft && AMOUNT.test(it.str)) continue;
        if (chosen.edge === edgeLeft && it.x >= moneyLeft) continue;
        parts.push({ str: it.str, w: it.width, line: lineNo });
      }
    }
    if (balance !== null && balanceSide === "DR" && balance > 0)
      balance = -balance;
    if (moneyVals.every((v) => v === null)) continue;
    raws.push({
      date: parseDate(dateText),
      desc: joinNarration(parts, wrapWidth),
      money: moneyVals,
      balance,
      minus,
      y: b.start.y,
      rawText: `${dateText} ${parts.map((x) => x.str).join(" ")} ${moneyVals.filter((v) => v !== null).join("/")} ${balance ?? ""}`.trim()
    });
  }
  if (raws.length < 3) return null;
  const amountOf2 = (r) => r.money.find((v) => v !== null) ?? 0;
  const fit = (list) => {
    let ok = 0;
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1];
      const b = list[k];
      if (a.balance === null || b.balance === null) continue;
      if (Math.abs(toPaise(b.balance) - toPaise(a.balance)) === toPaise(amountOf2(b)))
        ok++;
    }
    return ok;
  };
  const listed2 = raws;
  const reversed = [...raws].reverse();
  const order = fit(reversed) > fit(listed2) ? "newest_first" : "as_listed";
  const chrono = order === "newest_first" ? reversed : listed2;
  for (let k = 0; k < chrono.length; ) {
    if (!chrono[k].minus || chrono[k].balance === null || chrono[k].balance >= 0) {
      k++;
      continue;
    }
    let e = k;
    while (e + 1 < chrono.length && chrono[e + 1].minus && chrono[e + 1].balance !== null && chrono[e + 1].balance < 0)
      e++;
    const before = chrono[k - 1];
    const after = chrono[e + 1];
    const run = chrono.slice(k, e + 1);
    const fitsAt = (sign) => {
      let n = 0;
      const first = run[0].balance * sign;
      const last = run[run.length - 1].balance * sign;
      if (before?.balance != null && Math.abs(toPaise(first) - toPaise(before.balance)) === toPaise(amountOf2(run[0])))
        n++;
      if (after?.balance != null && Math.abs(toPaise(after.balance) - toPaise(last)) === toPaise(amountOf2(after)))
        n++;
      return n;
    };
    if (fitsAt(-1) > fitsAt(1)) for (const r of run) r.balance = -r.balance;
    k = e + 1;
  }
  chrono.forEach((r, k) => {
    const prev = chrono[k - 1];
    if (!prev || prev.balance === null || r.balance === null || r.balance === 0)
      return;
    const step = (b) => Math.abs(toPaise(b) - toPaise(prev.balance));
    if (step(r.balance) !== toPaise(amountOf2(r)) && step(-r.balance) === toPaise(amountOf2(r)))
      r.balance = -r.balance;
  });
  const votes = money.map(() => ({ out: 0, in: 0 }));
  const dir = chrono.map(() => null);
  chrono.forEach((r, k) => {
    const prev = chrono[k - 1];
    if (!prev || prev.balance === null || r.balance === null) return;
    const delta = toPaise(r.balance) - toPaise(prev.balance);
    if (Math.abs(delta) !== toPaise(amountOf2(r)) || delta === 0) return;
    dir[k] = delta > 0 ? "in" : "out";
    const col = r.money.findIndex((v) => v !== null);
    if (col >= 0) votes[col][dir[k]]++;
  });
  if (process.env.PDFT_DEBUG)
    console.log(
      "votes",
      JSON.stringify(votes),
      "order",
      order,
      "fitListed",
      fit(listed2),
      "fitRev",
      fit(reversed),
      "cols",
      JSON.stringify(cols)
    );
  const colDir = votes.map(
    (v) => v.out > v.in ? "out" : v.in > v.out ? "in" : null
  );
  const opposite = (d) => d === "in" ? "out" : d === "out" ? "in" : null;
  if (money.length === 2) {
    if (!colDir[0] && colDir[1]) colDir[0] = opposite(colDir[1]);
    if (!colDir[1] && colDir[0]) colDir[1] = opposite(colDir[0]);
  }
  let verified = 0;
  const rows = chrono.map((r, k) => {
    const col = r.money.findIndex((v) => v !== null);
    const issues = [];
    let direction = dir[k];
    let confidence = 0.95;
    if (direction) verified++;
    else {
      direction = col >= 0 ? colDir[col] ?? null : null;
      confidence = direction ? 0.8 : 0.5;
      issues.push(
        direction ? "Direction from the column the amount sits in; not confirmed by the running balance" : "Money in/out unclear"
      );
    }
    if (!r.date) {
      issues.push("Date could not be read");
      confidence = Math.min(confidence, 0.3);
    }
    return {
      row_index: k,
      raw_text: r.rawText,
      date: r.date,
      amount: round2(amountOf2(r)),
      direction,
      description: r.desc,
      counterparty: null,
      reference: null,
      category: null,
      currency: "INR",
      balance: r.balance,
      parse_confidence: confidence,
      parse_issues: issues
    };
  });
  const notes = [];
  if (order === "newest_first")
    notes.push(
      "The bank lists this statement newest first; the lines were put in date order."
    );
  return {
    rows,
    order,
    verifiedShare: rows.length ? verified / rows.length : 0,
    notes
  };
}

// src/lib/practice/passwordFile.ts
var passwordNeededMessage = (what) => `This ${what} is password protected. Enter the password to open it.`;
var passwordWrongMessage = (what) => `That password did not open the ${what}. Check it and try again.`;

// src/lib/practice/extract/textStatement.ts
var DATE_AT_START = /^\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
var MONEY = /(?:\(?-?[\d,]+\.\d{2}\)?(?:\s?(?:Cr|Dr|CR|DR))?)/g;
var ANNOTATION = /[?!]|->|=>|<-|~|\bw\/|\bpls\b|\bcheck\b/i;
var FOOTER2 = /computer[- ]generated|system[- ]generated|(does|do) not (require|need)(?: a)? signature|needs? no signature|no signature (is )?(required|needed)|end of statement|statement ends|registered office|\bpage \d+ of \d+\b|toll[- ]free|customer care|www\.[a-z0-9-]+\.[a-z]{2,}|if you notice any discrepanc|kindly (inform|notify)|unless the constituent|this is an? [a-z ]{0,30}statement/i;
var FOOTER_TAIL = /\s*[\/|-]?\s*(this is an? [a-z ]{0,30}statement|computer[- ]generated|system[- ]generated)[^]*$/i;
var SKIP = /\b(opening balance|closing balance|balance b\/?f|brought forward|carried forward|total)\b/i;
function rowsFromStatementText(text) {
  const lines2 = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const rows = [];
  let prevBalance = null;
  let verified = 0;
  const opening = lines2.find((l) => /opening balance/i.test(l));
  if (opening) {
    const m = opening.match(MONEY);
    if (m?.length) {
      const p = parseMoneyCell(m[m.length - 1]);
      prevBalance = p.sign === -1 ? -p.value : p.value;
    }
  }
  let inFooter = false;
  lines2.forEach((line, idx) => {
    const dm = line.match(DATE_AT_START);
    if (dm) inFooter = false;
    if (!dm) {
      if (FOOTER2.test(line)) inFooter = true;
      if (inFooter) return;
      const prev = rows[rows.length - 1];
      if (prev && !SKIP.test(line) && !line.match(MONEY)?.length) {
        if (ANNOTATION.test(line)) {
          prev.parse_issues = [...prev.parse_issues, `Note beside this line: "${line.slice(0, 120)}"`];
          prev.raw_text = `${prev.raw_text} ${line}`;
          return;
        }
        prev.description = `${prev.description} ${line}`.replace(FOOTER_TAIL, "").trim().slice(0, 500);
        prev.raw_text = `${prev.raw_text} ${line}`;
      }
      return;
    }
    if (SKIP.test(line)) return;
    const date = parseDate(dm[1]);
    const monies = line.match(MONEY) ?? [];
    if (!date || monies.length === 0) return;
    const values = monies.map((m) => {
      const p = parseMoneyCell(m);
      return p.sign === -1 ? -p.value : p.value;
    });
    const balance = monies.length >= 2 ? values[values.length - 1] : null;
    const amount2 = Math.abs(
      monies.length >= 2 ? values[values.length - 2] : values[0]
    );
    if (!amount2) return;
    let description = line.slice(dm[0].length);
    for (const m of monies) description = description.replace(m, " ");
    description = description.replace(/\s+/g, " ").trim();
    description = description.replace(/\s+\d[\d,]*,$/, "");
    description = description.replace(DATE_AT_START, "").trim();
    const issues = [];
    let direction = null;
    let confidence = 0.55;
    if (balance !== null && prevBalance !== null) {
      const delta = toPaise(balance) - toPaise(prevBalance);
      if (Math.abs(delta) === toPaise(amount2)) {
        direction = delta > 0 ? "in" : "out";
        confidence = 0.95;
        verified++;
      } else {
        issues.push("Running balance does not move by this amount");
      }
    } else {
      issues.push("No running balance to confirm money in/out");
    }
    if (!direction) {
      const amountToken = monies.length >= 2 ? monies[monies.length - 2] : monies[0];
      const mark = /\b(Cr|Dr)\s*$/i.exec(amountToken ?? "")?.[1]?.toLowerCase();
      if (mark) {
        direction = mark === "cr" ? "in" : "out";
        const mismatch = issues.some((m) => m.startsWith("Running balance does not move"));
        confidence = mismatch ? 0.7 : 0.85;
        const rest = issues.filter((m) => !m.startsWith("No running balance"));
        issues.length = 0;
        issues.push(...rest, "Direction from the Debit or Credit column, not confirmed by a running balance");
      }
    }
    if (!direction) {
      const hint = /\b(cr|credit|deposit|by)\b/i.test(line) ? "in" : /\b(dr|debit|withdrawal|to)\b/i.test(line) ? "out" : null;
      direction = hint;
      if (!hint) issues.push("Money in/out unclear");
    }
    if (balance !== null) prevBalance = balance;
    rows.push({
      row_index: idx,
      raw_text: line,
      date,
      amount: round2(amount2),
      direction,
      description,
      counterparty: null,
      reference: null,
      category: null,
      currency: "INR",
      balance: balance === null ? null : round2(balance),
      parse_confidence: confidence,
      parse_issues: issues
    });
  });
  const closing = lines2.find((l) => /closing balance/i.test(l));
  const closingMoney = closing?.match(MONEY);
  if (opening && closingMoney?.length && rows.length && rows.every((r) => r.direction)) {
    const num = (raw) => {
      const p = parseMoneyCell(raw);
      return p.sign === -1 ? -p.value : p.value;
    };
    const open = num(opening.match(MONEY)?.slice(-1)[0]);
    const close = num(closingMoney[closingMoney.length - 1]);
    const net = rows.reduce((n, r) => n + toPaise(r.amount ?? 0) * (r.direction === "in" ? 1 : -1), 0);
    if (Math.abs(toPaise(open) + net - toPaise(close)) <= 100) {
      for (const r of rows) {
        if (r.parse_confidence >= 0.9) continue;
        r.parse_confidence = 0.95;
        r.parse_issues = [...r.parse_issues.filter((m) => !m.startsWith("Direction from the Debit")), "Direction from the Debit or Credit column; the statement adds up to its closing balance"];
        verified++;
      }
    }
  }
  return { rows, verifiedShare: rows.length ? verified / rows.length : 0 };
}

// src/lib/practice/extract/pipeline.ts
var PdfPasswordError = class extends Error {
  constructor(reason = "needed", what = "PDF") {
    super(`${what} is password protected`);
    this.reason = reason;
    this.what = what;
    this.name = "PdfPasswordError";
  }
  reason;
  what;
};
var BATCH = 12;
var MAX_TEXT_CHARS = 6e4;
function detectKind(bytes, filename, mime) {
  const name = filename.toLowerCase();
  const head2 = new TextDecoder().decode(bytes.slice(0, 2048)).trimStart();
  if (bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)
    return "pdf";
  if (bytes[0] === 255 && bytes[1] === 216 || bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78)
    return "image";
  if (/\.(jpe?g|png|webp|heic)$/.test(name) || mime?.startsWith("image/"))
    return "image";
  if (/\.pdf$/.test(name) || mime === "application/pdf") return "unsupported";
  if (/\.(docx?|pptx?|odt|pages|rtf|zip|rar|7z)$/.test(name))
    return "unsupported";
  if (looksLikeSpreadsheetBinary(bytes)) return "xlsx";
  if (head2.startsWith("<") && isTallyXml(new TextDecoder().decode(bytes.slice(0, 8192))))
    return "tally_xml";
  if (/\.(xml)$/.test(name)) return "tally_xml";
  if (/\.(csv|tsv|txt)$/.test(name) || mime?.includes("csv") || mime?.startsWith("text/"))
    return "csv";
  return "unsupported";
}
function decodeText(bytes) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.split(String.fromCharCode(0)).length - 1 > utf8.length / 4)
    return new TextDecoder("utf-16le").decode(bytes);
  return utf8;
}
function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
async function aiRead(deps, calls, req) {
  if (!deps.llm) return null;
  const started = Date.now();
  try {
    const res = await deps.llm.json(req);
    const data = res.data ?? {};
    calls.push({
      purpose: req.purpose,
      provider: res.provider,
      model: res.model,
      input: req.user.slice(0, 2e4),
      output: res.raw.slice(0, 2e4),
      latency_ms: res.latency_ms,
      status: "success",
      error: null,
      ...usageFields(res)
    });
    return {
      rows: Array.isArray(data.rows) ? data.rows : [],
      kind: data.document_kind ?? null
    };
  } catch (e) {
    calls.push({
      purpose: req.purpose,
      provider: null,
      model: null,
      input: req.user.slice(0, 2e4),
      output: null,
      latency_ms: Date.now() - started,
      status: "error",
      error: e instanceof Error ? e.message : String(e)
    });
    return null;
  }
}
async function aiClassify(deps, calls, rows, side) {
  const verdicts = /* @__PURE__ */ new Map();
  if (!deps.llm || rows.length === 0) return verdicts;
  const limit = deps.maxAiRows ?? 240;
  const eligible = rows.filter((r) => r.amount && r.date).slice(0, limit);
  const deadline = Date.now() + (deps.aiBudgetMs ?? 8e3);
  for (let i = 0; i < eligible.length; i += BATCH) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const batch = eligible.slice(i, i + BATCH);
    const user = classifyUserPrompt(batch, side);
    const started = Date.now();
    try {
      const res = await Promise.race([
        deps.llm.json({
          purpose: "extract_classify",
          system: CLASSIFY_SYSTEM_PROMPT,
          user
        }),
        new Promise(
          (_, reject) => setTimeout(
            () => reject(new Error("AI classification took too long; rules used")),
            left
          )
        )
      ]);
      const list = (res.data ?? {}).rows ?? [];
      for (const v of list)
        if (typeof v?.index === "number") verdicts.set(v.index, v);
      calls.push({
        purpose: "extract_classify",
        provider: res.provider,
        model: res.model,
        input: user,
        output: res.raw.slice(0, 2e4),
        latency_ms: res.latency_ms,
        status: "success",
        error: null,
        ...usageFields(res)
      });
    } catch (e) {
      calls.push({
        purpose: "extract_classify",
        provider: null,
        model: null,
        input: user,
        output: null,
        latency_ms: Date.now() - started,
        status: "error",
        error: e instanceof Error ? e.message : String(e)
      });
      break;
    }
  }
  return verdicts;
}
function fail(kind, code, message, calls = []) {
  return {
    kind,
    rows: [],
    duplicateRows: 0,
    sourceText: "",
    aiCalls: calls,
    documentKind: null,
    error: { code, message }
  };
}
var MIN_OCR_CHARS = 40;
var OCR_CONFIDENCE_CAP = 0.8;
function photoFailureMessage(calls, ocrOn) {
  const ocr = calls.find((c) => c.purpose === "extract_ocr");
  const tail = " Upload the document as a PDF, Excel or CSV instead, or send a clearer, closer photo.";
  if (ocr?.status === "error") {
    const why = ocr.error ?? "";
    if (/size|limit|1024|1 ?MB|large/i.test(why))
      return "This photo is too large for the reader (about 1 MB maximum). Send a smaller or compressed copy." + tail;
    if (/timed out/i.test(why))
      return "Reading this photo took too long. Please try again in a minute." + tail;
    return "The photo reader could not read this image: " + why.slice(0, 160) + "." + tail;
  }
  if (ocr?.status === "success")
    return "The photo was read, but not enough text could be made out, or turning it into entries needs the AI reader, which is not switched on." + tail;
  return (ocrOn ? "The photo could not be read." : "Reading photos isn't switched on yet.") + tail;
}
async function readViaOcr(deps, calls, bytes, mime) {
  if (!deps.ocr) return null;
  let text = "";
  const started = Date.now();
  try {
    text = (await deps.ocr(bytes, mime)).slice(0, MAX_TEXT_CHARS);
    calls.push({
      purpose: "extract_ocr",
      provider: "ocr.space",
      model: null,
      input: mime,
      output: text.slice(0, 2e3),
      latency_ms: Date.now() - started,
      status: "success",
      error: null,
      units: 1,
      cost_usd: ocrCostUsd()
    });
  } catch (e) {
    calls.push({
      purpose: "extract_ocr",
      provider: "ocr.space",
      model: null,
      input: mime,
      output: null,
      latency_ms: Date.now() - started,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
      units: 1,
      cost_usd: 0
    });
    return null;
  }
  if (text.replace(/\s/g, "").length < MIN_OCR_CHARS) return null;
  const statement = rowsFromStatementText(text);
  if (statement.rows.length >= 3 && statement.verifiedShare >= 0.7)
    return {
      text,
      rows: statement.rows.map((r) => ({
        ...r,
        parse_confidence: Math.min(r.parse_confidence, OCR_CONFIDENCE_CAP)
      })),
      kind: "bank_statement",
      ai: false
    };
  const read = await aiRead(deps, calls, {
    purpose: "extract_read_ocr",
    system: READ_SYSTEM_PROMPT,
    user: `Text read by OCR from a scanned document. OCR can confuse similar characters (0/O, 1/l, 5/S); lower confidence where a value is doubtful.

${text}`
  });
  if (!read) return null;
  return {
    text,
    rows: rowsFromAiRead(read.rows, text),
    kind: read.kind,
    ai: true
  };
}
var LEGAL2 = /\b(pvt|private|ltd|limited|llp|llc|inc|co|company|the|and)\b/g;
function partyTokens(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(LEGAL2, " ").split(/\s+/).filter((t) => t.length > 1);
}
function sameParty(a, b) {
  const x = partyTokens(a);
  const y = partyTokens(b);
  if (!x.length || !y.length) return false;
  const common = x.filter((t) => y.includes(t)).length;
  return common / Math.min(x.length, y.length) >= 0.8;
}
async function runExtract(input, deps) {
  const threshold = deps.threshold ?? CONFIDENCE_THRESHOLD;
  const calls = [];
  const client2 = input.clientName?.trim();
  if (client2 && deps.llm) {
    const base = deps.llm;
    const gstin = input.clientGstin?.trim().toUpperCase();
    const who = `These are the books of the client "${client2}"${gstin ? ` (GSTIN ${gstin}, state code ${gstin.slice(0, 2)}: supplies within that state carry CGST + SGST, others IGST)` : ""}. Direction is from the client's side: money the client receives is "in"; money the client pays, including bills and invoices addressed to the client, is "out". The counterparty is always the other party, never "${client2}".

`;
    deps = {
      ...deps,
      llm: { json: (req) => base.json({ ...req, user: who + req.user }) }
    };
  }
  const kind = detectKind(input.bytes, input.filename, input.mime);
  let parsed = null;
  let sourceText = "";
  let documentKind = null;
  let note = "";
  let aiReadUsed = false;
  if (kind === "unsupported") {
    return fail(
      kind,
      "unsupported_type",
      /\.(docx?|odt|pages|rtf)$/i.test(input.filename) ? "Word documents are not read. Upload the bank statement or ledger as PDF, CSV or Excel, or the Tally XML export." : /\.pdf$/i.test(input.filename) || input.mime === "application/pdf" ? "This file is named .pdf but is not a valid PDF: it may be damaged, incomplete or renamed. Download it again from the bank or ask the client to resend it." : /\.(xlsx?|xlsm)$/i.test(input.filename) ? "This file is named as Excel but could not be opened as a spreadsheet: it may be damaged or renamed. Save it again from Excel, or export it as CSV." : "Only CSV, Excel, Tally XML, PDF and image files can be read."
    );
  }
  const asRegister = (table) => {
    const reg = detectRegister(table, input.filename);
    if (!reg) return null;
    const register = summariseRegister(reg, table);
    return {
      kind,
      rows: [],
      duplicateRows: 0,
      sourceText: sourceText.slice(0, 2e5),
      aiCalls: calls,
      documentKind: reg,
      register,
      error: null
    };
  };
  if (kind === "csv") {
    sourceText = decodeText(input.bytes);
    const table = parseDelimited(sourceText);
    const unsupported = unsupportedReport(table);
    if (unsupported) return fail(kind, "unsupported_report", unsupported);
    const reg = asRegister(table);
    if (reg) return reg;
    if (input.side !== "books" && isTallyLedger(table))
      input = { ...input, side: "books" };
    parsed = rowsFromTable(table, input.side);
    documentKind = input.side === "bank" ? "bank_statement" : "ledger_export";
  } else if (kind === "xlsx") {
    if (!deps.sheetRows)
      return fail(
        kind,
        "unsupported_type",
        "Excel reading is not available on this server."
      );
    let rows2;
    try {
      const chosen = deps.sheetsAll ? chooseSheet(deps.sheetsAll(input.bytes), input.clientName, input.side, input.sheetName) : null;
      if (chosen) {
        rows2 = chosen.sheet.rows;
        if (chosen.note) note = chosen.note;
      } else rows2 = deps.sheetRows(input.bytes);
    } catch (e) {
      if (e instanceof PdfPasswordError)
        return fail(
          kind,
          e.reason === "wrong" ? "password_wrong" : "password_protected",
          e.reason === "wrong" ? passwordWrongMessage("Excel file") : passwordNeededMessage("Excel file")
        );
      return fail(
        kind,
        "unreadable",
        "The Excel file could not be opened. It may be damaged. Save it again from Excel, or export it as CSV."
      );
    }
    sourceText = rows2.slice(0, 2e3).map((r) => r.join(", ")).join("\n");
    const unsupported = unsupportedReport(rows2);
    if (unsupported) return fail(kind, "unsupported_report", unsupported);
    const reg = asRegister(rows2);
    if (reg) return reg;
    if (input.side !== "books" && isTallyLedger(rows2))
      input = { ...input, side: "books" };
    parsed = rowsFromTable(rows2, input.side);
    documentKind = input.side === "bank" ? "bank_statement" : "ledger_export";
  } else if (kind === "tally_xml") {
    sourceText = decodeText(input.bytes);
    try {
      const read = readTally(sourceText);
      if (read.vouchers === 0 && isTallyMastersXml(sourceText)) {
        const masters = readTallyMasters(sourceText);
        const sum = mastersSummary(masters);
        return {
          kind,
          rows: [],
          duplicateRows: 0,
          sourceText: sourceText.slice(0, 2e5),
          aiCalls: calls,
          documentKind: "tally_masters",
          register: {
            kind: "tally_masters",
            label: REGISTER_LABELS.tally_masters,
            entries: sum.entries,
            totals: sum.totals,
            groups: sum.groups,
            checks: sum.checks,
            note: sum.note
          },
          error: null
        };
      }
      if (read.vouchers === 0) {
        const ledger = isTallyLedgerXml(sourceText) ? readTallyLedgerXml(sourceText) : null;
        if (!ledger) return fail(kind, "no_vouchers", TALLY_XML_NO_VOUCHERS);
        if (!ledger.rows.length)
          return fail(
            kind,
            "no_vouchers",
            "This Tally ledger export has no entries with an amount in it."
          );
        if (ledger.party) {
          const sum = partyLedgerSummary(ledger);
          return {
            kind,
            rows: [],
            duplicateRows: 0,
            sourceText: sourceText.slice(0, 2e5),
            aiCalls: calls,
            documentKind: "tally_party_ledger",
            register: {
              kind: "tally_party_ledger",
              label: REGISTER_LABELS.tally_party_ledger,
              entries: sum.entries,
              totals: sum.totals,
              checks: sum.checks,
              note: sum.note
            },
            error: null
          };
        }
        parsed = ledger.rows;
        note = ledgerTotalsNote(ledger);
      } else {
        parsed = read.rows;
        const left = [
          read.skippedNonBank ? `${read.skippedNonBank} sales, purchase or journal voucher${read.skippedNonBank === 1 ? "" : "s"} with no bank or cash entry were left out of bank reconciliation` : "",
          read.skippedCash ? `${read.skippedCash} cash-only voucher${read.skippedCash === 1 ? "" : "s"} (no bank leg) were left out because they never appear on a bank statement` : "",
          read.skippedCancelled ? `${read.skippedCancelled} cancelled or optional voucher${read.skippedCancelled === 1 ? "" : "s"} were skipped` : ""
        ].filter(Boolean);
        if (left.length) note = left.join("; ") + ".";
      }
    } catch (e) {
      return fail(
        kind,
        "unreadable",
        `Tally XML could not be read: ${e instanceof Error ? e.message : e}`
      );
    }
    documentKind = "tally_export";
  } else if (kind === "pdf") {
    let pdf = null;
    if (deps.pdfText) {
      try {
        pdf = await deps.pdfText(input.bytes);
      } catch (e) {
        if (e instanceof PdfPasswordError)
          return fail(
            kind,
            e.reason === "wrong" ? "password_wrong" : "password_protected",
            e.reason === "wrong" ? passwordWrongMessage("PDF") : passwordNeededMessage("PDF")
          );
        return fail(
          kind,
          "unreadable",
          "This PDF is damaged or incomplete and cannot be opened. Download it again from the bank or ask the client to resend it."
        );
      }
    }
    const text = pdf?.text ?? "";
    const textRich = pdf ? text.replace(/\s/g, "").length >= 80 * Math.max(1, Math.min(pdf.pages, 3)) : false;
    if (textRich) {
      sourceText = text.slice(0, MAX_TEXT_CHARS);
      let positioned = null;
      if (deps.pdfItems) {
        try {
          positioned = rowsFromPositioned(await deps.pdfItems(input.bytes));
        } catch {
          positioned = null;
        }
      }
      const statement = positioned && positioned.rows.length >= 3 && positioned.verifiedShare >= 0.7 ? positioned : rowsFromStatementText(sourceText);
      if (statement === positioned && positioned) {
        parsed = positioned.rows;
        documentKind = "bank_statement";
        if (positioned.notes.length) note = positioned.notes.join(" ");
      } else if (statement.rows.length >= 3 && statement.verifiedShare >= 0.7) {
        parsed = statement.rows;
        documentKind = "bank_statement";
      } else {
        const read = await aiRead(deps, calls, {
          purpose: "extract_read_text",
          system: READ_SYSTEM_PROMPT,
          user: `Document text:
${sourceText}`
        });
        if (read) {
          aiReadUsed = true;
          parsed = rowsFromAiRead(read.rows, sourceText);
          documentKind = read.kind;
        } else if (statement.rows.length) {
          parsed = statement.rows.map((r) => ({
            ...r,
            parse_confidence: Math.min(r.parse_confidence, 0.6)
          }));
          documentKind = "bank_statement";
        } else {
          return fail(
            kind,
            "needs_ai",
            "The PDF has text but no statement layout was recognised, and the AI reader is not configured.",
            calls
          );
        }
      }
    } else {
      if (input.bytes.length > 15e6)
        return fail(
          kind,
          "too_large",
          "Scanned PDFs larger than 15 MB must be split before upload."
        );
      const ocr = await readViaOcr(deps, calls, input.bytes, "application/pdf");
      if (ocr) {
        sourceText = ocr.text;
        parsed = ocr.rows;
        documentKind = ocr.kind;
        aiReadUsed = ocr.ai;
      }
      const read = parsed ? null : await aiRead(deps, calls, {
        purpose: "extract_read_scan",
        system: READ_SYSTEM_PROMPT,
        user: "This is a scanned document. Read it carefully.",
        attachment: {
          mime: "application/pdf",
          base64: toBase64(input.bytes)
        }
      });
      if (!parsed && !read)
        return fail(
          kind,
          "needs_ai",
          // Said to the firm in plain words; Settings → Integrations tells the owner what to switch on.
          "This PDF is a scan, and reading scans isn't switched on yet. Upload the statement your bank lets you download (Excel, CSV or PDF) instead, or try again later.",
          calls
        );
      if (read) {
        aiReadUsed = true;
        parsed = rowsFromAiRead(read.rows, "");
        documentKind = read.kind;
      }
    }
  } else if (kind === "image") {
    if (input.bytes.length > 1e7)
      return fail(
        kind,
        "too_large",
        "Images larger than 10 MB cannot be read."
      );
    const imageMime = input.mime?.startsWith("image/") ? input.mime : "image/jpeg";
    const ocr = await readViaOcr(deps, calls, input.bytes, imageMime);
    if (ocr) {
      sourceText = ocr.text;
      parsed = ocr.rows;
      documentKind = ocr.kind;
      aiReadUsed = ocr.ai;
    }
    const read = parsed ? null : await aiRead(deps, calls, {
      purpose: "extract_read_image",
      system: READ_SYSTEM_PROMPT,
      user: "This is a photo of a financial document. Read it carefully; photos may be blurred or tilted.",
      attachment: {
        mime: input.mime?.startsWith("image/") ? input.mime : "image/jpeg",
        base64: toBase64(input.bytes)
      }
    });
    if (!parsed && !read)
      return fail(
        kind,
        "needs_ai",
        photoFailureMessage(calls, Boolean(deps.ocr)),
        calls
      );
    if (read) {
      aiReadUsed = true;
      parsed = rowsFromAiRead(read.rows, "");
      documentKind = read.kind;
    }
  }
  if (parsed === null) {
    const read = sourceText ? await aiRead(deps, calls, {
      purpose: "extract_read_text",
      system: READ_SYSTEM_PROMPT,
      user: `Document text:
${sourceText.slice(0, MAX_TEXT_CHARS)}`
    }) : null;
    if (!read)
      return fail(
        kind,
        "no_header",
        "No date and amount columns were found in this file.",
        calls
      );
    aiReadUsed = true;
    parsed = rowsFromAiRead(read.rows, sourceText);
    documentKind = read.kind;
  }
  const withRules = parsed.map((r) => applyHeuristics(r, input.side));
  const verdicts = aiReadUsed ? /* @__PURE__ */ new Map() : await aiClassify(deps, calls, withRules, input.side);
  const scored = withRules.map(
    (r) => scoreRow(r, verdicts.get(r.row_index), threshold)
  );
  const seen = /* @__PURE__ */ new Map();
  let duplicateRows = 0;
  const rows = scored.map((r) => {
    if (!r.date || !r.amount || !r.direction) return r;
    const key = dedupeKey({
      business_id: input.businessId,
      side: input.side,
      date: r.date,
      direction: r.direction,
      amount: r.amount,
      reference: r.reference,
      description: r.description
    });
    const first = seen.get(key);
    if (first === void 0) {
      seen.set(key, r.row_index);
      return r;
    }
    duplicateRows++;
    return {
      ...r,
      route: "review",
      confidence: Math.min(r.confidence, 0.5),
      reason: `Identical to row ${first + 1} in the same file. Confirm only if it is a genuine second transaction.`
    };
  }).map((r) => {
    if (!aiReadUsed || !client2 || !r.counterparty || !sameParty(r.counterparty, client2))
      return r;
    return {
      ...r,
      counterparty: null,
      route: "review",
      confidence: Math.min(r.confidence, 0.5),
      reason: [
        r.reason,
        "The reader named the client as the other party, so money in/out may be reversed"
      ].filter(Boolean).join("; ")
    };
  });
  return {
    kind,
    rows,
    duplicateRows,
    sourceText: sourceText.slice(0, 2e5),
    aiCalls: calls,
    documentKind,
    side: input.side,
    ...note ? { note } : {},
    error: null
  };
}

// src/lib/practice/extract/pdfColumns.ts
var DEBIT_HEADER = /^(debits?|withdrawals?( amt\.?| amount)?|dr\.?|paid out)$/i;
var CREDIT_HEADER = /^(credits?|deposits?( amt\.?| amount)?|cr\.?|paid in)$/i;
var AMOUNT2 = /^\(?-?\d[\d,]*\.\d{2}\)?$/;
var centre = (c) => c.x + c.width / 2;
function findColumns(items) {
  const heads = items.filter((i) => i.str.trim().length <= 20);
  for (const d of heads.filter((i) => DEBIT_HEADER.test(i.str.trim()))) {
    const c = heads.find((i) => CREDIT_HEADER.test(i.str.trim()) && Math.abs(i.y - d.y) < 3);
    if (c && Math.abs(centre(c) - centre(d)) >= 20) return { debit: { x: d.x, width: d.width }, credit: { x: c.x, width: c.width }, headerY: Math.min(d.y, c.y) };
  }
  return null;
}
function columnMarks(items, cols, sameHeaderRow = true) {
  const marks = /* @__PURE__ */ new Map();
  if (!cols) return marks;
  const gap = Math.abs(centre(cols.credit) - centre(cols.debit));
  const reach = Math.min(Math.max(gap / 2, 20), 70);
  for (const i of items) {
    if (sameHeaderRow && i.y >= cols.headerY - 1) continue;
    if (!AMOUNT2.test(i.str.trim())) continue;
    const near2 = (h) => Math.min(Math.abs(i.x + i.width - (h.x + h.width)), Math.abs(i.x - h.x), Math.abs(centre(i) - centre(h)));
    const dd = near2(cols.debit);
    const dc = near2(cols.credit);
    if (Math.min(dd, dc) > reach) continue;
    if (Math.abs(dd - dc) < 1) continue;
    marks.set(i, dd < dc ? "Dr" : "Cr");
  }
  return marks;
}

// src/lib/practice/files.server.ts
async function pdfText(bytes, password) {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : {});
  } catch (e) {
    const err = e;
    if (err.name === "PasswordException" || /password/i.test(String(err.message))) {
      const wrong = err.code === 2 || /incorrect/i.test(String(err.message));
      throw new PdfPasswordError(wrong ? "wrong" : "needed", "PDF");
    }
    throw e;
  }
  const pages = Math.min(doc.numPages, 600);
  const out = [];
  let columns = null;
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    let lastY = null;
    const raw = content.items.filter((it) => typeof it.str === "string");
    const positioned = raw.map((it) => ({ str: it.str, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, width: it.width ?? 0 }));
    const own = findColumns(positioned);
    columns = own ?? columns;
    const marks = columnMarks(positioned, columns, own !== null);
    const mark = /* @__PURE__ */ new Map();
    raw.forEach((it, k) => {
      const m = marks.get(positioned[k]);
      if (m) mark.set(it, m);
    });
    for (const item of raw) {
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line) {
        out.push(line.trim());
        line = "";
      }
      line += (line && !line.endsWith(" ") ? " " : "") + item.str + (mark.has(item) ? ` ${mark.get(item)}` : "");
      if (item.hasEOL) {
        out.push(line.trim());
        line = "";
      }
      lastY = y;
    }
    if (line.trim()) out.push(line.trim());
  }
  if (!out.length) {
    const { text } = await extractText(doc, { mergePages: true });
    return { text: String(text ?? ""), pages };
  }
  return { text: out.join("\n"), pages };
}
async function pdfItems(bytes, password) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : {});
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, 600); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(
      content.items.filter((it) => typeof it.str === "string").map((it) => ({ str: it.str, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, width: it.width ?? 0 }))
    );
  }
  return out;
}

// src/lib/practice/extract/statementCheck.ts
var inr4 = (n) => `\u20B9${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
var signed = (r) => (r.direction === "in" ? 1 : -1) * toPaise(r.amount);
var GAP_DAYS = 10;
function checkStatement(rowsIn) {
  const rows = [...rowsIn].sort((a, b) => a.index - b.index);
  const base = {
    status: "unknown",
    headline: "No lines to check.",
    lines: rows.length,
    withBalance: 0,
    first: null,
    last: null,
    opening: null,
    closing: null,
    totals: { in: 0, out: 0 },
    order: "oldest_first",
    breaks: [],
    gaps: [],
    emptyMonths: [],
    checks: []
  };
  if (!rows.length) return base;
  const newestFirst = rows.length > 1 && rows[0].date > rows[rows.length - 1].date;
  const ordered = newestFirst ? [...rows].reverse() : rows;
  const dates = ordered.map((r) => r.date).sort();
  const withBalance = ordered.filter((r) => r.balance !== null).length;
  const totals = {
    in: ordered.filter((r) => r.direction === "in").reduce((n, r) => n + toPaise(r.amount), 0) / 100,
    out: ordered.filter((r) => r.direction === "out").reduce((n, r) => n + toPaise(r.amount), 0) / 100
  };
  const breaks = [];
  let prev = null;
  let opening = null;
  ordered.forEach((r, i) => {
    const bal = r.balance === null ? null : toPaise(r.balance);
    if (i === 0 && bal !== null) opening = bal - signed(r);
    if (bal !== null && prev !== null) {
      const expected = prev + signed(r);
      if (expected !== bal) {
        const diff = bal - expected;
        breaks.push({
          line: i + 1,
          date: r.date,
          amount: r.amount,
          direction: r.direction,
          expected: expected / 100,
          printed: bal / 100,
          difference: diff / 100,
          note: Math.abs(diff) === 2 * toPaise(r.amount) ? `The balance moved the other way. This line was probably read as ${r.direction === "in" ? "money in" : "money out"} but is ${r.direction === "in" ? "money out" : "money in"}.` : diff > 0 ? `The balance is ${inr4(diff / 100)} higher than these lines explain: a line of money in is missing, or a line of money out was read with too large an amount.` : `The balance is ${inr4(-diff / 100)} lower than these lines explain: a line of money out is missing, or a line of money in was read with too large an amount.`
        });
      }
    }
    if (bal !== null) prev = bal;
  });
  const closing = [...ordered].reverse().find((r) => r.balance !== null)?.balance ?? null;
  const gaps = [];
  const sortedDates = [...new Set(dates)];
  for (let i = 1; i < sortedDates.length; i++) {
    const d = days(sortedDates[i - 1], sortedDates[i]);
    if (d > GAP_DAYS) gaps.push({ from: sortedDates[i - 1], to: sortedDates[i], days: d });
  }
  const have = new Set(dates.map((d) => d.slice(0, 7)));
  const emptyMonths = [];
  if (dates.length) {
    let [y, m] = dates[0].slice(0, 7).split("-").map(Number);
    const [ly, lm] = dates[dates.length - 1].slice(0, 7).split("-").map(Number);
    while (y < ly || y === ly && m <= lm) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!have.has(key)) emptyMonths.push(key);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }
  const enough = withBalance >= 2 && withBalance >= Math.ceil(ordered.length * 0.9);
  const checks = [];
  checks.push(
    enough ? { ok: breaks.length === 0, label: "Running balance", detail: breaks.length ? `${breaks.length} place${breaks.length === 1 ? "" : "s"} where the printed balance does not follow from the lines. First: line ${breaks[0].line} on ${breaks[0].date}.` : `All ${ordered.length} lines move the balance by exactly their amount.` } : { ok: null, label: "Running balance", detail: withBalance < 2 ? "The statement has no balance column, so the lines could not be checked against it. Check the closing balance by hand." : `Only ${withBalance} of ${ordered.length} lines carry a balance, so the check is partial.` }
  );
  if (opening !== null && closing !== null && enough) {
    const implied = Math.round((opening / 100 + totals.in - totals.out) * 100) / 100;
    const ties = toPaise(implied) === toPaise(closing);
    checks.push({ ok: ties, label: "Opening and closing balance", detail: ties ? `Opening ${inr4(opening / 100)} plus money in ${inr4(totals.in)} less money out ${inr4(totals.out)} gives the closing balance ${inr4(closing)}.` : `Opening ${inr4(opening / 100)} plus money in less money out is ${inr4(implied)}, but the statement closes at ${inr4(closing)}: ${inr4(Math.abs(closing - implied))} is unaccounted for.` });
  }
  checks.push({ ok: gaps.length === 0 && emptyMonths.length === 0, label: "Dates", detail: emptyMonths.length ? `No lines at all in ${emptyMonths.join(", ")}. A month or a page may be missing.` : gaps.length ? `${gaps.length} stretch${gaps.length === 1 ? "" : "es"} of more than ${GAP_DAYS} days with no line, the longest ${Math.max(...gaps.map((g) => g.days))} days (${[...gaps].sort((a, b) => b.days - a.days)[0].from} to ${[...gaps].sort((a, b) => b.days - a.days)[0].to}). Quiet accounts have these; a missing page looks the same.` : `Lines on every stretch of ${GAP_DAYS} days between ${dates[0]} and ${dates[dates.length - 1]}.` });
  let status;
  let headline;
  if (breaks.length) {
    status = "fail";
    headline = `The balance does not follow at ${breaks.length} place${breaks.length === 1 ? "" : "s"}. Line ${breaks[0].line} (${breaks[0].date}): expected ${inr4(breaks[0].expected)}, the statement shows ${inr4(breaks[0].printed)}.`;
  } else if (!enough) {
    status = "unknown";
    headline = withBalance < 2 ? "No balance column, so the lines could not be checked." : `Only ${withBalance} of ${ordered.length} lines carry a balance.`;
  } else if (emptyMonths.length || gaps.length) {
    status = "warn";
    headline = `The balance follows on every line, but ${emptyMonths.length ? `there are no lines in ${emptyMonths.join(", ")}` : `there is a stretch of ${Math.max(...gaps.map((g) => g.days))} days with no line`}.`;
  } else {
    status = "pass";
    headline = `Correct and complete: ${ordered.length} lines from ${dates[0]} to ${dates[dates.length - 1]}, opening ${inr4((opening ?? 0) / 100)}, closing ${inr4(closing ?? 0)}.`;
  }
  return {
    status,
    headline,
    lines: ordered.length,
    withBalance,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    opening: opening === null ? null : opening / 100,
    closing,
    totals,
    order: newestFirst ? "newest_first" : "oldest_first",
    breaks: breaks.slice(0, 20),
    gaps: gaps.slice(0, 10),
    emptyMonths,
    checks
  };
}

// src/lib/practice/tallyReconView.ts
var BANKS = [
  ["HDFC", /\bhdfc\b/i],
  ["ICICI", /\bicici\b/i],
  ["SBI", /\b(sbi|state bank of india)\b/i],
  ["Axis", /\baxis\b/i],
  ["Kotak", /\bkotak\b/i],
  ["Yes Bank", /\byes bank\b/i],
  ["IDFC", /\bidfc\b/i],
  ["IndusInd", /\bindusind\b/i],
  ["Federal", /\bfederal\b/i],
  ["Canara", /\bcanara\b/i],
  ["PNB", /\b(pnb|punjab national)\b/i],
  ["Bank of Baroda", /\b(bank of baroda|bob)\b/i],
  ["Union Bank", /\bunion bank\b/i]
];
function statementAccount(text, filename = "") {
  const head2 = text.slice(0, 6e3);
  const m = /\b(?:a\/?c|account)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([Xx*\d][Xx*\d\s-]{5,24}\d)/i.exec(
    head2
  );
  const accountNo = m ? m[1].replace(/[\s-]/g, "") : null;
  const bank = BANKS.find(([, re]) => re.test(head2) || re.test(filename))?.[0] ?? null;
  return {
    accountNo: accountNo && /\d{4}/.test(accountNo) ? accountNo : null,
    bank
  };
}
function compareAccount(stmt, ledgerName) {
  if (!stmt || !stmt.accountNo && !stmt.bank)
    return {
      state: "unknown",
      message: "The statement does not say which account it is, so it could not be compared with the Tally ledger."
    };
  const last4 = stmt.accountNo ? stmt.accountNo.replace(/\D/g, "").slice(-4) : "";
  const runs = [...ledgerName.matchAll(/\d{4,}/g)].map((m) => m[0]);
  const named = BANKS.find(([, re]) => re.test(ledgerName))?.[0] ?? null;
  const label = `${stmt.bank ?? "The statement"}${stmt.accountNo ? ` account ending ${last4}` : ""}`;
  if (stmt.bank && named && stmt.bank !== named)
    return {
      state: "mismatch",
      message: `${label} is being posted to "${ledgerName}", which is a ${named} ledger.`
    };
  if (last4 && runs.length) {
    const same = runs.some(
      (r) => r.includes(last4) || (stmt.accountNo ?? "").replace(/\D/g, "").includes(r)
    );
    return same ? {
      state: "match",
      message: `${label} matches the Tally ledger "${ledgerName}".`
    } : {
      state: "mismatch",
      message: `${label}, but the Tally ledger "${ledgerName}" is for an account with different digits (${runs[0]}).`
    };
  }
  if (stmt.bank && named)
    return {
      state: "match",
      message: `${label} and the Tally ledger "${ledgerName}" are the same bank. The ledger name has no account number to check further.`
    };
  return {
    state: "unknown",
    message: `${label}. The Tally ledger "${ledgerName}" has no bank name or account number in its name, so the two could not be compared.`
  };
}

// src/lib/practice/extract/statementOwner.ts
var STOP = /* @__PURE__ */ new Set(["m", "s", "ms", "mr", "mrs", "shri", "smt", "the", "and", "pvt", "private", "ltd", "limited", "llp", "co", "company", "inc", "proprietor", "prop", "india", "ac", "a", "c", "of"]);
var tokens2 = (s) => s.toLowerCase().replace(/m\/s\.?/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
function holderName(text) {
  const head2 = text.slice(0, 5e3);
  const labelled = /(?:account\s*(?:holder'?s?\s*)?name|a\/c\s*(?:holder\s*)?name|customer\s*name|name\s*of\s*(?:the\s*)?(?:account\s*holder|customer)|account\s*holder)\s*[:\-]\s*([^\n,|:]{3,80})/i.exec(head2);
  if (labelled) return labelled[1].replace(/\s{2,}.*$/, "").trim();
  const mess = /\b(M\/S\.?\s+[A-Z][A-Z0-9 &.\-]{2,60})/.exec(head2);
  return mess ? mess[1].trim() : null;
}
function compareOwner(holder, clientName) {
  if (!holder) return { state: "unknown", message: "The statement does not name the account holder, so it could not be compared with the client.", holder };
  const a = tokens2(holder);
  const b = tokens2(clientName);
  if (!a.length || !b.length) return { state: "unknown", message: `The account holder "${holder}" could not be compared with the client name.`, holder };
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const found = small.filter((t) => big.some((u) => u === t || t.length >= 4 && (u.startsWith(t) || t.startsWith(u))));
  const share = found.length / small.length;
  return share >= 0.6 ? { state: "match", message: `The account holder "${holder}" is ${clientName}.`, holder } : { state: "mismatch", message: `The statement is for "${holder}", not ${clientName}. It may belong to another client.`, holder };
}
function compareWithBankLedgers(stmt, ledgers) {
  if (!ledgers.length) return { state: "unknown", message: "No Tally bank ledger is linked to this client yet, so the account could not be compared." };
  const results = ledgers.map((l) => compareAccount(stmt, l));
  const hit = results.find((r) => r.state === "match");
  if (hit) return { state: "match", message: hit.message };
  const bad = results.find((r) => r.state === "mismatch");
  if (bad) return { state: "mismatch", message: `${bad.message} None of the client's ${ledgers.length} Tally bank ledger${ledgers.length === 1 ? "" : "s"} fits this statement.` };
  return { state: "unknown", message: results[0].message };
}
function clientFromHeader(text, clients) {
  const head2 = tokens2(text.slice(0, 4500));
  if (!head2.length) return null;
  let best = null;
  for (const c of clients) {
    const t = tokens2(c.name);
    if (!t.length) continue;
    const found = t.filter((w) => head2.some((h) => h === w || w.length >= 5 && h.startsWith(w)));
    const share = found.length / t.length;
    if (share >= 0.75 && (found.length >= 2 || t.length === 1) && (!best || share > best.share || share === best.share && t.length > tokens2(best.name).length)) best = { id: c.id, name: c.name, share };
  }
  return best;
}
function judgeOwnership(input) {
  const found = clientFromHeader(input.text, input.clients);
  const holder = holderName(input.text);
  let owner;
  let suggested = null;
  if (found && found.id === input.clientId) owner = { state: "match", message: `The statement is for ${input.clientName}.`, holder: holder ?? found.name };
  else if (found) {
    suggested = { id: found.id, name: found.name };
    owner = { state: "mismatch", message: `The statement is for ${found.name}, not ${input.clientName}.`, holder: holder ?? found.name };
  } else owner = compareOwner(holder, input.clientName);
  const account = input.bankLedgers ? compareWithBankLedgers(statementAccount(input.text, input.filename), input.bankLedgers) : null;
  const hold = Boolean(suggested) || owner.state === "mismatch" && account?.state === "mismatch";
  return { owner, account, suggested, hold };
}

// ../../../tmp/claude-0/-home-user-fynny2-0/f1942684-1163-55a4-835f-3c411fedaf3e/scratchpad/e2e.ts
var [client, ...files] = process.argv.slice(2);
for (const f of files) {
  const bytes = new Uint8Array(fs.readFileSync(f));
  const t0 = Date.now();
  const out = await runExtract(
    { bytes, filename: f.split("/").pop(), mime: "application/pdf", side: "bank", businessId: "b1", clientName: client, clientGstin: null },
    { llm: null, ocr: null, pdfText: (b) => pdfText(b), pdfItems: (b) => pdfItems(b) }
  );
  const ms = Date.now() - t0;
  console.log("\n##", f.split("/").pop(), `${ms}ms`, "kind", out.kind, "docKind", out.documentKind, "error", out.error ? `${out.error.code}: ${out.error.message}` : "none", "aiCalls", out.aiCalls.length);
  const rows = out.rows;
  console.log("rows", rows.length, "| note:", (out.note ?? "-").slice(0, 120));
  const usable = rows.filter((r) => r.date && r.amount && r.direction);
  const chk = checkStatement(usable.map((r) => ({ index: r.row_index, date: r.date, amount: r.amount, direction: r.direction, balance: r.balance ?? null })));
  console.log("check:", chk.status, "breaks", chk.breaks.length, "|", chk.headline.slice(0, 150));
  const own = judgeOwnership({ text: out.sourceText ?? "", filename: f.split("/").pop(), clientId: "b1", clientName: client, clients: [{ id: "b1", name: client }, { id: "b2", name: "Some Other Client" }], bankLedgers: null });
  console.log("owner:", own.owner.state, "|", own.owner.message.slice(0, 110), "| hold", own.hold);
  console.log("low-confidence rows:", rows.filter((r) => r.parse_confidence < 0.75).length, "| dated", usable.length);
}
