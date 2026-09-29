import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { Check, Upload, X, FileText, Loader2, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";
import { track } from "@/lib/analytics";

const STEPS = ["Firm details", "Identity", "Credentials", "Review"];

const INDIAN_STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh","Chandigarh","Puducherry"];

const SPECIALIZATIONS = ["GST and Indirect Tax","Direct Tax and Income Tax","Audit and Assurance","Company Law and ROC","Startup and Venture Finance","MSME and SME Advisory"];

const BUCKET = "ca-verification-documents";
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type DocSlot =
  | "aadhaar"
  | "pan_card"
  | "icai_certificate"
  | "practice_certificate";

interface UploadedFile {
  path: string;
  name: string;
  size: number;
}

interface FormData {
  firm_name: string;
  ca_full_name: string;
  icai_membership_type: "ACA" | "FCA" | "";
  icai_membership_number: string;
  years_of_practice: string;
  specializations: string[];
  phone: string;
  city: string;
  state: string;
  aadhaar_last4: string;
  pan_number: string;
  firm_registration_number: string;
  brief: string;
}

const initialForm: FormData = {
  firm_name: "",
  ca_full_name: "",
  icai_membership_type: "",
  icai_membership_number: "",
  years_of_practice: "",
  specializations: [],
  phone: "",
  city: "",
  state: "",
  aadhaar_last4: "",
  pan_number: "",
  firm_registration_number: "",
  brief: "",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "0.5px solid rgba(23,18,8,0.08)",
  borderRadius: 12,
  padding: 28,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "Inter, sans-serif",
  fontWeight: 600,
  fontSize: 12.5,
  color: "#171208",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(23,18,8,0.12)",
  background: "#FCFAF4",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  color: "#171208",
  outline: "none",
};

const errText: React.CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  color: "#C41E1E",
  marginTop: 4,
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <p style={errText}>{error}</p>}
    </div>
  );
}

