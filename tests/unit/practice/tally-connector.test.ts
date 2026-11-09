// @vitest-environment node
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearerOf,
  cleanCompanyNames,
  connectorOnline,
  hashToken,
  looksLikeToken,
  monthsToPull,
  newConnectorToken,
  validMonth,
  voucherCount,
} from "@/lib/practice/tallyConnector";
// @ts-expect-error plain JavaScript module shipped to customers
import * as connector from "../../../public/downloads/fynhelp-tally-connector.mjs";

describe("connector token", () => {
  it("is long, random, URL-safe and recognised", () => {
    const a = newConnectorToken();
    const b = newConnectorToken();
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(a).toMatch(/^fyn_tc_[A-Za-z0-9_-]+$/);
  });
  it("is stored only as a hash and rejects look-alikes", async () => {
    const t = newConnectorToken();
    expect(await hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(t)).toBe(await hashToken(t));
    expect(looksLikeToken("fyn_tc_short")).toBe(false);
    expect(looksLikeToken(null)).toBe(false);
    expect(bearerOf(`Bearer ${t}`)).toBe(t);
    expect(bearerOf("Basic abc")).toBeNull();
  });
});

describe("what to send", () => {
  const now = new Date("2026-10-24T08:00:00Z");
  it("backfills a new company, then refreshes this and last month", () => {
    expect(monthsToPull(null, now)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(monthsToPull("2026-10-20T00:00:00Z", now)).toEqual(["2026-09", "2026-10"]);
    expect(monthsToPull("2026-01-05T00:00:00Z", new Date("2026-01-10T00:00:00Z"))).toEqual(["2025-12", "2026-01"]);
  });
  it("validates months, counts vouchers and cleans company names", () => {
    expect(validMonth("2026-04")).toBe(true);
    expect(validMonth("2026-13")).toBe(false);
    expect(voucherCount("<A><VOUCHER REMOTEID=\"1\"></VOUCHER><VOUCHER>x</VOUCHER><VOUCHERTYPENAME>x</VOUCHERTYPENAME></A>")).toBe(2);
    expect(cleanCompanyNames([" Acme  Traders ", "Acme Traders", "", 5, "B"])).toEqual(["Acme Traders", "B"]);
    expect(cleanCompanyNames("x")).toEqual([]);
  });
  it("shows a connector online for 15 minutes after its last check-in", () => {
    expect(connectorOnline("2026-10-24T07:50:00Z", now)).toBe(true);
    expect(connectorOnline("2026-10-24T07:30:00Z", now)).toBe(false);
    expect(connectorOnline(null, now)).toBe(false);
  });
});

describe("Tally XML helpers", () => {
  it("builds requests for the right company and dates", () => {
    expect(connector.monthRange("2026-02")).toEqual({ from: "20260201", to: "20260228" });
    const req = connector.dayBookRequest("Acme & Sons", "2026-04");
    expect(req).toContain("<SVCURRENTCOMPANY>Acme &amp; Sons</SVCURRENTCOMPANY>");
    expect(req).toContain("<SVFROMDATE>1-Apr-2026</SVFROMDATE>");
    expect(req).toContain("<SVTODATE>30-Apr-2026</SVTODATE>");
    expect(connector.dayBookRequest("A", "2026-04", "ymd")).toContain("<SVFROMDATE>20260401</SVFROMDATE>");
    expect(() => connector.monthRange("April")).toThrow();
  });
  it("reads company names from either reply shape", () => {
    expect(connector.parseCompanies('<COLLECTION><COMPANY NAME="Acme &amp; Sons" RESERVEDNAME=""><NAME>x</NAME></COMPANY><COMPANY NAME="Beta"></COMPANY></COLLECTION>')).toEqual(["Acme & Sons", "Beta"]);
    expect(connector.parseCompanies("<COLLECTION><COMPANY><NAME TYPE=\"String\">Gamma Ltd</NAME></COMPANY></COLLECTION>")).toEqual(["Gamma Ltd"]);
  });
  it("decodes UTF-16 and strips characters XML forbids", () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<A>₹</A>", "utf16le")]);
    expect(connector.decodeTally(utf16)).toBe("<A>₹</A>");
    expect(connector.sanitizeTallyXml("<N>ab&#4;c&#x1F;d&#10;e\u0003f</N>")).toBe("<N>abcd&#10;ef</N>");
  });
  it("spots Tally's own error messages", () => {
    expect(connector.tallyError("<ENVELOPE><LINEERROR>Could not set 'SVCurrentCompany'</LINEERROR></ENVELOPE>")).toMatch(/SVCurrentCompany/);
    expect(connector.tallyError("<RESPONSE>Unknown Request, cannot be processed</RESPONSE>")).toMatch(/Unknown Request/);
    expect(connector.tallyError("<ENVELOPE><VOUCHER></VOUCHER></ENVELOPE>")).toBeNull();
  });
});

