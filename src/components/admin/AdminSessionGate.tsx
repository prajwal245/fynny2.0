/**
 * Wraps every protected admin screen. Nothing renders until the server has
 * confirmed this admin session (network, role, MFA, session cookie, idle
 * time). While someone works, it tells the server they are active; after 15
 * minutes without a click, key press or scroll it signs them out.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { adminLogout, adminWhoAmI } from "@/lib/admin/admin.functions";
import { IDLE_LIMIT_MS, type Permission } from "@/lib/admin/rbac";
import { adminError, isReauth, REAUTH_EVENT } from "./adminClient";

type Me = Awaited<ReturnType<typeof adminWhoAmI>>;

const AdminSessionContext = createContext<{ me: Me | null; can: (p: Permission) => boolean; signOut: (reason?: string) => Promise<void> }>({
  me: null,
  can: () => false,
  signOut: async () => {},
});

export const useAdminSession = () => useContext(AdminSessionContext);

const HEARTBEAT_MS = 60_000;

export default function AdminSessionGate({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastActive = useRef(Date.now());
  const lastBeat = useRef(Date.now());
  const ending = useRef(false);

  const signOut = useCallback(
    async (reason?: string) => {
      if (ending.current) return;
      ending.current = true;
      await adminLogout().catch(() => null);
      try {
        if (reason) sessionStorage.setItem("fh-admin-reason", reason);
      } catch {
        /* the sign-in page just won't say why */
      }
      nav("/admin/login", { replace: true });
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
    },
    [nav],
  );

  useEffect(() => {
    let live = true;
    adminWhoAmI()
      .then((m) => live && setMe(m))
      .catch((e) => {
        if (!live) return;
        if (isReauth(e)) void signOut(adminError(e));
        else setError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, [signOut]);

  useEffect(() => {
    const onReauth = (e: Event) => void signOut((e as CustomEvent<string>).detail);
    window.addEventListener(REAUTH_EVENT, onReauth);
    return () => window.removeEventListener(REAUTH_EVENT, onReauth);
  }, [signOut]);

  useEffect(() => {
    if (!me) return;
    const mark = () => {
      lastActive.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;
    events.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActive.current >= IDLE_LIMIT_MS) {
        void signOut("You were signed out after 15 minutes without activity.");
        return;
      }
      // Only active people keep the server-side session alive.
      if (lastActive.current > lastBeat.current && now - lastBeat.current >= HEARTBEAT_MS) {
        lastBeat.current = now;
        adminWhoAmI().catch((e) => isReauth(e) && void signOut(adminError(e)));
      }
    }, 5_000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, mark));
      window.clearInterval(tick);
    };
  }, [me, signOut]);

  const can = useCallback((p: Permission) => !!me?.permissions.includes(p), [me]);

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0EBE0" }}>
        <div className="max-w-md text-sm text-center" style={{ color: "#171208" }}>
          <p className="font-semibold mb-2">The admin panel could not be opened.</p>
          <p className="mb-4">{error}</p>
          <button className="underline" onClick={() => void signOut()}>Back to sign in</button>
        </div>
      </div>
    );
  if (!me)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0EBE0" }}>
        <div className="text-sm" style={{ color: "#171208" }} data-testid="admin-checking">Checking access…</div>
      </div>
    );
  return <AdminSessionContext.Provider value={{ me, can, signOut }}>{children}</AdminSessionContext.Provider>;
}
