// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReplyButtons,
  buildTemplateMessage,
  buttonPayloadOf,
  buildDateButtons,
  CHASE_ACTION_RULES,
  CHASE_BUTTON_LABEL,
  chaseText,
  stageForStep,
  chaseButtonComponents,
  chasePayload,
  chaseTextWithLink,
  parseChasePayload,
} from "@/lib/practice/whatsappFlow";
import { hashToken, looksLike, newToken, uploadUrl } from "@/lib/practice/uploadLinks.server";

const ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

describe("chase buttons", () => {
  it("a payload names the chase and the action, and nothing else parses", () => {
    expect(parseChasePayload(chasePayload(ID, "sending"))).toEqual({ chaseId: ID, action: "sending" });
    expect(parseChasePayload(chasePayload(ID.toUpperCase(), "later"))).toEqual({ chaseId: ID, action: "later" });
    expect(parseChasePayload(`chase:${ID}:delete`)).toBeNull();
    expect(parseChasePayload("chase:not-a-uuid:stop")).toBeNull();
    expect(parseChasePayload(null)).toBeNull();
    expect(parseChasePayload(`x chase:${ID}:stop`)).toBeNull();
  });

  it("a tap is read from a template quick reply or an interactive reply", () => {
    expect(buttonPayloadOf({ type: "button", button: { payload: "p1", text: "Sending today" } })).toBe("p1");
    expect(buttonPayloadOf({ type: "interactive", interactive: { button_reply: { id: "p2" } } })).toBe("p2");
    expect(buttonPayloadOf({ type: "text" })).toBeNull();
  });

  it("template buttons are indexed in the order the template was created, with one variable on the URL", () => {
    const urlFirst = chaseButtonComponents("url_first", "TOK", ID);
    expect(urlFirst.map((c) => [c["index"], c["sub_type"]])).toEqual([["0", "url"], ["1", "quick_reply"], ["2", "quick_reply"], ["3", "quick_reply"]]);
    expect(urlFirst[0]["parameters"]).toEqual([{ type: "text", text: "TOK" }]);
    expect(urlFirst[1]["parameters"]).toEqual([{ type: "payload", payload: `chase:${ID}:sending` }]);
    const qrFirst = chaseButtonComponents("qr_first", "TOK", ID);
    expect(qrFirst.map((c) => [c["index"], c["sub_type"]])).toEqual([["0", "quick_reply"], ["1", "quick_reply"], ["2", "quick_reply"], ["3", "url"]]);
  });

  it("the template message carries the body first, then the buttons; with none it is the old body-only message", () => {
    const withButtons = buildTemplateMessage("919845012345", "document_request_v2", "en", ["a", "b", "c", "d"], chaseButtonComponents("url_first", "T", ID));
    expect(withButtons.template.components).toHaveLength(5);
    expect(withButtons.template.components[0]).toMatchObject({ type: "body" });
    expect(buildTemplateMessage("1", "document_request", "en", ["a"]).template.components).toHaveLength(1);
  });

  it("in-window reply buttons fit WhatsApp's limits (3 buttons, titles up to 20 characters)", () => {
    const m = buildReplyButtons("919845012345", "x".repeat(2000), ID);
    expect(m.interactive.action.buttons).toHaveLength(3);
    for (const b of m.interactive.action.buttons) expect(b.reply.title.length).toBeLessThanOrEqual(20);
    expect(m.interactive.body.text.length).toBeLessThanOrEqual(1024);
    expect(Object.values(CHASE_BUTTON_LABEL).every((l) => l.length <= 25)).toBe(true);
  });

  it("the free-form message gets the upload link only when there is one", () => {
    const p = ["Asha", "Acme", "bank statement", "Rao & Co"];
    expect(chaseTextWithLink(p, "https://fynhelp.com/u/abc")).toContain("https://fynhelp.com/u/abc");
    expect(chaseTextWithLink(p, null)).not.toContain("http");
  });

  it("each tap does what it says", () => {
    expect(CHASE_ACTION_RULES.sending).toMatchObject({ pauseDays: 1, stop: false });
    expect(CHASE_ACTION_RULES.later).toMatchObject({ pauseDays: 3, stop: false });
    expect(CHASE_ACTION_RULES.stop).toMatchObject({ stop: true });
    expect(CHASE_ACTION_RULES.sending.reply("https://x/u/1")).toContain("https://x/u/1");
    expect(CHASE_ACTION_RULES.stop.reply("https://x/u/1")).not.toContain("https://");
  });
});

