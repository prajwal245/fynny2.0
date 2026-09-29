import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import FynLogo from "@/components/FynLogo";
import { toast } from "sonner";
import { Check, X, Eye, EyeOff, MailWarning, Mail } from "lucide-react";
import { reportAuthLinkEvent } from "@/lib/authLinkEvents";
import { checkAuthSecurity } from "@/hooks/useAuthSecurity";

// ---------------------------------------------------------------------------
// Reset-link failure parsing
//
// Supabase can surface a failed recovery link in several places, depending on
// the flow (implicit hash flow, PKCE `?code=` flow, server-redirected error,
// or a thrown AuthApiError from getSession/exchangeCodeForSession/verifyOtp).
//
// We normalize all of those into a single LinkFailureReason so the UI only
// has to render one of a small number of states.
// ---------------------------------------------------------------------------
export type LinkFailureReason = "expired" | "used" | "invalid" | "unknown";

interface LinkFailureInfo {
  reason: LinkFailureReason;
  /** Raw Supabase error code, e.g. "otp_expired", "access_denied". */
  code?: string;
  /** Human-readable description from Supabase, decoded. */
  description?: string;
  /** Where the failure was detected, useful for logging/analytics. */
  source: "url" | "supabase";
}

const decodeParam = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  // Supabase encodes spaces as `+` in error_description; URLSearchParams
  // already decodes `%20` but leaves `+` in hash fragments alone in some
  // browsers. Normalize both.
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw.replace(/\+/g, " ");
  }
};

const classifyFailure = (
  code: string | undefined,
  description: string | undefined,
  status?: number
): LinkFailureReason => {
  const c = (code ?? "").toLowerCase();
  const d = (description ?? "").toLowerCase();

  // --- Expired -----------------------------------------------------------
  if (
    c === "otp_expired" ||
    c === "token_expired" ||
    c === "flow_state_expired" ||
    c === "session_expired" ||
    /\bexpired\b/.test(d) ||
    /has expired/.test(d) ||
    /no longer valid/.test(d)
  ) {
    return "expired";
  }

  // --- Already used / consumed ------------------------------------------
  if (
    c === "otp_consumed" ||
    c === "token_consumed" ||
    /already (been )?used/.test(d) ||
    /consumed/.test(d) ||
    /single[-\s]?use/.test(d)
  ) {
    return "used";
  }

  // --- Invalid (malformed, bad signature, wrong type, denied) -----------
  if (
    c === "access_denied" ||
    c === "invalid_request" ||
    c === "invalid_grant" ||
    c === "validation_failed" ||
    c === "bad_jwt" ||
    c === "bad_oauth_callback" ||
    c === "email_link_invalid" ||
    c === "unauthorized_client" ||
    /invalid/.test(d) ||
    /malformed/.test(d) ||
    /signature/.test(d) ||
    /not found/.test(d) ||
    status === 400 ||
    status === 401 ||
    status === 403
  ) {
    return "invalid";
  }

  return "unknown";
};

const parseLinkFailureFromUrl = (): LinkFailureInfo | null => {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);
  const get = (k: string) => hashParams.get(k) ?? queryParams.get(k);

  // Pull every field Supabase or an OAuth-style proxy may set.
  const error = get("error");
  const errorCode = get("error_code") ?? get("error_codes");
  const message = get("message");
  const description = decodeParam(get("error_description") ?? message);

  if (!error && !errorCode && !description) return null;

  return {
    reason: classifyFailure(errorCode ?? error ?? undefined, description),
    code: errorCode ?? error ?? undefined,
    description,
    source: "url",
  };
};

const parseLinkFailureFromSupabaseError = (err: unknown): LinkFailureInfo | null => {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as {
    name?: string;
    message?: string;
    code?: string;
    error_code?: string;
    status?: number;
  };
  const code = anyErr.code ?? anyErr.error_code;
  const description = anyErr.message;
  const status = anyErr.status;
  if (!code && !description && !status) return null;
  return {
    reason: classifyFailure(code, description, status),
    code,
    description,
    source: "supabase",
  };
};

