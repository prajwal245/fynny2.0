/**
 * Shared interactive elements for the intelligence tabs:
 * dialogs, buttons with toast feedback, drawer-row wrapper,
 * view-all links and the header refresh/export toolbar.
 */
import { ReactNode, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Phone, RefreshCw, Download, FileText, FileSpreadsheet, Share2,
  ChevronRight, ExternalLink, Check, Loader2, ArrowUpRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDrawer, DrawerKind } from "@/components/dashboard/DetailDrawer";
import { ACCENT, fmtCompact } from "./_primitives";

/* ─── Row click → drawer ──────────────────────────────────────────── */
export function useOpenDrawer() {
  const { open } = useDrawer();
  return (kind: DrawerKind, id: string) => open(kind, id);
}

/* ─── View all → list-page link ───────────────────────────────────── */
export function ViewAllLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-xs font-medium text-[#A93838] hover:underline"
    >
      View all <ArrowUpRight className="w-3 h-3" />
    </Link>
  );
}

/* ─── Remind button (overdue invoices) ────────────────────────────── */
export function RemindButton({ customerName }: { customerName: string }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (sent) return;
        setSent(true);
        toast.success(`Reminder sent to ${customerName}`);
        setTimeout(() => setSent(false), 3000);
      }}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-white px-2 py-1 rounded transition-opacity disabled:opacity-70"
      style={{ background: sent ? ACCENT.green : ACCENT.red }}
      disabled={sent}
    >
      {sent ? <><Check className="w-3 h-3" /> Sent</> : <><Phone className="w-3 h-3" /> Remind</>}
    </button>
  );
}

/* ─── Mark-done dismissable banner ────────────────────────────────── */
export function MarkDoneButton({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        setDone(true);
        toast.success("Action marked complete");
        setTimeout(onDone, 350);
      }}
      className="text-xs font-medium px-3 py-1.5 rounded text-white whitespace-nowrap transition-opacity"
      style={{ background: ACCENT.red, opacity: done ? 0 : 1 }}
    >
      {done ? "Done ✓" : "Mark Done"}
    </button>
  );
}

/* ─── Scenario planner ────────────────────────────────────────────── */
export function ScenarioPlannerDialog({
  open, onOpenChange, baseRunwayMonths, baseBurn, baseRevenue,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  baseRunwayMonths: number; baseBurn: number; baseRevenue: number;
}) {
  const [rev, setRev] = useState(0);
  const [exp, setExp] = useState(0);
  const [hires, setHires] = useState(0);

  const newRevenue = baseRevenue * (1 + rev / 100);
  const hireCost = hires * 150000;
  const newBurn = baseBurn * (1 + exp / 100) + hireCost - (newRevenue - baseRevenue);
  const cash = Number.isFinite(baseRunwayMonths) && baseBurn > 0 ? baseRunwayMonths * baseBurn : baseBurn * 12;
  const newRunway = newBurn > 0 ? cash / newBurn : Infinity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif">Model Custom Scenario</DialogTitle>
          <DialogDescription>Adjust the levers to see runway impact in real time.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <SliderRow label="Revenue change" value={rev} onChange={setRev} min={-50} max={50} unit="%" />
          <SliderRow label="Expense change" value={exp} onChange={setExp} min={-50} max={50} unit="%" />
          <SliderRow label="New hires" value={hires} onChange={setHires} min={0} max={10} unit="" />

          <div className="rounded-md p-4" style={{ background: "rgba(169,56,56,0.06)", border: "1px solid rgba(169,56,56,0.15)" }}>
            <p className="text-[11px] uppercase tracking-wider text-[rgba(23,18,8,0.62)] mb-1">Projected Runway</p>
            <p className="font-mono text-3xl font-semibold text-fyn-ink">
              {Number.isFinite(newRunway) ? `${newRunway.toFixed(1)} mo` : "∞"}
            </p>
            <p className="text-xs text-[rgba(23,18,8,0.62)] mt-1">
              vs base {Number.isFinite(baseRunwayMonths) ? `${baseRunwayMonths.toFixed(1)} mo` : "—"} ·
              new burn {fmtCompact(Math.max(0, newBurn))}/mo
            </p>
          </div>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="text-sm px-3 py-1.5 rounded border border-[rgba(23,18,8,0.15)] text-fyn-ink">Close</button>
          <button
            onClick={() => { toast.success("Scenario saved"); onOpenChange(false); }}
            className="text-sm px-3 py-1.5 rounded text-white"
            style={{ background: ACCENT.red }}
          >
            Save Scenario
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SliderRow({ label, value, onChange, min, max, unit }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; unit: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-fyn-ink">{label}</span>
        <span className="font-mono text-sm text-fyn-ink font-semibold">{value > 0 && unit === "%" ? "+" : ""}{value}{unit}</span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={1} />
    </div>
  );
}

