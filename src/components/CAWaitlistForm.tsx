import { useState, FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getAttribution } from "@/lib/utm";
import { notifyWaitlistLead } from "@/lib/waitlistNotify.functions";

const ROLES = ["Partner", "Manager", "Article / Junior", "Other"];
const CLIENT_COUNTS = ["1–4", "5–20", "21–40", "40+"];
const HEAR_ABOUT = [
  "Google search",
  "LinkedIn",
  "Twitter / X",
  "WhatsApp / Friend / Colleague",
  "CA group / Community",
  "Product Hunt",
  "Other",
];

const schema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().email("Valid work email required").max(255),
  firm_name: z.string().trim().min(1, "Firm name is required").max(150),
  role: z.string().min(1, "Please select your role"),
  client_entities: z.string().min(1, "Please select client count"),
  hear_about: z.string().min(1, "Please select an option"),
  month_end_pain: z.string().trim().max(500).optional(),
});

type FormState = {
  full_name: string;
  email: string;
  firm_name: string;
  role: string;
  client_entities: string;
  hear_about: string;
  month_end_pain: string;
};

const initial: FormState = {
  full_name: "",
  email: "",
  firm_name: "",
  role: "",
  client_entities: "",
  hear_about: "",
  month_end_pain: "",
};

export default function CAWaitlistForm() {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      if (errors[k]) setErrors((er) => ({ ...er, [k]: "" }));
    };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.errors.forEach((er) => {
        if (er.path[0]) fe[String(er.path[0])] = er.message;
      });
      setErrors(fe);
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      const attr = getAttribution();
      const { data: maxRow } = await supabase
        .from("waitlist")
        .select("position")
        .order("position", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((maxRow?.position as number | null) ?? 0) + 1;

      const { error } = await supabase.from("waitlist").insert({
        name: parsed.data.full_name,
        email: parsed.data.email.toLowerCase(),
        company_name: parsed.data.firm_name,
        phone: "",
        company_type: "CA Firm",
        company_size: "",
        location: "",
        role: parsed.data.role,
        client_entities: parsed.data.client_entities,
        hear_about: parsed.data.hear_about,
        month_end_pain: parsed.data.month_end_pain || null,
        utm_source: attr.utm_source || null,
        utm_medium: attr.utm_medium || null,
        utm_campaign: attr.utm_campaign || null,
        referrer: attr.referrer || null,
        landing_page: attr.landing_page || null,
        position: nextPos,
        is_converted: false,
      });
      if (error) throw error;

      // Fire-and-forget lead notification email.
      notifyWaitlistLead({
        data: {
          full_name: parsed.data.full_name,
          email: parsed.data.email.toLowerCase(),
          firm_name: parsed.data.firm_name,
          role: parsed.data.role,
          client_entities: parsed.data.client_entities,
          hear_about: parsed.data.hear_about,
          month_end_pain: parsed.data.month_end_pain || "",
          utm_source: attr.utm_source || "",
          utm_medium: attr.utm_medium || "",
          utm_campaign: attr.utm_campaign || "",
          referrer: attr.referrer || "",
          landing_page: attr.landing_page || "",
        },
      }).catch((err) => { console.error("[waitlist] notify error", err); });

      setSubmitted(true);
      setForm(initial);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
      setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-10 px-4">
        <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-fyn-red/10 border border-fyn-red/20 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-fyn-red" strokeWidth={2.2} />
        </div>
        <h3 className="text-fyn-ink text-2xl font-bold mb-2" style={{ fontFamily: "Georgia, serif" }}>
          Thanks for joining.
        </h3>
        <p className="text-fyn-ink/65 text-sm md:text-[15px] max-w-sm mx-auto leading-relaxed">
          We'll open access in small batches.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full px-4 py-3 rounded-lg border border-fyn-ink/15 bg-white text-fyn-ink placeholder:text-fyn-ink/40 text-sm focus:outline-none focus:ring-2 focus:ring-fyn-red focus:border-transparent transition-all disabled:opacity-60";
  const labelCls = "block text-sm font-medium text-fyn-ink mb-1.5";
  const errCls = "text-fyn-red text-xs mt-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="cawl-name" className={labelCls}>Full Name *</label>
        <input id="cawl-name" type="text" required value={form.full_name} onChange={update("full_name")} placeholder="Your full name" className={inputCls} disabled={loading} maxLength={100} />
        {errors.full_name && <p className={errCls}>{errors.full_name}</p>}
      </div>

      <div>
        <label htmlFor="cawl-email" className={labelCls}>Work Email *</label>
        <input id="cawl-email" type="email" required value={form.email} onChange={update("email")} placeholder="you@yourfirm.com" className={inputCls} disabled={loading} maxLength={255} />
        {errors.email && <p className={errCls}>{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="cawl-firm" className={labelCls}>Firm / Practice Name *</label>
        <input id="cawl-firm" type="text" required value={form.firm_name} onChange={update("firm_name")} placeholder="Your firm name" className={inputCls} disabled={loading} maxLength={150} />
        {errors.firm_name && <p className={errCls}>{errors.firm_name}</p>}
      </div>

      <div>
        <label htmlFor="cawl-role" className={labelCls}>Your Role *</label>
        <select id="cawl-role" required value={form.role} onChange={update("role")} className={inputCls} disabled={loading}>
          <option value="">Select your role</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {errors.role && <p className={errCls}>{errors.role}</p>}
      </div>

      <div>
        <label htmlFor="cawl-clients" className={labelCls}>Number of Client Entities *</label>
        <select id="cawl-clients" required value={form.client_entities} onChange={update("client_entities")} className={inputCls} disabled={loading}>
          <option value="">Select client count</option>
          {CLIENT_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.client_entities && <p className={errCls}>{errors.client_entities}</p>}
      </div>

      <div>
        <label htmlFor="cawl-hear" className={labelCls}>How did you hear about us? *</label>
        <select id="cawl-hear" required value={form.hear_about} onChange={update("hear_about")} className={inputCls} disabled={loading}>
          <option value="">Select an option</option>
          {HEAR_ABOUT.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        {errors.hear_about && <p className={errCls}>{errors.hear_about}</p>}
      </div>

      <div>
        <label htmlFor="cawl-pain" className={labelCls}>
          What’s your biggest month-end pain? <span className="text-fyn-ink/40 font-normal">(optional)</span>
        </label>
        <textarea id="cawl-pain" value={form.month_end_pain} onChange={update("month_end_pain")} placeholder="e.g. chasing clients for bank statements" className={`${inputCls} min-h-[84px] resize-y`} disabled={loading} maxLength={500} rows={3} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 font-semibold text-white py-3.5 rounded-lg bg-fyn-red transition-all duration-200 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>) : "Join Waitlist"}
      </button>

      {errors.form && <p role="status" aria-live="polite" className="text-fyn-red text-sm text-center">{errors.form}</p>}
      <p className="text-xs text-fyn-ink/50 text-center pt-1">No spam. We'll only email you about FynHelp access.</p>
    </form>
  );
}
