import { Link } from "@/lib/router-compat";
import { Lock, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const RED = "#A93838";
const INK = "#171208";
const BEIGE = "#EFE8D8";
const BORDER = "#E0D9C8";

export default function TrialExpiredBlock() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6"
      style={{ background: BEIGE }}
    >
      <div
        className="max-w-lg w-full bg-white rounded-2xl border p-8 md:p-10 text-center shadow-xs"
        style={{ borderColor: BORDER }}
      >
        <div
          className="mx-auto mb-6 w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "rgba(169,56,56,0.10)", color: RED }}
        >
          <Lock className="w-7 h-7" />
        </div>
        <h1
          className="font-serif text-2xl md:text-3xl font-bold mb-3"
          style={{ color: INK, fontFamily: "Georgia, serif" }}
        >
          Your free trial has ended
        </h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: "rgba(23,18,8,0.7)" }}>
          Thanks for trying FynHelp. Upgrade to a paid plan to keep using your dashboard,
          reports, GST intelligence and Fynny AI.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => toast("Coming Soon — paid plans launch shortly. Reach us at support@fynhelp.com to upgrade early.")}
            className="px-6 py-3 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: RED }}
          >
            Upgrade to keep using FynHelp
          </button>
          <Link
            to="/dashboard/settings/billing"
            className="px-6 py-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{ color: INK, borderColor: BORDER, background: "#fff" }}
          >
            View trial status
          </Link>
        </div>

        <a
          href="mailto:support@fynhelp.com?subject=FynHelp%20trial%20upgrade"
          className="mt-6 inline-flex items-center justify-center gap-2 text-[13px]"
          style={{ color: "rgba(23,18,8,0.6)" }}
        >
          <MessageCircle className="w-4 h-4" />
          Contact support
        </a>
      </div>
    </div>
  );
}
