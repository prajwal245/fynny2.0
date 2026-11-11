import { describe, expect, it } from "vitest";
import { OUTSIDE_STEPS, currentPhase, stepsDone, workflowFor, type WorkflowFacts } from "@/v2/lib/closeWorkflow";

const facts = (o: Partial<WorkflowFacts> = {}): WorkflowFacts => ({
  period: "October 2026", docsRead: 0, reading: false, openChases: 0, bankLines: 0, bookLines: 0, openReview: 0, recon: null, openExceptions: 0, misCount: 0, signedOff: false, ...o,
});
const status = (f: WorkflowFacts) => Object.fromEntries(workflowFor(f).map((s) => [s.id, s.status]));

describe("the close workflow", () => {
  it("starts at collecting documents when nothing is in", () => {
    const s = status(facts());
    expect(s.collect).toBe("current");
    expect(Object.values(s).filter((v) => v === "current")).toHaveLength(1);
    expect(s.signoff).toBe("todo");
  });

  it("moves on as the real facts change, one current step at a time", () => {
    expect(status(facts({ docsRead: 3, bookLines: 10, bankLines: 10, openReview: 2 })).review).toBe("current");
    expect(status(facts({ docsRead: 3, bookLines: 10, bankLines: 10 })).match).toBe("current");
    const afterRecon = status(facts({ docsRead: 3, bookLines: 10, bankLines: 10, recon: { matched: 8, bank: 10 }, openExceptions: 2 }));
    expect(afterRecon.match).toBe("done");
    expect(afterRecon.investigate).toBe("current");
    const ready = status(facts({ docsRead: 3, bookLines: 10, bankLines: 10, recon: { matched: 10, bank: 10 } }));
    expect(ready.mis).toBe("current");
  });

  it("is complete only after the partner signs off", () => {
    const all = facts({ docsRead: 3, bookLines: 10, bankLines: 10, recon: { matched: 10, bank: 10 }, misCount: 1 });
    expect(status(all).signoff).toBe("current");
    const closed = workflowFor({ ...all, signedOff: true });
    expect(closed.every((s) => s.status === "done")).toBe(true);
    expect(stepsDone(closed)).toEqual({ done: 9, total: 9 });
    expect(currentPhase(closed)).toBe("MIS");
  });

  it("does not call exceptions done before Recon has run", () => {
    const s = status(facts({ docsRead: 2, bookLines: 5, bankLines: 5 }));
    expect(s.investigate).not.toBe("done");
  });

  it("keeps a chase open until the client sends the documents", () => {
    const w = workflowFor(facts({ docsRead: 2, openChases: 1 }));
    expect(w[0]!.status).toBe("current");
    expect(w[0]!.detail).toMatch(/still being chased/);
  });

  it("names the books step plainly when no books are in", () => {
    expect(workflowFor(facts({ docsRead: 1 })).find((s) => s.id === "books")!.detail).toMatch(/Connect Tally or Zoho Books/);
  });

  it("says only what FynHelp does: it never claims to post entries, create ledgers or prepare a BRS", () => {
    const text = JSON.stringify(workflowFor(facts({ docsRead: 3, bookLines: 3, recon: { matched: 3, bank: 3 } })));
    expect(text).not.toMatch(/posts? every|creates? ledgers|creates? the entry/i);
    const brs = OUTSIDE_STEPS.find((s) => s.id === "brs")!;
    expect(brs.kind).toBe("later");
    expect(OUTSIDE_STEPS.find((s) => s.id === "record")!.detail).toMatch(/does not create/);
  });

  it("checks repeated files and GST automatically, and says only that", () => {
    const v = workflowFor(facts({ docsRead: 2 })).find((x) => x.id === "validate")!;
    expect(v.kind).toBe("agent");
    expect(v.detail).toMatch(/sent twice is ignored/);
    expect(v.detail).not.toMatch(/arithmetic|invoice date|tax rate/i);
  });

  it("every tracked step is on one of the five close phases", () => {
    const phases = new Set(workflowFor(facts()).map((s) => s.phase));
    expect([...phases]).toEqual(["Documents", "Review", "Recon", "Exceptions", "MIS"]);
  });
});
