/**
 * Timed "upload your data" prompt.
 * Shown once per page per session when a page has no real data to display.
 * Auto-dismisses after 30 seconds; can be closed manually.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Upload } from "lucide-react";
import { COLORS } from "@/components/ca/ui";

export default function UploadDataPrompt({
  pageId,
  message = "There is nothing to show yet. Upload your client data to see real numbers on this page.",
  show,
}: {
  pageId: string;
  message?: string;
  show: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show) return;
    const key = `fyn:upload-prompt:${pageId}`;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setOpen(true);
    const t = window.setTimeout(() => setOpen(false), 30000);
    return () => window.clearTimeout(t);
  }, [show, pageId]);

  if (!open) return null;

  return (
    <div
      role="alert"
      className="fixed z-50 right-6 bottom-6 max-w-sm rounded-md p-5 shadow-lg"
      style={{ background: COLORS.caSurface, border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}
    >
      <button
        onClick={() => setOpen(false)}
        aria-label="Close"
        className="absolute top-3 right-3"
        style={{ color: "rgba(23,18,8,0.45)" }}
      >
        <X size={16} />
      </button>
      <div className="text-[14px] font-semibold mb-1.5">No data yet</div>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "rgba(23,18,8,0.65)" }}>{message}</p>
      <button
        onClick={() => { setOpen(false); navigate({ to: "/ca/intake/inbox" }); }}
        className="inline-flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded"
        style={{ background: COLORS.red, color: "#FFFFFF" }}
      >
        <Upload size={14} /> Upload data
      </button>
    </div>
  );
}
