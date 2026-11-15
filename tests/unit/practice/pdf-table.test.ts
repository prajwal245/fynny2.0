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
    // As the real ICICI statement prints it: the account is overdrawn, the amount sits under Withdrawal (Dr) or Deposit (Cr), and
    // the balance's minus is a separate "-" on the line above the figure.
    const txs: Tx[] = [
      {
        d: "01-Apr-2025",
        narr: ["UPI/509121", "513847/tran", "sportTrips/8"],
        out: 30598,
        bal: "8718700.96",
      },
      {
        d: "01-Apr-2025",
        narr: ["UPI/RVSL50", "9121513847/t"],
        in: 30598,
        bal: "8688102.96",
      },
      {
        d: "02-Apr-2025",
        narr: ["NEFT-ABC", "DEF"],
        in: 20000,
        bal: "8668102.96",
      },
    ];
    const r = rowsFromPositioned([leftAlignedPage(txs)])!;
    expect(names(r)).toEqual([
      "2025-04-01 out 30598 -8718700.96",
      "2025-04-01 in 30598 -8688102.96",
      "2025-04-02 in 20000 -8668102.96",
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

/* ── Layouts from the 13 Nov retest (made-up figures, laid out the way the real statements are) ── */

describe("what the 13 Nov retest found", () => {
  const head = (y: number, debitX: number, creditX: number) => [it("Post", 37, y + 6), it("Date", 47, y - 5), it("Details", 213, y), it("Chq.No.", 338, y), it("Debit", debitX, y, 27), it("Credit", creditX, y, 32), it("Balance", 528, y, 37)];

  test("an amount the PDF wraps onto a second line is read whole (ICICI ₹1 crore RTGS)", () => {
    const items: PosItem[] = [it("S.no", 50, 800), it("Date", 162, 800), it("Description", 296, 800), it("Withdrawal", 363, 800), it("Deposit", 431, 800), it("Balance", 498, 800)];
    const row = (n: number, y: number, d: string, narr: string, col: number, amt: string, bal: string, minus: boolean, wrap?: string) => {
      items.push(it(String(n), 50, y, 5), it(d.slice(0, 7), 162, y, 30), it(d.slice(7), 162, y - 12, 19), it(narr, 296, y, 44), it(amt, col, y, 40));
      if (wrap) items.push(it(wrap, col, y - 12, 5));
      if (minus) items.push(it("-", 498, y, 3), it(bal, 498, y - 12, 45));
      else items.push(it(bal, 498, y, 45));
    };
    row(1, 780, "16-Dec-2025", "UPI/1087", 363, "21053.00", "8048187.48", true);
    row(2, 700, "16-Dec-2025", "RTGS-INDBR", 431, "10000000.0", "1951812.52", false, "0");
    row(3, 620, "16-Dec-2025", "UPI/1088", 363, "54025.00", "1897787.52", false);
    const r = rowsFromPositioned([items])!;
    expect(names(r)).toEqual(["2025-12-16 out 21053 -8048187.48", "2025-12-16 in 10000000 1951812.52", "2025-12-16 out 54025 1897787.52"]);
  });

  test("the Withdrawal and Deposit headings decide direction when an overdrawn account is printed with no sign at all", () => {
    // Every balance is really negative: a withdrawal makes the printed figure bigger.
    const txs: Tx[] = [
      { d: "02/04/25", narr: ["LOAN EMI"], out: 1000, bal: "501,000.00" },
      { d: "03/04/25", narr: ["NEFT IN"], in: 200, bal: "500,800.00" },
      { d: "04/04/25", narr: ["CHARGES"], out: 50, bal: "500,850.00" },
      { d: "05/04/25", narr: ["UPI OUT"], out: 150, bal: "501,000.00" },
    ];
    const r = rowsFromPositioned([trailingPage(txs)])!;
    expect(names(r)).toEqual(["2025-04-02 out 1000 -501000", "2025-04-03 in 200 -500800", "2025-04-04 out 50 -500850", "2025-04-05 out 150 -501000"]);
    expect(r.notes.join(" ")).toMatch(/without a minus sign/);
  });

  test("Indian Bank: centred narration, a column that drifts from page to page, summary and footer rows left out", () => {
    const page = (debitRight: number, rows: { y: number; d: string; above: string[]; below: string[]; out?: string; in?: string; bal: string }[], dCount: string) => {
      const items: PosItem[] = [...head(521, debitRight - 40, 445)];
      for (const t of rows) {
        t.above.forEach((a, k) => items.push(it(a, 128, t.y + 5 + 10 * (t.above.length - k - 1) + 1)));
        items.push(it(t.d, 37, t.y, 43), it(t.d, 82, t.y, 43));
        if (t.out) items.push(right(t.out, debitRight, t.y));
        if (t.in) items.push(right(t.in, 488, t.y));
        items.push(right(t.bal, 566, t.y));
        t.below.forEach((b, k) => items.push(it(b, 128, t.y - 5 - 10 * k)));
      }
      const last = rows[rows.length - 1]!.y;
      items.push(it("Carried", 128, last - 40), it("Forward", 177, last - 40), right("999.00Cr", 566, last - 40));
      items.push(it("Statement", 37, last - 68), it("Dr.", 120, last - 72), it("Count:", 145, last - 72), it(dCount, 182, last - 72), it("Cr.", 199, last - 72), it("Count:", 224, last - 72), it("1", 261, last - 72), right("5580655.03", 358, last - 72), right("10059760.00", 504, last - 72), it("Summary", 37, last - 77));
      items.push(it("In Case Your Account Is Operated By A Letter Of Authority/Power Of Attorney Holder, Please Check The", 34, last - 100, 500), it("Transaction With Extra Care.", 34, last - 113, 138));
      return items;
    };
    const p1 = page(432, [
      { y: 470, d: "15/07/25", above: ["STD0000000010 /SATKAARIKA", "ENTERPRISES PVT LTD /TRAN"], below: ["SFER FROM 8014561633 BRANCH :", "VISAKHAPATNAM"], in: "5029880.00", bal: "5029880.00Cr" },
      { y: 426, d: "15/07/25", above: ["TRANSFER TO 89634000339 Txn Amt.", "48,903.00 Charges. 5.61 /N"], below: ["EFT/HDFC/IDIBN52025071500249134", "SRINIV"], out: "48908.61", bal: "4980971.39Cr" },
    ], "1");
    // Page 2 prints the Debit column 21 points further right.
    const p2 = page(453, [
      { y: 470, d: "16/07/25", above: ["TRANSFER TO 89634000339 Txn Amt.", "4,35,120.00 Charges. 29.21"], below: ["/NEFT/KKBK/IDIBN52025071500249222", "MANG"], out: "435149.21", bal: "4545822.18Cr" },
      { y: 426, d: "17/07/25", above: [], below: [], out: "5000.00", bal: "4540822.18Cr" },
      { y: 400, d: "18/07/25", above: [], below: [], out: "822.18", bal: "4540000.00Cr" },
    ], "3");
    const r = rowsFromPositioned([p1, p2])!;
    expect(names(r)).toEqual([
      "2025-07-15 in 5029880 5029880",
      "2025-07-15 out 48908.61 4980971.39",
      "2025-07-16 out 435149.21 4545822.18",
      "2025-07-17 out 5000 4540822.18",
      "2025-07-18 out 822.18 4540000",
    ]);
    expect(r.rows[0]!.description).toContain("SFER FROM 8014561633");
    expect(r.rows[1]!.description).toContain("Txn Amt.");
    expect(r.rows[1]!.description).not.toContain("SFER FROM");
    const all = r.rows.map((x) => x.description).join(" ");
    expect(all).not.toMatch(/Statement|Summary|Count|Extra Care|Carried/);
  });

  test("a transaction id and reference code printed before the narration stay out of it, and the footer does not join the last line (Union Bank)", () => {
    const items: PosItem[] = [it("Date", 73, 447), it("Tran", 131, 447), it("Ref", 169, 447), it("Num", 189, 447), it("Particulars", 222, 447), it("Debit", 381, 447, 24), it("Amt.", 410, 447, 19), it("Credit", 477, 447, 29), it("Amt.", 511, 447, 19), it("Balance", 578, 447, 34), it("Amt.", 616, 447, 19)];
    const line = (y: number, d: string, id: string | null, ref: string | null, narr: string, out: string | null, inn: string | null, bal: string) => {
      items.push(it(d, 73, y, 48));
      if (id) items.push(it(id, 126, y, 38));
      if (ref) items.push(it(ref, 169, y, 34));
      items.push(it(narr, 222, y, 120));
      if (out) items.push(right(out, 433, y));
      if (inn) items.push(right(inn, 530, y));
      items.push(right(bal, 635, y));
    };
    line(400, "17-04-2025", "Y9084760", "ICI", "IMPSAB/510711741970/SRI", null, "21,687.00", "36,910.53CR");
    line(392, "18-04-2025", "V1004007", "259edU3", "UPIAB/108698566055/CR/SRI", null, "1.00", "36,911.53CR");
    line(384, "19-04-2025", "X1326288", "d65f7U3", "UPIAR/681832720266/DR/SIR", "1,000.00", null, "35,911.53CR");
    items.push(it("-".repeat(120), 73, 376, 634), it("Total(Curr.", 117, 368), it("INR)", 174, 368), right("1,000.00", 443, 368), right("21,688.00", 549, 368), right("35,911.53CR", 664, 368));
    items.push(it("Manager/Chief", 453, 320), it("Manager", 520, 320), it("Date", 453, 312), it(":22-09-2026", 477, 312));
    const r = rowsFromPositioned([items])!;
    expect(r.rows.map((x) => x.description)).toEqual(["IMPSAB/510711741970/SRI", "UPIAB/108698566055/CR/SRI", "UPIAR/681832720266/DR/SIR"]);
    expect(r.rows.map((x) => x.direction)).toEqual(["in", "in", "out"]);
    expect(r.rows[1]!.reference).toContain("259edU3");
  });
});
