import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./_fakeDb";

let current: ReturnType<typeof fakeDb>;
vi.mock("@/lib/practice/billing.server", () => ({ loadBilling: async () => ({}), firmCanWork: async () => true }));
vi.mock("@/lib/practice/billing/plans", () => ({ accessFor: () => ({ whatsappChaser: true, features: "professional" }) }));
vi.mock("@/lib/practice/db.server", async (orig) => ({ ...(await orig<object>()), adminDb: async () => current }));
vi.mock("@/lib/practice/email.server", () => ({ isEmail: (s: string) => /@/.test(s), sendEmail: vi.fn(async () => ({ simulated: true })) }));

import { approveWhatsApp, runDueFollowups, sendFollowUp } from "@/lib/practice/chaser.server";
import { sendEmail } from "@/lib/practice/email.server";
import type { FirmContext } from "@/lib/practice/db.server";

const ctx = { firmId: "F1", firmName: "Sharma & Co", firmEmail: null, userId: "u1", role: "partner" } as FirmContext;
const NOW = new Date("2026-10-20T10:00:00Z");
const chase = (extra: Record<string, unknown> = {}) => ({
  id: "c1", ca_firm_id: "F1", business_id: "b1", title: "Missing bank statement", doc_types: [], period: "September 2026", due_date: null, notes: null,
  status: "open", managed_by: "practice", created_at: "2026-10-10T00:00:00Z", chaser_count: 0, max_follow_ups: 3, schedule_days: [0, 3, 7],
  escalated_at: null, last_chased_at: null, next_follow_up_at: "2026-10-10T00:00:00Z", contact_name: "Ravi Kumar", contact_email: null, contact_phone: "98450 12345", ...extra,
});
const seed = (over: { chase?: Record<string, unknown>; settings?: Record<string, unknown> | null } = {}) =>
  fakeDb({
    ca_firms: [{ id: "F1", firm_name: "Sharma & Co", email: "ca@sharma.in" }],
    ca_clients: [{ ca_firm_id: "F1", business_id: "b1", client_name: "Kaveri Fashions", client_email: null, client_phone: null, notes: null, do_not_disturb: false }],
    ca_document_requests: [chase(over.chase)],
    ca_wa_settings: over.settings === null ? [] : [{ ca_firm_id: "F1", enabled: true, mode: "approve", daily_limit: 100, consent_confirmed_at: "2026-10-01T00:00:00Z", ...over.settings }],
  });

let graphCalls: Record<string, unknown>[];
let graph: { status: number; json: unknown };
const row = () => current.tables["ca_document_requests"][0];
const events = (type: string) => current.tables["ca_chaser_events"]?.filter((e) => e.event_type === type) ?? [];

beforeEach(() => {
  process.env["WHATSAPP_PLATFORM_PHONE_NUMBER_ID"] = "PNID1";
  process.env["WHATSAPP_ACCESS_TOKEN"] = "tok";
  process.env["WHATSAPP_GRAPH_BASE"] = "https://graph.test/v21.0";
  graphCalls = [];
  graph = { status: 200, json: { messages: [{ id: "wamid.AAA" }] } };
  vi.mocked(sendEmail).mockClear();
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    graphCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify(graph.json), { status: graph.status });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env["WHATSAPP_PLATFORM_PHONE_NUMBER_ID"]; });

