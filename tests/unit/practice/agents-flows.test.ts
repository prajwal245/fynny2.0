import { describe, expect, it } from "vitest";
import {
  ASKABLE_KINDS,
  draftQuery,
  groupForQuery,
  interpretReply,
  promisedDay,
  resumeAfterPromise,
  type ClientContact,
  type QueryItem,
} from "@/lib/practice/agents/queryLoop";
import {
  buildDecisionIndex,
  candidateRules,
  confidenceOf,
  suggestMany,
  suggestTreatment,
  type PastDecision,
} from "@/lib/practice/agents/classifier";
import {
  reviewBeforeSignOff,
  type ReviewInput,
} from "@/lib/practice/agents/reviewer";
import {
  needsYou,
  nextAction,
  rankPortfolio,
  type ClientMonth,
} from "@/lib/practice/agents/conductor";
import {
  GST_MONTHLY_KEYS,
  gstMonthPlan,
  supplierDrafts,
} from "@/lib/practice/agents/gstLoop";
import { decisionPattern } from "@/lib/practice/memory";
import type { CloseFacts } from "@/lib/practice/close/steps";
import type { InputStates } from "@/lib/practice/readiness/model";
import type { GstInvoice } from "@/lib/practice/gst/invoices";
import type { VendorFollowUp } from "@/lib/practice/gst/reconcile";

/* ───────────── the client query loop ───────────── */

const item = (over: Partial<QueryItem> = {}): QueryItem => ({
  id: "e1",
  clientId: "c1",
  kind: "unidentified",
  date: "2026-10-14",
  amount: 48200,
  direction: "in",
  narration: "NEFT CR UNKNOWN TRADERS",
  ...over,
});
const contact = (over: Partial<ClientContact> = {}): ClientContact => ({
  clientId: "c1",
  clientName: "Mehta Textiles",
  contactName: "Rakesh",
  email: "rakesh@mehta.example",
  phone: "+91 98765 43210",
  consent: { email: true, whatsapp: true },
  doNotDisturb: false,
  preferred: null,
  ...over,
});
const NOW = new Date("2026-11-10T06:00:00Z"); // 11:30 IST on 10 Nov

describe("grouping open items for a client", () => {
  it("asks the client only about what a client can answer", () => {
    const all = (
      [
        "unidentified",
        "amount_difference",
        "timing_difference",
        "duplicate",
        "gst_mismatch",
        "cash",
        "own_account",
      ] as const
    ).map((kind, i) => item({ id: `e${i}`, kind }));
    const groups = groupForQuery(all);
    const kinds = groups.flatMap((g) => g.items.map((i) => i.kind));
    expect(kinds.sort()).toEqual([...ASKABLE_KINDS].sort());
  });

  it("makes one group per client, oldest first, and splits a long list", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) =>
        item({
          id: `a${i}`,
          clientId: "c1",
          date: `2026-10-${String(20 - i).padStart(2, "0")}`,
        }),
      ),
      item({ id: "b1", clientId: "c2" }),
    ];
    const g = groupForQuery(items, { max: 4 });
    expect(
      g.filter((x) => x.clientId === "c1").map((x) => x.items.length),
    ).toEqual([4, 4, 2]);
    expect(g.filter((x) => x.clientId === "c2")).toHaveLength(1);
    const first = g.find((x) => x.clientId === "c1")!;
    expect(first.items.map((i) => i.date)).toEqual(
      [...first.items.map((i) => i.date)].sort(),
    );
  });

  it("returns nothing for nothing", () => {
    expect(groupForQuery([])).toEqual([]);
  });
});