/* Run the real connector program against a fake Tally and a fake FynHelp. */
describe("connector end to end", () => {
  const token = `fyn_tc_${"A".repeat(43)}`;
  let tally: Server;
  let app: Server;
  let tallyUrl = "";
  let appUrl = "";
  const seen: { path: string; auth: string | undefined; body: string }[] = [];
  const tallyAsked: string[] = [];

  const body = (req: IncomingMessage) =>
    new Promise<string>((res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => res(Buffer.concat(chunks).toString("utf8")));
    });
  const listen = (s: Server) => new Promise<string>((res) => s.listen(0, "127.0.0.1", () => res(`http://127.0.0.1:${(s.address() as { port: number }).port}`)));

  beforeAll(async () => {
    tally = createServer(async (req, res) => {
      const b = await body(req);
      tallyAsked.push(b);
      res.setHeader("content-type", "text/xml");
      if (b.includes("FynHelpCompanies")) return res.end('<ENVELOPE><BODY><DATA><COLLECTION><COMPANY NAME="Acme Traders"><NAME>Acme Traders</NAME></COMPANY><COMPANY NAME="Unlinked Co"></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>');
      if (b.includes("Day Book")) return res.end('<ENVELOPE><BODY><DATA><TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><NARRATION>Rent&#4; paid</NARRATION></VOUCHER></TALLYMESSAGE></DATA></BODY></ENVELOPE>');
      res.end("<RESPONSE>Unknown Request, cannot be processed</RESPONSE>");
    });
    app = createServer(async (req, res) => {
      const b = await body(req);
      seen.push({ path: req.url ?? "", auth: req.headers.authorization, body: b });
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: "Unknown or revoked connector token" }));
      }
      if ((req.url ?? "").startsWith("/api/public/tally-hello"))
        return res.end(JSON.stringify({ syncNow: false, intervalMinutes: 60, companies: [{ name: "Acme Traders", mapped: true, months: ["2026-09", "2026-10"] }, { name: "Unlinked Co", mapped: false, months: [] }] }));
      return res.end(JSON.stringify({ status: "synced", note: "ok" }));
    });
    tallyUrl = await listen(tally);
    appUrl = await listen(app);
  });
  afterAll(() => {
    tally.close();
    app.close();
  });

  const run = (cfg: Record<string, unknown>, ...flags: string[]) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const dir = mkdtempSync(join(tmpdir(), "fyn-conn-"));
      const file = join(dir, "fynhelp-connector.json");
      writeFileSync(file, JSON.stringify(cfg));
      const p = spawn(process.execPath, [join(process.cwd(), "public/downloads/fynhelp-tally-connector.mjs"), "--config", file, ...flags], { cwd: dir });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ code, out }));
    });

  it("sends each linked company's months, cleaned, with the token, and skips unlinked companies", async () => {
    seen.length = 0;
    tallyAsked.length = 0;
    const r = await run({ token, server: appUrl, tallyUrl }, "--once");
    expect(r.code).toBe(0);
    const hello = seen.find((s) => s.path.startsWith("/api/public/tally-hello"))!;
    expect(JSON.parse(hello.body).companies).toEqual(["Acme Traders", "Unlinked Co"]);
    const ledgers = seen.filter((s) => s.path.startsWith("/api/public/tally-ledger"));
    expect(ledgers.map((l) => l.path)).toEqual([
      "/api/public/tally-ledger?company=Acme%20Traders&month=2026-09",
      "/api/public/tally-ledger?company=Acme%20Traders&month=2026-10",
    ]);
    for (const l of ledgers) {
      expect(l.auth).toBe(`Bearer ${token}`);
      expect(l.body).toContain("<VOUCHER");
      expect(l.body).not.toContain("&#4;");
    }
    expect(tallyAsked.filter((b) => b.includes("Day Book") && b.includes("Unlinked"))).toHaveLength(0);
    expect(r.out).toContain("Unlinked Co: not linked");
  });

  it("--check reports Tally and FynHelp separately", async () => {
    const ok = await run({ token, server: appUrl, tallyUrl }, "--check");
    expect(ok.out).toContain("TallyPrime reachable");
    expect(ok.out).toContain("FynHelp accepted the token");
    const bad = await run({ token: `fyn_tc_${"B".repeat(43)}`, server: appUrl, tallyUrl: "http://127.0.0.1:9" }, "--check");
    expect(bad.out).toMatch(/TallyPrime:/);
    expect(bad.out).toContain("revoked connector token");
    expect(bad.code).toBe(1);
  });

  it("tells FynHelp when Tally is closed, instead of failing silently", async () => {
    seen.length = 0;
    await run({ token, server: appUrl, tallyUrl: "http://127.0.0.1:9" }, "--once");
    const hello = JSON.parse(seen.find((s) => s.path.startsWith("/api/public/tally-hello"))!.body);
    expect(hello.error).toMatch(/Cannot reach TallyPrime/);
    expect(seen.filter((s) => s.path.startsWith("/api/public/tally-ledger"))).toHaveLength(0);
  });

  it("refuses a missing or malformed token before doing anything", async () => {
    const r = await run({ token: "nope", server: appUrl, tallyUrl });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/token/i);
  });
});

