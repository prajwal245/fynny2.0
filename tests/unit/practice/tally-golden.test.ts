/**
 * What FynHelp writes to Tally, checked against what Tally itself writes.
 * The three files are real Tally exports and an import file: a 123 voucher Day Book, a 104 voucher Import Data file,
 * and a ledger export. If our rules ever disagree with real Tally data, or our XML drifts from the shape Tally uses, this fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  importProblems,
  importVoucherXml,
  voucherProblems,
  type ApprovedLine,
} from "@/lib/practice/tallyVoucher";
import { readTally } from "@/lib/practice/extract/tally";

const fx = (n: string) => readFileSync(`tests/fixtures/tally/${n}`, "utf8");
const dayBook = fx("day-book-november-2026.xml");
const importFile = fx("vouchers-import-october-2026.xml");
const blocks = (x: string) => x.match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/g) ?? [];
const tagsOf = (x: string) =>
  [...x.matchAll(/<([A-Z][A-Z0-9.]*)[\s>]/g)].map((m) => m[1]!);
/** Child tag names of the first element named `parent`, in order. */
const childOrder = (x: string, parent: string) => {
  const m = new RegExp(`<${parent}\\b[^>]*>([\\s\\S]*?)</${parent}>`).exec(x);
  const inner = (m?.[1] ?? "").replace(
    /<(ALLLEDGERENTRIES\.LIST|BILLALLOCATIONS\.LIST|BANKALLOCATIONS\.LIST)\b[\s\S]*?<\/\1>/g,
    "<$1/>",
  );
  return [...inner.matchAll(/<([A-Z][A-Z0-9.]*)\b/g)].map((x2) => x2[1]!);
};

describe("our rules agree with real Tally data", () => {
  it("every one of the 123 Day Book vouchers is sound (no false alarms)", () => {
    const bad = blocks(dayBook)
      .map((b, i) => [i, voucherProblems(b)] as const)
      .filter(([, p]) => p.length);
    expect(blocks(dayBook)).toHaveLength(123);
    expect(bad).toEqual([]);
  });
  it("every one of the 104 vouchers of the import file is sound", () => {
    const bad = blocks(importFile)
      .map((b, i) => [i, voucherProblems(b)] as const)
      .filter(([, p]) => p.length);
    expect(blocks(importFile)).toHaveLength(104);
    expect(bad).toEqual([]);
  });
  it("catches the faults a wrong write would have", () => {
    const good = blocks(importFile).find((b) => /VCHTYPE="Receipt"/.test(b))!;
    expect(voucherProblems(good)).toEqual([]);
    expect(
      voucherProblems(good.replace(/<AMOUNT>(\d+)\./, "<AMOUNT>9$1.")),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/differ by/)]));
    expect(
      voucherProblems(
        good.replace(/<ISDEEMEDPOSITIVE>Yes/, "<ISDEEMEDPOSITIVE>No"),
      ),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/sign/)]));
    expect(
      voucherProblems(good.replace(/<DATE>\d{8}/, "<DATE>20261345")),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/date/)]));
    expect(
      voucherProblems(
        good.replace(/<AMOUNT>(-?\d+\.\d\d)/, "<AMOUNT>$1" + "5"),
      ),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/two decimals/)]));
  });
});

