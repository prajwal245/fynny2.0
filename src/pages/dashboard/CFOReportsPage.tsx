import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Download, FileText, Sparkles } from "lucide-react";
import { downloadReportPdf } from "@/lib/reportPdf";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CFOReportsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [briefDate, setBriefDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setBriefDate(new Date().toISOString().slice(0, 10));
    setContent("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please describe what the report should cover.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("fynny_briefs").insert({
      business_id: businessId,
      brief_date: briefDate,
      content: content.trim(),
      delivered: false,
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: "Could not start report",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Report generation started",
      description: "Your CFO report has been queued.",
    });
    setOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["cfo-reports", businessId] });
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

  const { data: reports, isLoading } = useQuery({
    queryKey: ["cfo-reports", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("fynny_briefs")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!businessId,
  });

  if (isLoading || !businessId) {
    return (
      <DashboardLayout>
        <div className="text-fyn-ink/60 text-sm">Loading reports…</div>
      </DashboardLayout>
    );
  }

  const newReportDialog = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New CFO Report</DialogTitle>
          <DialogDescription>
            Describe what this report should cover. Generation will start
            immediately and the list will refresh.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brief-date">Brief date</Label>
            <Input
              id="brief-date"
              type="date"
              value={briefDate}
              onChange={(e) => setBriefDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief-content">What should this report cover?</Label>
            <Textarea
              id="brief-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Monthly cash flow summary, top spend categories, GST compliance status…"
              rows={6}
              required
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-md text-sm font-medium text-fyn-ink/70 hover:text-fyn-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-fyn-red text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? "Starting…" : "Start generation"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (!reports || reports.length === 0) {
    return (
      <DashboardLayout>
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
          <h2 className="text-fyn-ink text-2xl font-sans font-semibold mb-2">
            No Reports Generated Yet
          </h2>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Fynny will automatically generate CFO reports based on your data
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => navigate("/dashboard/reports/books")}
              className="bg-fyn-beige-card text-fyn-ink border border-fyn-ink-10 px-5 py-2.5 rounded-md text-sm font-medium hover:bg-fyn-ink-05 transition"
            >
              Books of Accounts
            </button>
            <button
              onClick={() => setOpen(true)}
              className="bg-fyn-red text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition"
            >
              Generate Report
            </button>
          </div>

        </div>
        {newReportDialog}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-fyn-ink text-lg font-sans">CFO Reports</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/dashboard/reports/books")}
              className="bg-fyn-beige-card text-fyn-ink border border-fyn-ink-10 px-4 py-2 rounded-md text-sm font-medium hover:bg-fyn-ink-05 transition"
            >
              Books of Accounts
            </button>
            <button
              onClick={() => setOpen(true)}
              className="bg-fyn-red text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition"
            >
              New Report
            </button>
          </div>
        </div>


        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brief Date</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report: any) => {
              const preview =
                typeof report.content === "string"
                  ? report.content.slice(0, 120) +
                    (report.content.length > 120 ? "…" : "")
                  : "-";
              return (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">
                    {report.brief_date
                      ? new Date(report.brief_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-fyn-ink/70 text-sm max-w-md">
                    {preview}
                  </TableCell>
                  <TableCell>
                    {new Date(report.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={report.delivered ? "default" : "secondary"}
                    >
                      {report.delivered ? "Delivered" : "Ready"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <button
                        onClick={() => navigate(`/dashboard/reports/${report.id}`)}
                        className="text-fyn-red text-xs font-medium hover:underline"
                      >
                        View →
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center gap-1.5 bg-fyn-ink text-white px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition">
                            <Download className="w-3.5 h-3.5" />
                            PDF
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {newReportDialog}
    </DashboardLayout>
  );
};

export default CFOReportsPage;