// Password policy is shared with LoginPage sign-up — see src/lib/passwordRules.ts
import { RULES, COMMON_WEAK, evaluateStrength } from "@/lib/passwordRules";
// --------------------------------------------------------------------------

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwTouched, setPwTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resentTo, setResentTo] = useState<string | null>(null);
  const [linkFailure, setLinkFailure] = useState<LinkFailureReason | null>(null);
  const resendInputRef = useRef<HTMLInputElement>(null);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const focusResendInput = () => {
    // Defer to ensure the field is mounted in the DOM
    setTimeout(() => {
      resendInputRef.current?.focus();
      resendInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  /**
   * Send a fresh reset link. Used by both the form submit and the
   * one-click "Request a new reset link" CTA in the failure card.
   * Returns true on success so callers can update UI state.
   */
  const sendResetLink = async (rawEmail: string): Promise<boolean> => {
    const email = rawEmail.trim();
    if (!isValidEmail(email)) {
      toast.error("Enter a valid email address to receive a new link.");
      focusResendInput();
      return false;
    }
    const toastId = "reset-resend";
    toast.loading("Sending a new reset link…", { id: toastId });
    setResending(true);
    const security = await checkAuthSecurity(email, "reset_password");
    if (!security.allowed) {
      setResending(false);
      toast.error(security.error ?? "Too many reset requests. Please try again later.", { id: toastId });
      return false;
    }
    const { error: resendErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResending(false);
    if (resendErr) {
      toast.error(resendErr.message || "Could not send reset link.", { id: toastId });
      return false;
    }
    setResentTo(email);
    // Clear the current failure state so the user sees a clean "sent" confirmation
    // instead of the same red failure card.
    setLinkFailure(null);
    toast.success("If that email exists, a new reset link is on its way.", { id: toastId });
    return true;
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendResetLink(resendEmail);
  };

  /**
   * One-click handler for the failure card CTA. If the email field already
   * has a valid value, send immediately. Otherwise focus the field so the
   * user can type one in, then send.
   */
  const handleRequestNewLink = async () => {
    if (isValidEmail(resendEmail)) {
      await sendResetLink(resendEmail);
      return;
    }
    focusResendInput();
    toast.info("Enter your email below and we'll send a fresh link.", {
      id: "reset-resend",
    });
  };

  useEffect(() => {
    const verifyToastId = "reset-verify";
    let resolved = false;
    let unsub: (() => void) | undefined;

    const finish = (
      ok: boolean,
      failure?: LinkFailureInfo | null
    ) => {
      if (resolved) return;
      resolved = true;
      setReady(true);
      if (ok) {
        setValidSession(true);
        toast.success("Reset link verified. Choose a new password.", { id: verifyToastId });
        reportAuthLinkEvent({
          reason: "verified",
          source: "supabase",
          flow: "password_recovery",
        });
        return;
      }
      const reason = failure?.reason ?? "invalid";
      setLinkFailure(reason);
      toast.error(
        reason === "expired"
          ? "This reset link has expired."
          : reason === "used"
          ? "This reset link has already been used."
          : "This reset link is invalid or has expired.",
        { id: verifyToastId }
      );
      reportAuthLinkEvent({
        reason,
        source: failure?.source ?? "url",
        flow: "password_recovery",
        errorCode: failure?.code,
        description: failure?.description,
      });
      // Clear the noisy hash/query so a refresh doesn't re-trigger toasts.
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        /* no-op */
      }
    };

    // 1) Explicit failure info encoded in the URL by Supabase / proxy.
    const urlFailure = parseLinkFailureFromUrl();
    if (urlFailure) {
      finish(false, urlFailure);
      return;
    }

    toast.loading("Verifying your reset link…", { id: verifyToastId });

    // 2) Listen for the recovery session that supabase-js populates from the
    //    URL hash automatically (implicit flow).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        finish(true);
      }
    });
    unsub = () => sub.subscription.unsubscribe();

    const queryParams = new URLSearchParams(window.location.search);
    const code = queryParams.get("code");
    const tokenHash = queryParams.get("token_hash");
    const type = queryParams.get("type");

    const tryRecover = async () => {
      // 3a) PKCE flow: ?code=..., exchange for a session.
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          finish(false, parseLinkFailureFromSupabaseError(exErr));
          return;
        }
        finish(true);
        return;
      }
      // 3b) Token-hash flow: ?token_hash=...&type=recovery
      if (tokenHash && type) {
        const { error: vErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "recovery",
        });
        if (vErr) {
          finish(false, parseLinkFailureFromSupabaseError(vErr));
          return;
        }
        finish(true);
        return;
      }
      // 3c) Implicit hash flow: check for an existing session, otherwise
      //     wait briefly for onAuthStateChange.
      const { data, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) {
        finish(false, parseLinkFailureFromSupabaseError(sessErr));
        return;
      }
      if (data.session) {
        finish(true);
        return;
      }
      setTimeout(() => finish(false, { reason: "invalid", source: "supabase" }), 1200);
    };

    void tryRecover();

    return () => unsub?.();
  }, []);

  const ruleResults = useMemo(
    () => RULES.map((r) => ({ ...r, passed: r.test(password) })),
    [password]
  );
  const passedCount = ruleResults.filter((r) => r.passed).length;
  const allRulesPassed = passedCount === RULES.length;
  const isCommonWeak = !!password && COMMON_WEAK.has(password.toLowerCase());
  const passwordsMatch = password === confirm && confirm.length > 0;
  const strength = useMemo(
    () => evaluateStrength(password, passedCount),
    [password, passedCount]
  );
  const canSubmit = allRulesPassed && !isCommonWeak && passwordsMatch && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPwTouched(true);
    setConfirmTouched(true);

    if (isCommonWeak) {
      const msg = "This password is too common. Please choose a less guessable one.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!allRulesPassed) {
      const failed = ruleResults.find((r) => !r.passed);
      const msg = failed
        ? `Password doesn't meet all requirements (missing: ${failed.label.toLowerCase()}).`
        : "Password doesn't meet all requirements.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!passwordsMatch) {
      const msg = "Passwords do not match.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const updateToastId = "reset-update";
    toast.loading("Updating your password…", { id: updateToastId });
    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateErr) {
      setError(updateErr.message);
      toast.error(updateErr.message || "Could not update password.", { id: updateToastId });
      return;
    }
    toast.success("Password updated. You're signed in.", { id: updateToastId });
    navigate("/dashboard/cockpit", { replace: true });
  };

  const inputClass =
    "w-full h-[42px] px-4 pr-11 bg-fyn-beige-card border border-fyn-ink-10 rounded text-fyn-ink placeholder:text-fyn-ink-40 focus:outline-hidden focus:ring-2 focus:ring-fyn-red focus:border-fyn-red transition-colors disabled:opacity-60";

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-fyn-beige">
      <div className="bg-fyn-ink p-12 flex flex-col justify-center">
        <FynLogo variant="light" />
        <h2
          className="font-serif text-fyn-beige mt-8 mb-4"
          style={{ fontSize: "var(--fyn-type-h1)", lineHeight: 1.15 }}
        >
          Set a new password.
        </h2>
        <p className="text-fyn-beige/60" style={{ fontSize: "var(--fyn-type-body)" }}>
          Use at least 10 characters with a mix of upper- and lowercase letters, a number, and a symbol.
        </p>
      </div>

      <div className="bg-fyn-beige p-12 flex flex-col justify-center">
        <h2
          className="font-serif text-fyn-ink mb-6"
          style={{ fontSize: "var(--fyn-type-h2)", lineHeight: 1.2 }}
        >
          Reset your password
        </h2>

        {!ready ? (
          <p className="text-fyn-ink-60" style={{ fontSize: "var(--fyn-type-body)" }}>
            Verifying reset link…
          </p>
        ) : !validSession ? (
          (() => {
            const isExpired = linkFailure === "expired";
            const isUsed = linkFailure === "used";
            const heading = isExpired
              ? "This reset link has expired"
              : isUsed
              ? "This reset link has already been used"
              : "This reset link is invalid";
            const explainer = isExpired
              ? "For your security, password reset links are valid for a short time. Request a new one below and we'll email it to you right away."
              : isUsed
              ? "Each reset link can only be used once. Request a new link below to set your password."
              : "We couldn't verify this reset link. It may be malformed, already used, or sent from an old email. Request a fresh link below.";
            return (
              <div className="max-w-md space-y-5">
                <div className="rounded-lg border border-fyn-red/20 bg-fyn-danger-bg p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-fyn-red/10 text-fyn-red">
                      <MailWarning className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <h3
                        className="font-serif text-fyn-ink"
                        style={{ fontSize: "var(--fyn-type-h3)", lineHeight: 1.25 }}
                      >
                        {heading}
                      </h3>
                      <p
                        className="mt-1 text-fyn-ink-80"
                        style={{ fontSize: "var(--fyn-type-small)", lineHeight: 1.5 }}
                      >
                        {explainer}
                      </p>
                      <button
                        type="button"
                        onClick={handleRequestNewLink}
                        disabled={resending}
                        className="mt-3 inline-flex items-center gap-2 rounded-md bg-fyn-red px-3 py-2 text-fyn-beige hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ fontSize: "var(--fyn-type-small)" }}
                      >
                        <Mail className="h-4 w-4" aria-hidden="true" />
                        {resending
                          ? "Sending…"
                          : isValidEmail(resendEmail)
                          ? `Send a new link to ${resendEmail.trim()}`
                          : "Request a new reset link"}
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleResend} className="space-y-3" noValidate>
                  <div>
                    <label
                      htmlFor="resend-email"
                      className="block mb-1 text-fyn-ink-80"
                      style={{ fontSize: "var(--fyn-type-small)" }}
                    >
                      Email address
                    </label>
                    <input
                      id="resend-email"
                      ref={resendInputRef}
                      type="email"
                      autoComplete="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="you@company.com"
                      disabled={resending}
                      className={inputClass}
                      style={{ fontSize: "var(--fyn-type-body)" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resending || !resendEmail.trim()}
                    className="w-full bg-fyn-ink text-fyn-beige h-[42px] rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ fontSize: "var(--fyn-type-body)" }}
                  >
                    {resending ? "Sending…" : "Email me a new reset link"}
                  </button>
                </form>

                {resentTo && (
                  <p className="text-fyn-ink-60" style={{ fontSize: "var(--fyn-type-tiny)" }}>
                    If an account exists for{" "}
                    <span className="font-medium text-fyn-ink">{resentTo}</span>, a new reset link has been sent. Check your inbox and spam folder.
                  </p>
                )}

                <button
                  onClick={() => navigate("/")}
                  className="text-fyn-ink-60 hover:text-fyn-ink underline underline-offset-2 transition-colors"
                  style={{ fontSize: "var(--fyn-type-small)" }}
                >
                  Back to home
                </button>
              </div>
            );
          })()
        ) : (
          <form className="space-y-4 max-w-md" onSubmit={handleSubmit} noValidate>
            {/* New password */}
            <div>
              <label
                htmlFor="reset-pw"
                className="block mb-1 text-fyn-ink-80"
                style={{ fontSize: "var(--fyn-type-small)" }}
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="reset-pw"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setPwTouched(true)}
                  placeholder="At least 10 characters"
                  aria-describedby="reset-pw-rules reset-pw-strength"
                  aria-invalid={pwTouched && (!allRulesPassed || isCommonWeak)}
                  className={inputClass}
                  style={{ fontSize: "var(--fyn-type-body)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-fyn-ink-60 hover:text-fyn-ink transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength meter */}
              {password && (
                <div id="reset-pw-strength" className="mt-2" aria-live="polite">
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
                        strength.score >= 3
                          ? "text-fyn-success"
                          : strength.score === 2
                          ? "text-fyn-gold"
                          : "text-fyn-red"
                      }`}
                    >
                      {strength.label}
                    </span>
                    {isCommonWeak && (
                      <span className="text-fyn-red">, this is a commonly used password.</span>
                    )}
                  </p>
                </div>
              )}

              {/* Live checklist */}
              <ul id="reset-pw-rules" className="mt-3 space-y-1">
                {ruleResults.map((r) => (
                  <li
                    key={r.key}
                    className={`flex items-center gap-2 ${
                      r.passed
                        ? "text-fyn-success"
                        : pwTouched
                        ? "text-fyn-red"
                        : "text-fyn-ink-60"
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

            {/* Confirm password */}
            <div>
              <label
                htmlFor="reset-confirm"
                className="block mb-1 text-fyn-ink-80"
                style={{ fontSize: "var(--fyn-type-small)" }}
              >
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="reset-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => setConfirmTouched(true)}
                  placeholder="Re-enter password"
                  aria-invalid={confirmTouched && confirm.length > 0 && !passwordsMatch}
                  aria-describedby="reset-confirm-hint"
                  className={inputClass}
                  style={{ fontSize: "var(--fyn-type-body)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-fyn-ink-60 hover:text-fyn-ink transition-colors"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmTouched && confirm.length > 0 && !passwordsMatch && (
                <p
                  id="reset-confirm-hint"
                  className="mt-1 text-fyn-red"
                  style={{ fontSize: "var(--fyn-type-tiny)" }}
                >
                  Passwords do not match.
                </p>
              )}
              {confirm.length > 0 && passwordsMatch && (
                <p
                  id="reset-confirm-hint"
                  className="mt-1 text-fyn-success inline-flex items-center gap-1"
                  style={{ fontSize: "var(--fyn-type-tiny)" }}
                >
                  <Check className="w-3.5 h-3.5" /> Passwords match
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded border border-fyn-red/20 bg-fyn-danger-bg text-fyn-red p-3"
                style={{ fontSize: "var(--fyn-type-small)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-fyn-red text-fyn-beige h-[42px] rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontSize: "var(--fyn-type-body)" }}
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
