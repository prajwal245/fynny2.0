/**
 * FynHelp v2 — first run journey.
 * Sign in, create the firm, add the first client, connect Gmail or skip,
 * upload the first document, then land on the portfolio.
 */
import { useRef, useState } from "react";
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
  const { session, saveFirm, addClient, addDoc, completeOnboarding, firm } = useV2();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(session ? 1 : 0);
  const [account, setAccount] = useState({ name: session?.name ?? "", email: session?.email ?? "", password: "" });
  const [firmForm, setFirmForm] = useState({ name: firm?.name ?? "", city: firm?.city ?? "", frn: firm?.frn ?? "" });
  const [client, setClient] = useState({ name: "", entityType: ENTITY_TYPES[0], gstin: "", contactName: "", email: "", phone: "" });
  const [clientId, setClientId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const email = account.email.trim();
    const { error } = await supabase.auth.signUp({
      email,
      password: account.password,
      options: { data: { full_name: account.name.trim() }, emailRedirectTo: `${window.location.origin}/v2` },
    });
    if (error && /already/i.test(error.message)) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: account.password });
      if (signInError) { setBusy(false); toast.error(signInError.message); return; }
    } else if (error) {
      setBusy(false); toast.error(error.message); return;
    }
    setBusy(false);
    toast.success(`Welcome ${account.name.trim().split(" ")[0] || "in"}`);
    next();
  };

  const submitFirm = (e: React.FormEvent) => {
    e.preventDefault();
    saveFirm({ ...firmForm, partnerName: account.name, email: account.email });
    toast.success("Firm created");
    next();
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

  const finish = () => {
    completeOnboarding();
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
          {step === 0 && (
            <form onSubmit={submitAccount} style={{ display: "grid", gap: 16 }}>
              <Intro icon={<UserPlus size={20} />} title="Create your FynHelp account" text="One login for the whole practice. You can invite the rest of the team later." />
              <Field label="Full name"><input className="v2-input" required value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} placeholder="Prajwal Vakode" /></Field>
              <Field label="Work email"><input className="v2-input" type="email" required value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} placeholder="you@firm.com" /></Field>
              <Field label="Password"><input className="v2-input" type="password" required minLength={6} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} placeholder="At least six characters" /></Field>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="v2-btn v2-btn-primary" type="submit" disabled={busy}>{busy ? "Creating" : "Create account"}</button>
              </div>
              <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>
                Already have a FynHelp practice login? Use the same email and password here and we will bring your practice in.
              </p>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={submitFirm} style={{ display: "grid", gap: 16 }}>
              <Intro icon={<Building2 size={20} />} title="Set up your firm" text="This name appears on every MIS report and client message you send." />
              <Field label="Firm name"><input className="v2-input" required value={firmForm.name} onChange={(e) => setFirmForm({ ...firmForm, name: e.target.value })} placeholder="Mehta and Associates" /></Field>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                <Field label="City"><input className="v2-input" required value={firmForm.city} onChange={(e) => setFirmForm({ ...firmForm, city: e.target.value })} placeholder="Bengaluru" /></Field>
                <Field label="Firm registration number"><input className="v2-input" value={firmForm.frn} onChange={(e) => setFirmForm({ ...firmForm, frn: e.target.value })} placeholder="012345S" /></Field>
              </div>
              <button className="v2-btn v2-btn-primary" type="submit" style={{ justifySelf: "start" }}>Create firm</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitClient} style={{ display: "grid", gap: 16 }}>
              <Intro icon={<UserPlus size={20} />} title="Add your first client" text="The contact details are used by the Chaser agent when documents are pending." />
              <Field label="Client name"><input className="v2-input" required value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Sundar Textiles Pvt Ltd" /></Field>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                <Field label="Entity type">
                  <select className="v2-input" value={client.entityType} onChange={(e) => setClient({ ...client, entityType: e.target.value })}>
                    {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="GSTIN"><input className="v2-input" value={client.gstin} onChange={(e) => setClient({ ...client, gstin: e.target.value })} placeholder="27AABCS1429B1ZP" /></Field>
              </div>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
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
                  onClick={() => { saveFirm({ gmailConnected: true }); toast.success("Gmail connected. New attachments will arrive automatically."); next(); }}
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
                    <input ref={fileRef} type="file" accept=".csv,.xml,.pdf" hidden onChange={(e) => upload(e.target.files)} />
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
