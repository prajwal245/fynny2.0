/**
 * Firm-wide 2FA nudge. Shown when the firm requires two-factor authentication
 * and the signed-in member has no verified authenticator yet.
 */
import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { CA } from "./portalUi";

export default function CAMfaBanner() {
  const { firmId } = useCAPortal();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      const { data: firm } = await supabase.from("ca_firms").select("require_mfa").eq("id", firmId).maybeSingle();
      if (!firm?.require_mfa) return;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasVerified = (factors?.totp ?? []).some((f) => f.status === "verified");
      if (!cancelled) setShow(!hasVerified);
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  if (!show) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
      padding: "11px 16px", borderRadius: 10,
      background: "rgba(179,38,30,0.06)", border: `0.5px solid rgba(179,38,30,0.35)`,
      fontFamily: CA.sans, fontSize: 13.5, color: CA.ink,
    }}>
      <ShieldAlert size={17} color={CA.red} />
      <span>Your firm requires two-factor authentication. Set it up to keep access to client data.</span>
      <Link to="/ca/settings" style={{ color: CA.teal, fontWeight: 600, marginLeft: "auto" }}>
        Set up 2FA
      </Link>
    </div>
  );
}
