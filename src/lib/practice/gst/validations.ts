/**
 * GST validations: the mistakes that cost a CA a notice, a rejected invoice or an ITC claim, found before the return is prepared.
 *
 * Each check is one plain rule, in code (never AI), with the reason a person would act on. They read invoice-level data
 * (`invoices.ts`) from a sales or purchase register or a GSTR-2B. A check that needs something the file does not carry (the
 * taxpayer's own GSTIN, a place-of-supply column, an invoice date) is skipped and counted as skipped, never guessed.
 *
 * Severity: `error` is a mistake that is wrong whatever the facts (a GSTIN that fails its own check character); `warn` is likely
 * wrong and worth a look; `info` is something to know, which is only a problem in some situations (stated in the detail).
 */
import { validGstin } from "../india";
import { gstinKey, normInvoiceNo, type GstInvoice } from "./invoices";

export type Severity = "error" | "warn" | "info";
export type Side = "sales" | "purchase" | "portal";
export type Group = "Party" | "Document" | "Period" | "Tax" | "Compliance";

export interface Validation {
  id: string;
  group: Group;
  label: string;
  severity: Severity;
  /** How many invoices break it. Zero is a pass. */
  count: number;
  /** Up to five of them, as "INV-12 (row 7)". */
  examples: string[];
  /** What it means and what to do, written for the person looking at it. */
  detail: string;
  /** The check could not run because the file does not carry what it needs. */
  skipped?: boolean;
}

export interface ValidationContext {
  side: Side;
  /** The month the register is for ("2026-09"), when known. */
  period?: string | null;
  /** The taxpayer's own GSTIN, when known. Enables the state and place-of-supply checks. */
  ownGstin?: string | null;
  today?: Date;
}

export interface ValidationRun {
  results: Validation[];
  failed: Validation[];
  passed: number;
  skipped: number;
  summary: { errors: number; warns: number; infos: number };
}

/** The standard GST slabs, old and current; a rate not here is unusual, not necessarily wrong (a composite or a cess-only item). */
const SLABS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
/** Valid state and territory codes in a GSTIN. */
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATE_OK = new Set([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, "0")), "97", "99"]);

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (i: GstInvoice) => `${i.no || "no number"} (row ${i.row})`;
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The financial year a date falls in, as its ending year: 15 Jun 2025 → 2026 (FY 2025-26). */
const fyEnd = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 4 ? y + 1 : y;
};

interface Rule {
  id: string;
  group: Group;
  label: string;
  severity: Severity;
  sides: Side[];
  /** Skip the rule (not fail it) when this says the file cannot support it. */
  needs?: (all: GstInvoice[], ctx: ValidationContext) => boolean;
  /** Returns the offending invoices. */
  find: (all: GstInvoice[], ctx: ValidationContext) => GstInvoice[];
  detail: (n: number, ctx: ValidationContext) => string;
}

const registered = (i: GstInvoice) => i.gstin !== "";
const taxOf = (i: GstInvoice) => i.igst + i.cgst + i.sgst;

