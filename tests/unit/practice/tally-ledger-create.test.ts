// @vitest-environment node
/**
 * Creating a ledger in Tally from FynHelp, end to end on the FynHelp side and the Tally PC side:
 * the rules, the request Tally accepts, the two safety checks that must agree, the server's queue, and the read-back.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Db, FirmContext } from "@/lib/practice/db.server";
import {
  CREATABLE_GROUPS,
  createLedgerXml,
  ledgerImportProblems,
  ledgerRequestProblems,
  similarLedgers,
} from "@/lib/practice/tallyLedgerCreate";
import { readTallyMasters } from "@/lib/practice/extract/tallyMasters";
import * as reqs from "@/lib/practice/tallyLedgerRequests.server";
// @ts-expect-error plain JavaScript module shipped to customers
import * as connector from "../../../public/downloads/fynhelp-tally-connector.mjs";

const COMPANY = "Godavari Spices & Foods Pvt Ltd";
const existing = [
  { name: "HDFC Bank A/c 50200071", parent: "Bank Accounts" },
  { name: "Cash", parent: "Cash-in-Hand" },
  { name: "Krishna Kitchen Supplies", parent: "Sundry Debtors" },
  { name: "Nizam Packaging Industries", parent: "Sundry Creditors" },
  { name: "Bank Charges", parent: "Indirect Expenses" },
  { name: "TDS Payable", parent: "Duties & Taxes" },
];

describe("what may be created", () => {
  it("a new supplier under Sundry Creditors is fine", () => {
    expect(
      ledgerRequestProblems(
        { name: "Zenith Packaging Works Pvt Ltd", parent: "Sundry Creditors" },
        existing,
      ),
    ).toEqual([]);
  });
  it("is refused for the groups that need tax, bank or stock settings, and for Tally's own names", () => {
    for (const parent of [
      "Bank Accounts",
      "Cash-in-Hand",
      "Duties & Taxes",
      "Capital Account",
      "Stock-in-Hand",
    ])
      expect(
        ledgerRequestProblems({ name: "Something New", parent }, existing)[0],
        parent,
      ).toMatch(/create them in Tally/);
    expect(
      ledgerRequestProblems(
        { name: "Primary", parent: "Sundry Creditors" },
        existing,
      )[0],
    ).toMatch(/keeps for itself/);
    expect(
      ledgerRequestProblems(
        { name: "Profit & Loss A/c", parent: "Sundry Creditors" },
        existing,
      )[0],
    ).toMatch(/keeps for itself/);
  });
  it("is refused for a group FynHelp does not know, but accepts one the company already uses", () => {
    expect(
      ledgerRequestProblems(
        { name: "Zenith", parent: "Made Up Group" },
        existing,
      )[0],
    ).toMatch(/not a group/);
    expect(
      ledgerRequestProblems({ name: "Zenith", parent: "Packing Costs" }, [
        ...existing,
        { name: "Boxes", parent: "Packing Costs" },
      ]),
    ).toEqual([]);
  });
  it("is refused when the ledger exists, in any spelling of the case, and points to the existing one", () => {
    expect(
      ledgerRequestProblems(
        { name: "krishna kitchen supplies", parent: "Sundry Debtors" },
        existing,
      )[0],
    ).toMatch(/already exists in Tally under Sundry Debtors/);
  });
  it("stops a near duplicate unless the person says it is a different party", () => {
    const p = ledgerRequestProblems(
      { name: "Nizam Packaging Industry", parent: "Sundry Creditors" },
      existing,
    );
    expect(p[0]).toMatch(/looks like "Nizam Packaging Industries"/);
    expect(
      similarLedgers(
        "Nizam Packaging Industry",
        existing.map((e) => e.name),
      ),
    ).toContain("Nizam Packaging Industries");
    expect(
      ledgerRequestProblems(
        { name: "Nizam Packaging Industry", parent: "Sundry Creditors" },
        existing,
        { allowSimilar: true },
      ),
    ).toEqual([]);
  });
  it("rejects an empty name, a name that is too long and a name with characters Tally refuses", () => {
    expect(
      ledgerRequestProblems(
        { name: "   ", parent: "Sundry Creditors" },
        existing,
      )[0],
    ).toMatch(/Type the ledger name/);
    expect(
      ledgerRequestProblems(
        { name: "x".repeat(100), parent: "Sundry Creditors" },
        existing,
      )[0],
    ).toMatch(/at most 99/);
    expect(
      ledgerRequestProblems(
        { name: 'Bad "quote"', parent: "Sundry Creditors" },
        existing,
      )[0],
    ).toMatch(/character Tally does not accept/);
  });
  it("every group on offer is allowed", () => {
    for (const g of CREATABLE_GROUPS)
      expect(
        ledgerRequestProblems(
          { name: "Brand New Name Co", parent: g.name },
          existing,
        ),
        g.name,
      ).toEqual([]);
  });
});

describe("the request Tally receives", () => {
  const xml = createLedgerXml(
    COMPANY,
    "Zenith Packaging & Co",
    "Sundry Creditors",
  );
  it("has the shape of a real masters import: the same tags Tally's own masters files use", () => {
    const sample = readFileSync(
      "public/samples/tally/01_masters_godavari_spices_foods.xml",
      "utf8",
    );
    const tags = (x: string) =>
      new Set([...x.matchAll(/<([A-Z][A-Z0-9.]*)[\s>]/g)].map((m) => m[1]));
    const theirs = tags(sample);
    for (const t of tags(xml)) expect(theirs.has(t), t).toBe(true);
    expect(xml).toContain(
      '<LEDGER NAME="Zenith Packaging &amp; Co" ACTION="Create">',
    );
    expect(xml).toContain("<PARENT>Sundry Creditors</PARENT>");
    expect(xml).toContain(
      "<SVCURRENTCOMPANY>Godavari Spices &amp; Foods Pvt Ltd</SVCURRENTCOMPANY>",
    );
  });
  it("is read back by FynHelp's own masters reader as one ledger with that name and group", () => {
    const m = readTallyMasters(xml);
    expect(m.ledgers).toEqual([
      {
        name: "Zenith Packaging & Co",
        parent: "Sundry Creditors",
        opening: 0,
        gstin: null,
        state: null,
      },
    ]);
    expect(m.company).toBe(COMPANY);
  });
  it("passes both safety checks, which agree on every variation", () => {
    expect(ledgerImportProblems(xml, COMPANY)).toEqual([]);
    expect(connector.refuseLedgerImport(xml, COMPANY, [COMPANY])).toBeNull();
    const variations: [string, string][] = [
      ["an alter", xml.replace('ACTION="Create"', 'ACTION="Alter"')],
      ["a delete", xml.replace('ACTION="Create"', 'ACTION="Delete"')],
      [
        "an opening balance",
        xml.replace(
          "</PARENT>",
          "</PARENT><OPENINGBALANCE>-5000.00</OPENINGBALANCE>",
        ),
      ],
      [
        "two ledgers",
        xml.replace(
          "</TALLYMESSAGE>",
          "</TALLYMESSAGE>" +
            xml.match(/<TALLYMESSAGE[\s\S]*<\/TALLYMESSAGE>/)![0],
        ),
      ],
      [
        "a voucher too",
        xml.replace(
          "</LEDGER>",
          '</LEDGER><VOUCHER ACTION="Create"></VOUCHER>',
        ),
      ],
      [
        "a group",
        xml.replace(
          "</LEDGER>",
          '</LEDGER><GROUP NAME="X" ACTION="Create"></GROUP>',
        ),
      ],
      ["no group", xml.replace("<PARENT>Sundry Creditors</PARENT>", "")],
      [
        "the wrong company",
        xml.replace("Godavari Spices &amp; Foods Pvt Ltd", "Other Co"),
      ],
      [
        "names that differ",
        xml.replace(
          "<NAME>Zenith Packaging &amp; Co</NAME>",
          "<NAME>Zenith</NAME>",
        ),
      ],
      ["a voucher import instead", xml.replace("All Masters", "Vouchers")],
      ["a bank group", xml.replace("Sundry Creditors", "Bank Accounts")],
    ];
    for (const [what, bad] of variations) {
      const server = ledgerImportProblems(bad, COMPANY);
      const pc = connector.refuseLedgerImport(bad, COMPANY, [COMPANY]);
      expect(pc, `${what}: the connector must refuse`).toBeTruthy();
      if (!/bank group/.test(what))
        expect(
          server.length,
          `${what}: the server must refuse`,
        ).toBeGreaterThan(0);
    }
    expect(connector.refuseLedgerImport(xml, COMPANY, [])).toMatch(
      /not a linked/,
    );
  });
  it("a voucher import is still refused as a ledger, and a ledger as a voucher", () => {
    expect(connector.refuseImport(xml, COMPANY, [COMPANY])).toBeTruthy();
    expect(
      connector.refuseLedgerImport(
        readFileSync(
          "tests/fixtures/tally/vouchers-import-october-2026.xml",
          "utf8",
        ),
        "Godavari Spices & Foods Pvt Ltd",
        ["Godavari Spices & Foods Pvt Ltd"],
      ),
    ).toBeTruthy();
  });
});

describe("the connector reads the ledger back from Tally", () => {
  const xml = createLedgerXml(
    COMPANY,
    "Zenith Packaging Works",
    "Sundry Creditors",
  );
  const list = (...ls: [string, string][]) =>
    `<ENVELOPE><BODY><DATA><COLLECTION>${ls.map(([n, p]) => `<LEDGER NAME="${n}"><NAME>${n}</NAME><PARENT>${p}</PARENT></LEDGER>`).join("")}</COLLECTION></DATA></BODY></ENVELOPE>`;
  it("verifies when the ledger is there under the group asked for", async () => {
    const r = await connector.verifyLedgerCreated(
      async () =>
        list(
          ["Cash", "Cash-in-Hand"],
          ["Zenith Packaging Works", "Sundry Creditors"],
        ),
      COMPANY,
      xml,
    );
    expect(r).toMatchObject({ verified: true });
  });
  it("does not verify when it is missing, under another group, or Tally cannot answer", async () => {
    expect(
      (
        await connector.verifyLedgerCreated(
          async () => list(["Cash", "Cash-in-Hand"]),
          COMPANY,
          xml,
        )
      ).note,
    ).toMatch(/not in the company's ledgers/);
    expect(
      (
        await connector.verifyLedgerCreated(
          async () => list(["Zenith Packaging Works", "Sundry Debtors"]),
          COMPANY,
          xml,
        )
      ).note,
    ).toMatch(/under "Sundry Debtors"/);
    expect(
      (
        await connector.verifyLedgerCreated(
          async () => {
            throw new Error("refused");
          },
          COMPANY,
          xml,
        )
      ).verified,
    ).toBe(false);
    expect(
      (
        await connector.verifyLedgerCreated(
          async () =>
            "<RESPONSE>Unknown Request, cannot be processed</RESPONSE>",
          COMPANY,
          xml,
        )
      ).verified,
    ).toBe(false);
  });
  it("the connector is version 1.5.0, the first that can create ledgers", () => {
    expect(connector.VERSION).toBe("1.5.0");
  });
});

/* ── the server's queue, on an in-memory database ──────────── */

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  let n = 0;
  const builder = (name: string) => {
    const t = (tables[name] ??= []);
    let rows = t;
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let patch: Row = {};
    let dup = false;
    const q: Record<string, unknown> = {};
    const run = () => {
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      return rows;
    };
    q["select"] = () => q;
    q["eq"] = (k: string, v: unknown) => (
      (rows = rows.filter((r) => r[k] === v)),
      q
    );
    q["in"] = (k: string, vs: unknown[]) => (
      (rows = rows.filter((r) => vs.includes(r[k]))),
      q
    );
    q["lt"] = (k: string, v: string) => (
      (rows = rows.filter((r) => String(r[k] ?? "") < v)),
      q
    );
    q["order"] = () => q;
    q["limit"] = () => q;
    q["insert"] = (r: Row) => {
      op = "insert";
      const live = ["queued", "sent", "created"];
      if (
        name === "ca_tally_ledger_requests" &&
        t.some(
          (x) =>
            x["company_id"] === r["company_id"] &&
            String(x["name"]).toLowerCase() ===
              String(r["name"]).toLowerCase() &&
            live.includes(String(x["status"])),
        )
      ) {
        dup = true;
        rows = [];
        return q;
      }
      const row = {
        id: `row-${++n}`,
        status: name === "ca_tally_ledger_requests" ? "queued" : undefined,
        created_at: new Date().toISOString(),
        ...r,
      };
      t.push(row);
      rows = [row];
      return q;
    };
    q["update"] = (p: Row) => ((op = "update"), (patch = p), q);
    q["upsert"] = (r: Row) => {
      const k = t.find(
        (x) => x["company_id"] === r["company_id"] && x["name"] === r["name"],
      );
      if (k) Object.assign(k, r);
      else t.push({ id: `row-${++n}`, ...r });
      return q;
    };
    q["maybeSingle"] = async () => ({ data: run()[0] ?? null, error: null });
    q["single"] = async () =>
      dup
        ? {
            data: null,
            error: {
              message: "duplicate key value violates unique constraint",
            },
          }
        : { data: run()[0] ?? null, error: null };
    q["then"] = (res: (v: unknown) => unknown) =>
      res({ data: run(), error: null });
    return q;
  };
  return { from: builder } as unknown as Db;
}

