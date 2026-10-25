// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript script
import { buildReport, detectColumns, parseCsv, rankChannels, splitLine } from "../../scripts/ga4-campaign-report.mjs";

// SYNTHETIC test data in GA4's Explore export layout. Not real campaign numbers.
const CSV = `# ----------------------------------------
# Free form
# Account: FynHelp
# ----------------------------------------

Session source,Session medium,Session campaign,Session manual ad content,Sessions,Key events
Total,,,,"1,000",50
linkedin,organic-social,launch-oct26,tarun,300,18
linkedin,organic-social,launch-oct26,nidhi,200,6
linkedin,organic-social,launch-oct26,prajwal,40,0
linkedin,organic-social,launch-oct26,samiksha,20,2
linkedin,organic-social,launch-oct26,company-page,100,3
meta,paid-social,launch-oct26,ad-1,250,5
meta,paid-social,launch-oct26,ad-2,60,1
whatsapp,group,launch-oct26,ca-group-1,30,15
(not set),(not set),launch-oct26,(not set),20,0
google,organic,other-campaign,x,500,99
`;

describe("GA4 campaign report", () => {
  it("reads GA4's export: comment lines, quoted numbers, the Total row", () => {
    const { headers, rows } = parseCsv(CSV);
    expect(headers[0]).toBe("Session source");
    expect(rows[0]["Sessions"]).toBe("1,000");
    expect(splitLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });
  it("finds the columns whatever GA4 called them, and says so when it cannot", () => {
    const c = detectColumns(parseCsv(CSV).headers);
    expect(c).toMatchObject({ source: "Session source", content: "Session manual ad content", sessions: "Sessions", signups: "Key events" });
    expect(() => detectColumns(["Session source", "Users"])).toThrow(/Could not find a column/);
  });
  it("adds up sessions, sign-ups and conversion for the chosen campaign only", () => {
    const r = buildReport(CSV, { campaign: "launch-oct26" });
    expect(r.totals).toEqual({ sessions: 1020, signups: 50 });
    const li = r.bySource.find((g: { key: string }) => g.key === "linkedin");
    expect(li).toMatchObject({ sessions: 660, signups: 29 });
    expect(li.rate).toBeCloseTo(29 / 660, 6);
    expect(r.text).toContain("1020 sessions, 50 sign-ups, 4.9% conversion");
  });
  it("splits people from ads and marks small samples", () => {
    const r = buildReport(CSV, { campaign: "launch-oct26", minSessions: 30 });
    const kinds = Object.fromEntries(r.contentRows.map((g: { key: string; kind: string }) => [g.key, g.kind]));
    expect(kinds).toMatchObject({ tarun: "team", "company-page": "team", "ad-1": "ad", "ca-group-1": "other" });
    expect(r.text).toMatch(/\| samiksha \| 20 \| 2 \| 10\.0% \| low sample \|/);
    expect(r.text).toMatch(/\| tarun \| 300 \| 18 \| 6\.0% \|  \|/);
  });
  it("never ranks a tiny sample as a winner, and flags traffic that does not convert", () => {
    const r = buildReport(CSV, { campaign: "launch-oct26", minSessions: 30 });
    // whatsapp / group: 30 sessions, 50% (kept: exactly at the minimum). samiksha-sized rows are excluded.
    expect(r.ranking.top[0].key).toBe("whatsapp / group");
    const leaks = r.ranking.leaks.map((g: { key: string }) => g.key);
    expect(leaks).toContain("meta / paid-social");
    const small = rankChannels([{ key: "x", sessions: 5, signups: 5, rate: 1 }], 30);
    expect(small.top).toEqual([]);
    expect(small.unjudged).toBe(1);
  });
  it("reports tags it could not attribute", () => {
    expect(buildReport(CSV, { campaign: "launch-oct26" }).text).toMatch(/20 sessions \(2\.0%\) have a missing source or content tag/);
  });
  it("refuses an empty campaign instead of printing zeros", () => {
    expect(() => buildReport(CSV, { campaign: "nope" })).toThrow(/No rows for campaign "nope"/);
  });
});
