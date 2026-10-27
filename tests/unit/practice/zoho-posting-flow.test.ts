/**
 * The write path against an in-memory database and a fake Zoho: it must never double-post,
 * never post when switched off, never trust the browser's figures, and always be undoable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as zoho from "@/lib/practice/zoho.server";
import type { Db, FirmContext } from "@/lib/practice/db.server";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  let n = 0;
  const builder = (name: string) => {
    const t = (tables[name] ??= []);
    let rows = t;
    let op: "select" | "insert" | "update" | "delete" = "select";
    let patch: Row = {};
    const q: Record<string, unknown> = {};
    const run = () => {
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      if (op === "delete") for (const r of rows) t.splice(t.indexOf(r), 1);
      return rows;
    };
    q["select"] = () => q;
    q["eq"] = (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q);
    q["order"] = () => q;
    q["limit"] = () => q;
    q["insert"] = (r: Row) => {
      op = "insert";
      const live = ["pending", "posted"];
      if (name === "ca_zoho_postings" && t.some((x) => x["txn_id"] === r["txn_id"] && live.includes(String(x["status"])))) {
        rows = [];
        patch = { __dup: true };
        return q;
      }
      const row = { id: `row-${++n}`, status: name === "ca_zoho_postings" ? "pending" : undefined, ...r };
      t.push(row);
      rows = [row];
      return q;
    };
    q["update"] = (p: Row) => ((op = "update"), (patch = p), q);
    q["delete"] = () => ((op = "delete"), q);
    q["maybeSingle"] = async () => ({ data: run()[0] ?? null, error: null });
    q["single"] = async () => (patch["__dup"] ? { data: null, error: { message: "duplicate" } } : { data: run()[0] ?? null, error: null });
    q["then"] = (res: (v: unknown) => unknown) => res({ data: run(), error: null });
    return q;
  };
  return { from: builder } as unknown as Db;
}

const ctx: FirmContext = { firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId: "u1", role: "partner" };
const TXN = "99999999-aaaa-bbbb-cccc-000000000001";

async function world(over: { write?: boolean; posting?: boolean; txn?: Row } = {}) {
  const enc = await (await import("@/lib/caGmail.server")).encryptToken("tok");
  return fakeDb({
    ca_zoho_connections: [{ id: "c1", ca_firm_id: "f1", accounts_server: "https://accounts.zoho.in", api_domain: "https://www.zohoapis.in", refresh_token_enc: enc, access_token_enc: enc, access_expires_at: new Date(Date.now() + 3600_000).toISOString(), status: "connected", write_enabled: over.write ?? true }],
    ca_zoho_links: [{ id: "l1", ca_firm_id: "f1", business_id: "b1", organization_id: "60093542506", account_id: "bank1", account_name: "HDFC Current", posting_enabled: over.posting ?? true }],
    ca_txns: [{ id: TXN, ca_firm_id: "f1", business_id: "b1", side: "bank", direction: "out", amount: 590, txn_date: "2026-09-30", description: "BANK CHARGES SEP 2026 INCL GST", reference: "CHG10", match_status: "exception", ...over.txn }],
    ca_zoho_postings: [],
  });
}

let calls: { method: string; url: string; body?: unknown }[] = [];
function fakeZoho(handler?: (m: string, url: string) => Response | undefined) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const custom = handler?.(method, url);
    if (custom) return custom;
    const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes("/oauth/v2/token")) return j({ access_token: "fresh", expires_in: 3600 });
    if (url.includes("/chartofaccounts?")) return j({ code: 0, chartofaccounts: [{ account_id: "exp9", account_name: "Bank Fees and Charges" }] });
    if (url.includes("/expenses?") && method === "GET") return j({ code: 0, expenses: [] });
    if (url.includes("/customerpayments?") && method === "GET") return j({ code: 0, customerpayments: [] });
    if (url.includes("/expenses") && method === "POST") return j({ code: 0, expense: { expense_id: "E1" } });
    if (url.includes("/expenses/E1") && method === "DELETE") return j({ code: 0, message: "deleted" });
    return j({ code: 1, message: "unexpected " + url }, 400);
  });
}

beforeEach(() => {
  process.env["GMAIL_ENCRYPTION_KEY"] = "test-key";
  process.env["ZOHO_POSTING_FIRMS"] = "f1";
  process.env["ZOHO_CLIENT_ID"] = "id";
  process.env["ZOHO_CLIENT_SECRET"] = "secret";
});
afterEach(() => vi.unstubAllGlobals());

describe("posting to Zoho Books", () => {
  it("previews without touching Zoho's books", async () => {
    fakeZoho();
    const v = await zoho.previewPost(await world(), ctx, "l1", TXN);
    expect(v.kind).toBe("bank_charge");
    expect(v.lines.find(([k]) => k === "Expense account")![1]).toBe("Bank Fees and Charges");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("posts a bank charge once, tagged, from the database figures, and logs it", async () => {
    fakeZoho();
    const db = await world();
    const r = await zoho.post(db, ctx, "l1", TXN);
    expect(r.zohoId).toBe("E1");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ amount: 590, date: "2026-09-30", account_id: "exp9", paid_through_account_id: "bank1" });
    expect(String((post.body as { description: string }).description)).toContain("Created by FynHelp");
    const logged = await zoho.listPostings(db, ctx);
    expect(logged[0]).toMatchObject({ status: "posted", kind: "bank_charge", amount: 590 });
  });

  it("a second click cannot create a second entry", async () => {
    fakeZoho();
    const db = await world();
    await zoho.post(db, ctx, "l1", TXN);
    const before = calls.filter((c) => c.method === "POST").length;
    await expect(zoho.post(db, ctx, "l1", TXN)).rejects.toThrow(/already/i);
    expect(calls.filter((c) => c.method === "POST").length).toBe(before);
  });

  it("does nothing when the platform switch, the consent or the client switch is off", async () => {
    fakeZoho();
    process.env["ZOHO_POSTING_FIRMS"] = "some-other-firm";
    await expect(zoho.post(await world(), ctx, "l1", TXN)).rejects.toThrow(/not switched on for your firm/);
    delete process.env["ZOHO_POSTING_FIRMS"];
    await expect(zoho.post(await world(), ctx, "l1", TXN)).rejects.toThrow(/not switched on for your firm/);
    process.env["ZOHO_POSTING_FIRMS"] = "f1";
    await expect(zoho.post(await world({ write: false }), ctx, "l1", TXN)).rejects.toThrow(/Allow FynHelp/);
    await expect(zoho.post(await world({ posting: false }), ctx, "l1", TXN)).rejects.toThrow(/off for this client/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses a line that is not a postable bank charge, a matched line, or another client's line", async () => {
    fakeZoho();
    await expect(zoho.post(await world({ txn: { description: "NEFT DR-RAMAN LOGISTICS-BILL-401", amount: 23600 } }), ctx, "l1", TXN)).rejects.toThrow(/Only bank charges/);
    await expect(zoho.post(await world({ txn: { match_status: "matched" } }), ctx, "l1", TXN)).rejects.toThrow(/already matched/);
    await expect(zoho.post(await world({ txn: { business_id: "other" } }), ctx, "l1", TXN)).rejects.toThrow(/not for this client/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("tells the partner to add the account when Zoho has no bank-charges account", async () => {
    fakeZoho((_m, url) => (url.includes("/chartofaccounts?") ? new Response(JSON.stringify({ code: 0, chartofaccounts: [{ account_id: "1", account_name: "Office Supplies" }] })) : undefined));
    await expect(zoho.post(await world(), ctx, "l1", TXN)).rejects.toThrow(/Bank Fees and Charges/);
  });

  it("a Zoho failure frees the line for another try; a timeout holds it until someone checks Zoho", async () => {
    const db = await world();
    fakeZoho((m, url) => (m === "POST" && url.includes("/expenses") ? new Response(JSON.stringify({ code: 1001, message: "Invalid value" }), { status: 400 }) : undefined));
    await expect(zoho.post(db, ctx, "l1", TXN)).rejects.toThrow(/Invalid value/);
    fakeZoho();
    await expect(zoho.post(db, ctx, "l1", TXN)).resolves.toMatchObject({ ok: true });

    const db2 = await world();
    fakeZoho((m, url) => {
      if (m === "POST" && url.includes("/expenses")) throw new Error("socket hang up");
      return undefined;
    });
    await expect(zoho.post(db2, ctx, "l1", TXN)).rejects.toThrow(/did not respond/);
    fakeZoho();
    await expect(zoho.post(db2, ctx, "l1", TXN)).rejects.toThrow(/already/i);
    expect(calls.filter((c) => c.method === "POST").length).toBe(0);
  });

  it("refuses a bank charge Zoho already has, even if FynHelp's last pull was before it", async () => {
    fakeZoho((m, url) => (m === "GET" && url.includes("/expenses?") ? new Response(JSON.stringify({ code: 0, expenses: [{ date: "2026-09-29", total: 590 }] })) : undefined));
    const db = await world();
    await expect(zoho.post(db, ctx, "l1", TXN)).rejects.toThrow(/already has an entry of ₹590/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(await zoho.listPostings(db, ctx)).toHaveLength(0);
  });

  it("refuses a receipt Zoho already holds, but posts one it does not", async () => {
    const invs = { code: 0, invoices: [{ invoice_id: "9", invoice_number: "INV-2602", customer_id: "cm", customer_name: "Mehta", total: 70800, balance: 40800, status: "overdue" }], page_context: { has_more_page: false } };
    const receipt = { direction: "in", amount: 30000, description: "NEFT CR-MEHTA FOODS LLP-INV-2602", txn_date: "2026-09-15" };
    fakeZoho((m, url) => {
      if (m === "GET" && url.includes("/invoices?")) return new Response(JSON.stringify(invs));
      if (m === "GET" && url.includes("/customerpayments?")) return new Response(JSON.stringify({ code: 0, customerpayments: [{ date: "2026-09-15", amount: 30000 }] }));
      return undefined;
    });
    await expect(zoho.post(await world({ txn: receipt }), ctx, "l1", TXN)).rejects.toThrow(/already has an entry of ₹30,000/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fakeZoho((m, url) => {
      if (m === "GET" && url.includes("/invoices?")) return new Response(JSON.stringify(invs));
      if (m === "POST" && url.includes("/customerpayments")) return new Response(JSON.stringify({ code: 0, payment: { payment_id: "P1" } }));
      return undefined;
    });
    await expect(zoho.post(await world({ txn: receipt }), ctx, "l1", TXN)).resolves.toMatchObject({ zohoId: "P1" });
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ customer_id: "cm", amount: 30000, invoices: [{ invoice_id: "9", amount_applied: 30000 }] });
  });

  it("undo deletes the entry in Zoho and marks it undone, once", async () => {
    fakeZoho();
    const db = await world();
    const r = await zoho.post(db, ctx, "l1", TXN);
    await zoho.undoPost(db, ctx, r.postingId);
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/expenses/E1"))).toBe(true);
    expect((await zoho.listPostings(db, ctx))[0]).toMatchObject({ status: "undone" });
    await expect(zoho.undoPost(db, ctx, r.postingId)).rejects.toThrow(/nothing to undo/);
    // After an undo the line can be posted again.
    await expect(zoho.post(db, ctx, "l1", TXN)).resolves.toMatchObject({ ok: true });
  });

  it("reads reconnect-worthy errors from Zoho as a plain instruction", async () => {
    fakeZoho((_m, url) => (url.includes("/books/v3") ? new Response(JSON.stringify({ code: 57, message: "You are not authorized" }), { status: 401 }) : undefined));
    await expect(zoho.openInvoices(await world(), ctx, "l1")).rejects.toThrow(/Reconnect Zoho Books/);
  });

  it("reads open invoices, skipping drafts and paid ones, across pages", async () => {
    const page = (n: number) => new Response(JSON.stringify({ code: 0, invoices: n === 1
      ? [{ invoice_id: "1", invoice_number: "INV-2602", customer_id: "c", customer_name: "Mehta", total: 70800, balance: 40800, status: "overdue" }, { invoice_id: "2", invoice_number: "INV-2606", customer_id: "c2", customer_name: "Kaveri", total: 84960, balance: 84960, status: "draft" }]
      : [{ invoice_id: "3", invoice_number: "INV-2607", customer_id: "c", customer_name: "Mehta", total: 53100, balance: 28100, status: "overdue" }], page_context: { has_more_page: n === 1 } }));
    fakeZoho((_m, url) => (url.includes("/invoices?") ? page(/[?&]page=2(&|$)/.test(url) ? 2 : 1) : undefined));
    const list = await zoho.openInvoices(await world(), ctx, "l1");
    expect(list.map((i) => i.number)).toEqual(["INV-2602", "INV-2607"]);
  });

  it("retries a rate-limited read but never a write", async () => {
    let reads = 0;
    fakeZoho((m, url) => {
      if (m === "GET" && url.includes("/invoices?") && reads++ === 0) return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
      if (m === "GET" && url.includes("/invoices?")) return new Response(JSON.stringify({ code: 0, invoices: [] }));
      return undefined;
    });
    await expect(zoho.openInvoices(await world(), ctx, "l1")).resolves.toEqual([]);
    expect(reads).toBe(2);
  });
});
