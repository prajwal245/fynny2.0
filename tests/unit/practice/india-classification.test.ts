/**
 * Golden cases: how common Indian bank narrations land in the MIS. Each row is a
 * rule a CA would apply by hand; a failure here is a number that would be wrong in a report.
 */
import { describe, expect, it } from "vitest";
import { misBucket, type MisBucket } from "@/lib/practice/narrate/flows";

const L = (direction: "in" | "out", description: string, category: string | null = null) => ({ direction, description, category, counterparty: null });

const CASES: [string, "in" | "out", string, MisBucket][] = [
  // receipts
  ["customer NEFT", "in", "NEFT CR-KAVERI TEXTILES PVT LTD-INV-2601", "revenue"],
  ["customer UPI", "in", "UPI/CR/412345678901/Sundar Auto/okaxis", "revenue"],
  ["cheque clearing", "in", "CLG CHQ 558137 DOABA CONSTRUCTION CO", "revenue"],
  ["savings interest", "in", "INT.PD:01-07-2025 to 30-09-2025", "other_income"],
  ["credit interest", "in", "CREDIT INTEREST CAPITALISED", "other_income"],
  ["FD interest", "in", "FIXED DEPOSIT INTEREST CREDIT", "other_income"],
  ["interest on IT refund", "in", "INTEREST ON INCOME TAX REFUND", "other_income"],
  ["IT refund", "in", "INCOME TAX REFUND ITNS 280", "refund"],
  ["GST refund", "in", "GST REFUND RFD-01", "refund"],
  ["customer advance", "in", "ADVANCE FROM MEERA TEXTILES", "advance_received"],
  ["loan disbursal", "in", "LOAN DISBURSEMENT HDFC TERM LOAN", "loan_capital"],
  ["capital introduced", "in", "CAPITAL INTRODUCED RAJIV MEHTA", "loan_capital"],
  ["return of payment", "in", "RTGS RETURN - BENEFICIARY ACCOUNT CLOSED", "refund"],
  ["FD maturity principal", "in", "FD CLOSURE PRINCIPAL", "transfer"],
  // payments
  ["supplier RTGS", "out", "RTGS-MANDI GOBINDGARH STEEL ROLLING-MGS/512", "expense"],
  ["rent", "out", "SHOP RENT - GURU NANAK MARKET", "expense"],
  ["salary", "out", "NEFT-SALARY AUG 2025-STAFF", "expense"],
  ["bank charges", "out", "BANK CHARGES GST ON CHG", "expense"],
  ["cheque return charges", "out", "CHQ RETURN CHARGES INCL GST", "expense"],
  ["SMS charges", "out", "SMS CHGS 01-07-25 TO 30-09-25", "expense"],
  ["GST payment", "out", "GST CPIN 85139468156956", "tax_payment"],
  ["GST challan", "out", "GST PMT CPIN 26070012345", "tax_payment"],
  ["TDS payment", "out", "TDS PAYMENT CHALLAN 281 ITNS", "tax_payment"],
  ["advance tax", "out", "ADVANCE TAX AY 2026-27 OLTAS", "tax_payment"],
  ["PF", "out", "EPFO PF CONTRIBUTION AUG", "expense"],
  ["ESI", "out", "ESIC CONTRIBUTION", "expense"],
  ["supplier advance", "out", "NEFT DR-MEERA TEXTILES-ADVANCE", "advance_paid"],
  ["advertising is not an advance", "out", "GOOGLE ADVERTISING SERVICES", "expense"],
  ["EMI", "out", "EMI LOAN A/C 4455 HDFC", "loan_capital"],
  ["interest on loan is an expense", "out", "LOAN INTEREST DEBITED", "expense"],
  ["interest on cash credit is an expense", "out", "INT ON CC A/C 0099", "expense"],
  ["overdraft interest", "out", "OD INTEREST CHARGED", "expense"],
  ["proprietor drawings are capital, not a transfer", "out", "SELF - DRAWINGS RAJIV MEHTA", "loan_capital"],
  ["own account transfer", "out", "TRANSFER TO OWN A/C 9200", "transfer"],
  ["FD booking", "out", "FD BOOKING 12M", "transfer"],
  ["director repayment", "out", "DIRECTORS LOAN REPAYMENT", "loan_capital"],
  ["insurance", "out", "LIC PREMIUM", "expense"],
  ["cheque return debit (pair handled elsewhere)", "out", "CHQ RETURN 889466 INSUFFICIENT FUNDS SHARMA", "expense"],
  ["professional tax is statutory expense", "out", "PROFESSIONAL TAX KARNATAKA", "expense"],
  ["gateway fee", "out", "RAZORPAY MDR FEE", "expense"],
];

describe("Indian narrations land in the right MIS bucket", () => {
  for (const [name, dir, text, want] of CASES) {
    it(`${name}: ${text.slice(0, 40)} → ${want}`, () => {
      expect(misBucket(L(dir, text))).toBe(want);
    });
  }
});
