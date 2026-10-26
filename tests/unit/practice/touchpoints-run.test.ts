// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mails: { to: string; subject: string }[] = [];
vi.mock("@/lib/practice/email.server", () => ({
  sendEmail: async (m: { to: string; subject: string }) => {
    mails.push({ to: m.to, subject: m.subject });
    return { sent: true, simulated: false, provider_id: "p1", error: null };
  },
  isEmail: () => true,
}));
vi.mock("@/lib/practice/jobs.server", () => ({
  claimJob: async () => true,
  recordJob: async () => undefined,
  istParts: (d: Date) => ({ hour: 11, hourKey: "k", date: "d", day: 26, month: "2026-10" }),
}));

import { runTouchpoints } from "@/lib/practice/touchpoints/touchpoints.server";

type Row = Record<string, unknown>;
const now = new Date("2026-10-26T06:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;
let tables: Record<string, Row[]> = {};
let users: Row[] = [];

const subjectKey = (r: Row) => `${r.kind}|${r.key}|${r.ca_firm_id ?? r.user_id}`;
function db() {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op = "select";
    let payload: Row = {};
    let wantRows = false;
    const run = () => {
      const rows = tables[table];
      if (op === "insert") {
        if (table === "ca_touchpoints" && rows.some((r) => subjectKey(r) === subjectKey(payload)))
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        rows.push({ id: `${table}-${rows.length + 1}`, status: "open", email_sent_at: null, note: null, ...payload });
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
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      neq: (k: string, v: unknown) => { f.push((r) => r[k] !== v); return b; },
      in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return b; },
      is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return b; },
      gte: (k: string, v: unknown) => { f.push((r) => String(r[k]) >= String(v)); return b; },
      lte: (k: string, v: unknown) => { f.push((r) => String(r[k]) <= String(v)); return b; },
      order: () => b,
      limit: () => b,
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from, auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } } } as never;
}

const firm = (id: string, o: Row = {}) => ({ id, user_id: `u-${id}`, firm_name: `Firm ${id}`, ca_name: "Asha Rao", email: `${id}@x.in`, phone: "919820011223", created_at: ago(3 * D), notification_prefs: {}, is_demo: false, is_test: false, ...o });
const bill = (f: Row, o: Row = {}) => ({ ca_firm_id: f.id, plan: "starter", cycle: "monthly", status: "trialing", trial_ends_at: ago(-10 * D), trial_started_at: null, ca_firms: f, ...o });

beforeEach(() => {
  mails.length = 0;
  users = [];
  tables = { ca_touchpoints: [], ca_billing: [], ca_firms: [], ca_clients: [], ca_document_extractions: [], ca_agent_runs: [], ca_firm_members: [], ca_lifecycle_emails: [] };
});

