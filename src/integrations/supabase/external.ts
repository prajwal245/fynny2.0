import { createClient } from "@supabase/supabase-js";
import { supabase } from "./client";

const EXTERNAL_SUPABASE_URL = "https://wiknwxniwqvsxgyzqqxu.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpa253eG5pd3F2c3hneXpxcXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzc1MTksImV4cCI6MjA5MTgxMzUxOX0.MVIp_hMUZsiMQ-LFulVdYaFkGonNk5WwdcHYWsx__qY";

export const supabaseExternal = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (url, options = {}) => {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        const headers = new Headers((options as RequestInit).headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
          headers.set("apikey", EXTERNAL_SUPABASE_ANON_KEY);
        }
        return fetch(url, { ...(options as RequestInit), headers });
      },
    },
  }
);

/**
 * Secure server-side proxy for external financial data.
 * Validates the caller's business access before querying the external project
 * with a service key. Prefer this over direct supabaseExternal reads.
 */
export async function proxyExternalQuery(params: {
  table: string;
  business_id: string;
  select?: string;
  filters?: Record<string, string>;
  limit?: number;
  order?: { column: string; ascending: boolean };
}): Promise<{ data: any[] | null; error: string | null }> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) {
    return { data: null, error: "Not authenticated" };
  }
  const result = await supabase.functions.invoke("external-data-proxy", {
    body: params,
  });
  if (result.error) return { data: null, error: result.error.message };
  if (!result.data?.success) return { data: null, error: result.data?.error ?? "Unknown error" };
  return { data: result.data.data, error: null };
}
