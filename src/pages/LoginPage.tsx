import BackHomeLink from "@/components/BackHomeLink";
import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { Link, useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { Check, X, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setRememberMe } from "@/lib/sessionPolicy";
import FynLogo from "@/components/FynLogo";
import HCaptcha from "@/components/HCaptcha";
import { checkAuthSecurity } from "@/hooks/useAuthSecurity";
import { RULES, COMMON_WEAK, evaluateStrength } from "@/lib/passwordRules";

type Mode = "signin" | "signup";

const inputClass =
  "w-full h-[42px] px-4 pr-11 bg-fyn-beige-card border border-fyn-ink-10 rounded text-fyn-ink placeholder:text-fyn-ink-40 focus:outline-hidden focus:ring-2 focus:ring-fyn-red focus:border-fyn-red transition-colors disabled:opacity-60";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { ready: authReady } = useAuthRedirect("public-only");
  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "signup" ? "signup" : "signin");

  // Sign-in state
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siShowPw, setSiShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [siSubmitting, setSiSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [siCaptcha, setSiCaptcha] = useState<string | null>(null);
  const [suCaptcha, setSuCaptcha] = useState<string | null>(null);

  // Sign-up state
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suShowPw, setSuShowPw] = useState(false);
  const [suShowConfirm, setSuShowConfirm] = useState(false);
  const [pwTouched, setPwTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [suSubmitting, setSuSubmitting] = useState(false);

  const ruleResults = useMemo(
    () => RULES.map((r) => ({ ...r, passed: r.test(suPassword) })),
    [suPassword]
  );
  const passedCount = ruleResults.filter((r) => r.passed).length;
  const allRulesPassed = passedCount === RULES.length;
  const isCommonWeak = !!suPassword && COMMON_WEAK.has(suPassword.toLowerCase());
  const passwordsMatch = suPassword === suConfirm && suConfirm.length > 0;
  const strength = useMemo(() => evaluateStrength(suPassword, passedCount), [suPassword, passedCount]);
  const canSignUp =
    !!suName.trim() && isValidEmail(suEmail) && allRulesPassed && !isCommonWeak && passwordsMatch && !!suCaptcha && !suSubmitting;
  const canSignIn = isValidEmail(siEmail) && !!siPassword && !!siCaptcha && !siSubmitting;

  const routeAfterSignIn = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles").select("business_id").eq("user_id", userId).maybeSingle();
    const businessId = profile?.business_id;
    if (!businessId) {
      navigate("/onboarding");
      return;
    }
    const { data: biz } = await supabase
      .from("businesses").select("onboarding_completed").eq("id", businessId).maybeSingle();
    const rawRedirect = searchParams.get("redirect");
    const safeRedirect =
      rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
        ? rawRedirect
        : null;
    if (biz?.onboarding_completed) navigate(safeRedirect ?? "/dashboard/cockpit");
    else navigate("/onboarding");
  };


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = siEmail.trim();
    if (!isValidEmail(email)) { toast.error("Enter a valid email address."); return; }
    if (!siPassword) { toast.error("Enter your password."); return; }

    setSiSubmitting(true);
    const security = await checkAuthSecurity(email, "sign_in", siCaptcha ?? undefined);
    if (!security.allowed) {
      setSiSubmitting(false);
      toast.error(security.error ?? "Too many attempts. Please try again later.");
      return;
    }

    // "Remember me": if unchecked, the persisted auth token is purged when the
    // page unloads, so the session cannot outlive this browser session.
    setRememberMe(remember);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: siPassword });
    setSiSubmitting(false);
    if (error) {
      toast.error(error.message || "Could not sign in.");
      return;
    }
    if (data.user) {
      toast.success("Signed in.");
      await routeAfterSignIn(data.user.id);
    }
  };

  const handleForgot = async () => {
    const email = siEmail.trim();
    if (!isValidEmail(email)) { toast.error("Enter your email above first, then tap Forgot password."); return; }
    setResetting(true);
    const security = await checkAuthSecurity(email, "reset_password", siCaptcha ?? undefined);
    if (!security.allowed) {
      setResetting(false);
      toast.error(security.error ?? "Too many reset requests. Please try again later.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) { toast.error(error.message || "Could not send reset link."); return; }
    toast.success("If that email exists, a reset link is on its way.");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwTouched(true); setConfirmTouched(true);
    const email = suEmail.trim();
    if (!suName.trim()) { toast.error("Enter your full name."); return; }
    if (!isValidEmail(email)) { toast.error("Enter a valid email address."); return; }
    if (isCommonWeak) { toast.error("This password is too common. Please choose a less guessable one."); return; }
    if (!allRulesPassed) {
      const failed = ruleResults.find((r) => !r.passed);
      toast.error(failed ? `Password missing: ${failed.label.toLowerCase()}.` : "Password doesn't meet all requirements.");
      return;
    }
    if (!passwordsMatch) { toast.error("Passwords do not match."); return; }

    setSuSubmitting(true);
    const security = await checkAuthSecurity(email, "sign_up", suCaptcha ?? undefined);
    if (!security.allowed) {
      setSuSubmitting(false);
      toast.error(security.error ?? "Too many sign-up attempts. Please try again later.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: suPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { full_name: suName.trim() },
      },
    });
    setSuSubmitting(false);
    if (error) { toast.error(error.message || "Could not sign up."); return; }

    // If email confirmation is required, Supabase returns a user with no session.
    if (data.session) {
      toast.success("Account created. Let's set things up.");
      navigate("/onboarding");
    } else if (data.user) {
      toast.success("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
      setSiEmail(email);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-fyn-beige">
        <div className="text-sm text-fyn-ink/60">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-fyn-beige">
      <BackHomeLink />
      {/* Left dark panel */}
      <div className="bg-fyn-ink p-12 flex flex-col justify-center">
        <FynLogo variant="light" />
        <h2
          className="font-serif text-fyn-beige mt-8 mb-4"
          style={{ fontSize: "var(--fyn-type-h1)", lineHeight: 1.15 }}
        >
          Your financial clarity starts here.
        </h2>
        <p className="text-fyn-beige/60" style={{ fontSize: "var(--fyn-type-body)" }}>
          Connect your bank, payments, and accounting software. Get answers in seconds, not spreadsheets.
        </p>
      </div>

      {/* Right form panel */}
      <div className="bg-fyn-beige p-12 flex flex-col justify-center">
        <div className="max-w-md w-full">
          {/* Tabs */}
          <div className="flex border-b border-fyn-ink-10 mb-6" role="tablist">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
                  mode === m
                    ? "border-fyn-red text-fyn-ink font-medium"
                    : "border-transparent text-fyn-ink-60 hover:text-fyn-ink"
                }`}
                style={{ fontSize: "var(--fyn-type-body)" }}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <h2
            className="font-serif text-fyn-ink mb-6"
            style={{ fontSize: "var(--fyn-type-h2)", lineHeight: 1.2 }}
          >
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-5" noValidate>
              <div>
                <label htmlFor="si-email" className="block mb-1 text-fyn-ink-80" style={{ fontSize: "var(--fyn-type-small)" }}>
                  Email
                </label>
                <input
                  id="si-email"
                  type="email"
                  autoComplete="email"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inputClass}
                  style={{ fontSize: "var(--fyn-type-body)" }}
                />
              </div>
              <div>
                <label htmlFor="si-pw" className="block mb-1 text-fyn-ink-80" style={{ fontSize: "var(--fyn-type-small)" }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    id="si-pw"
                    type={siShowPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={siPassword}
                    onChange={(e) => setSiPassword(e.target.value)}
                    placeholder="Your password"
                    className={inputClass}
                    style={{ fontSize: "var(--fyn-type-body)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setSiShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-fyn-ink-60 hover:text-fyn-ink transition-colors"
                    aria-label={siShowPw ? "Hide password" : "Show password"}
                  >
                    {siShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-fyn-ink-80 cursor-pointer" style={{ fontSize: "var(--fyn-type-small)" }}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="accent-fyn-red"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={handleForgot}
                  disabled={resetting}
                  className="text-fyn-red hover:underline disabled:opacity-60"
                  style={{ fontSize: "var(--fyn-type-small)" }}
                >
                  {resetting ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <HCaptcha
                onVerify={(t) => setSiCaptcha(t)}
                onExpire={() => setSiCaptcha(null)}
                onError={() => setSiCaptcha(null)}
              />
              <button
                type="submit"
                disabled={!canSignIn}
                className="w-full bg-fyn-red text-fyn-beige h-[42px] rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontSize: "var(--fyn-type-body)" }}
              >
                {siSubmitting ? "Signing in…" : "Sign In"}
              </button>
              <p className="text-fyn-ink-60 text-center" style={{ fontSize: "var(--fyn-type-small)" }}>
                New to FynHelp?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-fyn-red hover:underline">
                  Create an account
                </button>
              </p>
              <p className="text-fyn-ink-60 text-center" style={{ fontSize: "var(--fyn-type-small)", marginTop: 4 }}>
                Signing in as a CA firm instead?{" "}
                <Link to="/ca/login" className="text-fyn-red hover:underline font-medium">
                  CA login
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-5" noValidate>
              <div>
                <label htmlFor="su-name" className="block mb-1 text-fyn-ink-80" style={{ fontSize: "var(--fyn-type-small)" }}>
                  Full name
                </label>
                <input
                  id="su-name"
                  type="text"
                  autoComplete="name"
                  value={suName}
                  onChange={(e) => setSuName(e.target.value)}
                  placeholder="Priya Sharma"
                  className={inputClass}
                  style={{ fontSize: "var(--fyn-type-body)" }}
                />
              </div>
              <div>
                <label htmlFor="su-email" className="block mb-1 text-fyn-ink-80" style={{ fontSize: "var(--fyn-type-small)" }}>
                  Work email
                </label>
                <input
                  id="su-email"
                  type="email"
                  autoComplete="email"
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inputClass}
                  style={{ fontSize: "var(--fyn-type-body)" }}
                />
              </div>
              <div>
                <label htmlFor="su-pw" className="block mb-1 text-fyn-ink-80" style={{ fontSize: "var(--fyn-type-small)" }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    id="su-pw"
                    type={suShowPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    onBlur={() => setPwTouched(true)}
                    placeholder="Create a strong password"
                    className={inputClass}
                    style={{ fontSize: "var(--fyn-type-body)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setSuShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-fyn-ink-60 hover:text-fyn-ink transition-colors"
                    aria-label={suShowPw ? "Hide password" : "Show password"}
                  >
                    {suShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {suPassword && (
                  <div className="mt-2" aria-live="polite">
                    <div className="flex gap-1" aria-hidden="true">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i <= strength.score ? strength.color : "bg-fyn-ink-10"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-fyn-ink-60" style={{ fontSize: "var(--fyn-type-tiny)" }}>
                      Strength:{" "}
                      <span
                        className={`font-medium ${
                          strength.score >= 3 ? "text-fyn-success"
                            : strength.score === 2 ? "text-fyn-gold" : "text-fyn-red"
                        }`}
                      >
                        {strength.label}
                      </span>
                      {isCommonWeak && <span className="text-fyn-red">, this is a commonly used password.</span>}
                    </p>
                  </div>
                )}

                <ul className="mt-3 space-y-1">
                  {ruleResults.map((r) => (
                    <li
                      key={r.key}
                      className={`flex items-center gap-2 ${
                        r.passed ? "text-fyn-success" : pwTouched ? "text-fyn-red" : "text-fyn-ink-60"
                      }`}
                      style={{ fontSize: "var(--fyn-type-tiny)" }}
                    >
                      {r.passed ? (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <X className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                      )}
                      <span>{r.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label htmlFor="su-confirm" className="block mb-1 text-fyn-ink-80" style={{ fontSize: "var(--fyn-type-small)" }}>
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="su-confirm"
                    type={suShowConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    onBlur={() => setConfirmTouched(true)}
                    placeholder="Re-enter password"
                    className={inputClass}
                    style={{ fontSize: "var(--fyn-type-body)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setSuShowConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-fyn-ink-60 hover:text-fyn-ink transition-colors"
                    aria-label={suShowConfirm ? "Hide password" : "Show password"}
                  >
                    {suShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmTouched && suConfirm.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-fyn-red" style={{ fontSize: "var(--fyn-type-tiny)" }}>
                    Passwords do not match.
                  </p>
                )}
                {suConfirm.length > 0 && passwordsMatch && (
                  <p className="mt-1 text-fyn-success inline-flex items-center gap-1" style={{ fontSize: "var(--fyn-type-tiny)" }}>
                    <Check className="w-3.5 h-3.5" /> Passwords match
                  </p>
                )}
              </div>

              <HCaptcha
                onVerify={(t) => setSuCaptcha(t)}
                onExpire={() => setSuCaptcha(null)}
                onError={() => setSuCaptcha(null)}
              />

              <button
                type="submit"
                disabled={!canSignUp}
                className="w-full bg-fyn-red text-fyn-beige h-[42px] rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontSize: "var(--fyn-type-body)" }}
              >
                {suSubmitting ? "Creating account…" : "Sign Up"}
              </button>
              <p className="text-fyn-ink-60 text-center" style={{ fontSize: "var(--fyn-type-small)" }}>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("signin")} className="text-fyn-red hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
