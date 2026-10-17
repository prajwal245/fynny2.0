// @vitest-environment node
/**
 * Monthly extras billing and lifecycle emails, end to end: the real code and a
 * real database, with stand-in Razorpay and Resend servers that record every
 * call. Runs only with LIFECYCLE_E2E=1 and the local stack (SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY pointing at it).
 *
 *   LIFECYCLE_E2E=1 npx vitest run tests/integration/lifecycle.e2e.test.ts
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.LIFECYCLE_E2E === "1";
const PORT = 2610;
const calls: { path: string; body: Record<string, unknown> }[] = [];
let server: http.Server;
let seq = 0;

const DAY = 86_400_000;
const now = new Date();
const ist = new Date(now.getTime() + 5.5 * 3_600_000).toISOString();
const month = ist.slice(0, 7);
const [y, m] = month.split("-").map(Number);
const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
const inPrev = (day: number) => new Date(`${prev}-${String(day).padStart(2, "0")}T10:00:00+05:30`).toISOString();
const stamp = Date.now().toString().slice(-6);

type Db = Awaited<ReturnType<typeof import("@/lib/practice/db.server").adminDb>>;
let db: Db;
const firms: Record<string, string> = {};

async function makeFirm(key: string, o: { email?: string; createdAt?: string; billing: Record<string, unknown>; activePrev?: number; docsPrev?: number; activeFrom?: number; prefs?: Record<string, unknown> }) {
  const { data: firm, error } = await db
    .from("ca_firms")
    .insert({ firm_name: `LC ${key} ${stamp}`, email: o.email ?? `lc-${key}-${stamp}@test.in`, created_at: o.createdAt ?? new Date(now.getTime() - 90 * DAY).toISOString(), notification_prefs: o.prefs ?? {} })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = String(firm.id);
  firms[key] = id;
  const { error: bErr } = await db.from("ca_billing").insert({ ca_firm_id: id, ...o.billing });
  if (bErr) throw new Error(bErr.message);
  const n = o.activePrev ?? 0;
  if (n) {
    const { data: biz, error: e2 } = await db
      .from("businesses")
      .insert(Array.from({ length: n }, (_, i) => ({ business_name: `LC ${key} client ${i + 1} ${stamp}` })))
      .select("id");
    if (e2) throw new Error(e2.message);
    await db.from("ca_clients").insert(biz!.map((b, i) => ({ ca_firm_id: id, business_id: b.id, client_name: `${key} client ${i + 1}`, client_status: "active" })));
    // One document per client last month (on the given day), plus extra documents on the first client.
    const day = o.activeFrom ?? 5;
    const docs = biz!.map((b, i) => ({ ca_firm_id: id, business_id: b.id, created_at: inPrev(i % 2 ? day : Math.max(1, day - 3)) }));
    for (let i = 0; i < (o.docsPrev ?? 0); i++) docs.push({ ca_firm_id: id, business_id: biz![0].id, created_at: inPrev(day) });
    for (let i = 0; i < docs.length; i += 500) {
      const { error: e3 } = await db.from("ca_document_extractions").insert(docs.slice(i, i + 500));
      if (e3) throw new Error(e3.message);
    }
  }
  return id;
}

describe.skipIf(!RUN)("monthly extras billing and lifecycle emails", () => {
  beforeAll(async () => {
    server = http
      .createServer((req, res) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          const body = raw ? JSON.parse(raw) : {};
          calls.push({ path: req.url ?? "", body });
          res.setHeader("content-type", "application/json");
          if (req.url?.match(/^\/v1\/subscriptions\/[^/]+\/addons$/)) return res.end(JSON.stringify({ id: `ao_${++seq}` }));
          if (req.url === "/v1/invoices") return res.end(JSON.stringify({ id: `inv_${++seq}`, short_url: `https://rzp.io/i/test${seq}` }));
          if (req.url === "/emails") return res.end(JSON.stringify({ id: `em_${++seq}` }));
          res.statusCode = 404;
          res.end("{}");
        });
      })
      .listen(PORT);
    Object.assign(process.env, {
      RAZORPAY_API_BASE: `http://127.0.0.1:${PORT}/v1`,
      RAZORPAY_KEY_ID: "rzp_test_KEY",
      RAZORPAY_KEY_SECRET: "test_secret",
      RESEND_API_KEY: "re_test",
      RESEND_API_BASE: `http://127.0.0.1:${PORT}`,
      EMAIL_LINK_SECRET: "lifecycle-test-secret",
      PUBLIC_APP_URL: "https://www.fynhelp.com",
    });
    db = await (await import("@/lib/practice/db.server")).adminDb();
    const paidSince = new Date(now.getTime() - 70 * DAY).toISOString();
    const periodEnd = new Date(now.getTime() + 12 * DAY).toISOString();
    // Firm, monthly, 33 active clients last month: 3 over the 30 included.
    await makeFirm("monthly", { billing: { plan: "professional", cycle: "monthly", status: "active", razorpay_subscription_id: `sub_m_${stamp}`, razorpay_customer_id: `cust_m_${stamp}`, first_paid_at: paidSince, current_period_end: periodEnd }, activePrev: 33 });
    // Scale, yearly, 80 active clients and 4,900 documents: 5 extra clients, and 100 documents over the 4,800 allowance (1 block).
    await makeFirm("annual", { billing: { plan: "scale", cycle: "annual", status: "active", razorpay_subscription_id: `sub_a_${stamp}`, razorpay_customer_id: `cust_a_${stamp}`, first_paid_at: paidSince, current_period_end: periodEnd }, activePrev: 80, docsPrev: 4900 - 80 });
    // Essential, 8 active: nothing over the plan.
    await makeFirm("inside", { billing: { plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: `sub_i_${stamp}`, first_paid_at: paidSince, current_period_end: periodEnd }, activePrev: 8 });
    // Firm, monthly, started paying on the 20th of last month: only clients worked on after that count.
    await makeFirm("midmonth", { billing: { plan: "professional", cycle: "monthly", status: "active", razorpay_subscription_id: `sub_mm_${stamp}`, first_paid_at: inPrev(20), current_period_end: periodEnd }, activePrev: 34, activeFrom: 22 });
    // Trials: not started for 2 days; and one that switched emails off.
    await makeFirm("trial", { createdAt: new Date(now.getTime() - 2 * DAY).toISOString(), billing: { status: "trialing", trial_started_at: null } });
    await makeFirm("optout", { createdAt: new Date(now.getTime() - 2 * DAY).toISOString(), billing: { status: "trialing", trial_started_at: null }, prefs: { lifecycle_emails: false } });
  }, 120_000);

  afterAll(async () => {
    server?.close();
    if (db) {
      const ids = Object.values(firms);
      const { data: cl } = await db.from("ca_clients").select("business_id").in("ca_firm_id", ids);
      await db.from("ca_firms").delete().in("id", ids);
      const biz = (cl ?? []).map((c) => c.business_id);
      for (let i = 0; i < biz.length; i += 200) await db.from("businesses").delete().in("id", biz.slice(i, i + 200));
    }
  });

  it("bills last month's extras: an add-on for monthly plans, an invoice for yearly ones", async () => {
    const { runArrearsBilling } = await import("@/lib/practice/billing/arrears.server");
    const r = await runArrearsBilling(db, now);
    expect(r.month).toBe(prev);
    const rows = Object.fromEntries(
      await Promise.all(
        Object.entries(firms).map(async ([k, id]) => [k, (await db.from("ca_usage_charges").select("*").eq("ca_firm_id", id).eq("month", prev).maybeSingle()).data] as const),
      ),
    );
    // Monthly Firm: 3 × ₹119 = ₹357 + 18% = ₹421.26, on the next payment.
    expect(rows.monthly).toMatchObject({ active_clients: 33, extra_clients: 3, subtotal: 357, total: 421.26, method: "addon", status: "billed" });
    const addon = calls.find((c) => c.path === `/v1/subscriptions/sub_m_${stamp}/addons`);
    expect(addon?.body).toMatchObject({ quantity: 1, item: { amount: 42126, currency: "INR" } });
    // Yearly Scale: 5 × ₹99 + 1 × ₹499 = ₹994 + 18% = ₹1,172.92, by invoice.
    expect(rows.annual).toMatchObject({ active_clients: 80, documents: 4900, extra_clients: 5, overage_blocks: 1, subtotal: 994, total: 1172.92, method: "invoice", status: "billed" });
    const inv = calls.find((c) => c.path === "/v1/invoices" && (c.body.customer_id as string) === `cust_a_${stamp}`);
    expect(inv?.body).toMatchObject({ type: "invoice", line_items: [{ amount: 117292, currency: "INR", quantity: 1 }], notes: { firm_id: firms.annual, month: prev, kind: "usage" } });
    expect(rows.annual!.pay_url).toMatch(/^https:\/\/rzp\.io\/i\//);
    // Inside the plan: recorded, nothing charged.
    expect(rows.inside).toMatchObject({ active_clients: 8, method: "none", status: "none", total: 0 });
    // Paid from the 20th: the 17 clients last worked on the 19th or before do not count.
    expect(rows.midmonth).toMatchObject({ active_clients: 17, status: "none" });
    expect(rows.trial).toBeNull();
  }, 120_000);

  it("never bills a month twice", async () => {
    const before = calls.filter((c) => c.path.startsWith("/v1/")).length;
    const { runArrearsBilling } = await import("@/lib/practice/billing/arrears.server");
    await runArrearsBilling(db, now);
    expect(calls.filter((c) => c.path.startsWith("/v1/")).length).toBe(before);
  }, 60_000);

  it("a paid invoice and a charged subscription settle the extras", async () => {
    const billing = await import("@/lib/practice/billing.server");
    const inv = (await db.from("ca_usage_charges").select("razorpay_ref").eq("ca_firm_id", firms.annual).single()).data!.razorpay_ref;
    await billing.handleRazorpayWebhook(db, `evt_inv_${stamp}`, { event: "invoice.paid", payload: { invoice: { entity: { id: inv, notes: { kind: "usage", firm_id: firms.annual } } } } });
    await billing.handleRazorpayWebhook(db, `evt_chg_${stamp}`, {
      event: "subscription.charged",
      payload: { subscription: { entity: { id: `sub_m_${stamp}`, status: "active", plan_id: "plan_x", notes: { firm_id: firms.monthly } } } },
    });
    const st = async (k: string) => (await db.from("ca_usage_charges").select("status").eq("ca_firm_id", firms[k]).single()).data!.status;
    expect(await st("annual")).toBe("paid");
    expect(await st("monthly")).toBe("paid");
  }, 60_000);

  it("sends each firm the right email, once", async () => {
    const { runLifecycle } = await import("@/lib/practice/lifecycle/lifecycle.server");
    const r = await runLifecycle(db, now, { force: true, firmIds: Object.values(firms) });
    const sent = Object.fromEntries(r.sent.map((s) => [Object.entries(firms).find(([, id]) => id === s.firmId)![0], s.kind]));
    expect(sent).toEqual({ monthly: "usage_summary", annual: "usage_summary", inside: "usage_summary", midmonth: "usage_summary", trial: "trial_upload_1" });
    const mails = calls.filter((c) => c.path === "/emails").map((c) => c.body as { to: string[]; subject: string; text: string; headers?: Record<string, string> });
    const to = (k: string) => mails.find((e) => e.to[0] === `lc-${k}-${stamp}@test.in`)!;
    expect(to("monthly").subject).toMatch(/: ₹421\.26 in extras$/);
    expect(to("monthly").text).toContain("3 active clients over the 30 in Firm at ₹119 each: ₹357");
    expect(to("monthly").headers).toBeUndefined(); // billing email: no unsubscribe
    expect(to("annual").text).toMatch(/Pay the invoice: https:\/\/rzp\.io\/i\/test\d+/);
    expect(to("inside").subject).toMatch(/^Your FynHelp month: /);
    expect(to("inside").headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(to("trial").subject).toBe("Your FynHelp trial starts with one bank statement");
    expect(mails.some((e) => e.to[0] === `lc-optout-${stamp}@test.in`)).toBe(false);

    const again = await runLifecycle(db, now, { force: true, firmIds: Object.values(firms) });
    expect(again.sent).toEqual([]);
  }, 120_000);

  it("the stop link in an email turns lifecycle emails off for that firm only", async () => {
    const { optOutToken, optOutTokenValid, getLifecycleEmails, setLifecycleEmails } = await import("@/lib/practice/lifecycle/optout.server");
    const t = optOutToken(firms.trial)!;
    expect(optOutTokenValid(firms.trial, t)).toBe(true);
    expect(optOutTokenValid(firms.inside, t)).toBe(false);
    await setLifecycleEmails(db, firms.trial, false);
    expect(await getLifecycleEmails(db, firms.trial)).toBe(false);
    expect(await getLifecycleEmails(db, firms.inside)).toBe(true);
  });
});