const RULES: Rule[] = [
  /* ── Party ─────────────────────────────────────────── */
  {
    id: "gstin_missing", group: "Party", label: "GSTIN present", severity: "warn", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => !registered(i) && i.taxable !== 0),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} no GSTIN. A purchase without the supplier's GSTIN cannot be matched to GSTR-2B or claimed as ITC; a sale without the customer's is a B2C sale. Fine if they are B2C, otherwise add the GSTIN.`,
  },
  {
    id: "gstin_check", group: "Party", label: "GSTIN passes its check character", severity: "error", sides: ["sales", "purchase", "portal"],
    // Only a GSTIN of the right shape: a wrongly shaped one is reported by "has the right shape", once.
    find: (a) => a.filter((i) => registered(i) && SHAPE.test(i.gstin) && !validGstin(i.gstin)),
    detail: (n) => `${n} GSTIN${n === 1 ? " fails" : "s fail"} the check-character test: mistyped or not genuine. The portal will not match it.`,
  },
  {
    id: "gstin_format", group: "Party", label: "GSTIN has the right shape", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => registered(i) && !SHAPE.test(i.gstin)),
    detail: (n) => `${n} GSTIN${n === 1 ? " is" : "s are"} not 15 characters in the GSTIN pattern (2-digit state, PAN, entity number, Z, check character).`,
  },
  {
    id: "gstin_state", group: "Party", label: "GSTIN state code is a real state", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => registered(i) && /^\d{2}/.test(i.gstin) && !STATE_OK.has(i.gstin.slice(0, 2))),
    detail: (n) => `${n} GSTIN${n === 1 ? " starts" : "s start"} with a code that is not a state or territory code.`,
  },
  {
    id: "gstin_pan", group: "Party", label: "PAN inside the GSTIN is well formed", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => registered(i) && i.gstin.length === 15 && !/^[A-Z]{5}\d{4}[A-Z]$/.test(i.gstin.slice(2, 12))),
    detail: (n) => `${n} GSTIN${n === 1 ? " has" : "s have"} a PAN part (characters 3 to 12) that is not five letters, four digits and a letter.`,
  },
  {
    id: "own_gstin", group: "Party", label: "Not an invoice to or from yourself", severity: "warn", sides: ["sales", "purchase"],
    needs: (_a, c) => Boolean(c.ownGstin),
    find: (a, c) => a.filter((i) => registered(i) && i.gstin === gstinKey(c.ownGstin ?? "")),
    detail: (n) => `${n} invoice${n === 1 ? " carries" : "s carry"} the taxpayer's own GSTIN as the other party. Usually a mistyped GSTIN, or a transfer between your own branches.`,
  },
  {
    id: "name_per_gstin", group: "Party", label: "One name per GSTIN", severity: "info", sides: ["sales", "purchase", "portal"],
    find: (a) => {
      const by = new Map<string, Map<string, GstInvoice>>();
      for (const i of a) {
        if (!registered(i) || !i.party) continue;
        const k = i.party.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
        const m = by.get(i.gstin) ?? new Map();
        if (!m.has(k)) m.set(k, i);
        by.set(i.gstin, m);
      }
      return [...by.values()].filter((m) => m.size > 1).map((m) => [...m.values()][1]!);
    },
    detail: (n) => `${n} GSTIN${n === 1 ? " is" : "s are"} written with different party names. Often the same party spelled two ways; sometimes a wrong GSTIN. Matching by name will suffer.`,
  },
  {
    id: "gstin_per_name", group: "Party", label: "One GSTIN per party name", severity: "warn", sides: ["sales", "purchase"],
    find: (a) => {
      const by = new Map<string, Map<string, GstInvoice>>();
      for (const i of a) {
        if (!registered(i) || i.party.length < 4) continue;
        const k = i.party.toLowerCase().replace(/[^a-z0-9]/g, "");
        const m = by.get(k) ?? new Map();
        if (!m.has(i.gstin)) m.set(i.gstin, i);
        by.set(k, m);
      }
      return [...by.values()].filter((m) => m.size > 1).map((m) => [...m.values()][1]!);
    },
    detail: (n) => `${n} party name${n === 1 ? " appears" : "s appear"} with more than one GSTIN: a typo in one of them, or a party with registrations in several states.`,
  },

  /* ── Document ──────────────────────────────────────── */
  {
    id: "no_missing", group: "Document", label: "Invoice number present", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => !i.no.trim()),
    detail: (n) => `${n} row${n === 1 ? " has" : "s have"} no invoice number. Every tax invoice must carry a unique number.`,
  },
  {
    id: "no_length", group: "Document", label: "Invoice number within 16 characters", severity: "error", sides: ["sales"],
    find: (a) => a.filter((i) => i.no.length > 16),
    detail: (n) => `${n} invoice number${n === 1 ? " is" : "s are"} longer than 16 characters, the most the invoice rules and the portal allow.`,
  },
  {
    id: "no_chars", group: "Document", label: "Invoice number uses allowed characters", severity: "error", sides: ["sales"],
    find: (a) => a.filter((i) => i.no && /[^A-Za-z0-9/-]/.test(i.no)),
    detail: (n) => `${n} invoice number${n === 1 ? " has" : "s have"} characters other than letters, digits, "/" and "-", which the portal rejects.`,
  },
  {
    id: "no_duplicate", group: "Document", label: "No invoice number used twice for one party", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => {
      const seen = new Map<string, GstInvoice>();
      const dup: GstInvoice[] = [];
      for (const i of a) {
        if (!i.no) continue;
        const k = `${i.gstin}|${normInvoiceNo(i.no)}|${i.docType}`;
        if (seen.has(k)) dup.push(i);
        else seen.set(k, i);
      }
      return dup;
    },
    detail: (n) => `${n} invoice number${n === 1 ? " appears" : "s appear"} more than once for the same party. A repeated entry doubles the tax and the ITC.`,
  },
  {
    id: "repeated_rows", group: "Document", label: "No line entered twice inside one invoice", severity: "warn", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => i.repeats > 0),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} rows that are exact copies of another row of the same invoice. If a line was entered twice, the taxable value and the tax are doubled; if the items are genuinely identical, ignore this.`,
  },
  {
    id: "probable_duplicate", group: "Document", label: "No probable duplicate under another number", severity: "warn", sides: ["sales", "purchase"],
    find: (a) => {
      const seen = new Map<string, GstInvoice>();
      const out: GstInvoice[] = [];
      for (const i of a) {
        if (!i.date || !i.taxable || !registered(i)) continue;
        const k = `${i.gstin}|${i.date}|${Math.round(i.taxable)}`;
        const first = seen.get(k);
        if (first && normInvoiceNo(first.no) !== normInvoiceNo(i.no)) out.push(i);
        else if (!first) seen.set(k, i);
      }
      return out;
    },
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} the same party, date and taxable value as another under a different number: possibly entered twice.`,
  },
  {
    id: "series_gaps", group: "Document", label: "Invoice series has no gaps", severity: "info", sides: ["sales"],
    needs: (a) => a.length >= 10,
    find: (a) => {
      const series = new Map<string, { n: number; inv: GstInvoice }[]>();
      for (const i of a) {
        const m = /^(.*?)(\d+)$/.exec(i.no.trim());
        if (!m || i.docType !== "invoice") continue;
        const k = `${m[1]}|${m[2]!.length}`;
        (series.get(k) ?? series.set(k, []).get(k)!).push({ n: Number(m[2]), inv: i });
      }
      const out: GstInvoice[] = [];
      for (const list of series.values()) {
        if (list.length < 8) continue;
        const nums = [...new Set(list.map((x) => x.n))].sort((x, y) => x - y);
        const span = nums[nums.length - 1]! - nums[0]! + 1;
        // A run that is mostly there with a few holes is a gap; a loose set of numbers is not a series.
        if (span - nums.length > 0 && nums.length / span >= 0.8) {
          const have = new Set(nums);
          for (let n = nums[0]!; n <= nums[nums.length - 1]! && out.length < 200; n++) if (!have.has(n)) out.push({ ...list[0]!.inv, no: `${list[0]!.inv.no.replace(/\d+$/, "")}${String(n).padStart(String(list[0]!.inv.no.match(/\d+$/)![0]).length, "0")}`, row: 0 });
        }
      }
      return out;
    },
    detail: (n) => `${n} number${n === 1 ? " is" : "s are"} missing from the middle of the invoice series. Cancelled invoices must still be accounted for (a Document Summary in GSTR-1 lists them).`,
  },
  {
    id: "doc_credit_without_original", group: "Document", label: "Credit notes name their invoice", severity: "info", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => i.docType === "credit_note" && !i.no.trim()),
    detail: (n) => `${n} credit note${n === 1 ? " has" : "s have"} no number.`,
  },

  /* ── Period ────────────────────────────────────────── */
  {
    id: "date_missing", group: "Period", label: "Invoice date present and readable", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => !i.date),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} no date we could read. The date decides the month, the financial year and the ITC time limit.`,
  },
  {
    id: "date_future", group: "Period", label: "No invoice dated in the future", severity: "error", sides: ["sales", "purchase"],
    find: (a, c) => a.filter((i) => i.date && i.date > ymd(c.today ?? new Date())),
    detail: (n) => `${n} invoice${n === 1 ? " is" : "s are"} dated after today: a typing mistake in the date, or a wrong year.`,
  },
  {
    id: "date_pre_gst", group: "Period", label: "No invoice dated before GST began", severity: "error", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => i.date && i.date < "2017-07-01"),
    detail: (n) => `${n} invoice${n === 1 ? " is" : "s are"} dated before 1 July 2017, when GST began: almost certainly the wrong year.`,
  },
  {
    id: "date_period_sales", group: "Period", label: "Sales fall in the return month", severity: "warn", sides: ["sales"],
    needs: (_a, c) => Boolean(c.period),
    find: (a, c) => a.filter((i) => i.date && c.period && i.date.slice(0, 7) !== c.period),
    detail: (n, c) => `${n} sale${n === 1 ? " is" : "s are"} dated outside ${c.period}. An outward supply belongs to the month of its invoice, so these go in another month's GSTR-1.`,
  },
  {
    id: "date_after_period_purchase", group: "Period", label: "Purchases are not dated after the month", severity: "warn", sides: ["purchase"],
    needs: (_a, c) => Boolean(c.period),
    find: (a, c) => a.filter((i) => i.date && c.period && i.date.slice(0, 7) > c.period),
    detail: (n, c) => `${n} purchase${n === 1 ? " is" : "s are"} dated after ${c.period}: it cannot be in GSTR-2B for that month yet.`,
  },
  {
    id: "itc_time_limit", group: "Period", label: "Purchase ITC is inside its time limit", severity: "warn", sides: ["purchase", "portal"],
    needs: (_a, c) => Boolean(c.period),
    find: (a, c) => a.filter((i) => {
      if (!i.date || !c.period || i.docType === "credit_note") return false;
      // ITC on an invoice of a financial year can be claimed up to 30 November after that year ends (Section 16(4)).
      return c.period > `${fyEnd(i.date)}-11`;
    }),
    detail: (n) => `${n} purchase${n === 1 ? " is" : "s are"} so old that the ITC may be past its limit (30 November after the end of the financial year of the invoice). Confirm against the current rule before claiming.`,
  },
  {
    id: "booked_late", group: "Period", label: "Purchases are booked close to the invoice date", severity: "warn", sides: ["purchase"],
    // Only a register that carries both dates (a Tally register with the supplier's invoice date) can show this.
    needs: (a) => a.some((i) => i.bookedOn && i.date),
    find: (a) => a.filter((i) => i.bookedOn && i.date && i.docType !== "credit_note" && (Date.parse(i.bookedOn) - Date.parse(i.date)) / 86_400_000 > 90),
    detail: (n) => `${n} purchase${n === 1 ? " was" : "s were"} booked more than 90 days after the supplier's invoice date. The credit may belong to an earlier month (or may be past its time limit), and the supplier may have filed it in a different return than the one you are matching. Check the invoice date and the month the credit was taken.`,
  },
  {
    id: "mixed_months", group: "Period", label: "One month in the register", severity: "info", sides: ["sales", "purchase"],
    needs: (a) => a.length >= 5,
    find: (a) => {
      const by = new Map<string, GstInvoice>();
      for (const i of a) if (i.date && !by.has(i.date.slice(0, 7))) by.set(i.date.slice(0, 7), i);
      return by.size > 2 ? [...by.values()].slice(2) : [];
    },
    detail: () => `The register spans more than two months. A monthly register normally holds one; make sure it is the period you mean to reconcile.`,
  },

  /* ── Tax ───────────────────────────────────────────── */
  {
    id: "igst_cgst_mixed", group: "Tax", label: "IGST and CGST/SGST are not mixed", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => i.igst !== 0 && (i.cgst !== 0 || i.sgst !== 0)),
    detail: (n) => `${n} invoice${n === 1 ? " carries" : "s carry"} both IGST and CGST/SGST. One supply is either inter-state (IGST) or intra-state (CGST and SGST), never both.`,
  },
  {
    id: "cgst_sgst_equal", group: "Tax", label: "CGST equals SGST", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => !near(i.cgst, i.sgst, 1)),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} CGST different from SGST. On an intra-state supply the two are always equal halves.`,
  },
  {
    id: "rate_slab", group: "Tax", label: "Tax is a standard GST rate on the taxable value", severity: "warn", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => i.taxable > 0 && taxOf(i) > 0 && !SLABS.some((r) => near(i.taxable * r / 100, taxOf(i), Math.max(1, i.taxable * 0.0005)))),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} tax that is not any standard rate (0.25%, 3%, 5%, 12%, 18%, 28%, 40% and the like) of its taxable value. A wrong tax amount, a wrong taxable value, or an invoice with several rates.`,
  },
  {
    id: "rate_stated", group: "Tax", label: "Stated rate matches the tax charged", severity: "warn", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => i.rate !== null && i.rate > 0 && i.taxable > 0 && !near(i.taxable * i.rate / 100, taxOf(i), Math.max(1, i.taxable * 0.001))),
    detail: (n) => `${n} invoice${n === 1 ? " states" : "s state"} a rate that does not give the tax charged.`,
  },
  {
    id: "total_matches", group: "Tax", label: "Invoice value = taxable value + tax", severity: "warn", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => i.total !== null && i.taxable !== 0 && !near(i.total, i.taxable + taxOf(i) + i.cess, Math.max(2, Math.abs(i.total) * 0.0005))),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} an invoice value that is not the taxable value plus tax (beyond a small round-off). Often a freight or other charge left out of one column.`,
  },
  {
    id: "taxable_nonpositive", group: "Tax", label: "No zero or negative taxable value on an invoice", severity: "warn", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => i.docType === "invoice" && i.taxable <= 0 && (taxOf(i) !== 0 || i.total)),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} a taxable value of zero or less. A reduction belongs in a credit note.`,
  },
  {
    id: "tax_without_taxable", group: "Tax", label: "Tax is not charged on nothing", severity: "error", sides: ["sales", "purchase", "portal"],
    find: (a) => a.filter((i) => i.taxable === 0 && taxOf(i) !== 0),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} tax but no taxable value.`,
  },
  {
    id: "no_tax", group: "Tax", label: "Taxable invoices carry tax", severity: "info", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => i.taxable > 0 && taxOf(i) === 0 && !i.reverseCharge),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} taxable value but no tax. Correct for nil-rated, exempt, zero-rated and composition-supplier invoices; otherwise tax is missing.`,
  },
  {
    id: "pos_igst", group: "Tax", label: "IGST or CGST/SGST fits the states", severity: "warn", sides: ["sales", "purchase"],
    needs: (a, c) => Boolean(c.ownGstin) && a.some((i) => registered(i)),
    find: (a, c) => {
      const own = gstinKey(c.ownGstin ?? "").slice(0, 2);
      return a.filter((i) => {
        if (!registered(i) || taxOf(i) === 0 || !/^\d{2}/.test(i.gstin)) return false;
        const party = i.gstin.slice(0, 2);
        // Where the supply is made: a purchase is supplied at the buyer's state (ours); a sale at the place of supply, else the customer's state.
        const place = c.side === "purchase" ? own : /^\d{2}$/.test(i.pos) ? i.pos : party;
        const from = c.side === "purchase" ? party : own;
        const inter = from !== place;
        return (inter && (i.cgst !== 0 || i.sgst !== 0)) || (!inter && i.igst !== 0);
      });
    },
    detail: (n) => `${n} invoice${n === 1 ? " charges" : "s charge"} the wrong kind of tax for the two states: IGST on a supply inside one state, or CGST/SGST across states. The ITC or the return will not work.`,
  },

  /* ── Compliance ────────────────────────────────────── */
  {
    id: "hsn_shape", group: "Compliance", label: "HSN or SAC code has a valid length", severity: "warn", sides: ["sales", "purchase"],
    find: (a) => a.filter((i) => i.hsn && !/^(\d{4}|\d{6}|\d{8}|99\d{4})$/.test(i.hsn.replace(/\D/g, "")) ),
    detail: (n) => `${n} invoice${n === 1 ? " has" : "s have"} an HSN or SAC that is not 4, 6 or 8 digits.`,
  },
  {
    id: "irn_shape", group: "Compliance", label: "IRN is well formed where given", severity: "error", sides: ["sales", "portal"],
    find: (a) => a.filter((i) => i.irn && !/^[a-f0-9]{64}$/i.test(i.irn)),
    detail: (n) => `${n} IRN${n === 1 ? " is" : "s are"} not the 64-character code an e-invoice carries.`,
  },
  {
    id: "irn_missing", group: "Compliance", label: "B2B sales carry an IRN", severity: "info", sides: ["sales"],
    needs: (a) => a.some((i) => i.irn),
    find: (a) => a.filter((i) => registered(i) && i.docType === "invoice" && !i.irn),
    detail: (n) => `${n} B2B sale${n === 1 ? " has" : "s have"} no IRN while others in the register do. E-invoicing is compulsory above the turnover limit in force; if this taxpayer is over it, these invoices are not valid for the buyer's ITC.`,
  },
  {
    id: "rcm", group: "Compliance", label: "Reverse-charge purchases are known", severity: "info", sides: ["purchase", "portal"],
    find: (a) => a.filter((i) => i.reverseCharge),
    detail: (n) => `${n} purchase${n === 1 ? " is" : "s are"} on reverse charge. Tax is paid by you first and the ITC is taken afterwards: they are not in the normal ITC.`,
  },
  {
    id: "itc_blocked", group: "Compliance", label: "ITC is available on every GSTR-2B invoice", severity: "info", sides: ["portal"],
    find: (a) => a.filter((i) => i.itc === "N"),
    detail: (n) => `The portal marks ${n} invoice${n === 1 ? "" : "s"} as ITC not available (blocked credit, or a supplier who filed late). Do not claim them.`,
  },
];

