/**
 * Task 6 — universal "no data yet" prompt.
 * Rendered under zero-value metrics so a dashboard module is never blank.
 */
import { useNavigate } from "@/lib/router-compat";
import { Upload, Plug } from "lucide-react";
import { ACCENT } from "./_primitives";

export default function NoDataPrompt({
  text = "No data yet. Upload your bank statement or connect your accounting software to get started.",
}: {
  text?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 bg-fyn-beige/40"
      style={{ border: `1px dashed ${ACCENT.green}55` }}
    >
      <p className="flex-1 text-sm text-fyn-ink/70 leading-relaxed">{text}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => navigate("/dashboard/import")}
          className="inline-flex items-center gap-1.5 text-white text-xs font-semibold px-3.5 py-2 rounded-md"
          style={{ background: ACCENT.red }}
        >
          <Upload className="w-3.5 h-3.5" /> Upload CSV
        </button>
        <button
          onClick={() => navigate("/dashboard/integrations")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-md text-fyn-ink bg-white"
          style={{ border: "1px solid rgba(23,18,8,0.15)" }}
        >
          <Plug className="w-3.5 h-3.5" /> Connect Zoho / Tally
        </button>
      </div>
    </div>
  );
}
