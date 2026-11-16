import { beforeEach, describe, expect, it } from "vitest";
import type { FirmContext } from "@/lib/practice/db.server";
import { listOwnTransfers, pairAccountTransfers, unpairOwnTransfer } from "@/lib/practice/recon.server";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

function fakeDb() {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: Row = {};
    let wantRows = false;
    const run = () => {
      const rows = tables[table]!;
      if (op === "insert") { rows.push({ ...payload }); return { data: null, error: null }; }
      const hit = rows.filter((r) => f.every((fn) => fn(r)));
      if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); return { data: wantRows ? hit.map((r) => ({ ...r })) : null, error: null }; }
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => { wantRows = true; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return b; },
      gte: (k: string, v: unknown) => { f.push((r) => String(r[k]) >= String(v)); return b; },
      lte: (k: string, v: unknown) => { f.push((r) => String(r[k]) <= String(v)); return b; },
      like: (k: string, v: string) => { const pre = v.replace(/%$/, ""); f.push((r) => String(r[k] ?? "").startsWith(pre)); return b; },
      order: () => b,
      range: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from } as never;
}

const ctx: FirmContext = { firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId: "u1", role: "partner" };
const period = { label: "September 2026", key: "2026-09", start: "2026-09-01", end: "2026-09-30" };
const txn = (id: string, o: Row) => ({ id, ca_firm_id: "f1", business_id: "b1", side: "bank", match_status: "unmatched", counterparty: null, category: null, balance: null, recon_tag: null, ...o });

beforeEach(() => {
  tables = {
    ca_txns: [
      txn("out1", { direction: "out", amount: "50000", txn_date: "2026-09-10", extraction_id: "A", description: "NEFT TO ICICI UTR HDFCN52026091012345", reference: null }),
      txn("in1", { direction: "in", amount: "50000", txn_date: "2026-09-11", extraction_id: "B", description: "NEFT CR UTR HDFCN52026091012345", reference: null }),
      txn("out2", { direction: "out", amount: "7000", txn_date: "2026-09-15", extraction_id: "A", description: "UPI-SHARMA TRADERS", reference: null }),
      txn("in2", { direction: "in", amount: "7000", txn_date: "2026-09-15", extraction_id: "B", description: "UPI-SOMEONE ELSE", reference: null }),
    ],
    ca_document_extractions: [{ id: "A", acct: "XXXX1111" }, { id: "B", acct: "XXXX2222" }],
    ca_exceptions: [{ id: "x1", txn_id: "out1", status: "open" }, { id: "x2", txn_id: "in2", status: "open" }],
    ca_activity_log: [],
  };
});

describe("pairing a client's own-account transfers in recon", () => {
  it("sets aside only the pair with evidence, closes its exception with the evidence, and leaves the rest alone", async () => {
    const pairs = await pairAccountTransfers(fakeDb(), ctx, "b1", period);
    expect(pairs).toHaveLength(1);
    const t = (id: string) => tables.ca_txns!.find((r) => r.id === id)!;
    expect(t("out1")).toMatchObject({ match_status: "ignored", recon_tag: "own_account:in1" });
    expect(t("in1")).toMatchObject({ match_status: "ignored", recon_tag: "own_account:out1" });
    // Equal amounts and dates without a shared reference are not enough.
    expect(t("out2")).toMatchObject({ match_status: "unmatched", recon_tag: null });
    expect(t("in2")).toMatchObject({ match_status: "unmatched" });
    expect(tables.ca_exceptions![0]).toMatchObject({ status: "resolved", resolution_action: "own_account_transfer" });
    expect(String(tables.ca_exceptions![0]!.resolution_note)).toMatch(/reference HDFCN52026091012345/);
    expect(tables.ca_exceptions![1]).toMatchObject({ status: "open" });
    // Nothing is deleted.
    expect(tables.ca_txns).toHaveLength(4);
  });
  it("does nothing with a single statement, and is quiet when run again", async () => {
    tables.ca_txns!.forEach((r) => (r.extraction_id = "A"));
    expect(await pairAccountTransfers(fakeDb(), ctx, "b1", period)).toHaveLength(0);
    tables.ca_txns![0]!.extraction_id = "A";
    tables.ca_txns![1]!.extraction_id = "B";
    expect(await pairAccountTransfers(fakeDb(), ctx, "b1", period)).toHaveLength(1);
    expect(await pairAccountTransfers(fakeDb(), ctx, "b1", period)).toHaveLength(0);
  });
  it("lists the pairs set aside, and undo puts both lines back", async () => {
    await pairAccountTransfers(fakeDb(), ctx, "b1", period);
    const list = await listOwnTransfers(fakeDb(), ctx, "b1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ outId: "out1", inId: "in1", amount: 50000 });
    await unpairOwnTransfer(fakeDb(), ctx, "in1", "Not our account");
    expect(tables.ca_txns![0]).toMatchObject({ match_status: "unmatched", recon_tag: null });
    expect(tables.ca_txns![1]).toMatchObject({ match_status: "unmatched", recon_tag: null });
    await expect(unpairOwnTransfer(fakeDb(), ctx, "in1")).rejects.toThrow(/not a paired transfer/);
  });
});