describe("drafting a question", () => {
  const group = {
    clientId: "c1",
    items: [
      item(),
      item({
        id: "e2",
        kind: "amount_difference",
        amount: 100000,
        bookAmount: 98000,
        direction: "in",
        narration: "Kaveri Fashions",
      }),
      item({
        id: "e3",
        kind: "cash",
        direction: "out",
        amount: 25000,
        narration: "ATM WDL",
      }),
    ],
  };

  it("always needs approval and carries the pause-window action", () => {
    const d = draftQuery(group, contact(), { name: "Shah & Co" });
    expect(d.needsApproval).toBe(true);
    expect(d.riskId).toBe("query_send");
    expect(d.itemIds).toEqual(["e1", "e2", "e3"]);
  });

  it("states each item with its date, direction, amount and a plain question, and invents nothing", () => {
    const d = draftQuery(group, contact(), { name: "Shah & Co" });
    expect(d.body).toContain("14 Oct, received ₹48,200");
    expect(d.body).toContain("Our books show ₹98,000 and the bank ₹1,00,000");
    expect(d.body).toContain("paid ₹25,000");
    expect(d.body).toContain("cash for sales, an expense, or a transfer");
    expect(d.subject).toBe("3 questions about Mehta Textiles's books");
    expect(d.body).toMatch(/Thank you, Shah & Co$/);
  });

  it("changes tone, not facts", () => {
    const gentle = draftQuery(
      group,
      contact(),
      { name: "Shah & Co" },
      "gentle",
    ).body;
    const firm = draftQuery(
      group,
      contact(),
      { name: "Shah & Co" },
      "firm",
    ).body;
    expect(gentle).toContain("hope you're well");
    expect(firm).toContain("cannot complete your books");
    expect(gentle.split("\n").filter((l) => /^\d\./.test(l))).toEqual(
      firm.split("\n").filter((l) => /^\d\./.test(l)),
    );
  });

  it("uses only a channel the client agreed to, preferring theirs", () => {
    expect(draftQuery(group, contact(), { name: "F" }).channel).toBe("email");
    expect(
      draftQuery(group, contact({ preferred: "whatsapp" }), { name: "F" })
        .channel,
    ).toBe("whatsapp");
    expect(
      draftQuery(
        group,
        contact({ consent: { email: false, whatsapp: true } }),
        { name: "F" },
      ).channel,
    ).toBe("whatsapp");
    expect(
      draftQuery(
        group,
        contact({
          preferred: "whatsapp",
          consent: { email: true, whatsapp: false },
        }),
        { name: "F" },
      ).channel,
    ).toBe("email");
  });

  it("will not draft for a client who has not consented, has no address, or asked not to be messaged", () => {
    const none = draftQuery(
      group,
      contact({ consent: { email: false, whatsapp: false } }),
      { name: "F" },
    );
    expect(none.channel).toBeNull();
    expect(none.whyNot).toMatch(/consent/);
    expect(
      draftQuery(group, contact({ email: null, phone: "" }), { name: "F" })
        .channel,
    ).toBeNull();
    const dnd = draftQuery(group, contact({ doNotDisturb: true }), {
      name: "F",
    });
    expect(dnd.channel).toBeNull();
    expect(dnd.whyNot).toMatch(/not to be messaged/);
  });

  it("greets a client with no contact name without breaking", () => {
    expect(
      draftQuery(group, contact({ contactName: null }), { name: "F" }).body,
    ).toContain("Hi there");
  });
});

