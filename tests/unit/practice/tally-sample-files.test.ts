/**
 * The sample files FynHelp publishes at /samples (public/samples/tally): masters, voucher imports, a Day Book, bank and
 * cash books, and a customer and a supplier ledger, for three made-up companies. Each file kind must be recognised for
 * what it is, read to the figures a person would tick against Tally, and used only for what it is good for.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  runExtract,
  type ExtractOutcome,
} from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";

const read = (
  f: string,
  side: "bank" | "books" = "books",
): Promise<ExtractOutcome> =>
  runExtract(
    {
      bytes: new Uint8Array(readFileSync(`public/samples/tally/${f}`)),
      filename: f,
      mime: "text/xml",
      side,
      businessId: null,
    },
    { llm: null },
  );
const txns = (o: ExtractOutcome, side: "bank" | "books"): ReconTxn[] =>
  o.rows.map((r, i) => ({
    id: `${side}${i}`,
    side,
    direction: r.direction,
    amount: r.amount,
    txn_date: r.date,
    counterparty: r.counterparty,
    reference: r.reference,
    description: r.description,
    category: r.category,
  }));
const sum = (o: ExtractOutcome, d: "in" | "out") =>
  Math.round(
    o.rows.filter((r) => r.direction === d).reduce((n, r) => n + r.amount, 0) *
      100,
  ) / 100;

describe("masters: ledgers and opening balances", () => {
  it.each([
    [
      "01_masters_narmada_textile_mills.xml",
      44,
      "Narmada Textile Mills LLP",
      "ICICI Bank CA 6205",
    ],
    [
      "01_masters_brahmaputra_it_services.xml",
      39,
      "Brahmaputra IT Services Pvt Ltd",
      "SBI Current A/c 3871",
    ],
    [
      "01_masters_godavari_spices_foods.xml",
      43,
      "Godavari Spices & Foods Pvt Ltd",
      "HDFC Bank A/c 50200071",
    ],
  ])(
    "%s is read as masters: no transactions, balanced openings, a bank and a cash ledger",
    async (file, n, company, bank) => {
      const out = await read(file);
      expect(out.error).toBeNull();
      expect(out.rows).toHaveLength(0);
      expect(out.documentKind).toBe("tally_masters");
      const reg = out.register!;
      expect(reg.kind).toBe("tally_masters");
      expect(reg.entries).toBe(n);
      expect(reg.note).toContain(company);
      expect(
        reg.checks!.every((c) => c.ok),
        JSON.stringify(reg.checks!.filter((c) => !c.ok)),
      ).toBe(true);
      expect(
        reg.checks!.find((c) => /bank ledger/.test(c.label))!.detail,
      ).toContain(bank);
      expect(reg.totals[0]!.amount).toBeCloseTo(reg.totals[1]!.amount, 2);
    },
  );

  it("an opening position that does not balance is flagged, with the difference", async () => {
    const x = readFileSync(
      "public/samples/tally/01_masters_godavari_spices_foods.xml",
      "utf8",
    ).replace(
      "<OPENINGBALANCE>500000.00</OPENINGBALANCE>",
      "<OPENINGBALANCE>510000.00</OPENINGBALANCE>",
    );
    const out = await runExtract(
      {
        bytes: new TextEncoder().encode(x),
        filename: "m.xml",
        mime: "text/xml",
        side: "books",
        businessId: null,
      },
      { llm: null },
    );
    const bad = out.register!.checks!.find((c) => /balance/.test(c.label))!;
    expect(bad.ok).toBe(false);
    expect(bad.detail).toMatch(/differ by ₹10,000\.00/);
  });
});

describe("voucher imports: every book of a month", () => {
  it("Godavari October: 104 vouchers, bank lines kept, cash-only and non-bank vouchers left out openly", async () => {
    const out = await read("02_vouchers_godavari_oct2026_import.xml");
    expect(out.error).toBeNull();
    expect(out.rows).toHaveLength(43);
    expect(out.note).toMatch(/54 sales, purchase or journal vouchers/);
    expect(out.note).toMatch(/7 cash-only vouchers/);
  });
  it("Narmada November: the import file and the Day Book of the same month read to the same lines", async () => {
    const a = await read("02_vouchers_narmada_nov2026_import.xml");
    const b = await read("03_day_book_nov2026_export.xml");
    expect(a.rows).toHaveLength(42);
    expect(b.rows).toHaveLength(42);
    expect(sum(a, "in")).toBe(sum(b, "in"));
    expect(sum(a, "out")).toBe(sum(b, "out"));
  });
});

describe("bank and cash books exported as XML", () => {
  it("HDFC October reads to its own totals, with a multi-ledger entry named by its biggest ledger", async () => {
    const out = await read("04_bank_book_hdfc_godavari_oct2026.xml");
    expect(out.rows).toHaveLength(43);
    expect(sum(out, "in")).toBe(2586840.15);
    expect(sum(out, "out")).toBe(1464889.09);
    expect(out.note).toMatch(/Debits ₹25,86,840\.15, credits ₹14,64,889\.09/);
    // "(as per details)" is never a name: the rent entry is Rent, the audit fee is Professional Fees, GST is an Output tax head.
    expect(
      out.rows.some((r) => /as per details/i.test(r.counterparty ?? "")),
    ).toBe(false);
    expect(
      out.rows.find((r) => /Rent for Oct/.test(r.description)),
    ).toMatchObject({ counterparty: "Rent", amount: 94500, direction: "out" });
    expect(
      out.rows.find((r) => /Audit and tax/.test(r.description)),
    ).toMatchObject({ counterparty: "Professional Fees", amount: 30780 });
    expect(
      out.rows.find((r) => /GST paid for Sep/.test(r.description))!
        .counterparty,
    ).toMatch(/^Output (CGST|SGST)$/);
  });
  it("SBI September and the cash book read to their own totals", async () => {
    const sbi = await read("04_bank_book_sbi_brahmaputra_sep2026.xml");
    expect(sbi.rows).toHaveLength(29);
    expect(sum(sbi, "in")).toBe(3795692.9);
    expect(sum(sbi, "out")).toBe(2112526.31);
    const cash = await read("05_cash_book_brahmaputra_sep2026.xml");
    expect(cash.rows).toHaveLength(8);
    expect(sum(cash, "in")).toBe(70000);
    expect(sum(cash, "out")).toBe(24420.21);
  });
  it("the bank book of a company reconciles completely with that company's voucher import (HDFC vs Godavari October)", async () => {
    const bank = await read("04_bank_book_hdfc_godavari_oct2026.xml", "bank");
    const books = await read("02_vouchers_godavari_oct2026_import.xml");
    const res = reconcile(txns(bank, "bank"), txns(books, "books"));
    expect(res.matches).toHaveLength(43);
    // Nothing is left over on either side: the cash payments are not bank lines, so they no longer show as "not in bank".
    expect(res.exceptions).toEqual([]);
  });
});

describe("customer and supplier ledgers are summarised, never used as bank lines", () => {
  it("customer ledger (Northeast Power Corp): invoiced, received, outstanding", async () => {
    const out = await read("06_customer_ledger_northeast_power_corp.xml");
    expect(out.error).toBeNull();
    expect(out.rows).toHaveLength(0);
    expect(out.documentKind).toBe("tally_party_ledger");
    const reg = out.register!;
    expect(reg.label).toMatch(/customer or supplier/);
    const t = Object.fromEntries(reg.totals.map((x) => [x.label, x.amount]));
    expect(t["Invoiced (sales)"]).toBeCloseTo(
      452368.72 + 546078.45 + 542779.3,
      2,
    );
    expect(t["Received"]).toBeCloseTo(
      216090.84 + 452368.72 + 271389.65 + 546078.45,
      2,
    );
    expect(reg.note).toMatch(/customer ledger/);
    expect(reg.checks!.every((c) => c.ok)).toBe(true);
  });
  it("supplier ledger (Surat Power Looms): billed, paid, outstanding", async () => {
    const out = await read("07_supplier_ledger_surat_power_looms.xml");
    expect(out.rows).toHaveLength(0);
    const t = Object.fromEntries(
      out.register!.totals.map((x) => [x.label, x.amount]),
    );
    expect(t["Billed (purchases)"]).toBeCloseTo(
      305686.25 +
        222162.48 +
        91337.92 +
        181914.66 +
        321517.64 +
        380348.64 +
        532926.98,
      2,
    );
    expect(t["Paid"]).toBeCloseTo(296767.01 + 151557.28, 2);
    expect(out.register!.note).toMatch(/supplier ledger/);
  });
});