const partner: FirmContext = {
  firmId: "f1",
  firmName: "Rao & Co",
  firmEmail: null,
  userId: "u1",
  role: "partner",
};
const world = (version = "1.5.0") =>
  fakeDb({
    ca_tally_connectors: [
      { id: "con1", ca_firm_id: "f1", agent_version: version, is_active: true },
    ],
    ca_tally_companies: [
      {
        id: "co1",
        ca_firm_id: "f1",
        connector_id: "con1",
        company_name: COMPANY,
        business_id: "b1",
      },
    ],
    ca_tally_ledgers: existing.map((e, i) => ({
      id: `l${i}`,
      ca_firm_id: "f1",
      company_id: "co1",
      ...e,
    })),
    ca_tally_ledger_requests: [],
    ca_activity: [],
  });
const connectorRow = { id: "con1", ca_firm_id: "f1" } as never;

describe("asking for a ledger", () => {
  it("only a partner or manager may ask, and an old connector is told to update", async () => {
    await expect(
      reqs.requestLedger(
        world(),
        { ...partner, role: "junior" },
        {
          businessId: "b1",
          name: "Zenith Packaging",
          parent: "Sundry Creditors",
        },
      ),
    ).rejects.toThrow(/Only a partner or manager/);
    await expect(
      reqs.requestLedger(world("1.4.0"), partner, {
        businessId: "b1",
        name: "Zenith Packaging",
        parent: "Sundry Creditors",
      }),
    ).rejects.toThrow(/connector 1\.5\.0 or later/);
  });
  it("refuses what the rules refuse, before anything is queued", async () => {
    const db = world();
    await expect(
      reqs.requestLedger(db, partner, {
        businessId: "b1",
        name: "GST Input",
        parent: "Duties & Taxes",
      }),
    ).rejects.toThrow(/create them in Tally/);
    await expect(
      reqs.requestLedger(db, partner, {
        businessId: "b1",
        name: "Krishna Kitchen Supplies",
        parent: "Sundry Debtors",
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      reqs.requestLedger(db, partner, {
        businessId: "b1",
        name: "Zenith",
        parent: "Made Up",
      }),
    ).rejects.toThrow(/not a group/);
  });
  it("asking twice queues once", async () => {
    const db = world();
    await reqs.requestLedger(db, partner, {
      businessId: "b1",
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    await expect(
      reqs.requestLedger(db, partner, {
        businessId: "b1",
        name: "zenith packaging works",
        parent: "Sundry Creditors",
      }),
    ).rejects.toThrow(/already been asked for/);
  });
});

describe("the whole flow: ask, the connector claims it, Tally creates it, the connector reads it back", () => {
  it("a verified creation makes the ledger usable at once; nothing else changes", async () => {
    const db = world();
    const { id } = await reqs.requestLedger(db, partner, {
      businessId: "b1",
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    const claimed = await reqs.claimLedgerRequests(db, connectorRow);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id,
      company: COMPANY,
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    // What the server hands out is what the connector accepts.
    expect(
      connector.refuseLedgerImport(claimed[0]!.xml, COMPANY, [COMPANY]),
    ).toBeNull();
    // Claimed once: a second check-in gets nothing, so it can never be created twice.
    expect(await reqs.claimLedgerRequests(db, connectorRow)).toHaveLength(0);
    const tallyReply =
      "<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>";
    const done = await reqs.reportLedgerResult(db, connectorRow, id, {
      reply: tallyReply,
      verified: true,
      verifyNote:
        '"Zenith Packaging Works" is in Tally under Sundry Creditors.',
    });
    expect(done).toEqual({ status: "created" });
    const names = (
      await (
        db as unknown as {
          from: (t: string) => { select: () => PromiseLike<{ data: Row[] }> };
        }
      )
        .from("ca_tally_ledgers")
        .select()
    ).data;
    expect(
      names.some(
        (l) =>
          l.name === "Zenith Packaging Works" &&
          l.parent === "Sundry Creditors",
      ),
    ).toBe(true);
    // Reporting the same result again changes nothing.
    expect(
      await reqs.reportLedgerResult(db, connectorRow, id, {
        reply: tallyReply,
        verified: true,
      }),
    ).toEqual({ status: "created" });
  });
  it("Tally saying created is not enough: if the read-back fails the request is held, not counted", async () => {
    const db = world();
    const { id } = await reqs.requestLedger(db, partner, {
      businessId: "b1",
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    await reqs.claimLedgerRequests(db, connectorRow);
    const r = await reqs.reportLedgerResult(db, connectorRow, id, {
      reply: "<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS></RESPONSE>",
      verified: false,
      verifyNote: '"Zenith Packaging Works" is not in the company\'s ledgers.',
    });
    expect(r).toEqual({ status: "failed" });
    const names = (
      await (
        db as unknown as {
          from: (t: string) => { select: () => PromiseLike<{ data: Row[] }> };
        }
      )
        .from("ca_tally_ledgers")
        .select()
    ).data;
    expect(names.some((l) => l.name === "Zenith Packaging Works")).toBe(false);
    const open = await reqs.openLedgerRequests(db, partner, "co1");
    expect(open[0]).toMatchObject({ status: "failed" });
    expect(open[0]!.last_error).toMatch(/reading it back did not confirm/);
  });
  it("Tally refusing (the ledger already exists, or a TDL error) is reported with Tally's words", async () => {
    const db = world();
    const { id } = await reqs.requestLedger(db, partner, {
      businessId: "b1",
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    await reqs.claimLedgerRequests(db, connectorRow);
    await reqs.reportLedgerResult(db, connectorRow, id, {
      reply:
        "<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS><LINEERROR>Ledger 'Zenith Packaging Works' already exists</LINEERROR></RESPONSE>",
    });
    const open = await reqs.openLedgerRequests(db, partner, "co1");
    expect(open[0]!.last_error).toMatch(/already exists/);
  });
  it("an older connector is never handed a request, and another connector cannot report on it", async () => {
    const db = world();
    const { id } = await reqs.requestLedger(db, partner, {
      businessId: "b1",
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    const t = db as unknown as {
      from: (t: string) => { select: () => PromiseLike<{ data: Row[] }> };
    };
    ((await t.from("ca_tally_connectors").select()).data[0] as Row)[
      "agent_version"
    ] = "1.4.0";
    expect(await reqs.claimLedgerRequests(db, connectorRow)).toEqual([]);
    ((await t.from("ca_tally_connectors").select()).data[0] as Row)[
      "agent_version"
    ] = "1.5.0";
    await reqs.claimLedgerRequests(db, connectorRow);
    await expect(
      reqs.reportLedgerResult(
        db,
        { id: "other", ca_firm_id: "f1" } as never,
        id,
        { reply: "x" },
      ),
    ).rejects.toThrow(/Unknown request/);
  });
  it("a request cancelled before it is sent is never given to the connector", async () => {
    const db = world();
    const { id } = await reqs.requestLedger(db, partner, {
      businessId: "b1",
      name: "Zenith Packaging Works",
      parent: "Sundry Creditors",
    });
    await reqs.cancelLedgerRequest(db, partner, id);
    expect(await reqs.claimLedgerRequests(db, connectorRow)).toEqual([]);
  });
  it("the migration creates every column the code uses", () => {
    const sql = readFileSync(
      "supabase/migrations/20261112130000_tally_ledger_requests.sql",
      "utf8",
    );
    for (const c of [
      "ca_firm_id",
      "business_id",
      "company_id",
      "name",
      "parent",
      "status",
      "attempts",
      "claimed_at",
      "last_error",
      "tally_reply",
      "requested_by",
      "created_in_tally_at",
    ])
      expect(sql).toContain(c);
    expect(sql).toMatch(/ca_tally_ledger_requests_live_uidx/);
    expect(sql).toMatch(/NOTIFY pgrst/);
  });
});
