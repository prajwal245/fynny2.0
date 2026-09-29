import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

export interface OnboardResult {
  success: boolean;
  business_name?: string;
  calendar_events_created?: number;
  health_score?: Record<string, unknown>;
  error?: string;
}

export function useCAOnboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onboard = async (
    business_id: string,
    options?: { access_level?: string; module_access?: string[]; notes?: string }
  ): Promise<OnboardResult> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ca-onboard-client", {
        body: { business_id, ...options },
      });
      if (fnErr) {
        const msg = fnErr.message ?? "Failed to onboard client";
        setError(msg);
        return { success: false, error: msg };
      }
      if (!data?.success) {
        const msg = data?.error ?? "Unexpected error during onboarding";
        setError(msg);
        return { success: false, error: msg };
      }
      track("ca_client_added", { business_id });
      return data as OnboardResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  return { onboard, loading, error };
}
