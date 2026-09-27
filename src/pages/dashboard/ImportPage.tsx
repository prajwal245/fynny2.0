// ─── src/pages/dashboard/ImportPage.tsx ────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { recomputeIntelligence } from "@/lib/postImportCompute";


import {
  normaliseAmount,
  signFromType,
  directionFromSigned,
  detectAmountPattern,
  logParsePattern,
  isDebitHeader,
  isCreditHeader,
  isAmountHeader,
  isTypeHeader,
  findHeaderIndex,
  type DetectedColumns,
} from "@/lib/bankAmount";


// ── TYPES ───────────────────────────────────────────────────────────────────

type BankId = "hdfc" | "icici" | "sbi" | "axis" | "kotak" | "generic" | "tally" | "busy";

interface BankMapping {
  id: BankId;
  name: string;
  note: string;
  date: string[];
  debit: string[];
  credit: string[];
  amount?: string[];
  description: string[];
  balance: string[];
  direction?: string[];
}

interface ParsedTxn {
  business_id: string;
  date: string;
  transaction_date: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  balance_after: number | null;
}

interface TallyColumnMap {
  dateCol: string;
  amountCol: string;
  descriptionCol: string;
  directionCol: string;
  debitCol: string;
  creditCol: string;
  balanceCol: string;
}

interface RowParseResult {
  txns: ParsedTxn[];
  skipped: number;
  skipReasons: string[];
  error?: string;
}

// ── BANK DEFINITIONS ─────────────────────────────────────────────────────────

const BANKS: BankMapping[] = [
  {
    id: "hdfc",
    name: "HDFC Bank",
    note: "Export as CSV from NetBanking",
    date: ["Date"],
    debit: ["Withdrawal Amt."],
    credit: ["Deposit Amt."],
    description: ["Narration"],
    balance: ["Closing Balance"],
  },
  {
    id: "icici",
    name: "ICICI Bank",
    note: "Statement download then CSV",
    date: ["Transaction Date"],
    debit: ["Debit"],
    credit: ["Credit"],
    description: ["Transaction Remarks"],
    balance: ["Balance"],
  },
  {
    id: "sbi",
    name: "State Bank of India",
    note: "Retail Internet Banking export",
    date: ["Txn Date"],
    debit: ["Debit"],
    credit: ["Credit"],
    description: ["Description"],
    balance: ["Balance"],
  },
  {
    id: "axis",
    name: "Axis Bank",
    note: "Account statement CSV",
    date: ["Tran Date"],
    debit: ["Dr Amount"],
    credit: ["Cr Amount"],
    description: ["Particulars"],
    balance: ["Balance"],
  },
  {
    id: "kotak",
    name: "Kotak Mahindra Bank",
    note: "eStatement CSV export",
    date: ["Transaction Date"],
    debit: ["Debit"],
    credit: ["Credit"],
    description: ["Description"],
    balance: ["Closing Balance"],
  },
  {
    id: "generic",
    name: "Generic CSV",
    note: "date, amount, type or direction, description",
    date: ["date", "Date", "DATE"],
    debit: [],
    credit: [],
    amount: ["amount", "Amount"],
    direction: ["type", "direction", "Type", "Direction"],
    description: ["description", "narration", "remarks", "Description", "Narration", "Remarks"],
    balance: ["balance", "Balance", "closing_balance"],
  },
  {
    id: "tally",
    name: "Tally (ERP 9 / Prime)",
    note: "Export Day Book or Cash or Bank Ledger as CSV or XML",
    date: [
      "Date", "DATE", "Voucher Date", "VoucherDate", "Txn Date", "Transaction Date",
      "Vch Date", "VchDate", "Entry Date",
    ],
    debit: [
      "Debit", "DEBIT", "Dr", "DR", "Withdrawal", "Outflow",
      "Debit Amount", "Dr Amount", "Withdrawal Amt",
    ],
    credit: [
      "Credit", "CREDIT", "Cr", "CR", "Deposit", "Inflow",
      "Credit Amount", "Cr Amount", "Deposit Amt",
    ],
    amount: [
      "Amount", "AMOUNT", "Voucher Amount", "VoucherAmount",
      "Transaction Amount", "Net Amount", "Value",
    ],
    direction: [
      "Type", "VoucherType", "Voucher Type", "Direction",
      "Vch Type", "VchType", "Transaction Type",
    ],
    description: [
      "Particulars", "PARTICULARS", "Narration", "NARRATION",
      "Ledger Name", "LedgerName", "Remarks", "REMARKS",
      "Description", "Details", "Party Name", "PartyName",
    ],
    balance: [
      "Closing Balance", "ClosingBalance", "Balance", "BALANCE",
      "Running Balance", "RunningBalance", "Ledger Balance",
    ],
  },
  {
    id: "busy" as BankId,
    name: "Busy Accounting",
    note: "Export Day Book or Cash/Bank Book as CSV from Busy",
    date: ["Date", "DATE", "Voucher Date", "Transaction Date"],
    debit: ["Debit", "DEBIT", "Dr", "DR", "Debit Amount"],
    credit: ["Credit", "CREDIT", "Cr", "CR", "Credit Amount"],
    amount: ["Amount", "AMOUNT", "Voucher Amount"],
    direction: ["Voucher Type", "VoucherType", "Type"],
    description: ["Particulars", "PARTICULARS", "Narration", "NARRATION", "Description"],
    balance: ["Balance", "BALANCE", "Closing Balance"],
  },
];

