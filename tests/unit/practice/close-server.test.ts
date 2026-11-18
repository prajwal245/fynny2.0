import { describe, expect, it } from "vitest";
import type { FirmContext } from "@/lib/practice/db.server";
import { acceptStatement, confirmStep, portfolioClose } from "@/lib/practice/close/close.server";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const calls: { table: string; op: string; payload?: unknown }[] = [];

/** Filters are ignored on reads: each test supplies only the rows it wants returned. */
function fakeDb() {
  const from = (table: string) => {
    let op = "select";
    let payload: unknown;
    const run = () => {
      calls.push({ table, op, payload });
      if (op === "upsert" || op === "insert") {
        tables[table] = [...(tables[table] ?? []), ...(Array.isArray(payload) ? payload : [payload])] as Row[];
        return { data: null, error: null };
      }
      if (op === "update" || op === "delete") return { data: null, error: null };
      if (!tables[table]) return { data: null, error: { message: `relation "${table}" does not exist` } };
      return { data: tables[table], error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b, insert: (p: unknown) => { op = "insert"; payload = p; return b; }, upsert: (p: unknown) => { op = "upsert"; payload = p; return b; },
      update: (p: unknown) => { op = "update"; payload = p; return b; }, delete: () => { op = "delete"; return b; },
      eq: () => b, lte: () => b, gte: () => b, in: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from, auth: { admin: { getUserById: async () => ({ data: { user: { email: "asha@firm.in", user_metadata: { full_name: "Asha Rao" } } } }) } } } as never;
}
const ctx = (role: FirmContext["role"]): FirmContext => ({ firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId: "u1", role });
const pass = { status: "pass", headline: "ok", first: "2026-10-01", last: "2026-10-31" };
const doc = (id: string, sc: unknown, acct = "XXXX4411") => ({ id, business_id: "b1", original_filename: `${id}.pdf`, sc, acct });

function base(): Record<string, Row[]> {
  return {
    ca_clients: [{ business_id: "b1", client_name: "Acme Traders", client_status: "active" }, { business_id: "b2", client_name: "Beta Foods", client_status: "active" }, { business_id: "b3", client_name: "Old Co", client_status: "archived" }],
    ca_client_document_requirements: [{ id: "r1", business_id: "b1", label: "HDFC current", account_tail: "4411" }],
    ca_document_extractions: [doc("d1", pass)],
    ca_recon_runs: [{ business_id: "b1", total_items: 120, period: "October 2026" }],
    ca_exceptions: [{ business_id: "b1", status: "open", work_status: "accepted_timing" }, { business_id: "b1", status: "open", work_status: "open" }],
    ca_reports_log: [],
    ca_close_steps: [],
  };
}

describe("portfolio close", () => {
  it("derives each client's steps from what is held, and skips archived clients", async () => {
    tables = base();
    const all = await portfolioClose(fakeDb(), ctx("partner"), "2026-10");
    expect(all.map((c) => c.name)).toEqual(["Acme Traders", "Beta Foods"]);
    const acme = all[0]!;
    const step = (k: string) => acme.steps.find((s) => s.key === k)!;
    expect(step("docs_received")).toMatchObject({ status: "done" });
    expect(step("statements_verified")).toMatchObject({ status: "done" });
    expect(step("recon_done")).toMatchObject({ status: "done" });
    expect(step("exceptions_explained")).toMatchObject({ status: "pending", detail: "1 exception still needs a decision." });
    expect(acme.state).toBe("in_progress");
    // A client with nothing yet is not started and is told what to set up.
    expect(all[1]).toMatchObject({ state: "not_started" });
    expect(all[1]!.steps.find((s) => s.key === "docs_received")!.detail).toMatch(/No statement has been received/);
  });
  it("holds the month when a statement failed verification, until a person accepts it", async () => {
    tables = base();
    tables.ca_document_extractions = [doc("d1", { ...pass, status: "fail", checks: [{ ok: false, label: "Count", detail: "Read 160, the bank prints 161." }], bankTie: { tied: false, source: "HDFC" } })];
    const acme = (await portfolioClose(fakeDb(), ctx("partner"), "2026-10"))[0]!;
    expect(acme.steps.find((s) => s.key === "statements_verified")).toMatchObject({ status: "blocked" });
    expect(acme.statements[0]!.verification).toMatchObject({ held: true, result: "failed" });
    tables.ca_document_extractions = [doc("d1", { ...pass, status: "fail", accepted: { by: "Ravi", at: "2026-11-02", note: "Page 3 blank" } })];
    const after = (await portfolioClose(fakeDb(), ctx("partner"), "2026-10"))[0]!;
    expect(after.steps.find((s) => s.key === "statements_verified")).toMatchObject({ status: "done" });
  });
  it("matches an expected account by its last digits: a statement of another account does not satisfy it", async () => {
    tables = base();
    tables.ca_document_extractions = [doc("d1", pass, "XXXX9999")];
    const acme = (await portfolioClose(fakeDb(), ctx("partner"), "2026-10"))[0]!;
    expect(acme.steps.find((s) => s.key === "docs_received")).toMatchObject({ status: "pending", detail: "0 of 1 expected statement received." });
  });
  it("shows a signed-off report as the partner's sign-off, and does not touch GST or TDS", async () => {
    tables = base();
    tables.ca_reports_log = [{ business_id: "b1", signed_off_at: "2026-11-09T10:00:00Z", signed_off_by: "u9" }];
    const acme = (await portfolioClose(fakeDb(), ctx("partner"), "2026-10"))[0]!;
    expect(acme.steps.find((s) => s.key === "partner_signoff")!.status).toBe("done");
    expect(acme.steps.find((s) => s.key === "mis_prepared")!.status).toBe("done");
    expect(acme.steps.find((s) => s.key === "gst")!.status).toBe("pending");
    expect(acme.steps.find((s) => s.key === "tds")!.status).toBe("pending");
  });
  it("says what it cannot read instead of passing, when a table is missing", async () => {
    tables = base();
    delete tables.ca_close_steps;
    const acme = (await portfolioClose(fakeDb(), ctx("partner"), "2026-10"))[0]!;
    expect(acme.notes.join(" ")).toMatch(/Confirmations cannot be read/);
  });
});

describe("confirmations", () => {
  it("a junior cannot confirm GST; a manager can, and it is recorded with their name", async () => {
    tables = base();
    tables.ca_clients = [{ business_id: "b1", client_name: "Acme", client_status: "active" }];
    tables.ca_close_steps = [];
    tables.ca_close_events = [];
    tables.ca_activity_log = [];
    await expect(confirmStep(fakeDb(), ctx("junior"), "b1", "2026-10", "gst", true)).rejects.toThrow(/partner or manager/);
    await confirmStep(fakeDb(), ctx("manager"), "b1", "2026-10", "gst", true, "Filed on 20 Nov, ARN 123");
    expect(tables.ca_close_steps![0]).toMatchObject({ step_key: "gst", confirmed_by_name: "Asha Rao", period: "2026-10", note: "Filed on 20 Nov, ARN 123" });
    expect(tables.ca_close_events![0]).toMatchObject({ action: "confirmed", actor_name: "Asha Rao" });
  });
  it("nobody confirms a system step, and any staff member can confirm the MIS review", async () => {
    tables = base();
    tables.ca_close_steps = [];
    tables.ca_close_events = [];
    tables.ca_activity_log = [];
    await expect(confirmStep(fakeDb(), ctx("partner"), "b1", "2026-10", "recon_done", true)).rejects.toThrow(/system checks/);
    await expect(confirmStep(fakeDb(), ctx("junior"), "b1", "2026-10", "mis_reviewed", true)).resolves.toEqual({ ok: true });
  });
  it("only a senior accepts a failed statement, with a reason, and only one that failed", async () => {
    tables = base();
    tables.ca_activity_log = [];
    tables.ca_document_extractions = [{ id: "d1", business_id: "b1", original_filename: "x.pdf", extract_status: "needs_review", extracted: { statement_check: { status: "fail" } } }];
    await expect(acceptStatement(fakeDb(), ctx("junior"), "d1", "Page 3 was blank in the original")).rejects.toThrow(/partner or manager/);
    await expect(acceptStatement(fakeDb(), ctx("partner"), "d1", "ok")).rejects.toThrow(/Say why/);
    await acceptStatement(fakeDb(), ctx("partner"), "d1", "Page 3 was blank in the original");
    const upd = calls.filter((c) => c.table === "ca_document_extractions" && c.op === "update").at(-1)!.payload as { extracted: { statement_check: { accepted: { by: string } } }; extract_status: string };
    expect(upd.extracted.statement_check.accepted.by).toBe("Asha Rao");
    expect(upd.extract_status).toBe("parsed");
  });
});
