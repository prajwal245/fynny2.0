// @vitest-environment node
/**
 * Gmail intake, end to end: a fake Gmail and Google token server, the real
 * intake code, a real database and storage. Runs only with GMAIL_E2E=1 and
 * the local stack (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY pointing at it).
 *
 *   GMAIL_E2E=1 E2E_FIRM_ID=… E2E_BUSINESS_ID=… npx vitest run tests/integration
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.GMAIL_E2E === "1";
const FIRM = process.env.E2E_FIRM_ID ?? "";
const CLIENT = process.env.E2E_BUSINESS_ID ?? "";
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "ramesh@sundaratextiles.in";
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "priya@raoassociates.in";
const PORT = 2600;

const b64u = (s: string | Uint8Array) =>
  Buffer.from(typeof s === "string" ? s : Buffer.from(s)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const stamp = Date.now();
const csv = (tag: string) => `Txn Date,Description,Debit,Credit,Balance\n02-09-2026,NEFT CR ${tag},,${(stamp % 9000) + 1000}.00,50000.00\n`;

type Part = Record<string, unknown>;
const att = (partId: string, filename: string, mimeType: string, content: string, headers: { name: string; value: string }[] = []) => ({
  partId,
  filename,
  mimeType,
  headers: [{ name: "Content-Disposition", value: `attachment; filename="${filename}"` }, ...headers],
  body: { attachmentId: `att-${partId}`, size: Buffer.byteLength(content) },
  __content: content,
});
const msg = (id: string, headers: Record<string, string>, parts: Part[], text = "Please find attached.") => ({
  id,
  internalDate: String(Date.now()),
  payload: {
    mimeType: "multipart/mixed",
    headers: Object.entries({ Subject: "Statement", ...headers }).map(([name, value]) => ({ name, value })),
    parts: [{ partId: "0", mimeType: "text/plain", body: { data: b64u(text), size: text.length } }, ...parts],
  },
});
const pass = "mx.google.com; dkim=pass; spf=pass; dmarc=pass";

// The inbox: one email per real-world case.
const sameStatement = csv(`DUP-${stamp}`);
const inbox: Record<string, ReturnType<typeof msg>> = {
  m1_client: msg(`m1-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": pass }, [
    att("1", "hdfc_sep.csv", "text/csv", sameStatement),
    { partId: "2", filename: "image001.png", mimeType: "image/png", headers: [{ name: "Content-Disposition", value: "inline" }, { name: "Content-ID", value: "<sig>" }], body: { attachmentId: "att-2", size: 5000 } },
    att("3", "meeting.ics", "text/calendar", "BEGIN:VCALENDAR"),
  ]),
  m2_unknown: msg(`m2-${stamp}`, { From: `Someone <new.contact.${stamp}@example-traders.in>`, "Authentication-Results": pass }, [att("1", "axis_aug.csv", "text/csv", csv(`UNK-${stamp}`))]),
  m3_forward: msg(
    `m3-${stamp}`,
    { From: `Priya <${STAFF_EMAIL}>`, "Authentication-Results": pass },
    [att("1", "kotak.csv", "text/csv", csv(`FWD-${stamp}`))],
    `FYI\n\n---------- Forwarded message ---------\nFrom: Ramesh <${CLIENT_EMAIL}>\nDate: Thu\n`,
  ),
  m4_spoof: msg(`m4-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": "mx.google.com; spf=fail; dmarc=fail" }, [att("1", "urgent.csv", "text/csv", csv(`SPOOF-${stamp}`))]),
  m5_duplicate: msg(`m5-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": pass }, [att("1", "hdfc_sep_again.csv", "text/csv", sameStatement)]),
  m6_system: msg(`m6-${stamp}`, { From: "FynHelp <noreply@fynhelp.com>" }, [att("1", "report.pdf", "application/pdf", "%PDF-1.4 x")]),
  m7_flaky: msg(`m7-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": pass }, [att("1", "flaky.csv", "text/csv", csv(`FLAKY-${stamp}`))]),
  m8_deleted: msg(`m8-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>` }, [att("1", "gone.csv", "text/csv", "x")]),
  m9_replyto: msg(`m9-${stamp}`, { From: `Assistant <assistant.${stamp}@gmail.com>`, "Reply-To": CLIENT_EMAIL, "Authentication-Results": pass }, [att("1", "icici.csv", "text/csv", csv(`RT-${stamp}`))]),
  m10_zip: msg(`m10-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": pass }, [att("1", "statements.zip", "application/zip", `PK\u0003\u0004zipdata-${stamp}`)]),
  m11_logos_only: msg(`m11-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": pass }, [att("1", "logo.png", "image/png", "x".repeat(3000))]),
};

let flakyFailures = 2;
let tokenMode: "ok" | "revoked" | "busy" = "ok";
let tokenCalls = 0;
let server: http.Server;

function findPart(parts: Part[], partId: string): Part | undefined {
  for (const p of parts) {
    if (p.partId === partId) return p;
    const inner = p.parts as Part[] | undefined;
    if (inner) {
      const f = findPart(inner, partId);
      if (f) return f;
    }
  }
}

const strip = (m: ReturnType<typeof msg>) => JSON.parse(JSON.stringify(m, (k, v) => (k === "__content" ? undefined : v)));

beforeAll(async () => {
  if (!RUN) return;
  process.env.GMAIL_API_BASE = `http://127.0.0.1:${PORT}/gmail/v1/users/me`;
  process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${PORT}/token`;
  process.env.GMAIL_CLIENT_ID ||= "test-client";
  process.env.GMAIL_CLIENT_SECRET ||= "test-secret";
  process.env.GMAIL_ENCRYPTION_KEY ||= "local-test-encryption-key";
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/token") {
      tokenCalls++;
      if (tokenMode === "revoked") return send(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
      if (tokenMode === "busy") return send(503, { error: "backend_error" });
      return send(200, { access_token: "fresh-token", expires_in: 3600 });
    }
    if ((req.headers.authorization ?? "") !== "Bearer fresh-token") return send(401, { error: { message: "Invalid Credentials", status: "UNAUTHENTICATED" } });
    const base = "/gmail/v1/users/me/messages";
    if (url.pathname === base) {
      const q = url.searchParams.get("q") ?? "";
      if (!q.includes("-from:me") || !q.includes("-in:spam")) return send(400, { error: { message: "query missing exclusions" } });
      // Gmail lists newest first; the inbox above is written oldest first.
      return send(200, { messages: Object.values(inbox).map((m) => ({ id: m.id, threadId: m.id })).reverse() });
    }
    const m = url.pathname.match(/^\/gmail\/v1\/users\/me\/messages\/([^/]+)(?:\/attachments\/([^/]+))?$/);
    if (m) {
      const message = Object.values(inbox).find((x) => x.id === m[1]);
      if (!message || message.id.startsWith("m8-")) return send(404, { error: { message: "Not Found", status: "NOT_FOUND" } });
      if (!m[2]) return send(200, strip(message));
      if (message.id.startsWith("m7-") && flakyFailures-- > 0) return send(503, { error: { message: "Backend Error" } });
      const part = findPart(message.payload.parts as Part[], String(m[2]).replace("att-", ""));
      return part ? send(200, { data: b64u(String(part.__content ?? "")) }) : send(404, { error: { message: "no attachment" } });
    }
    send(404, { error: { message: "unknown route" } });
  });
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

describe.runIf(RUN)("Gmail intake end to end", () => {
  let db: import("@/lib/practice/db.server").Db;
  let connId = "";

  const ledger = async (messageId: string) => {
    const { data } = await db.from("ca_gmail_processed").select("part_id, outcome, reason, extraction_id, business_id").eq("connection_id", connId).eq("message_id", messageId);
    return data ?? [];
  };
  const docsFor = async (messageId: string) => {
    const { data } = await db
      .from("ca_document_extractions")
      .select("id, business_id, original_filename, gmail_match_method, error_message, source_metadata, extract_status")
      .eq("ca_firm_id", FIRM)
      .eq("gmail_message_id", messageId);
    return data ?? [];
  };

  beforeAll(async () => {
    const { adminDb } = await import("@/lib/practice/db.server");
    const { encryptToken } = await import("@/lib/caGmail.server");
    db = await adminDb();
    // The firm's staff address must be known for forward detection.
    const { data: staff } = await db.from("ca_firm_members").select("id").eq("ca_firm_id", FIRM).eq("invited_email", STAFF_EMAIL).limit(1);
    if (!staff?.length) await db.from("ca_firm_members").insert({ ca_firm_id: FIRM, invited_email: STAFF_EMAIL, role: "junior", status: "invited" });
    const { data, error } = await db
      .from("ca_gmail_connections")
      .upsert(
        {
          ca_firm_id: FIRM,
          user_id: (await db.from("ca_firms").select("user_id").eq("id", FIRM).single()).data!.user_id,
          gmail_address: `inbox.${stamp}@raoassociates.in`,
          access_token_enc: await encryptToken("expired-token"),
          refresh_token_enc: await encryptToken("refresh-1"),
          // Expired: the first call must refresh.
          token_expiry: new Date(Date.now() - 60_000).toISOString(),
          is_active: true,
          last_polled_at: null,
        },
        { onConflict: "ca_firm_id,gmail_address" },
      )
      .select("id")
      .single();
    if (error) throw error;
    connId = data!.id;
  });

  it("files, skips and explains each kind of email correctly", async () => {
    const { pollGmailInboxes } = await import("@/lib/practice/gmailIntake.server");
    const s = await pollGmailInboxes({ firmId: FIRM, budgetMs: 60_000 });
    const inboxResult = s.inboxes.find((i) => i.gmail.startsWith(`inbox.${stamp}`))!;
    expect(inboxResult.error).toBeUndefined();
    expect(inboxResult.complete).toBe(true);
    expect(tokenCalls).toBeGreaterThan(0);

    // 1. Client's statement: filed; signature logo and invite skipped.
    const d1 = await docsFor(inbox.m1_client.id);
    expect(d1.map((d) => [d.original_filename, d.business_id])).toEqual([["hdfc_sep.csv", CLIENT]]);

    // 2. Unknown sender: waits in Unassigned with a reason.
    const d2 = await docsFor(inbox.m2_unknown.id);
    expect(d2).toHaveLength(1);
    expect(d2[0].business_id).toBeNull();
    expect(d2[0].error_message).toMatch(/not the email of any client/);

    // 3. Forwarded by staff: the client inside the forward is the sender.
    const d3 = await docsFor(inbox.m3_forward.id);
    expect(d3[0].business_id).toBe(CLIENT);
    expect(d3[0].gmail_match_method).toBe("exact_forwarded");

    // 4. Failed sender check: never filed automatically, client suggested.
    const d4 = await docsFor(inbox.m4_spoof.id);
    expect(d4[0].business_id).toBeNull();
    expect((d4[0].source_metadata as Record<string, unknown>).suggested_business_id).toBe(CLIENT);
    expect(d4[0].error_message).toMatch(/could not verify/);

    // 5. The same statement again: recognised, not stored twice.
    expect(await docsFor(inbox.m5_duplicate.id)).toHaveLength(0);
    expect((await ledger(inbox.m5_duplicate.id)).find((l) => l.part_id === "1")?.outcome).toBe("duplicate");

    // 6. FynHelp's own email: ignored.
    expect((await ledger(inbox.m6_system.id))[0].outcome).toBe("skipped");

    // 7. Google failed twice on the attachment: retried and filed.
    expect((await docsFor(inbox.m7_flaky.id))[0]?.business_id).toBe(CLIENT);

    // 8. Deleted between listing and reading: skipped without error.
    expect((await ledger(inbox.m8_deleted.id))[0].reason).toMatch(/deleted/);

    // 9. Sent from another address, Reply-To is the client: filed.
    expect((await docsFor(inbox.m9_replyto.id))[0]?.business_id).toBe(CLIENT);

    // 10. Zip: taken so the firm sees a clear message from Extract.
    expect(await docsFor(inbox.m10_zip.id)).toHaveLength(1);

    // 11. Only a logo: no document, recorded why.
    const l11 = await ledger(inbox.m11_logos_only.id);
    expect(l11[0].outcome).toBe("skipped");
    expect(l11[0].reason).toMatch(/no documents/);
  }, 120_000);

  it("never handles the same email twice, even when checks overlap", async () => {
    const { pollGmailInboxes } = await import("@/lib/practice/gmailIntake.server");
    const before = (await db.from("ca_document_extractions").select("id", { count: "exact", head: true }).eq("ca_firm_id", FIRM)).count;
    inbox.m12_new = msg(`m12-${stamp}`, { From: `Ramesh <${CLIENT_EMAIL}>`, "Authentication-Results": pass }, [att("1", "late.csv", "text/csv", csv(`LATE-${stamp}`))]);
    // Two checks at the same moment.
    await Promise.all([pollGmailInboxes({ firmId: FIRM, budgetMs: 60_000 }), pollGmailInboxes({ firmId: FIRM, budgetMs: 60_000 })]);
    const after = (await db.from("ca_document_extractions").select("id", { count: "exact", head: true }).eq("ca_firm_id", FIRM)).count;
    expect((after ?? 0) - (before ?? 0)).toBe(1);
    expect(await docsFor(inbox.m12_new.id)).toHaveLength(1);
  }, 120_000);

  it("reads what arrived into transactions", async () => {
    const { processQueue } = await import("@/lib/practice/documents.server");
    await processQueue(20);
    const [d] = await docsFor(inbox.m1_client.id);
    const { data: fresh } = await db.from("ca_document_extractions").select("extract_status").eq("id", d.id).single();
    expect(["parsed", "needs_review"]).toContain(fresh!.extract_status);
    const { count } = await db.from("ca_txns").select("id", { count: "exact", head: true }).eq("extraction_id", d.id);
    expect(count).toBeGreaterThan(0);
    const [z] = await docsFor(inbox.m10_zip.id);
    const { data: zip } = await db.from("ca_document_extractions").select("extract_status, error_message").eq("id", z.id).single();
    expect(zip!.extract_status).toBe("failed");
  }, 180_000);

  it("learns a sender once a person files their document", async () => {
    const { assignDocument } = await import("@/lib/practice/documents.server");
    const { pollGmailInboxes } = await import("@/lib/practice/gmailIntake.server");
    const [d2] = await docsFor(inbox.m2_unknown.id);
    const { data: firm } = await db.from("ca_firms").select("user_id, firm_name").eq("id", FIRM).single();
    await assignDocument(db, { firmId: FIRM, firmName: firm!.firm_name, firmEmail: null, userId: firm!.user_id, role: "owner" }, d2.id, CLIENT);
    inbox.m13_learned = msg(`m13-${stamp}`, { From: `Someone <new.contact.${stamp}@example-traders.in>`, "Authentication-Results": pass }, [att("1", "sep2.csv", "text/csv", csv(`LEARN-${stamp}`))]);
    await pollGmailInboxes({ firmId: FIRM, budgetMs: 60_000 });
    const [d13] = await docsFor(inbox.m13_learned.id);
    expect(d13.business_id).toBe(CLIENT);
    expect(d13.gmail_match_method).toBe("learned");
  }, 120_000);

  it("keeps the inbox connected through Google hiccups, disconnects only when access is revoked", async () => {
    const { pollGmailInboxes } = await import("@/lib/practice/gmailIntake.server");
    await db.from("ca_gmail_connections").update({ token_expiry: new Date(Date.now() - 1000).toISOString(), refresh_locked_until: null }).eq("id", connId);
    tokenMode = "busy";
    await pollGmailInboxes({ firmId: FIRM, budgetMs: 30_000 });
    let { data: c } = await db.from("ca_gmail_connections").select("is_active, error_message").eq("id", connId).single();
    expect(c!.is_active).toBe(true);
    expect(c!.error_message).toMatch(/retrying/i);

    tokenMode = "revoked";
    await db.from("ca_gmail_connections").update({ refresh_locked_until: null }).eq("id", connId);
    await pollGmailInboxes({ firmId: FIRM, budgetMs: 30_000 });
    ({ data: c } = await db.from("ca_gmail_connections").select("is_active, error_message").eq("id", connId).single());
    expect(c!.is_active).toBe(false);
    expect(c!.error_message).toMatch(/connect Gmail again/);
  }, 120_000);
});
