import { describe, expect, it } from "vitest";
import { statedPeriod } from "@/lib/practice/extract/statementPeriod";

describe("the period a statement says it covers", () => {
  it("reads Indian Bank's header, with the two dates on separate lines", () => {
    const t = "Account No : 7856871247\nStatement Date :19-Oct-2026\nStatement From :01-Apr-2025\n To :31-Mar-2026\nStatement Time :10:16:15";
    expect(statedPeriod(t)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
  it("reads the usual wordings", () => {
    expect(statedPeriod("Statement period: 01/04/2025 to 30/06/2025")).toEqual({ from: "2025-04-01", to: "2025-06-30" });
    expect(statedPeriod("Period : From 01-Oct-2026 To 31-Oct-2026")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(statedPeriod("for the period from 1 Apr 2025 to 31 Mar 2026")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
  it("says nothing rather than guess", () => {
    expect(statedPeriod("Opening balance 1,000.00")).toBeNull();
    expect(statedPeriod("Statement from 31-12-2025 to 01-01-2025")).toBeNull();
    expect(statedPeriod("From 01-01-2000 to 01-01-2026")).toBeNull();
  });
});
