// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
vi.mock("@/lib/practice/orchestrator.server", () => ({ startRun: async () => "r", finishRun: async () => undefined, afterExtraction: async () => ({ pipeline: [] }), afterRecon: async () => false, loadMemories: async () => [], markMemoriesApplied: async () => undefined, teachFromReview: async () => undefined }));
vi.mock("@/lib/practice/llm.server", () => ({ practiceLlm: () => null, withinAiCap: async () => false, residencyIndiaOnly: () => false }));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));
// Runs only where the client's real files are available (SATKAARIKA_DIR holds `real/` and `retest/`); skipped in CI.
const BASE = process.env.SATKAARIKA_DIR ?? "";
const have = !!BASE && existsSync(`${BASE}/real`);
it.skipIf(!have)("satkaarika end to end: every screen agrees with the uploaded files", async () => {
  const files: [string, string][] = [];
  for (const d of ["real", "retest"]) for (const f of readdirSync(`${BASE}/${d}`)) if (f.startsWith("Satkaarika")) files.push([`${BASE}/${d}/${f}`, f.split("||").slice(1).join("||")]);
  const guessSide = (n: string) => (/Day Book|Ledger|Register|AIS|3CD|Challans/.test(n) ? "books" : "bank");
  const docs = files.map(([, n], i) => ({ id: `d${i + 1}`, ca_firm_id: "f1", business_id: "b1", original_filename: n, storage_path: `f1/b1/${i}-${n}`, side: guessSide(n), extract_status: null, extract_attempts: 0, extracted: { source: /Day Book|Ledger/.test(n) ? "Tally" : "Manual" }, uploaded_by: "u1", created_at: "2026-11-20T10:00:00Z" }));
  const blobs = Object.fromEntries(files.map(([p], i) => [`f1/b1/${i}-${files[i]![1]}`, new Uint8Array(readFileSync(p))]));
  const { db, tables } = memoryDb({ ca_document_extractions: docs, ca_clients: [{ id: "row1", business_id: "b1", ca_firm_id: "f1", client_name: "Satkaarika Enterprises Pvt Ltd" }] }, blobs);
  const { processExtraction } = await import("@/lib/practice/documents.server");
  for (const d of docs) { try { await processExtraction(db, d.id, { trigger: "user", userId: "u1" }); } catch (e) { console.log("E2E extract ERR", d.original_filename, (e as Error).message); } }
  const rows = (tables["ca_document_extractions"] ?? []) as Record<string, unknown>[];
  for (const r of rows) console.log("E2E doc", String(r["original_filename"]).slice(0, 46).padEnd(46), "|", r["side"], "|", r["classification"], "|", r["extract_status"], "| kind", (r["extracted"] as { kind?: string; register?: { kind?: string } })?.register?.kind ?? "");
  for (const r of rows) { const sc = (r["extracted"] as { statement_check?: { status?: string; first?: string; last?: string } })?.statement_check; if (/loan/i.test(String(r["original_filename"]))) console.log("E2E loansc", r["original_filename"], JSON.stringify(sc ? [sc.status, sc.first, sc.last] : null)); }
  const ctx = { firmId: "f1", firmName: "F", firmEmail: null, userId: "u1", role: "owner" as const };
  const { getInputStates } = await import("@/lib/practice/qcStore.server");
  for (const [m, fy] of [["2025-12", "2025-26"], ["2026-11", "2026-27"]] as const) {
    const st = await getInputStates(db, ctx, "b1", m, fy);
    if (m === "2025-12") { expect(st.inputs["day_book"]?.status).toBe("received"); expect(st.inputs["bank_statements"]?.status).toBe("received"); }
    console.log("E2E inputs", m, Object.entries(st.inputs).filter(([, v]) => v?.status === "received").map(([k, v]) => `${k}${v?.note ? `(${v.note})` : ""}`).join(" ; "));
  }
  const { loadVouchers } = await import("@/lib/practice/reviewChecks.server");
  const v = await loadVouchers(db, ctx, "b1");
  expect(v.files).toBe(1); // ledger extracts are not Day Books
  expect(v.vouchers.length).toBeLessThan(4400); // the same voucher is counted once
  const { getLedgerMap } = await import("@/lib/practice/qcStore.server");
  const lm = await getLedgerMap(db, ctx, "b1");
  expect(lm.rows.length).toBeGreaterThan(0);
  const { clientClose } = await import("@/lib/practice/close/close.server");
  for (const mo of ["2025-04","2025-09","2026-01","2026-03"]) { const c2 = await clientClose(db, ctx, "b1", mo); console.log("E2E close", mo, JSON.stringify(c2?.statements.map((s) => [s.filename.slice(0, 18), s.verification.result, s.verification.held]))); }
  const { runRecon } = await import("@/lib/practice/recon.server");
  for (const mo of [["2025-12-01","2025-12-31"]]) {
    const r1 = await runRecon(db, ctx, "b1", { start: mo[0]!, end: mo[1]! });
    const tx = (tables["ca_txns"] ?? []) as Record<string, unknown>[];
    const inM = tx.filter((t) => String(t["txn_date"]) >= mo[0]! && String(t["txn_date"]) <= mo[1]!);
    const books = inM.filter((t) => t["side"] === "books");
    const cnt = (f: (t: Record<string, unknown>) => boolean) => books.filter(f).length;
    console.log("E2E recon", r1.message?.slice(0, 220));
    console.log("E2E dec books", books.length, "awaiting", cnt((t) => t["recon_tag"] === "awaiting_statement"), "needs matching", cnt((t) => t["match_status"] !== "matched" && t["match_status"] !== "ignored"), "ignored-other", cnt((t) => t["match_status"] === "ignored" && t["recon_tag"] !== "awaiting_statement"));
    const r2 = await runRecon(db, ctx, "b1", { start: mo[0]!, end: mo[1]! });
    const tx2 = (tables["ca_txns"] ?? []) as Record<string, unknown>[];
    console.log("E2E dec again awaiting", tx2.filter((t) => t["side"] === "books" && t["recon_tag"] === "awaiting_statement" && String(t["txn_date"]).startsWith("2025-12")).length, r2.message?.slice(0, 80));
  }
  const cc = await clientClose(db, ctx, "b1", "2025-12");
  expect(cc?.statements.some((s) => /loan/i.test(s.filename))).toBe(false); // loan statements are registers, not bank statements
  console.log("E2E close steps", JSON.stringify(cc?.steps.map((s) => [s.key, s.status])));
}, 600000);