describe("follow-up runner", () => {
  it("opens a follow-up for a firm with no client, once, and never for a test or demo firm", async () => {
    const a = firm("a");
    const t = firm("t", { is_test: true });
    const d = firm("d", { is_demo: true });
    tables.ca_billing = [bill(a), bill(t), bill(d)];
    tables.ca_firms = [a, t, d];
    expect(await runTouchpoints(db(), now)).toMatchObject({ opened: 1, resolved: 0, errors: 0 });
    expect(tables.ca_touchpoints).toHaveLength(1);
    expect(tables.ca_touchpoints[0]).toMatchObject({ kind: "no_client", ca_firm_id: "a", phone: "919820011223", status: "open" });
    await runTouchpoints(db(), now);
    expect(tables.ca_touchpoints).toHaveLength(1);
  });

  it("closes it by itself when the firm adds a client, and says whether our nudge came first", async () => {
    const a = firm("a");
    tables.ca_billing = [bill(a)];
    tables.ca_firms = [a];
    await runTouchpoints(db(), now);
    tables.ca_clients = [{ ca_firm_id: "a", client_status: "active" }];
    expect(await runTouchpoints(db(), now)).toMatchObject({ opened: 1, resolved: 1, recovered: 0 });
    expect(tables.ca_touchpoints.find((r) => r.kind === "no_client")).toMatchObject({ status: "auto_resolved", recovered: false });

    // A person had written a note on this one: when it resolves, that counts as "came back after we reached out".
    const b = firm("b");
    tables.ca_billing.push(bill(b));
    tables.ca_firms.push(b);
    await runTouchpoints(db(), now);
    const mine = tables.ca_touchpoints.find((r) => r.kind === "no_client" && r.ca_firm_id === "b")!;
    mine.note = "Called, will add tomorrow";
    tables.ca_clients.push({ ca_firm_id: "b", client_status: "active" });
    const run = await runTouchpoints(db(), now);
    expect(run.recovered).toBe(1);
    expect(mine).toMatchObject({ status: "auto_resolved", recovered: true });
  });

  it("a finished follow-up is not opened again for the same stall", async () => {
    const a = firm("a");
    tables.ca_billing = [bill(a)];
    tables.ca_firms = [a];
    await runTouchpoints(db(), now);
    Object.assign(tables.ca_touchpoints[0], { status: "done", outcome: "reached" });
    expect(await runTouchpoints(db(), now)).toMatchObject({ opened: 0 });
    expect(tables.ca_touchpoints).toHaveLength(1);
  });

  it("a sign-up with no firm gets a follow-up and one email; a firm owner or a @fynhelp.com sign-up does not", async () => {
    const owner = firm("o", { user_id: "u-owner" });
    tables.ca_billing = [bill(owner)];
    tables.ca_firms = [owner];
    users = [
      { id: "u-new", email: "new@person.in", created_at: ago(3 * H), user_metadata: { full_name: "Neha Shah", phone: "919811100022", whatsapp_ok: true } },
      { id: "u-owner", email: "o@x.in", created_at: ago(3 * H), user_metadata: {} },
      { id: "u-team", email: "me@fynhelp.com", created_at: ago(3 * H), user_metadata: {} },
      { id: "u-old", email: "old@person.in", created_at: ago(30 * D), user_metadata: {} },
    ];
    const run = await runTouchpoints(db(), now);
    expect(run.emailed).toBe(1);
    expect(mails).toEqual([{ to: "new@person.in", subject: "Your FynHelp account is two minutes from ready" }]);
    const t = tables.ca_touchpoints.find((r) => r.kind === "signup_unfinished")!;
    expect(t).toMatchObject({ user_id: "u-new", phone: "919811100022", whatsapp_ok: true, ca_firm_id: null });
    // Not mailed twice.
    await runTouchpoints(db(), now);
    expect(mails).toHaveLength(1);
    // Once they create a firm the follow-up closes, as recovered (we had emailed).
    const made = firm("n", { user_id: "u-new" });
    tables.ca_firms.push(made);
    tables.ca_billing.push(bill(made, { trial_started_at: null }));
    const after = await runTouchpoints(db(), now);
    expect(after.recovered).toBe(1);
    expect(t).toMatchObject({ status: "auto_resolved", recovered: true });
  });

  it("an abandoned checkout is hot and gets one email naming the plan; a firm that opted out is not mailed", async () => {
    const a = firm("a");
    const q = firm("q", { notification_prefs: { lifecycle_emails: false } });
    const pend = { pending_plan: "professional", razorpay_subscription_id: "sub_1", updated_at: ago(3 * H) };
    tables.ca_billing = [bill(a, pend), bill(q, pend)];
    tables.ca_firms = [a, q];
    tables.ca_clients = [{ ca_firm_id: "a", client_status: "active" }, { ca_firm_id: "q", client_status: "active" }];
    tables.ca_document_extractions = [{ ca_firm_id: "a", created_at: ago(H) }, { ca_firm_id: "q", created_at: ago(H) }];
    await runTouchpoints(db(), now);
    expect(tables.ca_touchpoints.filter((r) => r.kind === "checkout_abandoned" && r.hot)).toHaveLength(2);
    expect(mails.map((m) => m.subject)).toEqual(["Your Firm plan is one step away"]);
    expect(mails[0].to).toBe("a@x.in");
  });
});
