/**
 * Rehearsal of the shipped Zoho agent on the live test organisation (FYNHELP TEST DATA).
 * The invoice list below is what Zoho's /invoices?status=unpaid returned on 2026-10-27, trimmed to
 * the fields FynHelp reads. It goes through FynHelp's real reader, then through the posting rules
 * against the sample bank statement.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as zoho from "@/lib/practice/zoho.server";
import { owedSummary } from "@/lib/practice/zohoLink";
import { postable, preview, type BankTxn } from "@/lib/practice/zohoPosting";
import type { Db, FirmContext } from "@/lib/practice/db.server";

const LIVE_UNPAID = [
  { invoice_id: "4244721000000043008", invoice_number: "INV-2607", customer_id: "4244721000000040001", customer_name: "Mehta Foods LLP", status: "overdue", date: "2026-09-12", due_date: "2026-10-12", total: 53100, balance: 28100 },
  { invoice_id: "4244721000000046008", invoice_number: "INV-2604", customer_id: "4244721000000034167", customer_name: "Orion IT Services Pvt Ltd", status: "overdue", date: "2026-09-06", due_date: "2026-10-06", total: 177000, balance: 77000 },
  { invoice_id: "4244721000000047001", invoice_number: "INV-2603", customer_id: "4244721000000038002", customer_name: "Sundar Auto Components", status: "overdue", date: "2026-09-04", due_date: "2026-10-04", total: 100300, balance: 50300 },
  { invoice_id: "4244721000000046001", invoice_number: "INV-2602", customer_id: "4244721000000040001", customer_name: "Mehta Foods LLP", status: "overdue", date: "2026-09-03", due_date: "2026-10-03", total: 70800, balance: 40800 },
  { invoice_id: "4244721000000045001", invoice_number: "INV-2601", customer_id: "4244721000000039001", customer_name: "Kaveri Textiles Pvt Ltd", status: "overdue", date: "2026-09-02", due_date: "2026-09-02", total: 118000, balance: 18000 },
];
// Zoho also holds INV-2605, 2606, 2608, 2609, 2610 as drafts; the unpaid filter does not return them.
const DRAFT_ONLY = ["INV-2605", "INV-2606", "INV-2608", "INV-2609", "INV-2610"];

const ctx: FirmContext = { firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId: "u1", role: "partner" };
async function db(): Promise<Db> {
  const enc = await (await import("@/lib/caGmail.server")).encryptToken("tok");
  const rows: Record<string, Record<string, unknown>[]> = {
    ca_zoho_connections: [{ id: "c1", ca_firm_id: "f1", accounts_server: "https://accounts.zoho.in", api_domain: "https://www.zohoapis.in", refresh_token_enc: enc, access_token_enc: enc, access_expires_at: new Date(Date.now() + 3.6e6).toISOString(), status: "connected" }],
    ca_zoho_links: [{ id: "l1", ca_firm_id: "f1", business_id: "b1", organization_id: "60093542506", account_id: "a1", account_name: "HDFC", posting_enabled: true }],
  };
  const from = (n: string) => {
    let r = rows[n] ?? [];
    const q: Record<string, unknown> = {};
    q["select"] = () => q;
    q["eq"] = (k: string, v: unknown) => ((r = r.filter((x) => x[k] === v)), q);
    q["maybeSingle"] = async () => ({ data: r[0] ?? null, error: null });
    return q;
  };
  return { from } as unknown as Db;
}

beforeEach(() => {
  process.env["GMAIL_ENCRYPTION_KEY"] = "k";
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: 0, invoices: LIVE_UNPAID, page_context: { has_more_page: false } })));
});
afterEach(() => vi.unstubAllGlobals());

function bankLines(): BankTxn[] {
  const csv = readFileSync("public/samples/zoho-test/bank_statement_sep2026.csv", "utf8").split("\n").slice(5).filter(Boolean);
  return csv.map((line, i) => {
    const c = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, ""));
    const [d, m, y] = c[0]!.split("/");
    const wd = Number((c[4] ?? "").replace(/,/g, "")) || 0;
    const dep = Number((c[5] ?? "").replace(/,/g, "")) || 0;
    return { id: `t${i}`, date: `20${y}-${m}-${d}`, amount: wd || dep, direction: dep ? "in" : "out", description: c[1]!, reference: c[2] };
  });
}

describe("shipped Zoho agent on the live test organisation", () => {
  it("reads open invoices as Zoho returns them and totals what is owed", async () => {
    const list = await zoho.openInvoices(await db(), ctx, "l1");
    expect(list.map((i) => i.number).sort()).toEqual(["INV-2601", "INV-2602", "INV-2603", "INV-2604", "INV-2607"]);
    for (const n of DRAFT_ONLY) expect(list.some((i) => i.number === n)).toBe(false);
    const s = owedSummary(list, "2026-10-27");
    expect(s).toMatchObject({ count: 5, total: 214200, overdueCount: 5, overdueTotal: 214200 });
    expect(s.top[0]).toEqual({ customer: "Orion IT Services Pvt Ltd", balance: 77000 });
  });

  it("over the whole bank statement the rules offer the bank charge and the three receipts that fit an open invoice, and nothing else", async () => {
    const open = await zoho.openInvoices(await db(), ctx, "l1");
    const results = bankLines().map((t) => [t.description, postable(t, open).kind] as const);
    expect(results).toHaveLength(10);
    expect(results.filter(([, k]) => k === "bank_charge").map(([d]) => d)).toEqual(["BANK CHARGES SEP 2026 INCL GST"]);
    // INV-2601 and INV-2604 were paid ₹1,00,000 each but owe less now: refused. The walk-in UPI names no invoice. Vendor payments are not postable.
    expect(results.filter(([, k]) => k === "receipt").map(([d]) => /INV-\d+/.exec(d)![0]).sort()).toEqual(["INV-2602", "INV-2603", "INV-2607"]);
    expect(results.filter(([, k]) => k === "none")).toHaveLength(6);
    // The three receipts are already in Zoho as payments; the live duplicate check (zoho-posting-flow) is what stops FynHelp posting them again.
  });

  it("would post a new part-receipt for INV-2602 and show what is left due", async () => {
    const open = await zoho.openInvoices(await db(), ctx, "l1");
    const t: BankTxn = { id: "tx", date: "2026-10-28", amount: 10000, direction: "in", description: "NEFT CR-MEHTA FOODS LLP-INV-2602" };
    const p = postable(t, open);
    expect(p.kind).toBe("receipt");
    if (p.kind !== "receipt") return;
    const v = preview(t, p, "HDFC");
    expect(v.lines.find(([k]) => k === "Applied to")![1]).toContain("30,800.00 after");
    // The same narration for more than is due is refused.
    expect(postable({ ...t, amount: 45000 }, open).kind).toBe("none");
    // A draft invoice is not a receivable.
    expect(postable({ ...t, description: "NEFT CR KAVERI INV-2606", amount: 1000 }, open).kind).toBe("none");
  });
});