describe("reading a reply is only ever a proposal", () => {
  it("always requires confirmation", () => {
    for (const t of [
      "",
      "STOP",
      "will send tomorrow",
      "it was rent for the shop for october",
      "ok",
    ])
      expect(interpretReply(t, NOW).requiresConfirmation).toBe(true);
  });

  it("recognises a request to stop", () => {
    expect(interpretReply("STOP", NOW).kind).toBe("stop");
    expect(interpretReply("please do not message me again", NOW).kind).toBe(
      "stop",
    );
  });

  it("reads a promised day in India time", () => {
    expect(promisedDay("will send tomorrow", NOW)).toBe("2026-11-11");
    expect(promisedDay("day after tomorrow", NOW)).toBe("2026-11-12");
    expect(promisedDay("in 3 days", NOW)).toBe("2026-11-13");
    expect(promisedDay("by 25 Nov", NOW)).toBe("2026-11-25");
    expect(promisedDay("on 25/11", NOW)).toBe("2026-11-25");
    expect(promisedDay("by 5th Nov", NOW)).toBe("2027-11-05"); // already passed this year
  });

  it("uses the date in India, not UTC, around midnight", () => {
    const lateUtc = new Date("2026-11-10T19:00:00Z"); // 00:30 IST on 11 Nov
    expect(promisedDay("tomorrow", lateUtc)).toBe("2026-11-12");
  });

  it("rejects dates that do not exist", () => {
    expect(promisedDay("by 31 Feb", NOW)).toBeNull();
    expect(promisedDay("on 45/13", NOW)).toBeNull();
  });

  it("classifies a promise, an answer and an unclear reply", () => {
    expect(
      interpretReply("Will send the statement tomorrow", NOW),
    ).toMatchObject({ kind: "promise", promisedDate: "2026-11-11" });
    expect(
      interpretReply("That was rent paid to the landlord for October", NOW)
        .kind,
    ).toBe("answer");
    expect(interpretReply("ok", NOW).kind).toBe("unclear");
    expect(interpretReply("   ", NOW)).toMatchObject({
      kind: "unclear",
      confidence: 0,
    });
  });

  it("turns a confirmed promise into the day the chase resumes, and nothing else", () => {
    const p = interpretReply("will send by 25 Nov", NOW);
    expect(resumeAfterPromise(p, NOW)).toBe("2026-11-26T04:30:00.000Z"); // next day 10:00 IST
    expect(
      resumeAfterPromise(interpretReply("that was rent for october", NOW), NOW),
    ).toBeNull();
  });

  it("keeps a very long reply within bounds", () => {
    expect(interpretReply("x".repeat(5000), NOW).text.length).toBe(1000);
  });
});

/* ───────────── the classifier ───────────── */

const line = {
  side: "bank" as const,
  direction: "out" as const,
  description: "NEFT DR SHARMA TRANSPORT FREIGHT OCT",
  amount: 8000,
};
const pattern = decisionPattern(line);
const past = (treatment: string, n: number): PastDecision[] =>
  Array.from({ length: n }, (_, i) => ({
    pattern,
    treatment,
    at: `2026-0${(i % 9) + 1}-01`,
  }));

