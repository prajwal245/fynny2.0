// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOUCH_TEMPLATES,
  WA_PLAN,
  mayMessage,
  parseTouchPayload,
  phoneKey,
  touchButtonComponents,
  touchParams,
  touchPayload,
  touchTemplateUsable,
} from "@/lib/practice/touchpoints/whatsapp";
import type { MetaTemplate } from "@/lib/practice/whatsappFlow";

const ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const BUTTONS = (urlFirst: boolean) => {
  const url = { type: "URL", text: "Open FynHelp", url: "https://fynhelp.com/app" };
  const qr = ["Call me", "Not now", "Stop messages"].map((text) => ({ type: "QUICK_REPLY", text }));
  return urlFirst ? [url, ...qr] : [...qr, url];
};
const tpl = (name: string, o: Partial<MetaTemplate> = {}, urlFirst = true): MetaTemplate => ({ name, status: "APPROVED", language: "en", category: "UTILITY", components: [{ type: "BODY" }, { type: "BUTTONS", buttons: BUTTONS(urlFirst) }], ...o });

describe("follow-up messages on WhatsApp", () => {
  it("every stall that is about the person's own account has a message, and a pure check-in does not", () => {
    expect(WA_PLAN.paid_quiet).toBeNull();
    for (const k of ["signup_unfinished", "no_client", "no_upload", "trial_stalled", "trial_ending_unpaid", "trial_ended_unpaid", "checkout_abandoned", "payment_failed"] as const)
      expect(WA_PLAN[k]).not.toBeNull();
    expect(touchParams("paid_quiet", { name: "Asha", firmName: "Rao & Co" })).toBeNull();
  });

  it("fills the three fields from the follow-up's own facts, and never invents a figure", () => {
    const f = { name: "Asha Rao", firmName: "Rao & Co" };
    expect(touchParams("trial_ending_unpaid", f, { trialDaysLeft: 2 })).toEqual(["Asha", "Rao & Co", "ends in 2 days"]);
    expect(touchParams("trial_ending_unpaid", f, { trialDaysLeft: 1 })?.[2]).toBe("ends in 1 day");
    expect(touchParams("trial_stalled", f, { quietDays: 5 })?.[2]).toBe("has been quiet for 5 days");
    expect(touchParams("checkout_abandoned", f)?.[2]).toBe("was not completed");
    expect(touchParams("payment_failed", f)?.[2]).toBe("did not go through");
    expect(touchParams("signup_unfinished", { name: null, firmName: null })).toEqual(["there", "your FynHelp account", expect.stringContaining("set up your firm")]);
  });

  it("the template bodies read well with their examples, and have exactly three fields", () => {
    for (const t of Object.values(TOUCH_TEMPLATES)) {
      expect(t.body.match(/\{\{\d\}\}/g)).toEqual(["{{1}}", "{{2}}", "{{3}}"]);
      expect(t.body).not.toMatch(/^\{\{|\}\}$/);
      const text = t.body.replace(/\{\{(\d)\}\}/g, (_, n) => t.example[Number(n) - 1]);
      expect(text).toContain("Asha");
      expect(text).not.toMatch(/discount|offer|limited time|buy|upgrade now/i);
    }
  });

  it("a tap's payload names the follow-up and nothing else parses", () => {
    expect(parseTouchPayload(touchPayload(ID, "call"))).toEqual({ id: ID, action: "call" });
    expect(parseTouchPayload(`tp:${ID}:delete`)).toBeNull();
    expect(parseTouchPayload(`chase:${ID}:stop`)).toBeNull();
    expect(parseTouchPayload(null)).toBeNull();
  });

  it("quick-reply components follow the order the template was built in, and templates with anything else are refused", () => {
    expect(touchButtonComponents(BUTTONS(true), ID)!.map((c) => c["index"])).toEqual(["1", "2", "3"]);
    expect(touchButtonComponents(BUTTONS(false), ID)!.map((c) => c["index"])).toEqual(["0", "1", "2"]);
    expect(touchButtonComponents(BUTTONS(true), ID)![0]["parameters"]).toEqual([{ type: "payload", payload: `tp:${ID}:call` }]);
    expect(touchButtonComponents([{ type: "QUICK_REPLY" }], ID)).toBeNull();
    expect(touchButtonComponents([{ type: "URL", url: "https://x.in/{{1}}" }, ...BUTTONS(false).slice(0, 3)], ID)).toBeNull();
    expect(touchButtonComponents([{ type: "PHONE_NUMBER" }, ...BUTTONS(false).slice(0, 3)], ID)).toBeNull();
  });

  it("only an approved, non-Marketing template with our buttons may be used", () => {
    expect(touchTemplateUsable(tpl("a")).ok).toBe(true);
    expect(touchTemplateUsable(undefined).ok).toBe(false);
    expect(touchTemplateUsable(tpl("a", { status: "PENDING" })).why).toContain("pending");
    expect(touchTemplateUsable(tpl("a", { category: "MARKETING" })).why).toContain("Marketing");
    expect(touchTemplateUsable(tpl("a", { components: [{ type: "BODY" }] })).ok).toBe(false);
  });

  it("the sending rules: consent, a valid number, no opt-out, not twice in 3 days, daytime only", () => {
    const ok = { consent: true, phone: "919820011223", optedOut: false, sentToThisNumberRecently: false, hour: 11 };
    expect(mayMessage(ok).ok).toBe(true);
    expect(mayMessage({ ...ok, consent: false }).why).toBe("no WhatsApp consent");
    expect(mayMessage({ ...ok, phone: "123" }).why).toBe("no valid number");
    expect(mayMessage({ ...ok, optedOut: true }).why).toBe("asked us to stop");
    expect(mayMessage({ ...ok, sentToThisNumberRecently: true }).why).toContain("3 days");
    expect(mayMessage({ ...ok, hour: 8 }).ok).toBe(false);
    expect(mayMessage({ ...ok, hour: 20 }).ok).toBe(false);
    expect(phoneKey("+91 98200 11223")).toBe("9820011223");
  });
});