// ── TALLY VOUCHER TYPE CLASSIFICATION ────────────────────────────────────────
// Exhaustive map of all standard Tally voucher types to inflow or outflow.
// Tally has ~20 standard voucher types plus user-defined types.
// Each type is classified as inflow, outflow, or ambiguous.
// Ambiguous types (Journal, Sales, Purchase) need ledger-side analysis.

const TALLY_INFLOW_TYPES = new Set([
  "receipt", "bank receipt", "cash receipt",
  "contra",           // used for cash-to-bank or bank-to-bank transfers
  "sales",            // sales invoice increases receivables or cash
  "credit note",      // reversal of a sales invoice
  "debit note",       // issued to vendor — increases payable credit
  "forex receipt",
  "pos",
  "receipt voucher",
  "bank deposit",
  "deposit",
  "inflow",
]);

const TALLY_OUTFLOW_TYPES = new Set([
  "payment", "bank payment", "cash payment",
  "purchase",         // purchase invoice increases payables or reduces cash
  "expense",
  "debit note",       // received from vendor — reduces payable
  "payroll",
  "salary",
  "wages",
  "tax payment",
  "tds payment",
  "gst payment",
  "advance payment",
  "forex payment",
  "withdrawal",
  "outflow",
  "payment voucher",
]);

function classifyTallyVoucherType(vtype: string, rawAmt: string): "in" | "out" {
  const v = vtype.toLowerCase().trim();
  if (TALLY_INFLOW_TYPES.has(v)) return "in";
  if (TALLY_OUTFLOW_TYPES.has(v)) return "out";
  // Ambiguous: Journal, Memo, Reversing Journal, user-defined types.
  // Fall back to sign of the raw amount: positive = credit = inflow, negative = debit = outflow.
  // Tally XML uses negative amounts for debit entries.
  const cleaned = rawAmt.replace(/[,₹\s]/g, "");
  const n = parseFloat(cleaned);
  if (!isNaN(n)) return n >= 0 ? "in" : "out";
  return "out"; // safe default
}

// ── PURE UTILITY FUNCTIONS ───────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  // Handle tab-separated Tally exports as well as standard comma-separated
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((row) =>
    row.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""))
  );
}

function pick(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === c.toLowerCase().trim());
    if (idx !== -1) return idx;
  }
  // Fuzzy fallback: partial match if exact fails
  for (const c of candidates) {
    const idx = headers.findIndex((h) =>
      h.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(h.toLowerCase())
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

function toISODate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, mo, y] = dmy;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // YYYYMMDD (Tally XML compact format)
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const [, y, mo, d] = compact;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // DDMMYYYY (Tally ERP 9 legacy compact)
  const compact2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact2) {
    const [, d, mo, y] = compact2;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // Natural language dates: "01 Apr 2024", "April 1 2024", etc.
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);

  return null;
}

function toNumber(raw: string): number {
  if (!raw) return 0;
  // Remove currency symbols, commas, spaces, and parentheses (Tally uses parentheses for negative)
  const hasParens = raw.trim().startsWith("(") || raw.trim().endsWith(")");
  const cleaned = raw.replace(/[,₹$\s()]/g, "");
  const n = Number(cleaned);
  if (isNaN(n)) return 0;
  return hasParens ? -Math.abs(n) : n;
}

// ── CSV PARSER WITH MANUAL COLUMN MAP SUPPORT ────────────────────────────────

