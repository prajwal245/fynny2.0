// @vitest-environment node
/** The bugs of the 12 Nov Tally bug list that are fixed in code, each with the evidence that it stays fixed. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Db, FirmContext } from "@/lib/practice/db.server";
import { compareOwner, compareWithBankLedgers, holderName } from "@/lib/practice/extract/statementOwner";
import { statementAccount } from "@/lib/practice/tallyReconView";
import { buildTallyExport, type ExportException } from "@/lib/practice/zohoExport";
import { dropSyncedBooks } from "@/lib/practice/documents.server";
import { requestSync } from "@/lib/practice/tallyConnector.server";

describe("bug 4: the import file names the company", () => {
  const list: ExportException[] = [{ id: "e1", clientId: "c1", date: "2026-11-09", amount: -590, narration: "BANK CHARGES NOV INCL GST", side: "bank", status: "open" }];
  const opts = { clientId: "c1", clientName: "Konkan Test Foods", period: null, bankLedger: "HDFC Bank A/c 4417" };
  it("writes the Tally company into the file, so Tally cannot import into another client's company", () => {
    const x = buildTallyExport(list, { ...opts, company: "Konkan Test Foods Pvt Ltd" }).xml;
    expect(x).toContain("<SVCURRENTCOMPANY>Konkan Test Foods Pvt Ltd</SVCURRENTCOMPANY>");
  });
  it("without a linked company it still builds, and says nothing it does not know", () => {
    expect(buildTallyExport(list, opts).xml).not.toContain("SVCURRENTCOMPANY");
  });
});

describe("bug 1: the amount and side come from the bank ledger, whichever ledger is listed first", () => {
  it("a payment lists the bank first, credited (positive); a receipt lists the bank first, debited (negative)", () => {
    const pay = buildTallyExport([{ id: "p", clientId: "c1", date: "2026-11-09", amount: -590, narration: "BANK CHARGES", side: "bank", status: "open" }], { clientId: "c1", clientName: "K", period: null, bankLedger: "HDFC Bank" }).xml;
    const v = /<VOUCHER[\s\S]*?<\/VOUCHER>/.exec(pay)![0];
    const entries = [...v.matchAll(/<LEDGERNAME>([^<]*)<\/LEDGERNAME><ISDEEMEDPOSITIVE>(Yes|No)<\/ISDEEMEDPOSITIVE><AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => [m[1], m[2], m[3]]);
    expect(entries[0]).toEqual(["HDFC Bank", "No", "590.00"]);
    expect(entries[1]![1]).toBe("Yes");
    expect(entries[1]![2]).toBe("-590.00");
    const rec = buildTallyExport([{ id: "r", clientId: "c1", date: "2026-11-08", amount: 31200, narration: "Seabreeze Traders receipt", side: "bank", status: "open" }], { clientId: "c1", clientName: "K", period: null, bankLedger: "HDFC Bank" }).xml;
    const rv = /<VOUCHER[\s\S]*?<\/VOUCHER>/.exec(rec)![0];
    expect(/<LEDGERNAME>([^<]*)<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-31200\.00/.test(rv)).toBe(true);
    expect([...rv.matchAll(/<LEDGERNAME>([^<]*)<\/LEDGERNAME>/g)][0]![1]).toBe("HDFC Bank");
  });
});

describe("bug 8 and bug 3: the connector writes its own UTF-8 log and the task never stays stopped", () => {
  const ps1 = readFileSync("public/downloads/fynhelp-connector-setup.ps1", "utf8");
  const mjs = readFileSync("public/downloads/fynhelp-tally-connector.mjs", "utf8");
  it("the log is written by the connector as UTF-8, not redirected from PowerShell (which writes UTF-16)", () => {
    expect(ps1).toContain("--log");
    expect(ps1).not.toMatch(/\*>>/);
    expect(mjs).toMatch(/appendFileSync\(logFile, line \+ "\\n", "utf8"\)/);
  });
  it("the task restarts the connector whenever it exits and starts again every 10 minutes if the process is gone", () => {
    expect(ps1).toMatch(/while \(`\$true\)/);
    expect(ps1).toMatch(/-RepetitionInterval \(New-TimeSpan -Minutes 10\)/);
    expect(ps1).toMatch(/-MultipleInstances IgnoreNew/);
    expect(ps1).toMatch(/-Trigger @\(\$atLogon, \$repeat\)/);
  });
});

describe("bug 9: a file's password is not a login", () => {
  it("the field tells the browser it is a new password, never a saved login", () => {
    const src = readFileSync("src/v2/components/UnlockFile.tsx", "utf8");
    expect(src).toContain('autoComplete="new-password"');
    expect(src).toContain('data-1p-ignore="true"');
  });
});

describe("bug 13: a statement for another company or account is not accepted silently", () => {
  const konkan = "HDFC BANK LTD\nAccount Name : MEHTA TRADING CO\nAccount No : 50200071184402\nStatement of account";
  it("reads the account holder from the statement header", () => {
    expect(holderName(konkan)).toBe("MEHTA TRADING CO");
    expect(holderName("M/S JOY GURU RUBBER NIL MANUBAZAR ROAD\nAcct")).toBe("M/S JOY GURU RUBBER NIL MANUBAZAR ROAD");
    expect(holderName("nothing useful")).toBeNull();
  });
  it("matches the same business under a different style of name, and flags a different one", () => {
    expect(compareOwner("M/S JOY GURU RUBBER", "Joy Guru Rubber").state).toBe("match");
    expect(compareOwner("KONKAN TEST FOODS PVT LTD", "Konkan Test Foods").state).toBe("match");
    const wrong = compareOwner("MEHTA TRADING CO", "Konkan Test Foods Pvt Ltd");
    expect(wrong.state).toBe("mismatch");
    expect(wrong.message).toMatch(/may belong to another client/);
    expect(compareOwner(null, "Konkan Test Foods").state).toBe("unknown");
  });
  it("compares the account with the client's Tally bank ledgers, and says when it cannot", () => {
    const stmt = statementAccount(konkan, "Axis Sep.pdf");
    expect(compareWithBankLedgers(stmt, ["HDFC Bank A/c 50200071"]).state).toBe("match");
    expect(compareWithBankLedgers(stmt, ["ICICI Bank CA 6205"]).state).toBe("mismatch");
    expect(compareWithBankLedgers(stmt, []).state).toBe("unknown");
  });
});

/* ── bug 2 and bug 11 on an in-memory database ─────────────── */

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const builder = (name: string) => {
    const t = (tables[name] ??= []);
    let rows = t;
    let op: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    const q: Record<string, unknown> = {};
    const run = () => {
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      if (op === "delete") for (const r of rows) t.splice(t.indexOf(r), 1);
      return rows;
    };
    q["select"] = () => q;
    q["eq"] = (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q);
    q["in"] = (k: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[k]))), q);
    q["overlaps"] = (k: string, vs: string[]) => ((rows = rows.filter((r) => (r[k] as string[]).some((x) => vs.includes(x)))), q);
    q["limit"] = () => q;
    q["update"] = (p: Row) => ((op = "update"), (patch = p), q);
    q["delete"] = () => ((op = "delete"), q);
    q["maybeSingle"] = async () => ({ data: run()[0] ?? null, error: null });
    q["then"] = (res: (v: unknown) => unknown) => res({ data: run(), error: null });
    return q;
  };
  return { from: builder } as unknown as Db;
}

