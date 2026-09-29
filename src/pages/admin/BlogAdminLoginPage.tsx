import BackHomeLink from "@/components/BackHomeLink";
import { FormEvent, useState } from "react";
import { useNavigate, Link } from "@/lib/router-compat";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import HCaptcha from "@/components/HCaptcha";
import { checkAuthSecurity } from "@/hooks/useAuthSecurity";

const INK = "#171208";
const RED = "#C41E1E";
const BEIGE = "#F4EDDA";
const GOLD = "#8B6914";

export default function BlogAdminLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setCaptchaError(null);

    if (!captchaToken) {
      setCaptchaError("Please complete the CAPTCHA verification.");
      return;
    }

    setBusy(true);

    const security = await checkAuthSecurity(email.trim(), "blog_admin_login", captchaToken);
    if (!security.allowed) {
      setBusy(false);
      setErr(security.error ?? "Too many attempts. Please wait before trying again.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });

    if (error || !data.user) {
      setBusy(false);
      setErr(error?.message ?? "Sign in failed. Check your credentials.");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const permitted = (roles ?? []).some((r: { role: string }) =>
      ["super_admin", "admin", "blog_admin"].includes(r.role),
    );

    if (!permitted) {
      await supabase.auth.signOut();
      setBusy(false);
      setErr("Access denied. This account does not have blog admin permissions. Contact support@fynhelp.com if you believe this is an error.");
      return;
    }

    nav("/blog-admin/editor", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: INK }}>
      <BackHomeLink />
      <div
        className="hidden lg:flex"
        style={{ width: "40%", minHeight: "100vh", background: "#171208", flexDirection: "column", justifyContent: "space-between", padding: "48px" }}
      >
        <Link to="/" style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 26, color: BEIGE, textDecoration: "none" }}>
          FYNHelp
        </Link>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: GOLD, marginBottom: 12 }}>
            Content team
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 40, color: "#FFFFFF", lineHeight: 1.1, margin: 0 }}>
            Blog Admin Portal
          </h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, color: "rgba(244,237,218,0.7)", marginTop: 16, lineHeight: 1.6 }}>
            FYNHelp content team access. Write, edit, publish, and manage blog content.
          </p>
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(244,237,218,0.35)" }}>
          FYNHelp internal use only
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: BEIGE }}>
        <div style={{ width: "100%", maxWidth: 440, background: "#FFFFFF", borderRadius: 16, border: "1px solid rgba(23,18,8,0.15)", padding: "36px" }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 26, color: INK, margin: "0 0 8px 0" }}>
              Sign in to Blog Admin
            </h2>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.55)", margin: 0 }}>
              Use your FYNHelp content team credentials.
            </p>
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, color: "rgba(23,18,8,0.7)", display: "block", marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="blogadmin@fynhelp.com"
                autoComplete="email"
                style={{ width: "100%", height: 48, padding: "0 14px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 10, fontFamily: "Inter, sans-serif", fontSize: 15, color: INK, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, color: "rgba(23,18,8,0.7)", display: "block", marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="current-password"
                  style={{ width: "100%", height: 48, padding: "0 48px 0 14px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 10, fontFamily: "Inter, sans-serif", fontSize: 15, color: INK, outline: "none", boxSizing: "border-box" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "rgba(23,18,8,0.4)", display: "flex", alignItems: "center" }}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {err && (
              <div role="alert" style={{ background: "rgba(196,30,30,0.07)", border: "1px solid rgba(196,30,30,0.2)", borderRadius: 10, padding: "12px 14px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#991B1B", lineHeight: 1.55 }}>
                {err}
              </div>
            )}

            <HCaptcha
              onVerify={(token) => { setCaptchaToken(token); setCaptchaError(null); }}
              onExpire={() => setCaptchaToken(null)}
            />
            {captchaError && (
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: RED, textAlign: "center", margin: 0 }}>
                {captchaError}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{ width: "100%", height: 50, background: busy ? "rgba(196,30,30,0.65)" : RED, color: "#FFFFFF", border: "none", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, cursor: busy ? "not-allowed" : "pointer", transition: "background 0.15s" }}
            >
              {busy ? "Signing in..." : "Sign in to Blog Admin"}
            </button>
          </form>

          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(23,18,8,0.4)", textAlign: "center", marginTop: 20 }}>
            Forgot your password? Contact support@fynhelp.com
          </p>
        </div>
      </div>
    </div>
  );
}
