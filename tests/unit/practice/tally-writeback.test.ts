// @vitest-environment node
/** The connector is the last line of defence on the Tally PC: it must refuse an unsound write and prove a sound one was kept. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importVoucherXml, type ApprovedLine } from "@/lib/practice/tallyVoucher";
// @ts-expect-error plain JavaScript module shipped to customers
import * as connector from "../../../public/downloads/fynhelp-tally-connector.mjs";

const dayBook = readFileSync("tests/fixtures/tally/day-book-november-2026.xml", "utf8");
const importFile = readFileSync("tests/fixtures/tally/vouchers-import-october-2026.xml", "utf8");
const blocks = (x: string) => x.match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/g) ?? [];

const line: ApprovedLine = { id: "ln_8c2f", company: "Narmada Textile Mills LLP", date: "2026-11-06", direction: "in", amount: 455369.54, bankLedger: "ICICI Bank CA 6205", partyLedger: "Ludhiana Knitwear Pvt Ltd", narration: "Received from Ludhiana Knitwear", partyLedgerIsParty: true };
const linked = ["Narmada Textile Mills LLP"];

describe("the connector refuses an unsound write", () => {
  it("accepts what FynHelp writes, in the new shape and the older one", () => {
    expect(connector.refuseImport(importVoucherXml(line), line.company, linked)).toBeNull();
    expect(connector.refuseImport(importVoucherXml(line, "legacy"), line.company, linked)).toBeNull();
  });
  it("refuses an unbalanced voucher, a wrong sign, a missing id, a bad date and a three decimal amount", () => {
    const x = importVoucherXml(line);
    expect(connector.refuseImport(x.replace("<AMOUNT>455369.54", "<AMOUNT>455369.55"), line.company, linked)).toMatch(/not sound.*differ by/);
    expect(connector.refuseImport(x.replace("<ISDEEMEDPOSITIVE>Yes", "<ISDEEMEDPOSITIVE>No"), line.company, linked)).toMatch(/not sound/);
    expect(connector.refuseImport(x.replace(/ REMOTEID="[^"]*"/, ""), line.company, linked)).toMatch(/no id/);
    expect(connector.refuseImport(x.replace("<DATE>20261106", "<DATE>20261306"), line.company, linked)).toMatch(/not sound.*date/);
    expect(connector.refuseImport(x.replace("-455369.54", "-455369.545"), line.company, linked)).toMatch(/not sound/);
  });
  it("its soundness rule agrees with every real voucher in Tally's own files", () => {
    for (const b of [...blocks(dayBook), ...blocks(importFile)]) expect(connector.voucherProblems(b)).toEqual([]);
  });
});

describe("the connector reads the entry back and proves it", () => {
  const sent = importVoucherXml(line);
  const exp = connector.expectedVoucher(sent);
  const reply = (...vs: string[]) => `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${vs.join("")}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const ours = blocks(sent)[0]!;

  it("knows what it wrote: id, type, date and the signed money per ledger", () => {
    expect(exp).toMatchObject({ remoteId: "ln_8c2f", type: "Receipt", date: "20261106" });
    expect(exp.ledgers.get("icici bank ca 6205")).toBe(-45_536_954);
    expect(exp.ledgers.get("ludhiana knitwear pvt ltd")).toBe(45_536_954);
  });
  it("verifies the voucher when Tally returns it with the same money on the same ledgers", () => {
    const r = connector.findWritten(reply(ours), exp);
    expect(r.verified).toBe(true);
    expect(r.note).toMatch(/by its id/);
  });
  it("verifies by type, date and money when Tally does not export the id", () => {
    const r = connector.findWritten(reply(ours.replace(/ REMOTEID="[^"]*"/, "")), exp);
    expect(r).toMatchObject({ verified: true });
    expect(r.note).toMatch(/did not export the id/);
  });
  it("does not verify a voucher Tally kept with different money, a different date, or a different type", () => {
    expect(connector.findWritten(reply(ours.replace("-455369.54", "-455369.45").replace(">455369.54", ">455369.45")), exp).note).toMatch(/different money/);
    expect(connector.findWritten(reply(ours.replace("<DATE>20261106", "<DATE>20261107")), exp).note).toMatch(/dated 20261107/);
    expect(connector.findWritten(reply(ours.replace("<VOUCHERTYPENAME>Receipt", "<VOUCHERTYPENAME>Payment")), exp).verified).toBe(false);
  });
  it("does not verify when the voucher is missing, and flags a possible duplicate", () => {
    expect(connector.findWritten(reply(blocks(dayBook)[0]!), exp)).toMatchObject({ verified: false });
    expect(connector.findWritten(reply(ours, ours), exp).note).toMatch(/duplicate/);
    const noId = ours.replace(/ REMOTEID="[^"]*"/, "");
    expect(connector.findWritten(reply(noId, noId), exp).note).toMatch(/identical entries/);
  });
  it("tells two real Tally vouchers with the same id apart (Receipt 15 and Purchase 15 on 6 Nov)", () => {
    const real = blocks(dayBook).filter((b) => /REMOTEID="15-20261106"/.test(b));
    expect(real).toHaveLength(2);
    const receipt = real.find((b) => /VCHTYPE="Receipt"/.test(b))!;
    const asWritten = connector.expectedVoucher(importVoucherXml({ ...line, id: "15-20261106", bankLedger: "ICICI Bank CA 6205", partyLedger: "Ludhiana Knitwear Pvt Ltd", amount: 455369.54 }));
    expect(connector.findWritten(reply(...real), asWritten)).toMatchObject({ verified: true });
    expect(receipt).toContain("455369.54");
  });
  it("reads back through the real way of asking Tally, and reports an answer it cannot read as not verified", async () => {
    const asked: string[] = [];
    const ok = await connector.verifyWritten(async (b: string) => (asked.push(b), reply(ours)), line.company, sent);
    expect(ok.verified).toBe(true);
    expect(asked[0]).toContain("<SVFROMDATE TYPE=\"Date\">06-Nov-2026</SVFROMDATE>".replace("06-Nov-2026", asked[0]!.match(/<SVFROMDATE[^>]*>([^<]*)</)![1]!));
    const empty = await connector.verifyWritten(async () => reply(), line.company, sent);
    expect(empty.verified).toBe(false);
    const down = await connector.verifyWritten(async () => { throw new Error("connection refused"); }, line.company, sent);
    expect(down).toMatchObject({ verified: false });
    expect(down.note).toMatch(/connection refused/);
    const refused = await connector.verifyWritten(async () => "<RESPONSE>Unknown Request, cannot be processed</RESPONSE>", line.company, sent);
    expect(refused.verified).toBe(false);
  });
});

import { isPartyGroup, versionAtLeast } from "@/lib/practice/tallyConnector";

describe("which connectors get which shape, and which ledgers are parties", () => {
  it("compares connector versions", () => {
    expect(versionAtLeast("1.4.0", "1.4.0")).toBe(true);
    expect(versionAtLeast("1.10.2", "1.4.0")).toBe(true);
    expect(versionAtLeast("1.3.9", "1.4.0")).toBe(false);
    expect(versionAtLeast("2.0.0", "1.4.0")).toBe(true);
    expect(versionAtLeast(null, "1.4.0")).toBe(false);
    expect(versionAtLeast("v1.4", "1.4.0")).toBe(false);
  });
  it("flags only Sundry Debtors and Sundry Creditors as parties", () => {
    expect(isPartyGroup("Sundry Debtors")).toBe(true);
    expect(isPartyGroup(" sundry creditors ")).toBe(true);
    expect(isPartyGroup("Indirect Expenses")).toBe(false);
    expect(isPartyGroup("Bank Accounts")).toBe(false);
    expect(isPartyGroup(null)).toBe(false);
  });
});

import { reportResult } from "@/lib/practice/tallyPosting.server";

/** A tiny stand-in for the database: it answers the lookups reportResult makes and records every update. */
function fakeDb(posting: Record<string, unknown>) {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const proxyRef: { p: unknown } = { p: null };
  const query = (table: string): unknown => {
    const q: Record<string, unknown> = {
      maybeSingle: () => Promise.resolve({ data: table === "ca_tally_postings" ? posting : table === "ca_tally_companies" ? { connector_id: "conn1" } : null }),
      update: (values: Record<string, unknown>) => (updates.push({ table, values }), proxyRef.p),
      then: (res: (v: unknown) => unknown) => res({ data: null, error: null }),
    };
    const proxy: unknown = new Proxy(q, { get: (t, k) => (k in t ? t[k as string] : () => proxy) });
    proxyRef.p = proxy;
    return proxy;
  };
  return { db: { from: (t: string) => query(t) } as never, updates };
}
const posting = { id: "p1", ca_firm_id: "firm1", company_id: "co1", status: "sent", business_id: "b1" };
const conn = { id: "conn1", ca_firm_id: "firm1", name: "Office PC", sync_requested_at: null };
const created = "<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS></RESPONSE>";

