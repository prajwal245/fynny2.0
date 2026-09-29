import { ReactNode, useEffect, useState } from "react";
import { Navigate, Outlet } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/adminEmails";

/**
 * Gate for internal FynHelp admin tooling.
 * Only the fixed admin email allowlist can pass. No bypass.
 */
export default function AdminGuard({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setState(isAdminEmail(data.user?.email) ? "allowed" : "denied");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") setState("denied");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return (
      <div
        className="min-h-screen grid place-items-center"
        style={{ background: "#F2EEE7", color: "#171208", fontFamily: "'Instrument Sans', Inter, sans-serif" }}
      >
        <span className="text-sm">Checking admin access…</span>
      </div>
    );
  }

  if (state === "denied") return <Navigate to="/" replace />;

  return <>{children ?? <Outlet />}</>;
}
