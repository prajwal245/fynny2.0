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
    expect(req).toContain("<SVFROMDATE>20260401</SVFROMDATE>");
    expect(req).toContain("<SVTODATE>20260430</SVTODATE>");
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
