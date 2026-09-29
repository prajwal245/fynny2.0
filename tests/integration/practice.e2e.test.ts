// @vitest-environment node
/**
 * End-to-end test of the practice backend against a real Postgres (with the
 * real migration applied) behind PostgREST, plus an in-memory storage mock.
 * Skipped unless PRACTICE_E2E_REST points at a PostgREST for that database.
 *
 *   python3 tests/integration/stub-schema.py > /tmp/stubs.sql
 *   psql -d e2e -f /tmp/stubs.sql -f supabase/migrations/20260927120000_practice_backend.sql
 *   postgrest (db-schemas=public, jwt-secret=$PRACTICE_E2E_JWT_SECRET)
 *   PRACTICE_E2E_REST=http://localhost:54399 PRACTICE_E2E_JWT_SECRET=... npx vitest run tests/integration
 */
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REST = process.env.PRACTICE_E2E_REST;
const SECRET = process.env.PRACTICE_E2E_JWT_SECRET ?? "";

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function jwt(payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

const files = new Map<string, Buffer>();
let server: http.Server;

/** Supabase-shaped gateway: /rest/v1 → PostgREST, /storage/v1 → in-memory objects. */
function startGateway(): Promise<string> {
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname.startsWith("/rest/v1")) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers))
        if (
          typeof v === "string" &&
          !["host", "content-length", "connection"].includes(k)
        )
          headers[k] = v;
      const r = await fetch(
        `${REST}${url.pathname.slice("/rest/v1".length)}${url.search}`,
        {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method!) ? undefined : body,
        },
      );
      res.writeHead(
        r.status,
        Object.fromEntries(
          [...r.headers.entries()].filter(
            ([k]) =>
              ![
                "content-encoding",
                "transfer-encoding",
                "content-length",
              ].includes(k),
          ),
        ),
      );
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const m = url.pathname.match(/^\/storage\/v1\/object\/(sign\/)?(.+)$/);
    if (m) {
      const key = decodeURIComponent(m[2]);
      if (m[1]) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ signedURL: `/object/sign/${key}?token=t` }));
        return;
      }
      if (req.method === "POST" || req.method === "PUT") {
        files.set(key, body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ Key: key, path: key }));
        return;
      }
      if (req.method === "DELETE") {
        const { prefixes } = JSON.parse(body.toString() || "{}") as {
          prefixes?: string[];
        };
        for (const p of prefixes ?? []) files.delete(`${key}/${p}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
        return;
      }
      const f = files.get(key);
      if (!f) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "not found", statusCode: "404" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(f);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) =>
    server.listen(0, () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );
}

const BANK_CSV = `HDFC BANK Ltd.
Statement From : 01/09/2026 To : 30/09/2026

Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/09/26,NEFT CR-HDFC0001234-SUNDARA TEXTILES PVT LTD-INV 1042,HDFCN52026090112345,01/09/26,,"1,25,000.00","5,25,000.00"
03/09/26,IMPS/P2A/624599999999/RAMESH KUMAR,624599999999,03/09/26,"15,000.00",,"5,10,000.00"
05/09/26,SMS CHGS FOR QTR,,05/09/26,17.70,,"5,09,982.30"
10/09/26,NEFT CR-ICIC0004321-VIREO FOODS LLP,ICICN52026091000001,10/09/26,,"40,000.00","5,49,982.30"
12/09/26,POS 4321 CAFE COFFEE DAY,,12/09/26,999.00,,"5,48,983.30"
12/09/26,POS 4321 CAFE COFFEE DAY,,12/09/26,999.00,,"5,47,984.30"
20/09/26,Stripe payout,,20/09/26,,1200.00 USD,
`;

const TALLY_XML = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><DATE>20260901</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>R-12</VOUCHERNUMBER><PARTYLEDGERNAME>Sundara Textiles Pvt Ltd</PARTYLEDGERNAME>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sundara Textiles Pvt Ltd</LEDGERNAME><AMOUNT>125000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>-125000.00</AMOUNT><BANKALLOCATIONS.LIST><INSTRUMENTNUMBER>HDFCN52026090112345</INSTRUMENTNUMBER></BANKALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>
<TALLYMESSAGE><VOUCHER VCHTYPE="Payment"><DATE>20260904</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>P-7</VOUCHERNUMBER><PARTYLEDGERNAME>Ramesh Kumar</PARTYLEDGERNAME>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Ramesh Kumar</LEDGERNAME><AMOUNT>-15000</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>15000</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>
<TALLYMESSAGE><VOUCHER VCHTYPE="Payment"><DATE>20260930</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>P-9</VOUCHERNUMBER><NARRATION>Bank charges for Sept</NARRATION>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Charges</LEDGERNAME><AMOUNT>-17.70</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>17.70</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>
<TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><DATE>20260909</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>R-13</VOUCHERNUMBER><PARTYLEDGERNAME>Vireo Foods LLP</PARTYLEDGERNAME>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Vireo Foods LLP</LEDGERNAME><AMOUNT>50000</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Bank A/c</LEDGERNAME><AMOUNT>-50000</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

const PURCHASE_CSV = `Date,Particulars,Voucher No,Amount
28/09/2026,Purchase invoice INV-88 Amazon India,PV-88,2499.00 DR`;

describe.skipIf(!REST)("practice backend end to end", () => {
  const USER = "11111111-1111-4111-8111-111111111111";
  let db: import("@/lib/practice/db.server").Db;
  let ctx: import("@/lib/practice/db.server").FirmContext;
  let businessId: string;

  beforeAll(async () => {
    const gw = await startGateway();
    process.env.SUPABASE_URL = gw;
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt({ role: "service_role" });
    process.env.PRACTICE_AI_DISABLED = "1";
    delete process.env.RESEND_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.LOVABLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { adminDb } = await import("@/lib/practice/db.server");
    db = await adminDb();
    for (const t of [
      "ca_ai_calls",
      "ca_recon_matches",
      "ca_exceptions",
      "ca_review_items",
      "ca_txns",
      "ca_chaser_events",
      "ca_document_requests",
      "ca_document_extractions",
      "ca_recon_runs",
      "ca_reports_log",
      "ca_activity_log",
      "ca_notifications",
      "ca_client_access",
      "ca_clients",
      "ca_firm_members",
      "ca_firms",
      "businesses",
    ]) {
      await db.from(t).delete().not("id", "is", null);
    }
    await db.from("ca_firms").insert({
      user_id: USER,
      firm_name: "Rao & Co",
      email: "partner@raoco.in",
    });
  });
  afterAll(() => new Promise<void>((r) => server?.close(() => r())));

  async function upload(
    name: string,
    content: string,
    side?: "bank" | "books",
  ) {
    const { registerDocument } =
      await import("@/lib/practice/documents.server");
    const path = `${ctx.firmId}/${businessId}/v2/${Date.now()}_${name}`;
    files.set(`ca-client-documents/${path}`, Buffer.from(content));
    return registerDocument(
      db,
      { firmId: ctx.firmId, userId: USER },
      {
        storage_path: path,
        filename: name,
        mime: null,
        business_id: businessId,
        side,
        channel: "Manual",
      },
    );
  }

  it("resolves the firm and creates a client with a businesses row", async () => {
    const { firmContext } = await import("@/lib/practice/db.server");
    ctx = await firmContext(db, USER);
    expect(ctx).toMatchObject({ firmName: "Rao & Co", role: "owner" });
    const { createPracticeClient } =
      await import("@/lib/practice/clients.server");
    const created = await createPracticeClient(db, ctx, {
      name: "Sundara Textiles Pvt Ltd",
      entityType: "Private Limited",
      email: "ramesh@sundara.in",
      phone: "9845012345",
      contactName: "Ramesh",
    });
    businessId = created.id;
    const { data: biz } = await db
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .maybeSingle();
    expect(biz?.id).toBe(businessId);
  });

  it("extracts a bank CSV: transactions, review items, in-file duplicates", async () => {
    const res = await upload("hdfc_statement_sep.csv", BANK_CSV);
    expect(res.duplicate).toBe(false);
    const { data: doc } = await db
      .from("ca_document_extractions")
      .select("*")
      .eq("id", res.extraction_id)
      .single();
    expect(doc).toMatchObject({
      extract_status: "needs_review",
      side: "bank",
      txn_count: 5,
      review_count: 2,
      duplicate_count: 1,
    });
    const { data: review } = await db
      .from("ca_review_items")
      .select("reason")
      .eq("extraction_id", res.extraction_id);
    expect(review!.map((r) => r.reason).join(" ")).toMatch(/Identical to row/);
    expect(review!.map((r) => r.reason).join(" ")).toMatch(/USD/);
  });

  it("treats the same file arriving twice as one document", async () => {
    const res = await upload("hdfc_statement_sep_copy.csv", BANK_CSV);
    expect(res.duplicate).toBe(true);
    const { count } = await db
      .from("ca_txns")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    expect(count).toBe(5);
  });

  it("extracts Tally XML as books and confirms/discards review items", async () => {
    const res = await upload("tally_daybook_sep.xml", TALLY_XML);
    const { data: doc } = await db
      .from("ca_document_extractions")
      .select("extract_status, side, txn_count")
      .eq("id", res.extraction_id)
      .single();
    expect(doc).toMatchObject({
      extract_status: "parsed",
      side: "books",
      txn_count: 4,
    });

    const { resolveReviewItem } =
      await import("@/lib/practice/documents.server");
    const { data: items } = await db
      .from("ca_review_items")
      .select("id, reason")
      .eq("business_id", businessId)
      .eq("status", "open");
    const dup = items!.find((i) => /Identical/.test(i.reason))!;
    const usd = items!.find((i) => /USD/.test(i.reason))!;
    await resolveReviewItem(db, ctx, dup.id, "confirm"); // a genuine second coffee
    await resolveReviewItem(db, ctx, usd.id, "discard");
    const { data: bankDoc } = await db
      .from("ca_document_extractions")
      .select("extract_status, review_count")
      .eq("side", "bank")
      .single();
    expect(bankDoc).toMatchObject({
      extract_status: "parsed",
      review_count: 0,
    });
  });

  it("runs recon, is idempotent on re-run, and explains exceptions", async () => {
    const { runRecon } = await import("@/lib/practice/recon.server");
    const first = await runRecon(db, ctx, businessId, "September 2026");
    expect(first.matched).toBe(3); // exact receipt, fuzzy payment, bank-charge rule
    expect(first.matched_by_stage).toMatchObject({
      exact: 1,
      fuzzy: 1,
      rules: 1,
    });
    const { data: ex } = await db
      .from("ca_exceptions")
      .select("reason_code, txn_side")
      .eq("business_id", businessId)
      .eq("status", "open");
    const codes = ex!.map((e) => `${e.txn_side}:${e.reason_code}`).sort();
    expect(codes).toContain("bank:partial_payment_suspect");
    expect(codes).toContain("books:partial_payment_suspect");
    expect(codes.filter((c) => c === "bank:duplicate_suspect")).toHaveLength(2);

    const second = await runRecon(db, ctx, businessId, "September 2026");
    expect(second.matched).toBe(0);
    const { count: openAfter } = await db
      .from("ca_exceptions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "open");
    expect(openAfter).toBe(ex!.length);
    const { count: matches } = await db
      .from("ca_recon_matches")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "active");
    expect(matches).toBe(3);
  });

  it("resolves exceptions: manual match, external, ignore", async () => {
    const { resolveException } = await import("@/lib/practice/recon.server");
    const { data: ex } = await db
      .from("ca_exceptions")
      .select("id, reason_code, txn_side, candidates")
      .eq("business_id", businessId)
      .eq("status", "open");
    const partial = ex!.find(
      (e) =>
        e.reason_code === "partial_payment_suspect" && e.txn_side === "bank",
    )!;
    const res = await resolveException(
      db,
      ctx,
      partial.id,
      "match",
      [],
      "Part payment against R-13",
    );
    expect(res).toMatchObject({ status: "resolved", amount_difference: 10000 });
    const { data: still } = await db
      .from("ca_exceptions")
      .select("id, reason_code, txn_side")
      .eq("business_id", businessId)
      .eq("status", "open");
    expect(
      still!.some((e) => e.reason_code === "partial_payment_suspect"),
    ).toBe(false); // the book side closed too
    const dups = still!.filter((e) => e.reason_code === "duplicate_suspect");
    await resolveException(
      db,
      ctx,
      dups[0].id,
      "reconciled_external",
      [],
      "Card spend, booked in petty cash",
    );
    await resolveException(db, ctx, dups[1].id, "ignore");
    const { count } = await db
      .from("ca_exceptions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "open");
    expect(count).toBe(0);
  });

  it("generates an MIS from matched transactions only, with click-through", async () => {
    const { generateReport, numberSources, signOffReport } =
      await import("@/lib/practice/narrate.server");
    const report = await generateReport(
      db,
      ctx,
      businessId,
      "September 2026",
      "Monthly MIS",
    );
    const n = report.content.summary_numbers as Record<
      string,
      { value: number; txn_ids: string[] }
    >;
    expect(n.total_receipts.value).toBe(165000);
    expect(n.total_payments.value).toBe(16016.7); // 15,000 + 17.70 + 999 (external); the ignored duplicate is out
    expect(n.closing_balance.value).toBe(547984.3);
    expect(report.content.insights.length).toBeGreaterThan(0);
    for (const i of report.content.insights)
      expect(
        i.cited_transaction_ids.every((id: string) =>
          n.matched_count.txn_ids.includes(id),
        ),
      ).toBe(true);
    const src = await numberSources(db, ctx, report.id, "total_receipts");
    expect(
      src.transactions.map((t) => Number(t.amount)).sort((a, b) => a - b),
    ).toEqual([40000, 125000]);
    await signOffReport(db, ctx, report.id, "CA Rao");
    const { data: row } = await db
      .from("ca_reports_log")
      .select("status, signed_off_at")
      .eq("id", report.id)
      .single();
    expect(row!.status).toBe("signed_off");
  });

  it("chases on schedule, never twice a day, and auto-resolves when the document arrives", async () => {
    const { createChase, runDueFollowups } =
      await import("@/lib/practice/chaser.server");
    const chase = await createChase(db, ctx, {
      business_id: businessId,
      type: "Missing invoice",
      contact: "Ramesh",
      phone: "9845012345",
      period: "September 2026",
    });
    const s1 = await runDueFollowups(new Date(), ctx.firmId);
    expect(s1).toMatchObject({ simulated: 1 });
    const s2 = await runDueFollowups(new Date(), ctx.firmId);
    expect(s2.simulated + s2.sent).toBe(0);
    const { data: after } = await db
      .from("ca_document_requests")
      .select("chaser_count, contact_email")
      .eq("id", chase.id)
      .single();
    expect(after).toMatchObject({
      chaser_count: 1,
      contact_email: "ramesh@sundara.in",
    });

    await upload("purchase_register_sep.csv", PURCHASE_CSV, "books");
    const { data: closed } = await db
      .from("ca_document_requests")
      .select("status, resolved_reason")
      .eq("id", chase.id)
      .single();
    expect(closed).toMatchObject({
      status: "fulfilled",
      resolved_reason: "document_received",
    });
    const { data: events } = await db
      .from("ca_chaser_events")
      .select("event_type")
      .eq("chaser_id", chase.id)
      .order("created_at");
    expect(events!.map((e) => e.event_type)).toEqual([
      "created",
      "sent",
      "auto_resolved",
    ]);
  });

  it("serves the whole workspace in v2 shapes and a full transaction history", async () => {
    const { loadWorkspace } = await import("@/lib/practice/workspace.server");
    const w = await loadWorkspace(db, ctx);
    expect(w.clients[0]).toMatchObject({
      id: businessId,
      name: "Sundara Textiles Pvt Ltd",
    });
    expect(w.docs.length).toBe(3);
    expect(w.docs.every((d) => d.status === "Parsed")).toBe(true);
    expect(w.reports[0].template).toBe("Monthly MIS");
    expect(w.chases[0].status).toBe("Resolved");
    // Live counts: 3 auto matches + 1 manual + 1 external; the ignored duplicate is out of the total.
    expect(w.recon[businessId]).toMatchObject({
      matched: 5,
      bank: 5,
      exceptions: 0,
    });

    const { transactionHistory } = await import("@/lib/practice/recon.server");
    const { data: t } = await db
      .from("ca_txns")
      .select("id")
      .eq("business_id", businessId)
      .eq("side", "bank")
      .eq("amount", 125000)
      .single();
    const h = await transactionHistory(db, ctx, t!.id);
    expect(h.matches[0].match_stage).toBe("exact");
    expect(h.counterparts[0].side).toBe("books");
    expect(h.source_document?.original_filename).toBe("hdfc_statement_sep.csv");
  });
});
