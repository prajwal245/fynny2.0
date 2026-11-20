// @vitest-environment node
import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { getInputStates, markInput } from "@/lib/practice/qcStore.server";
import type { FirmContext } from "@/lib/practice/db.server";

const ctx = (firmId = "f"): FirmContext => ({ firmId, firmName: "F", firmEmail: null, userId: "u", role: "manager" } as FirmContext);
const doc = (o: Record<string, unknown>) => ({ ca_firm_id: "f", business_id: "b", extract_status: "parsed", created_at: "2026-11-05T10:00:00Z", classification: "document", side: "bank", extracted: {}, ...o });

describe("what has arrived, from documents and from people", () => {
  it("reads inputs from documents by what they are, and counts a monthly document only from the first of the month", async () => {
    const { db } = memoryDb({ ca_document_extractions: [
      doc({ classification: "bank_statement" }),
      doc({ extracted: { register: { kind: "gstr2b" } } }),
      doc({ extracted: { register: { kind: "loan_statement" } } }),
      doc({ side: "books" }),
      doc({ extracted: { register: { kind: "tally_masters" } }, created_at: "2026-02-01T00:00:00Z" }),
      doc({ classification: "bank_statement", created_at: "2026-10-20T00:00:00Z", id: "old" }),
    ] });
    const { inputs } = await getInputStates(db, ctx(), "b", "2026-11", "2026-27");
    expect(Object.keys(inputs).sort()).toEqual(["bank_statements", "day_book", "gstr2b", "ledger_masters", "loan_statements"]);
    // The masters are a year-onboarding item: an older document still counts. The October bank statement does not make November's pack complete.
    expect(inputs["ledger_masters"]?.source).toBe("detected");
    const dec = await getInputStates(db, ctx(), "b", "2026-12", "2026-27");
    expect(dec.inputs["bank_statements"]).toBeUndefined();
    expect(dec.inputs["ledger_masters"]).toBeDefined();
  });

  it("scopes a person's mark: a monthly item to its month, a year item to the whole year", async () => {
    const { db } = memoryDb();
    await markInput(db, ctx(), "b", "ims", "2026-11", "2026-27", "received");
    await markInput(db, ctx(), "b", "asset_register", "2026-11", "2026-27", "received");
    const nov = await getInputStates(db, ctx(), "b", "2026-11", "2026-27");
    const dec = await getInputStates(db, ctx(), "b", "2026-12", "2026-27");
    expect(nov.inputs["ims"]?.status).toBe("received");
    expect(dec.inputs["ims"]).toBeUndefined();
    expect(nov.inputs["asset_register"]?.status).toBe("received");
    expect(dec.inputs["asset_register"]?.status).toBe("received");
    const next = await getInputStates(db, ctx(), "b", "2027-04", "2027-28");
    expect(next.inputs["asset_register"]).toBeUndefined();
  });

  it("needs a reason for 'not applicable', refuses an unknown input, and lets a person undo a mark", async () => {
    const { db } = memoryDb();
    await expect(markInput(db, ctx(), "b", "loan_statements", "2026-11", "2026-27", "not_applicable", "  ")).rejects.toThrow(/why/i);
    await expect(markInput(db, ctx(), "b", "nonsense", "2026-11", "2026-27", "received")).rejects.toThrow(/Unknown/);
    await markInput(db, ctx(), "b", "loan_statements", "2026-11", "2026-27", "not_applicable", "No loans");
    expect((await getInputStates(db, ctx(), "b", "2026-11", "2026-27")).inputs["loan_statements"]).toMatchObject({ status: "not_applicable", note: "No loans", source: "marked" });
    await markInput(db, ctx(), "b", "loan_statements", "2026-11", "2026-27", "missing");
    expect((await getInputStates(db, ctx(), "b", "2026-11", "2026-27")).inputs["loan_statements"]).toBeUndefined();
  });

  it("marks one row per input and period, and writes the change to the access log", async () => {
    const { db, tables } = memoryDb();
    await markInput(db, ctx(), "b", "ims", "2026-11", "2026-27", "received");
    await markInput(db, ctx(), "b", "ims", "2026-11", "2026-27", "not_applicable", "Not registered for IMS");
    expect(tables["ca_input_status"]).toHaveLength(1);
    expect((tables["ca_access_log"] as { subject: string }[]).some((l) => /input marked not_applicable: ims/.test(l.subject))).toBe(true);
  });

  it("never shows another firm's documents or marks", async () => {
    const { db } = memoryDb({
      ca_document_extractions: [doc({ ca_firm_id: "other", classification: "bank_statement" })],
      ca_input_status: [{ ca_firm_id: "other", business_id: "b", input_key: "ims", period: "2026-11", status: "received" }],
    });
    expect((await getInputStates(db, ctx("f"), "b", "2026-11", "2026-27")).inputs).toEqual({});
  });
});
