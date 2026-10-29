/** Narrations as banks actually print them, and where each lands in the MIS. */
import { describe, expect, it } from "vitest";
import { misBucket, type MisBucket } from "@/lib/practice/narrate/flows";

const CASES: [string, "in" | "out", string, MisBucket][] = [
  ["SBI", "in", "BY TRANSFER-NEFT*HDFC0000123*N230250001*KAVERI TEXTILES--", "revenue"],
  ["SBI", "out", "TO TRANSFER-UPI/DR/412345678901/MANDI STEEL/SBIN/q123@sbi/UPI--", "expense"],
  ["SBI", "in", "CREDIT INTEREST--", "other_income"],
  ["SBI", "out", "DEBIT-ATMCard AMC 22Aug--", "expense"],
  ["SBI", "out", "TO TRANSFER-INB RTGS-GST PMT CPIN 26070012345--", "tax_payment"],
  ["HDFC", "out", "NEFT DR-ICIC0004321-SHIVALIK ISPAT-SIP/511", "expense"],
  ["HDFC", "in", "NEFT CR-SBIN0001234-HARYANA STEEL FURNITURE-MST/25-26/017", "revenue"],
  ["HDFC", "out", "ACH D- TP ACH BAJAJ FINANCE-5512", "expense"],
  ["HDFC", "out", "CHQ PAID-MICR CTS-NO-558137-DOABA", "expense"],
  ["HDFC", "out", "EMI 4455 CHQ RET CHGS", "expense"],
  ["ICICI", "in", "MMT/IMPS/423512345678/KAVERI TEXTILES/HDFC0000001", "revenue"],
  ["ICICI", "out", "BIL/INFT/001234567/ELECTRICITY BESCOM", "expense"],
  ["ICICI", "out", "INF/INFT/012345678/SALARY AUG 2025", "expense"],
  ["ICICI", "in", "INT.PD:01-07-2025 to 30-09-2025", "other_income"],
  ["ICICI", "out", "GST @18% ON CHARGES AUG", "expense"],
  ["Kotak", "in", "UPI/412345678901/CR/SUNDAR AUTO/kkbk", "revenue"],
  ["Kotak", "out", "NACH-DR-ICICI PRU LIFE INSURANCE", "expense"],
  ["Kotak", "out", "TDS 194C CHALLAN ITNS 281 AUG", "tax_payment"],
  ["Kotak", "out", "IT REFUND INTEREST REVERSED", "expense"],
  ["Yes Bank", "in", "NEFT-YESB0000001-ORION IT SERVICES-INV 2604", "revenue"],
  ["Yes Bank", "out", "ACH DR-GST PAYMENT CHALLAN", "tax_payment"],
  ["Yes Bank", "out", "INTEREST DEBIT OD A/C 0099", "expense"],
  ["Yes Bank", "in", "TRF FROM OWN ACCOUNT 9200", "transfer"],
  ["Axis", "in", "UPI/P2M/412345678901/Kaveri Textiles/Payment", "revenue"],
  ["Axis", "out", "PRCR/Amazon Seller Services", "expense"],
  ["Axis", "out", "CLG/CHQ 700123/SHIVALIK ISPAT", "expense"],
];

describe("bank narration styles", () => {
  for (const [bank, dir, text, want] of CASES)
    it(`${bank}: ${text.slice(0, 48)} → ${want}`, () => {
      expect(misBucket({ direction: dir, description: text, category: null, counterparty: null })).toBe(want);
    });
});
