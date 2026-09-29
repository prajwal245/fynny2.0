import { useState, FormEvent } from "react";
import { Loader2, Check, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

const COMPANY_TYPES = [
  "E-commerce & D2C",
  "SaaS & Technology",
  "Manufacturing",
  "Professional Services",
  "Healthcare",
  "Education",
  "Retail",
  "Other",
];

const COMPANY_SIZES = ["1-10", "10-50", "50-100", "100-250", "250+"];

type FormData = {
  email: string;
  name: string;
  company_name: string;
  phone: string;
  company_type: string;
  company_size: string;
  location: string;
};

const initial: FormData = {
  email: "",
  name: "",
  company_name: "",
  phone: "",
  company_type: "",
  company_size: "",
  location: "",
};

export interface WaitlistFormProps {
  variant?: "simple" | "detailed";
  inline?: boolean;
  /** Visual theme of the form (light backgrounds vs. dark/red backgrounds). */
  theme?: "light" | "dark";
  className?: string;
  /** Called when the form is submitted successfully. */
  onSuccess?: () => void;
}

export default function WaitlistForm({
  variant = "detailed",
  inline = false,
  theme = "light",
  className = "",
  onSuccess,
}: WaitlistFormProps) {
  const [formData, setFormData] = useState<FormData>(initial);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const updateField = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFormData((p) => ({ ...p, [field]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const email = formData.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: "error", text: "Valid email required" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { data: maxRow } = await supabase
        .from("waitlist")
        .select("position")
        .order("position", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((maxRow?.position as number | null) ?? 0) + 1;

      const { error } = await supabase.from("waitlist").insert({
        email: formData.email.trim().toLowerCase(),
        name: formData.name || "",
        company_name: formData.company_name || "",
        phone: formData.phone || "",
        company_type: formData.company_type || "",
        company_size: formData.company_size || "",
        location: formData.location || "",
        position: nextPos,
        is_converted: false,
      });

      if (error) {
        setMessage({ type: "error", text: error.message || "Something went wrong. Please try again." });
      } else {
        track("waitlist_signup", { source: "homepage" });
        setSubmitted(true);
        setFormData(initial);
        onSuccess?.();
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  const isSimple = variant === "simple";
  const isDark = theme === "dark";

  const inputCls = isDark
    ? "w-full px-4 py-3 rounded-lg border border-white/30 bg-white text-fyn-ink placeholder:text-fyn-ink/40 text-sm focus:outline-hidden focus:ring-4 focus:ring-white/40 disabled:opacity-60"
    : "w-full px-4 py-3 rounded-lg border border-border bg-white text-fyn-ink placeholder:text-fyn-ink/40 text-sm focus:outline-hidden focus:ring-2 focus:ring-fyn-red focus:border-transparent transition-all disabled:opacity-60";

  const labelCls = isDark
    ? "block text-sm font-medium text-white mb-1.5"
    : "block text-sm font-medium text-foreground mb-1.5";

  const buttonCls = isDark
    ? "w-full inline-flex items-center justify-center gap-2 bg-white text-fyn-ink font-bold text-base md:text-lg px-10 py-4 rounded-lg shadow-md hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] transition-all duration-200 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-white/60 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
    : "w-full inline-flex items-center justify-center gap-2 font-semibold text-white py-3.5 rounded-lg bg-fyn-red transition-all duration-200 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed";

  const helperCls = isDark
    ? "text-white/70 text-xs text-center pt-1"
    : "text-xs text-fyn-ink/50 text-center pt-1";

  const successCls = isDark
    ? "text-sm font-medium text-center text-white bg-white/15 py-2.5 px-3 rounded-lg"
    : "text-green-600 text-sm mt-2 text-center";

  const errorCls = isDark
    ? "text-sm font-medium text-center text-white bg-black/20 py-2.5 px-3 rounded-lg"
    : "text-red-600 text-sm mt-2 text-center";

  if (submitted) {
    return (
      <div className={`text-center py-6 md:py-10 ${className}`}>
        <div className="mx-auto mb-5 w-16 h-16 md:w-20 md:h-20 rounded-full bg-fyn-red/10 border border-fyn-red/20 flex items-center justify-center">
          <Check className="w-7 h-7 md:w-9 md:h-9 text-fyn-red" strokeWidth={2.5} />
        </div>
        <h3
          className="text-fyn-ink leading-[1.1] text-[26px] md:text-[32px] mb-3"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
        >
          You're on the list
        </h3>
        <p className="text-fyn-ink/65 text-sm md:text-[15px] max-w-md mx-auto mb-6 leading-relaxed">
          We review applications on a rolling basis. Expect an email from our team within{" "}
          <span className="text-fyn-ink font-semibold">24–48 hours</span> with your early-access credentials and next steps.
        </p>
        <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-fyn-beige-dark border border-fyn-ink/8">
          <Mail className="w-4 h-4 text-fyn-gold flex-shrink-0" />
          <span className="text-fyn-ink/70 text-sm" style={{ fontFamily: "'Work Sans', sans-serif" }}>
            Check your inbox, and your spam folder
          </span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      <div className={isSimple ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
        <div>
          <label htmlFor="wl-email" className={labelCls}>
            Email <span className={isDark ? "text-white" : "text-fyn-red"}>*</span>
          </label>
          <input
            id="wl-email"
            type="email"
            required
            value={formData.email}
            onChange={updateField("email")}
            placeholder="your@email.com"
            className={inputCls}
            disabled={loading}
            maxLength={255}
          />
        </div>

        <div>
          <label htmlFor="wl-name" className={labelCls}>
            Name {isSimple ? "" : <span className="text-fyn-ink/40 font-normal">(optional)</span>}
          </label>
          <input
            id="wl-name"
            type="text"
            value={formData.name}
            onChange={updateField("name")}
            placeholder="Your name"
            className={inputCls}
            disabled={loading}
            maxLength={100}
          />
        </div>
      </div>

      {!isSimple && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="wl-company" className={labelCls}>Company Name</label>
              <input
                id="wl-company"
                type="text"
                value={formData.company_name}
                onChange={updateField("company_name")}
                placeholder="Your company"
                className={inputCls}
                disabled={loading}
                maxLength={150}
              />
            </div>
            <div>
              <label htmlFor="wl-phone" className={labelCls}>Phone Number</label>
              <input
                id="wl-phone"
                type="tel"
                value={formData.phone}
                onChange={updateField("phone")}
                placeholder="9876543210"
                className={inputCls}
                disabled={loading}
                maxLength={20}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="wl-ctype" className={labelCls}>Company Type</label>
              <select
                id="wl-ctype"
                value={formData.company_type}
                onChange={updateField("company_type")}
                className={inputCls}
                disabled={loading}
              >
                <option value="">Select company type</option>
                {COMPANY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wl-csize" className={labelCls}>Company Size</label>
              <select
                id="wl-csize"
                value={formData.company_size}
                onChange={updateField("company_size")}
                className={inputCls}
                disabled={loading}
              >
                <option value="">Select company size</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="wl-loc" className={labelCls}>Location / City</label>
            <input
              id="wl-loc"
              type="text"
              value={formData.location}
              onChange={updateField("location")}
              placeholder="Bengaluru"
              className={inputCls}
              disabled={loading}
              maxLength={100}
            />
          </div>
        </>
      )}

      <button type="submit" disabled={loading} className={buttonCls}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Joining...
          </>
        ) : (
          <>Join the Waitlist →</>
        )}
      </button>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={message.type === "success" ? successCls : errorCls}
        >
          {message.text}
        </p>
      )}

      <p className={helperCls}>
        No spam. We'll only email you about FYNHelp launch updates.
      </p>
    </form>
  );
}
