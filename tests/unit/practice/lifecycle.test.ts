import { describe, expect, it } from "vitest";
import { arrearsFor, arrearsLines, arrearsMethod, previousMonth } from "@/lib/practice/billing/arrears";
import { trialEndFrom } from "@/lib/practice/billing/plans";
import { dueEmails, nextEmail, type FirmFacts } from "@/lib/practice/lifecycle/schedule";
import { lifecycleEmail, renderEmail, type EmailContext } from "@/lib/practice/lifecycle/emails";

const DAY = 86_400_000;
const now = new Date("2026-10-17T06:00:00Z"); // 11:30 IST

describe("arrears: extras billed after the month", () => {
  it("charges only extra clients and overage, never the plan price", () => {
    // Spec: Firm, 55 active clients = ₹4,499 + 25 × ₹119; the extras are ₹2,975.
    const a = arrearsFor("professional", "monthly", { activeClients: 55, documents: 0 });
    expect(a).toMatchObject({ extraClients: 25, extraClientsAmount: 2975, overageAmount: 0, subtotal: 2975, gst: 535.5, total: 3510.5, paise: 351050 });
    expect(arrearsFor("scale", "annual", { activeClients: 140, documents: 0 }).subtotal).toBe(6435);
    expect(arrearsFor("starter", "monthly", { activeClients: 10, documents: 0 }).paise).toBe(0);
  });
  it("adds ₹499 per 250 documents over the pooled allowance", () => {
    const a = arrearsFor("professional", "monthly", { activeClients: 30, documents: 1501 });
    expect(a).toMatchObject({ extraClients: 0, overageBlocks: 1, overageAmount: 499, subtotal: 499 });
    expect(arrearsLines("professional", a)).toEqual(["1 block of 250 documents over your pooled allowance at ₹499 each: ₹499"]);
  });
  it("monthly plans ride on the next payment, yearly plans get an invoice", () => {
    expect(arrearsMethod("monthly")).toBe("addon");
    expect(arrearsMethod("annual")).toBe("invoice");
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });
});

const facts = (o: Partial<FirmFacts> & { billing?: Partial<FirmFacts["billing"]> } = {}): FirmFacts => {
  const { billing, ...rest } = o;
  return {
    firmCreatedAt: new Date(now.getTime() - 3 * DAY).toISOString(),
    month: "2026-10",
    previousMonth: "2026-09",
    istDay: 17,
    usage: { activeClients: 3, documents: 20 },
    documentLimit: null,
    lastActivityAt: now.toISOString(),
    sent: new Set(),
    lastSentAt: null,
    optedOut: false,
    previousCharge: null,
    dormantClients: 0,
    ...rest,
    billing: {
      plan: "starter",
      cycle: "monthly",
      status: "trialing",
      trial_ends_at: trialEndFrom(now).toISOString(),
      current_period_end: null,
      trial_started_at: null,
      activated_at: null,
      first_paid_at: null,
      ...billing,
    },
  };
};
const kinds = (f: FirmFacts) => dueEmails(f, now).map((d) => d.kind);
const started = (daysAgo: number, trialDays = 14) => {
  const s = new Date(now.getTime() - daysAgo * DAY);
  return { trial_started_at: s.toISOString(), trial_ends_at: new Date(s.getTime() + trialDays * DAY).toISOString() };
};

describe("trial emails", () => {
  it("nudges a firm that has not uploaded on day 1 and day 4", () => {
    expect(kinds(facts({ firmCreatedAt: new Date(now.getTime() - 1.5 * DAY).toISOString() }))).toEqual(["trial_upload_1"]);
    expect(kinds(facts({ firmCreatedAt: new Date(now.getTime() - 5 * DAY).toISOString() }))).toEqual(["trial_upload_4"]);
    expect(kinds(facts({ firmCreatedAt: new Date(now.getTime() - 2 * 3_600_000).toISOString() }))).toEqual([]);
    expect(kinds(facts({ firmCreatedAt: new Date(now.getTime() - 12 * DAY).toISOString() }))).toEqual([]);
  });
  it("welcomes on the first day, then pushes to the first reconciliation, then recaps", () => {
    expect(kinds(facts({ billing: started(0.2) }))).toEqual(["trial_welcome"]);
    expect(kinds(facts({ billing: started(3) }))).toEqual(["trial_first_recon"]);
    expect(kinds(facts({ billing: { ...started(3), activated_at: new Date(now.getTime() - DAY).toISOString() } }))).toEqual(["trial_activated"]);
    expect(kinds(facts({ billing: started(6) }))).toEqual(["trial_recap"]);
  });
  it("reminds at 5 and 2 days left: day 10 and 12 of 14, day 25 and 28 of 30", () => {
    expect(kinds(facts({ billing: started(10) }))).toContain("trial_ending_5");
    expect(kinds(facts({ billing: started(12) }))).toContain("trial_ending_2");
    expect(kinds(facts({ billing: { ...started(25, 30), activated_at: started(25).trial_started_at } }))).toContain("trial_ending_5");
    expect(kinds(facts({ billing: { ...started(28, 30), activated_at: started(28).trial_started_at } }))).toContain("trial_ending_2");
  });
  it("after the trial: an ended notice, then one win-back", () => {
    expect(kinds(facts({ billing: started(16) }))).toEqual(["trial_ended"]);
    expect(kinds(facts({ billing: started(30) }))).toEqual(["trial_winback"]);
    expect(kinds(facts({ billing: started(40) }))).toEqual([]);
  });
  it("never repeats an email", () => {
    expect(kinds(facts({ billing: started(0.2), sent: new Set(["trial_welcome:"]) }))).toEqual([]);
  });
});

