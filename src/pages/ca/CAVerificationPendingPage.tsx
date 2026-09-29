import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { Check, Loader2, LifeBuoy, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";

export default function CAVerificationPendingPage() {
  const navigate = useNavigate();
  const { user, caFirm, refreshFirm } = useCAAuth();
  const [checking, setChecking] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!user) { navigate("/ca/login"); return; }
    setChecking(true);
    const { data } = await supabase
      .from("ca_firms")
      .select("id, verification_status, verification_rejected_reason, membership_number")
      .eq("user_id", user.id).maybeSingle();
    setChecking(false);
    if (!data) return;
    setStatus(data.verification_status ?? "pending");
    setRejectedReason(data.verification_rejected_reason ?? null);
    setRefCode(data.membership_number ? `CA-${data.membership_number}` : data.id.slice(0, 8).toUpperCase());
    if (data.verification_status === "approved") {
      toast.success("Verification approved");
      refreshFirm();
      navigate("/ca/dashboard");
    } else if (data.verification_status === "incomplete") {
      navigate("/ca/onboarding");
    } else if (data.verification_status === "rejected") {
      // stay on page and show reason
    }
  };

  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, [user?.id]);

  // Signups are auto-approved now: anyone already approved goes straight to the portal.
  useEffect(() => {
    if (caFirm?.is_verified) navigate("/ca/dashboard");
  }, [caFirm?.is_verified]); // eslint-disable-line

  const steps = [
    { label: "Application submitted", state: "done" as const },
    { label: status === "rejected" ? "Verification could not be completed" : "Document verification in progress", state: status === "rejected" ? "error" as const : "current" as const },
    { label: "Account activated", state: "pending" as const },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F4EDDA", padding: "60px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ background: "#fff", border: "0.5px solid rgba(23,18,8,0.08)", borderRadius: 12, padding: 32 }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C41E1E", fontWeight: 700 }}>Verification</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: "#171208", marginTop: 8 }}>Application under review</h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "rgba(23,18,8,0.7)", lineHeight: 1.6, marginTop: 8 }}>
            Our compliance team is reviewing your ICAI credentials. This typically takes 1 to 2 business days.
          </p>

          {refCode && (
            <div style={{ marginTop: 20, padding: "14px 16px", background: "#FCFAF4", border: "1px solid rgba(23,18,8,0.1)", borderRadius: 10 }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(23,18,8,0.55)", fontWeight: 600 }}>Application reference</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: "#171208", marginTop: 4 }}>{refCode}</div>
            </div>
          )}

          {status === "rejected" && rejectedReason && (
            <div style={{ marginTop: 20, padding: 14, background: "#FDF0F0", border: "1px solid #E8B8B8", borderRadius: 10, fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#8B1E1E" }}>
              <strong>Reason:</strong> {rejectedReason}
            </div>
          )}

          {/* Timeline */}
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 4 }}>
            {steps.map((s, i) => (
              <div key={s.label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: s.state === "done" ? "#1A6B3C" : s.state === "current" ? "#F4C24A" : s.state === "error" ? "#C41E1E" : "#E5DBC5",
                    display: "grid", placeItems: "center", color: "#fff",
                  }}>
                    {s.state === "done" ? <Check size={14} /> :
                     s.state === "current" ? <Loader2 size={12} className="animate-spin" /> :
                     s.state === "error" ? <span style={{ fontSize: 14, fontWeight: 700 }}>!</span> :
                     <span style={{ width: 6, height: 6, background: "rgba(23,18,8,0.35)", borderRadius: "50%" }} />}
                  </div>
                  {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 24, background: "rgba(23,18,8,0.1)" }} />}
                </div>
                <div style={{ padding: "2px 0 24px" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: "#171208" }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={loadStatus} disabled={checking}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 18px", background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: checking ? 0.6 : 1 }}>
              {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Check status
            </button>
            <a href="mailto:support@fynhelp.com"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 18px", background: "transparent", color: "#171208", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
              <LifeBuoy size={14} /> Contact support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
