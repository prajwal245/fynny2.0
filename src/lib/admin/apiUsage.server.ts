/**
 * API usage and estimated cost for the admin panel: document-reading AI and OCR (ca_ai_calls), Fynny chat
 * (ai_usage_logs), and WhatsApp follow-ups sent. Tolerant: a missing column or table leaves that part empty,
 * and `costTracking` says whether token and cost columns exist yet (database migration 20261108100000).
 */
import type { AdminCtx } from "./security.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function rows(run: () => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<{ data: Row[]; error: string | null }> {
  try {
    const { data, error } = await run();
    return { data: data ?? [], error: error?.message ?? null };
  } catch (e) {
    return { data: [], error: (e as Error).message };
  }
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export async function apiUsage(ctx: AdminCtx, days: number) {
  const { db } = ctx;
  const d = Math.max(1, Math.min(365, Math.floor(days) || 30));
  const since = new Date(Date.now() - d * 86_400_000).toISOString();

  let costTracking = true;
  let calls = await rows(() => db.from("ca_ai_calls").select("ca_firm_id, purpose, provider, model, status, latency_ms, created_at, input_tokens, output_tokens, cost_usd, units").gte("created_at", since).order("created_at", { ascending: false }).limit(50000));
  if (calls.error && /input_tokens|output_tokens|cost_usd|units/.test(calls.error)) {
    costTracking = false;
    calls = await rows(() => db.from("ca_ai_calls").select("ca_firm_id, purpose, provider, model, status, latency_ms, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50000));
  }
  const chat = await rows(() => db.from("ai_usage_logs").select("cost_usd, status, response_time_ms, created_at").gte("created_at", since).limit(50000));
  const wa = await rows(() => db.from("ca_touchpoints").select("whatsapp_template, whatsapp_sent_at").gte("whatsapp_sent_at", since).not("whatsapp_template", "is", null).limit(20000));

  const sum = (xs: Row[], k: string) => xs.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const failed = calls.data.filter((c) => c.status === "error").length;

  const byDay = new Map<string, { calls: number; failed: number; cost: number }>();
  const byModel = new Map<string, { provider: string; model: string; purpose: string; calls: number; failed: number; tokensIn: number; tokensOut: number; cost: number; latency: number }>();
  const byFirm = new Map<string, { calls: number; failed: number; cost: number }>();
  for (const c of calls.data) {
    const day = dayOf(String(c.created_at));
    const a = byDay.get(day) ?? { calls: 0, failed: 0, cost: 0 };
    a.calls++;
    if (c.status === "error") a.failed++;
    a.cost += Number(c.cost_usd ?? 0);
    byDay.set(day, a);
    const key = `${c.provider ?? "none"}|${c.model ?? "-"}|${c.purpose ?? "-"}`;
    const m = byModel.get(key) ?? { provider: String(c.provider ?? "none"), model: String(c.model ?? "-"), purpose: String(c.purpose ?? "-"), calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, cost: 0, latency: 0 };
    m.calls++;
    if (c.status === "error") m.failed++;
    m.tokensIn += Number(c.input_tokens ?? 0);
    m.tokensOut += Number(c.output_tokens ?? 0);
    m.cost += Number(c.cost_usd ?? 0);
    m.latency += Number(c.latency_ms ?? 0);
    byModel.set(key, m);
    if (c.ca_firm_id) {
      const f = byFirm.get(String(c.ca_firm_id)) ?? { calls: 0, failed: 0, cost: 0 };
      f.calls++;
      if (c.status === "error") f.failed++;
      f.cost += Number(c.cost_usd ?? 0);
      byFirm.set(String(c.ca_firm_id), f);
    }
  }
  const topFirms = [...byFirm.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls).slice(0, 15);
  const names = new Map<string, string>();
  if (topFirms.length) {
    const { data } = await rows(() => db.from("ca_firms").select("id, firm_name").in("id", topFirms.map(([id]) => id)));
    for (const f of data) names.set(String(f.id), String(f.firm_name));
  }
  const waBy: Record<string, number> = {};
  for (const w of wa.data) waBy[String(w.whatsapp_template)] = (waBy[String(w.whatsapp_template)] ?? 0) + 1;

  return {
    days: d,
    costTracking,
    document: {
      calls: calls.data.length,
      failed,
      tokensIn: sum(calls.data, "input_tokens"),
      tokensOut: sum(calls.data, "output_tokens"),
      costUsd: r6(sum(calls.data, "cost_usd")),
      ocrCalls: calls.data.filter((c) => c.provider === "ocr.space").length,
      withoutUsage: costTracking ? calls.data.filter((c) => c.status === "success" && c.provider !== "ocr.space" && c.input_tokens == null && c.output_tokens == null).length : calls.data.filter((c) => c.status === "success" && c.provider !== "ocr.space").length,
    },
    chat: { calls: chat.data.length, failed: chat.data.filter((c) => c.status !== "success").length, costUsd: r6(sum(chat.data, "cost_usd")) },
    whatsapp: { total: wa.data.length, byTemplate: waBy },
    byDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, v]) => ({ day, calls: v.calls, failed: v.failed, costUsd: r6(v.cost) })),
    byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls).map((m) => ({ provider: m.provider, model: m.model, purpose: m.purpose, calls: m.calls, failed: m.failed, tokensIn: m.tokensIn, tokensOut: m.tokensOut, costUsd: r6(m.cost), avgMs: m.calls ? Math.round(m.latency / m.calls) : 0 })),
    topFirms: topFirms.map(([id, v]) => ({ firmId: id, name: names.get(id) ?? "Unknown firm", calls: v.calls, failed: v.failed, costUsd: r6(v.cost) })),
  };
}
