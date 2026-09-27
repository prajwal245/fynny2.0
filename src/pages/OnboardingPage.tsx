import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { Building2, Landmark, BookOpen, Rocket, ChevronLeft, Check, Loader2 } from "lucide-react";
import StepConnectBanks from "@/components/onboarding/StepConnectBanks";
import StepSyncBooks from "@/components/onboarding/StepSyncBooks";

const steps = [
  { label: "Business Profile", icon: Building2 },
  { label: "Connect Banks", icon: Landmark },
  { label: "Sync Books", icon: BookOpen },
  { label: "Review & Launch", icon: Rocket },
];

const industries = [
  "Textile & Apparel", "Manufacturing", "IT & Software", "Healthcare", "Real Estate",
  "Retail & FMCG", "Construction", "Agriculture", "Education", "Hospitality",
  "Transport & Logistics", "Pharma", "Automotive", "Food & Beverage", "Export/Import",
  "Media & Entertainment", "Professional Services", "E-Commerce", "Energy", "Other",
];

const states = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    rotateY: direction > 0 ? 8 : -8,
    filter: "blur(4px)",
  }),
  center: { x: 0, opacity: 1, rotateY: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
    rotateY: direction < 0 ? 8 : -8,
    filter: "blur(4px)",
  }),
};