describe("bug 2: an entry deleted in Tally leaves no stale line and no false exception", () => {
  it("removes every line of the document, matched or not, and reopens the bank line that was matched to one", async () => {
    const tables = {
      ca_txns: [
        { id: "k1", extraction_id: "d1", side: "books", match_status: "matched" },
        { id: "k2", extraction_id: "d1", side: "books", match_status: "unmatched" },
        { id: "k3", extraction_id: "d2", side: "books", match_status: "matched" },
        { id: "b1", extraction_id: "s1", side: "bank", match_status: "matched" },
        { id: "b2", extraction_id: "s1", side: "bank", match_status: "matched" },
      ],
      ca_recon_matches: [
        { id: "m1", bank_txn_id: "b1", book_txn_ids: ["k1"], status: "active" },
        { id: "m2", bank_txn_id: "b2", book_txn_ids: ["k3"], status: "active" },
      ],
    };
    const db = fakeDb(tables);
    const r = await dropSyncedBooks(db, "d1");
    expect(r).toEqual({ removed: 2, reopened: 1 });
    expect(tables.ca_txns.map((t) => t.id).sort()).toEqual(["b1", "b2", "k3"]);
    expect(tables.ca_txns.find((t) => t.id === "b1")!.match_status).toBe("unmatched");
    expect(tables.ca_txns.find((t) => t.id === "b2")!.match_status).toBe("matched");
    expect(tables.ca_recon_matches.find((m) => m.id === "m1")).toMatchObject({ status: "reversed" });
    expect(tables.ca_recon_matches.find((m) => m.id === "m2")).toMatchObject({ status: "active" });
  });
  it("does nothing for a document with no book lines", async () => {
    expect(await dropSyncedBooks(fakeDb({ ca_txns: [] }), "d9")).toEqual({ removed: 0, reopened: 0 });
  });
});

