import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

const ctx = { firmId: "f1", firmName: "F", firmEmail: null, userId: "u1", role: "owner" as const };

describe("an exception's History", () => {
  it("shows the accept as timing, with the reason and who did it", async () => {
    const { db, tables } = memoryDb({
      ca_exceptions: [{ id: "e1", ca_firm_id: "f1", business_id: "b1", owner_id: null, work_status: "open", review_state: "none", reviewer_id: null, status: "open", remark: null, due_date: null }],
      ca_exception_events: [],
      ca_activity_log: [],
    });
    const { setWorkStatus, exceptionTimeline } = await import("@/lib/practice/exceptionWork.server");
    await setWorkStatus(db, ctx, "e1", "accepted_timing", "Cheque issued, not yet presented: clears 3 Oct");
    expect((tables["ca_exception_events"] as unknown[]).length).toBe(1);
    const history = await exceptionTimeline(db, ctx, "e1");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: "status", to: "Accepted as timing" });
    expect(history[0]!.note).toMatch(/Cheque issued/);
  });
});