describe("the three stages of a reminder", () => {
  const p = ["Asha", "Acme Traders", "Bank statement", "Rao & Co"];
  it("step 1 asks, step 2 is a gentle reminder, step 3 is the final one", () => {
    expect(stageForStep(1)).toBe("request");
    expect(stageForStep(2)).toBe("followup");
    expect(stageForStep(3)).toBe("final");
    expect(stageForStep(4)).toBe("final");
    expect(chaseText(p, 1)).toContain("we are still waiting for");
    expect(chaseText(p, 2)).toContain("gentle reminder");
    expect(chaseText(p, 3)).toContain("final reminder");
    for (const step of [1, 2, 3]) for (const v of p) expect(chaseText(p, step)).toContain(v);
  });

  it("'Need more time' asks for a date with three buttons, and each date replaces the default pause", () => {
    expect(CHASE_ACTION_RULES.later).toMatchObject({ askDate: true, pauseDays: 3, exact: false });
    const m = buildDateButtons("919845012345", "When can you send it?", ID);
    expect(m.interactive.action.buttons.map((b) => b.reply.title)).toEqual(["Tomorrow", "In 3 days", "Next week"]);
    expect(parseChasePayload(m.interactive.action.buttons[1].reply.id)).toEqual({ chaseId: ID, action: "in3" });
    expect(CHASE_ACTION_RULES.in1).toMatchObject({ pauseDays: 2, exact: true });
    expect(CHASE_ACTION_RULES.in3).toMatchObject({ pauseDays: 4, exact: true });
    expect(CHASE_ACTION_RULES.in7).toMatchObject({ pauseDays: 8, exact: true });
  });
});

describe("upload link tokens and file checks", () => {
  it("tokens are long, unique and only their hash is stored", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
    expect(uploadUrl(a)).toBe(`https://fynhelp.com/u/${a}`);
  });

  it("a file must start like the type it claims", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 rest");
    expect(looksLike("application/pdf", pdf)).toBe(true);
    expect(looksLike("application/pdf", new TextEncoder().encode("MZ\x90 not a pdf"))).toBe(false);
    expect(looksLike("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(looksLike("image/png", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
    expect(looksLike("text/csv", new TextEncoder().encode("a,b\n1,2"))).toBe(true);
    expect(looksLike("text/csv", new Uint8Array([0x61, 0x00, 0x62]))).toBe(false);
    expect(looksLike("application/x-msdownload", pdf)).toBe(false);
  });
});

/* ── sending, with a stand-in database and WhatsApp ───────── */

const credit = { spent: 0, refunded: 0, balance: 5 };
vi.mock("@/lib/practice/billing/credits.server", () => ({
  spendForReminder: async () => {
    if (credit.balance < 1) return { ok: false, balance: 0 };
    credit.balance--;
    credit.spent++;
    return { ok: true, ref: "wa:test", free: false, balance: credit.balance };
  },
  refundReminder: async (_d: unknown, _f: unknown, ref: string | null) => {
    if (ref) {
      credit.refunded++;
      credit.balance++;
    }
  },
}));

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op = "select";
    let payload: Row = {};
    const get = (r: Row, k: string) => (k.includes("->>") ? ((r[k.split("->>")[0]] as Row | undefined) ?? {})[k.split("->>")[1]] : r[k]);
    const run = () => {
      const hit = tables[table].filter((r) => f.every((fn) => fn(r)));
      if (op === "insert") { tables[table].push({ id: `${table}-${tables[table].length + 1}`, ...payload }); return { data: null, error: null }; }
      if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      if (op === "upsert") { tables[table].push(payload); return { data: null, error: null }; }
      return { data: hit, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => { f.push((r) => get(r, k) === v); return b; },
      not: () => b,
      limit: () => b,
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      upsert: (p: Row) => { op = "upsert"; payload = p; return b; },
      maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from, rpc: async () => ({ data: true, error: null }) } as never;
}

