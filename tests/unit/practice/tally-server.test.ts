import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/practice/core";

const registered: Record<string, unknown>[] = [];
const registerFails = { code: "" };
vi.mock("@/lib/practice/documents.server", () => ({
  BUCKET: "ca-client-documents",
  processExtraction: vi.fn(async () => ({ status: "parsed" })),
  registerDocument: vi.fn(async (_db: unknown, _ctx: unknown, input: Record<string, unknown>) => {
    if (registerFails.code) throw Object.assign(new Error("New work is paused for this firm."), { code: registerFails.code });
    registered.push(input);
    return { extraction_id: "x1", duplicate: false };
  }),
}));
import * as tally from "@/lib/practice/tally.server";
import type { Db, FirmContext } from "@/lib/practice/db.server";

/** Just enough of the Supabase query builder for tally.server: in-memory tables, chainable filters. */
function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = {};
  let n = 0;
  const T = (name: string) => (tables[name] ??= []);
  const db = {
    tables,
    from(name: string) {
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: unknown;
      let conflict: string[] = [];
      let ignoreDup = false;
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      let order: { col: string; asc: boolean } | null = null;
      let lim = Infinity;
      let wantRows = false;
      const run = () => {
        let rows = T(name);
        if (op === "insert" || op === "upsert") {
          const list = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
          const out: Record<string, unknown>[] = [];
          for (const item of list) {
            const dup = op === "upsert" ? rows.find((r) => conflict.length && conflict.every((c) => r[c] === item[c])) : undefined;
            if (dup) {
              if (!ignoreDup) Object.assign(dup, item);
              out.push(dup);
            } else {
              const row = { id: `id${++n}`, created_at: new Date().toISOString(), status: "active", sync_enabled: true, ...item };
              rows.push(row);
              out.push(row);
            }
          }
          return out;
        }
        rows = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") { rows.forEach((r) => Object.assign(r, payload)); return rows; }
        if (order) rows = [...rows].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1));
        return rows.slice(0, lim);
      };
      const b: Record<string, unknown> = {
        select: () => { wantRows = true; return b; },
        insert: (p: unknown) => { op = "insert"; payload = p; return b; },
        update: (p: unknown) => { op = "update"; payload = p; return b; },
        upsert: (p: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => { op = "upsert"; payload = p; conflict = (o?.onConflict ?? "").split(",").filter(Boolean); ignoreDup = !!o?.ignoreDuplicates; return b; },
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
        neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
        lte: (c: string, v: string) => { filters.push((r) => String(r[c]) <= v); return b; },
        order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return b; },
        limit: (k: number) => { lim = k; return b; },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        single: async () => { const r = run()[0]; return { data: r ?? null, error: r ? null : { message: "no row" } }; },
        then: (res: (v: unknown) => void) => { const rows = run(); res({ data: op === "select" || wantRows ? rows : null, error: null }); },
      };
      return b;
    },
  };
  (db as unknown as { storage: unknown }).storage = { from: () => ({ upload: async () => ({ error: null }) }) };
  return db as unknown as Db & { tables: typeof tables };
}

const ctx = { firmId: "firm1", firmName: "Test CA", firmEmail: null, userId: "u1", role: "partner" } as FirmContext;
const CLIENT = "11111111-1111-1111-1111-111111111111";

const snapshot = (asOn: string, extra: Record<string, unknown> = {}) => ({
  kind: "snapshot" as const,
  company: "Kaveri Traders",
  fyStart: "2026-04-01",
  asOn,
  groups: [{ name: "Bank Accounts", parent: "Current Assets" }],
  // Tally signs: debit negative
  ledgers: [
    { name: "HDFC", parent: "Bank Accounts", closing: -100000 },
    { name: "Capital", parent: "Capital Account", closing: 100000 },
  ],
  ...extra,
});

async function paired(db: ReturnType<typeof fakeDb>) {
  const { code } = await tally.createPairing(db, ctx);
  const { token } = await tally.redeemPairing(db, code, { label: "Front desk PC" });
  return { code, token, agent: await tally.authAgent(db, `Bearer ${token}`) };
}

