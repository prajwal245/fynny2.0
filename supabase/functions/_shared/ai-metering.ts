// Server-side AI metering: daily per-business quota check + authoritative
// usage logging into public.ai_usage_logs. Always called with the service role
// so the client can neither skip nor under-report a call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  daily_limit: number;
  remaining: number;
}

export async function checkAiQuota(
  businessId: string | null,
  userId: string | null,
): Promise<QuotaResult> {
  const svc = serviceClient();
  const { data, error } = await svc.rpc("check_ai_quota", {
    _business_id: businessId,
    _user_id: userId,
  });
  if (error || !data) {
    console.error(JSON.stringify({ evt: "ai_quota_check_failed", error: error?.message }));
    // Fail closed: an unmetered call is worse than a rejected one.
    return { allowed: false, used: 0, daily_limit: 0, remaining: 0 };
  }
  return data as unknown as QuotaResult;
}

export function quotaExceededResponse(quota: QuotaResult, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: `Daily AI limit reached (${quota.daily_limit} requests/day). It resets at midnight IST.`,
      code: "ai_daily_limit_reached",
      used: quota.used,
      daily_limit: quota.daily_limit,
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

export interface UsageLogInput {
  userId: string | null;
  businessId: string | null;
  feature: string;
  model: string;
  prompt: string;
  response?: string | null;
  tokensUsed?: number | null;
  responseTimeMs?: number | null;
  status?: "success" | "error" | "blocked";
  errorMessage?: string | null;
}

// Rough token estimate when the gateway does not return usage (e.g. streaming).
export function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}

export async function logAiUsage(input: UsageLogInput): Promise<void> {
  try {
    const svc = serviceClient();
    const { error } = await svc.from("ai_usage_logs").insert({
      user_id: input.userId,
      business_id: input.businessId,
      feature: input.feature,
      model: input.model,
      prompt: (input.prompt || "").slice(0, 4000),
      response: input.response ? input.response.slice(0, 8000) : null,
      tokens_used: input.tokensUsed ?? null,
      response_time_ms: input.responseTimeMs ?? null,
      status: input.status ?? "success",
      error_message: input.errorMessage ?? null,
    });
    if (error) {
      console.error(JSON.stringify({ evt: "ai_usage_log_failed", error: error.message }));
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "ai_usage_log_threw", error: String(e) }));
  }
}
