import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CA, CACard, CAHeading, CAButton, CABadge } from "@/components/ca/portalUi";
import FynLogo from "@/components/FynLogo";

interface InviteInfo {
  firm_name: string;
  client_name: string | null;
  access_level: string | null;
  status: string;
  expires_at: string | null;
  invited_email: string;
}

export default function CAInviteAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setLoading(false); return; }
      const { data, error } = await supabase.rpc("get_ca_invitation", { _token: token });
      if (error) console.warn("[fyn:ca] invitation lookup failed", error);
      const row = Array.isArray(data) ? data[0] : data;
      setInvite((row as InviteInfo) ?? null);
      setLoading(false);
    })();
  }, [token]);

  const expired = !!invite && (invite.status !== "pending" || (invite.expires_at ? new Date(invite.expires_at) < new Date() : false));

  const accept = async () => {
    if (!token) return;
    setWorking(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      localStorage.setItem("pending_ca_invite_token", token);
      navigate(`/login?redirect=${encodeURIComponent("/ca/invite/accept?token=" + token)}`);
      return;
    }
    const { data, error } = await supabase.rpc("accept_ca_invitation", { _token: token });
    setWorking(false);
    if (error) return toast.error(error.message);
    const outcome = String(data);
    if (outcome === "accepted") {
      localStorage.removeItem("pending_ca_invite_token");
      setResult("accepted");
      toast.success("Access granted to your CA firm");
    } else if (outcome === "no_business") {
      toast.error("Finish setting up your business profile before granting access.");
    } else {
      toast.error(`This invitation is ${outcome.replace("_", " ")}.`);
      setResult(outcome);
    }
  };

  const decline = async () => {
    if (!token) return;
    setWorking(true);
    const { data, error } = await supabase.rpc("decline_ca_invitation", { _token: token });
    setWorking(false);
    if (error) return toast.error(error.message);
    setResult(String(data));
    toast.success("Invitation declined");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: CA.page }}>
      <CACard style={{ width: "100%", maxWidth: 480, padding: 34 }}>
        <FynLogo variant="dark" size="sm" />

        {loading ? (
          <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 20 }}>Checking invitation…</p>
        ) : !token || !invite ? (
          <>
            <CAHeading size={22} style={{ marginTop: 18 }}>Invitation not found</CAHeading>
            <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 8 }}>
              This link is invalid. Ask your CA firm to send a new invitation.
            </p>
          </>
        ) : result === "accepted" ? (
          <>
            <CAHeading size={22} style={{ marginTop: 18 }}>Access granted</CAHeading>
            <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 8 }}>
              {invite.firm_name} can now view your financial data at the access level you approved.
            </p>
            <Link to="/dashboard" style={{ fontFamily: CA.sans, fontSize: 13, color: CA.teal, fontWeight: 600, display: "inline-block", marginTop: 16 }}>
              Go to my dashboard
            </Link>
          </>
        ) : result === "declined" ? (
          <>
            <CAHeading size={22} style={{ marginTop: 18 }}>Invitation declined</CAHeading>
            <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 8 }}>
              No access has been shared with {invite.firm_name}.
            </p>
          </>
        ) : expired ? (
          <>
            <CAHeading size={22} style={{ marginTop: 18 }}>Invitation no longer valid</CAHeading>
            <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 8 }}>
              This invitation is {invite.status === "pending" ? "expired" : invite.status}. Ask {invite.firm_name} to send a new one.
            </p>
          </>
        ) : (
          <>
            <CAHeading size={22} style={{ marginTop: 18 }}>{invite.firm_name} requests access</CAHeading>
            <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 8, lineHeight: 1.65 }}>
              {invite.client_name ? <><strong>{invite.client_name}</strong> — </> : null}
              {invite.firm_name} is asking to view your FynHelp financial data.
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint }}>Access level</span>
              <CABadge tone="teal">{invite.access_level ?? "read"}</CABadge>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
              <CAButton onClick={accept} disabled={working}>Accept access</CAButton>
              <CAButton variant="ghost" onClick={decline} disabled={working}>Decline</CAButton>
            </div>
          </>
        )}
      </CACard>
    </div>
  );
}
