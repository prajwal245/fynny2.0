import { describe, expect, it } from "vitest";
import { looksLikeLoanStatement } from "@/lib/practice/extract/loanStatement";
import { rowsFromStatementText } from "@/lib/practice/extract/textStatement";

describe("loan statements named by product, not by the word 'loan'", () => {
  const head = (product: string) => `STATEMENT OF ACCOUNT\nAccount No : 7185563880   Branch Code : 33\nProduct: ${product}   Phone No :\nInt Rate : 8.25 % P.a   IFSC Code : IDIB000V026\nPost Date Value Date Details Debit Credit Balance\n01/04/25 01/04/25 O.S. PRINCIPAL REPA 22,458.00 4,68,642.34Dr\n30/04/25 30/04/25 INTEREST 3,533.00 4,72,140.34Dr\n`;
  it.each(["MSME_GECLS 1.0_EXTN-REPO", "MSME-TL-RISE-BSD-REPO", "IBVL-F022-PRIMEPLUS"])("%s is a loan account", (p) => {
    expect(looksLikeLoanStatement(head(p))).toBe(true);
  });
  it("a cash-credit account is not", () => {
    expect(looksLikeLoanStatement("STATEMENT OF ACCOUNT\nProduct type : OCC INDSME SEC-MICRO SMAL-REPO\n01/03/26 NEFT CR RAVI 10,000.00 5,10,000.00\n05/03/26 EMI LOAN DEBIT 5,000.00 5,05,000.00\n")).toBe(false);
  });
  it("a narration that mentions a loan EMI does not make a bank statement a loan", () => {
    expect(looksLikeLoanStatement("Statement of Account\nAccount No 123\n01/03/26 ECS EMI TERM LOAN 5,000.00 5,05,000.00\n")).toBe(false);
  });
});

describe("a bank that numbers its lines and prints an overdraft without a sign (Kotak)", () => {
  const text = [
    "Account Statement", "- - Opening Balance - - - 51,289.00",
    "1 18 Apr 2025 SentIMPS510809031551SSSL IMPS-510809326323 5,00,000.00 4,48,711.00",
    "2 18 Apr 2025 Sweep Trf From: 9584214978 5,00,000.00 51,289.00",
    "3 18 Apr 2025 FD PREMAT PROCEEDS: 9584214978 904.00 52,193.00",
  ].join("\n");
  it("reads every line with its direction confirmed by the balance", () => {
    const r = rowsFromStatementText(text);
    expect(r.rows.map((x) => `${x.direction}:${x.amount}`)).toEqual(["out:500000", "in:500000", "in:904"]);
    expect(r.verifiedShare).toBe(1);
  });
});

describe("AI failure reasons for admins", () => {
  it("names depleted billing, a rejected key and a rate limit differently", async () => {
    const { aiWhy } = await import("@/lib/practice/extract/pipeline");
    const call = (error: string) => [{ purpose: "extract_read_text", provider: "gemini", model: "m", input: "", output: null, latency_ms: 1, status: "error" as const, error }];
    expect(aiWhy(true, call('402: {"error":{"message":"Your prepayment credits are depleted."}}')).text).toMatch(/billing has no credit/);
    expect(aiWhy(true, call("400 Please pass a valid API key AIzaSyABCDEFGHIJKLMNOP")).text).not.toMatch(/AIza/);
    expect(aiWhy(true, call("429 quota exceeded")).retryable).toBe(true);
    expect(aiWhy(false, []).text).toMatch(/No AI key/);
  });
});
