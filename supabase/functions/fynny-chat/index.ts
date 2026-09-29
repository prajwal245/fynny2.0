// Fynny — AI CFO chat. Streams via Lovable AI Gateway with the user's real
// financial context (bank, txns, subs, payables, receivables, GST).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";
import { checkAiQuota, quotaExceededResponse, logAiUsage, estimateTokens } from "../_shared/ai-metering.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function inr(n: number) {
  if (!isFinite(n)) return "₹0";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

async function buildContext(client: ReturnType<typeof createClient>) {
  const { data: profile } = await client
    .from("profiles")
    .select("business_id, full_name")
    .maybeSingle();
  const businessId = profile?.business_id;
  if (!businessId) {
    return { error: "no_business", summary: "User has no business linked yet." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 86400000)
    .toISOString()
    .slice(0, 10);

  const [banks, txns, subs, payables, receivables, gst, biz] =
    await Promise.all([
      client.from("bank_accounts").select("bank_name,balance,connected").eq("business_id", businessId),
      client.from("transactions").select("date,amount,direction,category,counterparty").eq("business_id", businessId).gte("date", ninetyAgo).order("date", { ascending: false }).limit(500),
      client.from("subscriptions").select("plan_type,status,mrr,billing_cycle,next_billing_date").eq("business_id", businessId),
      client.from("payables").select("vendor_name,amount,outstanding,due_date,status").eq("business_id", businessId),
      client.from("receivables").select("customer_name,amount,outstanding,due_date,status,invoice_number").eq("business_id", businessId),
      client.from("gst_filings").select("return_type,filing_period,due_date,filed_date,status,tax_payable").eq("business_id", businessId).order("due_date", { ascending: false }).limit(12),
      client.from("businesses").select("business_name,industry,state,turnover_range").eq("id", businessId).maybeSingle(),
    ]);

  const cashOnHand = (banks.data || []).reduce((s, b: any) => s + Number(b.balance || 0), 0);
  const last90Out = (txns.data || [])
    .filter((t: any) => t.direction === "out")
    .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
  const monthlyBurn = last90Out / 3;
  const runwayDays = monthlyBurn > 0 ? Math.round((cashOnHand / monthlyBurn) * 30) : null;

  const activeMrr = (subs.data || [])
    .filter((s: any) => s.status === "active")
    .reduce((s: number, x: any) => s + Number(x.mrr || 0), 0);
  const arr = activeMrr * 12;

  const overdueRecv = (receivables.data || [])
    .filter((r: any) => r.due_date && r.due_date < today && r.status !== "paid")
    .reduce((s: number, r: any) => s + Number(r.outstanding || r.amount || 0), 0);
  const totalPayablesOutstanding = (payables.data || []).reduce(
    (s: number, p: any) => s + Number(p.outstanding || 0),
    0,
  );

  const upcomingGst = (gst.data || []).filter(
    (g: any) => g.status !== "filed" && g.due_date >= today,
  )[0];

  return {
    business: biz.data,
    today,
    metrics: {
      cash_on_hand: cashOnHand,
      cash_on_hand_pretty: inr(cashOnHand),
      monthly_burn: Math.round(monthlyBurn),
      monthly_burn_pretty: inr(monthlyBurn),
      runway_days: runwayDays,
      mrr: activeMrr,
      mrr_pretty: inr(activeMrr),
      arr: arr,
      arr_pretty: inr(arr),
      overdue_receivables: overdueRecv,
      overdue_receivables_pretty: inr(overdueRecv),
      total_payables_outstanding: totalPayablesOutstanding,
      total_payables_outstanding_pretty: inr(totalPayablesOutstanding),
      next_gst_due: upcomingGst || null,
    },
    bank_accounts: banks.data || [],
    subscriptions_count: (subs.data || []).length,
    receivables_top: (receivables.data || [])
      .filter((r: any) => Number(r.outstanding || 0) > 0)
      .sort((a: any, b: any) => Number(b.outstanding) - Number(a.outstanding))
      .slice(0, 10),
    payables_top: (payables.data || [])
      .filter((p: any) => Number(p.outstanding || 0) > 0)
      .sort((a: any, b: any) => Number(b.outstanding) - Number(a.outstanding))
      .slice(0, 10),
    recent_gst_filings: gst.data || [],
    recent_transactions_sample: (txns.data || []).slice(0, 30),
  };
}

// Resolves the signed-in caller (if any) so AI usage can be metered per
// business. Anonymous demo traffic returns nulls and stays on the size caps.
async function resolveCaller(auth: string) {
  if (!auth.startsWith("Bearer ")) return { userId: null, businessId: null };
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data } = await client.auth.getUser();
    const user = data?.user;
    if (!user) return { userId: null, businessId: null };
    const { data: profile } = await client
      .from("profiles").select("business_id").eq("user_id", user.id).maybeSingle();
    return {
      userId: user.id,
      businessId: (profile as { business_id?: string } | null)?.business_id ?? null,
    };
  } catch {
    return { userId: null, businessId: null };
  }
}