describe("what happens to a write once the connector reports back", () => {
  it("a read-back that matches makes it posted, and keeps the proof", async () => {
    const { db, updates } = fakeDb(posting);
    expect(await reportResult(db, conn as never, "p1", { reply: created, verified: true, verifyNote: "Read back from Tally by its id." })).toEqual({ status: "posted" });
    const u = updates.find((x) => x.table === "ca_tally_postings")!.values;
    expect(u.status).toBe("posted");
    expect(String(u.tally_reply)).toContain("[verified] Read back from Tally by its id.");
  });
  it("a read-back that does not match holds it for a person, even though Tally said created", async () => {
    const { db, updates } = fakeDb(posting);
    expect(await reportResult(db, conn as never, "p1", { reply: created, verified: false, verifyNote: "Tally kept different money." })).toEqual({ status: "failed" });
    const u = updates.find((x) => x.table === "ca_tally_postings")!.values;
    expect(u.status).toBe("failed");
    expect(String(u.last_error)).toMatch(/reading it back did not confirm it: Tally kept different money\. Check Tally before approving it again/);
  });
  it("an older connector that does not read back still works as before", async () => {
    const { db, updates } = fakeDb(posting);
    expect(await reportResult(db, conn as never, "p1", { reply: created })).toEqual({ status: "posted" });
    expect(updates.find((x) => x.table === "ca_tally_postings")!.values.status).toBe("posted");
  });
  it("a reply that is not a clear single creation is never posted, verified or not", async () => {
    const { db } = fakeDb(posting);
    expect(await reportResult(db, conn as never, "p1", { reply: "<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS></RESPONSE>", verified: true })).toEqual({ status: "failed" });
  });
});
