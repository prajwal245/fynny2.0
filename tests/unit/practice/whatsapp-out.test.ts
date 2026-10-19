import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./_fakeDb";

let current: ReturnType<typeof fakeDb>;
let plan = { whatsappChaser: true, features: "professional" };
vi.mock("@/lib/practice/billing.server", () => ({ loadBilling: async () => ({}), firmCanWork: async () => true }));
vi.mock("@/lib/practice/billing/plans", () => ({ accessFor: () => plan }));
vi.mock("@/lib/practice/db.server", async (orig) => ({ ...(await orig<object>()), adminDb: async () => current }));
vi.mock("@/lib/practice/documents.server", () => ({
  BUCKET: "docs",
  processExtraction: async () => ({}),
  registerDocument: vi.fn(async () => ({ extraction_id: "x1", duplicate: false })),
}));

import * as out from "@/lib/practice/whatsappOut.server";
import { handleWhatsappWebhook } from "@/lib/practice/whatsapp.server";
import type { FirmContext } from "@/lib/practice/db.server";

const ctx = { firmId: "F1", firmName: "Sharma & Co", firmEmail: null, userId: "u1", role: "partner" } as FirmContext;
const CHASE = { chaseId: "c1", businessId: "b1", followUpNumber: 1, maxFollowUps: 3, doNotDisturb: false, firmId: "F1", phone: "98450 12345", chase: { contactName: "Ravi", firmName: "Sharma & Co", item: "bank statement for September 2026", clientName: "Kaveri Fashions" } };

let sent: { url: string; body: Record<string, unknown> }[];
let graphReply: { status: number; json: unknown };

beforeEach(() => {
  current = fakeDb({ ca_firms: [{ id: "F1", firm_name: "Sharma & Co" }] });
  plan = { whatsappChaser: true, features: "professional" };
  process.env["WHATSAPP_PLATFORM_PHONE_NUMBER_ID"] = "PNID1";
  process.env["WHATSAPP_ACCESS_TOKEN"] = "tok";
  process.env["WHATSAPP_GRAPH_BASE"] = "https://graph.test/v21.0";
  sent = [];
  graphReply = { status: 200, json: { messages: [{ id: "wamid.AAA" }] } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(graphReply.json), { status: graphReply.status });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env["WHATSAPP_PLATFORM_PHONE_NUMBER_ID"]; });

