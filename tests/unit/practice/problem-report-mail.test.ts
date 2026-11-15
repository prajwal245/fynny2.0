// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; subject: string; replyTo?: string | null }[] = [];
let failFor: string | null = null;
vi.mock("@/lib/practice/email.server", () => ({
  sendEmail: async (m: { to: string; subject: string; replyTo?: string | null }) => {
    if (m.to === failFor) throw new Error("provider down");
    sent.push({ to: m.to, subject: m.subject, replyTo: m.replyTo });
    return { sent: true, simulated: false, provider_id: "x", error: null };
  },
}));
vi.mock("@/lib/practice/testMode.server", () => ({ isTestFirm: async () => false }));

import { REPORT_RECIPIENTS, submitReport } from "@/lib/practice/reports.server";

const ctx = { firmId: "f1", firmName: "Mehta & Co", firmEmail: null, userId: "u1", role: "owner" } as never;
const db = (insertError?: string) =>
  ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order", "limit"]) b[m] = () => b;
      b["insert"] = () => b;
      b["maybeSingle"] = () => Promise.resolve(insertError ? { data: null, error: { message: insertError } } : { data: { id: "r1" }, error: null });
      b["then"] = (res: (v: unknown) => void) => res({ count: 0, data: [], error: null });
      return b;
    },
  }) as never;
const input = { category: "statement", summary: "ICICI shows 1,440 lines, the bank says 1,461" };

beforeEach(() => {
  sent.length = 0;
  failFor = null;
});

describe("a problem report reaches both support and the founder", () => {
  it("emails support@ and prajwal@, with the importance in the subject and the firm's person as reply-to", async () => {
    const r = await submitReport(db(), ctx, input, "devi@firm.in", { importance: "high" });
    expect(r).toEqual({ id: "r1", stored: true });
    expect(sent.map((m) => m.to).sort()).toEqual([...REPORT_RECIPIENTS].sort());
    expect(REPORT_RECIPIENTS).toContain("prajwal@fynhelp.com");
    expect(sent.every((m) => m.subject.startsWith("[High] Problem report:") && m.replyTo === "devi@firm.in")).toBe(true);
  });

  it("one failing inbox does not stop the other", async () => {
    failFor = "support@fynhelp.com";
    await submitReport(db(), ctx, input, null, {});
    expect(sent.map((m) => m.to)).toEqual(["prajwal@fynhelp.com"]);
  });

  it("still reaches both when the table is not applied yet", async () => {
    const r = await submitReport(db("relation ca_problem_reports does not exist"), ctx, input, null, {});
    expect(r.stored).toBe(false);
    expect(sent).toHaveLength(2);
  });
});
