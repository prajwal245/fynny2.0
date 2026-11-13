import { describe, expect, it } from "vitest";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";

const t = (
  id: string,
  side: "bank" | "books",
  ref12: string,
  party: string,
  amount = 500,
): ReconTxn => ({
  id,
  side,
  direction: "in",
  amount,
  txn_date: "2025-08-12",
  counterparty: null,
  reference: null,
  category: null,
  description:
    side === "bank"
      ? `UPI/CR/${ref12}/${party}/SBIN`
      : `Receipt - UPI Ref ${ref12} ${party}`,
});

describe("many same-amount UPI receipts on one day", () => {
  const refs = [
    "412345678901",
    "412345678902",
    "412345678903",
    "412345678904",
    "412345678905",
  ];
  const names = ["Asha", "Ravi", "Meena", "Kiran", "Sumit"];
  const bank = refs.map((r, i) => t(`bk${i}`, "bank", r, names[i]!));
  // books written in a different order and with blank party for some
  const books = [...refs]
    .reverse()
    .map((r, i) =>
      t(`bo${i}`, "books", r, i % 2 ? "" : names[refs.length - 1 - i]!),
    );
  const out = reconcile(bank, books);

  it("matches every receipt to its own entry by reference, no exceptions", () => {
    expect(out.matches).toHaveLength(5);
    expect(out.exceptions).toHaveLength(0);
    for (const m of out.matches) {
      const bi = Number(m.bank_txn_id.slice(2));
      const bo = books.find((b) => b.id === m.book_txn_ids[0])!;
      expect(bo.description).toContain(refs[bi]!);
    }
  });
  it("a book entry with no bank line stays one real exception", () => {
    const o = reconcile(bank, [
      ...books,
      {
        ...t("extra", "books", "999999999999", "Zed", 24373),
        txn_date: "2025-08-30",
      },
    ]);
    expect(o.matches).toHaveLength(5);
    expect(o.exceptions).toHaveLength(1);
  });
});
