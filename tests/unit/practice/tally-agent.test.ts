import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script shipped to client PCs
import * as lib from "../../../tools/tally-agent/lib.mjs";
import { ingestPayload } from "@/lib/practice/tally/payload";

const run = promisify(execFile);

const LEDGERS = `<ENVELOPE><BODY><DATA><COLLECTION>
<LEDGER NAME="HDFC Current A/c" RESERVEDNAME=""><PARENT TYPE="String">Bank Accounts</PARENT><OPENINGBALANCE>-1000.00</OPENINGBALANCE><CLOSINGBALANCE>-300000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Kaveri &amp; Sons"><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE></OPENINGBALANCE><CLOSINGBALANCE>1,20,000.50 Dr</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Web Sales"><PARENT>Sales Accounts</PARENT><CLOSINGBALANCE>420000 Cr</CLOSINGBALANCE></LEDGER>
</COLLECTION></DATA></BODY></ENVELOPE>`;
const GROUPS = `<ENVELOPE><BODY><DATA><COLLECTION><GROUP NAME="Bank Accounts"><PARENT>Current Assets</PARENT></GROUP><GROUP NAME="Sundry Debtors"><PARENT>Current Assets</PARENT></GROUP></COLLECTION></DATA></BODY></ENVELOPE>`;
const COMPANIES = `<ENVELOPE><BODY><DATA><COLLECTION><COMPANY NAME="Kaveri Traders"><NAME>Kaveri Traders</NAME></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>`;

describe("Tally agent library", () => {
  it("reads amounts in Tally's sign, with or without Dr/Cr", () => {
    expect(lib.tallyAmount("-300000.00")).toBe(-300000);
    expect(lib.tallyAmount("1,20,000.50 Dr")).toBe(-120000.5);
    expect(lib.tallyAmount("420000 Cr")).toBe(420000);
    expect(lib.tallyAmount("")).toBe(0);
    expect(lib.tallyAmount("n/a")).toBe(0);
  });

  it("parses ledgers, decoding entities and tolerating empty fields", () => {
    const l = lib.parseLedgers(LEDGERS);
    expect(l.map((x: { name: string }) => x.name)).toEqual(["HDFC Current A/c", "Kaveri & Sons", "Web Sales"]);
    expect(l[0]).toMatchObject({ parent: "Bank Accounts", opening: -1000, closing: -300000 });
    expect(l[1]).toMatchObject({ opening: 0, closing: -120000.5 });
    expect(lib.parseGroups(GROUPS)).toEqual([
      { name: "Bank Accounts", parent: "Current Assets" },
      { name: "Sundry Debtors", parent: "Current Assets" },
    ]);
    expect(lib.parseCompanies(COMPANIES)).toEqual([{ name: "Kaveri Traders" }]);
  });

  it("escapes the company name in requests and uses Tally's date format", () => {
    const x = lib.ledgersRequest('A & B "Traders"', "2026-04-01", "2026-09-30");
    expect(x).toContain("A &amp; B &quot;Traders&quot;");
    expect(x).toContain("20260401");
    expect(x).toContain("20260930");
  });

  it("surfaces Tally's own error text", () => {
    expect(lib.tallyError("<RESPONSE><LINEERROR>Could not set SVCurrentCompany</LINEERROR></RESPONSE>")).toBe("Could not set SVCurrentCompany");
    expect(lib.tallyError(LEDGERS)).toBeNull();
  });

  it("picks snapshot dates: backfill is every closed month end, a normal run is the last one", () => {
    expect(lib.snapshotDates("2026-10-19", { backfill: true })).toEqual({
      fyStart: "2026-04-01",
      dates: ["2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-19"],
    });
    expect(lib.snapshotDates("2026-10-19").dates).toEqual(["2026-09-30", "2026-10-19"]);
    expect(lib.snapshotDates("2027-02-28").fyStart).toBe("2026-04-01");
    expect(lib.snapshotDates("2026-04-02").dates).toEqual(["2026-04-02"]);
  });
});

describe("Tally agent, end to end against stand-ins", () => {
  it("pairs, reads Tally and sends snapshots FynHelp's schema accepts", async () => {
    const received: { auth: string | undefined; body: Record<string, unknown> }[] = [];
    const body = (req: IncomingMessage) => new Promise<string>((res) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => res(s)); });
    const tallySrv = createServer(async (req, res) => {
      const b = await body(req);
      res.end(b.includes("FHCompanies") ? COMPANIES : b.includes("FHGroups") ? GROUPS : LEDGERS);
    });
    const fynSrv = createServer(async (req, res) => {
      const b = JSON.parse(await body(req));
      received.push({ auth: req.headers.authorization, body: b });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(b.kind === "pair" ? { ok: true, token: "fhta_" + "a".repeat(64) } : { ok: true, status: "synced", note: "ok" }));
    });
    await Promise.all([tallySrv, fynSrv].map((s) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r))));
    const port = (s: typeof tallySrv) => (s.address() as { port: number }).port;
    const home = await mkdtemp(join(tmpdir(), "fh-agent-"));
    const env = { ...process.env, FYNHELP_HOME: home, FYNHELP_URL: `http://127.0.0.1:${port(fynSrv)}`, TALLY_URL: `http://127.0.0.1:${port(tallySrv)}` };
    const agent = join(__dirname, "../../../tools/tally-agent/agent.mjs");
    try {
      await run("node", [agent, "pair", "FYN-ABCD-EFGH"], { env });
      expect(JSON.parse(await readFile(join(home, "config.json"), "utf8")).token).toMatch(/^fhta_/);
      await run("node", [agent, "sync", "--backfill"], { env });

      const snaps = received.filter((r) => r.body.kind === "snapshot");
      expect(snaps.length).toBeGreaterThan(2);
      expect(snaps.every((s) => s.auth?.startsWith("Bearer fhta_"))).toBe(true);
      // The exact payload must pass the server's validator.
      for (const s of snaps) expect(ingestPayload.safeParse(s.body).success).toBe(true);
      expect(snaps[0].body).toMatchObject({ company: "Kaveri Traders", fyStart: expect.stringMatching(/-04-01$/) });
    } finally {
      tallySrv.close();
      fynSrv.close();
    }
  }, 60_000);
});
