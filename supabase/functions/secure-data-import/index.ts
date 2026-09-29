import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.23.8";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;
const EXTERNAL_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") as string;
const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY") as string;

const today = () => new Date().toISOString().slice(0, 10);

const TransactionRecord = z.object({
  transaction_date: z.string().refine((v) => !isNaN(Date.parse(v)), "invalid date"),
  amount: z.number().positive("amount must be > 0"),
  description: z.string().trim().max(500).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  direction: z.enum(["in", "out"]).optional().default("out"),
});

const BodySchema = z.object({
  data_type: z.enum(["transactions", "invoices", "vendor_payments"]),
  business_id: z.string().uuid("business_id must be a valid UUID"),
  records: z.array(z.record(z.unknown())).min(1, "records must be non-empty"),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 25_000_000);
  if (sizeBlock) return sizeBlock;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!EXTERNAL_URL || !EXTERNAL_KEY) {
    return json({ error: "External Supabase not configured" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Local (Lovable Cloud) client — used for auth + profile lookup.
    const localClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Local client scoped to the caller's JWT for token validation.
    const localAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    // External Supabase client — used for ALL data writes.
    const externalClient = createClient(EXTERNAL_URL, EXTERNAL_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await localAuthClient.auth.getUser(token);
    if (authErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { error: "Invalid request body", errors: parsed.error.flatten().fieldErrors },
        400,
      );
    }
    const { data_type, business_id, records } = parsed.data;

    // Verify caller has access to the business (Lovable Cloud profiles table).
    const { data: profile } = await localClient
      .from("profiles")
      .select("business_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.business_id || profile.business_id !== business_id) {
      return json({ error: "Forbidden: business_id does not match user" }, 403);
    }

    if (data_type !== "transactions") {
      return json(
        { error: `data_type '${data_type}' not yet supported`, inserted_count: 0 },
        400,
      );
    }

    // Validate each record
    const validationErrors: Array<{ index: number; errors: unknown }> = [];
    const valid: Array<z.infer<typeof TransactionRecord>> = [];
    records.forEach((r, i) => {
      const p = TransactionRecord.safeParse({
        ...r,
        amount: typeof r.amount === "string" ? Number(r.amount) : r.amount,
      });
      if (!p.success) {
        validationErrors.push({ index: i, errors: p.error.flatten().fieldErrors });
        return;
      }
      if (new Date(p.data.transaction_date) > new Date(today() + "T23:59:59Z")) {
        validationErrors.push({ index: i, errors: { transaction_date: ["future date not allowed"] } });
        return;
      }
      valid.push(p.data);
    });

    if (validationErrors.length > 0) {
      return json(
        { inserted_count: 0, errors: validationErrors, message: "Validation failed" },
        400,
      );
    }

    const rows = valid.map((r) => ({
      business_id,
      date: r.transaction_date,
      transaction_date: r.transaction_date,
      amount: r.amount,
      direction: r.direction,
      description: r.description || null,
      category: r.category || null,
    }));

    // Insert into External Supabase.
    const { data: inserted, error: insertErr } = await externalClient
      .from(data_type)
      .insert(rows)
      .select("id");

    if (insertErr) {
      return json({ error: insertErr.message, inserted_count: 0 }, 400);
    }

    // Audit log into External Supabase.
    await externalClient.from("audit_log").insert({
      user_id: userId,
      business_id,
      action: "secure_data_import",
      resource_type: data_type,
      metadata: { inserted_count: inserted?.length ?? 0 },
    });

    return json({ inserted_count: inserted?.length ?? 0, errors: [] });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