describe("WhatsApp settings", () => {
  it("will not switch on without the consent confirmation, and records who gave it", async () => {
    await expect(out.saveSettings(current, ctx, { enabled: true })).rejects.toThrow(/agreed/);
    const s = await out.saveSettings(current, ctx, { enabled: true, confirmConsent: true });
    expect(s.settings.enabled).toBe(true);
    expect(current.tables["ca_wa_settings"][0]).toMatchObject({ consent_confirmed_by: "u1" });
    // consent is remembered: switching off and on again does not ask twice
    await out.saveSettings(current, ctx, { enabled: false });
    await expect(out.saveSettings(current, ctx, { enabled: true })).resolves.toBeTruthy();
  });

  it("explains when FynHelp's number is not configured, or the plan has no WhatsApp", async () => {
    delete process.env["WHATSAPP_PLATFORM_PHONE_NUMBER_ID"];
    await expect(out.saveSettings(current, ctx, { enabled: true, confirmConsent: true })).rejects.toThrow(/isn't switched on/);
    process.env["WHATSAPP_PLATFORM_PHONE_NUMBER_ID"] = "PNID1";
    plan = { whatsappChaser: false, features: "starter" };
    await expect(out.saveSettings(current, ctx, { enabled: true, confirmConsent: true })).rejects.toThrow(/Firm and Scale/);
  });
});

describe("making and sending a round", () => {
  it("prepares a draft that names the firm, and sends it as the approved template", async () => {
    const made = await out.createFollowUp(current, CHASE);
    if ("blocked" in made) throw new Error(made.reason);
    expect(made.body).toContain("Sharma & Co needs the bank statement for September 2026 for Kaveri Fashions");
    expect(current.tables["ca_wa_messages"][0]).toMatchObject({ status: "draft", to_phone: "919845012345", template: "fh_doc_request" });
    const r = await out.sendDraft(current, made.id, "u1");
    expect(r).toEqual({ ok: true, wamid: "wamid.AAA" });
    expect(sent[0].url).toBe("https://graph.test/v21.0/PNID1/messages");
    expect(sent[0].body).toMatchObject({ to: "919845012345", type: "template", template: { name: "fh_doc_request", language: { code: "en" } } });
    expect(current.tables["ca_wa_messages"][0]).toMatchObject({ status: "sent", wamid: "wamid.AAA", approved_by: "u1" });
  });

  it("claims a draft once: sending it twice sends one message", async () => {
    const made = await out.createFollowUp(current, CHASE);
    if ("blocked" in made) throw new Error(made.reason);
    await Promise.all([out.sendDraft(current, made.id), out.sendDraft(current, made.id)]);
    expect(sent).toHaveLength(1);
  });

  it("will not prepare a message for a bad number, an opt-out, do-not-disturb, or a second one today", async () => {
    expect(await out.createFollowUp(current, { ...CHASE, phone: "123" })).toMatchObject({ blocked: "no_number" });
    expect(await out.createFollowUp(current, { ...CHASE, doNotDisturb: true })).toMatchObject({ blocked: "do_not_disturb" });
    await out.recordOptOut(current, "+91 98450 12345");
    expect(await out.createFollowUp(current, CHASE)).toMatchObject({ blocked: "opted_out" });
    current.tables["ca_wa_optouts"] = [];
    const first = await out.createFollowUp(current, CHASE);
    expect("id" in first).toBe(true);
    expect(await out.createFollowUp(current, CHASE)).toMatchObject({ blocked: "already_sent_today" });
    expect(sent).toHaveLength(0);
  });

  it("holds messages once the month's included allowance is used, and at the daily limit", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    // 500 earlier this month: the allowance, not the daily limit, is what stops the next one
    current.tables["ca_wa_messages"] = Array.from({ length: 500 }, (_, i) => ({ id: `m${i}`, ca_firm_id: "F1", chase_id: `other${i}`, status: "sent", created_at: "2026-10-02T09:00:00Z", to_last10: "1" }));
    expect(await out.createFollowUp(current, CHASE, now)).toMatchObject({ blocked: "monthly_limit" });
    // a bigger plan has room; now ten sent today hit a daily limit of ten
    plan = { whatsappChaser: true, features: "scale" };
    await out.saveSettings(current, ctx, { daily_limit: 10 });
    current.tables["ca_wa_messages"] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, ca_firm_id: "F1", chase_id: `x${i}`, status: "delivered", created_at: "2026-10-20T08:00:00Z", to_last10: "1" }));
    expect(await out.createFollowUp(current, CHASE, now)).toMatchObject({ blocked: "daily_limit" });
    current.tables["ca_wa_messages"].pop();
    expect("id" in (await out.createFollowUp(current, CHASE, now))).toBe(true);
  });

  it("never sends to someone who opted out after the draft was made", async () => {
    const made = await out.createFollowUp(current, CHASE);
    if ("blocked" in made) throw new Error(made.reason);
    current.tables["ca_wa_optouts"] = [{ phone_last10: "9845012345" }];
    const r = await out.sendDraft(current, made.id);
    expect(r).toMatchObject({ ok: false, cancelled: true });
    expect(sent).toHaveLength(0);
    expect(current.tables["ca_wa_messages"][0].status).toBe("cancelled");
  });

  it("records a failure in words a partner can act on", async () => {
    const made = await out.createFollowUp(current, CHASE);
    if ("blocked" in made) throw new Error(made.reason);
    graphReply = { status: 400, json: { error: { code: 131026, message: "Message undeliverable" } } };
    const r = await out.sendDraft(current, made.id);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/not on WhatsApp/) });
    expect(current.tables["ca_wa_messages"][0]).toMatchObject({ status: "failed", error: expect.stringMatching(/not on WhatsApp/) });
  });

  it("an opt-out cancels what is still waiting for that number, across firms", async () => {
    current.tables["ca_wa_messages"] = [
      { id: "d1", ca_firm_id: "F1", to_last10: "9845012345", status: "draft" },
      { id: "d2", ca_firm_id: "F2", to_last10: "9845012345", status: "draft" },
      { id: "d3", ca_firm_id: "F1", to_last10: "9000000000", status: "draft" },
    ];
    await out.recordOptOut(current, "919845012345");
    expect(current.tables["ca_wa_messages"].map((m) => m.status)).toEqual(["cancelled", "cancelled", "draft"]);
  });

  it("discards drafts only for its own firm", async () => {
    current.tables["ca_wa_messages"] = [{ id: "d1", ca_firm_id: "F1", status: "draft" }, { id: "d2", ca_firm_id: "F2", status: "draft" }];
    expect(await out.discardDrafts(current, ctx, ["d1", "d2"])).toEqual({ cancelled: 1 });
    expect(current.tables["ca_wa_messages"].map((m) => m.status)).toEqual(["cancelled", "draft"]);
  });
});

