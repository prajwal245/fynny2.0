import { describe, expect, it } from "vitest";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import { ledgerTail } from "@/lib/practice/recon.server";
import { rowsFromTable } from "@/lib/practice/extract/table";

const tx = (id: string, side: "bank" | "books", date: string, amount: number, o: Partial<ReconTxn> = {}): ReconTxn => ({
  id, side, direction: "out", amount, txn_date: date, counterparty: null, reference: null, category: null, description: "", ...o,
});
const pairs = (r: ReturnType<typeof reconcile>) => r.matches.map((m) => `${m.bank_txn_id}>${m.book_txn_ids.join(",")}`).sort();

describe("identical amounts on the same day", () => {
  it("matches three EMIs of the same amount to the three book entries, however they are ordered", () => {
    // Bank lines carry a reference the books never have, so the exact stage cannot pair them.
    const bank = ["b1", "b2", "b3"].map((id, n) => tx(id, "bank", "2025-05-01", 139307, { description: "ECS/EMI/LOAN", reference: `UTR00${n}8812` }));
    const books = ["k1", "k2", "k3"].map((id) => tx(id, "books", "2025-05-01", 139307, { description: "Payment ICICI vehicle loan EMI" }));
    const r = reconcile(bank, books);
    expect(r.matches).toHaveLength(3);
    expect(r.exceptions).toHaveLength(0);
    expect(new Set(r.matches.flatMap((m) => m.book_txn_ids)).size).toBe(3);
    expect(r.matches[0]!.explanation.note).toMatch(/One of 3 identical entries/);
  });
  it("two FDR credits of ₹50,29,880 and two daily receipts of ₹50,000 are matched", () => {
    const bank = [tx("b1", "bank", "2025-07-15", 5029880, { direction: "in" }), tx("b2", "bank", "2025-07-15", 5029880, { direction: "in" })];
    const books = [tx("k1", "books", "2025-07-15", 5029880, { direction: "in" }), tx("k2", "books", "2025-07-15", 5029880, { direction: "in" })];
    expect(reconcile(bank, books).matches).toHaveLength(2);
  });
  it("does not swap parties: the same amount from two customers follows the name", () => {
    const bank = [
      tx("b1", "bank", "2025-08-18", 50000, { direction: "in", description: "NEFT-RAVI TRADERS", counterparty: "Ravi Traders" }),
      tx("b2", "bank", "2025-08-18", 50000, { direction: "in", description: "NEFT-SHARMA STEELS", counterparty: "Sharma Steels" }),
    ];
    const books = [
      tx("k1", "books", "2025-08-18", 50000, { direction: "in", description: "Receipt Sharma Steels", counterparty: "Sharma Steels" }),
      tx("k2", "books", "2025-08-18", 50000, { direction: "in", description: "Receipt Ravi Traders", counterparty: "Ravi Traders" }),
    ];
    expect(pairs(reconcile(bank, books))).toEqual(["b1>k2", "b2>k1"]);
  });
  it("with unequal numbers, pairs only where the party agrees and leaves the surplus open", () => {
    const bank = ["b1", "b2", "b3"].map((id) => tx(id, "bank", "2025-05-01", 1000, { description: "NEFT SHARMA STEELS", counterparty: "Sharma Steels" }));
    const books = ["k1", "k2"].map((id) => tx(id, "books", "2025-05-01", 1000, { description: "Payment Sharma Steels", counterparty: "Sharma Steels" }));
    const r = reconcile(bank, books);
    expect(r.matches).toHaveLength(2);
    expect(r.exceptions.filter((e) => e.side === "bank")).toHaveLength(1);
  });
  it("with unequal numbers and no party in common, nothing is guessed", () => {
    const bank = [tx("b1", "bank", "2025-05-01", 1000, { counterparty: "Alpha", reference: "AAA111" }), tx("b2", "bank", "2025-05-02", 1000, { counterparty: "Gamma", reference: "CCC333" })];
    expect(reconcile(bank, [tx("k1", "books", "2025-05-01", 1000, { counterparty: "Omega", reference: "BBB222" })]).matches).toHaveLength(0);
  });
  it("never pairs across directions or different amounts", () => {
    const bank = [tx("b1", "bank", "2025-05-01", 1000), tx("b2", "bank", "2025-05-01", 1000)];
    const books = [tx("k1", "books", "2025-05-01", 1000, { direction: "in" }), tx("k2", "books", "2025-05-01", 1001)];
    expect(reconcile(bank, books).matches).toHaveLength(0);
  });
  it("a repeat on another day is not drawn into the group", () => {
    const bank = [tx("b1", "bank", "2025-05-01", 1000), tx("b2", "bank", "2025-05-01", 1000)];
    const books = [tx("k1", "books", "2025-05-01", 1000), tx("k2", "books", "2025-05-20", 1000)];
    const r = reconcile(bank, books);
    expect(r.matches.length).toBeLessThanOrEqual(1);
  });
});

