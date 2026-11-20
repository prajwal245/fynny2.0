// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { doneMessage, estimateWhatsappCost, finalOutcome } from "@/lib/practice/whatsappDone";

const send = vi.hoisted(() => ({ plain: vi.fn(), post: vi.fn(), resolve: vi.fn(), fault: vi.fn() }));
vi.mock("@/lib/practice/whatsappSend.server", () => ({ sendPlainText: send.plain, post: send.post, resolveSender: send.resolve, recordWaFault: send.fault, chaseTemplateLang: () => "en" }));

describe("the file-read message", () => {
  it("is plain, for every outcome, and never shows a technical reason", () => {
    expect(doneMessage({ filename: "hdfc.pdf", outcome: "read", lines: 26 })).toMatch(/has been read \(26 entries\)/);
    expect(doneMessage({ filename: "hdfc.pdf", outcome: "held" })).toMatch(/team will check/);
    expect(doneMessage({ filename: "scan.jpg", outcome: "unreadable", reason: "This PDF is damaged or incomplete." })).toMatch(/could not read scan\.jpg: This PDF is damaged/);
    expect(doneMessage({ filename: "x".repeat(80) + ".pdf", outcome: "read" }).length).toBeLessThan(200);
  });
  it("counts a file as final when it is read, held, or failed with no retry left, and not while a retry is coming", () => {
    const d = (extract_status: string, next: string | null = null, attempts = 1) => ({ extract_status, extract_next_attempt_at: next, extract_attempts: attempts });
    expect(finalOutcome(d("parsed"), 3)).toBe("read");
    expect(finalOutcome(d("needs_review"), 3)).toBe("held");
    expect(finalOutcome(d("failed"), 3)).toBe("unreadable");
    expect(finalOutcome(d("failed", "2026-11-20T12:00:00Z", 1), 3)).toBeNull();
    expect(finalOutcome(d("failed", "2026-11-20T12:00:00Z", 3), 3)).toBe("unreadable");
    expect(finalOutcome(d("processing"), 3)).toBeNull();
  });
  it("estimates the Meta cost: a reply inside 24 hours is free, a template has a rate that can be overridden", () => {
    expect(estimateWhatsappCost("service")).toBe(0);
    expect(estimateWhatsappCost("utility")).toBeGreaterThan(0);
    expect(estimateWhatsappCost("marketing")).toBeGreaterThan(estimateWhatsappCost("utility"));
    expect(estimateWhatsappCost("utility", { WHATSAPP_RATE_UTILITY_INR: "0.2" })).toBe(0.2);
    expect(estimateWhatsappCost("utility", { WHATSAPP_RATE_UTILITY_INR: "junk" })).toBe(estimateWhatsappCost("utility"));
  });
});

