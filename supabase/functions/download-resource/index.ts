import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TEMPLATE_STORAGE_BUCKET = "resources";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Resource ID required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("cf-connecting-ip") ??
    null;
  const userAgent = req.headers.get("user-agent");
  const referer = req.headers.get("referer");

  // Resolve the caller when the request carries a signed-in session; downloads
  // are public so an anonymous caller is normal, not an error.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data.user?.id ?? null;
    } catch (_e) {
      userId = null;
    }
  }

  const logAccess = async (
    outcome: string,
    resource?: { id?: string | null; title?: string | null; file_path?: string | null },
  ) => {
    try {
      await supa.from("resource_access_logs").insert({
        resource_id: resource?.id ?? id,
        resource_title: resource?.title ?? null,
        file_path: resource?.file_path ?? null,
        user_id: userId,
        outcome,
        ip_address: ip,
        user_agent: userAgent,
        referer,
      });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", fn: "download-resource", msg: "access log failed", error: String(e) }));
    }
  };

  const { data: resource, error } = await supa
    .from("resources")
    .select("id, title, format, file_path, file_url, is_published")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !resource) {
    await logAccess("not_found");
    return new Response(JSON.stringify({ error: "Resource not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (resource.file_path) {
    const { data: signed } = await supa.storage
      .from(TEMPLATE_STORAGE_BUCKET)
      .createSignedUrl(resource.file_path, 3600);
    if (signed?.signedUrl) {
      await logAccess("success", resource);
      return Response.redirect(signed.signedUrl, 302);
    }
    await logAccess("signed_url_failed", resource);
  }

  if (resource.file_url) {
    await logAccess("success_legacy_url", resource);
    return Response.redirect(resource.file_url, 302);
  }

  await logAccess("file_missing", resource);

  const filename = resource.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_") + "." + String(resource.format ?? "xlsx").toLowerCase();
  return new Response(
    JSON.stringify({
      message: "Template file not yet uploaded to storage. Contact support@fynhelp.com to request this template.",
      title: resource.title,
      format: resource.format,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    }
  );
});
