import { describe, expect, it } from "vitest";
import { CHECKS, INPUTS, allChecks, checkState, composeRequest, inputFromKind, packProgress, reopened, requestPlan, whatItUnblocks, type InputStates } from "@/lib/practice/readiness/model";

const got = (...keys: string[]): InputStates => Object.fromEntries(keys.map((k) => [k, { status: "received" as const }]));
const def = (id: string) => CHECKS.find((c) => c.id === id)!;

describe("the registry", () => {
  it("every check names inputs that exist, and every input belongs to one of the three packs", () => {
    for (const c of CHECKS) for (const k of c.needs) expect(INPUTS.some((i) => i.key === k), `${c.id} needs ${k}`).toBe(true);
    expect(new Set(INPUTS.map((i) => i.pack))).toEqual(new Set(["onboarding", "monthly", "year_end"]));
    expect(new Set(INPUTS.map((i) => i.key)).size).toBe(INPUTS.length);
  });
});

describe("a check is never 'passed' on data it does not have", () => {
  it("is blocked, naming what it waits for, even when a result exists", () => {
    const s = checkState(def("tds_26as"), got("tb_opening", "day_book"), "passed");
    expect(s.status).toBe("blocked");
    expect(s.waitingFor.map((i) => i.key)).toEqual(["form_26as"]);
  });
  it("passes only with every input and a passing result; fails with a failing one; is ready with none yet", () => {
    const all = got("form_26as", "tb_opening", "day_book");
    expect(checkState(def("tds_26as"), all, "passed").status).toBe("passed");
    expect(checkState(def("tds_26as"), all, "failed").status).toBe("failed");
    expect(checkState(def("tds_26as"), all, null).status).toBe("ready");
  });
  it("treats an input marked not applicable as satisfied, and a check with nothing applicable as not applicable", () => {
    const na: InputStates = { ...got("tb_opening", "day_book"), form_26as: { status: "not_applicable" } };
    expect(checkState(def("tds_26as"), na, "passed").status).toBe("passed");
    expect(checkState(def("loans_year"), { interest_certificates: { status: "not_applicable" }, repayment_schedules: { status: "not_applicable" } }).status).toBe("not_applicable");
  });
});

describe("late data re-opens the checks it unblocks", () => {
  it("lists exactly the checks that moved from blocked", () => {
    const before = got("tb_opening", "ledger_masters", "day_book");
    const after = { ...before, ...got("form_26as") };
    expect(reopened(before, after).map((c) => c.def.id)).toEqual(["tds_26as"]);
    expect(reopened(after, after)).toEqual([]);
  });
  it("says which checks a missing input would unblock, counting only those whose other inputs are in", () => {
    const inputs = got("tb_opening", "day_book", "ledger_masters");
    expect(whatItUnblocks("form_26as", inputs).map((c) => c.id)).toEqual(["tds_26as"]);
    expect(whatItUnblocks("udyam_details", inputs).map((c) => c.id)).toEqual(["msme_43bh"]);
  });
});

describe("progress and who is asked", () => {
  it("counts per pack, leaving not-applicable items out of the percentage", () => {
    const p = packProgress({ ...got("bank_statements", "day_book"), loan_statements: { status: "not_applicable" } });
    const m = p.find((x) => x.pack === "monthly")!;
    expect(m).toMatchObject({ received: 2, notApplicable: 1 });
    expect(m.percent).toBe(Math.round((2 / (m.total - 1)) * 100));
  });
  it("asks the client only for what the client holds, and sends portal and Tally items to the firm when it holds the login or has the connector", () => {
    const missing = INPUTS.filter((i) => ["audited_statements", "gstr2b", "form_26as", "day_book", "balance_confirmations", "bank_statements"].includes(i.key));
    const a = requestPlan(missing, { firmHoldsGstLogin: true, firmHoldsItLogin: true, tallyConnected: true });
    expect(a.firmTasks.map((i) => i.key)).toEqual(["day_book", "gstr2b", "form_26as"]);
    expect(a.clientRequests.map((i) => i.key).sort()).toEqual(["audited_statements", "bank_statements"]);
    expect(a.partyRequests.map((i) => i.key)).toEqual(["balance_confirmations"]);
    const b = requestPlan(missing, { firmHoldsGstLogin: false, firmHoldsItLogin: false, tallyConnected: false });
    expect(b.firmTasks).toEqual([]);
    expect(b.clientRequests).toHaveLength(5);
  });
  it("writes one plain message with the upload link and no stray blank lines", () => {
    const m = composeRequest("Satkaarika", INPUTS.filter((i) => ["audited_statements", "asset_register"].includes(i.key)), { period: "FY 2025-26", uploadUrl: "https://fynhelp.com/u/abc", firm: "Acme & Co", dueOn: "25 Nov" });
    expect(m).toMatch(/^Hello Satkaarika,/);
    expect(m).toMatch(/2 items/);
    expect(m).toMatch(/1\. Last year's signed audited statements/);
    expect(m).toMatch(/https:\/\/fynhelp.com\/u\/abc/);
    expect(m).not.toMatch(/\n\n\n/);
  });
  it("maps the readers' kinds to inputs, so an upload ticks the right item", () => {
    expect(inputFromKind("trial_balance")).toBe("tb_opening");
    expect(inputFromKind("gstr2b_report")).toBe("gstr2b");
    expect(inputFromKind("something_else")).toBeNull();
  });
  it("covers every check with a status for the whole registry", () => {
    expect(allChecks({}).every((c) => c.status === "blocked")).toBe(true);
  });
});
