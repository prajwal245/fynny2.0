import { describe, expect, it as test } from "vitest";
import {
  rowsFromPositioned,
  type PosItem,
} from "@/lib/practice/extract/pdfTable";

// Made-up statements laid out the way real banks print them. Each helper returns the text pieces of one page with positions.
const it = (
  str: string,
  x: number,
  y: number,
  width = str.length * 5,
): PosItem => ({ str, x, y, width });
const right = (str: string, rightEdge: number, y: number) =>
  it(str, rightEdge - str.length * 5, y, str.length * 5);

interface Tx {
  d: string;
  narr: string[];
  out?: number;
  in?: number;
  bal: string;
}

/** Narration starts on the date line and wraps below it (HDFC, Union Bank). Right-aligned amounts. */
function trailingPage(txs: Tx[]): PosItem[] {
  const items: PosItem[] = [
    it("Date", 34, 600),
    it("Narration", 144, 600),
    it("Withdrawal Amt.", 405, 600),
    it("Deposit Amt.", 491, 600),
    it("Closing Balance", 564, 600),
  ];
  let y = 580;
  for (const t of txs) {
    items.push(it(t.d, 34, y), it(t.narr[0]!, 72, y), it(t.d, 362, y));
    if (t.out !== undefined) items.push(right(t.out.toFixed(2), 470, y));
    if (t.in !== undefined) items.push(right(t.in.toFixed(2), 548, y));
    items.push(right(t.bal, 627, y));
    t.narr.slice(1).forEach((n, k) => items.push(it(n, 72, y - 17 * (k + 1))));
    y -= 17 * t.narr.length;
  }
  return items;
}

/** Narration centred around the date line, which carries only dates and amounts (SBI). Balance with CR, or DR beside it. */
function centredPage(txs: Tx[], od = false): PosItem[] {
  const items: PosItem[] = [
    it("Post Date", 26, 470),
    it("Description", 182, 470),
    it("Debit", 383, 470),
    it("Credit", 452, 470),
    it("Balance", 520, 470),
  ];
  let y = 440;
  for (const t of txs) {
    items.push(it(t.d, 27, y), it(t.d, 85, y));
    items.push(it(t.narr[0]!, 143, y + 5), it(t.narr[1] ?? "", 143, y - 4));
    if (t.out !== undefined) items.push(right(t.out.toFixed(2), 413, y));
    if (t.in !== undefined) items.push(right(t.in.toFixed(2), 484, y));
    items.push(right(od ? t.bal : `${t.bal}CR`, 563, y + 5));
    if (od) items.push(it("DR", 530, y - 4, 12));
    y -= 30;
  }
  return items.filter((i) => i.str);
}

/** Left-aligned amounts, an id and a serial left of the date, the date split over two lines, narration wrapped mid-word (ICICI). */
function leftAlignedPage(txs: Tx[]): PosItem[] {
  const items: PosItem[] = [
    it("S.no", 50, 800),
    it("Date", 162, 800),
    it("Description", 296, 800),
    it("Withdrawal", 363, 800),
    it("Deposit", 431, 800),
    it("Balance", 498, 800),
  ];
  let y = 780;
  txs.forEach((t, k) => {
    items.push(
      it(String(k + 1), 50, y, 5),
      it(`S61${k}`, 95, y),
      it(t.d.slice(0, 7), 162, y, 30),
      it(t.d.slice(7), 162, y - 12, 19),
    );
    t.narr.forEach((n, j) => items.push(it(n, 296, y - 12 * j, 44)));
    if (t.out !== undefined) items.push(it(t.out.toFixed(2), 363, y, 40));
    if (t.in !== undefined) items.push(it(t.in.toFixed(2), 431, y, 40));
    items.push(it("-", 498, y, 3), it(t.bal, 498, y - 12, 45));
    y -= 80;
  });
  return items;
}

const names = (r: ReturnType<typeof rowsFromPositioned>) =>
  r!.rows.map((x) => `${x.date} ${x.direction} ${x.amount} ${x.balance}`);