/* ─── Optimize payment schedule ───────────────────────────────────── */
export function OptimizeScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif">Optimize Payment Schedule</DialogTitle>
          <DialogDescription>FYNNY suggestions based on your settlement cycle.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm py-2">
          {[
            { h: "Delay AWS payment by 5 days", s: "Aligns with the 28th settlement cycle. Saves ₹8K in interest." },
            { h: "Bring forward Razorpay payout request", s: "Pulls ₹2.4L into the next 7-day window." },
            { h: "Bundle vendor payments on the 1st & 15th", s: "Reduces per-transfer charges by ~₹3K/mo." },
          ].map((t) => (
            <li key={t.h} className="rounded-md p-3" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <p className="font-medium text-fyn-ink">{t.h}</p>
              <p className="text-xs text-[rgba(23,18,8,0.62)] mt-0.5">{t.s}</p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="text-sm px-3 py-1.5 rounded border border-[rgba(23,18,8,0.15)] text-fyn-ink">Dismiss</button>
          <button
            onClick={() => { toast.success("Optimizations applied to schedule"); onOpenChange(false); }}
            className="text-sm px-3 py-1.5 rounded text-white"
            style={{ background: ACCENT.red }}
          >
            Apply Optimization
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Spend controls ──────────────────────────────────────────────── */
export function SpendControlsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [approval, setApproval] = useState(true);
  const [blockDup, setBlockDup] = useState(false);
  const [alerts, setAlerts] = useState(true);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif">Set Up Spend Controls</DialogTitle>
          <DialogDescription>Apply policies to all future expenses.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <ToggleRow label="Approval required above ₹25K" value={approval} onChange={setApproval} />
          <ToggleRow label="Block duplicate vendors" value={blockDup} onChange={setBlockDup} />
          <ToggleRow label="Monthly budget alerts" value={alerts} onChange={setAlerts} />
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="text-sm px-3 py-1.5 rounded border border-[rgba(23,18,8,0.15)] text-fyn-ink">Cancel</button>
          <button
            onClick={() => { toast.success("Spend controls saved"); onOpenChange(false); }}
            className="text-sm px-3 py-1.5 rounded text-white"
            style={{ background: ACCENT.red }}
          >
            Save Controls
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md p-3" style={{ background: "rgba(23,18,8,0.03)" }}>
      <span className="text-sm text-fyn-ink">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

/* ─── HRMS connect ────────────────────────────────────────────────── */
export function HrmsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const providers = ["Keka", "Zoho People", "greytHR", "Darwinbox"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif">Connect HRMS</DialogTitle>
          <DialogDescription>Sync employees, payroll and attendance.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 py-2">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => toast.info(`${p} integration coming soon`)}
              className="rounded-md p-4 text-left hover:bg-[rgba(169,56,56,0.04)] transition-colors"
              style={{ border: "1px solid rgba(23,18,8,0.1)" }}
            >
              <p className="font-medium text-fyn-ink">{p}</p>
              <p className="text-[11px] text-[rgba(23,18,8,0.62)] mt-1">Coming Soon</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── GST filing checklist ────────────────────────────────────────── */
export function GstFilingDialog({
  open, onOpenChange, period,
}: { open: boolean; onOpenChange: (v: boolean) => void; period?: string }) {
  const [items, setItems] = useState([
    { label: "Verify output tax", done: false },
    { label: "Reconcile ITC against GSTR-2A", done: false },
    { label: "Review vendor mismatches", done: false },
    { label: "Submit on GST portal", done: false },
  ]);
  const toggle = (i: number) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, done: !x.done } : x));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif">File Return {period ? `· ${period}` : ""}</DialogTitle>
          <DialogDescription>Work through the checklist before filing.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 py-2">
          {items.map((it, i) => (
            <li key={it.label} className="flex items-center gap-3 rounded-md p-2 cursor-pointer hover:bg-[rgba(23,18,8,0.03)]" onClick={() => toggle(i)}>
              <Checkbox checked={it.done} onCheckedChange={() => toggle(i)} />
              <span className={cn("text-sm", it.done ? "line-through text-[#9B9B9B]" : "text-fyn-ink")}>{it.label}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <a
            href="https://www.gst.gov.in"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded text-white"
            style={{ background: ACCENT.red }}
          >
            Open GST Portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Reconcile button ────────────────────────────────────────────── */
export function ReconcileButton({ label }: { label: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (state !== "idle") return;
        setState("loading");
        toast.info(`Reconciliation started for ${label}`);
        setTimeout(() => { setState("done"); toast.success(`${label} reconciled`); }, 2000);
      }}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded"
      style={{
        background: state === "done" ? "rgba(16,185,129,0.1)" : "rgba(169,56,56,0.08)",
        color: state === "done" ? "#1F5A46" : "#A93838",
      }}
    >
      {state === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
      {state === "done" && <Check className="w-3 h-3" />}
      {state === "idle" && "Reconcile"}
      {state === "loading" && "Reconciling…"}
      {state === "done" && "Reconciled"}
    </button>
  );
}

/* ─── Header toolbar: Refresh + Export ────────────────────────────── */
export function HeaderToolbar() {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);
  const onRefresh = async () => {
    setSpinning(true);
    await qc.invalidateQueries();
    setTimeout(() => { setSpinning(false); toast.success("Data refreshed"); }, 800);
  };
  const onExport = (kind: "PDF" | "CSV" | "Link") => {
    const tid = toast.loading(`${kind === "Link" ? "Preparing share link" : `Exporting ${kind}`}…`);
    setTimeout(() => toast.success(kind === "Link" ? "Share link copied" : `${kind} ready ✓`, { id: tid }), 1400);
    if (kind === "Link") navigator.clipboard?.writeText(window.location.href).catch(() => {});
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-[rgba(23,18,8,0.1)] text-fyn-ink hover:bg-[rgba(23,18,8,0.04)]"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", spinning && "animate-spin")} />
        Refresh
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded text-white" style={{ background: ACCENT.red }}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white">
          <DropdownMenuItem onClick={() => onExport("PDF")}><FileText className="w-3.5 h-3.5 mr-2" /> Export as PDF</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("CSV")}><FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("Link")}><Share2 className="w-3.5 h-3.5 mr-2" /> Share Link</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ─── Generic "Generate report" button used in Revenue ────────────── */
export function GenerateReportButton({ label = "View Full Report" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={() => {
        setLoading(true);
        const tid = toast.loading("Generating report…");
        setTimeout(() => {
          setLoading(false);
          toast.success("Report downloaded ✓", { id: tid });
        }, 1800);
      }}
      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded text-white disabled:opacity-70"
      style={{ background: ACCENT.red }}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

/* ─── Clickable row wrapper (uses DetailDrawer) ───────────────────── */
export function DrawerRow({
  kind, id, children, className,
}: { kind: DrawerKind; id: string; children: ReactNode; className?: string }) {
  const open = useOpenDrawer();
  return (
    <tr
      onClick={() => open(kind, id)}
      className={cn(
        "border-b border-[rgba(23,18,8,0.06)] last:border-0 fyn-row cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/* ─── Expandable row (used by E-Way, HSN, ESOP, Hiring) ───────────── */
export function ExpandableRow({
  summary, detail, columns,
}: { summary: ReactNode; detail: ReactNode; columns: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen((v) => !v)} className="border-b border-[rgba(23,18,8,0.06)] cursor-pointer hover:bg-[rgba(169,56,56,0.04)] transition-colors">
        {summary}
        <td className="py-2.5 text-right pr-2 text-[rgba(23,18,8,0.62)]">
          <ChevronRight className={cn("w-3.5 h-3.5 inline transition-transform", open && "rotate-90")} />
        </td>
      </tr>
      {open && (
        <tr className="bg-[rgba(23,18,8,0.02)]">
          <td colSpan={columns} className="px-4 py-3">{detail}</td>
        </tr>
      )}
    </>
  );
}
