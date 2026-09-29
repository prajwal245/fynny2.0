import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SUITES, type SuiteMeta } from "@/data/suiteStatus";
import { toast } from "sonner";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  initialModuleId: string | null;
  onClose: () => void;
}

const comingSoon = SUITES.filter((s) => s.status === "coming_soon");

export default function NotifyMeModal({ open, initialModuleId, onClose }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [moduleId, setModuleId] = useState<string>(
    initialModuleId ?? comingSoon[0]?.id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setModuleId(initialModuleId ?? comingSoon[0]?.id ?? "");
      if (user?.email) setEmail(user.email);
    }
  }, [open, initialModuleId, user?.email]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectedSuite: SuiteMeta | undefined = SUITES.find((s) => s.id === moduleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSuite) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("early_access_requests").insert({
      email: trimmed,
      requested_module: selectedSuite.name,
      user_id: user?.id ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Could not save request");
      return;
    }
    toast.success(`Thanks! We'll notify you when ${selectedSuite.name} launches.`);
    setEmail(user?.email ?? "");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(23,18,8,0.60)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-modal-title"
    >
      <div
        className="relative bg-[#F9F7F4] rounded-xl p-8 max-w-[460px] w-full mx-4"
        style={{ boxShadow: "0 24px 64px rgba(23,18,8,0.20)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-fyn-ink/40 hover:text-fyn-ink"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <X size={20} />
        </button>
        <h3
          id="notify-modal-title"
          className="font-serif text-fyn-ink mb-2"
          style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}
        >
          Get notified when {selectedSuite?.name ?? "this feature"} launches
        </h3>
        <p className="text-fyn-ink/60 text-sm mb-6">
          We'll email you the moment it's ready. No marketing, no spam.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fyn-ink/70 mb-1.5 uppercase tracking-wide">
              Which suite?
            </label>
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border border-[#E5E7EB] bg-white text-sm text-fyn-ink focus:outline-hidden focus:border-fyn-red"
            >
              {comingSoon.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.quarter}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-fyn-ink/70 mb-1.5 uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2.5 rounded-md border border-[#E5E7EB] bg-white text-sm text-fyn-ink placeholder:text-fyn-ink/40 focus:outline-hidden focus:border-fyn-red"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-md bg-fyn-red text-white font-semibold hover:opacity-90 disabled:opacity-50"
            style={{ transition: "all 200ms" }}
          >
            {submitting ? "Saving…" : "Notify me at launch"}
          </button>

          <p className="text-[11px] text-fyn-ink/50 text-center">
            We'll only email you once when this feature launches.
          </p>
        </form>
      </div>
    </div>
  );
}
