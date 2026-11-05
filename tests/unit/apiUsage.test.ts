import { describe, expect, it } from "vitest";
import { apiUsage } from "@/lib/admin/apiUsage.server";

type Q = { data: unknown[] | null; error: { message: string } | null };
const chain = (result: (cols: string) => Q) => (cols: string) => {
  const q: Record<string, unknown> = {};
  const self = new Proxy(q, { get: (_t, p) => (p === "then" ? (res: (v: Q) => void) => res(result(cols)) : () => self) });
  return self;
};
function fakeCtx(opts: { costColumns: boolean }) {
  const now = new Date().toISOString();
  const calls = [
    { ca_firm_id: "f1", purpose: "extract_read_image", provider: "gemini", model: "gemini-flash-latest", status: "success", latency_ms: 2000, created_at: now, input_tokens: 1000, output_tokens: 200, cost_usd: 0.0008, units: null },
    { ca_firm_id: "f1", purpose: "extract_ocr", provider: "ocr.space", model: null, status: "error", latency_ms: 900, created_at: now, input_tokens: null, output_tokens: null, cost_usd: 0, units: 1 },
  ];
  const db = {
    from: (table: string) => ({
      select: chain((cols) => {
        if (table === "ca_ai_calls") return /cost_usd/.test(cols) && !opts.costColumns ? { data: null, error: { message: 'column "cost_usd" does not exist' } } : { data: calls, error: null };
        if (table === "ca_firms") return { data: [{ id: "f1", firm_name: "Rao & Co" }], error: null };
        if (table === "ai_usage_logs") return { data: [{ cost_usd: 0.01, status: "success", response_time_ms: 1000, created_at: now }], error: null };
        return { data: [{ whatsapp_template: "fh_account_update", whatsapp_sent_at: now }], error: null };
      }),
    }),
  };
  return { db } as never;
}

describe("admin API usage", () => {
  it("adds up calls, tokens, cost, firms and WhatsApp", async () => {
    const r = await apiUsage(fakeCtx({ costColumns: true }), 30);
    expect(r.costTracking).toBe(true);
    expect(r.document).toMatchObject({ calls: 2, failed: 1, tokensIn: 1000, tokensOut: 200, ocrCalls: 1 });
    expect(r.document.costUsd).toBeCloseTo(0.0008, 6);
    expect(r.chat.costUsd).toBeCloseTo(0.01, 6);
    expect(r.topFirms[0]).toMatchObject({ name: "Rao & Co", calls: 2 });
    expect(r.whatsapp.byTemplate["fh_account_update"]).toBe(1);
  });
  it("still works, and says so, before the cost migration is applied", async () => {
    const r = await apiUsage(fakeCtx({ costColumns: false }), 30);
    expect(r.costTracking).toBe(false);
    expect(r.document.calls).toBe(2);
  });
});