function mapRows(
  rows: string[][],
  bank: BankMapping,
  businessId: string,
  manualMap?: TallyColumnMap | null
): RowParseResult {
  if (rows.length < 2) return { txns: [], skipped: 0, skipReasons: [], error: "File has no data rows" };

  const headers = rows[0].map((h) => h.trim());

  let dateIdx: number;
  let descIdx: number;
  let balIdx: number;
  let debitIdx: number;
  let creditIdx: number;
  let amountIdx: number;
  let dirIdx: number;

  if (manualMap && bank.id === "tally") {
    // Use manually selected column positions
    dateIdx = manualMap.dateCol ? headers.indexOf(manualMap.dateCol) : -1;
    descIdx = manualMap.descriptionCol ? headers.indexOf(manualMap.descriptionCol) : -1;
    balIdx = manualMap.balanceCol ? headers.indexOf(manualMap.balanceCol) : -1;
    debitIdx = manualMap.debitCol ? headers.indexOf(manualMap.debitCol) : -1;
    creditIdx = manualMap.creditCol ? headers.indexOf(manualMap.creditCol) : -1;
    amountIdx = manualMap.amountCol ? headers.indexOf(manualMap.amountCol) : -1;
    dirIdx = manualMap.directionCol ? headers.indexOf(manualMap.directionCol) : -1;
  } else {
    dateIdx = pick(headers, bank.date);
    descIdx = pick(headers, bank.description);
    balIdx = pick(headers, bank.balance);
    debitIdx = bank.debit.length ? pick(headers, bank.debit) : -1;
    creditIdx = bank.credit.length ? pick(headers, bank.credit) : -1;
    amountIdx = bank.amount ? pick(headers, bank.amount) : -1;
    dirIdx = bank.direction ? pick(headers, bank.direction) : -1;
  }

  // Universal fallback: whatever the bank profile could not resolve, resolve it
  // from the generic header dictionaries (works for any bank in the world).
  const detected: DetectedColumns = detectAmountPattern(headers, rows.slice(1));
  if (debitIdx === -1) debitIdx = detected.debitIdx;
  if (creditIdx === -1) creditIdx = detected.creditIdx;
  if (amountIdx === -1) amountIdx = detected.amountIdx;
  if (dirIdx === -1) dirIdx = detected.typeIdx;
  // Never let one physical column serve two roles.
  if (amountIdx !== -1 && (amountIdx === debitIdx || amountIdx === creditIdx)) amountIdx = -1;


  if (dateIdx === -1) {
    return {
      txns: [],
      skipped: rows.length - 1,
      skipReasons: [`Date column not found. Detected columns: ${headers.join(", ")}`],
      error: `Could not find a date column. Please use the column mapping below to identify which column contains the date.`,
    };
  }

  if (debitIdx === -1 && creditIdx === -1 && amountIdx === -1) {
    return {
      txns: [],
      skipped: rows.length - 1,
      skipReasons: [`Amount column not found. Detected columns: ${headers.join(", ")}`],
      error: `Could not find an amount column. Please use the column mapping below to identify which column contains the transaction amount.`,
    };
  }

  const out: ParsedTxn[] = [];
  const skipReasons: string[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !c.trim())) continue; // skip blank rows

    const rawDate = r[dateIdx]?.trim() || "";
    const iso = toISODate(rawDate);
    if (!iso) {
      skipped++;
      if (skipReasons.length < 5) {
        skipReasons.push(`Row ${i + 1}: unrecognised date "${rawDate}"`);
      }
      continue;
    }

    const rawDebit = debitIdx !== -1 ? r[debitIdx] ?? "" : "";
    const rawCredit = creditIdx !== -1 ? r[creditIdx] ?? "" : "";
    const rawAmt = amountIdx !== -1 ? r[amountIdx] ?? "" : "";
    const rawDir = dirIdx !== -1 ? (r[dirIdx] || "").trim() : "";

    // Universal signed normalisation: negative = debit, positive = credit
    let signed = normaliseAmount(rawAmt, rawDir, rawDebit, rawCredit);

    // Tally/Busy voucher types are richer than plain debit/credit words —
    // when a voucher type is present and the generic normaliser could not
    // resolve a direction from it, fall back to voucher classification.
    if (signed !== 0 && rawDir && signFromType(rawDir) === 0 && debitIdx === -1 && creditIdx === -1) {
      const vdir = classifyTallyVoucherType(rawDir, String(rawAmt));
      signed = vdir === "out" ? -Math.abs(signed) : Math.abs(signed);
    }

    if (signed === 0) {
      skipped++;
      if (skipReasons.length < 5) skipReasons.push(`Row ${i + 1}: amount is zero or unreadable`);
      continue;
    }

    const dir: "in" | "out" = directionFromSigned(signed);

    const bal = balIdx !== -1 ? toNumber(r[balIdx] || "") : NaN;
    const desc = (descIdx !== -1 ? r[descIdx] : "").trim().slice(0, 500) || "No description";

    out.push({
      business_id: businessId,
      date: iso,
      transaction_date: iso,
      amount: signed,
      direction: dir,
      description: desc,
      balance_after: isFinite(bal) && bal !== 0 ? bal : null,
    });
  }

  logParsePattern(
    `${bank.id}-csv`,
    { ...detected, debitIdx, creditIdx, amountIdx, typeIdx: dirIdx },
    out
  );


  if (!out.length) {
    return {
      txns: [],
      skipped,
      skipReasons,
      error: `No valid transactions found. ${skipped} row${skipped !== 1 ? "s" : ""} were skipped.${skipReasons.length ? " First issues: " + skipReasons.join("; ") : ""}`,
    };
  }

  return { txns: out, skipped, skipReasons };
}

// ── TALLY XML PARSER ─────────────────────────────────────────────────────────

function parseTallyXML(xmlText: string, businessId: string): RowParseResult {
  const skipReasons: string[] = [];
  let skipped = 0;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    // Check for XML parse errors
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return {
        txns: [],
        skipped: 0,
        skipReasons: [],
        error: "This XML file could not be read. Please export from Tally as CSV instead (Alt+E then Excel format).",
      };
    }

    const txns: ParsedTxn[] = [];

    // Try all known Tally XML wrapper structures across versions
    // Tally Prime: ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE > VOUCHER
    // Tally ERP 9: ENVELOPE > BODY > DATA > TALLYMESSAGE > VOUCHER
    // Tally 7.2/9: TALLYMESSAGES > TALLYMESSAGE > VOUCHER
    // Day Book export: ENVELOPE > BODY > REQUESTDATA > TALLYMESSAGE > VOUCHER
    // Some exports: VOUCHER at root level

    const voucherSelectors = [
      "ENVELOPE BODY IMPORTDATA REQUESTDATA TALLYMESSAGE VOUCHER",
      "ENVELOPE BODY DATA TALLYMESSAGE VOUCHER",
      "TALLYMESSAGES TALLYMESSAGE VOUCHER",
      "ENVELOPE BODY REQUESTDATA TALLYMESSAGE VOUCHER",
      "TALLYMESSAGE VOUCHER",
      "VOUCHER",
    ];

    let vouchers: NodeListOf<Element> | null = null;
    for (const sel of voucherSelectors) {
      const found = doc.querySelectorAll(sel);
      if (found.length > 0) { vouchers = found; break; }
    }

    if (!vouchers || vouchers.length === 0) {
      // Try case-insensitive approach for older Tally versions
      const allElements = doc.getElementsByTagName("*");
      const voucherElements: Element[] = [];
      for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].tagName.toUpperCase() === "VOUCHER") {
          voucherElements.push(allElements[i]);
        }
      }
      if (voucherElements.length === 0) {
        return {
          txns: [],
          skipped: 0,
          skipReasons: [],
          error: "No voucher data found in this XML. This file may not be a Tally export. Try exporting as CSV from Tally (Alt+E).",
        };
      }
      voucherElements.forEach((v) => {
        const result = extractTallyVoucher(v, businessId);
        if (result) txns.push(result);
        else { skipped++; if (skipReasons.length < 5) skipReasons.push(`Voucher missing date or amount`); }
      });
    } else {
      vouchers.forEach((v) => {
        const result = extractTallyVoucher(v, businessId);
        if (result) txns.push(result);
        else { skipped++; if (skipReasons.length < 5) skipReasons.push(`Voucher missing date or amount`); }
      });
    }

    if (!txns.length) {
      return {
        txns: [],
        skipped,
        skipReasons,
        error: `Found ${skipped} vouchers in the XML but none had valid dates and amounts. This may be a Tally configuration report rather than a transaction export. Please export the Cash or Bank Book specifically.`,
      };
    }

    return { txns, skipped, skipReasons };
  } catch (e) {
    return {
      txns: [],
      skipped: 0,
      skipReasons: [],
      error: `Unexpected error reading XML: ${e instanceof Error ? e.message : "unknown error"}. Try exporting as CSV from Tally instead.`,
    };
  }
}

