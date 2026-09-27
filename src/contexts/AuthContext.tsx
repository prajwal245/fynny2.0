import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { identifyUser, resetAnalytics } from "@/lib/analytics";
import {
  installEphemeralSessionGuard,
  isSessionOnly,
  purgePersistedAuthTokens,
  clearRememberMeFlags,
} from "@/lib/sessionPolicy";


interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  businessId: string | null;
  profile: { full_name: string; language_preference: string; role: string } | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, businessId: null, profile: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      } else {
        setBusinessId(null);
        setProfile(null);
        setLoading(false);
      }
    });

    // "Remember me" enforcement:
    // Ephemeral sessions have their persisted token purged on unload (see
    // sessionPolicy). This is the backstop for browsers that skip the unload
    // handler: if a token survived into a brand-new browser session, drop it.
    const removeGuard = installEphemeralSessionGuard();

    const enforceRememberMe = async () => {
      const sessionOnly = isSessionOnly();
      const tabAlive = sessionStorage.getItem("fyn.tabAlive") === "1";

      if (sessionOnly && !tabAlive) {
        purgePersistedAuthTokens();
        await supabase.auth.signOut();
        clearRememberMeFlags();
      }
      sessionStorage.setItem("fyn.tabAlive", "1");

      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    enforceRememberMe();

    return () => {
      subscription.unsubscribe();
      removeGuard();
    };
  }, []);


  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("business_id, full_name, language_preference, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      setBusinessId(data.business_id);
      setProfile({
        full_name: data.full_name || "",
        language_preference: data.language_preference || "en",
        role: data.role || "owner",
      });
    }
    identifyUser(userId, {
      businessId: data?.business_id ?? undefined,
      role: data?.role ?? "owner",
    });
    setLoading(false);
  };

  const signOut = async () => {
    resetAnalytics();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, businessId, profile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
