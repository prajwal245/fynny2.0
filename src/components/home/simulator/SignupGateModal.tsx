import { useState } from "react";
import { z } from "zod";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  scenarioName: string;
  onClose: () => void;
  onUnlocked: () => void;
}

const schema = z.object({
  business_name: z.string().trim().min(1, "Business name required").max(150),
  full_name: z.string().trim().min(1, "Your name required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept to continue" }) }),
});

export default function SignupGateModal({ open, scenarioName, onClose, onUnlocked }: Props) {
  const [state, setState] = useState({ business_name: "", full_name: "", email: "", phone: "", consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const update = (k: string, v: string | boolean) => {
    setState((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(state);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.errors.forEach((er) => {
        if (er.path[0]) fe[String(er.path[0])] = er.message;
      });
      setErrors(fe);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("early_access_requests").insert({
        email: parsed.data.email,
        requested_module: `simulator:${scenarioName}|${parsed.data.business_name}|${parsed.data.full_name}${parsed.data.phone ? `|${parsed.data.phone}` : ""}`,
      });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => {
        onUnlocked();
        onClose();
        setSuccess(false);
        setState({ business_name: "", full_name: "", email: "", phone: "", consent: false });
      }, 1400);
    } catch (err) {
      setErrors({ form: "Could not save. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-fyn-ink/70 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-fyn-beige-card border border-fyn-ink/10 rounded-2xl p-7 md:p-8 shadow-2xl animate-[scale-in_0.2s_ease-out]"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-fyn-ink/10 flex items-center justify-center text-fyn-ink/60"
        >
          <X className="w-4 h-4" />
        </button>

        {success ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-14 h-14 text-fyn-success mx-auto mb-4" />
            <h3 className="text-2xl text-fyn-ink mb-2" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>
              Report Unlocked
            </h3>
            <p className="text-fyn-ink/65 text-sm" style={{ fontFamily: "'Roboto', sans-serif" }}>
              Check your email for the full {scenarioName} analysis.
            </p>
          </div>
        ) : (
          <>
            <span className="inline-block text-[10px] uppercase tracking-[0.15em] text-fyn-gold mb-2" style={{ fontFamily: "'Work Sans', sans-serif" }}>
              {scenarioName} · Full analysis
            </span>
            <h3 className="text-2xl md:text-3xl text-fyn-ink mb-2 leading-tight" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>
              Get Your Personalized Financial Impact Report
            </h3>
            <p className="text-fyn-ink/65 text-sm mb-6" style={{ fontFamily: "'Roboto', sans-serif" }}>
              See the exact numbers for your business, free for 30 days.
            </p>

            <form onSubmit={submit} className="space-y-3" style={{ fontFamily: "'Roboto', sans-serif" }}>
              {[
                { k: "business_name", label: "Business name *", type: "text" },
                { k: "full_name", label: "Your name *", type: "text" },
                { k: "email", label: "Email *", type: "email" },
                { k: "phone", label: "Phone (optional)", type: "tel" },
              ].map((f) => (
                <div key={f.k}>
                  <input
                    type={f.type}
                    placeholder={f.label}
                    value={state[f.k as keyof typeof state] as string}
                    onChange={(e) => update(f.k, e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-md border border-fyn-ink/15 bg-white/60 text-fyn-ink text-sm placeholder:text-fyn-ink/40 focus:outline-hidden focus:border-fyn-red focus:ring-2 focus:ring-fyn-red/15 transition"
                  />
                  {errors[f.k] && <p className="text-fyn-red text-xs mt-1">{errors[f.k]}</p>}
                </div>
              ))}

              <label className="flex items-start gap-2 text-xs text-fyn-ink/70 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={state.consent}
                  onChange={(e) => update("consent", e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-fyn-red"
                />
                <span>I agree to receive my report and product updates from FynHelp.</span>
              </label>
              {errors.consent && <p className="text-fyn-red text-xs">{errors.consent}</p>}
              {errors.form && <p className="text-fyn-red text-xs">{errors.form}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-fyn-red text-white font-medium text-sm hover:bg-fyn-red/90 disabled:opacity-60 transition-colors"
                style={{ fontFamily: "'Raleway', sans-serif" }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? "Sending..." : "Get My Full Report →"}
              </button>
              <p className="text-center text-[11px] text-fyn-ink/45 pt-1">
                No credit card required. Unsubscribe anytime.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
