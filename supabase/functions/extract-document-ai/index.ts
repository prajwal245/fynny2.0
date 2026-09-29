// Extract structured financial data from a photo or PDF using Gemini via the
// Lovable AI Gateway. Returns strict JSON matching the shape the existing
// CSV importer already consumes, so the frontend can reuse its insertion path.
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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

type DocType = "bank" | "invoice" | "expense";

const PROMPTS: Record<DocType, string> = {
  bank: `Extract every transaction row visible in this bank statement.
Return STRICT JSON ONLY (no prose, no markdown fences) of the form:
{"rows":[{"date":"YYYY-MM-DD","description":"...","amount":<number>,"direction":"debit"|"credit"}]}
Rules:
- amount is always a POSITIVE number (no minus sign, no commas, no currency symbol).
- direction is "debit" if money went out of the account (withdrawal), "credit" if money came in (deposit).
- Parse Indian date formats (DD/MM/YYYY, DD-MM-YY, DD MMM YYYY) into ISO YYYY-MM-DD.
- Skip the opening/closing balance row.
- If no transactions are visible, return {"rows":[]}.`,
  invoice: `Extract every invoice/receivable line item visible.
Return STRICT JSON ONLY of the form:
{"rows":[{"customer":"...","invoice_number":"...","amount":<number>,"date":"YYYY-MM-DD"}]}
- amount positive, no currency symbol.
- Parse Indian date formats to ISO YYYY-MM-DD.
- If no invoices are visible, return {"rows":[]}.`,
  expense: `Extract every expense / payable / bill line item visible.
Return STRICT JSON ONLY of the form:
{"rows":[{"vendor":"...","category":"...","amount":<number>,"date":"YYYY-MM-DD"}]}
- amount positive, no currency symbol.
- Parse Indian date formats to ISO YYYY-MM-DD.
- category may be an empty string if not obvious.
- If no expenses are visible, return {"rows":[]}.`,
};

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  // fallback: extract first {...} block
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 25_000_000);
  if (sizeBlock) return sizeBlock;

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bearer = auth.slice("Bearer ".length);
    const internalCall = bearer === SUPABASE_SERVICE_ROLE_KEY;
    const requestBody = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, internalCall ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = internalCall ? { data: { user: null } } : await supabase.auth.getUser();
    const userId = userData?.user?.id ?? (internalCall ? String(requestBody?.userId || "") : "");
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profileRow } = internalCall
      ? { data: null }
      : await supabase.from("profiles").select("business_id").eq("user_id", userId).maybeSingle();
    const businessId = internalCall
      ? String(requestBody?.businessId || "") || null
      : (profileRow as { business_id?: string } | null)?.business_id ?? null;

    const quota = await checkAiQuota(businessId, userData.user.id);
    if (!quota.allowed) {
      await logAiUsage({
        userId, businessId, feature: "document_extraction",
        model: "google/gemini-2.5-flash", prompt: "(blocked before call)",
        status: "blocked", errorMessage: "daily_limit_reached",
      });
      return quotaExceededResponse(quota, corsHeaders);
    }

    const startedAt = Date.now();
    const body = requestBody;
    const docType = String(body?.doc_type || "") as DocType;
    const fileBase64 = String(body?.file_base64 || "");
    const mimeType = String(body?.mime_type || "image/png");

    if (!["bank", "invoice", "expense"].includes(docType)) {
      return new Response(JSON.stringify({ error: "invalid doc_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fileBase64 || fileBase64.length > 12_000_000) {
      return new Response(JSON.stringify({ error: "file missing or too large (max ~9MB)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = fileBase64.startsWith("data:")
      ? fileBase64
      : `data:${mimeType};base64,${fileBase64}`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You extract structured financial data from images and PDFs of Indian bank statements, invoices, and expense bills. Output STRICT JSON only, no prose, no markdown fences.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: PROMPTS[docType] },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!aiResp.ok) {
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const detail = await aiResp.text().catch(() => "");
      console.error("extract-document-ai gateway error", aiResp.status, detail);
      const msg =
        aiResp.status === 429
          ? "Rate limited. Try again in a moment."
          : aiResp.status === 402
          ? "AI credits exhausted."
          : "AI gateway error";
      await logAiUsage({
        userId, businessId, feature: "document_extraction",
        model: "google/gemini-2.5-flash", prompt: `doc_type=${docType}`,
        responseTimeMs: Date.now() - startedAt, status: "error", errorMessage: msg,
      });
      return new Response(JSON.stringify({ error: msg, status: aiResp.status, details: detail.slice(0, 500) }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const raw = json?.choices?.[0]?.message?.content ?? "";
    await logAiUsage({
      userId, businessId, feature: "document_extraction",
      model: "google/gemini-2.5-flash", prompt: `doc_type=${docType}`,
      response: String(raw).slice(0, 2000),
      tokensUsed: json?.usage?.total_tokens ?? estimateTokens(String(raw)),
      responseTimeMs: Date.now() - startedAt, status: "success",
    });

    const parsed = tryParseJson(raw);
    if (!parsed || !Array.isArray(parsed.rows)) {
      console.error("extract-document-ai unparseable AI response:", raw?.slice(0, 500));
      return new Response(JSON.stringify({ error: "Could not parse AI response as JSON", raw: String(raw).slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const required: Record<DocType, string[]> = {
      bank: ["date", "description", "amount", "direction"],
      invoice: ["customer", "invoice_number", "amount", "date"],
      expense: ["vendor", "amount", "date"],
    };
    const fields = required[docType];
    const total = parsed.rows.length * fields.length;
    const filled = parsed.rows.reduce(
      (sum: number, row: Record<string, unknown>) => sum + fields.filter((field) => String(row[field] ?? "").trim() !== "").length,
      0,
    );
    const volumeFactor = docType === "bank" && parsed.rows.length < 3 ? 0.9 : 1;
    const confidence = total > 0 ? Math.round((filled / total) * volumeFactor * 100) / 100 : 0;
    return new Response(JSON.stringify({ rows: parsed.rows, doc_type: docType, confidence }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-document-ai error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