describe("connector: ledger list and write safety", () => {
  it("asks for ledger names and groups of one company", () => {
    const x = connector.ledgerListRequest("A & B Co");
    expect(x).toContain("<TYPE>Ledger</TYPE>");
    expect(x).toContain("A &amp; B Co");
  });
  it("reads ledger names and parents, and ignores empty ones", () => {
    const xml = `<ENVELOPE><LEDGER NAME="Rao Steels"><PARENT>Sundry Creditors</PARENT></LEDGER><LEDGER><NAME>HDFC Bank</NAME><PARENT>Bank Accounts</PARENT></LEDGER><LEDGER NAME=""></LEDGER></ENVELOPE>`;
    expect(connector.parseLedgers(xml)).toEqual([
      { name: "Rao Steels", parent: "Sundry Creditors" },
      { name: "HDFC Bank", parent: "Bank Accounts" },
    ]);
  });
  it("writing is off unless the config turns it on", () => {
    const dir = mkdtempSync(join(tmpdir(), "fyn-"));
    const file = join(dir, "c.json");
    const token = "fyn_tc_" + "a".repeat(43);
    writeFileSync(file, JSON.stringify({ token }));
    expect(connector.loadConfig(["--config", file]).allowWrite).toBe(false);
    writeFileSync(file, JSON.stringify({ token, allowWrite: true }));
    expect(connector.loadConfig(["--config", file]).allowWrite).toBe(true);
    writeFileSync(file, JSON.stringify({ token, allowWrite: "yes" }));
    expect(connector.loadConfig(["--config", file]).allowWrite).toBe(false);
  });
});

