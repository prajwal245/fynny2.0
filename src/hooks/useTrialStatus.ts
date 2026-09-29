import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TrialStatus {
  loading: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number | null;
  isExpired: boolean;
  hasPaidSubscription: boolean;
  /** True if the dashboard should be blocked with an "upgrade" screen. */
  shouldBlock: boolean;
  plan: string | null;
  subscriptionStatus: string | null;
}

const PAID_STATUSES = new Set(["active", "paid", "trialing_paid"]);
const PAID_PLANS = new Set(["pro", "enterprise", "growth", "scale"]);

export function useTrialStatus(): TrialStatus {
  const { businessId, loading: authLoading } = useAuth();
  const [state, setState] = useState<TrialStatus>({
    loading: true,
    trialEndsAt: null,
    daysRemaining: null,
    isExpired: false,
    hasPaidSubscription: false,
    shouldBlock: false,
    plan: null,
    subscriptionStatus: null,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!businessId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("businesses") as any)
        .select("trial_ends_at, subscription_status, plan")
        .eq("id", businessId)
        .maybeSingle();
      if (cancelled) return;
      const endsAtRaw = (data as any)?.trial_ends_at ?? null;
      const trialEndsAt = endsAtRaw ? new Date(endsAtRaw) : null;
      const now = Date.now();
      const daysRemaining = trialEndsAt
        ? Math.ceil((trialEndsAt.getTime() - now) / (1000 * 60 * 60 * 24))
        : null;
      const isExpired = trialEndsAt ? trialEndsAt.getTime() < now : false;
      const plan = (data as any)?.plan ?? null;
      const subscriptionStatus = (data as any)?.subscription_status ?? null;
      const hasPaidSubscription =
        PAID_STATUSES.has(String(subscriptionStatus)) || PAID_PLANS.has(String(plan));
      setState({
        loading: false,
        trialEndsAt,
        daysRemaining,
        isExpired,
        hasPaidSubscription,
        shouldBlock: isExpired && !hasPaidSubscription,
        plan,
        subscriptionStatus,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, authLoading]);

  return state;
}
