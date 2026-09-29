import { useEffect, useState } from "react";
import { useLocation } from "@/lib/router-compat";
import { X } from "lucide-react";
import WaitlistForm from "@/components/WaitlistForm";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "fyn_waitlist_popup_dismissed";

export default function WaitlistPopup() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  const isHome = pathname === "/";

  useEffect(() => {
    if (!isHome) return;
    if (loading || user) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const openTimer = window.setTimeout(() => setOpen(true), 2000);
    return () => window.clearTimeout(openTimer);
  }, [isHome, loading, user]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isHome || user || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wl-popup-title"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-fyn-ink/70 backdrop-blur-sm animate-[fade-in_0.25s_ease-out]"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-fyn-beige-card border border-fyn-ink/10 rounded-2xl shadow-2xl animate-[scale-in_0.25s_ease-out]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 md:top-4 md:right-4 z-10 w-9 h-9 rounded-full bg-fyn-ink/5 hover:bg-fyn-ink/15 text-fyn-ink/70 hover:text-fyn-ink flex items-center justify-center transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-fyn-red"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-5 pt-8 pb-3 md:px-10 md:pt-10 md:pb-4 text-center">
          <span
            className="inline-block text-[10px] uppercase tracking-[0.18em] text-fyn-red mb-3"
            style={{ fontFamily: "'Satoshi', sans-serif" }}
          >
            Limited early access
          </span>
          <h2
            id="wl-popup-title"
            className="text-fyn-ink leading-[1.05] text-[26px] md:text-[36px]"
            style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, letterSpacing: "-0.035em" }}
          >
            Be first in line when we launch
          </h2>
          <p className="mt-3 text-fyn-ink/65 text-sm md:text-base">
            First 100 users get FYNHelp <span className="text-fyn-red font-semibold">free for 30 days</span>.
          </p>
        </div>

        <div className="px-5 pb-7 md:px-10 md:pb-9">
          <WaitlistForm variant="detailed" theme="light" />
        </div>
      </div>
    </div>
  );
}
