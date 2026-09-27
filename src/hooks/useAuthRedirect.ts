/**
 * Centralized auth-routing hook. Single source of truth for how the app
 * routes a visitor based on their session + onboarding status.
 *
 * States:
 *   loading                 → still resolving
 *   visitor                 → no session
 *   onboarding_incomplete   → session, business has onboarding_completed=false (or no business)
 *   active_user             → session, business.onboarding_completed=true
 *
 * Intents:
 *   "protected"   → /dashboard/*, /dashboard/settings/* etc. Requires active_user.
 *                   visitor              → /login?redirect=<current path>
 *                   onboarding_incomplete→ /onboarding
 *   "onboarding"  → /onboarding.
 *                   visitor              → /login
 *                   active_user          → /dashboard/cockpit
 *   "public-only" → /login, /waitlist. Kicks fully-onboarded users into the app.
 *                   active_user          → redirect param (if any) or /dashboard/cockpit
 *
 * The /demo/* route tree DELIBERATELY does not call this hook. Demo pages must
 * render identically for logged-out and logged-in visitors.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type AuthState = "loading" | "visitor" | "onboarding_incomplete" | "active_user";
export type AuthIntent = "protected" | "onboarding" | "public-only" | "public";

export function useAuthState(): AuthState {
  const { user, loading, businessId } = useAuth();

  const { data: onboardingCompleted, isLoading: bizLoading } = useQuery({
    queryKey: ["business-onboarding", businessId],
    enabled: !!user && !!businessId,
    queryFn: async () => {
      const { data } = await supabase
        .from("businesses")
        .select("onboarding_completed")
        .eq("id", businessId!)
        .maybeSingle();
      return !!data?.onboarding_completed;
    },
  });

  return useMemo<AuthState>(() => {
    if (loading) return "loading";
    if (!user) return "visitor";
    if (!businessId) return "onboarding_incomplete";
    if (bizLoading || onboardingCompleted === undefined) return "loading";
    return onboardingCompleted ? "active_user" : "onboarding_incomplete";
  }, [loading, user, businessId, bizLoading, onboardingCompleted]);
}

export function useAuthRedirect(intent: AuthIntent): { state: AuthState; ready: boolean } {
  const state = useAuthState();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    // "public" never gates or redirects — used by the read-only /demo/* tree.
    if (intent === "public") { setReady(true); return; }
    if (state === "loading") { setReady(false); return; }


    if (intent === "protected") {
      if (state === "visitor") {
        // Never bounce /login back to itself — that used to nest the redirect
        // param on every render and produce a runaway URL.
        if (location.pathname === "/login" || redirectedRef.current) return;
        redirectedRef.current = true;
        const redirect = encodeURIComponent(location.pathname + location.search);
        navigate(`/login?redirect=${redirect}`, { replace: true });
        return;
      }
      if (state === "onboarding_incomplete") {
        navigate("/onboarding", { replace: true });
        return;
      }
    } else if (intent === "onboarding") {
      if (state === "visitor") { navigate("/login", { replace: true }); return; }
      if (state === "active_user") { navigate("/dashboard/cockpit", { replace: true }); return; }
    } else if (intent === "public-only") {
      if (state === "active_user") {
        const params = new URLSearchParams(location.search);
        const rawRedirect = params.get("redirect");
        const safe =
          rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
            ? rawRedirect
            : "/dashboard/cockpit";
        navigate(safe, { replace: true });
        return;
      }
    }
    setReady(true);
  }, [state, intent, navigate, location.pathname, location.search]);

  return { state, ready };
}
