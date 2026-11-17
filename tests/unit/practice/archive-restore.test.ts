import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirmContext } from "@/lib/practice/db.server";
import { RESTORE_DAYS, restoreLabel, restoreWindow } from "@/lib/practice/archive";

let roomError: Error | null = null;
vi.mock("@/lib/practice/billing.server", () => ({ assertWorkRoom: async () => { if (roomError) throw roomError; } }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
function fakeDb() {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: Row = {};
    let max = Infinity;
    const run = () => {
      const rows = tables[table]!;
      if (op === "insert") { rows.push({ ...payload }); return { data: null, error: null }; }
      const hit = rows.filter((r) => f.every((fn) => fn(r))).slice(0, max);
      if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b, insert: (p: Row) => { op = "insert"; payload = p; return b; }, update: (p: Row) => { op = "update"; payload = p; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      like: (k: string, v: string) => { const re = new RegExp(`^${v.replace(/%/g, ".*")}$`); f.push((r) => re.test(String(r[k] ?? ""))); return b; },
      order: () => b, limit: (n: number) => { max = n; return b; },
      maybeSingle: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from } as never;
}
const ctx = (role: FirmContext["role"]): FirmContext => ({ firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId: "u1", role });
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

beforeEach(() => {
  roomError = null;
  tables = { ca_clients: [], ca_activity_log: [] };
});

describe("the 14-day restore window", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  it("is open for 14 days, counting down, then closes", () => {
    expect(RESTORE_DAYS).toBe(14);
    expect(restoreWindow("2026-11-17T09:00:00Z", now)).toMatchObject({ restorable: true, daysLeft: 13 });
    expect(restoreWindow("2026-11-03T10:30:00Z", now)).toMatchObject({ restorable: true, daysLeft: 0 });
    expect(restoreWindow("2026-11-03T09:59:00Z", now).restorable).toBe(false);
  });
  it("offers a restore when the archive date is not known, rather than locking it", () => {
    expect(restoreWindow(null, now)).toEqual({ restorable: true, daysLeft: null, until: null });
  });
  it("says it in words", () => {
    expect(restoreLabel(restoreWindow("2026-11-17T09:00:00Z", now))).toBe("Can be restored for 13 more days");
    expect(restoreLabel({ restorable: true, daysLeft: 1, until: null })).toBe("Can be restored for 1 more day");
    expect(restoreLabel({ restorable: true, daysLeft: 0, until: null })).toBe("Can be restored until today ends");
    expect(restoreLabel(restoreWindow("2026-10-01T00:00:00Z", now))).toMatch(/Ask FynHelp support/);
  });
});

describe("archiving and restoring a client", () => {
  const client = (o: Row = {}) => ({ id: "c1", ca_firm_id: "f1", business_id: "b1", client_name: "Tritiksha Gold", client_status: "active", notes: JSON.stringify({ entityType: "Pvt Ltd" }), ...o });

  it("archiving records when, and keeps the rest of the client's record", async () => {
    const { archivePracticeClient } = await import("@/lib/practice/clients.server");
    tables.ca_clients = [client()];
    tables.ca_document_requests = [];
    await archivePracticeClient(fakeDb(), ctx("partner"), "b1", "added by mistake");
    const c = tables.ca_clients![0]!;
    expect(c["client_status"]).toBe("archived");
    const meta = JSON.parse(String(c["notes"]));
    expect(meta.entityType).toBe("Pvt Ltd");
    expect(Date.now() - Date.parse(meta.archivedAt)).toBeLessThan(5000);
  });

  it("lists archived clients with days left, from the recorded time or else the history", async () => {
    const { listArchivedClients } = await import("@/lib/practice/clients.server");
    tables.ca_clients = [
      client({ business_id: "b1", client_name: "New way", client_status: "archived", notes: JSON.stringify({ archivedAt: ago(3.5) }) }),
      client({ business_id: "b2", client_name: "Before today", client_status: "archived", notes: null }),
      client({ business_id: "b3", client_name: "Too old", client_status: "archived", notes: JSON.stringify({ archivedAt: ago(20) }) }),
      client({ business_id: "b4", client_name: "Active one", client_status: "active" }),
    ];
    tables.ca_activity_log = [{ ca_firm_id: "f1", business_id: "b2", action_type: "system", description: "Before today archived: duplicate. Its documents are kept.", created_at: ago(1.5) }];
    const list = await listArchivedClients(fakeDb(), ctx("partner"));
    expect(list.map((c) => c.name)).toEqual(["Before today", "New way", "Too old"]);
    expect(list[0]).toMatchObject({ restorable: true, daysLeft: 12 });
    expect(list[1]).toMatchObject({ restorable: true, daysLeft: 10 });
    expect(list[2]).toMatchObject({ restorable: false });
  });

  it("restores within 14 days: active again, the archive time removed, the rest kept, and it is logged", async () => {
    const { unarchivePracticeClient } = await import("@/lib/practice/clients.server");
    tables.ca_clients = [client({ client_status: "archived", notes: JSON.stringify({ entityType: "Pvt Ltd", archivedAt: ago(5) }) })];
    await unarchivePracticeClient(fakeDb(), ctx("partner"), "b1");
    const c = tables.ca_clients![0]!;
    expect(c["client_status"]).toBe("active");
    expect(JSON.parse(String(c["notes"]))).toEqual({ entityType: "Pvt Ltd" });
    expect(String(tables.ca_activity_log!.at(-1)!["description"])).toMatch(/restored from the archive/);
  });

  it("refuses after 14 days, for a junior, for a client that is not archived, and when the plan has no room", async () => {
    const { unarchivePracticeClient } = await import("@/lib/practice/clients.server");
    tables.ca_clients = [client({ client_status: "archived", notes: JSON.stringify({ archivedAt: ago(15) }) })];
    await expect(unarchivePracticeClient(fakeDb(), ctx("partner"), "b1")).rejects.toThrow(/more than 14 days ago/);
    tables.ca_clients = [client({ client_status: "archived", notes: JSON.stringify({ archivedAt: ago(2) }) })];
    await expect(unarchivePracticeClient(fakeDb(), ctx("junior"), "b1")).rejects.toThrow(/Only a partner/);
    tables.ca_clients = [client()];
    await expect(unarchivePracticeClient(fakeDb(), ctx("partner"), "b1")).rejects.toThrow(/is not archived/);
    tables.ca_clients = [client({ client_status: "archived", notes: JSON.stringify({ archivedAt: ago(2) }) })];
    roomError = new Error("The free trial covers 5 active clients a month.");
    await expect(unarchivePracticeClient(fakeDb(), ctx("partner"), "b1")).rejects.toThrow(/5 active clients/);
    expect(tables.ca_clients![0]!["client_status"]).toBe("archived");
  });
});

describe("archived clients free their place in the month's count", () => {
  it("does not count an archived client even though it was worked on this month", async () => {
    const { usageFor } = await import("@/lib/practice/billing/usage.server");
    tables = {
      ca_document_extractions: [{ ca_firm_id: "f1", business_id: "a", created_at: new Date().toISOString() }, { ca_firm_id: "f1", business_id: "b", created_at: new Date().toISOString() }],
      ca_agent_runs: [],
      ca_clients: [{ ca_firm_id: "f1", business_id: "b", client_status: "archived" }],
    };
    // The month filters are ignored by the fake; the point is the archived client is removed from the count.
    const db = fakeDb() as never as { from: (t: string) => unknown };
    const wrapped = { from: (t: string) => { const q = (db.from(t) as Record<string, unknown>); for (const m of ["gte", "lt", "not", "neq", "is"]) q[m] = () => q; (q["select"] as unknown) = ((orig) => (_c?: string, o?: { head?: boolean }) => (o?.head ? Object.assign(q, { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, count: tables[t]!.length, error: null }).then(ok) }) : (orig as () => unknown)()))(q["select"]); return q; } } as never;
    const u = await usageFor(wrapped, "f1");
    expect([...u.activeIds]).toEqual(["a"]);
    expect(u.activeClients).toBe(1);
  });
});