describe("bug 11: any older month can be fetched again", () => {
  const ctx: FirmContext = { firmId: "f1", firmName: "R", firmEmail: null, userId: "u1", role: "partner" };
  it("stores the months asked for with the request, and refuses a bad or future month", async () => {
    const tables = { ca_tally_connectors: [{ id: "c1", ca_firm_id: "f1", sync_requested_at: null, sync_months: null }] };
    const db = fakeDb(tables);
    await requestSync(db, ctx, "c1", ["2026-09", "2026-09", "2026-08"]);
    expect(tables.ca_tally_connectors[0]).toMatchObject({ sync_months: ["2026-09", "2026-08"] });
    expect(tables.ca_tally_connectors[0]!.sync_requested_at).toBeTruthy();
    await expect(requestSync(db, ctx, "c1", ["Sept"])).rejects.toThrow(/like 2026-09/);
    await expect(requestSync(db, ctx, "c1", ["2999-01"])).rejects.toThrow(/not started/);
    tables.ca_tally_connectors[0]!.sync_months = null;
    await requestSync(db, ctx, "c1");
    expect(tables.ca_tally_connectors[0]!.sync_months).toBeNull();
  });
  it("the migration adds the column", () => {
    expect(readFileSync("supabase/migrations/20261112160000_tally_sync_months.sql", "utf8")).toMatch(/sync_months text\[\]/);
  });
});

describe("bug 7: a book line names the party, not the bank", () => {
  it("when a voucher's party ledger is the bank, the counterparty is the other ledger", async () => {
    const { readTally } = await import("@/lib/practice/extract/tally");
    const xml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA><TALLYMESSAGE><VOUCHER VCHTYPE="Receipt" ACTION="Create"><DATE>20261108</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>7</VOUCHERNUMBER><PARTYLEDGERNAME>HDFC Bank A/c 4417</PARTYLEDGERNAME><NARRATION>Seabreeze Traders</NARRATION>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c 4417</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-31200.00</AMOUNT><BANKALLOCATIONS.LIST><INSTRUMENTNUMBER>UTR1</INSTRUMENTNUMBER></BANKALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>Anand Retail</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>31200.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const r = readTally(xml);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ counterparty: "Anand Retail", direction: "in", amount: 31200 });
  });
});