function extractTallyVoucher(v: Element, businessId: string): ParsedTxn | null {
  const getText = (tagNames: string[]): string => {
    for (const tag of tagNames) {
      // Try exact match first
      const el = v.querySelector(tag);
      if (el?.textContent?.trim()) return el.textContent.trim();
      // Try case-insensitive via getElementsByTagName
      const els = v.getElementsByTagName(tag);
      if (els.length > 0 && els[0].textContent?.trim()) return els[0].textContent.trim();
    }
    return "";
  };

  const getTextFromEl = (el: Element, tagNames: string[]): string => {
    for (const tag of tagNames) {
      const found = el.querySelector(tag);
      if (found?.textContent?.trim()) return found.textContent.trim();
      const els = el.getElementsByTagName(tag);
      if (els.length > 0 && els[0].textContent?.trim()) return els[0].textContent.trim();
    }
    return "";
  };

  // Date: try multiple tag name variants across all Tally versions
  const rawDate = getText([
    "DATE", "Date", "VOUCHERDATE", "VoucherDate", "date",
    "EFFECTIVEDATE", "EffectiveDate",
  ]);
  if (!rawDate) return null;

  const iso = toISODate(rawDate);
  if (!iso) return null;

  // Voucher type: determines inflow vs outflow for unambiguous types
  const vtype = getText([
    "VOUCHERTYPENAME", "VoucherTypeName", "VOUCHERTYPE", "VoucherType",
    "TYPE", "Type", "type",
  ]);

  // Amount: Tally XML can store the amount in multiple places
  // ALLLEDGERENTRIES > AMOUNT is the most reliable for bank ledger entries
  // The AMOUNT at voucher level may be the gross total
  // Negative values in Tally XML indicate debit (outflow from bank perspective)
  let rawAmt = "";
  let dir: "in" | "out" = "out";

  // Try to find the bank/cash ledger entry for accurate direction
  // Bank ledger entries: look for ALLLEDGERENTRIES or LEDGERENTRIES with ISPARTYLEDGER = No
  const ledgerEntries = v.querySelectorAll("ALLLEDGERENTRIES\\.LIST, ALLLEDGERENTRIESLIST, LEDGERENTRIES\\.LIST");
  if (ledgerEntries.length > 0) {
    // Find the entry that is NOT a party ledger (i.e., the bank/cash side)
    for (let i = 0; i < ledgerEntries.length; i++) {
      const entry = ledgerEntries[i];
      const isParty = getTextFromEl(entry, ["ISPARTYLEDGER"]).toLowerCase();
      if (isParty === "no" || isParty === "false") {
        const entryAmt = entry.querySelector("AMOUNT")?.textContent?.trim() || "";
        if (entryAmt) { rawAmt = entryAmt; break; }
      }
    }
  }

  // If ledger entry approach failed, use the voucher-level amount
  if (!rawAmt) {
    rawAmt = getText(["AMOUNT", "Amount", "amount", "DR", "CR", "DEBIT", "CREDIT", "NET", "Net"]);
  }

  if (!rawAmt) return null;

  const numericAmt = toNumber(rawAmt);
  if (numericAmt === 0) return null;

  dir = classifyTallyVoucherType(vtype, rawAmt);

  // Narration / description
  const narration = getText([
    "NARRATION", "Narration", "narration",
    "PARTICULARS", "Particulars",
    "LEDGERNAME", "LedgerName",
    "PARTYLEDGERNAME", "PartyLedgerName",
    "REMARKS", "Remarks",
  ]) || `Tally ${vtype || "voucher"}`;

  // Closing balance
  const balText = getText([
    "CLOSINGBALANCE", "ClosingBalance",
    "BALANCE", "Balance",
    "RUNNINGBALANCE", "RunningBalance",
  ]);
  const bal = balText ? toNumber(balText) : null;

  return {
    business_id: businessId,
    date: iso,
    transaction_date: iso,
    amount: dir === "out" ? -Math.abs(numericAmt) : Math.abs(numericAmt),
    direction: dir,
    description: narration.slice(0, 500),
    balance_after: bal && isFinite(bal) ? bal : null,
  };
}

// ── BATCH INSERT + COMPUTE ────────────────────────────────────────────────────

