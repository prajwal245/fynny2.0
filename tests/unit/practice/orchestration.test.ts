import { describe, expect, it } from "vitest";
import {
  applyMemory,
  lessonFrom,
  narrationPattern,
  REMEMBERED_CONFIDENCE,
  type Memory,
  type MemoryRow,
} from "@/lib/practice/memory";
import {
  autoChaseDue,
  isRetryable,
  MAX_EXTRACT_ATTEMPTS,
  nextAttemptAt,
  periodsOf,
  readyForMis,
} from "@/lib/practice/orchestrate";

const row = (over: Partial<MemoryRow> = {}): MemoryRow => ({
  route: "review",
  confidence: 0.55,
  reason: "Could not tell which way the money moved",
  date: "2026-10-04",
  amount: 12500,
  direction: null,
  description: "STRIPE PAYOUT PO_1NX93K 04/10",
  counterparty: null,
  raw_text: "04/10/2026,STRIPE PAYOUT PO_1NX93K 04/10,,12500.00,",
  ...over,
});

const stripe: Memory = {
  id: "m1",
  pattern: "stripe payout",
  lesson: { direction: "in", counterparty: "Stripe Payments India" },
  times_taught: 1,
};

describe("narrationPattern", () => {
  it("keeps the words that repeat every month and drops dates, amounts and references", () => {
    expect(narrationPattern("NEFT CR-ICIC0004321-VIREO FOODS LLP-09/09")).toBe("neft vireo foods llp");
    expect(narrationPattern("NEFT CR-ICIC0009911-VIREO FOODS LLP-10/10")).toBe("neft vireo foods llp");
    expect(narrationPattern("STRIPE PAYOUT PO_1NX93K 04/10")).toBe("stripe payout");
  });

  it("refuses patterns too thin to recognise a line safely", () => {
    expect(narrationPattern("CHQ 004512")).toBe("");
    expect(narrationPattern("")).toBe("");
    expect(narrationPattern(null)).toBe("");
  });
});

describe("lessonFrom", () => {
  it("remembers the direction and party the person settled on, and a changed description", () => {
    expect(
      lessonFrom(
        { direction: null, counterparty: null, description: "STRIPE PAYOUT" },
        { direction: "in", counterparty: " Stripe Payments India ", description: "Stripe payout (card sales)" },
      ),
    ).toEqual({ direction: "in", counterparty: "Stripe Payments India", description: "Stripe payout (card sales)" });
  });

  it("does not store an unchanged description", () => {
    expect(
      lessonFrom(
        { direction: "out", counterparty: null, description: "RENT OCT" },
        { direction: "out", counterparty: null, description: "RENT OCT" },
      ),
    ).toEqual({ direction: "out" });
  });
});

describe("applyMemory", () => {
  it("settles next month's copy of a corrected line without a person", () => {
    const { rows, applied } = applyMemory([row()], [stripe]);
    expect(rows[0].route).toBe("transaction");
    expect(rows[0].direction).toBe("in");
    expect(rows[0].counterparty).toBe("Stripe Payments India");
    expect(rows[0].confidence).toBe(REMEMBERED_CONFIDENCE);
    expect(rows[0].reason).toBeNull();
    expect(applied).toEqual([{ memoryId: "m1", rowIndex: 0, released: true }]);
  });

  it("never invents a missing amount or date: such rows still go to review", () => {
    const { rows, applied } = applyMemory([row({ amount: null })], [stripe]);
    expect(rows[0].route).toBe("review");
    expect(rows[0].direction).toBe("in");
    expect(applied[0].released).toBe(false);
    expect(applyMemory([row({ date: null })], [stripe]).rows[0].route).toBe("review");
  });

  it("keeps suspected duplicates in review", () => {
    const { rows } = applyMemory([row({ reason: "Identical to row 3 in the same file. Confirm only if genuine." })], [stripe]);
    expect(rows[0].route).toBe("review");
  });

  it("leaves unrelated lines alone", () => {
    const other = row({ description: "RAZORPAY SETTLEMENT 88123", raw_text: "RAZORPAY SETTLEMENT 88123" });
    const { rows, applied } = applyMemory([other], [stripe]);
    expect(rows[0]).toEqual(other);
    expect(applied).toEqual([]);
  });

  it("fills the party on an already confident line without changing its route", () => {
    const { rows, applied } = applyMemory([row({ route: "transaction", confidence: 0.92, direction: "in", reason: null })], [stripe]);
    expect(rows[0].route).toBe("transaction");
    expect(rows[0].confidence).toBe(0.92);
    expect(rows[0].counterparty).toBe("Stripe Payments India");
    expect(applied[0].released).toBe(false);
  });
});

