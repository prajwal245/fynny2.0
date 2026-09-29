/**
 * Brain feedback signals.
 *
 * The nightly learning crons read these rows and fold them into
 * ca_firm_intelligence / ca_client_intelligence. Every write here is
 * fire-and-forget: a failed signal must never block the user action that
 * produced it, and a missing table must never surface an error.
 */
import { supabase } from "@/integrations/supabase/client";

// The generated Database types lag behind the intelligence tables.
const db = supabase as unknown as { from: (t: string) => any };

export type BrainEventType =
  | "ocr_correction"
  | "recon_match_accepted"
  | "chaser_replied"
  | "compliance_filed"
  | "exception_resolved";

export async function signalBrain(
  firmId: string | null | undefined,
  businessId: string | null | undefined,
  eventType: BrainEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!firmId) return;
  try {
    await db.from("ca_brain_events").insert({
      ca_firm_id: firmId,
      business_id: businessId ?? null,
      event_type: eventType,
      payload,
    });
  } catch {
    /* non-blocking — the table may not exist yet */
  }
}

export const signalOcrCorrection = (
  firmId: string,
  businessId: string,
  classification: string,
  originalConfidence: number | null,
  correctedRowCount: number,
) =>
  signalBrain(firmId, businessId, "ocr_correction", {
    classification,
    original_confidence: originalConfidence,
    corrected_row_count: correctedRowCount,
    corrected_at: new Date().toISOString(),
  });
