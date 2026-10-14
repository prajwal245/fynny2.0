/**
 * Admin sign-in: password (checked and counted on the server, 5 failures lock
 * the account for 15 minutes). An admin who has an authenticator set up also
 * enters its 6-digit code. With ADMIN_REQUIRE_MFA=true every admin must set
 * one up first. Only then does the server open an admin session.
 */
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck, Lock } from "lucide-react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import BackHomeLink from "@/components/BackHomeLink";
import { supabase } from "@/integrations/supabase/client";
import { adminNetworkCheck, adminPasswordLogin, adminStartSession, adminWhoAmI } from "@/lib/admin/admin.functions";
import { adminError } from "@/components/admin/adminClient";

type Step = "password" | "enroll" | "verify" | "blocked";

const ink = "#171208";
const maroon = "#8A1E18";

export default function AdminLoginPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  const { pathname } = useLocation();
  useEffect(() => {
    // Why the last admin session ended (idle, revoked, role changed), left by the session gate.
    try {
      const reason = sessionStorage.getItem("fh-admin-reason");
      if (reason) {
        setNotice(reason);
        sessionStorage.removeItem("fh-admin-reason");
      }
    } catch {
      /* storage blocked */
    }
  }, [pathname]);

  useEffect(() => {
    adminNetworkCheck()
      .then((r) => {
        if (!r.allowed) setStep("blocked");
        setMfaRequired(!!r.mfaRequired);
      })
      .catch(() => null);
    // Already fully signed in (password, code and a live admin session)? Go straight in.
    adminWhoAmI()
      .then(() => nav("/admin/control", { replace: true }))
      .catch(() => null);
  }, [nav]);

  const afterPassword = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const verified = data.totp.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setStep("verify");
      return;
    }
    if (!mfaRequired) {
      // Two-step sign-in is optional: no authenticator set up, so the password is enough.
      for (const f of data.all.filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      await adminStartSession();
      nav("/admin/control", { replace: true });
      return;
    }
    // Clear a half-finished setup from an earlier attempt, then start a fresh one.
    for (const f of data.all.filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const en = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `FynHelp admin ${new Date().toISOString().slice(0, 10)}` });
    if (en.error) throw en.error;
    setFactorId(en.data.id);
    setQr(en.data.totp.qr_code);
    setSecret(en.data.totp.secret);
    setStep("enroll");
  };

  const onPassword = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    setBusy(true);
    try {
      const t = await adminPasswordLogin({ data: { email: email.trim(), password: pw } });
      const { error } = await supabase.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token });
      if (error) throw error;
      setPw("");
      await afterPassword();
    } catch (e2) {
      setErr(adminError(e2));
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setErr("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new Error("That code did not match. Codes change every 30 seconds; try the current one.");
      await adminStartSession();
      nav("/admin/control", { replace: true });
    } catch (e2) {
      setErr(adminError(e2));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    await supabase.auth.signOut().catch(() => null);
    setStep("password");
    setCode("");
    setErr(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#F0EBE0", color: ink }}>
      <div className="w-full max-w-md">
        <div className="mb-6">
          <BackHomeLink />
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ border: "1px solid rgba(23,18,8,.08)" }}>
          <div className="flex items-center gap-2 mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: maroon }}>
            <ShieldCheck size={15} /> FynHelp internal
          </div>
          <h1 className="text-2xl font-semibold mb-1">Admin sign in</h1>
          <p className="text-sm mb-6 opacity-70">For the FynHelp team only. Every sign-in and action is recorded.</p>

          {notice && <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(138,30,24,.07)" }} data-testid="admin-notice">{notice}</div>}
          {err && <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(138,30,24,.1)", color: maroon }} role="alert" data-testid="admin-error">{err}</div>}

          {step === "blocked" && (
            <p className="text-sm" data-testid="admin-blocked">
              <Lock size={14} className="inline mr-1" /> The admin panel cannot be reached from this network. Connect from an approved office network or VPN.
            </p>
          )}

          {step === "password" && (
            <form onSubmit={onPassword} className="grid gap-4">
              <label className="grid gap-1 text-sm">
                Work email
                <input className="rounded-lg border px-3 py-2.5" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email" />
              </label>
              <label className="grid gap-1 text-sm">
                Password
                <div className="relative">
                  <input
                    className="w-full rounded-lg border px-3 py-2.5 pr-10"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    data-testid="admin-password"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-60" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <button className="rounded-lg py-2.5 text-white font-semibold disabled:opacity-60" style={{ background: maroon }} disabled={busy} data-testid="admin-continue">
                {busy ? "Checking…" : "Continue"}
              </button>
              <p className="text-xs opacity-60">
                After 5 wrong passwords, sign-in is locked for 15 minutes. First time, or forgot your password?{" "}
                <a href="/admin/setup" className="underline" data-testid="admin-setup-link">Set up your password</a>
              </p>
            </form>
          )}

          {step === "enroll" && (
            <form onSubmit={onCode} className="grid gap-4" data-testid="admin-enroll">
              <p className="text-sm">
                Two-step sign-in is required for every admin. Scan this with Google Authenticator, Authy or 1Password, then enter the 6-digit code it shows.
              </p>
              {qr && <img src={qr} alt="Authenticator QR code" className="mx-auto h-44 w-44" />}
              {secret && (
                <p className="text-xs text-center opacity-70">
                  Can't scan? Enter this key: <code className="select-all font-mono" data-testid="admin-totp-secret">{secret}</code>
                </p>
              )}
              <CodeInput code={code} setCode={setCode} />
              <button className="rounded-lg py-2.5 text-white font-semibold disabled:opacity-60" style={{ background: maroon }} disabled={busy} data-testid="admin-verify">
                {busy ? "Verifying…" : "Turn on two-step sign-in"}
              </button>
              <button type="button" className="text-xs underline opacity-70" onClick={() => void restart()}>Use a different account</button>
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={onCode} className="grid gap-4" data-testid="admin-mfa">
              <p className="text-sm">Enter the 6-digit code from your authenticator app.</p>
              <CodeInput code={code} setCode={setCode} />
              <button className="rounded-lg py-2.5 text-white font-semibold disabled:opacity-60" style={{ background: maroon }} disabled={busy} data-testid="admin-verify">
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button type="button" className="text-xs underline opacity-70" onClick={() => void restart()}>Use a different account</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeInput({ code, setCode }: { code: string; setCode: (v: string) => void }) {
  return (
    <input
      className="rounded-lg border px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="••••••"
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
      autoFocus
      aria-label="6-digit code"
      data-testid="admin-code"
    />
  );
}