describe("retry with backoff", () => {
  it("retries only temporary failures", () => {
    expect(isRetryable({ code: "needs_ai", message: "No AI provider answered" })).toBe(true);
    expect(isRetryable({ code: "password_protected", message: "PDF is password protected" })).toBe(false);
    expect(isRetryable({ code: "unsupported_type", message: "Unsupported file" })).toBe(false);
    expect(isRetryable({ message: "fetch failed" })).toBe(true);
    expect(isRetryable({ message: "Saving transactions failed: timeout" })).toBe(true);
    expect(isRetryable({ message: "No stored file for this document." })).toBe(false);
  });

  it("waits longer each time and stops after the last attempt", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(nextAttemptAt(1, now)?.toISOString()).toBe("2026-10-01T10:02:00.000Z");
    expect(nextAttemptAt(2, now)?.toISOString()).toBe("2026-10-01T10:10:00.000Z");
    expect(nextAttemptAt(MAX_EXTRACT_ATTEMPTS, now)).toBeNull();
  });
});

describe("pipeline rules", () => {
  it("lists the months a document touched, most recent first", () => {
    expect(periodsOf(["2026-09-03", "2026-10-01", "2026-09-30", null, "bad"])).toEqual(["October 2026", "September 2026"]);
  });

  it("calls a month ready for MIS only when something matched and nothing waits on a person", () => {
    expect(readyForMis({ matched: 5, openExceptions: 0, openReview: 0 })).toBe(true);
    expect(readyForMis({ matched: 5, openExceptions: 1, openReview: 0 })).toBe(false);
    expect(readyForMis({ matched: 5, openExceptions: 0, openReview: 2 })).toBe(false);
    expect(readyForMis({ matched: 0, openExceptions: 0, openReview: 0 })).toBe(false);
  });

  it("chases last month's bank statement from the firm's chase day", () => {
    expect(autoChaseDue(new Date("2026-10-04T08:00:00Z"), 5)).toBeNull();
    expect(autoChaseDue(new Date("2026-10-05T08:00:00Z"), 5)).toBe("September 2026");
    expect(autoChaseDue(new Date("2027-01-20T08:00:00Z"), 5)).toBe("December 2026");
    expect(autoChaseDue(new Date("2026-10-20T08:00:00Z"), null)).toBeNull();
  });
});

describe("partyFromNarration", () => {
  it("finds the party's name inside a bank narration", async () => {
    const { partyFromNarration } = await import("@/lib/practice/memory");
    expect(partyFromNarration("NEFT CR-ICIC0004321-VIREO FOODS LLP-09/09")).toBe("vireo foods llp");
    expect(partyFromNarration("UPI/402911/RAMESH KUMAR/okaxis")).toBe("ramesh kumar okaxis");
    expect(partyFromNarration("CHQ 004512")).toBe("");
  });

  it("gives a name the Recon alias table can find again next month", async () => {
    const { partyFromNarration } = await import("@/lib/practice/memory");
    const { AliasBook } = await import("@/lib/practice/recon/engine");
    const alias = partyFromNarration("NEFT CR-ICIC0004321-VIREO FOODS LLP-09/09");
    const book = new AliasBook([{ alias, canonical: "Receipt — Vireo Foods LLP" }]);
    expect(book.resolve("NEFT CR-ICIC0009911-VIREO FOODS LLP-10/10")).toBe(book.resolve("Receipt — Vireo Foods LLP"));
  });
});

describe("applyMemory safety", () => {
  const lesson: Memory = { id: "m2", pattern: "stripe payout", lesson: { direction: "in" }, times_taught: 3 };
  it("keeps foreign-currency lines with a person (spec: multi-currency is reviewed in v1)", () => {
    expect(applyMemory([row({ currency: "USD" })], [lesson]).rows[0].route).toBe("review");
    expect(applyMemory([row({ reason: "Amount is in USD; multi-currency lines are reviewed by a person" })], [lesson]).rows[0].route).toBe("review");
  });
  it("keeps doubtful amounts with a person", () => {
    expect(applyMemory([row({ reason: "Amount does not appear in the document text" })], [lesson]).rows[0].route).toBe("review");
  });
  it("settles the direction doubt a person already answered", () => {
    const r = row({ reason: "Statement has one unsigned amount column; money in/out was assumed", direction: "out" });
    const out = applyMemory([r], [lesson]).rows[0];
    expect(out.route).toBe("transaction");
    expect(out.direction).toBe("in");
  });
});
