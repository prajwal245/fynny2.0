import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    name: z.string().trim().max(100).optional().default(""),
    company_name: z.string().trim().max(150).optional().default(""),
    phone: z.string().trim().max(20).optional().default(""),
    company_type: z.string().trim().max(100).optional().default(""),
    company_size: z.string().trim().max(50).optional().default(""),
    location: z.string().trim().max(100).optional().default(""),
  })
  .strict();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Content-Type must be application/json" }, 415);
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const payload = parsed.data;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { count: totalCount, error: countError } = await admin
      .from("waitlist")
      .select("id", { count: "exact", head: true });

    if (countError) {
      console.error("waitlist-signup count error", countError);
      return json({ error: "Failed to prepare waitlist signup" }, 500);
    }

    const position = (totalCount ?? 0) + 1;
    const insertPayload = {
      email: payload.email,
      name: payload.name,
      company_name: payload.company_name,
      phone: payload.phone,
      company_type: payload.company_type,
      company_size: payload.company_size,
      location: payload.location,
      position,
    };

    const { error: insertError } = await admin.from("waitlist").insert(insertPayload);

    if (insertError) {
      if (insertError.code === "23505") {
        return json({ success: true, already_exists: true, message: "Already on waitlist" });
      }

      console.error("waitlist-signup insert error", insertError);
      return json({ error: "Failed to save waitlist signup" }, 500);
    }

    return json({ success: true, position });
  } catch (error) {
    console.error("waitlist-signup unexpected error", error);
    return json({ error: "Unexpected server error" }, 500);
  }
});