describe("13 Nov bug 2 and bug 11: TallyPrime writes empty bank allocation lists on every leg", () => {
  // The shape TallyPrime really exports: an empty <BANKALLOCATIONS.LIST> on legs that have no bank detail.
  const blank = "<BANKALLOCATIONS.LIST> </BANKALLOCATIONS.LIST>";
  const wrap = (v: string) => `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA><TALLYMESSAGE>${v}</TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  const leg = (name: string, deemed: "Yes" | "No", amount: string, extra = blank) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${name}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemed}</ISDEEMEDPOSITIVE><AMOUNT>${amount}</AMOUNT>${extra}</ALLLEDGERENTRIES.LIST>`;

  it("a payment written by FynHelp reads back as money out, not in", async () => {
    const { readTally } = await import("@/lib/practice/extract/tally");
    // The expense leg is listed first and every leg carries an empty allocation list: the old reader took the first leg as the bank.
    const x = wrap(`<VOUCHER VCHTYPE="Payment" ACTION="Create"><DATE>20261105</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>31</VOUCHERNUMBER><NARRATION>GST payment</NARRATION>${leg("GST Payable", "Yes", "-6320.00")}${leg("Axis Bank A/c 5426", "No", "6320.00")}</VOUCHER>`);
    const r = readTally(x);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ amount: 6320, direction: "out", counterparty: "GST Payable" });
    expect(r.rows[0]!.parse_issues).toEqual([]);
  });

  it("a receipt keeps its party, and a bank leg with a real allocation is still the bank", async () => {
    const { readTally } = await import("@/lib/practice/extract/tally");
    const real = "<BANKALLOCATIONS.LIST><TRANSACTIONTYPE>e-Fund Transfer</TRANSACTIONTYPE><INSTRUMENTNUMBER>UTR123</INSTRUMENTNUMBER><AMOUNT>-31200.00</AMOUNT></BANKALLOCATIONS.LIST>";
    const x = wrap(`<VOUCHER VCHTYPE="Receipt" ACTION="Create"><DATE>20261108</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>7</VOUCHERNUMBER><PARTYLEDGERNAME>Anand Retail</PARTYLEDGERNAME>${leg("Anand Retail", "No", "31200.00")}${leg("ICICI Bank CA 7731", "Yes", "-31200.00", real)}</VOUCHER>`);
    const r = readTally(x);
    expect(r.rows[0]).toMatchObject({ amount: 31200, direction: "in", counterparty: "Anand Retail", reference: "UTR123" });
  });

  it("a sales voucher with blank allocations is left out of bank reconciliation, and a payment by voucher type wins over a misread leg", async () => {
    const { readTally } = await import("@/lib/practice/extract/tally");
    const sale = wrap(`<VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>20261108</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>INV 1182</VOUCHERNUMBER><PARTYLEDGERNAME>Anand Retail</PARTYLEDGERNAME>${leg("Anand Retail", "Yes", "-18400.00")}${leg("Sales", "No", "18400.00")}</VOUCHER>`);
    const r = readTally(sale);
    expect(r.rows).toHaveLength(0);
    expect(r.skippedNonBank).toBe(1);
    // A Payment whose only bank-looking leg says money in is read as a payment, with a note.
    const odd = wrap(`<VOUCHER VCHTYPE="Payment" ACTION="Create"><DATE>20261105</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>32</VOUCHERNUMBER>${leg("Office Rent", "No", "5000.00")}${leg("HDFC Bank A/c 4417", "Yes", "-5000.00")}</VOUCHER>`);
    const o = readTally(odd).rows[0]!;
    expect(o.direction).toBe("out");
    expect(o.parse_issues[0]).toMatch(/disagrees with the voucher type/);
  });
});