async function insertAndCompute(
  txns: ParsedTxn[],
  businessId: string,
  setProgress: (p: { done: number; total: number }) => void
): Promise<{ cash_position: number; burn_rate_current: number; runway_months: number } | { error: string }> {
  const BATCH = 100;
  setProgress({ done: 0, total: txns.length });

  for (let i = 0; i < txns.length; i += BATCH) {
    const chunk = txns.slice(i, i + BATCH);
    const { error: insErr } = await supabase.from("transactions").insert(chunk);
    if (insErr) return { error: `Database insert failed at row ${i + 1}: ${insErr.message}` };
    setProgress({ done: Math.min(i + BATCH, txns.length), total: txns.length });
  }

  const { data: compData, error: compErr } = await supabase.functions.invoke("compute-liquidity", {
    body: { business_id: businessId },
  });

  // Refresh the pre-computed liquidity + cost metrics the dashboards read from.
  await recomputeIntelligence(businessId);

  if (compErr) return { error: `Imported ${txns.length} rows but intelligence computation failed: ${compErr.message}` };


  return {
    cash_position: compData?.cash_position ?? 0,
    burn_rate_current: compData?.burn_rate_current ?? 0,
    runway_months: compData?.runway_months ?? 0,
  };
}

// ── COMPONENT ────────────────────────────────────────────────────────────────

const MAX_SIZE = 10 * 1024 * 1024;

