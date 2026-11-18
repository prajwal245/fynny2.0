import { describe, expect, it } from "vitest";
import { closeState, deriveSteps, dueOn, mayConfirm, overdueSteps, STEPS, type CloseFacts } from "@/lib/practice/close/steps";

const facts = (o: Partial<CloseFacts> = {}): CloseFacts => ({
  statements: { expected: 2, received: 2, verified: 2, held: 0, failed: 0, notAvailable: 0 },
  recon: { bank: 120, runDone: true },
  exceptions: { open: 3, explained: 3 },
  report: { exists: true, signedOff: false },
  confirmed: {},
  ...o,
});
const by = (steps: ReturnType<typeof deriveSteps>, k: string) => steps.find((s) => s.key === k)!;

describe("month-end close", () => {
  it("has the ten steps of the brief, each auto-checked or confirmed by a named kind of person", () => {
    expect(STEPS).toHaveLength(10);
    expect(STEPS.filter((s) => s.kind === "auto")).toHaveLength(5);
  });
  it("the bank-and-books steps are derived from the system, and close that state on their own", () => {
    const s = deriveSteps("2026-10", facts());
    const c = closeState(s);
    expect(c.bankBooks).toBe(true);
    expect(c.state).toBe("bank_books_closed");
    expect(c.full).toBe(false);
    expect(c.next?.key).toBe("gst");
  });
  it("a missing statement, a held statement or an unexplained exception keeps the month from Bank and Books Closed", () => {
    expect(closeState(deriveSteps("2026-10", facts({ statements: { expected: 2, received: 1, verified: 1, held: 0, failed: 0, notAvailable: 0 } }))).bankBooks).toBe(false);
    const held = deriveSteps("2026-10", facts({ statements: { expected: 2, received: 2, verified: 1, held: 1, failed: 1, notAvailable: 0 } }));
    expect(by(held, "statements_verified")).toMatchObject({ status: "blocked" });
    expect(by(held, "statements_verified").detail).toMatch(/held/);
    const open = deriveSteps("2026-10", facts({ exceptions: { open: 5, explained: 3 } }));
    expect(by(open, "exceptions_explained").detail).toBe("2 exceptions still need a decision.");
  });
  it("with no expected accounts set up, a received statement counts, and the step says what it cannot check", () => {
    const s = deriveSteps("2026-10", facts({ statements: { expected: 0, received: 1, verified: 1, held: 0, failed: 0, notAvailable: 0 } }));
    expect(by(s, "docs_received").status).toBe("done");
    expect(by(s, "docs_received").detail).toMatch(/No expected accounts are set up/);
    const none = deriveSteps("2026-10", facts({ statements: { expected: 0, received: 0, verified: 0, held: 0, failed: 0, notAvailable: 0 } }));
    expect(by(none, "docs_received").status).toBe("pending");
  });
  it("never marks GST, TDS or provisions done without a person", () => {
    const s = deriveSteps("2026-10", facts());
    for (const k of ["gst", "tds", "provisions", "mis_reviewed"]) expect(by(s, k).status).toBe("pending");
    const confirmed = deriveSteps("2026-10", facts({ confirmed: { gst: { by: "Asha", at: "2026-11-09T10:00:00Z" } } }));
    expect(by(confirmed, "gst")).toMatchObject({ status: "done", doneBy: "Asha" });
  });
  it("is Fully Closed only when every step is done", () => {
    const all = facts({ report: { exists: true, signedOff: true }, confirmed: { gst: { by: "A", at: "x" }, tds: { by: "A", at: "x" }, provisions: { by: "A", at: "x" }, mis_reviewed: { by: "B", at: "x" } } });
    expect(closeState(deriveSteps("2026-10", all)).state).toBe("fully_closed");
    const missingOne = facts({ report: { exists: true, signedOff: true }, confirmed: { gst: { by: "A", at: "x" }, tds: { by: "A", at: "x" }, provisions: { by: "A", at: "x" } } });
    expect(closeState(deriveSteps("2026-10", missingOne)).state).toBe("bank_books_closed");
  });
  it("starts as not started and shows progress", () => {
    const s = deriveSteps("2026-10", facts({ statements: { expected: 0, received: 0, verified: 0, held: 0, failed: 0, notAvailable: 0 }, recon: { bank: 0, runDone: false }, exceptions: { open: 0, explained: 0 }, report: { exists: false, signedOff: false } }));
    expect(closeState(s).state).toBe("not_started");
  });
  it("due dates fall in the following month, and year ends roll over", () => {
    expect(dueOn("2026-10", 7)).toBe("2026-11-07");
    expect(dueOn("2026-12", 20)).toBe("2027-01-20");
    const late = overdueSteps(deriveSteps("2026-10", facts()), "2026-11-12");
    expect(late.map((x) => x.key)).toContain("tds");
    expect(late.map((x) => x.key)).not.toContain("gst");
  });
  it("only authorised roles confirm GST, TDS and provisions; any staff confirm the MIS review; nobody confirms by hand what the system checks", () => {
    expect(mayConfirm("junior", "authorized")).toBe(false);
    expect(mayConfirm("manager", "authorized")).toBe(true);
    expect(mayConfirm("junior", "staff")).toBe(true);
    expect(mayConfirm("partner", "auto")).toBe(false);
    expect(mayConfirm("owner", "partner")).toBe(false);
  });
});

describe("a client that shares only bank statements", () => {
  it("shows the bank-only check as the reconciliation step, and says what the books would add", () => {
    const s = deriveSteps("2026-10", facts({ recon: { bank: 120, runDone: true, bankOnly: true } }));
    const step = s.find((x) => x.key === "recon_done")!;
    expect(step.status).toBe("done");
    expect(step.detail).toMatch(/bank statements alone/);
    expect(step.detail).toMatch(/Upload the books/);
  });
});