describe("13 Nov bug 3: another client's statement is held, and its owner is found", () => {
  const clients = [
    { id: "c-konkan", name: "Konkan Test Foods Pvt Ltd" },
    { id: "c-sahyadri", name: "Sahyadri Test Traders Pvt Ltd" },
    { id: "c-godavari", name: "Godavari Spices & Foods Pvt Ltd" },
  ];
  it("finds the client whose name is on the statement, however the header is laid out", async () => {
    const { clientFromHeader } = await import("@/lib/practice/extract/statementOwner");
    expect(clientFromHeader("HDFC BANK LTD\nGODAVARI SPICES AND FOODS PVT LTD\nPlot 4, Vizag\nAccount No 50200071009921", clients)?.id).toBe("c-godavari");
    expect(clientFromHeader("Statement of account\nM/S SAHYADRI TEST TRADERS\nBranch Pune", clients)?.id).toBe("c-sahyadri");
    // A single shared word is not enough.
    expect(clientFromHeader("Konkan Railway Corporation", clients)).toBeNull();
    expect(clientFromHeader("no names here", clients)).toBeNull();
  });
  it("holds a statement printed for another client and offers the right one", async () => {
    const { judgeOwnership } = await import("@/lib/practice/extract/statementOwner");
    const text = "HDFC BANK LTD\nGODAVARI SPICES AND FOODS PVT LTD\nAccount No : 50200099009921";
    const j = judgeOwnership({ text, filename: "Acct.pdf", clientId: "c-sahyadri", clientName: "Sahyadri Test Traders Pvt Ltd", clients, bankLedgers: ["HDFC Bank A/c 4417"] });
    expect(j.hold).toBe(true);
    expect(j.suggested).toEqual({ id: "c-godavari", name: "Godavari Spices & Foods Pvt Ltd" });
    expect(j.owner.state).toBe("mismatch");
    expect(j.owner.message).toMatch(/for Godavari Spices & Foods Pvt Ltd, not Sahyadri/);
  });
  it("does not hold the client's own statement, even when the account cannot be compared", async () => {
    const { judgeOwnership } = await import("@/lib/practice/extract/statementOwner");
    const text = "ICICI BANK\nSahyadri Test Traders Pvt Ltd\nAccount No 000405017731";
    const j = judgeOwnership({ text, filename: "icici.csv", clientId: "c-sahyadri", clientName: "Sahyadri Test Traders Pvt Ltd", clients, bankLedgers: [] });
    expect(j.hold).toBe(false);
    expect(j.owner.state).toBe("match");
  });
  it("holds when the holder and the account both disagree, though the holder is nobody the firm knows", async () => {
    const { judgeOwnership } = await import("@/lib/practice/extract/statementOwner");
    const text = "Account Name : MEHTA TRADING CO\nAccount No : 50200071184402\nHDFC BANK";
    const j = judgeOwnership({ text, filename: "x.pdf", clientId: "c-konkan", clientName: "Konkan Test Foods Pvt Ltd", clients, bankLedgers: ["ICICI Bank CA 7731"] });
    expect(j.hold).toBe(true);
    expect(j.suggested).toBeNull();
  });
  it("never holds on an unreadable header: it says it could not compare", async () => {
    const { judgeOwnership } = await import("@/lib/practice/extract/statementOwner");
    const j = judgeOwnership({ text: "01/04/26 UPI 500 ...", filename: "s.csv", clientId: "c-konkan", clientName: "Konkan Test Foods Pvt Ltd", clients, bankLedgers: ["HDFC Bank A/c 4417"] });
    expect(j.hold).toBe(false);
    expect(j.owner.state).toBe("unknown");
  });
});

describe("13 Nov bug 5 and 9: the manual Tally file does not repeat, mislabel or invent", () => {
  const line = (id: string, amount: number, narration: string, sent = false): ExportException => ({ id, clientId: "c1", date: "2026-10-03", amount, narration, side: "bank", status: "open", sentToTally: sent });
  const opts = { clientId: "c1", clientName: "Konkan Test Foods", period: null, bankLedger: "ICICI Bank CA 7731", company: "Konkan Test Foods Pvt Ltd" };
  it("leaves out lines the connector already wrote", () => {
    const x = buildTallyExport([line("a", -590, "SMS ALERT CHARGES", true), line("b", -4000, "ATM WDL SELF", true), line("c", 19090, "NEFT RAJ TRADERS")], opts);
    expect(x.count).toBe(1);
    expect(x.xml).not.toContain("fh-a");
    expect(x.xml).toContain("fh-c");
  });
  it("a cash withdrawal is a Contra with Cash, not a payment to Miscellaneous Expenses, and creates no ledger", () => {
    const x = buildTallyExport([line("w", -20000, "ATM WDL SELF 00231")], opts).xml;
    expect(x).toContain('VCHTYPE="Contra"');
    expect(x).toMatch(/<LEDGERNAME>Cash<\/LEDGERNAME>/);
    expect(x).not.toContain("Miscellaneous Expenses");
    expect(x).not.toContain('<LEDGER NAME="Cash"');
  });
  it("every voucher has an id of its own, so importing the file twice cannot double the entries", () => {
    const x = buildTallyExport([line("p1", -590, "SMS CHGS"), line("p2", 1000, "NEFT RAJ")], opts).xml;
    expect(x).toMatch(/<VOUCHER REMOTEID="fh-p1" VCHTYPE="Payment"/);
    expect(x).toMatch(/<VOUCHER REMOTEID="fh-p2" VCHTYPE="Receipt"/);
  });
  it("a payee printed in capitals becomes a name a person would write, and the file name carries the company", () => {
    const r = buildTallyExport([line("r", 19090, "NEFT-RAJ TRADERS-INV 12")], opts);
    expect(r.xml).toMatch(/LEDGERNAME>Raj Traders</);
    expect(r.filename).toContain("for-konkan-test-foods-pvt-ltd");
  });
});

