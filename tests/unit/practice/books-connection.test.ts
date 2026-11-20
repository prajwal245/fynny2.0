// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { GAPS, SUPPLY, connectionState, suppliedNow } from "@/lib/practice/books/capabilities";
import { INPUTS } from "@/lib/practice/readiness/model";
import { booksConnection, syncBooksNow } from "@/lib/practice/booksConnection.server";
import { getInputStates } from "@/lib/practice/qcStore.server";
import type { FirmContext } from "@/lib/practice/db.server";

const ctx = { firmId: "f", firmName: "F", firmEmail: null, userId: "u", role: "manager" } as FirmContext;
const NOW = new Date().toISOString();
const tallyRows = (over: Record<string, unknown> = {}) => ({
  ca_tally_companies: [{ ca_firm_id: "f", business_id: "b", company_name: "Satkaarika", connector_id: "c1", last_synced_at: NOW, last_sync_note: "Nov 2026: 120 vouchers", ...over }],
  ca_tally_connectors: [{ id: "c1", ca_firm_id: "f", name: "Office PC", last_seen_at: NOW, is_active: true, last_error: null }],
});
const month = NOW.slice(0, 7);

describe("what each system supplies", () => {
  it("names only inputs that exist, and never lists an input as both supplied and a gap", () => {
    const keys = new Set(INPUTS.map((i) => i.key));
    for (const src of ["tally", "zoho", "files"] as const) {
      for (const s of SUPPLY[src]) expect(keys.has(s.input), `${src} supplies ${s.input}`).toBe(true);
      for (const g of GAPS[src]) { expect(keys.has(g.input)).toBe(true); expect(SUPPLY[src].some((s) => s.input === g.input), `${src} ${g.input}`).toBe(false); }
    }
  });
  it("fills a monthly input only for a month the sync reaches, and a one-time input once it has synced", () => {
    const c = { connected: true, lastSyncedAt: "2026-11-12T10:00:00Z" };
    expect(suppliedNow("tally", c, "2026-11")).toEqual(["day_book", "registers", "gst_ledgers"]);
    expect(suppliedNow("tally", c, "2026-12")).toEqual([]);
    expect(suppliedNow("zoho", c, "2027-03")).toEqual(["billwise_outstanding"]);
    expect(suppliedNow("tally", { connected: false, lastSyncedAt: c.lastSyncedAt }, "2026-11")).toEqual([]);
    expect(suppliedNow("tally", { connected: true, lastSyncedAt: null }, "2026-11")).toEqual([]);
  });
  it("says live, stale, waiting, none or error", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(connectionState({ connected: true, online: true, lastSyncedAt: "2026-11-20T08:00:00Z" }, now)).toBe("live");
    expect(connectionState({ connected: true, online: true, lastSyncedAt: "2026-11-18T08:00:00Z" }, now)).toBe("stale");
    expect(connectionState({ connected: true, online: false, lastSyncedAt: null }, now)).toBe("waiting");
    expect(connectionState({ connected: false, online: false, lastSyncedAt: null }, now)).toBe("none");
    expect(connectionState({ connected: true, online: true, lastSyncedAt: "2026-11-20T08:00:00Z", error: "x" }, now)).toBe("error");
  });
});

