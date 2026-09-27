import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Copy, Download, FileText, Link2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadReportPdf } from "@/lib/reportPdf";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const CFOReportDetailPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFallbackInput, setShowFallbackInput] = useState(false);
  const [fallbackPreparing, setFallbackPreparing] = useState(false);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const shareUrl = id ? `${window.location.origin}/dashboard/reports/${id}` : "";

  const showManualFallback = () => {
    setShowFallbackInput(true);
    setFallbackPreparing(true);
    // Brief skeleton so users get immediate visual feedback on slow networks/devices
    setTimeout(() => {
      setFallbackPreparing(false);
      setTimeout(() => {
        fallbackInputRef.current?.focus();
        fallbackInputRef.current?.select();
      }, 50);
    }, 350);
  };

  const handleCopyShareLink = async () => {
    if (!id) return;
    const url = shareUrl;

    const fallbackCopy = () => {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const success = document.execCommand("copy");
      document.body.removeChild(ta);
      return success;
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ok = fallbackCopy();
        if (!ok) throw new Error("Fallback copy failed");
      }
      setCopied(true);
      setShowFallbackInput(false);
      setFallbackPreparing(false);
      toast({
        title: "Link copied",
        description: "Share link copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      const isPermissionDenied =
        err instanceof Error &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");

      showManualFallback();

      toast({
        title: isPermissionDenied ? "Permission blocked" : "Could not copy link",
        description: isPermissionDenied
          ? "Clipboard access is blocked. Use the input below to select and copy the URL manually."
          : "Unable to copy automatically. Use the input below to copy the URL manually.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const fetchBusiness = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_id) setBusinessId(data.business_id);
    };
    fetchBusiness();
  }, []);

  const { data: report, isLoading } = useQuery({
    queryKey: ["cfo-report", id, businessId],
    enabled: !!id && !!businessId,
    queryFn: async () => {
      const { data } = await supabase
        .from("fynny_briefs")
        .select("*")
        .eq("id", id!)
        .eq("business_id", businessId!)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading || !businessId) {
    return (
      <DashboardLayout>
        <div className="text-fyn-ink/60 text-sm">Loading report…</div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout>
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
          <h2 className="text-fyn-ink text-2xl font-sans font-semibold mb-2">
            Report Not Found
          </h2>
          <p className="text-fyn-ink/60 text-sm mb-6">
            This report doesn't exist or you don't have access to it.
          </p>
          <button
            onClick={() => navigate("/dashboard/reports")}
            className="bg-fyn-red text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition"
          >
            Back to Reports
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <button
        onClick={() => navigate("/dashboard/reports")}
        className="inline-flex items-center gap-1.5 text-fyn-ink/70 hover:text-fyn-ink text-sm mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to reports
      </button>

      <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-fyn-ink text-2xl font-sans font-semibold">
              CFO Report
            </h1>
            <p className="text-fyn-ink/60 text-sm mt-1">
              Brief date: {formatDate(report.brief_date)} · Generated{" "}
              {formatDate(report.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={report.delivered ? "default" : "secondary"}>
              {report.delivered ? "Delivered" : "Ready"}
            </Badge>
            <button
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 border border-fyn-ink/20 text-fyn-ink px-3 py-1.5 rounded-md text-xs font-medium hover:bg-fyn-ink/5 transition"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-fyn-success" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied" : "Copy share link"}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 bg-fyn-ink text-white px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition">
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => downloadReportPdf(report, "branded")}>
                  <Sparkles className="w-3.5 h-3.5 mr-2 text-fyn-red" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">Branded PDF</span>
                    <span className="text-[10px] text-fyn-ink/50">FynHelp colors & logo</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadReportPdf(report, "simple")}>
                  <FileText className="w-3.5 h-3.5 mr-2 text-fyn-ink/60" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">Simple PDF</span>
                    <span className="text-[10px] text-fyn-ink/50">Print-friendly, B&W</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showFallbackInput && (
          <div className="mb-5 -mt-1 bg-fyn-beige border border-fyn-ink-10 rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="share-url-fallback"
                className="text-xs font-medium text-fyn-ink/70"
              >
                {fallbackPreparing ? "Preparing URL…" : "Copy this URL manually"}
              </label>
              <button
                onClick={() => {
                  setShowFallbackInput(false);
                  setFallbackPreparing(false);
                }}
                className="text-fyn-ink/50 hover:text-fyn-ink transition"
                aria-label="Close manual copy"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
{fallbackPreparing ? (
              <div
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                aria-busy="true"
                aria-live="polite"
              >
                <Skeleton className="flex-1 h-10 rounded bg-fyn-ink/10" />
                <Skeleton className="h-10 w-full sm:w-24 rounded bg-fyn-ink/15 shrink-0" />
              </div>
            ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                ref={fallbackInputRef}
                id="share-url-fallback"
                type="text"
                value={shareUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                className="flex-1 bg-card border border-fyn-ink/15 rounded px-2.5 py-2.5 min-h-10 text-xs text-fyn-ink font-mono focus:outline-hidden focus:ring-2 focus:ring-fyn-red/30"
              />
              <button
                onClick={() => {
                  fallbackInputRef.current?.select();
                  const ok = document.execCommand("copy");
                  if (ok) {
                    setCopied(true);
                    toast({ title: "Link copied", description: "Share link copied to clipboard." });
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="inline-flex items-center justify-center gap-1 bg-fyn-ink text-white px-2.5 py-2.5 min-h-10 rounded text-xs font-medium hover:opacity-90 transition shrink-0"
              >
                <Copy className="w-3 h-3" />
                Copy URL
              </button>
            </div>
            )}
            <p className="text-[10px] text-fyn-ink/50 mt-1.5">
              {fallbackPreparing ? "Preparing the share URL…" : "Tip: press Ctrl/Cmd + C after the URL is selected."}
            </p>
          </div>
        )}
        <div className="border-t border-fyn-ink-10 pt-5">
          <h2 className="fyn-label text-fyn-ink/50 text-xs mb-3">
            REPORT CONTENT
          </h2>
          {typeof report.content === "string" && report.content.trim() ? (
            <pre className="whitespace-pre-wrap font-sans text-fyn-ink text-sm leading-relaxed">
              {report.content}
            </pre>
          ) : (
            <p className="text-fyn-ink/50 text-sm italic">
              No content available for this report.
            </p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CFOReportDetailPage;