const sent: { body: Record<string, unknown> }[] = [];
let waOk = true;
const ENV = { WHATSAPP_ACCESS_TOKEN: "tok", WHATSAPP_DEFAULT_PHONE_NUMBER_ID: "111222333444" };
const params = ["Asha", "Acme Traders", "Bank statement (Sep 2026)", "Rao & Co"];

beforeEach(() => {
  Object.assign(credit, { spent: 0, refunded: 0, balance: 5 });
  sent.length = 0;
  waOk = true;
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  delete process.env["WHATSAPP_CHASE_BUTTONS"];
  vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
    sent.push({ body: JSON.parse(init.body) });
    return waOk
      ? { ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) }
      : { ok: false, json: async () => ({ error: { code: 132001, message: "template missing" } }) };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(ENV)) delete process.env[k];
  delete process.env["WHATSAPP_CHASE_BUTTONS"];
});

const world = (inWindow: boolean) =>
  fakeDb({
    ca_firms: [{ id: "f1", notification_prefs: {}, is_test: false }],
    ca_whatsapp_channels: [],
    ca_whatsapp_contacts: inWindow ? [{ ca_firm_id: "f1", phone_key: "919845012345", last_inbound_at: new Date().toISOString() }] : [],
    ca_upload_links: [],
    ca_whatsapp_routes: [],
  });
const chase = { requestId: ID, businessId: "b1" };