const CHAT_MODEL = "google/gemini-3-flash-preview";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 2_000_000);
  if (sizeBlock) return sizeBlock;

  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get("Authorization") || "";

    // ── Demo / single-shot path ────────────────────────────────────────
    // Triggered when the client posts { org_id, message, context } — i.e.
    // the caller already built the financial context (DEMO_BIZ on /demo,
    // or scoped live data on the dashboard's Ask Fynny tab). Returns plain
    // JSON so `supabase.functions.invoke` can parse it. We DON'T gate this
    // on the absence of a Bearer header, because invoke() always attaches
    // the publishable key — gating that way made the branch dead code and
    // forced the demo into the streaming/profile path, which fails for
    // anonymous visitors and surfaces as an "auth/streaming" error.
    if (body?.org_id && body?.message && body?.context) {
      // Hard size caps on the unauthenticated demo path to prevent
      // AI-credit drain and oversized prompt-injection payloads.
      const message = String(body.message ?? "");
      const ctxStr = JSON.stringify(body.context ?? {});
      if (message.length > 2000) {
        return new Response(JSON.stringify({ error: "Message too long (max 2000 chars)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (ctxStr.length > 10_000) {
        return new Response(JSON.stringify({ error: "Context too large (max 10KB)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const caller = await resolveCaller(auth);
      const startedAt = Date.now();
      if (caller.userId) {
        const quota = await checkAiQuota(caller.businessId, caller.userId);
        if (!quota.allowed) {
          await logAiUsage({
            userId: caller.userId, businessId: caller.businessId, feature: "fynny_chat",
            model: CHAT_MODEL, prompt: message.slice(0, 500),
            status: "blocked", errorMessage: "daily_limit_reached",
          });
          return quotaExceededResponse(quota, corsHeaders);
        }
      }

      const ctx = body.context || {};
      // Task 7: caller-supplied real financial context, injected ahead of the
      // rest of the system prompt so the model answers from live metrics.
      const injected = typeof body.system_context === "string"
        ? String(body.system_context).slice(0, 2000) + "\n\n"
        : "";
      const systemPrompt = `${injected}You are FYNNY, an AI CFO assistant for Indian SMEs.
Answer the user's question conversationally with specific numbers from the financial data below.
Use Indian currency formatting (₹, lakhs, crores). Be concise, professional, and CFO-grade.
If a metric is missing or zero, say so honestly — never invent numbers.

FINANCIAL DATA:
${ctxStr}

Respond in plain text. Use **bold** for key numbers and \\n for line breaks. Keep responses under 200 words.`;


      const aiResp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message },
            ],
          }),
        },
      );

      if (!aiResp.ok) {
        const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
        const msg =
          aiResp.status === 429
            ? "Rate limited. Try again in a moment."
            : aiResp.status === 402
            ? "AI credits exhausted."
            : "AI gateway error";
        if (caller.userId) {
          await logAiUsage({
            userId: caller.userId, businessId: caller.businessId, feature: "fynny_chat",
            model: CHAT_MODEL, prompt: message.slice(0, 500),
            responseTimeMs: Date.now() - startedAt, status: "error", errorMessage: msg,
          });
        }
        return new Response(JSON.stringify({ error: msg }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const json = await aiResp.json();
      const text = json?.choices?.[0]?.message?.content ?? "";
      if (caller.userId) {
        await logAiUsage({
          userId: caller.userId, businessId: caller.businessId, feature: "fynny_chat",
          model: CHAT_MODEL, prompt: message.slice(0, 500), response: text,
          tokensUsed: json?.usage?.total_tokens ?? estimateTokens(systemPrompt + message + text),
          responseTimeMs: Date.now() - startedAt, status: "success",
        });
      }
      return new Response(
        JSON.stringify({
          response: text,
          suggestions: [
            "What's my biggest cost driver?",
            "How can I extend my runway?",
            "Am I GST compliant?",
          ],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });

    const streamCaller = await resolveCaller(auth);
    const streamStartedAt = Date.now();
    if (streamCaller.userId) {
      const quota = await checkAiQuota(streamCaller.businessId, streamCaller.userId);
      if (!quota.allowed) {
        await logAiUsage({
          userId: streamCaller.userId, businessId: streamCaller.businessId, feature: "fynny_chat",
          model: CHAT_MODEL, prompt: "(blocked before call)",
          status: "blocked", errorMessage: "daily_limit_reached",
        });
        return quotaExceededResponse(quota, corsHeaders);
      }
    }

    const { messages = [] } = body || {};
    const context = await buildContext(supabase);

    const systemPrompt = `You are Fynny, an AI CFO assistant for Indian startups and SMEs.
You have access to the user's REAL financial data below. Answer questions conversationally with SPECIFIC numbers from the data. For calculations, briefly show your math. Use Indian currency formatting (₹, lakhs, crores). Be friendly, concise, and professional like a real CFO.

If a metric is null, missing, or zero, say so honestly — never invent numbers.

CURRENT BUSINESS DATA (as of ${new Date().toISOString()}):
${JSON.stringify(context, null, 2)}`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      await logAiUsage({
        userId: streamCaller.userId, businessId: streamCaller.businessId, feature: "fynny_chat",
        model: CHAT_MODEL, prompt: "(streaming)",
        responseTimeMs: Date.now() - streamStartedAt, status: "error",
        errorMessage: `gateway_${aiResp.status}`,
      });
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Streamed answers are metered up-front (one request = one unit); token
    // count is estimated from the prompt since the stream carries no usage block.
    const lastUserMsg = String(messages[messages.length - 1]?.content ?? "").slice(0, 500);
    await logAiUsage({
      userId: streamCaller.userId, businessId: streamCaller.businessId, feature: "fynny_chat",
      model: CHAT_MODEL, prompt: lastUserMsg || "(streaming)",
      tokensUsed: estimateTokens(systemPrompt + lastUserMsg),
      responseTimeMs: Date.now() - streamStartedAt, status: "success",
    });

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("fynny-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
