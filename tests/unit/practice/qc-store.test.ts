// @vitest-environment node
import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { confirmLedgers, lockPeriod, logAccess, periodStatus } from "@/lib/practice/qcStore.server";
import type { FirmContext } from "@/lib/practice/db.server";

const ctx = (role: string): FirmContext => ({ firmId: "f", firmName: "F", firmEmail: null, userId: "u", role } as FirmContext);

describe("QC store", () => {
  it("lets only a partner or manager confirm the ledger map, and saves it once per ledger", async () => {
    const { db, tables } = memoryDb();
    await expect(confirmLedgers(db, ctx("junior"), "b", [{ ledger: "Input CGST", family: "input_tax" }])).rejects.toThrow(/partner or manager/);
    await confirmLedgers(db, ctx("manager"), "b", [{ ledger: "Input CGST", family: "input_tax", gst_head: "cgst" }]);
    await confirmLedgers(db, ctx("manager"), "b", [{ ledger: "Input CGST", family: "input_tax_carry_forward", gst_head: "cgst" }]);
    const rows = tables["ca_ledger_map"] as { ledger: string; family: string; confirmed_by: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ledger: "Input CGST", family: "input_tax_carry_forward", confirmed_by: "u" });
    // The confirmation itself is in the access log.
    expect((tables["ca_access_log"] as { subject: string }[]).some((l) => /ledger map confirmed/.test(l.subject))).toBe(true);
  });

  it("locks a month with the fingerprint of the documents, and calls the lock stale when one changes", async () => {
    const { db, tables } = memoryDb({ ca_document_extractions: [{ id: "d1", ca_firm_id: "f", business_id: "b", content_hash: "aaa", extract_status: "parsed" }] });
    await expect(lockPeriod(db, ctx("manager"), "b", "2025-05")).rejects.toThrow(/partner/);
    expect(await periodStatus(db, ctx("partner"), "b", "2025-05")).toMatchObject({ locked: false });
    await lockPeriod(db, ctx("partner"), "b", "2025-05");
    expect(await periodStatus(db, ctx("partner"), "b", "2025-05")).toMatchObject({ locked: true, stale: false });
    (tables["ca_document_extractions"] as { content_hash: string }[])[0]!.content_hash = "bbb";
    expect(await periodStatus(db, ctx("partner"), "b", "2025-05")).toMatchObject({ locked: true, stale: true });
    // A new document also makes it stale.
    (tables["ca_document_extractions"] as { content_hash: string }[])[0]!.content_hash = "aaa";
    (tables["ca_document_extractions"] as unknown[]).push({ id: "d2", ca_firm_id: "f", business_id: "b", content_hash: "ccc", extract_status: "parsed" });
    expect((await periodStatus(db, ctx("partner"), "b", "2025-05")).stale).toBe(true);
  });

  it("records reads, downloads and exports, and never blocks the action when the log cannot be written", async () => {
    const { db, tables } = memoryDb();
    await logAccess(db, ctx("partner"), "download", "document: statement.pdf", "b", { document_id: "d1" });
    expect(tables["ca_access_log"]).toEqual([expect.objectContaining({ ca_firm_id: "f", user_id: "u", action: "download", subject: "document: statement.pdf" })]);
    const broken = { from: () => { throw new Error("table missing"); } } as never;
    await expect(logAccess(broken, ctx("partner"), "read", "x", null)).resolves.toBeUndefined();
  });
});