describe("sending the chase", () => {
  it("inside the 24-hour window: free text with reply buttons and the upload link, no credit used", async () => {
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    const r = await sendChaseWhatsapp(world(true), "f1", "9845012345", params, { chase });
    expect(r).toMatchObject({ ok: true, mode: "text" });
    const m = sent[0].body as { type: string; interactive: { body: { text: string }; action: { buttons: unknown[] } } };
    expect(m.type).toBe("interactive");
    expect(m.interactive.action.buttons).toHaveLength(3);
    expect(m.interactive.body.text).toMatch(/https:\/\/fynhelp\.com\/u\/[A-Za-z0-9_-]{32}/);
    expect(credit.spent).toBe(0);
  });

  it("outside the window: the template, one credit, and the buttons when they are switched on", async () => {
    process.env["WHATSAPP_CHASE_BUTTONS"] = "on";
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    const r = await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase });
    expect(r).toMatchObject({ ok: true, mode: "template" });
    const comps = (sent[0].body as { template: { components: { type: string; sub_type?: string }[] } }).template.components;
    expect(comps.map((c) => c.sub_type ?? c.type)).toEqual(["body", "url", "quick_reply", "quick_reply", "quick_reply"]);
    expect(credit.spent).toBe(1);
  });

  it("each reminder uses the template for its stage, and falls back to the first request's", async () => {
    credit.balance = 20;
    const send = async (step: number) => {
      sent.length = 0;
      const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
      await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase, step });
      return (sent[0].body as { template: { name: string } }).template.name;
    };
    expect([await send(1), await send(2), await send(3)]).toEqual(["document_request", "document_request", "document_request"]);
    process.env["WHATSAPP_FOLLOWUP_TEMPLATE"] = "document_followup_v2";
    process.env["WHATSAPP_FINAL_TEMPLATE"] = "document_final_v2";
    expect([await send(1), await send(2), await send(3)]).toEqual(["document_request", "document_followup_v2", "document_final_v2"]);
    delete process.env["WHATSAPP_FOLLOWUP_TEMPLATE"];
    delete process.env["WHATSAPP_FINAL_TEMPLATE"];
  });

  describe("with the template list from Meta", () => {
    const body = { type: "BODY", text: "Hello {{1}}" };
    const meta = (data: unknown[]) => {
      process.env["WHATSAPP_WABA_ID"] = "2457752908089073";
      vi.stubGlobal("fetch", async (u: string, init?: { body?: string }) => {
        if (String(u).includes("message_templates")) return { ok: true, json: async () => ({ data }) };
        sent.push({ body: JSON.parse(init?.body ?? "{}") });
        return { ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
      });
    };
    afterEach(async () => {
      delete process.env["WHATSAPP_WABA_ID"];
      (await import("@/lib/practice/whatsappTemplates.server")).forgetTemplates();
    });

    it("sends in the language Meta approved, not the one configured", async () => {
      meta([{ name: "document_request_v2", status: "APPROVED", language: "en_US", category: "UTILITY", components: [body] }]);
      const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
      const r = await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase });
      expect(r).toMatchObject({ ok: true, mode: "template" });
      expect((sent[0].body as { template: { name: string; language: { code: string } } }).template).toMatchObject({ name: "document_request_v2", language: { code: "en_US" } });
    });

    it("with no template approved it says so plainly, sends nothing and spends no credit", async () => {
      meta([{ name: "document_request_v2", status: "PENDING", language: "en", category: "UTILITY", components: [body] }]);
      const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
      const r = await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("No WhatsApp message template is approved yet");
      expect(sent).toHaveLength(0);
      expect(credit).toMatchObject({ spent: 0, refunded: 0 });
    });
  });

  it("inside the window the wording follows the step", async () => {
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    await sendChaseWhatsapp(world(true), "f1", "9845012345", params, { chase, step: 3 });
    expect((sent[0].body as { interactive: { body: { text: string } } }).interactive.body.text).toContain("final reminder");
  });

  it("the old body-only template still works while buttons are off", async () => {
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase });
    expect((sent[0].body as { template: { components: unknown[] } }).template.components).toHaveLength(1);
  });

  it("a template WhatsApp rejects gives the credit back", async () => {
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    waOk = false;
    const r = await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase });
    expect(r.ok).toBe(false);
    expect(credit).toMatchObject({ spent: 1, refunded: 1, balance: 5 });
  });

  it("with no credits the template is not sent at all", async () => {
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    credit.balance = 0;
    const r = await sendChaseWhatsapp(world(false), "f1", "9845012345", params, { chase });
    expect(r).toMatchObject({ ok: false, noCredits: true, permanent: false });
    expect(sent).toHaveLength(0);
  });

  it("inside the window a client with no credits still gets the reminder", async () => {
    const { sendChaseWhatsapp } = await import("@/lib/practice/whatsappSend.server");
    credit.balance = 0;
    expect(await sendChaseWhatsapp(world(true), "f1", "9845012345", params, { chase })).toMatchObject({ ok: true, mode: "text" });
  });
});

/* ── a tap on a button ────────────────────────────────────── */

