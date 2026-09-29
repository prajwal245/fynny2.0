import { useMemo, useState } from "react";
import { COLORS, PageWrap, PageHeader, Card, PrimaryBtn } from "@/components/ca/ui";
import UploadDataPrompt from "@/components/ca/UploadDataPrompt";
import { useCAClients } from "@/hooks/useCAClients";
import { toast } from "sonner";
import { FileText, MessageSquare, CheckCircle2, Download, FileCheck } from "lucide-react";

const PANELS = [
  { id: "reports", icon: FileText, title: "Generate reports", desc: "Generate monthly reports for selected clients" },
  { id: "reminders", icon: MessageSquare, title: "Send filing reminders", desc: "WhatsApp and email reminders" },
  { id: "itc", icon: CheckCircle2, title: "Run ITC reconciliation", desc: "Reconcile 2B against books" },
  { id: "export", icon: Download, title: "Export data", desc: "Excel, CSV or JSON" },
  { id: "filings", icon: FileCheck, title: "Mark filings as filed", desc: "Bulk update compliance status" },
];

const LABELS: Record<string, string> = {
  reports: "Report generation",
  reminders: "Filing reminders",
  itc: "ITC reconciliation",
  export: "Data export",
  filings: "Filing status update",
};

export default function CABulkActionsPage() {
  const { clients, loading } = useCAClients();
  const [selected, setSelected] = useState<string[]>([]);

  const critical = useMemo(
    () => clients.filter((c) => c.cash === "Critical" || c.overdueFiliings > 0).map((c) => c.business_id),
    [clients],
  );

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = (id: string) => {
    if (selected.length === 0) { toast.error("Select clients first"); return; }
    toast.success(`${LABELS[id]} queued for ${selected.length} client${selected.length === 1 ? "" : "s"}`);
  };

  const empty = !loading && clients.length === 0;

  return (
    <PageWrap>
      <UploadDataPrompt
        pageId="bulk-actions"
        show={empty}
        message="You have no clients yet. Add a client and upload their data to run bulk actions."
      />
      <PageHeader title="Bulk Actions" sub="Act across your entire portfolio at once." />

      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold">Select clients</h3>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setSelected(clients.map((c) => c.business_id))} className="px-3 py-1 rounded" style={{ background: "#F3F0E6" }}>Select all</button>
            <button onClick={() => setSelected(critical)} className="px-3 py-1 rounded" style={{ background: "#F3F0E6" }}>Needs attention</button>
            <button onClick={() => setSelected([])} className="px-3 py-1 rounded" style={{ background: "#F3F0E6" }}>Clear</button>
          </div>
        </div>

        {loading ? (
          <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>Loading your clients...</div>
        ) : clients.length === 0 ? (
          <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>
            No clients yet. Add a client from the Clients page, then upload their data.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {clients.map((c) => (
              <button key={c.business_id} onClick={() => toggle(c.business_id)}
                className="px-3 py-2 rounded text-xs font-medium text-left transition-colors"
                style={selected.includes(c.business_id)
                  ? { background: COLORS.red, color: "#FFFFFF" }
                  : { background: "#FFFFFF", border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs font-semibold">{selected.length} clients selected</div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PANELS.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.id}>
              <Icon size={22} style={{ color: COLORS.red }} className="mb-3" />
              <h4 className="text-sm font-semibold mb-1">{p.title}</h4>
              <p className="text-[13px] mb-4" style={{ color: "rgba(23,18,8,0.60)" }}>{p.desc}</p>
              <PrimaryBtn size="sm" onClick={() => run(p.id)}>Run for {selected.length} clients</PrimaryBtn>
            </Card>
          );
        })}
      </div>
    </PageWrap>
  );
}
