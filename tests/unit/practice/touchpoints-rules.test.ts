// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scriptFor, wanted, type SubjectFacts } from "@/lib/practice/touchpoints/rules";

const now = new Date("2026-10-26T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

const firm = (o: Partial<SubjectFacts> & { billing?: Partial<NonNullable<SubjectFacts["billing"]>> } = {}): SubjectFacts => {
  const { billing, ...rest } = o;
  return {
    type: "firm",
    createdAt: ago(3 * D),
    name: "Asha Rao",
    email: "asha@rao.example",
    phone: "919820011223",
    firmName: "Rao & Co",
    whatsappOk: true,
    clients: 0,
    documents: 0,
    lastActivityAt: null,
    billing: { plan: "starter", cycle: "monthly", status: "trialing", trial_ends_at: ago(-10 * D), trial_started_at: null, ...billing },
    ...rest,
  };
};
const kinds = (f: SubjectFacts) => wanted(f, now).map((w) => w.kind);

describe("who needs a human touch", () => {
  it("a sign-up with no firm: after 30 minutes a follow-up, after an hour an email too, and not after a week", () => {
    const s = (ms: number): SubjectFacts => ({ type: "signup", createdAt: ago(ms), name: "Asha", email: "a@x.in", phone: null, firmName: null, whatsappOk: false, clients: 0, documents: 0, lastActivityAt: null });
    expect(wanted(s(10 * 60_000), now)).toEqual([]);
    expect(wanted(s(40 * 60_000), now)[0]).toMatchObject({ kind: "signup_unfinished", email: null });
    expect(wanted(s(2 * H), now)[0]).toMatchObject({ kind: "signup_unfinished", email: "signup_unfinished" });
    expect(wanted(s(8 * D), now)).toEqual([]);
  });

  it("a firm with no client after a day, no upload after two, and neither once they have paid", () => {
    expect(kinds(firm({ createdAt: ago(5 * H) }))).toEqual([]);
    expect(kinds(firm({ createdAt: ago(D + H) }))).toEqual(["no_client"]);
    expect(kinds(firm({ createdAt: ago(3 * D), clients: 2 }))).toEqual(["no_upload"]);
    expect(kinds(firm({ createdAt: ago(3 * D), clients: 2, documents: 1 }))).toEqual([]);
    expect(kinds(firm({ createdAt: ago(40 * D) }))).toEqual([]);
  });

  it("checkout abandoned: plan chosen at Razorpay, not paid, after 45 minutes; hot; email after an hour", () => {
    const b = (ms: number) => firm({ clients: 1, documents: 3, billing: { pending_plan: "professional", razorpay_subscription_id: "sub_1", updated_at: ago(ms) } });
    expect(kinds(b(20 * 60_000))).not.toContain("checkout_abandoned");
    const w = wanted(b(50 * 60_000), now).find((x) => x.kind === "checkout_abandoned")!;
    expect(w).toMatchObject({ hot: true, key: "professional", email: null });
    expect(wanted(b(3 * H), now).find((x) => x.kind === "checkout_abandoned")!.email).toBe("checkout_abandoned");
    expect(kinds(b(15 * D))).not.toContain("checkout_abandoned");
    // Once active, it is no longer abandoned.
    expect(kinds(firm({ billing: { status: "active", pending_plan: "professional", razorpay_subscription_id: "sub_1", updated_at: ago(2 * H), first_paid_at: ago(H) } }))).not.toContain("checkout_abandoned");
  });

  it("a trial that is ending without a plan is hot, and one that ended is too, for a week", () => {
    const running = (left: number) => firm({ createdAt: ago(10 * D), clients: 3, documents: 20, lastActivityAt: ago(H), billing: { trial_started_at: ago(10 * D), trial_ends_at: new Date(now.getTime() + left * D).toISOString() } });
    expect(kinds(running(8))).toEqual([]);
    expect(wanted(running(2), now).find((w) => w.kind === "trial_ending_unpaid")).toMatchObject({ hot: true });
    const ended = firm({ createdAt: ago(20 * D), clients: 3, documents: 20, billing: { trial_started_at: ago(20 * D), trial_ends_at: ago(2 * D) } });
    expect(kinds(ended)).toContain("trial_ended_unpaid");
    expect(kinds(firm({ createdAt: ago(40 * D), billing: { trial_started_at: ago(30 * D), trial_ends_at: ago(10 * D) } }))).not.toContain("trial_ended_unpaid");
  });

  it("a trial with nothing happening for 4 days, a failing payment, and a paying firm gone quiet", () => {
    expect(kinds(firm({ createdAt: ago(8 * D), clients: 1, documents: 2, lastActivityAt: ago(5 * D), billing: { trial_started_at: ago(7 * D), trial_ends_at: ago(-7 * D) } }))).toContain("trial_stalled");
    expect(kinds(firm({ billing: { status: "past_due", first_paid_at: ago(40 * D) }, clients: 4 }))).toContain("payment_failed");
    expect(kinds(firm({ createdAt: ago(90 * D), clients: 5, documents: 50, lastActivityAt: ago(12 * D), billing: { status: "active", plan: "professional", first_paid_at: ago(60 * D), current_period_end: ago(-10 * D) } }))).toEqual(["paid_quiet"]);
    expect(kinds(firm({ createdAt: ago(90 * D), clients: 5, documents: 50, lastActivityAt: ago(2 * D), billing: { status: "active", first_paid_at: ago(60 * D), current_period_end: ago(-10 * D) } }))).toEqual([]);
  });

  it("every follow-up has a warm, specific opener with the person's own details, and none is a pitch", () => {
    const f = { name: "Asha Rao", firmName: "Rao & Co", clients: 2, documents: 14 };
    for (const k of ["signup_unfinished", "no_client", "no_upload", "trial_stalled", "checkout_abandoned", "trial_ending_unpaid", "trial_ended_unpaid", "payment_failed", "paid_quiet"] as const) {
      const s = scriptFor(k, f, "Tarun");
      expect(s).toContain("Hi Asha");
      expect(s).toContain("Tarun");
      expect(s.length).toBeLessThan(420);
      expect(s).not.toMatch(/discount|offer ends|limited time|buy now/i);
    }
    expect(scriptFor("no_client", { name: null, firmName: null, clients: 0, documents: 0 })).toContain("Hi there, it's the team at FynHelp");
  });
});
