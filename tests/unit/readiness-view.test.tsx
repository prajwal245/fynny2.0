import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReadinessView from "@/v2/components/readiness/ReadinessView";
import RequestPanel from "@/v2/components/readiness/RequestPanel";
import { INPUTS, requestPlan, type InputStates } from "@/lib/practice/readiness/model";

const base = { client: "Acme", pack: "year_end" as const, onPack: () => {}, onMark: () => {}, onRequest: () => {}, clientCount: 2, teamCount: 3 };

describe("data needed screen", () => {
  it("shows a check as blocked, naming what it waits for, even when a passing result exists", () => {
    const inputs: InputStates = { tb_opening: { status: "received" }, day_book: { status: "received" } };
    const html = renderToStaticMarkup(<ReadinessView {...base} inputs={inputs} results={{ tds_26as: "passed" }} />);
    expect(html).toMatch(/TDS against Form 26AS/);
    expect(html).toMatch(/Waiting for Form 26AS/);
    expect(html).not.toMatch(/rd-pill passed/);
  });
  it("says everything is in, and offers no request, when nothing is missing", () => {
    const all: InputStates = Object.fromEntries(INPUTS.map((i) => [i.key, { status: "received" as const }]));
    const html = renderToStaticMarkup(<ReadinessView {...base} inputs={all} clientCount={0} teamCount={0} />);
    expect(html).toMatch(/Everything the reviews need is in/);
    expect(html).toMatch(/disabled/);
  });
  it("splits the request into the client's message and the team's downloads", () => {
    const plan = requestPlan(INPUTS.filter((i) => ["audited_statements", "gstr2b"].includes(i.key)), { firmHoldsGstLogin: true, firmHoldsItLogin: true, tallyConnected: true });
    const html = renderToStaticMarkup(<RequestPanel client="Acme" plan={plan} message="Hello" onMessage={() => {}} channel="email" onChannel={() => {}} onSend={() => {}} reachable="a@b.in" />);
    expect(html).toMatch(/For your team \(1\)/);
    expect(html).toMatch(/GSTR-2B/);
    expect(html).toMatch(/Send to client/);
  });
});