describe("paid plan emails", () => {
  const paid = (o: Partial<FirmFacts> = {}) =>
    facts({
      billing: { status: "active", plan: "professional", current_period_end: new Date(now.getTime() + 10 * DAY).toISOString(), first_paid_at: "2026-08-01T00:00:00Z" },
      documentLimit: 1500,
      ...o,
    });
  it("sends last month's usage summary once the month's charge is recorded; a charge is a billing email", () => {
    expect(kinds(paid())).toEqual([]);
    expect(dueEmails(paid({ previousCharge: { status: "billed" } }), now)).toEqual([{ kind: "usage_summary", key: "2026-09", category: "billing" }]);
    expect(dueEmails(paid({ previousCharge: { status: "none" } }), now)[0]).toMatchObject({ kind: "usage_summary", category: "lifecycle" });
    expect(kinds(paid({ previousCharge: { status: "failed" } }))).toEqual([]);
  });
  it("skips the summary for a firm that started paying this month", () => {
    expect(kinds(facts({ billing: { status: "active", plan: "professional", first_paid_at: "2026-10-05T00:00:00Z" }, previousCharge: { status: "none" } }))).toEqual([]);
  });
  it("warns at 80% and 100% of the document allowance, once a month", () => {
    expect(kinds(paid({ usage: { activeClients: 30, documents: 1200 } }))).toEqual(["docs_80"]);
    expect(kinds(paid({ usage: { activeClients: 30, documents: 1500 } }))).toEqual(["docs_100"]);
    expect(kinds(paid({ usage: { activeClients: 30, documents: 1300 }, sent: new Set(["docs_80:2026-10"]) }))).toEqual([]);
  });
  it("flags Essential nearing its 25-client cap, a quiet firm, and month-end with clients missing", () => {
    expect(kinds(paid({ billing: { status: "active", plan: "starter", first_paid_at: "2026-08-01T00:00:00Z" }, documentLimit: 1000, usage: { activeClients: 21, documents: 10 } }))).toEqual(["essential_cap"]);
    expect(kinds(paid({ lastActivityAt: new Date(now.getTime() - 15 * DAY).toISOString() }))).toEqual(["inactive"]);
    expect(kinds(paid({ istDay: 25, dormantClients: 3 }))).toEqual(["month_end_prep"]);
    expect(kinds(paid({ istDay: 20, dormantClients: 3 }))).toEqual([]);
  });
  it("respects opt-out and one email a day, but billing emails always go", () => {
    const recent = new Date(now.getTime() - 3_600_000).toISOString();
    expect(nextEmail(paid({ lastActivityAt: null, firmCreatedAt: "2026-01-01T00:00:00Z", billing: { status: "active", plan: "professional", first_paid_at: "2026-08-01T00:00:00Z" }, optedOut: true }), now)).toBeNull();
    expect(nextEmail(paid({ usage: { activeClients: 30, documents: 1500 }, lastSentAt: recent }), now)).toBeNull();
    expect(nextEmail(paid({ previousCharge: { status: "billed" }, optedOut: true, lastSentAt: recent }), now)?.kind).toBe("usage_summary");
  });
});

describe("email copy", () => {
  const ctx: EmailContext = {
    firmName: "Mehta & <Associates>",
    plan: "professional",
    cycle: "monthly",
    trialDaysLeft: 5,
    trialEndsAt: "2026-10-22T06:00:00Z",
    totals: { clients: 4, documents: 37, matchedLines: 412, reports: 2 },
    usage: { activeClients: 4, documents: 37 },
    documentLimit: 1500,
    recommended: { plan: "starter", subtotal: 1999 },
    dormantClientNames: ["Sundar Textiles", "Kothari Foods"],
  };
  it("uses the firm's own numbers and escapes HTML", () => {
    const parts = lifecycleEmail("trial_ending_5", ctx);
    expect(parts.subject).toBe("5 days left in your FynHelp trial");
    expect(parts.paragraphs.join(" ")).toContain("read 37 documents, matched 412 bank lines and made 2 MIS reports");
    const { html, text } = renderEmail(parts, { appUrl: "https://www.fynhelp.com", firmName: ctx.firmName, unsubscribeUrl: "https://www.fynhelp.com/api/public/email-preferences?f=x&t=y", category: "lifecycle" });
    expect(html).toContain("Mehta &amp; &lt;Associates&gt;");
    expect(html).not.toContain("<Associates>");
    expect(html).toContain('href="https://www.fynhelp.com/app/settings"');
    expect(text).toContain("Stop these emails: https://www.fynhelp.com/api/public/email-preferences?f=x&t=y");
  });
  it("explains a usage charge and how it is collected; billing emails carry no unsubscribe link", () => {
    const a = arrearsFor("professional", "monthly", { activeClients: 35, documents: 0 });
    const parts = lifecycleEmail("usage_summary", {
      ...ctx,
      previous: { month: "2026-09", activeClients: 35, documents: 800, reports: 30, arrears: a, method: "addon", payUrl: null, nextPaymentDate: "2026-10-28T00:00:00Z" },
    });
    expect(parts.subject).toBe("Your FynHelp usage for September 2026: ₹702.1 in extras");
    expect(parts.paragraphs.join(" ")).toContain("added to your next subscription payment on 28 October");
    expect(parts.bullets).toEqual(["5 active clients over the 30 in Firm at ₹119 each: ₹595"]);
    const { text } = renderEmail(parts, { appUrl: "https://www.fynhelp.com", firmName: "X", unsubscribeUrl: "https://u", category: "billing" });
    expect(text).not.toContain("Stop these emails");
  });
  it("month-end reminder lists the quiet clients", () => {
    expect(lifecycleEmail("month_end_prep", ctx).bullets).toEqual(["Sundar Textiles", "Kothari Foods"]);
  });
});
