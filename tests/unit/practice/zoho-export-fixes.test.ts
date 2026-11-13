import { describe, expect, it } from "vitest";
import {
  buildZohoExport,
  type ExportException,
} from "@/lib/practice/zohoExport";

const ex = (
  id: string,
  narration: string,
  amount: number,
): ExportException => ({
  id,
  clientId: "c1",
  date: "2025-10-12",
  amount,
  narration,
  side: "bank",
  status: "open",
});

describe("Zoho CSV for what the books are missing", () => {
  const list = [
    ex("1", "BANK CHARGES GST ON CHG", -590),
    ex("2", "NEFT-RAJ TRADERS-INV-2601", -1200),
    ex("3", "NEFT CR-KAVERI TEXTILES-INV-2601", 5000),
  ];
  const opts = {
    clientId: "c1",
    clientName: "Sahyadri",
    period: "2025-10",
    bankAccount: "HDFC Bank A/c 4417",
  };

  it("fills Paid Through with the linked bank, so Zoho posts to the bank and not Undeposited Funds", () => {
    const rows = buildZohoExport("expenses", list, opts)
      .csv.trim()
      .split("\r\n");
    expect(rows[0]).toContain("Paid Through");
    expect(rows[1]).toContain("HDFC Bank A/c 4417");
    expect(rows[2]).toContain("HDFC Bank A/c 4417");
  });

  it("a bank charge has no vendor (no vendor named after the narration is created)", () => {
    const first = buildZohoExport("expenses", list, opts)
      .csv.trim()
      .split("\r\n")[1]!;
    expect(first).toContain("Bank Fees and Charges");
    expect(first).not.toMatch(/BANK CHARGES GST ON CHG,/);
    expect(first.split(",")[4]).toBe("");
  });

  it("a payment to a party keeps its vendor, and receipts are deposited to the bank", () => {
    expect(buildZohoExport("expenses", list, opts).csv).toContain(
      "RAJ TRADERS",
    );
    expect(
      buildZohoExport("receipts", list, opts).csv.trim().split("\r\n")[1],
    ).toContain("HDFC Bank A/c 4417");
  });
});
