/**
 * API usage and cost for the admin panel: document-reading AI and OCR (ca_ai_calls), Fynny chat (ai_usage_logs) and WhatsApp
 * follow-ups sent. Tolerant: a missing column or table leaves that part empty, and `costTracking` says whether the token and cost
 * columns exist yet (migration 20261108100000).
 *
 * Cost is RECOMPUTED here from the tokens each row recorded, at the rate in force on the row's day, rather than trusting the
 * `cost_usd` stored when the call was made: rate tables get corrected (this page used to under-count because thinking tokens and
 * the Nov 2026 rates were missing), and a recomputation fixes old rows too. The stored figure is returned beside it so any gap is
 * visible. Failed calls that were billed (the model answered, the answer could not be used) count, as Google bills them.
 */
import type { AdminCtx } from "./security.server";
import { rateKnown, tokenCostUsd, usdInr } from "../practice/aiPricing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type DayBasis = "ist" | "pacific";

async function rows(run: () => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<{ data: Row[]; error: string | null }> {
  try {
    const { data, error } = await run();
    return { data: data ?? [], error: error?.message ?? null };
  } catch (e) {
    return { data: [], error: (e as Error).message };
  }
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r2 = (n: number) => Math.round(n * 100) / 100;

const pacific = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
/** The calendar day a call falls on. Google bills by Pacific day; India reads the books by IST day, so both are offered. */
export function dayOf(iso: string, basis: DayBasis): string {
  const t = new Date(iso);
  if (basis === "pacific") return pacific.format(t);
  return new Date(t.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** What a document-AI row cost: from its tokens at that day's rate; the stored figure only when it has no tokens. */
export function rowCost(c: Row): number {
  const hasTokens = c.input_tokens != null || c.output_tokens != null;
  if (c.provider === "ocr.space") return Number(c.cost_usd ?? 0);
  if (hasTokens) return tokenCostUsd(c.model, Number(c.input_tokens ?? 0), Number(c.output_tokens ?? 0), new Date(String(c.created_at))) ?? 0;
  return Number(c.cost_usd ?? 0);
}

/** Fynny chat logs only a token total: priced as 80% input / 20% output, an estimate. */
export function chatCost(c: Row): number {
  const total = Number(c.tokens_used ?? 0);
  if (!total) return Number(c.cost_usd ?? 0);
  return tokenCostUsd(c.model, Math.round(total * 0.8), Math.round(total * 0.2), new Date(String(c.created_at))) ?? 0;
}

export async function apiUsage(ctx: AdminCtx, days: number, basis: DayBasis = "ist") {
  const { db } = ctx;
  const d = Math.max(1, Math.min(365, Math.floor(days) || 30));
  const since = new Date(Date.now() - (d + 1) * 86_400_000).toISOString();
  const rate = usdInr();

  let costTracking = true;
  let calls = await rows(() => db.from("ca_ai_calls").select("ca_firm_id, purpose, provider, model, status, latency_ms, created_at, input_tokens, output_tokens, cost_usd, units").gte("created_at", since).order("created_at", { ascending: false }).limit(50000));
  if (calls.error && /input_tokens|output_tokens|cost_usd|units/.test(calls.error)) {
    costTracking = false;
    calls = await rows(() => db.from("ca_ai_calls").select("ca_firm_id, purpose, provider, model, status, latency_ms, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50000));
  }
  const chat = await rows(() => db.from("ai_usage_logs").select("model, tokens_used, cost_usd, status, response_time_ms, created_at").gte("created_at", since).limit(50000));
  const wa = await rows(() => db.from("ca_touchpoints").select("whatsapp_template, whatsapp_sent_at").gte("whatsapp_sent_at", since).not("whatsapp_template", "is", null).limit(20000));

  // Keep exactly the last `d` calendar days on the chosen basis.
  const cutoffDay = dayOf(new Date(Date.now() - (d - 1) * 86_400_000).toISOString(), basis);
  const inWindow = (iso: unknown) => dayOf(String(iso), basis) >= cutoffDay;
  const docRows: Row[] = calls.data.filter((c) => inWindow(c.created_at)).map((c) => ({ ...c, _cost: rowCost(c) }));
  const chatRows: Row[] = chat.data.filter((c) => inWindow(c.created_at)).map((c) => ({ ...c, _cost: chatCost(c) }));

  const sum = (xs: Row[], k: string) => xs.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const docCost = sum(docRows, "_cost");
  const chatTotal = sum(chatRows, "_cost");
  const failed = docRows.filter((c) => c.status === "error").length;

  const byDay = new Map<string, { calls: number; failed: number; cost: number; chat: number }>();
  const bump = (day: string) => byDay.get(day) ?? { calls: 0, failed: 0, cost: 0, chat: 0 };
  const byModel = new Map<string, { provider: string; model: string; purpose: string; calls: number; failed: number; tokensIn: number; tokensOut: number; cost: number; latency: number }>();
  const byFirm = new Map<string, { calls: number; failed: number; cost: number }>();
  const unpriced = new Set<string>();
  for (const c of docRows) {
    const day = dayOf(String(c.created_at), basis);
    const a = bump(day);
    a.calls++;
    if (c.status === "error") a.failed++;
    a.cost += c._cost;
    byDay.set(day, a);
    if (c.provider !== "ocr.space" && c.model && !rateKnown(c.model, new Date(String(c.created_at)))) unpriced.add(String(c.model));
    const key = `${c.provider ?? "none"}|${c.model ?? "-"}|${c.purpose ?? "-"}`;
    const m = byModel.get(key) ?? { provider: String(c.provider ?? "none"), model: String(c.model ?? "-"), purpose: String(c.purpose ?? "-"), calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, cost: 0, latency: 0 };
    m.calls++;
    if (c.status === "error") m.failed++;
    m.tokensIn += Number(c.input_tokens ?? 0);
    m.tokensOut += Number(c.output_tokens ?? 0);
    m.cost += c._cost;
    m.latency += Number(c.latency_ms ?? 0);
    byModel.set(key, m);
    if (c.ca_firm_id) {
      const f = byFirm.get(String(c.ca_firm_id)) ?? { calls: 0, failed: 0, cost: 0 };
      f.calls++;
      if (c.status === "error") f.failed++;
      f.cost += c._cost;
      byFirm.set(String(c.ca_firm_id), f);
    }
  }
  for (const c of chatRows) {
    const day = dayOf(String(c.created_at), basis);
    const a = bump(day);
    a.chat += c._cost;
    byDay.set(day, a);
  }
  const topFirms = [...byFirm.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls).slice(0, 15);
  const names = new Map<string, string>();
  if (topFirms.length) {
    const { data } = await rows(() => db.from("ca_firms").select("id, firm_name").in("id", topFirms.map(([id]) => id)));
    for (const f of data) names.set(String(f.id), String(f.firm_name));
  }
  const waBy: Record<string, number> = {};
  for (const w of wa.data) if (inWindow(w.whatsapp_sent_at)) waBy[String(w.whatsapp_template)] = (waBy[String(w.whatsapp_template)] ?? 0) + 1;

  const loggedDoc = sum(docRows, "cost_usd");
  const inr = (usd: number) => r2(usd * rate);
  return {
    days: d,
    basis,
    usdInr: rate,
    costTracking,
    document: {
      calls: docRows.length,
      failed,
      /** Failed calls that were still billed (the model answered but the answer could not be used). */
      billedFailed: docRows.filter((c) => c.status === "error" && (c._cost ?? 0) > 0).length,
      tokensIn: sum(docRows, "input_tokens"),
      tokensOut: sum(docRows, "output_tokens"),
      costUsd: r6(docCost),
      costInr: inr(docCost),
      /** What was stored with the rows when the calls were made, for comparison with the recomputed figure. */
      loggedCostUsd: r6(loggedDoc),
      ocrCalls: docRows.filter((c) => c.provider === "ocr.space").length,
      withoutUsage: docRows.filter((c) => c.status === "success" && c.provider !== "ocr.space" && c.input_tokens == null && c.output_tokens == null).length,
    },
    chat: { calls: chatRows.length, failed: chatRows.filter((c) => c.status !== "success").length, costUsd: r6(chatTotal), costInr: inr(chatTotal), withoutTokens: chatRows.filter((c) => !Number(c.tokens_used)).length },
    totalUsd: r6(docCost + chatTotal),
    totalInr: inr(docCost + chatTotal),
    unpricedModels: [...unpriced],
    whatsapp: { total: Object.values(waBy).reduce((a, b) => a + b, 0), byTemplate: waBy },
    byDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, v]) => ({ day, calls: v.calls, failed: v.failed, costUsd: r6(v.cost), chatUsd: r6(v.chat), totalUsd: r6(v.cost + v.chat), totalInr: inr(v.cost + v.chat) })),
    byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls).map((m) => ({ provider: m.provider, model: m.model, purpose: m.purpose, calls: m.calls, failed: m.failed, tokensIn: m.tokensIn, tokensOut: m.tokensOut, costUsd: r6(m.cost), costInr: inr(m.cost), avgMs: m.calls ? Math.round(m.latency / m.calls) : 0 })),
    topFirms: topFirms.map(([id, v]) => ({ firmId: id, name: names.get(id) ?? "Unknown firm", calls: v.calls, failed: v.failed, costUsd: r6(v.cost), costInr: inr(v.cost) })),
  };
}