describe("Tally server", () => {
  let db: ReturnType<typeof fakeDb>;
  beforeEach(() => { db = fakeDb(); registered.length = 0; registerFails.code = ""; });

  it("pairs once: the code works a single time and the token is stored only as a hash", async () => {
    const { code, token } = await paired(db);
    expect(JSON.stringify(db.tables)).not.toContain(token);
    expect(JSON.stringify(db.tables)).not.toContain(code);
    await expect(tally.redeemPairing(db, code, { label: "second PC" })).rejects.toThrow(/wrong or has expired|already used/);
    expect(db.tables["ca_tally_agents"]).toHaveLength(1);
  });

  it("accepts the code however it is typed", async () => {
    const { code } = await tally.createPairing(db, ctx);
    await expect(tally.redeemPairing(db, ` ${code.toLowerCase().replaceAll("-", " ")} `, { label: "x" })).resolves.toHaveProperty("token");
  });

  it("refuses an expired code", async () => {
    const { code } = await tally.createPairing(db, ctx);
    db.tables["ca_tally_pairings"][0].expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(tally.redeemPairing(db, code, { label: "x" })).rejects.toThrow(/expired/);
  });

  it("rejects missing, malformed, unknown and revoked tokens", async () => {
    await expect(tally.authAgent(db, null)).rejects.toThrow(/token/);
    await expect(tally.authAgent(db, "Bearer nope")).rejects.toThrow(/token/);
    await expect(tally.authAgent(db, `Bearer fhta_${"0".repeat(64)}`)).rejects.toThrow(/removed|Pair/);
    const { token, agent } = await paired(db);
    await tally.revokeAgent(db, ctx, agent.id);
    await expect(tally.authAgent(db, `Bearer ${token}`)).rejects.toThrow(/removed/);
  });

  it("revoking in one firm cannot touch another firm's agent", async () => {
    const { token, agent } = await paired(db);
    await tally.revokeAgent(db, { ...ctx, firmId: "other" }, agent.id);
    await expect(tally.authAgent(db, `Bearer ${token}`)).resolves.toHaveProperty("id");
  });

  it("stores a snapshot with debit-positive balances, then calls an identical resend unchanged", async () => {
    const { agent } = await paired(db);
    const first = await tally.ingestSnapshot(db, agent, snapshot("2026-09-30"));
    expect(first.status).toBe("synced");
    const stored = db.tables["ca_tally_snapshots"][0].ledgers as { name: string; closing: number }[];
    expect(stored.find((l) => l.name === "HDFC")!.closing).toBe(100000);
    expect((await tally.ingestSnapshot(db, agent, snapshot("2026-09-30"))).status).toBe("unchanged");
    expect(db.tables["ca_tally_snapshots"]).toHaveLength(1);
    // a changed balance replaces it rather than adding a second row for the same date
    const changed = snapshot("2026-09-30", { ledgers: [{ name: "HDFC", parent: "Bank Accounts", closing: -90000 }, { name: "Capital", parent: "Capital Account", closing: 90000 }] });
    expect((await tally.ingestSnapshot(db, agent, changed)).status).toBe("synced");
    expect(db.tables["ca_tally_snapshots"]).toHaveLength(1);
  });

  it("rejects a financial year that does not contain the date", async () => {
    const { agent } = await paired(db);
    await expect(tally.ingestSnapshot(db, agent, snapshot("2027-04-30"))).rejects.toThrow(/April to March/);
  });

  it("pauses without storing when sync is switched off", async () => {
    const { agent } = await paired(db);
    await tally.ingestSnapshot(db, agent, snapshot("2026-08-31"));
    const company = db.tables["ca_tally_companies"][0];
    await tally.setCompanySync(db, ctx, company.id as string, false);
    expect((await tally.ingestSnapshot(db, agent, snapshot("2026-09-30"))).status).toBe("paused");
    expect(db.tables["ca_tally_snapshots"]).toHaveLength(1);
  });

  it("links a company to one client only, and logs the sync for a linked client", async () => {
    const { agent } = await paired(db);
    await tally.ingestCompanies(db, agent, { companies: [{ name: "Kaveri Traders" }, { name: "Other Co" }] });
    const [a, b] = db.tables["ca_tally_companies"];
    await tally.linkCompany(db, ctx, a.id as string, CLIENT);
    await expect(tally.linkCompany(db, ctx, b.id as string, CLIENT)).rejects.toThrow(/already linked/);
    await tally.ingestSnapshot(db, agent, snapshot("2026-09-30"));
    expect(db.tables["ca_activity_log"]?.some((r) => String(r.description).startsWith("Tally sync:"))).toBe(true);
    await expect(tally.linkCompany(db, { ...ctx, firmId: "other" }, a.id as string, null)).rejects.toThrow(/not found/i);
  });

  it("builds statements for the linked client, newest snapshot by default, and the monthly trend", async () => {
    const { agent } = await paired(db);
    const pl = (apr: number) => ({
      groups: [{ name: "Bank Accounts", parent: "Current Assets" }],
      ledgers: [
        { name: "HDFC", parent: "Bank Accounts", closing: -apr },
        { name: "Sales", parent: "Sales Accounts", closing: apr },
      ],
    });
    await tally.ingestSnapshot(db, agent, snapshot("2026-04-30", pl(100000)));
    await tally.ingestSnapshot(db, agent, snapshot("2026-05-31", pl(250000)));
    expect(await tally.statements(db, ctx, CLIENT)).toEqual({ linked: false });
    await tally.linkCompany(db, ctx, db.tables["ca_tally_companies"][0].id as string, CLIENT);
    const r = await tally.statements(db, ctx, CLIENT);
    if (!r.linked || !r.snapshot) throw new Error("expected a snapshot");
    expect(r.snapshot.asOn).toBe("2026-05-31");
    expect(r.available).toEqual(["2026-05-31", "2026-04-30"]);
    expect(r.snapshot.pl.revenueTotal).toBe(250000);
    expect(r.snapshot.monthly.map((m) => m.revenue)).toEqual([100000, 150000]);
    const apr = await tally.statements(db, ctx, CLIENT, "2026-04-30");
    expect(apr.linked && apr.snapshot?.pl.revenueTotal).toBe(100000);
  });

  describe("Day Book to Recon", () => {
    const XML = "<ENVELOPE><VOUCHER><DATE>20260915</DATE></VOUCHER></ENVELOPE>";
    const book = (extra: Record<string, unknown> = {}) => ({ kind: "daybook" as const, company: "Kaveri Traders", from: "2026-09-01", to: "2026-09-30", xml: XML, ...extra });

    it("waits, without filing anything, until the company is linked to a client", async () => {
      const { agent } = await paired(db);
      const r = await tally.ingestDaybook(db, agent, book());
      expect(r.status).toBe("waiting");
      expect(registered).toHaveLength(0);
    });

    it("files a linked company's Day Book as the client's books-side document", async () => {
      const { agent } = await paired(db);
      await tally.ingestCompanies(db, agent, { companies: [{ name: "Kaveri Traders" }] });
      await tally.linkCompany(db, ctx, db.tables["ca_tally_companies"][0].id as string, CLIENT);
      const r = await tally.ingestDaybook(db, agent, book());
      expect(r.status).toBe("synced");
      expect(registered).toHaveLength(1);
      expect(registered[0]).toMatchObject({ side: "books", channel: "Tally", business_id: CLIENT, mime: "application/xml" });
      expect(String(registered[0].storage_path)).toMatch(new RegExp(`^firm1/${CLIENT}/tally/.*2026-09-01_2026-09-30\\.xml$`));
      expect(db.tables["ca_activity_log"]?.some((x) => String(x.description).includes("Day Book"))).toBe(true);
    });

    it("does nothing for an identical resend, and reads a changed one in place", async () => {
      const { agent } = await paired(db);
      await tally.ingestCompanies(db, agent, { companies: [{ name: "Kaveri Traders" }] });
      const company = db.tables["ca_tally_companies"][0];
      await tally.linkCompany(db, ctx, company.id as string, CLIENT);
      const path = `firm1/${CLIENT}/tally/${company.id}-2026-09-01_2026-09-30.xml`;
      db.tables["ca_document_extractions"] = [{ id: "d1", ca_firm_id: "firm1", storage_path: path, content_hash: await sha256Hex(new TextEncoder().encode(XML)) }];
      expect((await tally.ingestDaybook(db, agent, book())).status).toBe("unchanged");
      expect(registered).toHaveLength(0);
      const changed = book({ xml: XML.replace("20260915", "20260916") });
      expect((await tally.ingestDaybook(db, agent, changed)).status).toBe("synced");
      expect(registered).toHaveLength(0); // updated the existing document, did not add a second
      expect(db.tables["ca_document_extractions"]).toHaveLength(1);
      expect(db.tables["ca_document_extractions"][0].extract_status).toBe("queued");
    });

    it("tells the agent when the firm's plan is paused instead of failing", async () => {
      const { agent } = await paired(db);
      await tally.ingestCompanies(db, agent, { companies: [{ name: "Kaveri Traders" }] });
      await tally.linkCompany(db, ctx, db.tables["ca_tally_companies"][0].id as string, CLIENT);
      registerFails.code = "billing_paused";
      expect((await tally.ingestDaybook(db, agent, book())).status).toBe("paused");
    });
  });
});