describe("automatic follow-ups on WhatsApp", () => {
  it("approve mode: prepares one draft per round, sends nothing, and does not use up the round", async () => {
    current = seed();
    const s = await runDueFollowups(NOW);
    expect(s).toMatchObject({ drafted: 1, sent: 0 });
    expect(graphCalls).toHaveLength(0);
    expect(row().chaser_count).toBe(0);
    expect(current.tables["ca_wa_messages"]).toHaveLength(1);
    expect(current.tables["ca_wa_messages"][0]).toMatchObject({ status: "draft", follow_up_number: 1, template: "fh_doc_request" });
    expect(events("whatsapp_draft")).toHaveLength(1);
    // the cron comes round again the next day: still one draft, not a pile
    await runDueFollowups(new Date(NOW.getTime() + 86_400_000 + 1000));
    expect(current.tables["ca_wa_messages"]).toHaveLength(1);
  });

  it("a partner's approval sends it, and that counts as the round", async () => {
    current = seed();
    await runDueFollowups(NOW);
    const id = current.tables["ca_wa_messages"][0].id as string;
    const r = await approveWhatsApp(current, ctx, [id]);
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    expect(graphCalls).toHaveLength(1);
    expect(graphCalls[0]).toMatchObject({ to: "919845012345", template: { name: "fh_doc_request" } });
    expect(row().chaser_count).toBe(1);
    expect(events("sent")[0]).toMatchObject({ channel: "whatsapp" });
    // approving the same one again does nothing
    expect(await approveWhatsApp(current, ctx, [id])).toMatchObject({ sent: 0 });
    expect(graphCalls).toHaveLength(1);
  });

  it("cancels a draft whose chase was resolved in the meantime", async () => {
    current = seed();
    await runDueFollowups(NOW);
    row().status = "resolved";
    const r = await approveWhatsApp(current, ctx, [current.tables["ca_wa_messages"][0].id as string]);
    expect(r).toMatchObject({ sent: 0, cancelled: 1 });
    expect(graphCalls).toHaveLength(0);
  });

  it("automatic mode: sends on schedule and uses up the round", async () => {
    current = seed({ settings: { mode: "auto" } });
    const s = await runDueFollowups(NOW);
    expect(s).toMatchObject({ sent: 1, drafted: 0 });
    expect(graphCalls).toHaveLength(1);
    expect(row().chaser_count).toBe(1);
    expect(current.tables["ca_wa_messages"][0]).toMatchObject({ status: "sent", wamid: "wamid.AAA" });
    expect(events("sent")[0]).toMatchObject({ channel: "whatsapp" });
    // a later round uses the reminder wording
    row().next_follow_up_at = "2026-10-10T00:00:00Z";
    row().last_chased_at = "2026-10-15T00:00:00Z";
    await runDueFollowups(new Date("2026-10-21T10:00:00Z"));
    expect(current.tables["ca_wa_messages"].map((m) => m.template)).toEqual(["fh_doc_request", "fh_doc_reminder"]);
  });

  it("automatic mode: gives the round back when WhatsApp refuses, to try tomorrow", async () => {
    current = seed({ settings: { mode: "auto" } });
    graph = { status: 400, json: { error: { code: 131026, message: "undeliverable" } } };
    const s = await runDueFollowups(NOW);
    expect(s).toMatchObject({ failed: 1, sent: 0 });
    expect(row().chaser_count).toBe(0);
    expect(Date.parse(row().next_follow_up_at as string)).toBeGreaterThan(NOW.getTime());
  });

  it("falls back to email for someone who opted out, and skips when there is no email either", async () => {
    current = seed({ settings: { mode: "auto" }, chase: { contact_email: "ravi@kaveri.in" } });
    current.tables["ca_wa_optouts"] = [{ phone_last10: "9845012345" }];
    await runDueFollowups(NOW);
    expect(graphCalls).toHaveLength(0);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(events("sent")[0]).toMatchObject({ channel: "email" });

    current = seed({ settings: { mode: "auto" } });
    current.tables["ca_wa_optouts"] = [{ phone_last10: "9845012345" }];
    const s = await runDueFollowups(NOW);
    expect(s.skipped).toBe(1);
    expect(graphCalls).toHaveLength(0);
  });

  it("leaves a firm that has not switched it on exactly as before", async () => {
    current = seed({ settings: null });
    const s = await runDueFollowups(NOW);
    expect(s).toMatchObject({ drafted: 0, sent: 0, skipped: 1 });
    expect(graphCalls).toHaveLength(0);
    expect(current.tables["ca_wa_messages"] ?? []).toHaveLength(0);
  });

  it("does nothing without the consent confirmation, even if switched on", async () => {
    current = seed({ settings: { consent_confirmed_at: null } });
    const s = await runDueFollowups(NOW);
    expect(s.drafted).toBe(0);
    expect(current.tables["ca_wa_messages"] ?? []).toHaveLength(0);
  });

  it("an email contact still gets email when WhatsApp is on but they have no number", async () => {
    current = seed({ settings: { mode: "auto" }, chase: { contact_email: "ravi@kaveri.in", contact_phone: null } });
    await runDueFollowups(NOW);
    expect(graphCalls).toHaveLength(0);
    expect(events("sent")[0]).toMatchObject({ channel: "email" });
  });
});

describe("the Send WhatsApp button", () => {
  it("sends from FynHelp's number when switched on (pressing it is the approval)", async () => {
    current = seed();
    const r = await sendFollowUp(current, ctx, "c1", "WhatsApp");
    expect(r).toMatchObject({ via: "fynhelp", follow_ups: 1 });
    expect(graphCalls).toHaveLength(1);
    expect(row().chaser_count).toBe(1);
  });

  it("says why when the message cannot go", async () => {
    current = seed();
    current.tables["ca_wa_optouts"] = [{ phone_last10: "9845012345" }];
    await expect(sendFollowUp(current, ctx, "c1", "WhatsApp")).rejects.toThrow(/STOP/);
    expect(row().chaser_count).toBe(0);
  });

  it("still gives the quick-send link when FynHelp's number is off", async () => {
    current = seed({ settings: null });
    const r = await sendFollowUp(current, ctx, "c1", "WhatsApp");
    expect(r).toMatchObject({ url: expect.stringContaining("https://wa.me/919845012345") });
    expect(graphCalls).toHaveLength(0);
  });
});
