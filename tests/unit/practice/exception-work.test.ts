import { beforeEach, describe, expect, it } from "vitest";
import type { FirmContext } from "@/lib/practice/db.server";
import { resetReadyCache, assignExceptions, exceptionTimeline, followResolution, reviewAction, setRemarkAndDue, setWorkStatus } from "@/lib/practice/exceptionWork.server";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

let missingTable: string | null = null;
function fakeDb() {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: Row | Row[] = {};
    let opts: { head?: boolean } = {};
    let max = Infinity;
    const run = () => {
      if (table === missingTable) return { data: null, error: { message: `relation "${table}" does not exist` } };
      const rows = tables[table]!;
      if (op === "insert") {
        for (const r of Array.isArray(payload) ? payload : [payload]) rows.push({ id: `${table}-${rows.length + 1}`, created_at: new Date(2026, 10, 16, 9, rows.length).toISOString(), ...r });
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => f.every((fn) => fn(r))).slice(0, max);
      if (op === "update") {
        hit.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      return { data: opts.head ? null : hit.map((r) => ({ ...r })), error: null, count: hit.length };
    };
    const b: Record<string, unknown> = {
      select: (_c?: string, o?: { head?: boolean }) => { opts = o ?? {}; return b; },
      insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return b; },
      order: () => b,
      limit: (n: number) => { max = n; return b; },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  const people: Record<string, { email: string; full_name?: string }> = {
    "u-asha": { email: "asha@firm.in", full_name: "Asha Rao" },
    "u-ravi": { email: "ravi@firm.in", full_name: "Ravi Menon" },
    "u-meera": { email: "meera@firm.in" },
  };
  return { from, auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: people[id]?.email, user_metadata: { full_name: people[id]?.full_name } } } }) } } } as never;
}

const ctx = (userId: string, role: FirmContext["role"]): FirmContext => ({ firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId, role });
const exc = (id: string, o: Row = {}) => ({ id, ca_firm_id: "f1", business_id: "b1", owner_id: null, work_status: "open", review_state: "none", reviewer_id: null, status: "open", remark: null, due_date: null, ...o });

beforeEach(() => {
  missingTable = null;
  resetReadyCache();
  tables = {
    ca_exception_events: [],
    ca_exceptions: [exc("e1"), exc("e2"), exc("e3", { ca_firm_id: "other" })],
    ca_firm_members: [
      { ca_firm_id: "f1", user_id: "u-asha", role: "junior", status: "active", invited_email: null },
      { ca_firm_id: "f1", user_id: "u-ravi", role: "partner", status: "active", invited_email: null },
      { ca_firm_id: "f1", user_id: "u-meera", role: "manager", status: "active", invited_email: null },
      { ca_firm_id: "f1", user_id: "u-gone", role: "junior", status: "revoked", invited_email: null },
    ],
  };
});