describe("the books connection of a client", () => {
  it("reads a Tally client as live, with what it supplies and what it cannot", async () => {
    const { db } = memoryDb(tallyRows());
    const c = await booksConnection(db, ctx, "b", month);
    expect(c).toMatchObject({ source: "tally", state: "live", online: true, supplies: ["day_book", "registers", "gst_ledgers"] });
    expect(c.gaps.map((g) => g.input)).toContain("tb_opening");
  });
  it("calls a connector that has gone quiet offline, and still shows the last sync", async () => {
    const { db } = memoryDb({ ...tallyRows(), ca_tally_connectors: [{ id: "c1", ca_firm_id: "f", name: "PC", last_seen_at: "2020-01-01T00:00:00Z", is_active: true }] });
    const c = await booksConnection(db, ctx, "b", month);
    expect(c.online).toBe(false);
    expect(c.lastSyncedAt).toBe(NOW);
  });
  it("reads a Zoho client from its link and connection status, and an unlinked client as files", async () => {
    const zoho = memoryDb({ ca_zoho_links: [{ id: "z1", ca_firm_id: "f", business_id: "b", account_name: "HDFC", last_synced_at: NOW, last_sync_note: "ok" }], ca_zoho_connections: [{ ca_firm_id: "f", status: "connected" }] });
    expect(await booksConnection(zoho.db, ctx, "b", month)).toMatchObject({ source: "zoho", state: "live", zohoLinkId: "z1", supplies: ["billwise_outstanding"] });
    const none = memoryDb();
    expect(await booksConnection(none.db, ctx, "b", month)).toMatchObject({ source: "files", state: "none", supplies: [] });
    const broken = memoryDb({ ca_zoho_links: [{ id: "z1", ca_firm_id: "f", business_id: "b", account_name: "HDFC", last_synced_at: NOW }], ca_zoho_connections: [{ ca_firm_id: "f", status: "error", last_error: "Token revoked" }] });
    expect(await booksConnection(broken.db, ctx, "b", month)).toMatchObject({ state: "error", error: "Token revoked" });
  });
  it("never reads another firm's company mapping", async () => {
    const { db } = memoryDb(tallyRows({ ca_firm_id: "other" }));
    expect((await booksConnection(db, ctx, "b", month)).source).toBe("files");
  });
});

describe("the sync button", () => {
  it("asks the Tally connector for the month, and says when the connector is offline", async () => {
    const { db, tables } = memoryDb(tallyRows());
    const r = await syncBooksNow(db, ctx, "b", month);
    expect(r).toMatchObject({ source: "tally", mode: "queued" });
    expect((tables["ca_tally_connectors"] as { sync_requested_at?: string; sync_months?: string[] }[])[0]).toMatchObject({ sync_months: [month] });
    const off = memoryDb({ ...tallyRows(), ca_tally_connectors: [{ id: "c1", ca_firm_id: "f", name: "PC", last_seen_at: null, is_active: true }] });
    expect((await syncBooksNow(off.db, ctx, "b", month)).note).toMatch(/not checking in/);
  });
  it("refuses plainly when no system is connected", async () => {
    await expect(syncBooksNow(memoryDb().db, ctx, "b", month)).rejects.toThrow(/Connect Tally or Zoho/);
  });
});

describe("readiness takes what the books system supplies", () => {
  it("marks the Day Book, registers and GST ledgers received from the Tally connector, with the company as the source", async () => {
    const { db } = memoryDb(tallyRows());
    const { inputs } = await getInputStates(db, ctx, "b", month, "2026-27");
    for (const k of ["day_book", "registers", "gst_ledgers"]) expect(inputs[k]).toMatchObject({ status: "received", source: "connector", note: "Tally · Satkaarika" });
    expect(inputs["tb_opening"]).toBeUndefined();
  });
  it("does not take a Zoho bank ledger for a Day Book", async () => {
    const { db } = memoryDb({ ca_document_extractions: [{ ca_firm_id: "f", business_id: "b", extract_status: "parsed", created_at: NOW, classification: "document", side: "books", extracted: { source: "Zoho Books" } }] });
    const { inputs } = await getInputStates(db, ctx, "b", month, "2026-27");
    expect(inputs["day_book"]).toBeUndefined();
  });
  it("leaves the inputs blocked when the books were last synced before the month", async () => {
    const { db } = memoryDb(tallyRows({ last_synced_at: "2020-01-05T00:00:00Z" }));
    const { inputs } = await getInputStates(db, ctx, "b", month, "2026-27");
    expect(inputs["day_book"]).toBeUndefined();
  });
});
void vi;