export default function CAOnboardingPage() {
  const navigate = useNavigate();
  const { user, caFirm, loading: authLoading, refreshFirm } = useCAAuth();
  const [caFirmId, setCaFirmId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Record<DocSlot, UploadedFile | null>>({
    aadhaar: null, pan_card: null, icai_certificate: null, practice_certificate: null,
  });
  const [uploading, setUploading] = useState<Record<DocSlot, boolean>>({
    aadhaar: false, pan_card: false, icai_certificate: false, practice_certificate: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const initRan = useRef(false);

  // Load or bootstrap CA firm row + pre-fill from existing values
  useEffect(() => {
    if (authLoading || initRan.current) return;
    if (!user) { navigate("/ca/login"); return; }
    initRan.current = true;
    (async () => {
      let firmId = caFirm?.id ?? null;
      let existing: any = null;
      if (firmId) {
        const { data } = await supabase.from("ca_firms").select("*").eq("id", firmId).maybeSingle();
        existing = data;
      } else {
        const { data } = await supabase.from("ca_firms").select("*").eq("user_id", user.id).maybeSingle();
        if (data) { existing = data; firmId = data.id; }
      }
      if (!firmId) {
        const { data, error } = await supabase.from("ca_firms").insert({
          user_id: user.id,
          firm_name: "",
          email: user.email ?? null,
          verification_status: "incomplete",
          onboarding_step: 0,
        }).select("*").single();
        if (error) {
          toast.error("Could not initialise onboarding: " + error.message);
          return;
        }
        existing = data;
        firmId = data.id;
      }
      setCaFirmId(firmId);
      if (existing) {
        setForm((f) => ({
          ...f,
          firm_name: existing.firm_name ?? "",
          ca_full_name: existing.contact_name ?? existing.ca_full_name ?? "",
          icai_membership_type: (existing.icai_membership_type ?? "") as any,
          icai_membership_number: existing.icai_membership_number ?? existing.membership_number ?? "",
          years_of_practice: existing.years_of_practice != null ? String(existing.years_of_practice) : "",
          specializations: existing.specializations ?? [],
          phone: existing.phone ?? "",
          city: existing.city ?? "",
          state: existing.state ?? "",
          aadhaar_last4: existing.aadhaar_last4 ?? "",
          pan_number: existing.pan_number ?? "",
          firm_registration_number: existing.firm_registration_number ?? "",
          brief: existing.brief ?? "",
        }));
        if (existing.aadhaar_document_path) setUploads((u) => ({ ...u, aadhaar: { path: existing.aadhaar_document_path, name: "Aadhaar document", size: 0 } }));
        if (existing.practice_certificate_path) setUploads((u) => ({ ...u, icai_certificate: { path: existing.practice_certificate_path, name: "ICAI certificate", size: 0 } }));
        if (existing.verification_status === "approved") { navigate("/ca/dashboard"); return; }
        if (existing.verification_status === "pending" && (existing.onboarding_step ?? 0) >= 4) { navigate("/ca/verification-pending"); return; }
        setCurrentStep(Math.min(4, Math.max(1, (existing.onboarding_step ?? 0) + 1)));
      }
    })();
  }, [authLoading, user, caFirm, navigate]);

  const update = <K extends keyof FormData>(k: K, v: FormData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validateStep = (step: number): boolean => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!form.firm_name.trim()) e.firm_name = "Required";
      if (!form.ca_full_name.trim()) e.ca_full_name = "Required";
      if (!form.icai_membership_type) e.icai_membership_type = "Select membership type";
      if (!/^\d{4,7}$/.test(form.icai_membership_number)) e.icai_membership_number = "Enter 4–7 digit ICAI number";
      const y = Number(form.years_of_practice);
      if (!form.years_of_practice || Number.isNaN(y) || y < 0 || y > 50) e.years_of_practice = "Enter 0–50";
      if (form.specializations.length === 0) e.specializations = "Select at least one";
      if (!/^\+?\d[\d\s-]{7,14}$/.test(form.phone.trim())) e.phone = "Enter a valid phone";
      if (!form.city.trim()) e.city = "Required";
      if (!form.state) e.state = "Required";
    }
    if (step === 2) {
      if (!/^\d{4}$/.test(form.aadhaar_last4)) e.aadhaar_last4 = "Exactly 4 digits";
      if (!uploads.aadhaar) e.aadhaar_doc = "Aadhaar document required";
      if (!PAN_RE.test(form.pan_number)) e.pan_number = "Format: ABCDE1234F";
    }
    if (step === 3) {
      if (!uploads.icai_certificate) e.icai_certificate = "ICAI certificate required";
      if (form.brief.length > 500) e.brief = "Max 500 characters";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const persistStep = async (step: number) => {
    if (!caFirmId) return;
    const patch: any = { onboarding_step: Math.max(step, 0) };
    if (step >= 1) {
      Object.assign(patch, {
        firm_name: form.firm_name.trim(),
        contact_name: form.ca_full_name.trim(),
        icai_membership_type: form.icai_membership_type || null,
        icai_membership_number: form.icai_membership_number.trim(),
        membership_number: form.icai_membership_number.trim(),
        years_of_practice: Number(form.years_of_practice) || null,
        specializations: form.specializations,
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state,
      });
    }
    if (step >= 2) {
      Object.assign(patch, {
        aadhaar_last4: form.aadhaar_last4,
        aadhaar_document_path: uploads.aadhaar?.path ?? null,
        pan_number: form.pan_number.toUpperCase(),
      });
    }
    if (step >= 3) {
      Object.assign(patch, {
        practice_certificate_path: uploads.icai_certificate?.path ?? null,
        firm_registration_number: form.firm_registration_number.trim() || null,
        brief: form.brief.trim() || null,
      });
    }
    const { error } = await supabase.from("ca_firms").update(patch).eq("id", caFirmId);
    if (error) toast.error("Save failed: " + error.message);
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) return;
    await persistStep(currentStep);
    track("onboarding_step_completed", { step: currentStep, role: "ca" });
    setCurrentStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => setCurrentStep((s) => Math.max(1, s - 1));

  const handleFile = async (slot: DocSlot, file: File | null) => {
    if (!file || !caFirmId) return;
    const maxSize = slot === "icai_certificate" || slot === "practice_certificate" ? 10 : 5;
    if (!ALLOWED_MIME.includes(file.type)) { toast.error("Only PDF, JPG, or PNG allowed"); return; }
    if (file.size > maxSize * 1024 * 1024) { toast.error(`File exceeds ${maxSize}MB`); return; }
    setUploading((u) => ({ ...u, [slot]: true }));
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${caFirmId}/${slot}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type, upsert: false,
    });
    setUploading((u) => ({ ...u, [slot]: false }));
    if (error) { toast.error("Upload failed: " + error.message); return; }
    setUploads((u) => ({ ...u, [slot]: { path, name: file.name, size: file.size } }));
    setErrors((e) => ({ ...e, [slot === "aadhaar" ? "aadhaar_doc" : slot]: "" }));
    toast.success(`${file.name} uploaded`);
  };

  const removeFile = async (slot: DocSlot) => {
    const cur = uploads[slot];
    if (!cur) return;
    await supabase.storage.from(BUCKET).remove([cur.path]);
    setUploads((u) => ({ ...u, [slot]: null }));
  };

  const handleSubmit = async () => {
    if (!confirmed) { toast.error("Please confirm the declaration"); return; }
    if (!caFirmId) return;
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      toast.error("Some earlier fields are incomplete");
      return;
    }
    setSubmitting(true);
    const finalPatch: any = {
      firm_name: form.firm_name.trim(),
      contact_name: form.ca_full_name.trim(),
      icai_membership_type: form.icai_membership_type || null,
      icai_membership_number: form.icai_membership_number.trim(),
      membership_number: form.icai_membership_number.trim(),
      years_of_practice: Number(form.years_of_practice) || null,
      specializations: form.specializations,
      phone: form.phone.trim(),
      city: form.city.trim(),
      state: form.state,
      aadhaar_last4: form.aadhaar_last4,
      aadhaar_document_path: uploads.aadhaar?.path ?? null,
      pan_number: form.pan_number.toUpperCase(),
      practice_certificate_path: uploads.icai_certificate?.path ?? null,
      firm_registration_number: form.firm_registration_number.trim() || null,
      brief: form.brief.trim() || null,
      onboarding_step: 4,
      verification_status: "pending",
      verification_submitted_at: new Date().toISOString(),
    };
    const { error: updErr } = await supabase.from("ca_firms").update(finalPatch).eq("id", caFirmId);
    if (updErr) { setSubmitting(false); toast.error("Submission failed: " + updErr.message); return; }

    const docRows = ([
      ["aadhaar", uploads.aadhaar],
      ["pan_card", uploads.pan_card],
      ["icai_certificate", uploads.icai_certificate],
      ["practice_certificate", uploads.practice_certificate],
    ] as [DocSlot, UploadedFile | null][])
      .filter(([, u]) => !!u)
      .map(([type, u]) => ({
        ca_firm_id: caFirmId,
        document_type: type,
        storage_path: u!.path,
        original_filename: u!.name,
        file_size_bytes: u!.size || null,
      }));
    if (docRows.length) {
      await supabase.from("ca_verification_documents").insert(docRows);
    }
    setSubmitting(false);
    setSubmitted(true);
    track("onboarding_completed", { role: "ca" });
    refreshFirm();
  };

  if (authLoading || !caFirmId) {
    return (
      <div style={{ minHeight: "100vh", background: "#F4EDDA", display: "grid", placeItems: "center" }}>
        <Loader2 className="animate-spin" style={{ color: "#C41E1E" }} />
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#F4EDDA", padding: "80px 20px", display: "grid", placeItems: "start center" }}>
        <div style={{ ...cardStyle, maxWidth: 560, width: "100%" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#E8F5EC", display: "grid", placeItems: "center", marginBottom: 20 }}>
            <Check size={22} style={{ color: "#1A6B3C" }} />
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#171208", marginBottom: 10 }}>Application submitted</h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "rgba(23,18,8,0.7)", lineHeight: 1.6 }}>
            Our team will review your credentials within 2 business days. You will receive an email at{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#171208" }}>{user?.email}</span> once approved.
          </p>
          <button onClick={() => navigate("/ca/verification-pending")}
            style={{ marginTop: 24, padding: "12px 22px", background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            View status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4EDDA", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C41E1E", fontWeight: 700 }}>CA Partner Onboarding</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 32, color: "#171208", marginTop: 6 }}>Verify your practice</h1>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          {STEPS.map((label, i) => {
            const step = i + 1;
            const done = step < currentStep;
            const active = step === currentStep;
            return (
              <div key={label} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: done ? "#C41E1E" : active ? "#fff" : "#EFE8D8",
                  border: done ? "none" : active ? "2px solid #C41E1E" : "1px solid rgba(23,18,8,0.15)",
                  color: done ? "#fff" : active ? "#C41E1E" : "rgba(23,18,8,0.4)",
                  display: "grid", placeItems: "center",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {done ? <Check size={14} /> : step}
                </div>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? "#171208" : "rgba(23,18,8,0.5)", whiteSpace: "nowrap" }}>{label}</span>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: done ? "#C41E1E" : "rgba(23,18,8,0.1)", minWidth: 8 }} />}
              </div>
            );
          })}
        </div>

        <div style={cardStyle}>
          {currentStep === 1 && (
            <div style={{ display: "grid", gap: 18 }}>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#171208" }}>Firm details</h2>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Firm name *" error={errors.firm_name}>
                  <input style={inputStyle} value={form.firm_name} onChange={(e) => update("firm_name", e.target.value)} />
                </Field>
                <Field label="CA full name *" error={errors.ca_full_name}>
                  <input style={inputStyle} value={form.ca_full_name} onChange={(e) => update("ca_full_name", e.target.value)} />
                </Field>
                <Field label="Membership type *" error={errors.icai_membership_type}>
                  <select style={inputStyle} value={form.icai_membership_type} onChange={(e) => update("icai_membership_type", e.target.value as any)}>
                    <option value="">Select…</option>
                    <option value="ACA">ACA</option>
                    <option value="FCA">FCA</option>
                  </select>
                </Field>
                <Field label="ICAI Membership Number *" error={errors.icai_membership_number}>
                  <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} value={form.icai_membership_number} placeholder="Example: 123456" onChange={(e) => update("icai_membership_number", e.target.value.replace(/\D/g, ""))} />
                </Field>
                <Field label="Years of practice *" error={errors.years_of_practice}>
                  <input type="number" min={0} max={50} style={inputStyle} value={form.years_of_practice} onChange={(e) => update("years_of_practice", e.target.value)} />
                </Field>
                <Field label="Phone number *" error={errors.phone}>
                  <input style={inputStyle} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 98xxxxxxxx" />
                </Field>
                <Field label="City *" error={errors.city}>
                  <input style={inputStyle} value={form.city} onChange={(e) => update("city", e.target.value)} />
                </Field>
                <Field label="State *" error={errors.state}>
                  <select style={inputStyle} value={form.state} onChange={(e) => update("state", e.target.value)}>
                    <option value="">Select…</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Specializations *" error={errors.specializations}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                  {SPECIALIZATIONS.map((s) => {
                    const checked = form.specializations.includes(s);
                    return (
                      <label key={s} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        border: checked ? "1px solid #C41E1E" : "1px solid rgba(23,18,8,0.12)",
                        background: checked ? "#FDF6F6" : "#FCFAF4",
                        borderRadius: 10, cursor: "pointer",
                        fontFamily: "Inter, sans-serif", fontSize: 13, color: "#171208",
                      }}>
                        <input type="checkbox" checked={checked} onChange={(e) => {
                          const next = e.target.checked ? [...form.specializations, s] : form.specializations.filter((x) => x !== s);
                          update("specializations", next);
                        }} />
                        {s}
                      </label>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}

          {currentStep === 2 && (
            <div style={{ display: "grid", gap: 20 }}>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#171208" }}>Identity verification</h2>
              <Field label="Aadhaar last 4 digits *" error={errors.aadhaar_last4}>
                <input maxLength={4} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", maxWidth: 160, letterSpacing: "0.3em" }}
                  value={form.aadhaar_last4} onChange={(e) => update("aadhaar_last4", e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </Field>
              <FileUpload label="Aadhaar document *" hint="PDF, JPG, or PNG · max 5MB"
                slot="aadhaar" file={uploads.aadhaar} uploading={uploading.aadhaar}
                onChange={(f) => handleFile("aadhaar", f)} onRemove={() => removeFile("aadhaar")}
                error={errors.aadhaar_doc} />
              <div style={{ padding: 14, background: "#FDF9EE", border: "1px solid #E8DBAE", borderRadius: 10, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(23,18,8,0.75)", lineHeight: 1.55, display: "flex", gap: 10 }}>
                <ShieldCheck size={16} style={{ color: "#8B6914", flexShrink: 0, marginTop: 2 }} />
                <span>We store only the last 4 digits of your Aadhaar number. Your full Aadhaar is never stored — only the uploaded document for verification by our compliance team, after which the document is deleted.</span>
              </div>
              <Field label="PAN number *" error={errors.pan_number}>
                <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", maxWidth: 240, textTransform: "uppercase" }}
                  maxLength={10} value={form.pan_number} onChange={(e) => update("pan_number", e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
              </Field>
              <FileUpload label="PAN card upload" hint="PDF, JPG, or PNG · max 5MB · optional but recommended"
                slot="pan_card" file={uploads.pan_card} uploading={uploading.pan_card}
                onChange={(f) => handleFile("pan_card", f)} onRemove={() => removeFile("pan_card")} />
            </div>
          )}

          {currentStep === 3 && (
            <div style={{ display: "grid", gap: 20 }}>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#171208" }}>Practice credentials</h2>
              <FileUpload label="ICAI certificate of practice *" hint="PDF, JPG, or PNG · max 10MB"
                slot="icai_certificate" file={uploads.icai_certificate} uploading={uploading.icai_certificate}
                onChange={(f) => handleFile("icai_certificate", f)} onRemove={() => removeFile("icai_certificate")}
                error={errors.icai_certificate} />
              <FileUpload label="Additional practice certificate" hint="PDF, JPG, or PNG · max 10MB · optional"
                slot="practice_certificate" file={uploads.practice_certificate} uploading={uploading.practice_certificate}
                onChange={(f) => handleFile("practice_certificate", f)} onRemove={() => removeFile("practice_certificate")} />
              <Field label="Firm registration number">
                <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} value={form.firm_registration_number} onChange={(e) => update("firm_registration_number", e.target.value)} placeholder="For firms with multiple partners" />
              </Field>
              <Field label={`Brief about the firm (${form.brief.length}/500)`} error={errors.brief}>
                <textarea rows={4} style={{ ...inputStyle, height: "auto", padding: "12px 14px", resize: "vertical" }}
                  maxLength={500} value={form.brief} onChange={(e) => update("brief", e.target.value)} />
              </Field>
            </div>
          )}

          {currentStep === 4 && (
            <div style={{ display: "grid", gap: 18 }}>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#171208" }}>Review and submit</h2>
              <ReviewGrid form={form} uploads={uploads} />
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, background: "#FCFAF4", border: "1px solid rgba(23,18,8,0.1)", borderRadius: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#171208", lineHeight: 1.55 }}>
                  I confirm that all information provided is accurate and I authorise FYNHelp to verify my ICAI credentials.
                </span>
              </label>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(23,18,8,0.08)" }}>
            <button type="button" onClick={handleBack} disabled={currentStep === 1}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "transparent", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, color: "#171208", cursor: currentStep === 1 ? "not-allowed" : "pointer", opacity: currentStep === 1 ? 0.4 : 1 }}>
              <ArrowLeft size={14} /> Back
            </button>
            {currentStep < 4 ? (
              <button type="button" onClick={handleNext}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 22px", background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting || !confirmed}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 22px", background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, cursor: submitting || !confirmed ? "not-allowed" : "pointer", opacity: submitting || !confirmed ? 0.6 : 1 }}>
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <>Submit for verification <ArrowRight size={14} /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FileUpload({ label, hint, slot, file, uploading, onChange, onRemove, error }: {
  label: string; hint: string; slot: DocSlot;
  file: UploadedFile | null; uploading: boolean;
  onChange: (f: File | null) => void; onRemove: () => void; error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#F6FBF7", border: "1px solid #B8DCC1", borderRadius: 10 }}>
          <FileText size={18} style={{ color: "#1A6B3C", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: 600, color: "#171208", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
            {file.size > 0 && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(23,18,8,0.5)" }}>{(file.size / 1024).toFixed(1)} KB</div>}
          </div>
          <button type="button" onClick={onRemove} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(23,18,8,0.5)" }}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ width: "100%", padding: "20px 16px", background: "#FCFAF4", border: "1.5px dashed rgba(23,18,8,0.2)", borderRadius: 10, cursor: uploading ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {uploading ? <Loader2 size={20} className="animate-spin" style={{ color: "#C41E1E" }} /> : <Upload size={20} style={{ color: "rgba(23,18,8,0.5)" }} />}
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#171208", fontWeight: 500 }}>{uploading ? "Uploading…" : "Click to upload"}</span>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "rgba(23,18,8,0.5)" }}>{hint}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }}
        onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} />
      {error && <p style={errText}>{error}</p>}
    </div>
  );
}

function ReviewGrid({ form, uploads }: { form: FormData; uploads: Record<DocSlot, UploadedFile | null> }) {
  const rows: [string, React.ReactNode][] = [
    ["Firm name", form.firm_name || "—"],
    ["CA full name", form.ca_full_name || "—"],
    ["Membership", `${form.icai_membership_type || "—"} · ${form.icai_membership_number || "—"}`],
    ["Years of practice", form.years_of_practice || "—"],
    ["Specializations", form.specializations.join(", ") || "—"],
    ["Phone", form.phone || "—"],
    ["Location", [form.city, form.state].filter(Boolean).join(", ") || "—"],
    ["Aadhaar (last 4)", <span key="a" style={{ fontFamily: "'JetBrains Mono', monospace" }}>XXXX-XXXX-{form.aadhaar_last4 || "----"}</span>],
    ["PAN", <span key="p" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{form.pan_number || "—"}</span>],
    ["Firm registration", form.firm_registration_number || "—"],
    ["Aadhaar document", uploads.aadhaar ? "Uploaded" : "Missing"],
    ["PAN card", uploads.pan_card ? "Uploaded" : "Not provided"],
    ["ICAI certificate", uploads.icai_certificate ? "Uploaded" : "Missing"],
    ["Additional certificate", uploads.practice_certificate ? "Uploaded" : "Not provided"],
  ];
  return (
    <div style={{ border: "1px solid rgba(23,18,8,0.08)", borderRadius: 10, overflow: "hidden" }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "200px 1fr", padding: "10px 14px", background: i % 2 ? "#FCFAF4" : "#fff", fontFamily: "Inter, sans-serif", fontSize: 13, borderTop: i === 0 ? "none" : "1px solid rgba(23,18,8,0.06)" }}>
          <div style={{ color: "rgba(23,18,8,0.55)", fontWeight: 500 }}>{k}</div>
          <div style={{ color: "#171208" }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
