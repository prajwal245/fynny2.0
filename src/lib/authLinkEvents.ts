// Fire-and-forget reporter for password-recovery / reset link verification
// outcomes. Failures here must never block or break the recovery UI.
import { supabase } from "@/integrations/supabase/client";

export type AuthLinkReason =
  | "expired"
  | "used"
  | "invalid"
  | "unknown"
  | "verified";

export type AuthLinkSource = "url" | "supabase";

export interface AuthLinkEvent {
  reason: AuthLinkReason;
  source?: AuthLinkSource;
  flow?: string;
  errorCode?: string | null;
  description?: string | null;
  route?: string | null;
}

export const reportAuthLinkEvent = (event: AuthLinkEvent): void => {
  const payload = {
    reason: event.reason,
    source: event.source ?? "url",
    flow: event.flow ?? "password_recovery",
    error_code: event.errorCode ?? null,
    description: event.description ?? null,
    route:
      event.route ??
      (typeof window !== "undefined" ? window.location.pathname : null),
  };

  // Best-effort: never throw, never await in callers.
  try {
    void supabase.functions
      .invoke("log-auth-link-event", { body: payload })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[auth-link-event] report failed", err);
      });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[auth-link-event] report threw", err);
  }
};