describe("tapping a button", () => {
  const setup = () => {
    const tables: Record<string, Row[]> = {
      ca_chaser_events: [],
      ca_document_requests: [
        { id: ID, ca_firm_id: "f1", business_id: "b1", status: "open", managed_by: "practice", next_follow_up_at: null },
      ],
      ca_clients: [{ ca_firm_id: "f1", business_id: "b1", do_not_disturb: false }],
      ca_notifications: [],
      ca_upload_links: [],
    };
    return { tables, db: fakeDb(tables) };
  };
  const tap = (action: string, id = "wamid.tap1") => ({ id, from: "919845012345", type: "button", button: { payload: `chase:${ID}:${action}`, text: action } });

  it("'Sending today' pauses the chase for a day, is logged, and is answered with an upload link", async () => {
    const { handleButton } = await import("@/lib/practice/whatsapp.server");
    const { db, tables } = setup();
    const replies: string[] = [];
    const status = await handleButton(db, "f1", tap("sending"), async (t) => void replies.push(t));
    expect(status).toBe("client tapped sending");
    const next = String(tables.ca_document_requests[0].next_follow_up_at);
    expect(Date.parse(next) - Date.now()).toBeGreaterThan(23 * 3_600_000);
    expect(tables.ca_chaser_events[0]).toMatchObject({ event_type: "client_replied", channel: "whatsapp" });
    expect(replies[0]).toMatch(/https:\/\/fynhelp\.com\/u\//);
    expect(tables.ca_upload_links).toHaveLength(1);
  });

  it("'Need more time' pauses 3 days, then asks when; the answer replaces the pause with the client's date", async () => {
    const { handleButton } = await import("@/lib/practice/whatsapp.server");
    const { db, tables } = setup();
    const asked: string[] = [];
    await handleButton(db, "f1", tap("later"), async () => undefined, async (body) => void asked.push(body));
    expect(asked).toEqual(["No problem. When can you send it?"]);
    const days = (iso: unknown) => Math.round((Date.parse(String(iso)) - Date.now()) / 86_400_000);
    expect(days(tables.ca_document_requests[0].next_follow_up_at)).toBe(3);
    const replies: string[] = [];
    await handleButton(db, "f1", tap("in1", "wamid.tap2"), async (t) => void replies.push(t));
    expect(days(tables.ca_document_requests[0].next_follow_up_at)).toBe(2);
    expect(replies[0]).toContain("until tomorrow");
    expect(tables.ca_chaser_events.map((e) => e.event_type)).toEqual(["client_replied", "client_replied"]);
  });

  it("'Stop reminders' switches reminders off for the client and says so", async () => {
    const { handleButton } = await import("@/lib/practice/whatsapp.server");
    const { db, tables } = setup();
    const replies: string[] = [];
    expect(await handleButton(db, "f1", tap("stop"), async (t) => void replies.push(t))).toBe("client opted out (button)");
    expect(tables.ca_clients[0].do_not_disturb).toBe(true);
    expect(tables.ca_chaser_events[0]).toMatchObject({ event_type: "client_stopped" });
    expect(replies[0]).toContain("stopped");
  });

  it("the same tap delivered twice is handled once", async () => {
    const { handleButton } = await import("@/lib/practice/whatsapp.server");
    const { db, tables } = setup();
    await handleButton(db, "f1", tap("later"), async () => undefined);
    expect(await handleButton(db, "f1", tap("later"), async () => undefined)).toBe("duplicate delivery");
    expect(tables.ca_chaser_events).toHaveLength(1);
  });

  it("a button for another firm's chase, or anything that is not a chase button, does nothing", async () => {
    const { handleButton } = await import("@/lib/practice/whatsapp.server");
    const { db, tables } = setup();
    expect(await handleButton(db, "other-firm", tap("stop"), async () => undefined)).toMatch(/another firm/);
    expect(await handleButton(db, "f1", { id: "w2", from: "1", type: "button", button: { payload: "random" } }, async () => undefined)).toMatch(/not a chase button/);
    expect(tables.ca_clients[0].do_not_disturb).toBe(false);
    expect(tables.ca_chaser_events).toHaveLength(0);
  });

  it("a tap on a chase that is already done gets a polite answer and changes nothing", async () => {
    const { handleButton } = await import("@/lib/practice/whatsapp.server");
    const { db, tables } = setup();
    tables.ca_document_requests[0].status = "resolved";
    const replies: string[] = [];
    expect(await handleButton(db, "f1", tap("later"), async (t) => void replies.push(t))).toMatch(/already closed/);
    expect(replies[0]).toContain("already complete");
    expect(tables.ca_chaser_events).toHaveLength(0);
  });
});
