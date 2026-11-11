import { describe, expect, it } from "vitest";
import { closedLine, filterRows, rowAction, rowOf, sortRows, stageCounts, waitingChips, type PortfolioRow } from "@/v2/lib/portfolioView";

const steps = (done: number) =>
  (["Documents", "Review", "Recon", "Exceptions", "MIS"] as const).map((stage, i) => ({ stage, done: i < done, detail: "" }));
const close = (done: number, label = "Do the next thing", tab = "documents") => ({
  steps: steps(done),
  workflow: [],
  percent: done * 20,
  stage: (["Documents", "Review", "Recon", "Exceptions", "MIS"] as const)[Math.min(done, 4)]!,
  next: { label, why: "", tab },
});
const row = (name: string, done: number, c: Partial<{ exceptions: number; review: number; chases: number }> = {}): PortfolioRow =>
  rowOf({ id: name, name, entityType: "LLP" }, close(done), { exceptions: 0, review: 0, chases: 0, ...c });

describe("the portfolio worklist", () => {
  it("calls a client closed only when every step is done", () => {
    expect(row("a", 5).stage).toBe("Closed");
    expect(row("b", 4).stage).toBe("MIS");
    expect(row("c", 0).stage).toBe("Documents");
  });

  it("puts clients with exceptions first, most exceptions first, closed clients last", () => {
    const rows = [row("Closed Co", 5), row("Quiet Co", 2), row("Busy Co", 3, { exceptions: 7 }), row("Some Co", 3, { exceptions: 2 })];
    expect(sortRows(rows, "attention").map((r) => r.name)).toEqual(["Busy Co", "Some Co", "Quiet Co", "Closed Co"]);
  });

  it("weighs exceptions above rows to review above chases", () => {
    const rows = [row("Chases", 1, { chases: 9 }), row("Review", 1, { review: 2 }), row("Exceptions", 1, { exceptions: 1 })];
    expect(sortRows(rows, "attention").map((r) => r.name)).toEqual(["Exceptions", "Review", "Chases"]);
  });

  it("breaks ties by progress, then name", () => {
    const rows = [row("Zed", 2), row("Alpha", 2), row("Ahead", 3)];
    expect(sortRows(rows, "attention").map((r) => r.name)).toEqual(["Ahead", "Alpha", "Zed"]);
  });

  it("sorts closest to done with closed clients last, and by name", () => {
    const rows = [row("B", 1), row("A", 5), row("C", 4)];
    expect(sortRows(rows, "progress").map((r) => r.name)).toEqual(["C", "B", "A"]);
    expect(sortRows(rows, "name").map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("does not change the list it is given", () => {
    const rows = [row("B", 1), row("A", 2)];
    sortRows(rows, "name");
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
  });

  it("filters by a search and by stage", () => {
    const rows = [row("Sahyadri Traders", 0), row("Kaveri Home Appliances", 2), row("Sahyadri Textiles", 2)];
    expect(filterRows(rows, { query: "sahyadri" }).map((r) => r.name)).toEqual(["Sahyadri Traders", "Sahyadri Textiles"]);
    expect(filterRows(rows, { stage: "Recon" }).map((r) => r.name)).toEqual(["Kaveri Home Appliances", "Sahyadri Textiles"]);
    expect(filterRows(rows, { query: "sahyadri", stage: "Recon" }).map((r) => r.name)).toEqual(["Sahyadri Textiles"]);
    expect(filterRows(rows, { query: "  " })).toHaveLength(3);
  });

  it("counts clients at each stage, including closed", () => {
    const c = stageCounts([row("a", 0), row("b", 0), row("c", 3), row("d", 5)]);
    expect(c).toMatchObject({ Documents: 2, Exceptions: 1, Closed: 1, Review: 0 });
  });

  it("says what is waiting in plain words, singular and plural, and nothing when clear", () => {
    expect(waitingChips(row("a", 3, { exceptions: 1, review: 2, chases: 1 })).map((c) => c.label)).toEqual(["1 exception", "2 rows to review", "1 document chase"]);
    expect(waitingChips(row("a", 3))).toEqual([]);
  });

  it("gives each row one action: the next step, or the MIS once closed", () => {
    expect(rowAction(rowOf({ id: "x", name: "X", entityType: "LLP" }, close(3, "Clear 5 exceptions", "exceptions"), { exceptions: 5, review: 0, chases: 0 }))).toMatchObject({ label: "Clear 5 exceptions", tab: "exceptions" });
    expect(rowAction(row("done", 5))).toMatchObject({ label: "Open MIS", tab: "mis" });
  });

  it("summarises how many are closed", () => {
    expect(closedLine([row("a", 5), row("b", 1)], "October 2026")).toBe("1 of 2 clients closed for October 2026");
    expect(closedLine([row("a", 5)], "October 2026")).toBe("1 of 1 client closed for October 2026");
  });
});

import { actionIsForYou, inTab, needsAttention, tabCounts, waitingText } from "@/v2/lib/portfolioView";

describe("the portfolio tabs", () => {
  const rows = [row("Busy", 3, { exceptions: 2 }), row("Signoff", 4), row("Done", 5), row("Chased", 0, { chases: 1 }), row("Quiet", 1)];
  it("needs attention means something waits on a person, never a closed client", () => {
    expect(rows.filter(needsAttention).map((r) => r.name)).toEqual(["Busy", "Chased"]);
    expect(needsAttention(row("Done", 5, { exceptions: 3 }))).toBe(false);
  });
  it("sorts clients into the tabs and counts them", () => {
    expect(inTab(rows[1]!, "signoff")).toBe(true);
    expect(inTab(rows[2]!, "closed")).toBe(true);
    expect(tabCounts(rows)).toEqual({ all: 5, attention: 2, signoff: 1, closed: 1 });
  });
  it("makes the row button primary only when a person has something to do", () => {
    expect(actionIsForYou(rows[0]!)).toBe(true);
    expect(actionIsForYou(rows[1]!)).toBe(true);
    expect(actionIsForYou(rows[4]!)).toBe(false);
    expect(actionIsForYou(rows[2]!)).toBe(false);
  });
});

describe("short wording on a row", () => {
  const withNext = (label: string, tab: string, c: Partial<{ review: number }> = {}) =>
    rowOf({ id: "x", name: "X", entityType: "LLP" }, close(2, label, tab), { exceptions: 0, review: 0, chases: 0, ...c });
  it("shortens each next step to fit a button and keeps the full words as the title", () => {
    expect(rowAction(withNext("Send the MIS to the partner for sign off", "mis")).label).toBe("Send for sign off");
    expect(rowAction(withNext("Run recon for this period", "recon")).label).toBe("Run recon");
    expect(rowAction(withNext("Upload the October 2026 documents", "documents")).label).toBe("Upload documents");
    expect(rowAction(withNext("Generate the October 2026 MIS", "mis")).label).toBe("Generate MIS");
    expect(rowAction(withNext("Follow up on pending documents", "chaser")).label).toBe("Follow up");
    expect(rowAction(withNext("Confirm 3 extracted rows", "review", { review: 3 })).label).toBe("Confirm 3 rows");
    expect(rowAction(withNext("Run recon for this period", "recon")).title).toBe("Run recon for this period");
  });
  it("never says nothing is waiting for a client that is ready for sign off", () => {
    expect(waitingText(row("a", 4))).toBe("Ready for sign off");
    expect(waitingText(row("a", 5))).toBe("Closed");
    expect(waitingText(row("a", 1))).toBe("Nothing waiting");
  });
  it("names the step a client is on, or says it is closed", () => {
    const wf = [{ id: "m", phase: "Recon" as const, title: "Match the bank statement to the books", kind: "agent" as const, status: "current" as const, detail: "" }];
    expect(rowOf({ id: "x", name: "X", entityType: "LLP" }, { ...close(2), workflow: wf }, { exceptions: 0, review: 0, chases: 0 }).stepTitle).toBe("Match the bank statement to the books");
    expect(row("a", 5).stepTitle).toBe("Closed and signed off");
  });
});
