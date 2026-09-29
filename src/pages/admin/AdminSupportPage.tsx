import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Search, Eye, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { LiveBadge } from "@/components/admin/LiveBadge";
import { useRealtime } from "@/hooks/useRealtime";
import { exportToCsv } from "@/utils/csvExport";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  user_id: string | null;
  business_id: string | null;
  category: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing", technical: "Technical", feature_request: "Feature", bug: "Bug", other: "Other",
};
const PRIORITY_STYLE: Record<string, { bg: string; color: string; label: string; pulse?: boolean }> = {
  low:    { bg: "rgba(23,18,8,0.08)",   color: "hsl(var(--fyn-ink) / 0.7)", label: "Low" },
  medium: { bg: "rgba(24,119,242,0.12)", color: "#0F4FB0", label: "Medium" },
  high:   { bg: "rgba(245,158,11,0.15)", color: "#B45309", label: "High" },
  urgent: { bg: "rgba(196,30,30,0.15)",  color: "#C41E1E", label: "Urgent", pulse: true },
};
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  open:              { bg: "rgba(24,119,242,0.12)", color: "#0F4FB0", label: "Open" },
  in_progress:       { bg: "rgba(245,158,11,0.15)", color: "#B45309", label: "In Progress" },
  waiting_customer:  { bg: "rgba(139,105,20,0.15)", color: "#8B6914", label: "Waiting Customer" },
  resolved:          { bg: "rgba(16,185,129,0.12)", color: "#0F7B4F", label: "Resolved" },
  closed:            { bg: "rgba(23,18,8,0.08)",    color: "hsl(var(--fyn-ink) / 0.6)", label: "Closed" },
};
const fmtRel = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [bizMap, setBizMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");

  const fetchTickets = useCallback(async () => {
    const [tRes, bRes] = await Promise.all([
      supabase.from("support_tickets")
        .select("id, ticket_number, subject, user_id, business_id, category, priority, status, assigned_to, created_at, updated_at")
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("businesses").select("id, business_name"),
    ]);
    setTickets((tRes.data as Ticket[]) ?? []);
    const m = new Map<string, string>();
    ((bRes.data ?? []) as { id: string; business_name: string }[]).forEach((b) => m.set(b.id, b.business_name));
    setBizMap(m);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const liveStatus = useRealtime(
    "support_tickets_changes",
    [{ table: "support_tickets", event: "*" }],
    () => { fetchTickets(); },
  );


  const rows = useMemo(() => tickets.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (priority !== "all" && t.priority !== priority) return false;
    if (status !== "all" && t.status !== status) return false;
    if (q) {
      const s = q.toLowerCase();
      const company = (t.business_id && bizMap.get(t.business_id)) || "";
      if (!`${t.ticket_number} ${company} ${t.subject} ${t.user_id ?? ""}`.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [tickets, q, category, priority, status, bizMap]);

  const exportTickets = () => {
    exportToCsv(rows.map((t) => ({
      ticket_number: t.ticket_number,
      subject: t.subject,
      business: (t.business_id && bizMap.get(t.business_id)) || "",
      category: t.category ?? "",
      priority: t.priority,
      status: t.status,
      created: new Date(t.created_at).toLocaleString(),
    })), "fynhelp-support-tickets");
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader title="Support Tickets" subtitle="Manage customer support requests" />
        <div className="flex items-center gap-2">
          <LiveBadge status={liveStatus} />
          <button onClick={exportTickets} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:opacity-80"
            style={{ background: "rgba(139,105,20,0.1)", border: "1px solid rgba(139,105,20,0.2)", fontFamily: "Raleway, sans-serif", fontSize: 13, fontWeight: 600, color: "#8B6914" }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" color="hsl(var(--fyn-ink) / 0.4)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticket #, business, subject…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg"
              style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 13 }} />
          </div>
          <FilterSelect value={category} onChange={setCategory} label="Category"
            options={[["all","All"],["billing","Billing"],["technical","Technical"],["feature_request","Feature"],["bug","Bug"],["other","Other"]]} />
          <FilterSelect value={priority} onChange={setPriority} label="Priority"
            options={[["all","All"],["low","Low"],["medium","Medium"],["high","High"],["urgent","Urgent"]]} />
          <FilterSelect value={status} onChange={setStatus} label="Status"
            options={[["all","All"],["open","Open"],["in_progress","In Progress"],["waiting_customer","Waiting"],["resolved","Resolved"],["closed","Closed"]]} />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontFamily: "Roboto, sans-serif", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(23,18,8,0.08)" }}>
                {["Ticket #","Subject","Business","Category","Priority","Status","Created","Updated",""].map((h) => (
                  <th key={h} className="text-left py-2.5 px-2"
                    style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="py-12 text-center" style={{ color: "hsl(var(--fyn-ink) / 0.5)" }}>Loading tickets…</td></tr>
              )}
              {!loading && rows.map((t) => {
                const p = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.low;
                const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.open;
                const company = (t.business_id && bizMap.get(t.business_id)) || "-";
                return (
                  <tr key={t.id} className="hover:bg-[hsl(var(--fyn-ink)/0.03)]" style={{ borderBottom: "1px solid rgba(23,18,8,0.05)" }}>
                    <td className="py-3 px-2 font-mono whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.8)" }}>{t.ticket_number}</td>
                    <td className="py-3 px-2" style={{ color: "hsl(var(--fyn-ink))" }}>{t.subject}</td>
                    <td className="py-3 px-2 whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.8)" }}>{company}</td>
                    <td className="py-3 px-2 whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.7)" }}>{CATEGORY_LABEL[t.category ?? ""] ?? "-"}</td>
                    <td className="py-3 px-2">
                      <span style={{ padding: "3px 9px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: p.bg, color: p.color }} className={p.pulse ? "animate-pulse" : ""}>{p.label}</span>
                    </td>
                    <td className="py-3 px-2">
                      <span style={{ padding: "3px 9px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: s.bg, color: s.color }}>{s.label}</span>
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.6)" }}>{fmtRel(t.created_at)}</td>
                    <td className="py-3 px-2 whitespace-nowrap" style={{ color: "hsl(var(--fyn-ink) / 0.6)" }}>{fmtRel(t.updated_at)}</td>
                    <td className="py-3 px-2">
                      <Link to={`/admin/support/${t.id}`} className="p-1.5 inline-flex rounded-lg hover:bg-[hsl(var(--fyn-ink)/0.06)]" aria-label="View">
                        <Eye size={15} color="hsl(var(--fyn-ink) / 0.6)" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center" style={{ color: "hsl(var(--fyn-ink) / 0.5)" }}>No tickets match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
  return (
    <div>
      <label className="block mb-1" style={{ fontFamily: "Raleway, sans-serif", fontSize: 11, fontWeight: 600, color: "hsl(var(--fyn-ink) / 0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="w-full rounded-lg px-3 py-2.5"
        style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink))" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
