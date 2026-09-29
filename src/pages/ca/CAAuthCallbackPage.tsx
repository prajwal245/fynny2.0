import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { C } from "@/components/site/siteTheme";
import FynLogo from "@/components/FynLogo";
import { CA, CACard, CAHeading, CAButton, CAField, caInputStyle } from "@/components/ca/portalUi";

const sans = "'Instrument Sans','Inter',system-ui,sans-serif";

export default function CAAuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "onboard" | "error">("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [firmName, setFirmName] = useState("");
  const [caName, setCaName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      console.log("[fyn:auth] google oauth callback — checking session");
      // Wait for Supabase to hydrate the session from the OAuth redirect hash
      let session = null;
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        await new Promise((r) => setTimeout(r, 600));
        const { data } = await supabase.auth.getSession();
        if (data.session) { session = data.session; break; }
      }
      if (cancelled) return;
      if (!session?.user) { setStatus("error"); return; }

      const uid = session.user.id;
      const email = session.user.email ?? "";
      const fullName = (session.user.user_metadata?.full_name as string | undefined) ?? "";
      setUserId(uid);
      setUserEmail(email);
      setCaName(fullName);

      // Check for existing firm — try multiple times because RLS needs session to settle
      let existingFirm = null;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const { data } = await supabase
          .from("ca_firms")
          .select("id")
          .eq("user_id", uid)
          .maybeSingle();
        if (data?.id) { existingFirm = data; break; }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
      }

      if (cancelled) return;

      if (existingFirm?.id) {
        // Firm exists — also ensure the member row exists (repair if missing)
        const { data: existingMember } = await supabase
          .from("ca_firm_members")
          .select("id")
          .eq("ca_firm_id", existingFirm.id)
          .eq("user_id", uid)
          .maybeSingle();

        if (!existingMember?.id) {
          // Member row missing — create it silently before redirecting
          await supabase.from("ca_firm_members").insert({
            ca_firm_id: existingFirm.id,
            user_id: uid,
            invited_email: email,
            role: "partner",
            status: "active",
          });
        }

        navigate("/ca/dashboard", { replace: true });
        return;
      }

      setStatus("onboard");
    };
    check();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmName.trim()) { setFormError("Enter your firm name"); return; }
    if (!caName.trim()) { setFormError("Enter your name"); return; }
    if (!userId) return;
    setSaving(true);
    setFormError(null);

    try {
      // Check if firm already exists (handles double-submit race condition)
      const { data: existingFirm } = await supabase
        .from("ca_firms")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      let firmId = existingFirm?.id ?? null;

      if (!firmId) {
        // Create the firm
        const { data: firm, error: firmErr } = await supabase
          .from("ca_firms")
          .insert({
            user_id: userId,
            firm_name: firmName.trim(),
            ca_name: caName.trim(),
            membership_number: "",
            email: userEmail,
            is_verified: true,
            verification_status: "approved",
            onboarding_step: 1,
          })
          .select("id")
          .single();

        if (firmErr) {
          // If duplicate key — firm was created on a previous attempt
          if (firmErr.code === "23505") {
            const { data: retryFirm } = await supabase
              .from("ca_firms")
              .select("id")
              .eq("user_id", userId)
              .maybeSingle();
            firmId = retryFirm?.id ?? null;
            if (!firmId) throw new Error("Firm creation conflict — please try signing in again");
          } else {
            throw firmErr;
          }
        } else {
          firmId = firm.id;
        }
      }

      // Ensure member row exists — use upsert to handle duplicates gracefully
      const { error: memberErr } = await supabase
        .from("ca_firm_members")
        .upsert({
          ca_firm_id: firmId,
          user_id: userId,
          invited_email: userEmail,
          role: "partner",
          status: "active",
        }, { onConflict: "ca_firm_id,user_id", ignoreDuplicates: true });

      if (memberErr && memberErr.code !== "23505") {
        throw memberErr;
      }

      toast.success("Welcome to FynHelp. Your practice is ready.");
      navigate("/ca/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not create firm";
      setFormError(msg);
      console.error("[fyn:auth] handleCreate error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.page, fontFamily: sans }}>
        <div style={{ textAlign: "center" }}>
          <FynLogo variant="dark" size="sm" />
          <p style={{ marginTop: 20, fontSize: 14, color: C.body }}>Completing sign-in…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.page, fontFamily: sans }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <FynLogo variant="dark" size="sm" />
          <p style={{ marginTop: 20, fontSize: 14, color: C.maroon }}>Sign-in failed. Please try again.</p>
          <a href="/ca/login" style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: C.maroon, fontWeight: 600 }}>Back to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: CA.page, padding: "48px 22px" }}>
      <CACard style={{ width: "100%", maxWidth: 440, padding: 36 }}>
        <FynLogo variant="dark" size="sm" />
        <div style={{ fontFamily: CA.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: CA.teal, marginTop: 4 }}>
          Practice Portal
        </div>
        <CAHeading size={24} style={{ marginTop: 18 }}>One last step</CAHeading>
        <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 6, marginBottom: 24 }}>
          Tell us about your practice. You can add more details later.
        </p>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 16 }}>
          <CAField label="Your name">
            <input
              style={caInputStyle}
              value={caName}
              onChange={(e) => setCaName(e.target.value)}
              placeholder="CA Anita Rao"
              autoFocus
            />
          </CAField>
          <CAField label="Firm name">
            <input
              style={caInputStyle}
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="Rao and Associates"
            />
          </CAField>
          {formError && (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.red }}>{formError}</div>
          )}
          <CAButton type="submit" disabled={saving} style={{ height: 46, fontSize: 14 }}>
            {saving ? "Creating firm…" : "Get started"}
          </CAButton>
        </form>
        <p style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 16, textAlign: "center" }}>
          Signed in as {userEmail}
        </p>
      </CACard>
    </div>
  );
}