const OnboardingPage = () => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    business_type: "", industry: "", turnover_range: "", state: "",
    msme_udyam: "", employee_count: "",
  });
  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [selectedSoftware, setSelectedSoftware] = useState<string[]>([]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { ready: authReady } = useAuthRedirect("onboarding");

  // Load existing onboarding progress
  useEffect(() => {
    if (authLoading || !authReady) return;
    if (!user) return; // hook will redirect
    (async () => {
      const { data: profile } = await supabase
        .from("profiles").select("business_id").eq("user_id", user.id).maybeSingle();
      if (profile?.business_id) {
        const { data: biz } = await supabase
          .from("businesses").select("*").eq("id", profile.business_id).maybeSingle();
        if (biz) {
          setBusinessId(biz.id);
          if (biz.onboarding_completed) {
            navigate("/dashboard/cockpit");
            return;
          }
          setStep(Math.max(0, (biz.onboarding_step || 1) - 1));
          setForm({
            business_type: biz.business_type || "",
            industry: biz.industry || "",
            turnover_range: biz.turnover_range || "",
            state: biz.state || "",
            msme_udyam: biz.msme_udyam || "",
            employee_count: biz.employee_count || "",
          });
          const { data: banks } = await supabase
            .from("bank_accounts").select("bank_name").eq("business_id", biz.id);
          if (banks) setSelectedBanks(banks.map((b) => b.bank_name));
        }
      }
      setHydrated(true);
    })();
  }, [user, authLoading, authReady, navigate]);

  const updateField = (key: string, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const saveStep1 = async (skip = false) => {
    if (!user) return;
    if (!skip) {
      const e: Record<string, string> = {};
      if (!form.business_type) e.business_type = "Required";
      if (!form.industry) e.industry = "Required";
      if (!form.state) e.state = "Required";
      setErrors(e);
      if (Object.keys(e).length) {
        toast.error("Please fill in required fields");
        return;
      }
    } else {
      setErrors({});
    }
    setLoading(true);
    try {
      const payload = {
        business_type: form.business_type || null,
        industry: form.industry || null,
        turnover_range: form.turnover_range || null,
        state: form.state || null,
        msme_udyam: form.msme_udyam || null,
        employee_count: form.employee_count || null,
        onboarding_step: 2,
      };
      let bizId = businessId;
      if (bizId) {
        const { error } = await supabase.from("businesses").update(payload).eq("id", bizId);
        if (error) throw error;
      } else {
        const defaultName = form.industry ? `My ${form.industry} Business` : "My Business";
        // NOTE: cannot use .select() here — SELECT RLS on businesses reads profiles.business_id
        // via a STABLE function, which is stale within the same statement even though the
        // AFTER INSERT trigger link_business_to_creator has already linked the profile.
        const { error: insErr } = await supabase.from("businesses").insert({
          business_name: defaultName,
          ...payload,
        });
        if (insErr) throw insErr;
        const { data: linked, error: lookupErr } = await supabase
          .from("profiles").select("business_id").eq("user_id", user.id).maybeSingle();
        if (lookupErr) throw lookupErr;
        if (!linked?.business_id) throw new Error("Business was created but not linked to your profile.");
        bizId = linked.business_id;
        setBusinessId(bizId);
      }
      if (skip) toast.info("Skipped — you can fill this in later from Settings");
      else toast.success("Business profile saved");
      goTo(1);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const saveStep2 = async (skip = false) => {
    if (!businessId) return;
    if (!skip && selectedBanks.length === 0) {
      toast.error("Select at least one bank or skip");
      return;
    }
    setLoading(true);
    try {
      if (selectedBanks.length > 0) {
        const { data: existing } = await supabase
          .from("bank_accounts").select("bank_name").eq("business_id", businessId);
        const have = new Set((existing || []).map((b) => b.bank_name));
        const toInsert = selectedBanks
          .filter((b) => !have.has(b))
          .map((bank_name) => ({ business_id: businessId, bank_name }));
        if (toInsert.length) {
          const { error } = await supabase.from("bank_accounts").insert(toInsert);
          if (error) throw error;
        }
        toast.info("Banks saved. Account Aggregator linking coming soon.");
      }
      await supabase.from("businesses").update({ onboarding_step: 3 }).eq("id", businessId);
      goTo(2);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save banks");
    } finally {
      setLoading(false);
    }
  };

  const saveStep3 = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      await supabase.from("businesses").update({ onboarding_step: 4 }).eq("id", businessId);
      if (selectedSoftware.length > 0) {
        toast.info(`${selectedSoftware.join(", ")} sync coming soon. Use CSV upload for now.`);
      }
      goTo(3);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to advance");
    } finally {
      setLoading(false);
    }
  };

  const handleLaunch = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("businesses")
        .update({ onboarding_completed: true, onboarding_step: 4 })
        .eq("id", businessId);
      if (error) throw error;
      // Prime the cache with the fresh value BEFORE navigating so DashboardLayout's
      // useAuthRedirect doesn't briefly see stale onboarding_completed=false and
      // bounce the user back to /onboarding.
      queryClient.setQueryData(["business-onboarding", businessId], true);
      await queryClient.invalidateQueries({ queryKey: ["business-onboarding", businessId] });
      toast.success("Welcome to FynHelp! 🎉");
      navigate("/dashboard/cockpit", { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    "w-full h-[42px] px-4 border rounded text-sm focus:outline-hidden focus:ring-2 transition-all duration-200";

  const fieldStyle = (key: string) => ({
    background: "hsl(var(--fyn-beige))",
    borderColor: errors[key] ? "rgba(239,68,68,0.6)" : "hsl(var(--fyn-ink) / 0.10)",
    color: "hsl(var(--fyn-ink))",
    boxShadow: errors[key] ? "0 0 0 3px rgba(239,68,68,0.12)" : "inset 0 1px 2px rgba(0,0,0,0.04)",
  });

  if (authLoading || !hydrated) {
    const message = authLoading
      ? "Verifying your session…"
      : "Loading your onboarding progress…";
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "linear-gradient(135deg, hsl(var(--fyn-beige)) 0%, #FFF9F0 100%)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(139,105,20,0.15)",
            boxShadow: "0 12px 40px rgba(23,18,8,0.10), 0 2px 6px rgba(23,18,8,0.04)",
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 mx-auto mb-5 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(180deg, #D72424 0%, #C41E1E 100%)",
              boxShadow: "0 8px 20px rgba(196,30,30,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Loader2 className="text-white" size={24} />
          </motion.div>
          <h2 className="text-xl font-serif mb-2" style={{ color: "hsl(var(--fyn-ink))" }}>
            Preparing your onboarding
          </h2>
          <p className="text-sm" style={{ color: "hsl(var(--fyn-ink) / 0.65)" }}>
            {message}
          </p>
          <div className="mt-6 h-1 w-full rounded-full overflow-hidden" style={{ background: "hsl(var(--fyn-ink) / 0.08)" }}>
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="h-full w-1/3 rounded-full"
              style={{ background: "linear-gradient(90deg, hsl(var(--fyn-red)), hsl(var(--fyn-gold)))" }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, hsl(var(--fyn-beige)) 0%, #FFF9F0 100%)" }}>
      {/* Progress bar */}
      <div className="py-4" style={{ background: "hsl(var(--fyn-ink))", boxShadow: "0 4px 20px rgba(23,18,8,0.25)" }}>
        <div className="fyn-container flex items-center justify-center gap-4">
          {steps.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.label} className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: active ? 1.15 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{
                    background: done ? "#1F5A46" : active ? "hsl(var(--fyn-red))" : "rgba(255,255,255,0.10)",
                    color: done || active ? "#fff" : "rgba(255,255,255,0.4)",
                    boxShadow: active
                      ? "0 6px 16px rgba(196,30,30,0.45), inset 0 1px 0 rgba(255,255,255,0.25)"
                      : done
                      ? "0 4px 12px rgba(16,185,129,0.35)"
                      : "none",
                  }}
                >
                  {done ? <Check size={16} /> : i + 1}
                </motion.div>
                <span className={`hidden md:inline text-sm ${active ? "text-white" : "text-white/40"}`}>{s.label}</span>
                {i < steps.length - 1 && (
                  <div
                    className="w-8 h-0.5 transition-colors duration-500"
                    style={{ background: i < step ? "#1F5A46" : "rgba(255,255,255,0.1)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="fyn-container max-w-4xl py-12" style={{ perspective: "1200px" }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "tween", ease: "anticipate", duration: 0.5 }}
            style={{ transformStyle: "preserve-3d" }}
          >
            {step === 0 && (
              <div className="max-w-2xl">
                <h1 className="text-3xl font-serif mb-2" style={{ color: "hsl(var(--fyn-ink))" }}>
                  Tell us about your business
                </h1>
                <p className="mb-8" style={{ color: "hsl(var(--fyn-ink) / 0.60)" }}>
                  Just three quick fields to personalise your dashboard. Everything else can wait.
                </p>
                <div
                  className="rounded-xl p-6 space-y-4"
                  style={{
                    background: "rgba(255,255,255,0.85)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(139,105,20,0.15)",
                    boxShadow: "0 12px 40px rgba(23,18,8,0.08), 0 2px 6px rgba(23,18,8,0.04)",
                  }}
                >
                  {[
                    { key: "business_type", label: "Business type", required: true, options: ["Pvt Ltd", "LLP", "Proprietorship", "Partnership"] },
                    { key: "industry", label: "Industry vertical", required: true, options: industries },
                    { key: "state", label: "State of registration", required: true, options: states },
                  ].map(({ key, label, options, required }) => (
                    <div key={key}>
                      <label className="text-sm mb-1 block" style={{ color: "hsl(var(--fyn-ink) / 0.70)" }}>
                        {label} {required && <span style={{ color: "#EF4444" }}>*</span>}
                      </label>
                      <select
                        value={(form as any)[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                        className={inputBase + " appearance-none"}
                        style={fieldStyle(key)}
                      >
                        <option value="">Select {label.toLowerCase()}</option>
                        {options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {errors[key] && <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{errors[key]}</p>}
                    </div>
                  ))}
                  <details className="pt-1">
                    <summary className="text-[13px] cursor-pointer" style={{ color: "hsl(var(--fyn-gold))" }}>
                      Add optional details (turnover, headcount, MSME) — you can also fill these later
                    </summary>
                    <div className="mt-3 space-y-4">
                      {[
                        { key: "turnover_range", label: "Annual turnover range", options: ["< ₹1 Cr", "₹1–5 Cr", "₹5–25 Cr", "₹25–100 Cr", "₹100 Cr+"] },
                        { key: "employee_count", label: "Number of employees", options: ["1-5", "6-10", "11-25", "26-50", "51-100", "100+"] },
                      ].map(({ key, label, options }) => (
                        <div key={key}>
                          <label className="text-sm mb-1 block" style={{ color: "hsl(var(--fyn-ink) / 0.70)" }}>{label}</label>
                          <select
                            value={(form as any)[key]}
                            onChange={(e) => updateField(key, e.target.value)}
                            className={inputBase + " appearance-none"}
                            style={fieldStyle(key)}
                          >
                            <option value="">Select {label.toLowerCase()}</option>
                            {options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                      <div>
                        <label className="text-sm mb-1 block" style={{ color: "hsl(var(--fyn-ink) / 0.70)" }}>
                          MSME Udyam number
                        </label>
                        <input
                          value={form.msme_udyam}
                          onChange={(e) => updateField("msme_udyam", e.target.value)}
                          className={inputBase}
                          style={fieldStyle("msme_udyam")}
                          placeholder="UDYAM-XX-00-0000000"
                        />
                      </div>
                    </div>
                  </details>
                </div>
                <div className="flex items-center justify-between mt-8 gap-3 flex-wrap">
                  <button
                    onClick={() => saveStep1(true)}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium"
                    style={{
                      background: "#FFFFFF",
                      color: "hsl(var(--fyn-ink))",
                      border: "1.5px solid rgba(23,18,8,0.18)",
                      cursor: "pointer",
                    }}
                  >
                    Skip for now →
                  </button>
                  <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ y: 1 }}
                    onClick={() => saveStep1(false)}
                    disabled={loading}
                    className="px-8 py-3 rounded-lg font-medium text-white disabled:opacity-50 inline-flex items-center gap-2"
                    style={{
                      background: "linear-gradient(180deg, #D72424 0%, #C41E1E 100%)",
                      boxShadow: "0 8px 20px rgba(196,30,30,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    {loading ? "Saving..." : "Continue →"}
                  </motion.button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <button
                  onClick={() => goTo(0)}
                  className="flex items-center gap-1 text-sm mb-6 hover:underline"
                  style={{ color: "hsl(var(--fyn-gold))" }}
                >
                  <ChevronLeft size={16} /> Back
                </button>
                <StepConnectBanks
                  selectedBanks={selectedBanks}
                  setSelectedBanks={setSelectedBanks}
                  onContinue={() => saveStep2(false)}
                  onSkip={() => saveStep2(true)}
                />
              </div>
            )}

            {step === 2 && (
              <StepSyncBooks
                selectedSoftware={selectedSoftware}
                setSelectedSoftware={setSelectedSoftware}
                onContinue={saveStep3}
                onBack={() => goTo(1)}
              />
            )}

            {step === 3 && (
              <div className="max-w-2xl">
                <h1 className="text-3xl font-serif mb-3" style={{ color: "hsl(var(--fyn-ink))" }}>
                  You're all set.
                </h1>
                <p className="mb-8 text-base" style={{ color: "hsl(var(--fyn-ink) / 0.65)" }}>
                  Your dashboard is ready. You can connect banks, sync books and refine your profile anytime from Settings.
                </p>

                <div
                  className="rounded-lg p-5 mb-8 border text-sm"
                  style={{ background: "hsl(var(--fyn-beige-dark))", borderColor: "hsl(var(--fyn-ink) / 0.10)", color: "hsl(var(--fyn-ink) / 0.75)" }}
                >
                  <span style={{ color: "hsl(var(--fyn-gold))", fontWeight: 600 }}>{form.industry || "Business"}</span>
                  {" · "}
                  {selectedBanks.length > 0 ? `${selectedBanks.length} bank${selectedBanks.length > 1 ? "s" : ""}` : "No banks yet"}
                  {" · "}
                  {selectedSoftware.length > 0 ? `${selectedSoftware.length} accounting tool${selectedSoftware.length > 1 ? "s" : ""}` : "No accounting sync yet"}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => goTo(2)}
                    className="text-[13px] hover:underline"
                    style={{ color: "rgba(23,18,8,0.6)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    ← Back
                  </button>
                  <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ y: 1 }}
                    onClick={handleLaunch}
                    disabled={loading}
                    className="px-10 py-4 rounded-lg text-lg font-medium text-white disabled:opacity-50 inline-flex items-center gap-2"
                    style={{
                      background: "linear-gradient(180deg, #D72424 0%, #C41E1E 100%)",
                      boxShadow: "0 12px 28px rgba(196,30,30,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                  >
                    {loading && <Loader2 size={18} className="animate-spin" />}
                    {loading ? "Setting up..." : "Open My Dashboard →"}
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OnboardingPage;
