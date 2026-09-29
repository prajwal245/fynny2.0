import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import HCaptcha from "@/components/HCaptcha";
import { checkAuthSecurity } from "@/hooks/useAuthSecurity";
import { CA, CACard, CAHeading, CAButton, CAField, caInputStyle } from "@/components/ca/portalUi";
import FynLogo from "@/components/FynLogo";
import { GoogleAuthButton } from "@/components/ca/GoogleAuthButton";

export default function CARegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    caName: "", email: "", password: "", firmName: "",
    phone: "", city: "", state: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.caName.trim()) e.caName = "Full name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    if (!form.firmName.trim()) e.firmName = "Firm name is required";
    
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) e.phone = "Enter a 10-digit phone number";
    if (!form.city.trim()) e.city = "City is required";
    if (!form.state.trim()) e.state = "State is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    if (!captcha) { setErrors((e) => ({ ...e, form: "Please complete the CAPTCHA" })); return; }
    setLoading(true);
    try {
      const security = await checkAuthSecurity(form.email.trim(), "ca_register", captcha);
      if (!security.allowed) {
        setCaptcha(null);
        throw new Error(security.error ?? "Too many attempts. Please try again later.");
      }
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { emailRedirectTo: `${window.location.origin}/ca/dashboard` },
      });
      if (signUpErr) throw signUpErr;

      let userId = signUpData.user?.id ?? null;
      if (!signUpData.session) {
        const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
          email: form.email.trim(), password: form.password,
        });
        if (signInErr) throw signInErr;
        userId = signIn.user?.id ?? userId;
      }
      if (!userId) throw new Error("Could not create account");

      const { data: firm, error: firmErr } = await supabase
        .from("ca_firms")
        .insert({
          user_id: userId,
          firm_name: form.firmName.trim(),
          ca_name: form.caName.trim(),
          membership_number: "",
          phone: form.phone.trim(),
          email: form.email.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          is_verified: true,
          verification_status: "approved",
          onboarding_step: 1,
        })
        .select("id")
        .single();
      if (firmErr) throw firmErr;

      const { error: memberErr } = await supabase.from("ca_firm_members").insert({
        ca_firm_id: firm.id,
        user_id: userId,
        invited_email: form.email.trim(),
        role: "admin",
        status: "active",
      });
      if (memberErr) throw memberErr;

      toast.success("CA firm registered");
      navigate("/ca/dashboard", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Registration failed");
      setErrors((s) => ({ ...s, form: e?.message ?? "Registration failed" }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: CA.page }}>
      <CACard style={{ width: "100%", maxWidth: 560, padding: 36 }}>
        <FynLogo variant="dark" size="sm" />
        <div style={{ fontFamily: CA.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: CA.teal, marginTop: 2 }}>
          Practice Portal
        </div>
        <CAHeading size={26} style={{ marginTop: 18 }}>Register your firm</CAHeading>
        <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 6 }}>
          For CA firms, accountants, articleship holders, and accounting practices.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "grid", gap: 16 }}>
          <GoogleAuthButton mode="register" onStart={() => setLoading(true)} />
          <p style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.42)", textAlign: "center", margin: "2px 0 0" }}>
            Your firm profile will be created automatically after Google sign-in.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(23,18,8,0.09)" }} />
            <span style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.38)", fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(23,18,8,0.09)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <CAField label="Full name" error={errors.caName}>
              <input style={caInputStyle} value={form.caName} onChange={set("caName")} placeholder="CA Anita Rao" />
            </CAField>
            <CAField label="Firm name" error={errors.firmName}>
              <input style={caInputStyle} value={form.firmName} onChange={set("firmName")} placeholder="Rao & Associates" />
            </CAField>
            <CAField label="Email" error={errors.email}>
              <input style={caInputStyle} type="email" value={form.email} onChange={set("email")} placeholder="you@cafirm.com" />
            </CAField>
            <CAField label="Password" error={errors.password}>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...caInputStyle, paddingRight: 42 }}
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", cursor: "pointer", color: CA.muted,
                    display: "flex", alignItems: "center",
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </CAField>

            <CAField label="Phone" error={errors.phone}>
              <input style={caInputStyle} value={form.phone} onChange={set("phone")} placeholder="9876543210" />
            </CAField>
            <CAField label="City" error={errors.city}>
              <input style={caInputStyle} value={form.city} onChange={set("city")} placeholder="Bengaluru" />
            </CAField>
            <CAField label="State" error={errors.state}>
              <input style={caInputStyle} value={form.state} onChange={set("state")} placeholder="Karnataka" />
            </CAField>
          </div>

          <HCaptcha onVerify={setCaptcha} onExpire={() => setCaptcha(null)} onError={() => setCaptcha(null)} />

          {errors.form && (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.red }}>{errors.form}</div>
          )}

          <CAButton type="submit" disabled={loading || !captcha} style={{ height: 46, fontSize: 14 }}>
            {loading ? "Creating account…" : "Create account"}
          </CAButton>
        </form>

        <p style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 18, textAlign: "center" }}>
          Already registered?{" "}
          <Link to="/ca/login" style={{ color: CA.teal, fontWeight: 600 }}>Sign in</Link>
        </p>
      </CACard>
    </div>
  );
}
