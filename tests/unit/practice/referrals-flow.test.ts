// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyReferral, ensureReferralCode, onClientAdded, referralView } from "@/lib/practice/referrals.server";

/** A tiny in-memory stand-in for the database client: filters, inserts with the migration's unique keys, updates. */
type Row = Record<string, unknown>;
const UNIQUE: Record<string, string[][]> = { ca_referrals: [["referred_firm_id"]], ca_referral_rewards: [["referral_id", "role"]], ca_firms: [["referral_code"]] };

/** Column defaults the migration sets. */
const DEFAULTS: Record<string, Row> = { ca_referrals: { status: "signed_up" } };

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let n = 0;
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    let wantRows = false;
    let lim = Infinity;
    const run = () => {
      const rows = tables[table];
      if (op === "insert") {
        const row = { id: `${table}-${++n}`, created_at: new Date().toISOString(), ...(DEFAULTS[table] ?? {}), ...payload };
        for (const key of UNIQUE[table] ?? [])
          if (row[key[0]] != null && rows.some((r) => key.every((k) => r[k] === row[k]))) return { data: null, error: { message: `duplicate key value violates unique constraint ${table}` } };
        rows.push(row);
        return { data: wantRows ? [row] : null, error: null };
      }
      const hit = rows.filter((r) => f.every((fn) => fn(r)));
      if (op === "update") {
        const done = hit.filter((r) => !(UNIQUE[table] ?? []).some((key) => payload[key[0]] != null && rows.some((o) => o !== r && key.every((k) => (k in payload ? payload[k] : r[k]) === o[k]))));
        done.forEach((r) => Object.assign(r, payload));
        return { data: wantRows ? done : null, error: done.length < hit.length ? { message: "duplicate key" } : null };
      }
      return { data: hit.slice(0, lim), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => { wantRows = true; return b; },
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return b; },
      gte: (k: string, v: unknown) => { f.push((r) => String(r[k]) >= String(v)); return b; },
      in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return b; },
      order: () => b,
      limit: (x: number) => { lim = x; return b; },
      maybeSingle: () => { const r = run(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }); },
      single: () => b.maybeSingle,
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return b;
  };
  return { db: { from } as never, tables };
}

const day = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * day).toISOString();
const ctx = (firmId: string) => ({ firmId, userId: `u-${firmId}`, firmName: firmId, firmEmail: null }) as never;

let h: ReturnType<typeof fakeDb>;
beforeEach(() => {
  h = fakeDb({
    ca_firms: [
      { id: "R", user_id: "uR", email: "r@x.in", created_at: iso(-90), is_demo: false, firm_name: "Rao & Co", referral_code: null },
      { id: "N", user_id: "uN", email: "n@x.in", created_at: iso(-1), is_demo: false, firm_name: "Nair Associates", referral_code: null },
    ],
    ca_billing: [
      { ca_firm_id: "R", status: "trialing", plan: "starter", cycle: "monthly", trial_ends_at: iso(10), trial_bonus_days: 0 },
      { ca_firm_id: "N", status: "trialing", plan: "starter", cycle: "monthly", trial_ends_at: iso(12), trial_bonus_days: 0 },
    ],
  });
});

const trialEnd = (firm: string) => Date.parse(h.tables["ca_billing"].find((b) => b.ca_firm_id === firm)!.trial_ends_at as string);