describe("reading a statement table by position", () => {
  const trailing: Tx[] = [
    {
      d: "02/04/25",
      narr: ["IMPS-509214377036-SRI", "SWAM", "Y LOGISTCIS"],
      out: 190000,
      bal: "925.04",
    },
    {
      d: "03/04/25",
      narr: ["RTGS CR-ICIC0000011-X", "SW"],
      in: 600000,
      bal: "600,925.04",
    },
    {
      d: "04/04/25",
      narr: ["IMPS-509416212341-SRI"],
      in: 418840,
      bal: "1,019,765.04",
    },
    { d: "05/04/25", narr: ["ACH D- KMBL"], out: 138939, bal: "880,826.04" },
  ];

  test("narration on the date line, wrapped below: each amount from its own column, wrapped lines joined", () => {
    const r = rowsFromPositioned([trailingPage(trailing)])!;
    expect(r.rows).toHaveLength(4);
    expect(names(r)).toEqual([
      "2025-04-02 out 190000 925.04",
      "2025-04-03 in 600000 600925.04",
      "2025-04-04 in 418840 1019765.04",
      "2025-04-05 out 138939 880826.04",
    ]);
    expect(r.rows[0]!.description).toContain("SWAM Y LOGISTCIS");
    expect(r.rows[0]!.description).not.toContain("Narration");
    expect(r.verifiedShare).toBeGreaterThan(0.7);
  });

  test("a page that does not repeat the header keeps the same columns, and many pages are all read", () => {
    const page2 = trailingPage(trailing).filter((i) => i.y < 599);
    const r = rowsFromPositioned([trailingPage(trailing), page2, page2])!;
    expect(r.rows.length).toBe(12);
  });

  test("narration centred around the date line (SBI), balance with CR", () => {
    const txs: Tx[] = [
      {
        d: "12-04-2025",
        narr: ["DEP TFR", "IMPS/510216786143/ICI-"],
        in: 170000,
        bal: "1,70,000.00",
      },
      {
        d: "12-04-2025",
        narr: ["MAB CHGSBCH", ""],
        out: 2167.94,
        bal: "1,67,832.06",
      },
      {
        d: "15-04-2025",
        narr: ["WDL TFR", "TRANSFER TO"],
        out: 111707,
        bal: "56,125.06",
      },
      {
        d: "16-04-2025",
        narr: ["DEP TFR", "TRANSFER FROM"],
        in: 50000,
        bal: "1,06,125.06",
      },
    ];
    const r = rowsFromPositioned([centredPage(txs)])!;
    expect(names(r)).toEqual([
      "2025-04-12 in 170000 170000",
      "2025-04-12 out 2167.94 167832.06",
      "2025-04-15 out 111707 56125.06",
      "2025-04-16 in 50000 106125.06",
    ]);
    expect(r.rows[0]!.description).toBe("DEP TFR IMPS/510216786143/ICI-");
  });

  test("an overdraft account: DR printed beside the balance makes it negative, and direction follows", () => {
    const txs: Tx[] = [
      {
        d: "17-04-2025",
        narr: ["DEP TFR", "TRANSFER FROM"],
        in: 150000,
        bal: "4,92,94,237.40",
      },
      {
        d: "25-04-2025",
        narr: ["DEP TFR", "TRANSFER FROM"],
        in: 310000,
        bal: "4,89,84,237.40",
      },
      {
        d: "30-04-2025",
        narr: ["TO INTEREST", ""],
        out: 489082,
        bal: "4,94,73,319.40",
      },
      {
        d: "30-04-2025",
        narr: ["OD CHARGE", ""],
        out: 644,
        bal: "4,94,73,963.40",
      },
    ];
    const r = rowsFromPositioned([centredPage(txs, true)])!;
    expect(r.rows.map((x) => x.balance)).toEqual([
      -49294237.4, -48984237.4, -49473319.4, -49473963.4,
    ]);
    expect(r.rows.map((x) => x.direction)).toEqual(["in", "in", "out", "out"]);
  });

  test("left-aligned amounts, split date, id and serial left of the date, narration broken mid-number (ICICI)", () => {
    const txs: Tx[] = [
      {
        d: "01-Apr-2025",
        narr: ["UPI/509121", "513847/tran", "sportTrips/8"],
        in: 30598,
        bal: "8718700.96",
      },
      {
        d: "01-Apr-2025",
        narr: ["UPI/RVSL50", "9121513847/t"],
        out: 30598,
        bal: "8688102.96",
      },
      {
        d: "02-Apr-2025",
        narr: ["NEFT-ABC", "DEF"],
        in: 20000,
        bal: "8708102.96",
      },
    ];
    const r = rowsFromPositioned([leftAlignedPage(txs)])!;
    expect(names(r)).toEqual([
      "2025-04-01 in 30598 8718700.96",
      "2025-04-01 out 30598 8688102.96",
      "2025-04-02 in 20000 8708102.96",
    ]);
    expect(r.rows[0]!.description).toContain("UPI/509121513847/tran");
    expect(r.rows[0]!.description).not.toContain("S610");
  });

  test("a statement listed newest first comes back oldest first", () => {
    const newestFirst: Tx[] = [
      { d: "05/04/25", narr: ["ACH D- KMBL"], out: 138939, bal: "880,826.04" },
      {
        d: "04/04/25",
        narr: ["IMPS-509416212341-SRI"],
        in: 418840,
        bal: "1,019,765.04",
      },
      {
        d: "03/04/25",
        narr: ["RTGS CR-ICIC0000011-X"],
        in: 600000,
        bal: "600,925.04",
      },
      {
        d: "02/04/25",
        narr: ["IMPS-509214377036-SRI"],
        out: 190000,
        bal: "925.04",
      },
    ];
    const r = rowsFromPositioned([trailingPage(newestFirst)])!;
    expect(r.order).toBe("newest_first");
    expect(r.rows.map((x) => x.date)).toEqual([
      "2025-04-02",
      "2025-04-03",
      "2025-04-04",
      "2025-04-05",
    ]);
    expect(r.rows.map((x) => x.direction)).toEqual(["out", "in", "in", "out"]);
  });

  test("something that is not a statement table is left to the other readers", () => {
    expect(
      rowsFromPositioned([[it("Hello", 10, 10), it("World", 50, 10)]]),
    ).toBeNull();
  });
});
