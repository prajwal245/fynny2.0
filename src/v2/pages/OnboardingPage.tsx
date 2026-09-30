import { startGmailConnect } from "@/lib/caGmail.functions";
/**
 * FynHelp — first run journey, value first:
 * account → firm → first client → first document (watch Extract work) →
 * how much the agents may do on their own → intake channels → you're set.
 * Connecting Gmail leaves for Google, so it comes after the value moment.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, Check, Mail, MessageCircle, Sparkles, UploadCloud, UserPlus, Users } from "lucide-react";
import { V } from "../ui";
import { ProcessingCard } from "../agents";
import { supabase } from "@/integrations/supabase/client";
import { updatePracticePipelineSettings } from "@/lib/practice/practice.functions";
import { ENTITY_TYPES, useV2 } from "../store";
import { OnboardingPanel } from "../components/OnboardingPanel";

export const STEPS = ["Account", "Firm", "First client", "First document", "Agent autonomy", "Channels", "You're set"];
const STEP_HINT = [
  "Sign in or create your login",
  "How clients see you",
  "Who the agents work for",
  "Watch Extract read it",
  "What agents do on their own",
  "Gmail and WhatsApp intake",
  "Your practice is ready",
];

export default function OnboardingPage() {
  const { session, saveFirm, addClient, addDoc, completeOnboarding, firm, firmIdReady, docs, runs } = useV2();
  const savePipeline = useServerFn(updatePracticePipelineSettings);
  const [autonomy, setAutonomy] = useState<{ auto_recon: boolean; auto_chase_day: number | null }>({ auto_recon: true, auto_chase_day: 5 });
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
    next();
  };

  /** Real Google consent. After connecting, Google sends the user back to Documents to upload or wait for mail. */
  const connectGmail = async () => {
    try {
      const fid = await firmIdReady();
      if (!fid) throw new Error("Create your practice first");
      // After Google's consent the partner lands on Today, where the setup checklist shows Gmail connected.
      try { window.sessionStorage.setItem("fynhelp.gmail.return", "/v2"); } catch { /* private mode */ }
      const { url } = await startGmailConnect({ data: { firmId: fid, origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      toast.error(`Gmail could not be connected here: ${e instanceof Error ? e.message : String(e)}. You can connect it later from Settings.`);
    }
  };

  const submitClient = (e: React.FormEvent) => {
    e.preventDefault();
    const created = addClient(client);
    setClientId(created.id);
    next();
  };

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0 || !clientId) return;
    const file = files[0];
    addDoc(file.name, clientId, "Manual", file);
    setUploaded(file.name);
  };

  const saveAutonomy = async () => {
    setBusy(true);
    try {
      await savePipeline({ data: autonomy });
      next();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // The first document, as the Extract agent reports it (real state, not a timer).
  const firstDoc = uploaded ? docs.find((d) => d.clientId === clientId && d.name === uploaded) : undefined;
  const firstRun = runs.find((r) => r.agent === "extract" && r.clientId === clientId);
  const reading = Boolean(uploaded) && (!firstDoc || ["Uploading", "Queued", "Processing"].includes(firstDoc.status) || firstRun?.status === "running");

  const finish = async () => {
    // Wait for the workspace to load, so the shell does not bounce the user
    // back to onboarding (or the portfolio) while it reloads.
    await completeOnboarding();
    // Land inside the client, where the next best action is already waiting.
    if (clientId) navigate({ to: "/v2/clients/$clientId", params: { clientId } });
    else navigate({ to: "/v2" });
  };

  const clientName = client.name.trim() || "your client";
  const done = (i: number) => i < step;

  return (
    <div className="onb" data-step={step}>
      <style>{ONB_STYLES}</style>
      <div className="onb-main">
        <div className="onb-brand">
          <span className="onb-logo">F</span>
          <span style={{ fontWeight: 700, letterSpacing: "-0.02em" }}>FynHelp</span>
          <span style={{ color: V.muted, fontSize: 12.5 }}>Practice OS for CA firms</span>
        </div>

        {step > 0 && (
          <ol className="onb-rail" aria-label="Setup progress">
            {STEPS.slice(1).map((label, k) => {
              const i = k + 1;
              const state = done(i) ? "done" : i === step ? "current" : "todo";
              return (
                <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                  <span className="onb-dot">{state === "done" ? <Check size={12} strokeWidth={3} /> : i}</span>
                  <span className="onb-rail-text">
                    <span className="onb-rail-label">{label}</span>
                    <span className="onb-rail-hint">{STEP_HINT[i]}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${step}:${mode}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="onb-card"
          >
            {step > 0 && (
              <div className="onb-eyebrow">
                Step {step} of {STEPS.length - 1} · {STEPS[step]}
              </div>
            )}

            {step === 0 && mode === "check-email" && (
              <div style={{ display: "grid", gap: 18 }} data-testid="check-email">
                <Intro icon={<Mail size={20} />} title="Confirm your email" text={`We sent a link to ${account.email || "your inbox"}. Open it on this device and you will land right back here to set up your firm.`} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="v2-btn v2-btn-primary" type="button" data-busy={busy} disabled={busy || !account.email} onClick={resend}>Send the link again</button>
                  <button className="v2-btn v2-btn-ghost" type="button" onClick={() => setMode("signin")}>I have confirmed, sign in</button>
                </div>
                <p className="onb-foot">Wrong address? <button type="button" className="v2-link" onClick={() => setMode("signup")}>Use a different email</button>. Nothing after a few minutes? Check spam.</p>
              </div>
            )}

            {step === 0 && mode !== "check-email" && (
              <form onSubmit={submitAccount} style={{ display: "grid", gap: 16 }} data-auth-mode={mode}>
                <div>
                  <h1 className="onb-title">
                    {mode === "signin" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Close the month with four agents"}
                  </h1>
                  <p className="onb-sub">
                    {mode === "signin"
                      ? "Sign in to your practice. Everything is where your team left it."
                      : mode === "forgot"
                        ? "Enter your work email and we will send a link to set a new password."
                        : "Extract, Recon, Narrate and Chaser do the month-end work. You review and sign off."}
                  </p>
                </div>
                {mode === "signup" && (
                  <Field label="Full name"><input className="v2-input" required autoFocus autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} placeholder="Prajwal Vakode" /></Field>
                )}
                <Field label="Work email"><input className="v2-input" type="email" required autoFocus={mode !== "signup"} autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} placeholder="you@firm.com" /></Field>
                {mode !== "forgot" && (
                  <Field
                    label="Password"
                    aside={mode === "signin" ? <button type="button" className="v2-link" style={{ fontSize: 12 }} onClick={() => setMode("forgot")}>Forgot password?</button> : undefined}
                  >
                    <input className="v2-input" type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} placeholder="At least six characters" />
                  </Field>
                )}
                <button className="v2-btn v2-btn-primary v2-btn-lg v2-btn-block" type="submit" data-busy={busy} disabled={busy}>
                  {mode === "signin" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Create account"}
                </button>
                <p className="onb-foot" style={{ textAlign: "center" }}>
                  {mode === "signup" ? (
                    <>Already have an account, or invited by your firm? <button type="button" className="v2-link" onClick={() => setMode("signin")}>Sign in</button></>
                  ) : (
                    <>New to FynHelp? <button type="button" className="v2-link" onClick={() => setMode("signup")}>Create an account</button></>
                  )}
                </p>
                {mode === "signup" && (
                  <p className="onb-foot" style={{ textAlign: "center", marginTop: -6 }}>Free to start. No card needed. Your data stays in your firm's workspace.</p>
                )}
              </form>
            )}

            {step === 1 && (
              <form onSubmit={submitFirm} style={{ display: "grid", gap: 16 }}>
                <Intro icon={<Building2 size={20} />} title="Set up your firm" text="Your firm's name goes on every MIS and every message the Chaser sends." />
                <Field label="Firm name"><input className="v2-input" required autoFocus value={firmForm.name} onChange={(e) => setFirmForm({ ...firmForm, name: e.target.value })} placeholder="Mehta and Associates" /></Field>
                <div className="onb-2col">
                  <Field label="City"><input className="v2-input" required value={firmForm.city} onChange={(e) => setFirmForm({ ...firmForm, city: e.target.value })} placeholder="Bengaluru" /></Field>
                  <Field label="Firm registration number" optional><input className="v2-input" value={firmForm.frn} onChange={(e) => setFirmForm({ ...firmForm, frn: e.target.value })} placeholder="012345S" /></Field>
                </div>
                <Actions>
                  <button className="v2-btn v2-btn-primary" type="submit" data-busy={busy} disabled={busy}>Create firm <ArrowRight size={15} /></button>
                </Actions>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={submitClient} style={{ display: "grid", gap: 16 }}>
                <Intro icon={<UserPlus size={20} />} title="Add your first client" text="The agents work client by client. The contact details let the Chaser ask for missing documents on your behalf." />
                <Field label="Client name"><input className="v2-input" required autoFocus value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Sundar Textiles Pvt Ltd" /></Field>
                <div className="onb-2col">
                  <Field label="Entity type">
                    <select className="v2-input" value={client.entityType} onChange={(e) => setClient({ ...client, entityType: e.target.value })}>
                      {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="GSTIN" optional><input className="v2-input" value={client.gstin} onChange={(e) => setClient({ ...client, gstin: e.target.value })} placeholder="27AABCS1429B1ZP" /></Field>
                </div>
                <div className="onb-2col">
                  <Field label="Contact person"><input className="v2-input" required value={client.contactName} onChange={(e) => setClient({ ...client, contactName: e.target.value })} placeholder="Ramesh Sundar" /></Field>
                  <Field label="Contact email"><input className="v2-input" type="email" required value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="ramesh@client.in" /></Field>
                </div>
                <Field label="WhatsApp number" optional><input className="v2-input" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="919820011223" /></Field>
                <Actions>
                  <button className="v2-btn v2-btn-primary" type="submit">Add client <ArrowRight size={15} /></button>
                </Actions>
              </form>
            )}

            {step === 3 && (
              <div style={{ display: "grid", gap: 16 }}>
                <Intro icon={<UploadCloud size={20} />} title={`Upload a document for ${clientName}`} text="A bank statement works best. The Extract agent structures every line; anything it is unsure about waits for you in the Review Queue." />
                {uploaded ? (
                  <div style={{ display: "grid", gap: 14 }} data-testid="first-doc">
                    {firstRun ? (
                      <ProcessingCard run={firstRun} />
                    ) : (
                      <div className="onb-result">
                        <Check size={16} /> {uploaded}
                      </div>
                    )}
                    {firstDoc && !reading && firstDoc.status !== "Failed" && (
                      <div className="onb-stats">
                        <Stat n={firstDoc.txnCount ?? 0} label="transactions structured" />
                        <Stat n={firstDoc.reviewCount ?? 0} label="waiting for your review" tone={firstDoc.reviewCount ? "warn" : undefined} />
                        <Stat n={firstDoc.duplicateCount ?? 0} label="duplicates skipped" />
                      </div>
                    )}
                    {firstDoc?.status === "Failed" && (
                      <div className="onb-note" style={{ color: V.maroon }}>{firstDoc.error ?? "This file could not be read."} You can upload another file later from the client's Documents tab.</div>
                    )}
                    <Actions>
                      <button className="v2-btn v2-btn-primary" onClick={next} disabled={reading} data-busy={reading}>
                        {reading ? "Extract is reading" : "Continue"} {!reading && <ArrowRight size={15} />}
                      </button>
                    </Actions>
                  </div>
                ) : (
                  <>
                    <label className="onb-drop" data-testid="first-doc-drop">
                      <span className="onb-drop-icon"><UploadCloud size={20} /></span>
                      <span style={{ fontSize: 14.5, fontWeight: 600 }}>Choose a bank statement or bill</span>
                      <span style={{ fontSize: 12.5, color: V.body }}>CSV, Excel, Tally XML, PDF or a photo</span>
                      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xml,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => upload(e.target.files)} />
                    </label>
                    <Actions>
                      <button className="v2-btn v2-btn-quiet" onClick={next}>I'll upload later</button>
                    </Actions>
                  </>
                )}
              </div>
            )}

            {step === 4 && (
              <div style={{ display: "grid", gap: 16 }}>
                <Intro icon={<Sparkles size={20} />} title="How much should the agents do on their own?" text="You can change this any time in Settings. Matching never uses AI, and nothing reaches a partner's MIS without review." />
                <Toggle
                  label="Reconcile automatically"
                  text="When a month has both the bank statement and the books, Recon matches it straight away and lists only the exceptions."
                  on={autonomy.auto_recon}
                  onChange={(v) => setAutonomy({ ...autonomy, auto_recon: v })}
                />
                <div className="onb-toggle">
                  <div>
                    <div className="onb-toggle-label">Chase missing bank statements</div>
                    <div className="onb-toggle-text">If a client has not sent last month's statement by this day, the Chaser emails them (Day 0, 3 and 7) and stops the moment it arrives.</div>
                  </div>
                  <select className="v2-input" aria-label="Chase day" style={{ width: "auto" }} value={autonomy.auto_chase_day ?? ""} onChange={(e) => setAutonomy({ ...autonomy, auto_chase_day: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Off</option>
                    {[3, 5, 7, 10].map((d) => <option key={d} value={d}>By the {d}th</option>)}
                  </select>
                </div>
                <div className="onb-note">
                  <b>Always yours:</b> confirming low-confidence lines, resolving exceptions, generating the MIS and signing it off.
                </div>
                <Actions>
                  <button className="v2-btn v2-btn-primary" data-busy={busy} disabled={busy} onClick={saveAutonomy}>Save and continue <ArrowRight size={15} /></button>
                </Actions>
              </div>
            )}

            {step === 5 && (
              <div style={{ display: "grid", gap: 16 }}>
                <Intro icon={<Mail size={20} />} title="Let documents come in by themselves" text="Connect the inbox your clients already email. Statements and bills from known clients go straight to the Extract agent; anything uncertain waits in the Unassigned inbox." />
                <div className="onb-channel">
                  <span className="onb-channel-icon"><Mail size={18} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="onb-toggle-label">Gmail</div>
                    <div className="onb-toggle-text">Read-only access to attachments. You can disconnect in Settings.</div>
                  </div>
                  <button className="v2-btn v2-btn-ghost" onClick={connectGmail}>Connect Gmail</button>
                </div>
                <div className="onb-channel">
                  <span className="onb-channel-icon"><MessageCircle size={18} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="onb-toggle-label">WhatsApp Business</div>
                    <div className="onb-toggle-text">Link your business number in Settings once your Meta app is ready.</div>
                  </div>
                  <span className="onb-pill">In Settings</span>
                </div>
                <Actions>
                  <button className="v2-btn v2-btn-primary" onClick={next}>Continue <ArrowRight size={15} /></button>
                </Actions>
              </div>
            )}

            {step === 6 && (
              <div style={{ display: "grid", gap: 16 }} data-testid="onboarding-done">
                <Intro icon={<Check size={20} />} title={`${firm?.name || firmForm.name || "Your practice"} is ready`} text="Here is where things stand, and the one thing to do next." />
                <ul className="onb-checklist">
                  <Checked ok label="Firm set up" detail={firmForm.city ? `${firm?.name || firmForm.name}, ${firmForm.city}` : undefined} />
                  <Checked ok={Boolean(clientId)} label={clientId ? `${clientName} added` : "First client"} />
                  <Checked
                    ok={Boolean(firstDoc && firstDoc.status !== "Failed")}
                    label={firstDoc ? `${firstDoc.name} read` : "First document"}
                    detail={firstDoc && firstDoc.status !== "Failed" ? `${firstDoc.txnCount ?? 0} transactions${firstDoc.reviewCount ? `, ${firstDoc.reviewCount} to review` : ""}` : "Upload from the client's Documents tab"}
                  />
                  <Checked ok label="Agent autonomy set" detail={`${autonomy.auto_recon ? "Auto recon on" : "Recon on request"} · ${autonomy.auto_chase_day ? `chase by the ${autonomy.auto_chase_day}th` : "no automatic chase"}`} />
                </ul>
                <div className="onb-note">
                  <b>Next:</b>{" "}
                  {firstDoc && firstDoc.status !== "Failed"
                    ? firstDoc.reviewCount
                      ? `confirm the ${firstDoc.reviewCount} line${firstDoc.reviewCount === 1 ? "" : "s"} in review, then upload the books (Tally or ledger) so Recon can match the month.`
                      : "upload the books (Tally or ledger) so Recon can match the month."
                    : "upload a bank statement and the books for the month."}
                </div>
                <Actions>
                  <button className="v2-btn v2-btn-primary v2-btn-lg" onClick={finish}>Open the client workspace <ArrowRight size={15} /></button>
                  <button className="v2-btn v2-btn-ghost" onClick={() => void completeOnboarding().then(() => navigate({ to: "/v2/settings" }))}>
                    <Users size={15} /> Invite your team
                  </button>
                </Actions>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <OnboardingPanel
        step={step}
        mode={mode}
        firmName={firmForm.name || firm?.name || ""}
        partnerName={account.name || session?.name || ""}
        client={{ name: client.name, contact: client.contactName }}
        docName={uploaded}
        reading={reading}
        txns={firstDoc?.txnCount ?? 0}
        review={firstDoc?.reviewCount ?? 0}
        autonomy={autonomy}
      />
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" }) {
  return (
    <div className="onb-stat" data-tone={tone}>
      <span className="num">{n}</span>
      <span>{label}</span>
    </div>
  );
}

function Toggle({ label, text, on, onChange }: { label: string; text: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="onb-toggle">
      <div>
        <div className="onb-toggle-label">{label}</div>
        <div className="onb-toggle-text">{text}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="onb-switch" data-on={on} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
}

function Checked({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li data-ok={ok}>
      <span className="onb-dot">{ok ? <Check size={12} strokeWidth={3} /> : "·"}</span>
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {detail && <span style={{ display: "block", fontSize: 12.5, color: V.body, marginTop: 2 }}>{detail}</span>}
      </span>
    </li>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>{children}</div>;
}

function Intro({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 14, alignItems: "start", marginBottom: 4 }}>
      <span style={{ width: 40, height: 40, borderRadius: 13, background: V.blue, color: "#1B4763", display: "grid", placeItems: "center" }}>{icon}</span>
      <div>
        <h2 style={{ fontSize: 18, letterSpacing: "-0.01em" }}>{title}</h2>
        <p style={{ margin: "5px 0 0", fontSize: 13.5, color: V.body, lineHeight: 1.6 }}>{text}</p>
      </div>
    </div>
  );
}

function Field({ label, children, optional, aside }: { label: string; children: React.ReactNode; optional?: boolean; aside?: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label className="v2-label">
          {label}
          {optional && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}>optional</span>}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

const ONB_STYLES = `
.onb { min-height:100vh; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,520px); background:${V.bg}; }
.onb-main { padding:28px clamp(18px,5vw,64px) 48px; display:flex; flex-direction:column; align-items:center; gap:22px; }
.onb-main > * { width:100%; max-width:560px; }
.onb-brand { display:flex; align-items:center; gap:10px; font-size:15px; }
.onb-logo { width:28px; height:28px; border-radius:9px; background:${V.ink}; color:#fff; display:grid; place-items:center; font-weight:700; font-size:14px; }
.onb-rail { list-style:none; margin:6px 0 0; padding:0; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:6px; }
.onb-rail li { display:flex; flex-direction:column; gap:6px; font-size:12px; color:${V.muted}; }
.onb-rail li::before { content:""; height:3px; border-radius:999px; background:rgba(20,20,20,.09); transition:background .3s ease; }
.onb-rail li[data-state="done"]::before, .onb-rail li[data-state="current"]::before { background:${V.ink}; }
.onb-rail li[data-state="current"] { color:${V.ink}; font-weight:600; }
.onb-rail .onb-dot { display:none; }
.onb-rail-hint { display:none; }
.onb-card { background:${V.card}; border:1px solid ${V.line}; border-radius:22px; padding:clamp(20px,3vw,32px); box-shadow:0 1px 2px rgba(20,20,20,.04), 0 24px 48px -36px rgba(20,20,20,.35); }
.onb-eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:${V.muted}; font-weight:700; margin-bottom:16px; }
.onb-title { font-size:clamp(24px,3vw,30px); letter-spacing:-0.03em; line-height:1.15; margin:0; }
.onb-sub { margin:8px 0 4px; font-size:14px; color:${V.body}; line-height:1.6; }
.onb-foot { font-size:12.5px; color:${V.muted}; margin:0; }
.onb-2col { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr)); }
.onb-drop { display:grid; justify-items:center; gap:6px; text-align:center; border:1.5px dashed rgba(20,20,20,.18); border-radius:18px; padding:36px 20px; cursor:pointer; transition:border-color .2s ease, background .2s ease; }
.onb-drop:hover { border-color:${V.ink}; background:rgba(20,20,20,.02); }
.onb-drop-icon { width:46px; height:46px; border-radius:14px; background:${V.blue}; color:#1B4763; display:grid; place-items:center; margin-bottom:6px; }
.onb-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.onb-stat { background:${V.gray}; border-radius:14px; padding:12px 14px; display:grid; gap:2px; font-size:12px; color:${V.body}; }
.onb-stat .num { font-size:22px; font-weight:600; color:${V.ink}; letter-spacing:-0.02em; }
.onb-stat[data-tone="warn"] .num { color:#8A5A00; }
.onb-note { background:${V.gray}; border-radius:14px; padding:12px 14px; font-size:13px; color:${V.body}; line-height:1.55; }
.onb-result { display:flex; gap:8px; align-items:center; font-weight:600; }
.onb-toggle, .onb-channel { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; align-items:center; border:1px solid ${V.line}; border-radius:16px; padding:14px 16px; }
.onb-channel { grid-template-columns:auto minmax(0,1fr) auto; }
.onb-channel-icon { width:36px; height:36px; border-radius:11px; background:${V.gray}; display:grid; place-items:center; }
.onb-toggle-label { font-size:14px; font-weight:600; }
.onb-toggle-text { font-size:12.5px; color:${V.body}; margin-top:3px; line-height:1.5; }
.onb-pill { font-size:11.5px; color:${V.muted}; border:1px solid ${V.line}; border-radius:999px; padding:4px 10px; white-space:nowrap; }
.onb-switch { width:42px; height:24px; border-radius:999px; border:0; background:rgba(20,20,20,.14); position:relative; cursor:pointer; transition:background .2s ease; flex:0 0 auto; }
.onb-switch span { position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:999px; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .2s ease; }
.onb-switch[data-on="true"] { background:${V.green}; }
.onb-switch[data-on="true"] span { transform:translateX(18px); }
.onb-switch:focus-visible { outline:2px solid ${V.ink}; outline-offset:2px; }
.onb-checklist { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
.onb-checklist li { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:start; font-size:13.5px; }
.onb-checklist .onb-dot { width:22px; height:22px; border-radius:999px; display:grid; place-items:center; background:${V.gray}; color:${V.muted}; font-size:12px; }
.onb-checklist li[data-ok="true"] .onb-dot { background:rgba(31,90,70,.14); color:${V.green}; }
@media (max-width:980px) { .onb { grid-template-columns:minmax(0,1fr); } .onb-panel { display:none !important; } }
@media (max-width:560px) { .onb-rail-label { display:none; } .onb-stats { grid-template-columns:minmax(0,1fr); } }
`;