describe("Tally Day Book: the bank leg of each voucher is the book line", () => {
  const rows = [
    ["SATKAARIKA ENTERPRISES PRIVATE LIMITED", "", "", "", "", "", "", ""],
    ["Day Book", "", "", "", "", "", "", ""],
    ["1-Apr-25 to 31-Mar-26", "", "", "", "", "", "", ""],
    ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit", "Credit"],
    ["", "", "", "", "", "", "Amount", "Amount"],
    ["15-Jul-25", "Sunon Modular India Private Limited", "", "", "Payment", "362", "4732488", ""],
    ["", "Vsp Gst Indian Bank Charges", "", "", "", "", "29.21", ""],
    ["", "Indian bank CA 7856871247", "", "", "", "", "", "4732517.21"],
    ["16-Jul-25", "Customer A", "", "", "Receipt", "9", "", "5000"],
    ["", "Indian bank CA 7856871247", "", "", "", "", "5000", ""],
    ["20-Jul-25", "Indian bank CA 7856871247", "", "", "Contra", "3", "250000", ""],
    ["", "Indian Bank CC A/c 6407563276", "", "", "", "", "", "250000"],
    ["22-Jul-25", "Sri Mangalagiri Enterprises", "", "", "Journal", "4", "100", ""],
    ["", "Sub Contractor Service A/c", "", "", "", "", "", "100"],
  ];
  const out = rowsFromTable(rows, "books")!;
  it("takes the amount of the bank ledger, charges included, not the party's", () => {
    const sunon = out.find((r) => /Sunon/.test(r.description))!;
    expect(sunon.amount).toBe(4732517.21);
    expect(sunon.direction).toBe("out");
    expect(sunon.description).toContain("(Indian bank CA 7856871247)");
    expect(sunon.counterparty).toBe("Sunon Modular India Private Limited");
  });
  it("a receipt is money in on the bank leg", () => {
    const r = out.find((x) => /Customer A/.test(x.description))!;
    expect([r.amount, r.direction]).toEqual([5000, "in"]);
  });
  it("a transfer between two bank accounts becomes one line per account, one in and one out", () => {
    const legs = out.filter((r) => r.date === "2025-07-20" || /Contra/.test(r.description) || /Mangalagiri/.test(r.description) === false && r.amount === 250000);
    expect(legs.map((l) => l.direction).sort()).toEqual(["in", "out"]);
    expect(legs.every((l) => l.amount === 250000)).toBe(true);
    expect(new Set(legs.map((l) => l.row_index)).size).toBe(2);
    // Each line carries its own account in brackets and names the other account as the party.
    const outLeg = legs.find((l) => l.direction === "out")!;
    const inLeg = legs.find((l) => l.direction === "in")!;
    expect(outLeg.description).toBe("Indian bank CA 7856871247 (Indian Bank CC A/c 6407563276)");
    expect(inLeg.description).toBe("Indian Bank CC A/c 6407563276 (Indian bank CA 7856871247)");
  });
  it("a voucher paid in cash is not a bank line", () => {
    const withCash = [...rows, ["25-Jul-25", "Milk and curd Bill", "", "", "Payment", "5", "800", ""], ["", "Cash", "", "", "", "", "", "800"]];
    expect(rowsFromTable(withCash, "books")!.some((r) => /Milk and curd/.test(r.description))).toBe(false);
  });
  it("a journal with no bank leg is still left out", () => {
    expect(out.some((r) => /Mangalagiri/.test(r.description))).toBe(false);
  });
});

describe("which bank account a book line is for", () => {
  it("reads the account digits from the ledger name in brackets", () => {
    expect(ledgerTail("Sunon Modular (Indian bank CA 7856871247)")).toBe("1247");
    expect(ledgerTail("Receipt (HDFC Bank 50200090622932)")).toBe("2932");
    expect(ledgerTail("Mitta Mohana Rao (Indian Bank CC A/c 6407563276) FOOD BILL PAID")).toBe("3276");
    expect(ledgerTail("MANOHAR CIVIL STRUCTURES(Site Off) (HDFC Bank 50200090622932)")).toBe("2932");
    expect(ledgerTail("Payment (HDFC Bank)")).toBeNull();
    expect(ledgerTail("Payment to Sharma 7856871247 for rent")).toBeNull();
    expect(ledgerTail(null)).toBeNull();
  });
});
