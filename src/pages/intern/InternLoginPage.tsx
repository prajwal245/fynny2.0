import BackHomeLink from "@/components/BackHomeLink";
import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LOCKOUT_MS = 5 * 60 * 1000;

export default function InternLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const locked = lockedUntil !== null && now < lockedUntil;
  const remainingMin = locked ? Math.ceil((lockedUntil! - now) / 60000) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || loading) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) setLockedUntil(Date.now() + LOCKOUT_MS);
      toast.error(error?.message ?? "Invalid credentials");
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const allowed = ["intern", "admin", "super_admin", "blog_admin"];
    if (!roles?.some((r: any) => allowed.includes(r.role))) {
      await supabase.auth.signOut();
      toast.error("Access denied. Contact support@fynhelp.com");
      setLoading(false);
      return;
    }
    setLoading(false);
    navigate("/intern/resources");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#F4EDDA" }}>
      <BackHomeLink />
      <div
        style={{
          flex: "1 1 50%",
          background: "#171208",
          padding: "64px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "#fff",
        }}
      >
        <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700 }}>FYNHelp</div>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>
            Intern Portal
          </div>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 16,
              marginTop: 20,
              maxWidth: 420,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Manage FYNHelp resource content. Restricted to the content team.
          </p>
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          © {new Date().getFullYear()} FYNHelp
        </div>
      </div>

      <div style={{ flex: "1 1 50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <form
          onSubmit={handleSubmit}
          style={{
            width: "100%",
            maxWidth: 400,
            background: "#fff",
            border: "1px solid rgba(139,105,20,0.2)",
            borderRadius: 16,
            padding: 32,
          }}
        >
          <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "#171208" }}>
            Sign in
          </div>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: "rgba(23,18,8,0.6)",
              marginTop: 6,
              marginBottom: 24,
            }}
          >
            Use your FYNHelp intern credentials.
          </p>

          <label style={labelStyle}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />

          <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: 40 }}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "rgba(23,18,8,0.5)",
                padding: 6,
              }}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {locked && (
            <div
              style={{
                marginTop: 16,
                padding: 10,
                background: "rgba(169,56,56,0.08)",
                color: "#A93838",
                fontSize: 13,
                borderRadius: 8,
                fontFamily: "Inter, sans-serif",
              }}
            >
              Too many attempts. Wait {remainingMin} minute{remainingMin === 1 ? "" : "s"}.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || locked}
            style={{
              marginTop: 24,
              width: "100%",
              padding: "12px 16px",
              background: locked ? "rgba(169,56,56,0.4)" : "#A93838",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: locked || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign in to Intern Portal"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(23,18,8,0.7)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(23,18,8,0.15)",
  borderRadius: 8,
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  color: "#171208",
  background: "#fff",
  outline: "none",
};