describe("the classifier", () => {
  it("has a pattern for a distinctive narration", () => {
    expect(pattern).not.toBe("");
  });

  it("offers nothing without an earlier decision, and says why", () => {
    expect(suggestTreatment(line, [])).toMatchObject({ kind: "none" });
    expect(
      suggestTreatment({ ...line, description: "" }, past("Freight", 5)),
    ).toMatchObject({ kind: "none" });
  });

  it("will not suggest from a single earlier decision", () => {
    expect(suggestTreatment(line, past("Freight", 1)).kind).toBe("uncertain");
  });

  it("suggests the treatment chosen most, with its support and reason", () => {
    const s = suggestTreatment(line, past("Freight", 5));
    expect(s).toMatchObject({
      kind: "suggest",
      treatment: "Freight",
      support: 5,
      total: 5,
      reason: "Treated this way 5 of 5 times before.",
    });
    expect(s.kind === "suggest" && s.ruleId).toBe(`classify:${pattern}`);
  });

  it("is uncertain when the earlier choices disagree", () => {
    const s = suggestTreatment(line, [
      ...past("Freight", 3),
      ...past("Purchases", 3),
    ]);
    expect(s.kind).toBe("uncertain");
    expect(
      s.kind === "uncertain" && s.candidates.map((c) => c.treatment),
    ).toEqual(["Freight", "Purchases"]);
  });

  it("grows more confident with more consistent decisions", () => {
    expect(confidenceOf(3, 3)).toBeLessThan(confidenceOf(10, 10));
    expect(confidenceOf(10, 10)).toBeGreaterThanOrEqual(0.9); // reads as Confident
    expect(confidenceOf(8, 10)).toBeLessThan(confidenceOf(10, 10));
    expect(confidenceOf(0, 0)).toBe(0);
  });

  it("gives the same answer from a prebuilt index as from the plain history", () => {
    const history = [
      ...past("Freight", 5),
      ...past("Purchases", 1),
      { pattern: "bank:in:other", treatment: "Sales", at: "2026-01-01" },
    ];
    const lines = [
      line,
      { ...line, description: "NEFT CR SOMEONE ELSE ENTIRELY" },
      { ...line, description: "" },
    ];
    const index = buildDecisionIndex(history);
    for (const l of lines)
      expect(suggestTreatment(l, index)).toEqual(suggestTreatment(l, history));
    expect(suggestMany(lines, history)).toEqual(
      lines.map((l) => suggestTreatment(l, history)),
    );
  });

  it("classifies a month of lines against a large history in well under a second", () => {
    const big: PastDecision[] = Array.from({ length: 100_000 }, (_, i) => ({
      pattern: decisionPattern({
        ...line,
        description: `NEFT DR PARTY${i % 10_000} FREIGHT`,
      }),
      treatment: "Freight",
      at: "x",
    }));
    const lines = Array.from({ length: 5_000 }, (_, i) => ({
      ...line,
      description: `NEFT DR PARTY${i} FREIGHT`,
    }));
    const started = Date.now();
    const out = suggestMany(lines, big);
    expect(Date.now() - started).toBeLessThan(3_000); // about 20 ms in practice; the margin is for slow machines
    expect(out.filter((o) => o.kind === "suggest").length).toBe(5_000);
  });

  it("offers a pattern as a rule only when decided often and consistently", () => {
    const hist = [
      ...past("Freight", 6),
      ...[{ pattern: "bank:in:other", treatment: "Sales", at: "2026-01-01" }],
    ];
    expect(candidateRules(hist).map((r) => r.treatment)).toEqual(["Freight"]);
    expect(
      candidateRules([...past("Freight", 4), ...past("Purchases", 2)]),
    ).toEqual([]);
    expect(candidateRules([])).toEqual([]);
  });
});

/* ───────────── the pre-sign-off reviewer ───────────── */

const facts = (over: Partial<CloseFacts> = {}): CloseFacts => ({
  statements: {
    expected: 2,
    received: 2,
    verified: 2,
    held: 0,
    failed: 0,
    notAvailable: 0,
  },
  recon: { bank: 100, runDone: true },
  exceptions: { open: 0, explained: 0 },
  report: { exists: true, signedOff: false },
  confirmed: {},
  ...over,
});
const review = (
  over: Partial<ReviewInput> = {},
  f: CloseFacts = facts(),
): ReviewInput => ({
  facts: f,
  reconProofOk: true,
  reviewRowsOpen: 0,
  negativeCashDays: 0,
  openingDifferences: null,
  current: null,
  prior: null,
  ledgerMapConfirmed: true,
  missingGstInputs: 0,
  ...over,
});