describe("referral flow", () => {
  it("gives every firm one stable code", async () => {
    const a = await ensureReferralCode(h.db, "R");
    expect(a).toMatch(/^FH[A-Z2-9]{6}$/);
    expect(await ensureReferralCode(h.db, "R")).toBe(a);
  });

  it("links a new firm to the referrer without rewarding anyone yet", async () => {
    const code = await ensureReferralCode(h.db, "R");
    const before = trialEnd("N");
    expect(await applyReferral(h.db, ctx("N"), code)).toEqual({ ok: true, referrerName: "Rao & Co" });
    expect(h.tables["ca_referrals"]).toHaveLength(1);
    expect(h.tables["ca_referral_rewards"] ?? []).toHaveLength(0);
    expect(trialEnd("N")).toBe(before);
  });

  it("refuses unknown codes, its own code, and a second code", async () => {
    const code = await ensureReferralCode(h.db, "R");
    expect(await applyReferral(h.db, ctx("N"), "FHZZZZZZ")).toMatchObject({ ok: false });
    expect(await applyReferral(h.db, ctx("N"), "nonsense")).toMatchObject({ ok: false });
    expect(await applyReferral(h.db, ctx("R"), code)).toMatchObject({ ok: false, message: expect.stringMatching(/own referral code/) });
    expect((await applyReferral(h.db, ctx("N"), code)).ok).toBe(true);
    expect(await applyReferral(h.db, ctx("N"), code)).toMatchObject({ ok: false, message: expect.stringMatching(/already used/) });
    expect(h.tables["ca_referrals"]).toHaveLength(1);
  });

  it("on the first client, extends both trials by 30 days, once", async () => {
    const code = await ensureReferralCode(h.db, "R");
    await applyReferral(h.db, ctx("N"), code);
    const [r0, n0] = [trialEnd("R"), trialEnd("N")];
    await onClientAdded(h.db, "N");
    expect(trialEnd("R")).toBe(r0 + 30 * day);
    expect(trialEnd("N")).toBe(n0 + 30 * day);
    expect(h.tables["ca_referral_rewards"].map((r) => `${r.role}:${r.mode}:${r.status}`).sort()).toEqual(["referred:trial_extension:applied", "referrer:trial_extension:applied"]);
    expect(h.tables["ca_referrals"][0].status).toBe("qualified");
    // The second client, a retry, or a double click changes nothing.
    await onClientAdded(h.db, "N");
    await Promise.all([onClientAdded(h.db, "N"), onClientAdded(h.db, "N")]);
    expect(trialEnd("R")).toBe(r0 + 30 * day);
    expect(trialEnd("N")).toBe(n0 + 30 * day);
    expect(h.tables["ca_referral_rewards"]).toHaveLength(2);
    expect(h.tables["ca_billing"].find((b) => b.ca_firm_id === "R")!.trial_bonus_days).toBe(30);
  });

  it("does nothing for a firm that was never referred", async () => {
    await onClientAdded(h.db, "N");
    expect(h.tables["ca_referral_rewards"] ?? []).toHaveLength(0);
    expect(trialEnd("N")).toBeLessThan(Date.now() + 13 * day);
  });

  it("credits a paying firm through billing and leaves its trial dates alone", async () => {
    h.tables["ca_billing"].find((b) => b.ca_firm_id === "R")!.status = "active";
    const code = await ensureReferralCode(h.db, "R");
    await applyReferral(h.db, ctx("N"), code);
    const r0 = trialEnd("R");
    await onClientAdded(h.db, "N");
    const rewards = h.tables["ca_referral_rewards"];
    expect(rewards.find((r) => r.role === "referrer")).toMatchObject({ mode: "billing_credit", status: "pending_billing" });
    expect(rewards.find((r) => r.role === "referred")).toMatchObject({ mode: "trial_extension", status: "applied" });
    expect(trialEnd("R")).toBe(r0);
  });

  it("stops rewarding a referrer past 12 months a year, but still rewards the new firm", async () => {
    const code = await ensureReferralCode(h.db, "R");
    await applyReferral(h.db, ctx("N"), code);
    h.tables["ca_referral_rewards"] = Array.from({ length: 12 }, (_, i) => ({ id: `old${i}`, referral_id: `old${i}`, ca_firm_id: "R", role: "referrer", months: 1, created_at: iso(-30) }));
    const r0 = trialEnd("R");
    await onClientAdded(h.db, "N");
    expect(trialEnd("R")).toBe(r0);
    expect(h.tables["ca_referral_rewards"].filter((r) => r.referral_id !== undefined && String(r.id).startsWith("ca_referral_rewards"))).toHaveLength(1);
    expect(trialEnd("N")).toBeGreaterThan(Date.now() + 40 * day);
  });

  it("shows each side what happened", async () => {
    const code = await ensureReferralCode(h.db, "R");
    await applyReferral(h.db, ctx("N"), code);
    await onClientAdded(h.db, "N");
    const r = await referralView(h.db, ctx("R"));
    expect(r).toMatchObject({ code, monthsEarned: 1, monthsPending: 0 });
    expect(r.referrals).toMatchObject([{ firmName: "Nair Associates", status: "qualified" }]);
    const n = await referralView(h.db, ctx("N"));
    expect(n.referredBy).toEqual({ firmName: "Rao & Co", status: "qualified" });
    expect(n.monthsEarned).toBe(1);
  });
});
