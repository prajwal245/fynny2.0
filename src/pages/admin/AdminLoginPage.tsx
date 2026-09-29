import BackHomeLink from "@/components/BackHomeLink";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import { Eye, EyeOff, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { logAdminAction } from "@/lib/adminAudit";
import HCaptcha from "@/components/HCaptcha";
import { checkAuthSecurity } from "@/hooks/useAuthSecurity";

export default function AdminLoginPage() {
  const { user, isAdmin, loading: adminLoading, refresh } = useAdminAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { denied?: boolean } };
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(loc.state?.denied
    ? "Access denied. This account is not authorized for the admin portal."
    : null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminLoading && user && isAdmin) nav("/admin/dashboard", { replace: true });
  }, [adminLoading, user, isAdmin, nav]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setNeedsVerify(false); setCaptchaError(null);
    if (!captchaToken) { setCaptchaError("Please complete the CAPTCHA verification."); return; }
    setBusy(true);
    const security = await checkAuthSecurity(email.trim(), "admin_login", captchaToken ?? undefined);
    if (!security.allowed) {
      setBusy(false);
      setErr(security.error ?? "Too many attempts. Please try again later.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: pw,
    });
    if (error || !data.user) {
      setBusy(false);
      const msg = error?.message ?? "Sign in failed";
      if (/email not confirmed|not confirmed|email_not_confirmed/i.test(msg)) {
        setNeedsVerify(true);
        setErr("Please verify your email. Check your inbox for the verification link.");
      } else {
        setErr(msg);
      }
      return;
    }
    // Verify admin role
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    const isAdminRole = (roles ?? []).some((r: { role: string }) =>
      ["super_admin","admin","ops_admin","support_agent","analyst"].includes(r.role));
    if (!isAdminRole) {
      await supabase.auth.signOut();
      setBusy(false);
      setErr("Access denied. This account is not authorized for the admin portal.");
      return;
    }
    await logAdminAction({ action: "admin_login", target_type: "auth", target_id: data.user.id });
    await refresh();
    nav("/admin/dashboard", { replace: true });
  };

  const resendVerification = async () => {
    if (!email.trim()) {
      toast.error("Enter your email above first");
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin/login` },
    });
    if (error) toast.error(error.message);
    else toast.success("Verification email sent. Check your inbox.");
  };

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset link sent to your email");
    setShowForgot(false);
    setResetEmail("");
  };

  return (
    <div className="min-h-screen flex" style={{ background: "hsl(var(--fyn-ink))" }}>
      <BackHomeLink />
      {/* Branding side */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ width: "40%", background: "linear-gradient(160deg, #171208 0%, #2A1A0F 100%)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 80% 20%, rgba(139,105,20,0.18), transparent 55%)," +
              "radial-gradient(circle at 20% 80%, rgba(196,30,30,0.15), transparent 50%)",
          }}
        />
        <div className="relative">
          <Link
            to="/"
            style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 28, color: "#fff" }}
          >FYNHelp</Link>
        </div>
        <div className="relative">
          <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 48, color: "#fff", lineHeight: 1.05 }}>
            Admin Portal
          </h1>
          <p
            className="mt-4 max-w-md"
            style={{ fontFamily: "Raleway, sans-serif", fontSize: 18, color: "hsl(var(--fyn-beige))" }}
          >Secure access for FYNHelp team members.</p>
        </div>
        <div
          className="relative"
          style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "rgba(244,237,218,0.5)" }}
        >© FYNHelp · Internal use only</div>
      </div>

      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          className="w-full"
          style={{
            maxWidth: 480,
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(20px) saturate(110%)",
            borderRadius: 20,
            border: "1px solid rgba(139,105,20,0.18)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
            padding: 40,
          }}
        >
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: "hsl(var(--fyn-ink))" }}>
            Sign in to Admin Portal
          </h2>
          <p
            className="mt-2 mb-7"
            style={{ fontFamily: "Raleway, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}
          >Use your FYNHelp team credentials.</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <Field label="Email address">
              <input
                type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@fynhelp.com" autoComplete="email"
                style={inputStyle}
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} required value={pw}
                  onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: 48 }}
                />
                <button
                  type="button" onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <div style={{ textAlign: "right", marginTop: -8 }}>
              <button
                type="button"
                onClick={() => { setResetEmail(email); setShowForgot(true); }}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  color: "#8B6914", fontSize: 12, cursor: "pointer",
                  textDecoration: "underline", fontFamily: "DM Sans, sans-serif",
                }}
              >
                Forgot password?
              </button>
            </div>
            {err && (
              <div
                role="alert"
                style={{
                  background: "rgba(220,38,38,0.08)",
                  border: "1px solid rgba(220,38,38,0.25)",
                  color: "#991B1B",
                  padding: "12px 14px",
                  borderRadius: 10,
                  fontFamily: "Roboto, sans-serif", fontSize: 14,
                }}
              >
                <div>{err}</div>
                {needsVerify && (
                  <button
                    type="button"
                    onClick={resendVerification}
                    style={{
                      marginTop: 8, background: "transparent",
                      border: "1px solid rgba(153,27,27,0.4)", color: "#991B1B",
                      padding: "6px 12px", borderRadius: 8, fontSize: 13,
                      cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600,
                    }}
                  >
                    Resend verification email
                  </button>
                )}
              </div>
            )}
            <HCaptcha onVerify={(token) => { setCaptchaToken(token); setCaptchaError(null); }} onExpire={() => setCaptchaToken(null)} />
            {captchaError && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#C41E1E", textAlign: "center" }}>{captchaError}</p>}
            <button
              type="submit" disabled={busy}
              style={{
                width: "100%", height: 52, borderRadius: 12, color: "#fff",
                background: busy
                  ? "rgba(196,30,30,0.7)"
                  : "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
                fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 16,
                boxShadow: "0 4px 14px rgba(196,30,30,0.3)",
              }}
            >{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </div>

      {showForgot && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowForgot(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 100,
          }}
        >
          <form
            onSubmit={sendReset}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16,
              padding: 28, position: "relative",
              border: "1px solid rgba(139,105,20,0.18)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
            }}
          >
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              aria-label="Close"
              style={{
                position: "absolute", top: 12, right: 12,
                background: "transparent", border: "none", cursor: "pointer",
                color: "hsl(var(--fyn-ink) / 0.6)", padding: 6,
              }}
            >
              <X size={18} />
            </button>
            <h3 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 24, color: "hsl(var(--fyn-ink))" }}>
              Reset your password
            </h3>
            <p style={{ marginTop: 6, marginBottom: 18, fontFamily: "Raleway, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.65)" }}>
              Enter your admin email and we'll send you a reset link.
            </p>
            <Field label="Email address">
              <input
                type="email" required autoFocus value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="admin@fynhelp.com"
                style={inputStyle}
              />
            </Field>
            <button
              type="submit" disabled={resetBusy}
              style={{
                marginTop: 18, width: "100%", height: 48, borderRadius: 12, color: "#fff",
                background: resetBusy
                  ? "rgba(196,30,30,0.7)"
                  : "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
                fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 15,
                border: "none", cursor: resetBusy ? "not-allowed" : "pointer",
              }}
            >
              {resetBusy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 52, padding: "0 16px", borderRadius: 12,
  border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
  fontFamily: "Roboto, sans-serif", fontSize: 16, color: "hsl(var(--fyn-ink))",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block mb-1.5"
        style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}
      >{label}</span>
      {children}
    </label>
  );
}