describe("what FynHelp writes has the shape of what Tally writes", () => {
  const base: ApprovedLine = {
    id: "ln_1f3a9c",
    company: "Godavari Spices & Foods Pvt Ltd",
    date: "2026-10-01",
    direction: "out",
    amount: 2134.9,
    bankLedger: "Cash",
    partyLedger: "Freight Outward",
    narration: "Freight Outward paid in cash",
  };
  const cases: [string, ApprovedLine][] = [
    ["a Payment", base],
    [
      "a Receipt from a party",
      {
        ...base,
        direction: "in",
        bankLedger: "HDFC Bank A/c 50200071",
        partyLedger: "Krishna Kitchen Supplies",
        partyLedgerIsParty: true,
        narration: "Received from Krishna Kitchen Supplies",
        reference: "707232",
      },
    ],
    [
      "a Contra",
      {
        ...base,
        direction: "out",
        kind: "Contra",
        bankLedger: "HDFC Bank A/c 50200071",
        partyLedger: "Cash",
        narration: "Cash withdrawn",
      },
    ],
    [
      "a charge with GST split",
      {
        ...base,
        amount: 590,
        partyLedger: "Bank Charges",
        bankLedger: "HDFC Bank A/c 50200071",
        splits: [
          { ledger: "Bank Charges", amount: 500 },
          { ledger: "Input CGST", amount: 45 },
          { ledger: "Input SGST", amount: 45 },
        ],
      },
    ],
  ];
  const sampleVoucherOrder = childOrder(
    blocks(importFile)[0]!.replace(/^<VOUCHER[^>]*>/, "<VOUCHER>"),
    "VOUCHER",
  );
  const sampleEntryOrder = childOrder(importFile, "ALLLEDGERENTRIES.LIST");
  const sampleTags = new Set(tagsOf(importFile));

  for (const [name, line] of cases) {
    it(`${name}: sound, one new voucher, and every tag is one Tally uses`, () => {
      const x = importVoucherXml(line);
      expect(importProblems(x, line.company)).toEqual([]);
      const ours = tagsOf(x).filter((t) => t !== "ENVELOPE");
      for (const t of ours)
        expect(
          sampleTags.has(t),
          `${t} is not a tag in the Tally import sample`,
        ).toBe(true);
    });
    it(`${name}: voucher and entry children are in Tally's order`, () => {
      const x = importVoucherXml(line);
      const order = childOrder(
        x.replace(/<VOUCHER [^>]*>/, "<VOUCHER>"),
        "VOUCHER",
      ).filter((t) => t !== "ALLLEDGERENTRIES.LIST");
      const sampleNoEntries = sampleVoucherOrder.filter(
        (t) => t !== "ALLLEDGERENTRIES.LIST",
      );
      expect(order.map((t) => sampleNoEntries.indexOf(t))).toEqual(
        [...order.map((t) => sampleNoEntries.indexOf(t))].sort((a, b) => a - b),
      );
      expect(childOrder(x, "ALLLEDGERENTRIES.LIST")).toEqual(sampleEntryOrder);
    });
    it(`${name}: Tally's own Day Book reader reads back the same money and direction`, () => {
      const x = importVoucherXml(line);
      const r = readTally(x);
      expect(r.vouchers).toBe(1);
      if (/^cash$/i.test(line.bankLedger)) {
        // Paid in cash: a real entry, but it never appears on a bank statement, so it is not a reconciliation line.
        expect(r.rows).toHaveLength(0);
        expect(r.skippedCash).toBe(1);
        return;
      }
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]!.amount).toBe(line.amount);
      if (line.kind !== "Contra")
        expect(r.rows[0]!.direction).toBe(line.direction);
    });
  }

  it("uses the Import Data envelope the sample uses", () => {
    const x = importVoucherXml(base);
    expect(x).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(x).toContain("<REPORTNAME>Vouchers</REPORTNAME>");
    expect(x).toMatch(
      /<VOUCHER REMOTEID="ln_1f3a9c" VCHTYPE="Payment" ACTION="Create" OBJVIEW="Accounting Voucher View">/,
    );
    expect(importFile).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
  });
  it("lists debits before credits, as Tally does, and flags only a real party ledger", () => {
    const x = importVoucherXml(cases[1]![1]);
    expect(x.indexOf("-")).toBeGreaterThan(-1);
    const debitAt = x.search(/<ISDEEMEDPOSITIVE>Yes/);
    const creditAt = x.search(/<ISDEEMEDPOSITIVE>No/);
    expect(debitAt).toBeGreaterThan(-1);
    expect(debitAt).toBeLessThan(creditAt);
    expect(x).toMatch(
      /Krishna Kitchen Supplies<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes/,
    );
    expect(importVoucherXml(base)).not.toContain("<ISPARTYLEDGER>Yes");
  });
  it("older connectors still get the older envelope", () => {
    const x = importVoucherXml(base, "legacy");
    expect(x).toContain("<TALLYREQUEST>Import</TALLYREQUEST>");
    expect(x).not.toContain("ISPARTYLEDGER");
  });
  it("refuses what must never be sent", () => {
    const x = importVoucherXml(base);
    expect(importProblems(x, "Another Company")[0]).toMatch(
      /different company/,
    );
    expect(
      importProblems(
        x.replace('ACTION="Create"', 'ACTION="Alter"'),
        base.company,
      )[0],
    ).toMatch(/never changed/);
    expect(
      importProblems(x.replace(/ REMOTEID="[^"]*"/, ""), base.company),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/no id/)]));
    expect(
      importProblems(
        x.replace("<AMOUNT>2134.90", "<AMOUNT>2134.91"),
        base.company,
      ).join(),
    ).toMatch(/differ by/);
    expect(
      importProblems(
        x + x.match(/<VOUCHER[\s\S]*<\/VOUCHER>/)![0],
        base.company,
      )[0],
    ).toMatch(/exactly one/);
  });
});