describe("the pre-sign-off reviewer", () => {
  it("has nothing to say about a clean month", () => {
    expect(reviewBeforeSignOff(review())).toMatchObject({
      findings: [],
      mustCheck: 0,
      ready: true,
      summary: "Nothing to check.",
    });
  });

  it("flags what must be checked, and puts it before the notes", () => {
    const r = reviewBeforeSignOff(
      review(
        { reviewRowsOpen: 2, negativeCashDays: 1, ledgerMapConfirmed: false },
        facts({
          statements: {
            expected: 3,
            received: 2,
            verified: 1,
            held: 1,
            failed: 0,
            notAvailable: 0,
          },
          exceptions: { open: 5, explained: 2 },
        }),
      ),
    );
    expect(r.ready).toBe(false);
    const ids = r.findings.map((x) => x.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "statements_missing",
        "statements_held",
        "exceptions_open",
        "review_rows",
        "negative_cash",
        "ledger_map",
      ]),
    );
    const firstNote = r.findings.findIndex((x) => x.severity === "note");
    expect(
      r.findings.slice(0, firstNote).every((x) => x.severity === "check"),
    ).toBe(true);
    expect(r.findings.find((x) => x.id === "exceptions_open")!.title).toBe(
      "3 exceptions not explained",
    );
    expect(r.summary).toBe("5 things to check before signing off.");
  });

  it("treats a failed self-check or an unrun reconciliation as something to check", () => {
    expect(
      reviewBeforeSignOff(review({ reconProofOk: false })).findings.map(
        (f) => f.id,
      ),
    ).toContain("recon_proof_failed");
    expect(
      reviewBeforeSignOff(
        review({}, facts({ recon: { bank: 10, runDone: false } })),
      ).findings.map((f) => f.id),
    ).toContain("recon_not_run");
  });

  it("notes a sharp swing only when it is large in share and in rupees", () => {
    const ids = (cur: number, pri: number) =>
      reviewBeforeSignOff(
        review({
          current: { receipts: cur, expenses: 0 },
          prior: { receipts: pri, expenses: 0 },
        }),
      ).findings.map((f) => f.id);
    expect(ids(5_000_000, 1_000_000)).toContain("swing_receipts");
    expect(ids(10_050, 10_000)).not.toContain("swing_receipts"); // small share
    expect(ids(30_000, 10_000)).not.toContain("swing_receipts"); // large share, small rupees
    expect(ids(5_000_000, 0)).not.toContain("swing_receipts"); // nothing to compare with
  });

  it("is ready with only notes, and says so", () => {
    const r = reviewBeforeSignOff(
      review({ missingGstInputs: 2, ledgerMapConfirmed: false }),
    );
    expect(r.ready).toBe(true);
    expect(r.summary).toBe("Nothing blocks sign-off. 2 notes to read.");
  });

  it("does not change its input", () => {
    const input = review({ reviewRowsOpen: 1 });
    const copy = JSON.stringify(input);
    reviewBeforeSignOff(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

/* ───────────── the close conductor ───────────── */

const month = (over: Partial<ClientMonth> = {}): ClientMonth => ({
  clientId: "c1",
  clientName: "Mehta Textiles",
  period: "2026-10",
  facts: facts({
    statements: {
      expected: 2,
      received: 0,
      verified: 0,
      held: 0,
      failed: 0,
      notAvailable: 0,
    },
    recon: { bank: 0, runDone: false },
    report: { exists: false, signedOff: false },
  }),
  ...over,
});
const allDone = (): CloseFacts =>
  facts({
    report: { exists: true, signedOff: true },
    confirmed: {
      gst: { by: "a", at: "x" },
      tds: { by: "a", at: "x" },
      provisions: { by: "a", at: "x" },
      mis_reviewed: { by: "a", at: "x" },
    },
  });

describe("the close conductor", () => {
  it("starts a fresh month by asking the client, and says what it waits for", () => {
    const a = nextAction(month(), NOW);
    expect(a).toMatchObject({
      stepKey: "docs_received",
      owner: "client",
      dueOn: "2026-11-07",
    });
    expect(a.blockedOn).toMatch(/waiting for the client/i);
  });

  it("says when a step is overdue and by how many days, in India time", () => {
    const a = nextAction(month(), NOW); // 10 Nov, due 7 Nov
    expect(a).toMatchObject({ urgency: "overdue", daysLate: 3 });
    expect(nextAction(month(), new Date("2026-11-06T06:00:00Z")).urgency).toBe(
      "due_soon",
    );
    expect(nextAction(month(), new Date("2026-10-20T06:00:00Z")).urgency).toBe(
      "on_track",
    );
  });

  it("names an escalated chase as the blocker", () => {
    expect(
      nextAction(month({ chase: { open: 2, escalated: 1 } }), NOW).blockedOn,
    ).toMatch(/Escalated/);
  });

  it("hands a held statement to a manager, with the reason", () => {
    const a = nextAction(
      month({
        facts: facts({
          statements: {
            expected: 2,
            received: 2,
            verified: 1,
            held: 1,
            failed: 0,
            notAvailable: 0,
          },
        }),
      }),
      NOW,
    );
    expect(a).toMatchObject({
      stepKey: "statements_verified",
      owner: "manager",
    });
    expect(a.blockedOn).toMatch(/held statement/i);
  });

  it("lets the agent have reconciliation once the statements are in", () => {
    const a = nextAction(
      month({ facts: facts({ recon: { bank: 50, runDone: false } }) }),
      NOW,
    );
    expect(a).toMatchObject({
      stepKey: "recon_done",
      owner: "agent",
      blockedOn: null,
    });
  });

  it("gives the unconfirmed statutory steps to a manager and the sign-off to the partner", () => {
    expect(nextAction(month({ facts: facts() }), NOW)).toMatchObject({
      stepKey: "gst",
      owner: "manager",
    });
    const f = allDone();
    f.report.signedOff = false;
    expect(nextAction(month({ facts: f }), NOW)).toMatchObject({
      stepKey: "partner_signoff",
      owner: "partner",
    });
  });

  it("reports a closed month as done", () => {
    expect(nextAction(month({ facts: allDone() }), NOW)).toMatchObject({
      stepKey: null,
      urgency: "done",
      owner: "agent",
    });
  });

  it("ranks the portfolio most overdue first and closed last, and is stable", () => {
    const list = [
      nextAction(
        month({ clientId: "z", clientName: "Z Ltd", facts: allDone() }),
        NOW,
      ),
      nextAction(month({ clientId: "b", clientName: "B Ltd" }), NOW),
      nextAction(
        month({ clientId: "a", clientName: "A Ltd", period: "2026-09" }),
        NOW,
      ),
    ];
    const ranked = rankPortfolio(list).map((x) => x.clientId);
    expect(ranked).toEqual(["a", "b", "z"]); // A is a month later in overdue days
    expect(rankPortfolio(rankPortfolio(list)).map((x) => x.clientId)).toEqual(
      ranked,
    );
  });

  it("lists only what is a person's own, most urgent first", () => {
    const list = [
      nextAction(month({ clientId: "a", clientName: "A" }), NOW),
      nextAction(
        month({ clientId: "b", clientName: "B", facts: facts() }),
        NOW,
      ),
    ];
    expect(needsYou(list, "manager").map((x) => x.clientId)).toEqual(["b"]);
    expect(needsYou(list, "client").map((x) => x.clientId)).toEqual(["a"]);
    expect(needsYou(list, "partner")).toEqual([]);
  });

  it("handles a December period by rolling into January", () => {
    expect(nextAction(month({ period: "2026-12" }), NOW).dueOn).toBe(
      "2027-01-07",
    );
  });
});

/* ───────────── the GST month loop ───────────── */

const got = (keys: string[]): InputStates =>
  Object.fromEntries(keys.map((k) => [k, { status: "received" as const }]));
const ctx = {
  client: "Mehta Textiles",
  period: "October 2026",
  firm: "Shah & Co",
};

describe("the GST month loop", () => {
  it("waits for the return to be filed before asking for the portal files", () => {
    const p = gstMonthPlan(got([]), { ...ctx, returnsFiled: false });
    expect(p.state).toBe("waiting_for_filing");
    expect(p.missing.map((m) => m.key)).not.toContain("gstr2b");
    expect(p.missing.map((m) => m.key)).toEqual(
      expect.arrayContaining([
        "registers",
        "gst_ledgers",
        "credit_ledger",
        "cash_ledger",
        "challans",
      ]),
    );
  });

  it("asks for everything once filed, giving the portal downloads to the firm and the Tally files to the client", () => {
    const p = gstMonthPlan(got([]), {
      ...ctx,
      returnsFiled: true,
      tallyConnected: false,
    });
    expect(p.state).toBe("collecting");
    expect(p.missing).toHaveLength(GST_MONTHLY_KEYS.length);
    expect(p.firmTasks.map((m) => m.holder)).toEqual(
      expect.arrayContaining(["gst_portal"]),
    );
    expect(p.clientRequests.map((m) => m.key).sort()).toEqual([
      "gst_ledgers",
      "registers",
    ]);
    expect(p.clientMessage).toContain("Hello Mehta Textiles");
    expect(p.clientMessage).toContain("October 2026");
  });

  it("does not ask the client for Tally files when the connector is on", () => {
    const p = gstMonthPlan(got([]), {
      ...ctx,
      returnsFiled: true,
      tallyConnected: true,
    });
    expect(p.clientRequests).toEqual([]);
    expect(p.clientMessage).toBeNull();
  });

  it("is ready when everything has arrived, with its checks runnable and none waiting", () => {
    const p = gstMonthPlan(
      got([...GST_MONTHLY_KEYS, "day_book", "tb_opening"]),
      { ...ctx, returnsFiled: true },
    );
    expect(p).toMatchObject({
      state: "ready",
      missing: [],
      clientMessage: null,
    });
    expect(p.runnable.length).toBeGreaterThan(0);
    expect(p.waiting).toEqual([]);
  });

  it("lists which checks wait on which missing file", () => {
    const p = gstMonthPlan(
      got(GST_MONTHLY_KEYS.filter((k) => k !== "gstr2b")),
      { ...ctx, returnsFiled: true },
    );
    expect(
      p.waiting.some((w) => w.waitingFor.some((i) => i.key === "gstr2b")),
    ).toBe(true);
  });

  it("treats a file marked not applicable as present", () => {
    const inputs: InputStates = {
      ...got(GST_MONTHLY_KEYS.filter((k) => k !== "ims")),
      ims: { status: "not_applicable" },
    };
    expect(
      gstMonthPlan(inputs, { ...ctx, returnsFiled: true }).missing.map(
        (m) => m.key,
      ),
    ).not.toContain("ims");
  });
});

const inv = (no: string): GstInvoice => ({
  gstin: "37AAAAA0000A1Z5",
  party: "Kaveri Packers",
  no,
  date: "2026-10-20",
  pos: "37",
  taxable: 42000,
  igst: 0,
  cgst: 3780,
  sgst: 3780,
  cess: 0,
  total: 49560,
  rate: 18,
  hsn: "",
  irn: "",
  reverseCharge: false,
  itc: null,
  docType: "invoice",
  filedIn: null,
  row: 2,
  lines: 1,
});
const vendor = (party: string, itcAtRisk: number, n = 1): VendorFollowUp => ({
  gstin: "37AAAAA0000A1Z5",
  party,
  missing: Array.from({ length: n }, (_, i) => inv(`KP/${i + 1}`)),
  itcAtRisk,
  taxable: 42000 * n,
});

describe("supplier follow-ups", () => {
  it("drafts one per supplier with credit at risk, the largest first, each needing approval", () => {
    const d = supplierDrafts(
      [
        vendor("Small Co", 500),
        vendor("Kaveri Packers", 7560),
        vendor("Nothing Co", 0),
      ],
      "October 2026",
      "Shah & Co",
    );
    expect(d.map((x) => x.party)).toEqual(["Kaveri Packers", "Small Co"]);
    expect(
      d.every((x) => x.needsApproval && x.riskId === "gst_supplier_send"),
    ).toBe(true);
    expect(d[0]!.message).toContain("KP/1");
    expect(d[0]!.message).toContain("October 2026");
    expect(d[0]!.consentNote).toMatch(/third party/);
  });

  it("skips a supplier with no missing invoices, and honours a minimum", () => {
    expect(
      supplierDrafts([{ ...vendor("X", 900), missing: [] }], null, "F"),
    ).toEqual([]);
    expect(
      supplierDrafts([vendor("A", 500), vendor("B", 5000)], null, "F", {
        minItcAtRisk: 1000,
      }).map((d) => d.party),
    ).toEqual(["B"]);
    expect(supplierDrafts([], null, "F")).toEqual([]);
  });
});