describe("exception ownership and history", () => {
  it("assigns in bulk and records who did it, with names, for each", async () => {
    const r = await assignExceptions(fakeDb(), ctx("u-ravi", "partner"), ["e1", "e2"], "u-asha", "Please chase the invoice");
    expect(r.changed).toBe(2);
    expect(tables.ca_exceptions![0]).toMatchObject({ owner_id: "u-asha", updated_by: "u-ravi" });
    expect(tables.ca_exception_events).toHaveLength(2);
    expect(tables.ca_exception_events![0]).toMatchObject({ event_type: "assigned", from_value: "nobody", to_value: "Asha Rao", actor_name: "Ravi Menon", note: "Please chase the invoice" });
  });
  it("a second owner is a handover, and giving it to the same person again changes nothing", async () => {
    await assignExceptions(fakeDb(), ctx("u-asha", "junior"), ["e1"], "u-asha");
    await assignExceptions(fakeDb(), ctx("u-asha", "junior"), ["e1"], "u-ravi");
    expect(tables.ca_exception_events!.map((e) => e.event_type)).toEqual(["assigned", "handover"]);
    expect((await assignExceptions(fakeDb(), ctx("u-asha", "junior"), ["e1"], "u-ravi")).changed).toBe(0);
    expect(tables.ca_exception_events).toHaveLength(2);
  });
  it("refuses a person who is not an active member, and another firm's exception", async () => {
    await expect(assignExceptions(fakeDb(), ctx("u-ravi", "partner"), ["e1"], "u-gone")).rejects.toThrow(/not an active member/);
    await expect(assignExceptions(fakeDb(), ctx("u-ravi", "partner"), ["e3"], "u-asha")).rejects.toThrow(/not found/);
    expect(tables.ca_exceptions![2]!.owner_id).toBeNull();
  });
  it("moves through query sent and answered, and refuses a jump to resolved", async () => {
    const db = fakeDb();
    await setWorkStatus(db, ctx("u-asha", "junior"), "e1", "query_sent");
    await setWorkStatus(db, ctx("u-asha", "junior"), "e1", "answered");
    await expect(setWorkStatus(db, ctx("u-asha", "junior"), "e1", "resolved")).rejects.toThrow(/cannot go from/);
    expect(tables.ca_exception_events!.map((e) => [e.from_value, e.to_value])).toEqual([["Open", "Query sent"], ["Query sent", "Answered"]]);
  });
  it("accepting as timing needs the reason written down", async () => {
    await expect(setWorkStatus(fakeDb(), ctx("u-asha", "junior"), "e1", "accepted_timing")).rejects.toThrow(/Say why/);
    await setWorkStatus(fakeDb(), ctx("u-asha", "junior"), "e1", "accepted_timing", "Cheque 4512 clears on 3 Nov");
    expect(tables.ca_exception_events![0]).toMatchObject({ to_value: "Accepted as timing", note: "Cheque 4512 clears on 3 Nov" });
  });
  it("records a changed remark and due date, each as its own entry, and nothing for an unchanged one", async () => {
    const db = fakeDb();
    await setRemarkAndDue(db, ctx("u-asha", "junior"), "e1", { remark: "Client says it was a loan", dueDate: "2026-11-20" });
    await setRemarkAndDue(db, ctx("u-asha", "junior"), "e1", { remark: "Client says it was a loan" });
    expect(tables.ca_exception_events!.map((e) => e.event_type)).toEqual(["remark", "due"]);
    await expect(setRemarkAndDue(db, ctx("u-asha", "junior"), "e1", { dueDate: "tomorrow" })).rejects.toThrow(/not valid/);
  });
  it("review: a junior sends it to a senior; only a senior returns it, with a note; history keeps both", async () => {
    const db = fakeDb();
    await assignExceptions(db, ctx("u-asha", "junior"), ["e1"], "u-asha");
    await expect(reviewAction(db, ctx("u-asha", "junior"), "e1", "send", { reviewerId: "u-asha" })).rejects.toThrow(/partner or manager/);
    await reviewAction(db, ctx("u-asha", "junior"), "e1", "send", { reviewerId: "u-ravi", note: "Please check the TDS angle" });
    expect(tables.ca_exceptions![0]).toMatchObject({ review_state: "with_senior", reviewer_id: "u-ravi" });
    await expect(reviewAction(db, ctx("u-asha", "junior"), "e1", "approve", {})).rejects.toThrow(/Only a partner or manager/);
    await expect(reviewAction(db, ctx("u-ravi", "partner"), "e1", "return", {})).rejects.toThrow(/Say what needs to change/);
    await reviewAction(db, ctx("u-ravi", "partner"), "e1", "return", { note: "Attach the invoice first" });
    expect(tables.ca_exceptions![0]!.review_state).toBe("returned");
    const timeline = await exceptionTimeline(db, ctx("u-ravi", "partner"), "e1");
    expect(timeline.map((t) => t.type)).toEqual(["assigned", "review_sent", "review_returned"]);
    expect(timeline[2]).toMatchObject({ by: "Ravi Menon", to: "Asha Rao", note: "Attach the invoice first" });
  });
  it("resolving or reopening follows the line and is recorded", async () => {
    const db = fakeDb();
    await followResolution(db, ctx("u-asha", "junior"), "e1", "resolved", "Matched to INV-12");
    expect(tables.ca_exceptions![0]).toMatchObject({ work_status: "resolved", review_state: "none" });
    await followResolution(db, ctx("u-asha", "junior"), "e1", "reopened");
    expect(tables.ca_exceptions![0]!.work_status).toBe("open");
    expect(tables.ca_exception_events!.map((e) => e.event_type)).toEqual(["resolved", "reopened"]);
  });
  it("says plainly when the database change has not been applied, and changes nothing", async () => {
    missingTable = "ca_exception_events";
    await expect(assignExceptions(fakeDb(), ctx("u-ravi", "partner"), ["e1"], "u-asha")).rejects.toThrow(/apply_nov_2026/);
    expect(tables.ca_exceptions![0]!.owner_id).toBeNull();
  });
});