/* ── sending and replying, with stand-ins ─────────────────── */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const now = new Date("2026-10-27T06:30:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

function db() {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op = "select";
    let payload: Row = {};
    let wantRows = false;
    const run = () => {
      const rows = tables[table];
      if (op === "upsert") {
        const i = rows.findIndex((r) => r["phone_key"] === payload["phone_key"]);
        if (i >= 0) Object.assign(rows[i], payload);
        else rows.push({ ...payload });
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => f.every((fn) => fn(r)));
      if (op === "update") {
        hit.forEach((r) => Object.assign(r, payload));
        return { data: wantRows ? hit : null, error: null };
      }
      return { data: hit, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => { wantRows = true; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      upsert: (p: Row) => { op = "upsert"; payload = p; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return b; },
      not: (k: string, _op: string, v: unknown) => { f.push((r) => (r[k] ?? null) !== v); return b; },
      in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return b; },
      lte: (k: string, v: unknown) => { f.push((r) => String(r[k]) <= String(v)); return b; },
      gte: (k: string, v: unknown) => { f.push((r) => r[k] != null && String(r[k]) >= String(v)); return b; },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from } as never;
}

const tp = (id: string, o: Row = {}) => ({ id, kind: "no_client", key: "", ca_firm_id: `f-${id}`, user_id: null, phone: "919820011223", status: "open", due_at: ago(2 * H), snoozed_until: null, whatsapp_sent_at: null, whatsapp_error: null, replied_at: null, note: null, detail: {}, created_at: ago(D), ...o });
const subject = (id: string, o: Row = {}) => ({ id: `f-${id}`, facts: { name: "Asha Rao", firmName: "Rao & Co", phone: "919820011223", whatsappOk: true, ...o } });

let metaList: MetaTemplate[] = [];
const sent: { to: string; template: { name: string; components: { type: string; parameters?: { text?: string }[] }[] } }[] = [];
let sendOk = true;

beforeEach(() => {
  tables = { ca_touchpoints: [], ca_touch_optout: [], ca_firms: [] };
  sent.length = 0;
  sendOk = true;
  metaList = [tpl("fh_setup_help"), tpl("fh_trial_update"), tpl("fh_plan_help")];
  process.env["WHATSAPP_ACCESS_TOKEN"] = "tok";
  process.env["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"] = "111222333444";
  process.env["WHATSAPP_WABA_ID"] = "999888777";
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    if (String(url).includes("message_templates")) return { ok: true, json: async () => ({ data: metaList }) };
    sent.push(JSON.parse(init!.body!));
    return sendOk ? { ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) } : { ok: false, json: async () => ({ error: { code: 131026, message: "not on whatsapp" } }) };
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const k of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_DEFAULT_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID"]) delete process.env[k];
  (await import("@/lib/practice/whatsappTemplates.server")).forgetTemplates();
});

describe("sending a follow-up on WhatsApp", () => {
  it("sends the template with the person's own facts and buttons that point back at the follow-up", async () => {
    const { sendTouchWhatsapps } = await import("@/lib/practice/touchpoints/whatsapp.server");
    tables.ca_touchpoints = [tp(ID)];
    expect(await sendTouchWhatsapps(db(), [subject(ID)], now, 12)).toEqual({ sent: 1 });
    expect(sent[0].template.name).toBe("fh_setup_help");
    expect(sent[0].template.components[0].parameters!.map((p) => p.text)).toEqual(["Asha", "Rao & Co", "The next step is to add your first client, which takes about 2 minutes."]);
    expect(JSON.stringify(sent[0].template.components)).toContain(`tp:${ID}:call`);
    expect(tables.ca_touchpoints[0]).toMatchObject({ whatsapp_template: "fh_setup_help", whatsapp_wamid: "wamid.1" });
    // Once only.
    expect(await sendTouchWhatsapps(db(), [subject(ID)], now, 12)).toEqual({ sent: 0 });
    expect(sent).toHaveLength(1);
  });

  it("does not send without consent, after a stop, outside the day, or twice to one number in 3 days", async () => {
    const { sendTouchWhatsapps } = await import("@/lib/practice/touchpoints/whatsapp.server");
    tables.ca_touchpoints = [tp("a1")];
    expect((await sendTouchWhatsapps(db(), [subject("a1", { whatsappOk: false })], now, 12)).sent).toBe(0);
    expect((await sendTouchWhatsapps(db(), [subject("a1")], now, 8)).sent).toBe(0);
    tables.ca_touch_optout = [{ phone_key: "9820011223" }];
    expect((await sendTouchWhatsapps(db(), [subject("a1")], now, 12)).sent).toBe(0);
    tables.ca_touch_optout = [];
    tables.ca_touchpoints.push(tp("b2", { whatsapp_sent_at: ago(D), kind: "trial_stalled" }));
    expect((await sendTouchWhatsapps(db(), [subject("a1"), subject("b2")], now, 12)).sent).toBe(0);
    tables.ca_touchpoints[1].whatsapp_sent_at = ago(4 * D);
    expect((await sendTouchWhatsapps(db(), [subject("a1"), subject("b2")], now, 12)).sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("waits out the delay after an email, never sends a check-in, and skips a snoozed follow-up", async () => {
    const { sendTouchWhatsapps } = await import("@/lib/practice/touchpoints/whatsapp.server");
    tables.ca_touchpoints = [tp("a1", { kind: "signup_unfinished", due_at: ago(H), ca_firm_id: null, user_id: "u-a1" }), tp("c3", { kind: "paid_quiet", phone: "919811100022" }), tp("d4", { snoozed_until: new Date(now.getTime() + D).toISOString(), phone: "919811100033" })];
    const subs = [{ id: "u-a1", facts: subject("a1").facts }, subject("c3", { phone: "919811100022" }), subject("d4", { phone: "919811100033" })];
    expect((await sendTouchWhatsapps(db(), subs, now, 12)).sent).toBe(0);
    tables.ca_touchpoints[0].due_at = ago(4 * H);
    expect((await sendTouchWhatsapps(db(), subs, now, 12)).sent).toBe(1);
    expect(sent[0].template.name).toBe("fh_setup_help");
  });

  it("never uses a template that is Marketing, in review, or has the wrong buttons", async () => {
    const { sendTouchWhatsapps } = await import("@/lib/practice/touchpoints/whatsapp.server");
    const { forgetTemplates } = await import("@/lib/practice/whatsappTemplates.server");
    tables.ca_touchpoints = [tp(ID)];
    for (const bad of [tpl("fh_setup_help", { category: "MARKETING" }), tpl("fh_setup_help", { status: "PENDING" }), tpl("fh_setup_help", { components: [{ type: "BODY" }] })]) {
      metaList = [bad];
      forgetTemplates();
      expect((await sendTouchWhatsapps(db(), [subject(ID)], now, 12)).sent).toBe(0);
    }
    expect(sent).toHaveLength(0);
  });

  it("says why it cannot send when WhatsApp or the account id is not set", async () => {
    const { sendTouchWhatsapps } = await import("@/lib/practice/touchpoints/whatsapp.server");
    delete process.env["WHATSAPP_WABA_ID"];
    expect((await sendTouchWhatsapps(db(), [], now, 12)).skipped).toContain("WHATSAPP_WABA_ID");
    delete process.env["WHATSAPP_ACCESS_TOKEN"];
    expect((await sendTouchWhatsapps(db(), [], now, 12)).skipped).toContain("not set up");
  });

  it("a number that is not on WhatsApp is recorded and not tried again", async () => {
    const { sendTouchWhatsapps } = await import("@/lib/practice/touchpoints/whatsapp.server");
    tables.ca_touchpoints = [tp(ID)];
    sendOk = false;
    await sendTouchWhatsapps(db(), [subject(ID)], now, 12);
    expect(tables.ca_touchpoints[0].whatsapp_error).toContain("not on WhatsApp");
    sendOk = true;
    expect((await sendTouchWhatsapps(db(), [subject(ID)], now, 12)).sent).toBe(0);
  });
});

describe("what a person answers", () => {
  const tap = (action: string, id = "wamid.t1", from = "919820011223") => ({ id, from, type: "button", button: { payload: `tp:${ID}:${action}`, text: action } });
  const setup = () => {
    tables.ca_touchpoints = [tp(ID, { whatsapp_sent_at: ago(H) })];
    tables.ca_firms = [{ id: `f-${ID}`, notification_prefs: { touch_whatsapp_ok: true } }];
  };

  it("'Call me' makes it hot and due now, and says when a person will call", async () => {
    const { handleTouchButton } = await import("@/lib/practice/touchpoints/whatsapp.server");
    setup();
    const said: string[] = [];
    expect(await handleTouchButton(db(), tap("call"), async (t) => void said.push(t))).toBe("follow-up: call");
    expect(tables.ca_touchpoints[0]).toMatchObject({ hot: true, status: "open" });
    expect(tables.ca_touchpoints[0].callback_requested_at).toBeTruthy();
    expect(said[0]).toContain("9:30 am to 6:30 pm");
  });

  it("'Not now' leaves them alone for 3 days", async () => {
    const { handleTouchButton } = await import("@/lib/practice/touchpoints/whatsapp.server");
    setup();
    await handleTouchButton(db(), tap("later"), async () => undefined);
    const days = (Date.parse(String(tables.ca_touchpoints[0].snoozed_until)) - Date.now()) / D;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
  });

  it("'Stop messages' records the stop, switches consent off, and confirms", async () => {
    const { handleTouchButton } = await import("@/lib/practice/touchpoints/whatsapp.server");
    setup();
    const said: string[] = [];
    await handleTouchButton(db(), tap("stop"), async (t) => void said.push(t));
    expect(tables.ca_touch_optout).toEqual([{ phone_key: "9820011223" }]);
    expect((tables.ca_firms[0].notification_prefs as { touch_whatsapp_ok: boolean }).touch_whatsapp_ok).toBe(false);
    expect(said[0]).toContain("will not message you on WhatsApp again");
  });

  it("a tap from another number, a repeated delivery or a chase button is ignored", async () => {
    const { handleTouchButton } = await import("@/lib/practice/touchpoints/whatsapp.server");
    setup();
    expect(await handleTouchButton(db(), tap("stop", "w2", "919800000000"), async () => undefined)).toBe("tap from a different number");
    await handleTouchButton(db(), tap("later", "w3"), async () => undefined);
    expect(await handleTouchButton(db(), tap("later", "w3"), async () => undefined)).toBe("duplicate delivery");
    expect(await handleTouchButton(db(), { id: "w4", from: "919820011223", type: "button", button: { payload: `chase:${ID}:stop` } }, async () => undefined)).toBe("not a follow-up button");
    expect(tables.ca_touch_optout).toHaveLength(0);
  });

  it("a written reply lands on the follow-up, makes it hot, and is thanked once", async () => {
    const { noteTouchReply } = await import("@/lib/practice/touchpoints/whatsapp.server");
    setup();
    const said: string[] = [];
    const msg = (id: string, body: string) => ({ id, from: "919820011223", type: "text", text: { body } });
    expect(await noteTouchReply(db(), msg("w1", "Please call after 5 pm"), async (t) => void said.push(t))).toBe(true);
    expect(tables.ca_touchpoints[0]).toMatchObject({ hot: true, note: 'Replied on WhatsApp: "Please call after 5 pm"' });
    await noteTouchReply(db(), msg("w2", "Thanks"), async (t) => void said.push(t));
    expect(said).toHaveLength(1);
    expect(await noteTouchReply(db(), { id: "w9", from: "919777777777", type: "text", text: { body: "hi" } }, async () => undefined)).toBe(false);
  });

  it("STOP typed as a message is honoured too", async () => {
    const { noteTouchReply } = await import("@/lib/practice/touchpoints/whatsapp.server");
    setup();
    await noteTouchReply(db(), { id: "w5", from: "919820011223", type: "text", text: { body: "STOP" } }, async () => undefined);
    expect(tables.ca_touch_optout).toEqual([{ phone_key: "9820011223" }]);
  });
});
