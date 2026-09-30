import { startGmailConnect } from "@/lib/caGmail.functions";
/**
 * FynHelp v2 — first run journey.
 * Sign in, create the firm, add the first client, connect Gmail or skip,
 * upload the first document, then land on the portfolio.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, Mail, UploadCloud, UserPlus } from "lucide-react";
import { V } from "../ui";
import { AgentStatusBadge } from "../agents";
import { supabase } from "@/integrations/supabase/client";
import { ENTITY_TYPES, useV2 } from "../store";

const STEPS = ["Your account", "Your firm", "First client", "Gmail", "First document"];

export default function OnboardingPage() {
  const { session, saveFirm, addClient, addDoc, completeOnboarding, firm, firmIdReady } = useV2();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(session ? 1 : 0);
  // Account step modes: create an account, sign in, wait for the email link, reset a password.
  const [mode, setMode] = useState<"signup" | "signin" | "check-email" | "forgot">(() => {
    if (typeof window === "undefined") return "signup";
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "signin" || m === "forgot" || m === "signup") return m;
    // Someone who has signed in on this device before most likely wants to sign in again.
    try {
      if (localStorage.getItem("fynhelp.v2.known")) return "signin";
    } catch {
      /* private mode */
    }
    return "signup";
  });
  // Set while this person is creating their firm here, so we do not treat the
  // new firm as "already onboarded" and leave before the client steps.
  const settingUp = useRef(false);
  // Arriving from the confirmation email: the session appears after mount.
  useEffect(() => {
    if (!session || step !== 0) return;
    setStep(1);
  }, [session, step]);
  // A returning partner or an invited teammate already has a practice: go straight in.
  useEffect(() => {
    // Only while the browser is really on onboarding: during the hand-off to the
    // client workspace this page can re-mount for a moment with fresh state.
    if (typeof window !== "undefined" && window.location.pathname !== "/v2/onboarding") return;
    if (session && firm && !settingUp.current && step <= 1) navigate({ to: "/v2" });
  }, [session, firm, step, navigate]);
  const [account, setAccount] = useState({ name: session?.name ?? "", email: session?.email ?? "", password: "" });
  const [firmForm, setFirmForm] = useState({ name: firm?.name ?? "", city: firm?.city ?? "", frn: firm?.frn ?? "" });
  const [client, setClient] = useState({ name: "", entityType: ENTITY_TYPES[0], gstin: "", contactName: "", email: "", phone: "" });
  const [clientId, setClientId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  const redirectTo = () => `${window.location.origin}/v2`;

  /** Plain-language auth errors instead of provider codes. */
  const authError = (message: string) => {
    if (/invalid login credentials/i.test(message)) return "That email and password do not match. Try again, or reset your password.";
    if (/email not confirmed/i.test(message)) return "Confirm your email first. We can send the link again.";
    if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
    if (/password.*(short|characters|weak)/i.test(message)) return "Use a password of at least six characters.";
    return message;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/email not confirmed/i.test(error.message)) setMode("check-email");
      toast.error(authError(error.message));
      return false;
    }
    // A returning partner (or an invited teammate) already has a practice:
    // load it, and the shell takes them straight to the portfolio.
    await completeOnboarding();
    return true;
  };

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const email = account.email.trim();
    try {
      if (mode === "signin") {
        if (await signIn(email, account.password)) {
          toast.success("Signed in");
          next();
        }
        return;
      }
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/v2/reset-password`,
        });
        if (error) { toast.error(authError(error.message)); return; }
        toast.success("If an account exists for this email, a reset link is on its way.");
        setMode("signin");
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password: account.password,
        options: { data: { full_name: account.name.trim() }, emailRedirectTo: redirectTo() },
      });
      if (error && /already/i.test(error.message)) {
        if (await signIn(email, account.password)) next();
        return;
      }
      if (error) { toast.error(authError(error.message)); return; }
      if (!data.session) {
        // Supabase hides whether an address is taken: an existing, confirmed
        // account comes back with no identities.
        if (data.user && data.user.identities?.length === 0) {
          toast.info("An account already exists for this email. Sign in instead.");
          setMode("signin");
          return;
        }
        setMode("check-email");
        return;
      }
      toast.success(`Welcome ${account.name.trim().split(" ")[0] || "in"}`);
      next();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: account.email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) toast.error(authError(error.message));
    else toast.success("Sent again. Check your inbox and spam folder.");
  };

  const submitFirm = async (e: React.FormEvent) => {
    e.preventDefault();
    settingUp.current = true;
    setBusy(true);
    const ok = await saveFirm({
      ...firmForm,
      partnerName: account.name || session?.name || "",
      email: account.email || session?.email || "",
    });
    setBusy(false);
    if (!ok) {
      settingUp.current = false;
      return;
    }
    toast.success("Firm created");
    next();
  };

  /** Real Google consent. After connecting, Google sends the user back to Documents to upload or wait for mail. */
  const connectGmail = async () => {
    try {
      const fid = await firmIdReady();
      if (!fid) throw new Error("Create your practice first");
      try { window.sessionStorage.setItem("fynhelp.gmail.return", "/v2/documents"); } catch { /* private mode */ }
      const { url } = await startGmailConnect({ data: { firmId: fid, origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      toast.error(`Gmail could not be connected here: ${e instanceof Error ? e.message : String(e)}. You can connect it later from Settings.`);
      next();
    }
  };

  const submitClient = (e: React.FormEvent) => {
    e.preventDefault();
    const created = addClient(client);
    setClientId(created.id);
    toast.success(`${created.name} added to your portfolio`);
    next();
  };

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0 || !clientId) return;
    const file = files[0];
    addDoc(file.name, clientId, "Manual", file);
    setUploaded(file.name);
    toast.success("Extract agent is reading your document");
  };

  const finish = async () => {
    // Wait for the workspace to load, so the shell does not bounce the user
    // back to onboarding (or the portfolio) while it reloads.
    await completeOnboarding();
    // Land inside the client, where the next best action is already waiting.
    if (clientId) navigate({ to: "/v2/clients/$clientId", params: { clientId } });
    else navigate({ to: "/v2" });
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <h1 style={{ fontSize: 26, marginTop: 8 }}>{STEPS[step]}</h1>
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          {STEPS.map((s, i) => (
            <motion.span
              key={s}
              layout
              style={{
                height: 4, borderRadius: 999, flex: 1,
                background: i <= step ? V.ink : "rgba(20,20,20,.09)",
                transition: "background .3s ease",
              }}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="v2-card"
          style={{ padding: 26 }}
        >
          {step === 0 && mode === "check-email" && (
            <div style={{ display: "grid", gap: 16 }} data-testid="check-email">
              <Intro icon={<Mail size={20} />} title="Confirm your email" text={`We sent a confirmation link to ${account.email || "your inbox"}. Open it on this device to continue; it brings you straight back to set up your firm.`} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="v2-btn v2-btn-primary" type="button" disabled={busy || !account.email} onClick={resend}>{busy ? "Sending" : "Send the link again"}</button>
                <button className="v2-btn v2-btn-ghost" type="button" onClick={() => setMode("signin")}>I have confirmed, sign in</button>
                <button className="v2-btn v2-btn-quiet" type="button" onClick={() => setMode("signup")}>Use a different email</button>
              </div>
              <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>Nothing in a few minutes? Check the spam folder.</p>
            </div>
          )}

          {step === 0 && mode !== "check-email" && (
            <form onSubmit={submitAccount} style={{ display: "grid", gap: 16 }} data-auth-mode={mode}>
              <Intro
                icon={<UserPlus size={20} />}
                title={mode === "signin" ? "Sign in to FynHelp" : mode === "forgot" ? "Reset your password" : "Create your FynHelp account"}
                text={mode === "signin" ? "Welcome back. Your practice opens right where you left it." : mode === "forgot" ? "Enter your work email and we will send a link to set a new password." : "One login for the whole practice. You can invite the rest of the team later."}
              />
              {mode === "signup" && (
                <Field label="Full name"><input className="v2-input" required autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} placeholder="Prajwal Vakode" /></Field>
              )}
              <Field label="Work email"><input className="v2-input" type="email" required autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} placeholder="you@firm.com" /></Field>
              {mode !== "forgot" && (
                <Field label="Password"><input className="v2-input" type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} placeholder="At least six characters" /></Field>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="v2-btn v2-btn-primary" type="submit" disabled={busy}>
                  {busy ? "Please wait" : mode === "signin" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Create account"}
                </button>
                {mode === "signin" && (
                  <button className="v2-btn v2-btn-quiet" type="button" onClick={() => setMode("forgot")}>Forgot password?</button>
                )}
              </div>
              <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>
                {mode === "signup" ? (
                  <>Already have an account, or invited by your firm? <button type="button" className="v2-link" onClick={() => setMode("signin")}>Sign in</button></>
                ) : (
                  <>New to FynHelp? <button type="button" className="v2-link" onClick={() => setMode("signup")}>Create an account</button></>
                )}
              </p>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={submitFirm} style={{ display: "grid", gap: 16 }}>
              <Intro icon={<Building2 size={20} />} title="Set up your firm" text="This name appears on every MIS report and client message you send." />
              <Field label="Firm name"><input className="v2-input" required value={firmForm.name} onChange={(e) => setFirmForm({ ...firmForm, name: e.target.value })} placeholder="Mehta and Associates" /></Field>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
                <Field label="City"><input className="v2-input" required value={firmForm.city} onChange={(e) => setFirmForm({ ...firmForm, city: e.target.value })} placeholder="Bengaluru" /></Field>
                <Field label="Firm registration number"><input className="v2-input" value={firmForm.frn} onChange={(e) => setFirmForm({ ...firmForm, frn: e.target.value })} placeholder="012345S" /></Field>
              </div>
              <button className="v2-btn v2-btn-primary" type="submit" disabled={busy} style={{ justifySelf: "start" }}>{busy ? "Creating" : "Create firm"}</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitClient} style={{ display: "grid", gap: 16 }}>
              <Intro icon={<UserPlus size={20} />} title="Add your first client" text="The contact details are used by the Chaser agent when documents are pending." />
              <Field label="Client name"><input className="v2-input" required value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Sundar Textiles Pvt Ltd" /></Field>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
                <Field label="Entity type">
                  <select className="v2-input" value={client.entityType} onChange={(e) => setClient({ ...client, entityType: e.target.value })}>
                    {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="GSTIN"><input className="v2-input" value={client.gstin} onChange={(e) => setClient({ ...client, gstin: e.target.value })} placeholder="27AABCS1429B1ZP" /></Field>
              </div>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
                <Field label="Contact person"><input className="v2-input" required value={client.contactName} onChange={(e) => setClient({ ...client, contactName: e.target.value })} placeholder="Ramesh Sundar" /></Field>
                <Field label="Contact email"><input className="v2-input" type="email" required value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="ramesh@client.in" /></Field>
              </div>
              <Field label="WhatsApp number"><input className="v2-input" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="919820011223" /></Field>
              <button className="v2-btn v2-btn-primary" type="submit" style={{ justifySelf: "start" }}>Add client</button>
            </form>
          )}

          {step === 3 && (
            <div style={{ display: "grid", gap: 16 }}>
              <Intro icon={<Mail size={20} />} title="Connect Gmail" text="We watch for statements and bills your clients email you and send them straight to the Extract agent." />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="v2-btn v2-btn-primary"
                  onClick={connectGmail}
                >
                  Connect Gmail
                </button>
                <button className="v2-btn v2-btn-ghost" onClick={next}>Skip for now</button>
              </div>
              <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>You can connect it any time from Settings.</p>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "grid", gap: 16 }}>
              <Intro icon={<UploadCloud size={20} />} title="Upload the first document" text="A bank statement works best. The Extract agent reads it, and anything it is unsure about goes to your Review Queue." />
              {uploaded ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(31,90,70,.12)", color: V.green, display: "grid", placeItems: "center" }}><Check size={16} /></span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{uploaded}</div>
                      <div style={{ fontSize: 12, color: V.muted }}>Handed to the Extract agent</div>
                    </div>
                  </div>
                  <AgentStatusBadge agent="extract" active label="Extracting your first document" />
                  <button className="v2-btn v2-btn-primary" style={{ justifySelf: "start" }} onClick={finish}>Open the client workspace</button>
                </div>
              ) : (
                <>
                  <div
                    className="v2-card"
                    onClick={() => fileRef.current?.click()}
                    style={{ borderStyle: "dashed", padding: "34px 20px", textAlign: "center", cursor: "pointer" }}
                  >
                    <div style={{ width: 46, height: 46, borderRadius: 14, background: V.blue, color: "#1B4763", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                      <UploadCloud size={20} />
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>Click to upload a statement or bills</div>
                    <div style={{ fontSize: 12.5, color: V.body, marginTop: 5 }}>CSV, XML or PDF.</div>
                    <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xml,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => upload(e.target.files)} />
                  </div>
                  <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start" }} onClick={finish}>Skip and explore the portfolio</button>
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Intro({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 14, alignItems: "start", marginBottom: 4 }}>
      <span style={{ width: 40, height: 40, borderRadius: 13, background: V.blue, color: "#1B4763", display: "grid", placeItems: "center" }}>{icon}</span>
      <div>
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        <p style={{ margin: "5px 0 0", fontSize: 13, color: V.body, lineHeight: 1.6 }}>{text}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="v2-label">{label}</label>
      {children}
    </div>
  );
}