/** The checks that used to run on a register upload (in `india.ts`); skipped there so a register shows each result once. */
export const LEGACY_CHECK_IDS = new Set(["gstin_check", "igst_cgst_mixed", "cgst_sgst_equal", "rate_slab"]);

export const VALIDATION_COUNT = RULES.length;

export function runValidations(invoices: GstInvoice[], ctx: ValidationContext): ValidationRun {
  const results: Validation[] = [];
  for (const r of RULES) {
    if (!r.sides.includes(ctx.side)) continue;
    if (r.needs && !r.needs(invoices, ctx)) {
      results.push({ id: r.id, group: r.group, label: r.label, severity: r.severity, count: 0, examples: [], detail: "Skipped: the file does not carry what this check needs.", skipped: true });
      continue;
    }
    const hits = r.find(invoices, ctx);
    results.push({
      id: r.id,
      group: r.group,
      label: r.label,
      severity: r.severity,
      count: hits.length,
      examples: hits.slice(0, 5).map(label),
      detail: hits.length ? r.detail(hits.length, ctx) : "Passed.",
    });
  }
  const failed = results.filter((v) => v.count > 0 && !v.skipped);
  return {
    results,
    failed,
    passed: results.filter((v) => v.count === 0 && !v.skipped).length,
    skipped: results.filter((v) => v.skipped).length,
    summary: {
      errors: failed.filter((v) => v.severity === "error").length,
      warns: failed.filter((v) => v.severity === "warn").length,
      infos: failed.filter((v) => v.severity === "info").length,
    },
  };
}

export { fmt as formatAmount };
