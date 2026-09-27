import { supabase } from "@/integrations/supabase/client";

export interface CAAuditInput {
  firmId: string;
  businessId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
  sourceDocumentId?: string | null;
  actorRole?: string | null;
}

/**
 * Append an immutable audit event. Failures are swallowed on purpose — an
 * audit write must never block the user action it describes, and the table
 * is append-only so nothing can be silently rewritten.
 */
export async function logCAAudit(input: CAAuditInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("ca_audit_events").insert({
      ca_firm_id: input.firmId,
      business_id: input.businessId ?? null,
      actor_id: data?.user?.id ?? null,
      actor_role: input.actorRole ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      detail: (input.detail ?? {}) as never,
      source_document_id: input.sourceDocumentId ?? null,
    });
  } catch {
    // non-blocking
  }
}