describe("the webhook on the shared number", () => {
  const msg = (extra: Record<string, unknown>) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID1" }, ...extra } }] }] });

  it("moves a message forward on delivered and read receipts, never back", async () => {
    current.tables["ca_wa_messages"] = [{ id: "m1", ca_firm_id: "F1", wamid: "wamid.X", status: "sent" }];
    await handleWhatsappWebhook(msg({ statuses: [{ id: "wamid.X", status: "read" }] }));
    expect(current.tables["ca_wa_messages"][0].status).toBe("read");
    await handleWhatsappWebhook(msg({ statuses: [{ id: "wamid.X", status: "delivered" }] }));
    expect(current.tables["ca_wa_messages"][0].status).toBe("read");
    const r = await handleWhatsappWebhook(msg({ statuses: [{ id: "wamid.NOPE", status: "read" }] }));
    expect(r[0].status).toMatch(/unknown/);
  });

  it("turns a STOP reply into an opt-out and confirms it", async () => {
    current.tables["ca_wa_messages"] = [{ id: "d1", ca_firm_id: "F1", to_last10: "9845012345", status: "draft" }];
    const r = await handleWhatsappWebhook(msg({ messages: [{ id: "in1", from: "919845012345", type: "text", text: { body: "STOP" } }] }));
    expect(r[0].status).toBe("opted out");
    expect(current.tables["ca_wa_optouts"]).toEqual([expect.objectContaining({ phone_last10: "9845012345" })]);
    expect(current.tables["ca_wa_messages"][0].status).toBe("cancelled");
    expect(sent.at(-1)!.body).toMatchObject({ type: "text", to: "919845012345" });
  });

  it("does not treat an ordinary sentence as STOP", async () => {
    const r = await handleWhatsappWebhook(msg({ messages: [{ id: "in2", from: "919845012345", type: "text", text: { body: "please do not stop the GST filing" } }] }));
    expect(r[0].status).toBe("ignored text");
    expect(current.tables["ca_wa_optouts"] ?? []).toHaveLength(0);
  });

  it("tells a sender it cannot place to ask their CA, rather than filing the document nowhere", async () => {
    const r = await handleWhatsappWebhook(msg({ messages: [{ id: "in3", from: "919000011111", type: "document", document: { id: "media1", filename: "a.pdf" } }] }));
    expect(r[0].status).toBe("no firm for sender");
    expect((sent.at(-1)!.body.text as { body: string }).body).toMatch(/which CA firm/);
  });
});

describe("routing a reply to the right firm", () => {
  it("prefers the firm that messaged them last, then the only firm that has them as a client", async () => {
    current.tables["ca_wa_messages"] = [
      { ca_firm_id: "F1", to_last10: "9845012345", status: "delivered", created_at: "2026-10-01T00:00:00Z" },
      { ca_firm_id: "F2", to_last10: "9845012345", status: "read", created_at: "2026-10-15T00:00:00Z" },
      { ca_firm_id: "F3", to_last10: "9845012345", status: "failed", created_at: "2026-10-19T00:00:00Z" },
    ];
    expect(await out.routeFirm(current, "919845012345", Date.parse("2026-10-20T00:00:00Z"))).toBe("F2");
    current.tables["ca_wa_messages"] = [];
    current.tables["ca_clients"] = [{ ca_firm_id: "F9", client_phone: "+91 98450 12345" }, { ca_firm_id: "F9", client_phone: "98450 12345" }];
    expect(await out.routeFirm(current, "919845012345")).toBe("F9");
    current.tables["ca_clients"].push({ ca_firm_id: "F8", client_phone: "9845012345" });
    expect(await out.routeFirm(current, "919845012345")).toBeNull();
  });
});
