import { useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { authErrorMessage } from "@/lib/authErrors";
import HCaptcha from "@/components/HCaptcha";
import { checkAuthSecurity } from "@/hooks/useAuthSecurity";
import { C } from "@/components/site/siteTheme";
import FynLogo from "@/components/FynLogo";
import BackHomeLink from "@/components/BackHomeLink";
import { GoogleAuthButton } from "@/components/ca/GoogleAuthButton";
import { setRememberMe } from "@/lib/sessionPolicy";

const sans = "'Instrument Sans','Inter',system-ui,sans-serif";
const serif = "'Fraunces',Georgia,serif";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: sans,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.muted,
  marginBottom: 7,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 14px",
  borderRadius: 12,
  border: `1px solid ${C.line}`,
  background: C.page,
  fontFamily: sans,
  fontSize: 14,
  color: C.ink,
  outline: "none",
  boxSizing: "border-box",
};

export default function CALoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // Default: keep signed in for 30 days. A previous session-only choice does
  // not carry over — the box starts checked every visit.
  const [rememberMe, setRememberMeState] = useState<boolean>(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address");
    if (!password) return setError("Enter your password");
    if (!captcha) return setError("Please complete the CAPTCHA");
    setLoading(true);
    const security = await checkAuthSecurity(email.trim(), "ca_login", captcha);
    if (!security.allowed) {
      setLoading(false);
      setError(security.error ?? "Too many attempts. Please try again later.");
      setCaptcha(null);
      return;
    }
    setRememberMe(rememberMe);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInErr) {
      setError(authErrorMessage(signInErr.message, "signin"));
      setCaptcha(null);
      return;
    }
    // If the account has a verified authenticator, the session must reach aal2.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (totp) {
        setMfaFactorId(totp.id);
        return;
      }
    }

    toast.success("Signed in");
    navigate("/ca/dashboard", { replace: true });
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError(null);
    if (mfaCode.trim().length < 6) return setError("Enter the 6-digit code from your authenticator app");
    setLoading(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chErr || !ch) {
      setLoading(false);
      return setError(chErr?.message ?? "Could not start verification");
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId, challengeId: ch.id, code: mfaCode.trim(),
    });
    setLoading(false);
    if (verifyErr) return setError("That code is not valid. Try the current code from your app.");
    toast.success("Signed in");
    navigate("/ca/dashboard", { replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        background: C.page,
        fontFamily: sans,
        color: C.ink,
      }}
      className="ca-login-root"
    >
      <BackHomeLink />
      <style>{`
        @media (max-width: 860px) { .ca-login-root { grid-template-columns: 1fr !important; } .ca-login-side { display: none !important; } }
        .ca-login-input:focus { border-color: ${C.maroon} !important; box-shadow: 0 0 0 3px rgba(169,56,56,0.12); }
        .ca-login-btn:hover:not(:disabled) { background: ${C.maroonDeep} !important; transform: translateY(-1px); }
      `}</style>

      {/* Left maroon brand panel */}
      <div
        className="ca-login-side"
        style={{
          padding: "56px 52px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: C.onDark,
          background: `radial-gradient(80% 120% at 100% 0%, rgba(226,103,63,.34), transparent 60%), linear-gradient(140deg, #7C1F20 0%, ${C.maroonDeep} 62%, #350B0E 100%)`,
        }}
      >
        <FynLogo variant="light" size="sm" />
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(247,241,230,0.55)",
            }}
          >
            <span style={{ width: 14, height: 1, background: "currentColor", opacity: 0.6 }} />
            CA Portal
          </div>
          <h1
            style={{
              fontFamily: sans,
              fontSize: "clamp(32px,3.6vw,46px)",
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1.06,
              margin: "18px 0 0",
              maxWidth: "14ch",
            }}
          >
            Your practice,{" "}
            <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 300, color: "rgba(247,241,230,0.55)" }}>
              one ledger.
            </span>
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: "rgba(247,241,230,0.62)", maxWidth: "40ch", marginTop: 18 }}>
            Clients, filings, reconciliation and chasers — the whole firm runs from here.
          </p>
        </div>
        <div style={{ fontSize: 12, color: "rgba(247,241,230,0.4)" }}>
          © {new Date().getFullYear()} FynHelp
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 22px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 22,
            padding: 36,
            boxShadow: "0 30px 55px -42px rgba(23,18,8,0.6)",
          }}
        >
          <h2 style={{ fontFamily: sans, fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>
            {mfaFactorId ? "Two-factor check" : "Sign in"}
          </h2>
          <p style={{ fontFamily: sans, fontSize: 13.5, color: C.body, marginTop: 8 }}>
            {mfaFactorId
              ? "Enter the current code from your authenticator app."
              : "Access your firm's client portfolio."}
          </p>

          {mfaFactorId ? (
            <form onSubmit={verifyMfa} style={{ marginTop: 24, display: "grid", gap: 16 }}>
              <div>
                <label style={labelStyle}>Authentication code</label>
                <input
                  className="ca-login-input"
                  style={{ ...inputStyle, fontVariantNumeric: "tabular-nums", letterSpacing: "0.2em" }}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={mfaCode}
                  onChange={(ev) => setMfaCode(ev.target.value.replace(/\D/g, ""))}
                  placeholder="6-digit code"
                />
              </div>
              {error && <div style={{ fontFamily: sans, fontSize: 13, color: C.maroon }}>{error}</div>}
              <button type="submit" disabled={loading} className="ca-login-btn" style={primaryBtn(loading)}>
                {loading ? "Verifying…" : "Verify & continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "grid", gap: 16 }}>
              <GoogleAuthButton mode="signin" onStart={() => setLoading(true)} />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: "1px", background: "rgba(23,18,8,0.09)" }} />
                <span style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.38)", fontWeight: 500 }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "rgba(23,18,8,0.09)" }} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  className="ca-login-input"
                  style={inputStyle}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@cafirm.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="ca-login-input"
                    style={{ ...inputStyle, paddingRight: 42 }}
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                      background: "transparent", border: "none", cursor: "pointer", color: C.muted,
                      display: "flex", alignItems: "center",
                    }}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => {
                    setRememberMeState(e.target.checked);
                    setRememberMe(e.target.checked);
                  }}
                  style={{ width: 16, height: 16, accentColor: C.maroon, cursor: "pointer", flexShrink: 0 }}
                />
                <label
                  htmlFor="remember-me"
                  style={{ fontFamily: sans, fontSize: 13, color: C.muted, cursor: "pointer", userSelect: "none", lineHeight: 1.4 }}
                >
                  Keep me signed in for 30 days
                </label>
              </div>

              <HCaptcha onVerify={setCaptcha} onExpire={() => setCaptcha(null)} onError={() => setCaptcha(null)} />

              {error && <div style={{ fontFamily: sans, fontSize: 13, color: C.maroon }}>{error}</div>}
              <button type="submit" disabled={loading || !captcha} className="ca-login-btn" style={primaryBtn(loading || !captcha)}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 18, textAlign: "center" }}>
            New CA firm?{" "}
            <Link to="/ca/register" style={{ color: C.maroon, fontWeight: 600 }}>Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    height: 46,
    borderRadius: 999,
    border: "none",
    background: disabled ? "rgba(23,18,8,0.3)" : "#171208",
    color: "#F7F1E6",
    fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif",
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "transform .45s cubic-bezier(.16,1,.3,1), background .25s",
  };
}