describe("connector: only the right month is ever sent (TallyPrime 7.2 ignored the period)", () => {
  const vch = (d, n) => `<VOUCHER VCHTYPE="Receipt"><DATE>${d}</DATE><VOUCHERNUMBER>${n}</VOUCHERNUMBER></VOUCHER>`;
  const env = (...v) => `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${v.join("")}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  it("formats dates the way Tally prints them, or as plain digits", () => {
    expect(connector.tallyDate("20261101")).toBe("1-Nov-2026");
    expect(connector.tallyDate("20261101", "ymd")).toBe("20261101");
  });
  it("finds the voucher dates and the ones outside a month", () => {
    const x = env(vch("20260331", 1), vch("20260105", 2));
    expect(connector.voucherDates(x)).toEqual(["20260105", "20260331"]);
    expect(connector.datesOutsideMonth(x, "2026-01")).toEqual(["20260331"]);
  });
  it("the request carries TYPE=Date for the typed attempts and asks for the Voucher Register first", () => {
    const first = connector.PERIOD_ATTEMPTS[0];
    expect(first.id).toBe("Voucher Register");
    const req = connector.dayBookRequest("Acme", "2026-01", first.style, undefined, first);
    expect(req).toContain("<ID>Voucher Register</ID>");
    expect(req).toContain('<SVFROMDATE TYPE="Date">1-Jan-2026</SVFROMDATE>');
    expect(req).toContain('<SVTODATE TYPE="Date">31-Jan-2026</SVTODATE>');
  });
  it("a reply inside the month is used as it is, and the way that worked is reported", async () => {
    const tried = [];
    const asked = [];
    const xml = await connector.fetchDayBook(async (b) => { asked.push(b); return env(vch("20260105", 1), vch("20260120", 2)); }, "Acme", "2026-01", (a) => tried.push(a.id));
    expect(asked).toHaveLength(1);
    expect(tried).toEqual(["Voucher Register"]);
    expect(connector.voucherDates(xml)).toHaveLength(2);
  });
  it("a reply dated outside the month is refused and the next way of asking is tried", async () => {
    let n = 0;
    const xml = await connector.fetchDayBook(async (b) => {
      n++;
      return /Voucher Register/.test(b) ? env(vch("20260331", 1)) : env(vch("20260105", 7), vch("20260110", 8)); // only the Day Book honours it here
    }, "Acme", "2026-01");
    expect(n).toBe(3);
    expect(connector.datesOutsideMonth(xml, "2026-01")).toEqual([]);
  });
  it("when Tally never honours the period, it throws and nothing is sent (the 31 March bug)", async () => {
    await expect(connector.fetchDayBook(async () => env(vch("20260331", 1), vch("20260331", 2)), "Acme", "2026-01")).rejects.toThrow(/did not return the vouchers of 2026-01.*Nothing was sent/s);
  });
  it("a month with no vouchers at all is genuinely empty and is returned", async () => {
    const xml = await connector.fetchDayBook(async () => env(), "Acme", "2026-01");
    expect(connector.voucherBlocks(xml)).toHaveLength(0);
  });
});

describe("connector: the address, the config file and writing", () => {
  it("fynhelp.com without www is changed to the www address", () => {
    expect(connector.normaliseServer("https://fynhelp.com")).toBe("https://www.fynhelp.com");
    expect(connector.normaliseServer("https://fynhelp.com/")).toBe("https://www.fynhelp.com");
    expect(connector.normaliseServer("https://www.fynhelp.com")).toBe("https://www.fynhelp.com");
    expect(connector.normaliseServer(undefined)).toBe("https://www.fynhelp.com");
    expect(connector.normaliseServer("http://localhost:3000/")).toBe("http://localhost:3000");
  });
  it("a config file saved with a byte-order mark still loads", () => {
    const dir = mkdtempSync(join(tmpdir(), "fyn-"));
    const file = join(dir, "c.json");
    const token = "fyn_tc_" + "a".repeat(43);
    writeFileSync(file, "\uFEFF" + JSON.stringify({ token, server: "https://fynhelp.com" }));
    const cfg = connector.loadConfig(["--config", file]);
    expect(cfg.token).toBe(token);
    expect(cfg.server).toBe("https://www.fynhelp.com");
  });
  const entry = (over = "") =>
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>Acme &amp; Sons</SVCURRENTCOMPANY></STATICVARIABLES></DESC><DATA><TALLYMESSAGE><VOUCHER REMOTEID="x" VCHTYPE="Receipt" ACTION="Create"><DATE>20261102</DATE></VOUCHER>${over}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const linked = ["Acme & Sons"];
  it("one new Receipt for a linked company is allowed", () => {
    expect(connector.refuseImport(entry(), "Acme & Sons", linked)).toBeNull();
  });
  it("refuses an unlinked company, a master, a change, a deletion and extra vouchers", () => {
    expect(connector.refuseImport(entry(), "Other Co", linked)).toMatch(/not a linked/);
    expect(connector.refuseImport(entry("<LEDGER NAME=\"New\"></LEDGER>"), "Acme & Sons", linked)).toMatch(/masters/);
    expect(connector.refuseImport(entry().replace('ACTION="Create"', 'ACTION="Alter"'), "Acme & Sons", linked)).toMatch(/created/);
    expect(connector.refuseImport(entry().replace('ACTION="Create"', 'ACTION="Delete"'), "Acme & Sons", linked)).toMatch(/created|deleting/);
    expect(connector.refuseImport(entry('<VOUCHER VCHTYPE="Payment" ACTION="Create"></VOUCHER>'), "Acme & Sons", linked)).toMatch(/exactly one/);
    expect(connector.refuseImport(entry().replace('VCHTYPE="Receipt"', 'VCHTYPE="Journal"'), "Acme & Sons", linked)).toMatch(/not allowed/);
    expect(connector.refuseImport("<ENVELOPE><HEADER><TALLYREQUEST>Export</TALLYREQUEST></HEADER></ENVELOPE>", "Acme & Sons", linked)).toMatch(/not a voucher import/);
  });
  it("a different company named in the entry is refused", () => {
    expect(connector.refuseImport(entry().replace("Acme &amp; Sons", "Other"), "Acme & Sons", linked)).toMatch(/different company/);
  });
});

import { datesOutsideMonth, voucherDatesOf } from "@/lib/practice/tallyConnector";
describe("the server never files the wrong month", () => {
  const x = (d: string) => `<ENVELOPE><VOUCHER VCHTYPE="Receipt"><DATE>${d}</DATE></VOUCHER></ENVELOPE>`;
  it("finds voucher dates and the ones outside the month", () => {
    expect(voucherDatesOf(x("20260331") + x("20260105"))).toEqual(["20260105", "20260331"]);
    expect(datesOutsideMonth(x("20260331") + x("20260105"), "2026-01")).toEqual(["20260331"]);
    expect(datesOutsideMonth(x("20260105") + x("20260131"), "2026-01")).toEqual([]);
    expect(datesOutsideMonth(x("20260229"), "2026-02")).toEqual(["20260229"]); // 2026 is not a leap year
  });
});
