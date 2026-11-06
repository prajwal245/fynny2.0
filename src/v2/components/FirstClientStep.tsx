/**
 * Sign-up step "first client". Quick to finish, easy to skip, and worded for every kind of accounting
 * practice: a CA firm, an accounting or bookkeeping firm, or the finance team of a company.
 */
import { cloneElement, useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Briefcase, Building2, Check, Clock, Landmark, ShieldCheck, SkipForward, UserPlus } from "lucide-react";
import { ENTITY_TYPES } from "../store";
import { V } from "../ui";

export type PracticeKind = "ca" | "accounting" | "inhouse";
export interface ClientForm { name: string; entityType: string; gstin: string; contactName: string; email: string; phone: string }

export const KINDS: { value: PracticeKind; label: string; hint: string; icon: typeof Landmark; one: string; many: string }[] = [
  { value: "ca", label: "CA firm", hint: "Clients, by the month", icon: Landmark, one: "client", many: "clients" },
  { value: "accounting", label: "Accounting firm", hint: "Bookkeeping and finance services", icon: Briefcase, one: "client", many: "clients" },
  { value: "inhouse", label: "Company finance team", hint: "Your own entities", icon: Building2, one: "entity", many: "entities" },
];

const PLACEHOLDER: Record<PracticeKind, string> = { ca: "Sundar Textiles Pvt Ltd", accounting: "Greenleaf Cafe LLP", inhouse: "Acme India Pvt Ltd" };

function Field({ label, optional, hint, children, error }: { label: string; optional?: boolean; hint?: string; children: React.ReactElement<{ id?: string }>; error?: string | null }) {
  const auto = useId();
  const id = children.props.id ?? auto;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label className="v2-label" htmlFor={id} style={{ marginBottom: 0 }}>
        {label}
        {optional && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}>optional</span>}
      </label>
      {cloneElement(children, { id })}
      {error ? <div role="alert" style={{ fontSize: 12, color: V.maroon }}>{error}</div> : hint ? <div style={{ fontSize: 12, color: V.muted }}>{hint}</div> : null}
    </div>
  );
}


/** Three cards: what kind of practice this is. Drives the wording everywhere and decides whether an ICAI number is asked. */
export function KindPicker({ kind, setKind, legend }: { kind: PracticeKind; setKind: (k: PracticeKind) => void; legend: string }) {
  const reduce = useReducedMotion();
  const radioName = useId();
  return (
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend className="v2-label" style={{ marginBottom: 8 }}>{legend}</legend>
        <div role="radiogroup" aria-label="Kind of practice" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(min(170px,100%),1fr))" }}>
          {KINDS.map((o) => {
            const on = o.value === kind;
            return (
              <label key={o.value} style={{ position: "relative", cursor: "pointer" }}>
                <input type="radio" name={radioName} value={o.value} checked={on} onChange={() => setKind(o.value)} style={{ position: "absolute", opacity: 0, inset: 0 }} />
                <motion.div
                  animate={{ scale: on ? 1 : 0.985 }}
                  whileHover={reduce ? undefined : { y: -2 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${on ? V.coral : V.line}`, background: on ? V.blue : V.card, boxShadow: on ? "0 10px 24px -18px rgba(217,43,43,.6)" : "none" }}
                >
                  <o.icon size={19} color={on ? V.brandDeep : V.body} aria-hidden="true" />
                  <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13.5, color: V.ink }}>{o.label}</b>
                    <span style={{ fontSize: 11.5, color: V.muted }}>{o.hint}</span>
                  </span>
                  <AnimatePresence>
                    {on && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} style={{ width: 20, height: 20, borderRadius: 10, background: V.coral, color: "#fff", display: "grid", placeItems: "center" }}>
                        <Check size={13} strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </label>
            );
          })}
        </div>
      </fieldset>

  );
}

export function FirstClientStep({
  kind, setKind, client, setClient, gstinErr, clearGstinErr, onSubmit, onSkip, showKind = true,
}: {
  showKind?: boolean;
  kind: PracticeKind;
  setKind: (k: PracticeKind) => void;
  client: ClientForm;
  setClient: (c: ClientForm) => void;
  gstinErr: string | null;
  clearGstinErr: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSkip: () => void;
}) {
  const k = KINDS.find((x) => x.value === kind) ?? KINDS[0];
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 20 }} data-testid="first-client-step">
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <span style={{ width: 40, height: 40, borderRadius: 13, background: V.blue, color: V.brandDeep, display: "grid", placeItems: "center" }}><UserPlus size={20} /></span>
        <div>
          <h2 style={{ fontSize: 19, letterSpacing: "-0.01em" }}>Add your first {k.one}</h2>
          <p style={{ margin: "5px 0 0", fontSize: 13.5, color: V.body, lineHeight: 1.6 }}>
            The agents work one {k.one} at a time. A name is enough to start, and you can skip this and add {k.many} later.
          </p>
        </div>
      </div>

      {showKind && <KindPicker kind={kind} setKind={setKind} legend="I work in a" />}

      <div className="onb-2col" style={{ alignItems: "start" }}>
        <Field label={`${k.one[0].toUpperCase()}${k.one.slice(1)} name`}>
          <input className="v2-input" required autoFocus value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder={PLACEHOLDER[kind]} />
        </Field>
        <Field label="Email" optional hint={kind === "inhouse" ? "For reminders about missing documents." : `Only needed to chase documents from your ${k.one}.`}>
          <input className="v2-input" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="accounts@company.in" />
        </Field>
      </div>

      <details className="onb-more">
        <summary>More details <span>(optional)</span></summary>
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <div className="onb-2col">
            <Field label="Contact person" optional><input className="v2-input" value={client.contactName} onChange={(e) => setClient({ ...client, contactName: e.target.value })} placeholder="Ramesh Sundar" /></Field>
            <Field label="Entity type">
              <select className="v2-input" value={client.entityType} onChange={(e) => setClient({ ...client, entityType: e.target.value })}>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="onb-2col">
            <Field label="GSTIN" optional error={gstinErr}>
              <input className="v2-input v2-mono" value={client.gstin} aria-invalid={Boolean(gstinErr)} style={gstinErr ? { borderColor: V.maroon } : undefined} onChange={(e) => { setClient({ ...client, gstin: e.target.value }); clearGstinErr(); }} placeholder="27AABCS1429B1ZU" />
            </Field>
            <Field label="WhatsApp number" optional><input className="v2-input" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="919820011223" /></Field>
          </div>
        </div>
      </details>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <motion.button whileTap={{ scale: 0.97 }} className="v2-btn v2-btn-primary v2-btn-lg" type="submit" data-testid="add-client-continue">
          Add {k.one} and continue <ArrowRight size={16} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} className="v2-btn v2-btn-ghost v2-btn-lg" type="button" onClick={onSkip} data-testid="skip-client">
          <SkipForward size={16} /> Skip for now
        </motion.button>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="What to expect">
        {[
          { icon: Clock, t: "Takes about 20 seconds" },
          { icon: ShieldCheck, t: `Nothing is sent to your ${k.one}` },
          { icon: SkipForward, t: `Add more ${k.many} any time from Clients` },
        ].map((c) => (
          <li key={c.t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: V.body, background: V.gray, borderRadius: 999, padding: "6px 11px" }}>
            <c.icon size={13} aria-hidden="true" /> {c.t}
          </li>
        ))}
      </ul>
    </form>
  );
}
