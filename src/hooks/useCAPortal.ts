/**
 * CA portal session hook.
 *
 * ALL CA management data lives in Lovable Cloud (the default `supabase` client).
 * Client financial intelligence lives in the external project (`supabaseExternal`).
 * This hook only touches Lovable Cloud.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CAPortalState {
  userId: string | null;
  firmId: string | null;
  firmName: string | null;
  caName: string | null;
  caRole: string | null;
  isVerified: boolean;
  verificationStatus: string | null;
  onboardingStep: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCAPortal(): CAPortalState {
  const [state, setState] = useState<Omit<CAPortalState, "refresh">>({
    userId: null,
    firmId: null,
    firmName: null,
    caName: null,
    caRole: null,
    isVerified: false,
    verificationStatus: null,
    onboardingStep: null,
    isLoading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user ?? null;
      if (!user) {
        setState({
          userId: null, firmId: null, firmName: null, caName: null, caRole: null,
          isVerified: false, verificationStatus: null, onboardingStep: null,
          isLoading: false, error: null,
        });
        return;
      }

      const { data: member, error: memberErr } = await supabase
        .from("ca_firm_members")
        .select("ca_firm_id, role, status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberErr) throw memberErr;

      // Fall back to firm ownership when no membership row exists yet.
      let firmId = member?.ca_firm_id ?? null;
      let role = member?.role ?? null;

      if (!firmId) {
        const { data: ownedFirm } = await supabase
          .from("ca_firms")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        firmId = ownedFirm?.id ?? null;
        if (firmId) role = "admin";
      }

      if (!firmId) {
        setState({
          userId: user.id, firmId: null, firmName: null, caName: null, caRole: null,
          isVerified: false, verificationStatus: null, onboardingStep: null,
          isLoading: false, error: null,
        });
        return;
      }

      const { data: firm, error: firmErr } = await supabase
        .from("ca_firms")
        .select("id, firm_name, ca_name, is_verified, verification_status, onboarding_step")
        .eq("id", firmId)
        .maybeSingle();
      if (firmErr) throw firmErr;

      setState({
        userId: user.id,
        firmId,
        firmName: firm?.firm_name ?? null,
        caName: firm?.ca_name ?? null,
        caRole: role,
        isVerified: !!firm?.is_verified,
        verificationStatus: firm?.verification_status ?? null,
        onboardingStep: firm?.onboarding_step ?? null,
        isLoading: false,
        error: null,
      });
    } catch (e: any) {
      setState((s) => ({ ...s, isLoading: false, error: e?.message ?? "Failed to load CA firm" }));
    }
  }, []);

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        console.log("[fyn:auth] session refreshed automatically");
      }
      if (event === "SIGNED_OUT") {
        // Clear remember-me preference on explicit sign out.
        sessionStorage.removeItem("fyn.sessionOnly");
        localStorage.removeItem("fyn.sessionOnly");
      }
      setTimeout(() => load(), 0);
    });
    return () => subscription.unsubscribe();
  }, [load]);

  return { ...state, refresh: load };
}