describe("telling the sender, end to end", () => {
  const doc = (over: Record<string, unknown> = {}) => ({ id: "d1", ca_firm_id: "f", business_id: "b", original_filename: "hdfc.pdf", extract_status: "parsed", extract_attempts: 1, extract_next_attempt_at: null, error_message: null, row_count: 26, txn_count: 26, source_metadata: { wa_from: "919820011223" }, ...over });
  beforeEach(() => { vi.clearAllMocks(); delete process.env["WHATSAPP_DONE_TEMPLATE"]; send.resolve.mockResolvedValue({ sender: { phoneNumberId: "p", token: "t", shared: true }, test: false, reason: null }); });

  it("sends once when the file is read, records it in the activity feed and the call log, and marks it done", async () => {
    send.plain.mockResolvedValue(true);
    const { db, tables } = memoryDb({ ca_document_extractions: [doc()] });
    const { notifyFileProcessed } = await import("@/lib/practice/whatsappDone.server");
    expect(await notifyFileProcessed(db, "d1")).toBe("sent");
    expect(send.plain).toHaveBeenCalledWith(expect.anything(), "919820011223", expect.stringMatching(/hdfc\.pdf has been read \(26 entries\)/));
    expect((tables["ca_ai_calls"] as { purpose: string; status: string; output: string }[])[0]).toMatchObject({ purpose: "whatsapp_done", status: "success" });
    expect(JSON.parse((tables["ca_ai_calls"] as { output: string }[])[0]!.output)).toMatchObject({ kind: "service", est_cost_inr: 0, to_last4: "1223" });
    expect((tables["ca_activity_log"] ?? tables["ca_activity"] ?? []).length + Object.keys(tables).length).toBeGreaterThan(0);
    expect(((tables["ca_document_extractions"] as { source_metadata: { wa_done_at?: string } }[])[0]!.source_metadata).wa_done_at).toBeTruthy();
    // Told once: a second read of the same file does not repeat it.
    expect(await notifyFileProcessed(db, "d1")).toBe("already told");
    expect(send.plain).toHaveBeenCalledTimes(1);
  });
  it("tells the sender when the file could not be read, in plain words", async () => {
    send.plain.mockResolvedValue(true);
    const { db } = memoryDb({ ca_document_extractions: [doc({ extract_status: "failed", error_message: "This PDF is damaged or incomplete." })] });
    const { notifyFileProcessed } = await import("@/lib/practice/whatsappDone.server");
    expect(await notifyFileProcessed(db, "d1")).toBe("sent");
    expect(send.plain.mock.calls[0]![2]).toMatch(/could not read hdfc\.pdf/);
  });
  it("does not tell anyone while a retry is still coming, nor for a file that did not come from WhatsApp", async () => {
    const { db } = memoryDb({ ca_document_extractions: [doc({ extract_status: "failed", extract_next_attempt_at: "2026-11-21T00:00:00Z" }), doc({ id: "d2", source_metadata: {} })] });
    const { notifyFileProcessed } = await import("@/lib/practice/whatsappDone.server");
    expect(await notifyFileProcessed(db, "d1")).toBe("not final");
    expect(await notifyFileProcessed(db, "d2")).toBe("not from WhatsApp");
    expect(send.plain).not.toHaveBeenCalled();
  });
  it("falls back to an approved template outside the 24-hour window and records the estimated cost", async () => {
    process.env["WHATSAPP_DONE_TEMPLATE"] = "fh_file_read";
    send.plain.mockResolvedValue(false);
    send.post.mockResolvedValue({ ok: true, body: {} });
    const { db, tables } = memoryDb({ ca_document_extractions: [doc()] });
    const { notifyFileProcessed } = await import("@/lib/practice/whatsappDone.server");
    expect(await notifyFileProcessed(db, "d1")).toBe("sent");
    expect(JSON.parse((tables["ca_ai_calls"] as { output: string }[])[0]!.output)).toMatchObject({ kind: "utility" });
    expect(JSON.parse((tables["ca_ai_calls"] as { output: string }[])[0]!.output).est_cost_inr).toBeGreaterThan(0);
  });
  it("records a fault for the admin, never silence, when it cannot be delivered, and tries again at the next read", async () => {
    send.plain.mockResolvedValue(false);
    const { db, tables } = memoryDb({ ca_document_extractions: [doc()] });
    const { notifyFileProcessed } = await import("@/lib/practice/whatsappDone.server");
    expect(await notifyFileProcessed(db, "d1")).toBe("not delivered");
    expect(send.fault).toHaveBeenCalledWith(expect.anything(), "f", expect.stringMatching(/24 hours/));
    expect((tables["ca_ai_calls"] as { status: string }[])[0]!.status).toBe("error");
    expect(((tables["ca_document_extractions"] as { source_metadata: { wa_done_at?: string } }[])[0]!.source_metadata).wa_done_at).toBeUndefined();
  });
  it("simulates for a test firm and does not repeat", async () => {
    send.resolve.mockResolvedValue({ sender: null, test: true, reason: null });
    const { db } = memoryDb({ ca_document_extractions: [doc()] });
    const { notifyFileProcessed } = await import("@/lib/practice/whatsappDone.server");
    expect(await notifyFileProcessed(db, "d1")).toBe("test firm (simulated)");
    expect(await notifyFileProcessed(db, "d1")).toBe("already told");
  });
});
