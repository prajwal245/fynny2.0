import { supabase } from "@/integrations/supabase/client";

export type AdminAuditPayload = {
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown>;
};

/**
 * Records an admin action into admin_audit_logs in the external Supabase
 * project (where admin users live). Never throws, failures are logged only.
 */
export async function logAdminAction(p: AdminAuditPayload): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("admin_audit_logs").insert({
      admin_user_id: user.id,
      action: p.action,
      target_type: p.target_type ?? null,
      target_id: p.target_id ?? null,
      details: (p.details ?? {}) as never,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    if (error) console.warn("[admin audit]", error.message);
  } catch (e) {
    console.warn("[admin audit] failed", e);
  }
}
