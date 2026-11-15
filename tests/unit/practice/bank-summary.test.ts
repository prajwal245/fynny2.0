import { describe, expect, it } from "vitest";
import { readBankSummary, tieOut } from "@/lib/practice/extract/bankSummary";
import type { PosItem } from "@/lib/practice/extract/pdfTable";

const it_ = (str: string, x: number, y: number, width = str.length * 5): PosItem => ({ str, x, y, width });
const line = (y: number, parts: [string, number][]) => parts.map(([s, x]) => it_(s, x, y));

/** Lines as the reader hands them over: amount and direction only. */
const lines = (outs: number[], ins: number[]) => [...outs.map((a) => ({ amount: a, direction: "out" as const })), ...ins.map((a) => ({ amount: a, direction: "in" as const }))];

describe("what the bank prints to tick against", () => {
  it("HDFC: a summary row under its headings gives counts, totals and both balances", () => {
    const page = [
      ...line(484, [["STATEMENT SUMMARY :-", 68]]),
      ...line(473, [["Opening Balance", 132], ["Dr Count", 290], ["Cr Count", 361], ["Debits", 425], ["Credits", 501], ["Closing Bal", 572]]),
      ...line(462, [["190,925.04", 144], ["3", 300], ["2", 373], ["600.00", 413], ["1,500.00", 491], ["191,825.04", 576]]),
    ];
    const s = readBankSummary([page])!;
    expect(s).toMatchObject({ source: "summary_row", opening: 190925.04, drCount: 3, crCount: 2, debits: 600, credits: 1500, closing: 191825.04 });
    const t = tieOut(s, { lines: lines([100, 200, 300], [500, 1000]), opening: 190925.04, closing: 191825.04 });
    expect(t.tied).toBe(true);
    expect(t.checks.map((c) => c.label)).toEqual(["The bank's own count", "The bank's own totals", "The bank's own balances"]);
    expect(t.checks[0]!.detail).toContain("every line is accounted for");
  });

  it("a missing line is named: how many, which way, and how much", () => {
    const s = readBankSummary([[
      ...line(473, [["Opening Balance", 132], ["Dr Count", 290], ["Cr Count", 361], ["Debits", 425], ["Credits", 501], ["Closing Bal", 572]]),
      ...line(462, [["190,925.04", 144], ["3", 300], ["2", 373], ["600.00", 413], ["1,500.00", 491], ["191,825.04", 576]]),
    ]])!;
    const t = tieOut(s, { lines: lines([100, 200], [500, 1000]), opening: 190925.04, closing: 191825.04 });
    expect(t.tied).toBe(false);
    expect(t.checks[0]).toMatchObject({ ok: false });
    expect(t.checks[0]!.detail).toContain("1 debit missing");
    expect(t.checks[1]!.detail).toContain("₹300.00 short");
  });

  it("Indian Bank: only the LAST page's summary counts (earlier pages print page totals), and a Dr count printed on a neighbouring line is found", () => {
    const first = line(189, [["Dr.", 120], ["Count:", 145], ["3", 182], ["Cr.", 199], ["Count:", 224], ["2", 261], ["5580655.03", 296], ["10059760.00", 436]]);
    const last = [...line(523, [["Cr.", 199], ["Count:", 224], ["18", 261], ["144149180.88", 296], ["144169760.00", 436]]), ...line(518, [["Summary", 37], ["Count:", 145], ["25", 182]])];
    const s = readBankSummary([first, last])!;
    expect(s).toMatchObject({ source: "page_counts", drCount: 25, crCount: 18, debits: 144149180.88, credits: 144169760 });
    // A statement whose last page prints no summary is not compared with an earlier page's totals.
    expect(readBankSummary([last, [it_("nothing here", 50, 500)]])).toBeNull();
  });

  it("Union Bank: the credit total includes the opening balance, and says so", () => {
    const p1 = line(416, [["Account", 117], ["Opening", 155], ["balance", 193], [":", 232], ["15223.53CR", 280]]);
    const total = line(392, [["Total(Curr.", 117], ["INR)", 174], [":", 198], ["1,000.00", 376], ["1,015,223.53", 482], ["20,000.00CR", 597]]);
    const s = readBankSummary([p1, total])!;
    expect(s).toMatchObject({ source: "total_row", debits: 1000, credits: 1015223.53, opening: 15223.53, closing: 20000, creditsMayIncludeOpening: true });
    const t = tieOut(s, { lines: lines([1000], [1000000]), opening: 15223.53, closing: 20000 });
    expect(t.tied).toBe(true);
    expect(t.checks[0]!.detail).toContain("counts the opening balance");
  });

  it("ICICI: lines are numbered from 1 and the heading is printed on the first page only; pages are counted", () => {
    const head = [it_("S.no", 53, 469), it_("Description", 296, 469), ...line(300, [["Page 1 of", 498], ["2", 542]])];
    const p1 = [...head, ...[1, 2, 3].map((n, k) => it_(String(n), 50, 427 - k * 60))];
    const p2 = [...[4, 5].map((n, k) => it_(String(n), 50, 780 - k * 60)), ...line(100, [["Page 2 of", 498], ["2", 542]])];
    const s = readBankSummary([p1, p2])!;
    expect(s).toMatchObject({ source: "serials", serialMax: 5, pagesPrinted: 2, pagesInFile: 2 });
    expect(s.serialMissing).toEqual([]);
    expect(tieOut(s, { lines: lines([1, 2, 3, 4, 5], []), opening: null, closing: null }).tied).toBe(true);
    // One line lost: the number it carried is missing, and the count is short.
    const lost = tieOut({ ...s, serialMissing: [4] }, { lines: lines([1, 2, 3, 5], []), opening: null, closing: null });
    expect(lost.tied).toBe(false);
    expect(lost.checks[0]!.detail).toContain("Numbers not in the file: 4");
    // A file with fewer pages than the statement says is flagged.
    expect(tieOut({ ...s, pagesInFile: 1 }, { lines: lines([1, 2, 3, 4, 5], []), opening: null, closing: null }).checks.find((c) => c.label === "Pages")!.ok).toBe(false);
  });

  it("a bank that prints nothing to compare adds nothing, and a column of other numbers is not mistaken for line numbers", () => {
    expect(readBankSummary([[it_("Date", 40, 500), it_("Narration", 100, 500), it_("12", 300, 450)]])).toBeNull();
    expect(tieOut(null, { lines: [], opening: null, closing: null })).toEqual({ checks: [], tied: null });
    const odd = [it_("S.no", 53, 469), ...[7, 9, 12, 40, 41].map((n, k) => it_(String(n), 50, 427 - k * 20))];
    expect(readBankSummary([odd])).toBeNull();
  });
});
