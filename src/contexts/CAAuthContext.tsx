import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface CAFirm {
  id: string;
  firm_name: string;
  membership_number: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  is_verified: boolean;
  plan_type: string;
  max_clients: number;
  logo_url: string | null;
}

interface CAAuthContextType {
  user: User | null;
  session: Session | null;
  caFirm: CAFirm | null;
  loading: boolean;
  isDemoCA: boolean;
  signOut: () => Promise<void>;
  refreshFirm: () => Promise<void>;
}

const CAAuthContext = createContext<CAAuthContextType>({
  user: null, session: null, caFirm: null, loading: true, isDemoCA: false,
  signOut: async () => {}, refreshFirm: async () => {},
});

export const useCAAuth = () => useContext(CAAuthContext);

const DEMO_CA_FIRM_ID_FALLBACK = "a0000000-ca00-de00-0000-000000000001";

const isDemoActive = () =>
  typeof window !== "undefined" && sessionStorage.getItem("fynhelp_ca_demo") === "true";

const buildDemoFirm = (): CAFirm => ({
  id: (typeof window !== "undefined" && sessionStorage.getItem("fynhelp_ca_demo_firm_id")) || DEMO_CA_FIRM_ID_FALLBACK,
  firm_name: "Mehta and Associates",
  membership_number: "MRN-123456",
  email: "demo@fynhelp.com",
  city: "Bengaluru",
  state: "Karnataka",
  is_verified: true,
  plan_type: "pro",
  max_clients: 50,
  logo_url: null,
});

export const CAAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [caFirm, setCAFirm] = useState<CAFirm | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoCA, setIsDemoCA] = useState<boolean>(isDemoActive());

  const fetchFirm = async (uid: string) => {
    // Demo short-circuit: skip Supabase entirely
    if (isDemoActive()) {
      setIsDemoCA(true);
      setCAFirm(buildDemoFirm());
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("ca_firms")
      .select("id, firm_name, membership_number, email, city, state, is_verified, plan_type, max_clients, logo_url")
      .eq("user_id", uid)
      .maybeSingle();
    setCAFirm(data as CAFirm | null);
    setLoading(false);
  };

  useEffect(() => {
    // Demo mode: bypass Supabase auth entirely
    if (isDemoActive()) {
      setIsDemoCA(true);
      setCAFirm(buildDemoFirm());
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (isDemoActive()) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => fetchFirm(sess.user.id), 0);
      } else {
        setCAFirm(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if (isDemoActive()) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) fetchFirm(sess.user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isDemoActive()) {
      sessionStorage.removeItem("fynhelp_ca_demo");
      sessionStorage.removeItem("fynhelp_ca_demo_firm_id");
      setIsDemoCA(false);
      setCAFirm(null);
      return;
    }
    await supabase.auth.signOut();
  };
  const refreshFirm = async () => { if (user) await fetchFirm(user.id); };

  return (
    <CAAuthContext.Provider value={{ user, session, caFirm, loading, isDemoCA, signOut, refreshFirm }}>
      {children}
    </CAAuthContext.Provider>
  );
};
