import { describe, expect, it } from "vitest";
import { rowsFromStatementText } from "@/lib/practice/extract/textStatement";

const body = [
  "Date Narration Chq/Ref No Withdrawal Deposit Balance",
  "01/12/2025 Opening Balance 1,00,000.00",
  "02/12/2025 NEFT SUNDARA TEXTILES UTR123 50,000.00 1,50,000.00",
  "30/12/2025 SALARY DEC-25 BULK NEFT PMT 90,000.00 60,000.00",
];
describe("statement footers are not part of a transaction", () => {
  it("a footer line under the last transaction is dropped", () => {
    const r = rowsFromStatementText([...body, "This is a computer-generated statement and needs no signature."].join("\n"));
    const last = r.rows[r.rows.length - 1];
    expect(last.description).toMatch(/SALARY DEC-25 BULK NEFT PMT/);
    expect(last.description).not.toMatch(/computer|signature/i);
  });
  it("a footer on the same line after a slash is cut off, and text after a footer is ignored", () => {
    const r = rowsFromStatementText([...body, "Page 2 of 2", "Registered office: Mumbai", "Customer care 1800 000 000"].join("\n"));
    const last = r.rows[r.rows.length - 1];
    expect(last.description).not.toMatch(/page|office|customer/i);
  });
  it("an ordinary narration continuation is still attached", () => {
    const r = rowsFromStatementText([...body.slice(0, 3), "RAO STEELS INVOICE 44", "30/12/2025 SALARY DEC-25 BULK NEFT PMT 90,000.00 60,000.00"].join("\n"));
    expect(r.rows[0].description).toMatch(/RAO STEELS INVOICE 44/);
  });
});