export default function ImportPage() {
  const navigate = useNavigate();
  const { businessId } = useAuth();

  const [bankId, setBankId] = useState<BankId | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [isXMLFile, setIsXMLFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skippedInfo, setSkippedInfo] = useState<{ count: number; reasons: string[] } | null>(null);
  const [result, setResult] = useState<null | {
    rows: number;
    cash_position: number;
    burn_rate_current: number;
    runway_months: number;
  }>(null);
  const [tallyColumnMap, setTallyColumnMap] = useState<TallyColumnMap>({
    dateCol: "",
    amountCol: "",
    descriptionCol: "",
    directionCol: "",
    debitCol: "",
    creditCol: "",
    balanceCol: "",
  });
  const [columnMapperNeeded, setColumnMapperNeeded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const bank = useMemo(() => BANKS.find((b) => b.id === bankId) ?? null, [bankId]);

  function detectIfMapperNeeded(headers: string[], bankMapping: BankMapping): boolean {
    const dateFound = pick(headers, bankMapping.date) !== -1;
    const amountFound =
      pick(headers, bankMapping.debit) !== -1 ||
      pick(headers, bankMapping.credit) !== -1 ||
      (bankMapping.amount ? pick(headers, bankMapping.amount) !== -1 : false);
    return !dateFound || !amountFound;
  }

  async function handleFile(f: File | null) {
    setError(null);
    setResult(null);
    setSkippedInfo(null);
    setColumnMapperNeeded(false);
    setTallyColumnMap({ dateCol: "", amountCol: "", descriptionCol: "", directionCol: "", debitCol: "", creditCol: "", balanceCol: "" });

    if (!f) { setFile(null); setRawRows([]); setIsXMLFile(false); return; }

    const isCSV = f.name.toLowerCase().endsWith(".csv");
    const isXML = f.name.toLowerCase().endsWith(".xml");

    if (!isCSV && !isXML) {
      setError("Only CSV and XML files are supported. For Tally, export as Excel CSV (Alt+E) or XML. For other banks, export the statement as CSV.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError("File exceeds 10MB. For large exports, split by date range and import in multiple batches.");
      return;
    }

    const text = await f.text();

    if (isXML) {
      setFile(f);
      setIsXMLFile(true);
      // Show a preview message for XML — we cannot render XML rows in a table
      setRawRows([["XML file ready", f.name, `${(f.size / 1024).toFixed(1)} KB`, "Click Import to process"]]);
      return;
    }

    setIsXMLFile(false);
    const rows = parseCSV(text);
    setFile(f);
    setRawRows(rows.slice(0, 6));

    // Check if column mapper is needed for Tally
    if (bankId === "tally" && rows.length > 0) {
      const headers = rows[0].map((h) => h.trim());
      const bank = BANKS.find((b) => b.id === "tally")!;
      if (detectIfMapperNeeded(headers, bank)) {
        setColumnMapperNeeded(true);
      }
    }
  }

  async function runImport() {
    if (!bank || !file || !businessId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setSkippedInfo(null);
    track("csv_import_started", { bank: bank.id });

    try {
      const text = await file.text();

      let parseResult: RowParseResult;

      if (isXMLFile && bankId === "tally") {
        parseResult = parseTallyXML(text, businessId);
      } else {
        const rows = parseCSV(text);
        const useManualMap = columnMapperNeeded && bankId === "tally" ? tallyColumnMap : null;
        parseResult = mapRows(rows, bank, businessId, useManualMap);
      }

      const { txns, skipped, skipReasons, error: parseErr } = parseResult;

      if (parseErr || !txns.length) {
        const msg = parseErr || "No valid transactions found in this file.";
        setError(msg);
        track("csv_import_failed", { error: msg, bank: bank.id });
        setBusy(false);
        return;
      }

      if (skipped > 0) {
        setSkippedInfo({ count: skipped, reasons: skipReasons });
      }

      const compResult = await insertAndCompute(txns, businessId, (p) => setProgress(p));
      if ("error" in compResult) {
        setError(compResult.error);
        track("csv_import_failed", { error: compResult.error, bank: bank.id, inserted: txns.length });
        setBusy(false);
        return;
      }

      setResult({ rows: txns.length, ...compResult });
      toast.success(
        `Import complete. ${txns.length} transaction${txns.length === 1 ? "" : "s"} imported. Dashboard metrics have been updated.`
      );

      track("csv_import_completed", { records: txns.length, skipped, bank: bank.id });

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error during import";
      setError(msg);
      track("csv_import_failed", { error: msg, bank: bank?.id });
    } finally {
      setBusy(false);
    }
  }

  const isTallyMapperReady = !columnMapperNeeded || (tallyColumnMap.dateCol !== "" && (tallyColumnMap.amountCol !== "" || tallyColumnMap.debitCol !== ""));
  const disabled = !bank || !file || busy || !businessId || (bankId === "tally" && columnMapperNeeded && !isTallyMapperReady && !isXMLFile);

  const headers = rawRows.length > 0 ? rawRows[0] : [];

  // Live "Parsed amount" preview for the column mapper: shows the raw cell and
  // the signed value that will actually be stored (red = debit, green = credit).
  const mapperPreview = useMemo(() => {
    if (isXMLFile || rawRows.length < 2) return [] as Array<{ raw: string; parsed: number }>;
    const idx = (name: string) => (name ? headers.indexOf(name) : -1);
    const dIdx = idx(tallyColumnMap.debitCol);
    const cIdx = idx(tallyColumnMap.creditCol);
    const aIdx = idx(tallyColumnMap.amountCol);
    const tIdx = idx(tallyColumnMap.directionCol);
    if (dIdx === -1 && cIdx === -1 && aIdx === -1) return [];
    return rawRows.slice(1, 6).map((r) => {
      const rawDebit = dIdx !== -1 ? r[dIdx] ?? "" : "";
      const rawCredit = cIdx !== -1 ? r[cIdx] ?? "" : "";
      const rawAmt = aIdx !== -1 ? r[aIdx] ?? "" : "";
      const rawDir = tIdx !== -1 ? r[tIdx] ?? "" : "";
      let parsed = normaliseAmount(rawAmt, rawDir, rawDebit, rawCredit);
      if (parsed !== 0 && rawDir && signFromType(rawDir) === 0 && dIdx === -1 && cIdx === -1) {
        parsed = classifyTallyVoucherType(rawDir, String(rawAmt)) === "out" ? -Math.abs(parsed) : Math.abs(parsed);
      }
      const raw = [rawDebit && `Dr ${rawDebit}`, rawCredit && `Cr ${rawCredit}`, rawAmt, rawDir]
        .filter(Boolean).join("  ·  ");
      return { raw, parsed };
    });
  }, [rawRows, headers, tallyColumnMap, isXMLFile]);


  return (
    <div className="min-h-screen bg-fyn-beige px-6 py-8">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          <h1 className="text-3xl text-fyn-ink mb-2" style={{ fontFamily: "Georgia, serif" }}>Import financial data</h1>
          <p className="text-fyn-ink/60" style={{ fontFamily: "Inter, sans-serif" }}>
            Connect your bank statement or Tally export to populate your intelligence dashboard with real numbers.
          </p>
        </div>

        {!businessId && (
          <div className="mb-6 bg-white p-4 flex gap-3" style={{ borderRadius: 12, border: "1px solid rgba(196,30,30,0.2)", borderLeft: "4px solid #C41E1E" }}>
            <AlertTriangle className="w-5 h-5 text-fyn-red shrink-0 mt-0.5" />
            <div className="text-sm text-fyn-ink" style={{ fontFamily: "Inter, sans-serif" }}>Complete business onboarding before importing data.</div>
          </div>
        )}

        {/* STEP 1 — SOURCE SELECTOR */}
        <section className="mb-8">
          <div className="text-[11px] tracking-widest mb-3" style={{ color: "#8B6914", fontFamily: "'JetBrains Mono', monospace" }}>STEP 1 · SELECT SOURCE</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {BANKS.map((b) => {
              const selected = bankId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBankId(b.id);
                    setFile(null);
                    setRawRows([]);
                    setError(null);
                    setResult(null);
                    setSkippedInfo(null);
                    setColumnMapperNeeded(false);
                    setIsXMLFile(false);
                  }}
                  className="bg-white text-left p-4 transition-all"
                  style={{
                    borderRadius: 12,
                    border: selected ? "2px solid #C41E1E" : "1px solid rgba(23,18,8,0.08)",
                    outline: "none",
                  }}
                >
                  <div className="text-fyn-ink font-semibold text-sm mb-1" style={{ fontFamily: "Georgia, serif" }}>{b.name}</div>
                  <div className="text-xs text-fyn-ink/55 mb-3" style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.4 }}>{b.note}</div>
                  <div
                    className="inline-block text-xs px-3 py-1 rounded"
                    style={{
                      background: selected ? "#C41E1E" : "rgba(23,18,8,0.05)",
                      color: selected ? "#FFFFFF" : "#171208",
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 500,
                    }}
                  >
                    {selected ? "Selected" : "Select"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* TALLY EXPORT INSTRUCTIONS */}
        {bankId === "tally" && (
          <div style={{ background: "#FDFAF3", border: "1px solid rgba(139,105,20,0.2)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#8B6914", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              How to export from Tally
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#171208", marginBottom: 8 }}>Tally Prime</div>
                {[
                  "Gateway of Tally",
                  "Display More Reports",
                  "Account Books",
                  "Cash or Bank Book",
                  "Select your date range",
                  "Press Alt and E together to Export",
                  "Choose Excel (CSV) or XML format",
                  "Save the file and upload below",
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 5 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#C41E1E", fontWeight: 600, minWidth: 22, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.75)", lineHeight: 1.4 }}>{step}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#171208", marginBottom: 8 }}>Tally ERP 9</div>
                {[
                  "Gateway of Tally",
                  "Display",
                  "Account Books",
                  "Cash or Bank Book",
                  "Press F2 to set date period",
                  "Press Alt and E together to Export",
                  "Select Excel format",
                  "Save the file and upload below",
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 5 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#C41E1E", fontWeight: 600, minWidth: 22, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.75)", lineHeight: 1.4 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(139,105,20,0.06)", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Info size={14} style={{ color: "#8B6914", flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#8B6914", lineHeight: 1.5 }}>
                Export the Cash or Bank Book — not the Day Book or Ledger Summary. If your columns are not recognised automatically, FYNHelp shows a mapping screen. XML exports from Tally Prime are also supported and recommended for the most accurate data.
              </span>
            </div>
          </div>
        )}

        {/* BUSY EXPORT INSTRUCTIONS */}
        {bankId === "busy" && (
          <div style={{ background: "#FDFAF3", border: "1px solid rgba(139,105,20,0.2)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#8B6914", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              How to export from Busy Accounting
            </div>
            {[
              "Open Busy Accounting",
              "Go to Display then Day Book or Cash and Bank Book",
              "Select the date range",
              "Press Ctrl and E together or click Export",
              "Choose CSV format",
              "Save the file and upload below",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 5 }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#C41E1E", fontWeight: 600, minWidth: 22, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.75)", lineHeight: 1.4 }}>{step}</span>
              </div>
            ))}
          </div>
        )}

        {/* STEP 2 — FILE UPLOAD */}
        <section className="mb-6">
          <div className="text-[11px] tracking-widest mb-3" style={{ color: "#8B6914", fontFamily: "'JetBrains Mono', monospace" }}>
            STEP 2 · UPLOAD {bankId === "tally" ? "CSV OR XML" : "CSV"}
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className="bg-white cursor-pointer flex flex-col items-center justify-center text-center px-6 py-10 transition-colors"
            style={{
              borderRadius: 12,
              border: `2px dashed ${dragOver ? "#C41E1E" : "rgba(23,18,8,0.15)"}`,
            }}
          >
            <Upload className="w-8 h-8 mb-3" style={{ color: "#8B6914" }} />
            <div className="text-fyn-ink font-medium mb-1" style={{ fontFamily: "Inter, sans-serif" }}>
              Drop your file here or click to browse
            </div>
            <div className="text-xs text-fyn-ink/50" style={{ fontFamily: "Inter, sans-serif" }}>
              {bankId === "tally" ? ".csv and .xml supported — up to 10MB" : ".csv only — up to 10MB"}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={bankId === "tally" ? ".csv,.xml,text/csv,text/xml,application/xml" : ".csv,text/csv"}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {file && (
            <div className="mt-3 bg-white p-4 flex items-center gap-3" style={{ borderRadius: 12, border: "1px solid rgba(23,18,8,0.08)" }}>
              <FileText className="w-5 h-5 text-fyn-ink/60" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-fyn-ink font-medium truncate" style={{ fontFamily: "Inter, sans-serif" }}>{file.name}</div>
                <div className="text-xs text-fyn-ink/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {(file.size / 1024).toFixed(1)} KB · {isXMLFile ? "Tally XML" : "CSV"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setRawRows([]);
                  setResult(null);
                  setError(null);
                  setSkippedInfo(null);
                  setColumnMapperNeeded(false);
                  setIsXMLFile(false);
                }}
                className="text-xs text-fyn-ink/50 hover:text-fyn-red transition-colors"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Remove
              </button>
            </div>
          )}

          {rawRows.length > 0 && !isXMLFile && (
            <div className="mt-3 bg-white overflow-hidden" style={{ borderRadius: 12, border: "1px solid rgba(23,18,8,0.08)" }}>
              <div className="px-4 py-2 text-[11px] tracking-widest" style={{ color: "#8B6914", fontFamily: "'JetBrains Mono', monospace", borderBottom: "1px solid rgba(23,18,8,0.06)" }}>
                PREVIEW — FIRST {Math.max(0, rawRows.length - 1)} ROWS
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <thead>
                    <tr>
                      {rawRows[0].map((h, i) => (
                        <th key={i} className="text-left px-3 py-2 text-fyn-ink/70 font-semibold whitespace-nowrap" style={{ borderBottom: "1px solid rgba(23,18,8,0.06)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(1).map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci} className="px-3 py-2 text-fyn-ink/80 whitespace-nowrap" style={{ borderBottom: "1px solid rgba(23,18,8,0.04)" }}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* TALLY COLUMN MAPPER — shown only when auto-detection fails */}
        {bankId === "tally" && columnMapperNeeded && !isXMLFile && headers.length > 0 && (
          <div style={{ background: "#FFF7ED", border: "1px solid rgba(146,64,14,0.35)", borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={16} style={{ color: "#92400e", flexShrink: 0 }} />
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                Column names not recognised automatically — map them below
              </div>
            </div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#92400e", marginBottom: 14, lineHeight: 1.5 }}>
              Your Tally export uses custom column names. Select which column in your file corresponds to each field. Date and at least one amount column are required. The import button becomes active once these are mapped.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Date column (required)", key: "dateCol" as keyof TallyColumnMap, required: true },
                { label: "Amount column (if single column)", key: "amountCol" as keyof TallyColumnMap, required: false },
                { label: "Description or Narration", key: "descriptionCol" as keyof TallyColumnMap, required: false },
                { label: "Voucher Type or Direction", key: "directionCol" as keyof TallyColumnMap, required: false },
                { label: "Debit column (if separate)", key: "debitCol" as keyof TallyColumnMap, required: false },
                { label: "Credit column (if separate)", key: "creditCol" as keyof TallyColumnMap, required: false },
              ].map(({ label, key, required }) => (
                <div key={key}>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: required ? "#92400e" : "rgba(146,64,14,0.7)", display: "block", marginBottom: 5 }}>
                    {label}{required && " *"}
                  </label>
                  <select
                    value={tallyColumnMap[key]}
                    onChange={(e) => setTallyColumnMap((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{
                      width: "100%", height: 36, padding: "0 10px",
                      border: `1px solid ${required && !tallyColumnMap[key] ? "rgba(196,30,30,0.4)" : "rgba(146,64,14,0.3)"}`,
                      borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 13,
                      color: "#171208", background: "white", outline: "none",
                    }}
                  >
                    <option value="">Not mapped</option>
                    {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {mapperPreview.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>
                  Preview — confirm debits are negative before importing
                </div>
                <div style={{ overflowX: "auto", background: "white", border: "1px solid rgba(146,64,14,0.25)", borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#FFF7ED", color: "#92400e" }}>
                        <th style={{ textAlign: "left", padding: "7px 10px", fontWeight: 600 }}>Raw value</th>
                        <th style={{ textAlign: "right", padding: "7px 10px", fontWeight: 600 }}>Parsed amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapperPreview.map((p, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(146,64,14,0.12)" }}>
                          <td style={{ padding: "7px 10px", color: "#171208", whiteSpace: "nowrap" }}>{p.raw || "—"}</td>
                          <td style={{
                            padding: "7px 10px", textAlign: "right",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: p.parsed < 0 ? "#C41E1E" : "#1F5A46",
                          }}>
                            {p.parsed < 0 ? "−" : "+"}{Math.abs(p.parsed).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!isTallyMapperReady && (
              <div style={{ marginTop: 12, fontFamily: "Inter, sans-serif", fontSize: 12, color: "#92400e" }}>
                Map the Date column and at least one Amount or Debit column to enable the import button.
              </div>
            )}

          </div>
        )}

        {/* STEP 3 — IMPORT */}
        <section className="mb-8">
          <div className="text-[11px] tracking-widest mb-3" style={{ color: "#8B6914", fontFamily: "'JetBrains Mono', monospace" }}>STEP 3 · IMPORT</div>

          {error && (
            <div className="mb-4 bg-white p-4 flex gap-3" style={{ borderRadius: 12, border: "1px solid rgba(196,30,30,0.25)", borderLeft: "4px solid #C41E1E" }}>
              <AlertTriangle className="w-5 h-5 text-fyn-red shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-fyn-ink font-medium mb-1" style={{ fontFamily: "Inter, sans-serif" }}>Import failed</div>
                <div className="text-sm text-fyn-ink/80" style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}>{error}</div>
              </div>
            </div>
          )}

          <button
            onClick={runImport}
            disabled={disabled}
            className="w-full py-4 text-white font-semibold flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: "#C41E1E",
              borderRadius: 12,
              opacity: disabled ? 0.38 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "Inter, sans-serif",
              fontSize: 15,
            }}
          >
            {busy
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Importing...</>
              : `Import ${bankId === "tally" ? "Tally" : ""} transactions`
            }
          </button>

          {busy && progress && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-fyn-ink/60 mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span>Inserting rows</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div style={{ height: 4, background: "rgba(23,18,8,0.08)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                    background: "#C41E1E",
                    borderRadius: 2,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          )}

          {skippedInfo && skippedInfo.count > 0 && (
            <div className="mt-4 bg-white p-4" style={{ borderRadius: 12, border: "1px solid rgba(146,64,14,0.25)", borderLeft: "4px solid #8B6914" }}>
              <div className="flex items-center gap-2 mb-2">
                <Info size={15} style={{ color: "#8B6914" }} />
                <span className="text-sm font-medium text-fyn-ink" style={{ fontFamily: "Inter, sans-serif" }}>
                  {skippedInfo.count} row{skippedInfo.count !== 1 ? "s" : ""} skipped
                </span>
              </div>
              {skippedInfo.reasons.length > 0 && (
                <ul style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(23,18,8,0.65)", lineHeight: 1.5, paddingLeft: 16 }}>
                  {skippedInfo.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  {skippedInfo.count > skippedInfo.reasons.length && (
                    <li>...and {skippedInfo.count - skippedInfo.reasons.length} more</li>
                  )}
                </ul>
              )}
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "rgba(23,18,8,0.45)", marginTop: 6 }}>
                Skipped rows had unrecognised dates, zero amounts, or empty content. All valid rows were imported successfully.
              </div>
            </div>
          )}

          {result && (
            <div className="mt-6 bg-white p-6" style={{ borderRadius: 12, border: "1px solid rgba(16,185,129,0.3)", borderLeft: "4px solid #1F5A46" }}>
              <div className="flex items-center gap-2 mb-5">
                <CheckCircle2 className="w-6 h-6" style={{ color: "#1F5A46" }} />
                <h2 className="text-xl text-fyn-ink" style={{ fontFamily: "Georgia, serif" }}>Import complete</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Stat label="Rows imported" value={result.rows.toLocaleString("en-IN")} />
                <Stat label="Cash position" value={`Rs ${result.cash_position.toLocaleString("en-IN")}`} />
                <Stat label="Monthly burn" value={`Rs ${result.burn_rate_current.toLocaleString("en-IN")}`} />
                <Stat label="Runway (months)" value={String(result.runway_months)} />
              </div>
              <button
                onClick={() => navigate("/dashboard/liquidity")}
                className="px-5 py-2.5 text-white text-sm font-semibold"
                style={{ background: "#C41E1E", borderRadius: 10, fontFamily: "Inter, sans-serif" }}
              >
                View Liquidity Dashboard
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest mb-1" style={{ color: "#8B6914", fontFamily: "'JetBrains Mono', monospace" }}>{label.toUpperCase()}</div>
      <div className="text-fyn-ink text-lg font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
