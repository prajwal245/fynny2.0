import { supabase } from "@/integrations/supabase/client";

/**
 * Records a realtime event reception into public.realtime_event_log so admins
 * can debug missing or mis-scoped notifications.
 *
 * Hard rules (enforced both client-side and by RLS):
 *   - emitted_by must be auth.uid()
 *   - business_id, if set, must equal get_user_business_id()
 *   - ca_firm_id,  if set, must equal get_user_ca_firm_id()
 *
 * This function NEVER throws, audit logging must not break realtime handlers.
 * Failures are logged to console.warn only.
 */
export type RealtimeAuditEvent = {
  channel_name: string;
  table_name: string;
  event_type: "INSERT" | "UPDATE" | "DELETE" | "*";
  business_id?: string | null;
  ca_firm_id?: string | null;
  row_id?: string | null;
  context?: Record<string, unknown>;
  handler_status?: "received" | "invalidated" | "error" | "filtered_out";
};

export async function logRealtimeEvent(evt: RealtimeAuditEvent): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return; // anon clients cannot insert per RLS, skip silently.

    const payload = {
      emitted_by: user.id,
      channel_name: evt.channel_name,
      schema_name: "public",
      table_name: evt.table_name,
      event_type: evt.event_type,
      business_id: evt.business_id ?? null,
      ca_firm_id: evt.ca_firm_id ?? null,
      row_id: evt.row_id ?? null,
      context: evt.context ?? {},
      handler_status: evt.handler_status ?? "received",
    };

    const { error } = await supabase
      .from("realtime_event_log")
      .insert(payload as never);

    if (error) {
      // Most likely an RLS rejection (e.g. business_id mismatch). Surface it
      // for the developer but never re-throw.
      console.warn("[realtime audit] insert rejected:", error.message);
    }
  } catch (e) {
    console.warn("[realtime audit] logging failed:", e);
  }
}