describe("13 Nov bug 4: the bank ledger follows the statement", () => {
  it("picks the ledger carrying the account digits, else the only ledger of that bank, else nothing", async () => {
    const { pickBankLedger } = await import("@/lib/practice/tallyReconView");
    const ledgers = ["Axis Bank A/c 5426", "ICICI Bank CA 7731"];
    expect(pickBankLedger({ accountNo: "000405017731", bank: "ICICI" }, ledgers)).toBe("ICICI Bank CA 7731");
    expect(pickBankLedger({ accountNo: null, bank: "Axis" }, ledgers)).toBe("Axis Bank A/c 5426");
    expect(pickBankLedger({ accountNo: null, bank: "HDFC" }, ledgers)).toBeNull();
    expect(pickBankLedger({ accountNo: "9999", bank: null }, ledgers)).toBeNull();
    expect(pickBankLedger(null, ledgers)).toBeNull();
    // Two ICICI ledgers: the digits decide.
    expect(pickBankLedger({ accountNo: "5426", bank: "ICICI" }, ["ICICI Bank CA 5426", "ICICI Bank CA 7731"])).toBe("ICICI Bank CA 5426");
    expect(pickBankLedger({ accountNo: null, bank: "ICICI" }, ["ICICI Bank CA 5426", "ICICI Bank CA 7731"])).toBeNull();
  });
});

describe("13 Nov bug 8: the connector looks in Tally before it writes", () => {
  // @ts-expect-error plain JavaScript module shipped to customers
  const load = () => import("../../../public/downloads/fynhelp-tally-connector.mjs");
  const mine = importVoucherXmlFor();
  function importVoucherXmlFor() {
    return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>Konkan Test Foods Pvt Ltd</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="fh-abc" VCHTYPE="Payment" ACTION="Create"><DATE>20261003</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><NARRATION>SMS ALERT CHARGES</NARRATION><ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Bank CA 7731</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>590.00</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Charges</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-590.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  }
  const typed = (date: string, amount: string, rid = "") => `<ENVELOPE><BODY><DATA><TALLYMESSAGE><VOUCHER ${rid ? `REMOTEID="${rid}" ` : ""}VCHTYPE="Payment"><DATE>${date}</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>12</VOUCHERNUMBER><NARRATION>typed by hand</NARRATION><ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Charges</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${amount}</AMOUNT><BANKALLOCATIONS.LIST> </BANKALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Bank CA 7731</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${amount}</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;

  it("finds an entry typed in Tally with the same amount on the same bank within three days", async () => {
    const c = await load();
    const exp = c.expectedVoucher(mine);
    const hit = c.findExistingEntry(typed("20261002", "590.00"), exp, "ICICI Bank CA 7731");
    expect(hit).toMatchObject({ amount: 590, number: "12", date: "20261002" });
  });
  it("does not mistake another amount, a date too far away, the same entry it wrote, or another bank", async () => {
    const c = await load();
    const exp = c.expectedVoucher(mine);
    expect(c.findExistingEntry(typed("20261002", "591.00"), exp, "ICICI Bank CA 7731")).toBeNull();
    expect(c.findExistingEntry(typed("20261010", "590.00"), exp, "ICICI Bank CA 7731")).toBeNull();
    expect(c.findExistingEntry(typed("20261003", "590.00", "fh-abc"), exp, "ICICI Bank CA 7731")).toBeNull();
    expect(c.findExistingEntry(typed("20261003", "590.00"), exp, "Axis Bank A/c 5426")).toBeNull();
  });
  it("asks Tally for the right months and reports the hit; says nothing when Tally cannot be read", async () => {
    const c = await load();
    const asked: string[] = [];
    const hit = await c.checkTallyHasIt(async (b: string) => (asked.push(b), typed("20261002", "590.00")), "Konkan Test Foods Pvt Ltd", mine, "ICICI Bank CA 7731");
    expect(hit).toMatchObject({ amount: 590 });
    expect(asked.length).toBeGreaterThan(0);
    const none = await c.checkTallyHasIt(async () => { throw new Error("down"); }, "Konkan Test Foods Pvt Ltd", mine, "ICICI Bank CA 7731");
    expect(none).toBeNull();
  });
});
