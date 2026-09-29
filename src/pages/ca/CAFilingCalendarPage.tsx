import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { COLORS, PageWrap, PageHeader, Card, Chip, PrimaryBtn, SecondaryBtn, GhostLink } from "@/components/ca/ui";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X, Download, Loader2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { GspLimitationBanner } from "@/components/ca/GspLimitationBanner";

// ─── Types ────────────────────────────────────────────────────────────────────
type Filing = {
  id: string;
  business_id: string;
  filing_type: string;
  filing_name: string;
  due_date: string; // ISO date
  status: string | null;
  urgency: string | null;
  notes: string | null;
  businesses: { id: string; business_name: string } | null;
};

type ViewMode = "Month" | "Week" | "List";

// ─── Date helpers ─────────────────────────────────────────────────────────────
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; };
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtMonth = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const fmtKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };

// ─── Filing type → color/category ────────────────────────────────────────────
const TYPE_META: Record<string, { tone: "amber" | "blue" | "green" | "gold" | "red" | "gray"; bar: string }> = {
  "GSTR-1":     { tone: "blue",  bar: "#3B82F6" },
  "GSTR-3B":    { tone: "blue",  bar: "#3B82F6" },
  "GSTR-9":     { tone: "blue",  bar: "#1A4A8B" },
  "TDS":        { tone: "green", bar: "#16A34A" },
  "TDS Return": { tone: "green", bar: "#16A34A" },
  "PF":         { tone: "gold",  bar: "#8B6914" },
  "PF Return":  { tone: "gold",  bar: "#8B6914" },
  "ESIC":       { tone: "gold",  bar: "#A98B4D" },
  "ESIC Return":{ tone: "gold",  bar: "#A98B4D" },
  "PT":         { tone: "amber", bar: "#F59E0B" },
  "Professional Tax": { tone: "amber", bar: "#F59E0B" },
  "Other":      { tone: "gray",  bar: "#9CA3AF" },
};
const typeMeta = (t: string) => TYPE_META[t] || { tone: "gray" as const, bar: "#9CA3AF" };

const FILING_TYPE_OPTIONS = ["All", "GSTR-1", "GSTR-3B", "GSTR-9", "TDS Return", "PF Return", "ESIC Return", "Professional Tax", "Other"];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CAFilingCalendarPage() {
  const { caFirm } = useCAAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewMode>("Month");
  const [loading, setLoading] = useState(true);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [clients, setClients] = useState<{ id: string; business_name: string }[]>([]);

  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [filterTypes, setFilterTypes] = useState<string[]>(["All"]);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"All" | "Pending" | "Filed" | "Overdue">("All");

  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [dayModal, setDayModal] = useState<Date | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // ─── Fetch ──
  useEffect(() => {
    if (!caFirm) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: clientData } = await supabase
        .from("ca_clients")
        .select("business_id, client_name")
        .eq("ca_firm_id", caFirm.id);

      if (cancelled) return;
      const clientList = ((clientData ?? []) as { business_id: string | null; client_name: string }[])
        .filter(c => !!c.business_id) as { business_id: string; client_name: string }[];
      setClients(clientList.map(c => ({ id: c.business_id, business_name: c.client_name })));

      const ids = clientList.map(c => c.business_id);
      if (ids.length === 0) {
        setFilings([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("ca_compliance_events")
        .select("id, business_id, event_type, status, due_date, filing_period, notes, ca_firm_id")
        .eq("ca_firm_id", caFirm.id)
        .order("due_date", { ascending: true })
        .limit(500);

      if (cancelled) return;
      if (error) {
        toast.error("Failed to load filings");
        setFilings([]);
      } else {
        const clientMap = new Map(clientList.map(c => [c.business_id, c.client_name]));
        setFilings((data ?? []).map((e: any): Filing => ({
          id: e.id,
          business_id: e.business_id,
          filing_type: e.event_type,
          filing_name: `${e.event_type}${e.filing_period ? ` · ${e.filing_period}` : ""}`,
          due_date: e.due_date,
          status: e.status,
          urgency: e.status === "overdue" ? "high" : "normal",
          notes: e.notes,
          businesses: { id: e.business_id, business_name: clientMap.get(e.business_id) ?? "Unknown client" },
        })));
      }
      setLoading(false);
    })();


    return () => { cancelled = true; };
  }, [caFirm]);

  // ─── Filter pipeline ──
  const filtered = useMemo(() => {
    return filings.filter(f => {
      if (selectedClients.length > 0 && !selectedClients.includes(f.business_id)) return false;
      if (!filterTypes.includes("All") && filterTypes.length > 0 && !filterTypes.includes(f.filing_type)) return false;
      if (filterStatus !== "All") {
        const isOverdue = parseISO(f.due_date) < startOfDay(new Date()) && f.status !== "filed";
        if (filterStatus === "Overdue" && !isOverdue) return false;
        if (filterStatus === "Pending" && (f.status === "filed" || isOverdue)) return false;
        if (filterStatus === "Filed" && f.status !== "filed") return false;
      }
      return true;
    });
  }, [filings, selectedClients, filterTypes, filterStatus]);

  // ─── Stats ──
  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = addDays(today, 7);
    let dueToday = 0, dueWeek = 0, dueMonth = 0, overdue = 0;
    for (const f of filtered) {
      const d = parseISO(f.due_date);
      const isFiled = f.status === "filed";
      if (sameDay(d, today) && !isFiled) dueToday++;
      if (d >= today && d <= weekEnd && !isFiled) dueWeek++;
      if (sameMonth(d, today) && !isFiled) dueMonth++;
      if (d < today && !isFiled) overdue++;
    }
    return { dueToday, dueWeek, dueMonth, overdue };
  }, [filtered]);

  // ─── Group by date ──
  const byDate = useMemo(() => {
    const m = new Map<string, Filing[]>();
    for (const f of filtered) {
      const arr = m.get(f.due_date) || [];
      arr.push(f);
      m.set(f.due_date, arr);
    }
    return m;
  }, [filtered]);

  const filtersActive = selectedClients.length > 0 || !filterTypes.includes("All") || filterStatus !== "All";
  const clearFilters = () => { setSelectedClients([]); setFilterTypes(["All"]); setFilterStatus("All"); };

  // ─── Mark filed ──
  const markFiled = async (f: Filing) => {
    const { error } = await supabase.from("ca_compliance_events").update({ status: "filed", updated_at: new Date().toISOString() }).eq("id", f.id);
    if (error) { toast.error("Failed to update"); return; }
    setFilings(prev => prev.map(x => x.id === f.id ? { ...x, status: "filed" } : x));
    if (caFirm) {
      await supabase.from("ca_activity_log").insert({
        ca_firm_id: caFirm.id,
        business_id: f.business_id,
        action_type: "filing_marked",
        description: `Marked ${f.filing_name} as filed for ${f.businesses?.business_name || "client"}`,
      });
    }
    toast.success(`${f.filing_name} marked as filed`);
  };

  // ─── CSV export ──
  const exportCSV = () => {
    const rows = [
      ["Client", "Filing Type", "Filing Name", "Due Date", "Status", "Days Left", "Priority"],
      ...filtered.map(f => {
        const d = parseISO(f.due_date);
        const days = daysBetween(new Date(), d);
        return [
          f.businesses?.business_name || "-",
          f.filing_type,
          f.filing_name,
          fmtDate(d),
          f.status || "pending",
          String(days),
          f.urgency || "normal",
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fynhelp-filing-calendar-${fmtKey(cursor)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Calendar exported");
  };

  // ─── Render ──
  return (
    <PageWrap>
      <GspLimitationBanner />
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="text-[13px] mb-1" style={{ color: "rgba(23,18,8,0.45)" }}>Dashboard / Filing Calendar</div>
          <h1 className="text-[28px] font-bold leading-tight" style={{ color: COLORS.ink }}>Filing Calendar</h1>
          <p className="text-[15px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>All client filings across your portfolio</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white rounded-md p-0.5" style={{ border: `1px solid ${COLORS.caBorder}` }}>
            {(["Month", "Week", "List"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className="px-4 py-1.5 text-xs font-medium rounded transition-colors"
                style={view === v ? { background: COLORS.red, color: "#FFFFFF" } : { color: "rgba(23,18,8,0.60)" }}>{v}</button>
            ))}
          </div>
          <SecondaryBtn size="sm" onClick={exportCSV}><span className="inline-flex items-center gap-1.5"><Download size={13} />Export Calendar</span></SecondaryBtn>
          <PrimaryBtn size="sm" onClick={() => setBulkOpen(true)}>Bulk File</PrimaryBtn>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Due Today" value={stats.dueToday} color={stats.dueToday > 0 ? COLORS.red : COLORS.ink} link onClick={() => { setView("List"); setFilterStatus("Pending"); }} />
        <StatCard label="Due This Week" value={stats.dueWeek} color={stats.dueWeek > 0 ? COLORS.amber : COLORS.ink} />
        <StatCard label="Due This Month" value={stats.dueMonth} color={COLORS.ink} />
        <StatCard label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? COLORS.red : COLORS.green} sub={stats.overdue === 0 ? "All clear" : undefined} subColor={COLORS.green} />
      </div>

      {/* Filters bar */}
      <Card className="!p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Client multi-select */}
          <div className="relative">
            <button onClick={() => setClientPickerOpen(o => !o)} className="h-9 px-3 rounded-md text-xs bg-white text-left min-w-[160px]" style={{ border: `1px solid ${COLORS.caBorder}` }}>
              {selectedClients.length === 0 ? "All Clients" : `${selectedClients.length} selected`}
            </button>
            {clientPickerOpen && (
              <div className="absolute top-10 left-0 z-20 w-72 max-h-72 overflow-y-auto bg-white rounded-md shadow-lg p-2" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                {clients.length === 0 && <div className="text-xs p-2" style={{ color: "rgba(23,18,8,0.50)" }}>No clients</div>}
                {clients.map(c => {
                  const checked = selectedClients.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-[#F8F6F1] cursor-pointer" style={{ color: COLORS.ink }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setSelectedClients(prev => checked ? prev.filter(x => x !== c.id) : [...prev, c.id])} />
                      <span className="truncate">{c.business_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filing type multi-select */}
          <div className="relative">
            <button onClick={() => setTypePickerOpen(o => !o)} className="h-9 px-3 rounded-md text-xs bg-white text-left min-w-[140px]" style={{ border: `1px solid ${COLORS.caBorder}` }}>
              {filterTypes.includes("All") || filterTypes.length === 0 ? "All Types" : `${filterTypes.length} type${filterTypes.length > 1 ? "s" : ""}`}
            </button>
            {typePickerOpen && (
              <div className="absolute top-10 left-0 z-20 w-56 bg-white rounded-md shadow-lg p-2" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                {FILING_TYPE_OPTIONS.map(t => {
                  const checked = filterTypes.includes(t);
                  return (
                    <label key={t} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-[#F8F6F1] cursor-pointer" style={{ color: COLORS.ink }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => {
                          if (t === "All") { setFilterTypes(["All"]); return; }
                          setFilterTypes(prev => {
                            const next = prev.filter(x => x !== "All");
                            return checked ? next.filter(x => x !== t) : [...next, t];
                          });
                        }} />
                      <span>{t}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}
            className="h-9 px-3 rounded-md text-xs bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }}>
            {["All", "Pending", "Filed", "Overdue"].map(s => <option key={s}>{s}</option>)}
          </select>

          {/* Month navigator (hide for List) */}
          {view !== "List" && (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => setCursor(view === "Month" ? new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1) : addDays(cursor, -7))}
                className="w-8 h-8 rounded-md flex items-center justify-center bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                <ChevronLeft size={14} />
              </button>
              <div className="text-[15px] font-semibold min-w-[160px] text-center" style={{ color: COLORS.ink }}>
                {view === "Month" ? fmtMonth(cursor) : `${fmtDate(startOfWeek(cursor))} – ${fmtDate(addDays(startOfWeek(cursor), 6))}`}
              </div>
              <button onClick={() => setCursor(view === "Month" ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) : addDays(cursor, 7))}
                className="w-8 h-8 rounded-md flex items-center justify-center bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                <ChevronRight size={14} />
              </button>
              <button onClick={() => setCursor(startOfDay(new Date()))} className="text-xs font-medium px-2 py-1 rounded hover:bg-[#F8F6F1]" style={{ color: COLORS.red }}>Today</button>
            </div>
          )}

          {filtersActive && <button onClick={clearFilters} className="text-[13px] ml-auto" style={{ color: COLORS.red }}>Clear filters</button>}
        </div>
      </Card>

      {/* Body */}
      {loading ? (
        <Card><div className="flex items-center gap-2 text-sm" style={{ color: "rgba(23,18,8,0.60)" }}><Loader2 size={14} className="animate-spin" /> Loading filings…</div></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalIcon size={56} style={{ color: "#D4C9A8" }} />
            <h3 className="mt-4 text-[20px] font-bold" style={{ color: COLORS.ink }}>No filings scheduled</h3>
            <p className="mt-1 text-sm max-w-md" style={{ color: "rgba(23,18,8,0.60)" }}>
              All your clients are up to date with their compliance filings.
            </p>
          </div>
        </Card>
      ) : view === "Month" ? (
        <MonthGrid cursor={cursor} byDate={byDate} onCellClick={(d) => setDayModal(d)} />
      ) : view === "Week" ? (
        <WeekGrid cursor={cursor} byDate={byDate} onCardClick={(f) => navigate(`/ca/clients/${f.business_id}`)} />
      ) : (
        <ListView filings={filtered} onMarkFiled={markFiled} onViewClient={(id) => navigate(`/ca/clients/${id}`)} />
      )}

      {/* Day modal */}
      {dayModal && (
        <DayFilingsModal date={dayModal} filings={byDate.get(fmtKey(dayModal)) || []}
          onClose={() => setDayModal(null)}
          onView={(f) => { setDayModal(null); navigate(`/ca/clients/${f.business_id}`); }}
          onMarkFiled={markFiled} />
      )}

      {/* Bulk modal */}
      {bulkOpen && (
        <BulkFileModal clients={clients} onClose={() => setBulkOpen(false)}
          onSubmit={async ({ filingType, filingName, dueDate, period, clientIds }) => {
            const rows = clientIds.map(bid => ({
              ca_firm_id: caFirm?.id ?? "",
              business_id: bid,
              event_type: filingType,
              filing_period: period || dueDate,
              due_date: dueDate,
              status: "filed",
            }));
            const { error } = await supabase.from("ca_compliance_events").insert(rows);
            if (error) { toast.error("Bulk filing failed"); return; }
            if (caFirm) {
              await supabase.from("ca_activity_log").insert(clientIds.map(bid => ({
                ca_firm_id: caFirm.id, business_id: bid, action_type: "bulk_filing",
                description: `Bulk-filed ${filingName} for ${period || dueDate}`,
              })));
            }
            toast.success(`Filed ${filingName} for ${clientIds.length} client${clientIds.length > 1 ? "s" : ""}`);
            // Refresh
            if (caFirm) {
              const { data } = await supabase
                .from("ca_compliance_events")
                .select("id, business_id, event_type, status, due_date, filing_period, notes, ca_firm_id")
                .eq("ca_firm_id", caFirm.id)
                .order("due_date", { ascending: true })
                .limit(500);
              const clientMap = new Map(clients.map(c => [c.id, c.business_name]));
              setFilings((data ?? []).map((e: any): Filing => ({
                id: e.id,
                business_id: e.business_id,
                filing_type: e.event_type,
                filing_name: `${e.event_type}${e.filing_period ? ` · ${e.filing_period}` : ""}`,
                due_date: e.due_date,
                status: e.status,
                urgency: e.status === "overdue" ? "high" : "normal",
                notes: e.notes,
                businesses: { id: e.business_id, business_name: clientMap.get(e.business_id) ?? "Unknown client" },
              })));
            }
            setBulkOpen(false);

          }} />
      )}
    </PageWrap>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub, subColor, link, onClick }: {
  label: string; value: number; color: string; sub?: string; subColor?: string; link?: boolean; onClick?: () => void;
}) {
  return (
    <div className="bg-white rounded-md p-4" style={{ border: `1px solid ${COLORS.caBorder}` }}>
      <div className="text-[12px] font-medium" style={{ color: "rgba(23,18,8,0.55)" }}>{label}</div>
      <div className="text-[24px] font-bold leading-tight mt-1 tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-[12px] mt-0.5" style={{ color: subColor || "rgba(23,18,8,0.55)" }}>{sub}</div>}
      {link && <button onClick={onClick} className="text-[12px] font-medium mt-1" style={{ color: COLORS.red }}>View →</button>}
    </div>
  );
}

function MonthGrid({ cursor, byDate, onCellClick }: { cursor: Date; byDate: Map<string, Filing[]>; onCellClick: (d: Date) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startPad = first.getDay();
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Date[] = [];
  for (let i = 0; i < startPad; i++) cells.push(addDays(first, -(startPad - i)));
  for (let i = 0; i < lastDay; i++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
  while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
  const today = startOfDay(new Date());

  return (
    <Card>
      <div className="grid grid-cols-7 gap-2">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(d => (
          <div key={d} className="text-[12px] font-semibold uppercase tracking-wider text-center pb-2" style={{ color: "rgba(23,18,8,0.55)" }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const inMonth = sameMonth(d, cursor);
          const isToday = sameDay(d, today);
          const items = byDate.get(fmtKey(d)) || [];
          const visible = items.slice(0, 3);
          const more = items.length - visible.length;
          return (
            <button key={i} onClick={() => items.length && onCellClick(d)} title={items.length ? `${items.length} filing${items.length > 1 ? "s" : ""} due` : undefined}
              className="rounded p-2 min-h-[120px] text-left transition-colors"
              style={{
                border: `${isToday ? 2 : 1}px solid ${isToday ? COLORS.gold : COLORS.divider}`,
                background: isToday ? "#FFF9E6" : "#FFFFFF",
                cursor: items.length ? "pointer" : "default",
                opacity: inMonth ? 1 : 0.5,
              }}>
              <div className="text-[14px] font-semibold mb-1" style={{ color: inMonth ? COLORS.ink : "rgba(23,18,8,0.25)" }}>{d.getDate()}</div>
              <div className="space-y-1">
                {visible.map(f => {
                  const meta = typeMeta(f.filing_type);
                  const overdue = parseISO(f.due_date) < today && f.status !== "filed";
                  const dotColor = overdue ? COLORS.red : isToday ? COLORS.red : meta.bar;
                  return (
                    <div key={f.id} className="flex items-center gap-1.5 text-[10px] truncate">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                      <span className="truncate" style={{ color: COLORS.ink }}>{f.filing_type}</span>
                    </div>
                  );
                })}
                {more > 0 && <div className="text-[10px] font-medium" style={{ color: COLORS.red }}>+{more} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WeekGrid({ cursor, byDate, onCardClick }: { cursor: Date; byDate: Map<string, Filing[]>; onCardClick: (f: Filing) => void }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = startOfDay(new Date());
  return (
    <Card>
      <div className="grid grid-cols-7 gap-2">
        {days.map(d => {
          const items = byDate.get(fmtKey(d)) || [];
          const isToday = sameDay(d, today);
          return (
            <div key={fmtKey(d)} className="rounded p-2 min-h-[280px]" style={{ border: `1px solid ${COLORS.divider}`, background: isToday ? "#FFF9E6" : "#FAF7F0" }}>
              <div className="text-[12px] font-semibold uppercase" style={{ color: "rgba(23,18,8,0.55)" }}>{d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
              <div className="text-[20px] font-bold mb-2" style={{ color: isToday ? COLORS.red : COLORS.ink }}>{d.getDate()}</div>
              <div className="space-y-2">
                {items.map(f => {
                  const meta = typeMeta(f.filing_type);
                  const overdue = parseISO(f.due_date) < today && f.status !== "filed";
                  return (
                    <button key={f.id} onClick={() => onCardClick(f)}
                      className="block w-full text-left bg-white rounded-md p-2 hover:bg-[#F8F6F1]"
                      style={{ borderLeft: `4px solid ${meta.bar}`, border: `1px solid ${COLORS.divider}` }}>
                      <div className="text-[12px] font-semibold" style={{ color: COLORS.ink }}>{f.filing_type}</div>
                      <div className="text-[11px] truncate" style={{ color: "rgba(23,18,8,0.65)" }}>{f.businesses?.business_name || "-"}</div>
                      <div className="mt-1">
                        <Chip tone={f.status === "filed" ? "green" : overdue ? "red" : "amber"}>
                          {f.status === "filed" ? "Filed" : overdue ? "Overdue" : "Pending"}
                        </Chip>
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && <div className="text-[11px]" style={{ color: "rgba(23,18,8,0.40)" }}>-</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ListView({ filings, onMarkFiled, onViewClient }: {
  filings: Filing[]; onMarkFiled: (f: Filing) => void; onViewClient: (id: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const today = startOfDay(new Date());

  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr style={{ background: COLORS.caSurface }}>
            {["Filing Type", "Client", "Due Date", "Status", "Days Left", "Priority", ""].map(h => (
              <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.65)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filings.map(f => {
            const d = parseISO(f.due_date);
            const days = daysBetween(today, d);
            const isFiled = f.status === "filed";
            const overdue = d < today && !isFiled;
            const daysColor = overdue || days <= 3 ? COLORS.red : days <= 7 ? COLORS.amber : COLORS.green;
            const priority = (f.urgency || "normal").toLowerCase();
            const priorityTone = priority === "high" || priority === "urgent" ? "red" : priority === "medium" ? "amber" : "gray";
            return (
              <tr key={f.id} className="hover:bg-[#FAF7F0]" style={{ borderTop: `1px solid ${COLORS.divider}`, height: 56 }}>
                <td className="px-4">
                  <div className="text-[14px] font-medium" style={{ color: COLORS.ink }}>{f.filing_type}</div>
                  <div className="text-[11px]" style={{ color: "rgba(23,18,8,0.50)" }}>{f.filing_name}</div>
                </td>
                <td className="px-4">
                  <button onClick={() => onViewClient(f.business_id)} className="text-[14px] font-medium hover:underline" style={{ color: COLORS.ink }}>
                    {f.businesses?.business_name || "-"}
                  </button>
                </td>
                <td className="px-4 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{fmtDate(d)}</td>
                <td className="px-4">
                  <Chip tone={isFiled ? "green" : overdue ? "red" : "amber"}>{isFiled ? "Filed" : overdue ? "Overdue" : "Pending"}</Chip>
                </td>
                <td className="px-4 text-[14px] font-semibold tabular-nums" style={{ color: isFiled ? "rgba(23,18,8,0.40)" : daysColor }}>
                  {isFiled ? "-" : days < 0 ? `${days}d` : `${days}d`}
                </td>
                <td className="px-4"><Chip tone={priorityTone as any}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Chip></td>
                <td className="px-4 relative">
                  <button onClick={() => setOpenMenu(openMenu === f.id ? null : f.id)} className="p-1.5 rounded hover:bg-[#F0EBD8]"><MoreVertical size={14} /></button>
                  {openMenu === f.id && (
                    <div className="absolute right-2 top-10 z-10 w-44 bg-white rounded-md shadow-lg py-1" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                      {!isFiled && (
                        <button onClick={() => { setOpenMenu(null); onMarkFiled(f); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#F8F6F1]" style={{ color: COLORS.ink }}>Mark as Filed</button>
                      )}
                      <button onClick={() => { setOpenMenu(null); onViewClient(f.business_id); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#F8F6F1]" style={{ color: COLORS.ink }}>View Client →</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function DayFilingsModal({ date, filings, onClose, onView, onMarkFiled }: {
  date: Date; filings: Filing[]; onClose: () => void; onView: (f: Filing) => void; onMarkFiled: (f: Filing) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-xl max-w-[600px] w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex items-start justify-between" style={{ borderBottom: `1px solid ${COLORS.divider}` }}>
          <div>
            <h3 className="text-[22px] font-bold" style={{ color: COLORS.ink }}>Filings Due, {fmtDate(date)}</h3>
            <div className="text-[14px]" style={{ color: "rgba(23,18,8,0.65)" }}>{filings.length} filing{filings.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F0EBD8]"><X size={18} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          {filings.map(f => (
            <div key={f.id} className="rounded-lg p-4" style={{ background: COLORS.caSurface }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Chip tone={typeMeta(f.filing_type).tone}>{f.filing_type}</Chip>
                <Chip tone={f.status === "filed" ? "green" : "amber"}>{f.status === "filed" ? "Filed" : "Pending"}</Chip>
              </div>
              <div className="text-[14px] font-semibold" style={{ color: COLORS.ink }}>{f.businesses?.business_name || "-"}</div>
              <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{f.filing_name}</div>
              <div className="flex items-center gap-2 mt-3">
                {f.status !== "filed" && <PrimaryBtn size="sm" onClick={() => onMarkFiled(f)}>Mark Filed →</PrimaryBtn>}
                <GhostLink onClick={() => onView(f)}>View Client</GhostLink>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BulkFileModal({ clients, onClose, onSubmit }: {
  clients: { id: string; business_name: string }[];
  onClose: () => void;
  onSubmit: (v: { filingType: string; filingName: string; dueDate: string; period: string; clientIds: string[] }) => Promise<void>;
}) {
  const [filingType, setFilingType] = useState("GSTR-3B");
  const [period, setPeriod] = useState("");
  const [dueDate, setDueDate] = useState(fmtKey(new Date()));
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const allSelected = selected.length === clients.length && clients.length > 0;
  const toggleAll = () => setSelected(allSelected ? [] : clients.map(c => c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-xl max-w-[700px] w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex items-start justify-between" style={{ borderBottom: `1px solid ${COLORS.divider}` }}>
          <div>
            <h3 className="text-[22px] font-bold" style={{ color: COLORS.ink }}>Bulk File Returns</h3>
            <div className="text-[14px]" style={{ color: "rgba(23,18,8,0.65)" }}>File the same return type across multiple clients</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F0EBD8]"><X size={18} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.55)" }}>Filing Type</label>
            <select value={filingType} onChange={(e) => setFilingType(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }}>
              {["GSTR-1", "GSTR-3B", "GSTR-9", "TDS Return", "PF Return", "ESIC Return", "Professional Tax", "Other"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.55)" }}>Period</label>
              <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. March 2026 or Q4 FY 2025-26"
                className="mt-1 w-full h-10 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }} />
            </div>
            <div>
              <label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.55)" }}>Due / Filed Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.55)" }}>Select Clients ({selected.length}/{clients.length})</label>
              <button onClick={toggleAll} className="text-xs font-medium" style={{ color: COLORS.red }}>{allSelected ? "Deselect all" : "Select all"}</button>
            </div>
            <div className="rounded-md max-h-56 overflow-y-auto" style={{ border: `1px solid ${COLORS.caBorder}` }}>
              {clients.length === 0 && <div className="text-xs p-3" style={{ color: "rgba(23,18,8,0.50)" }}>No clients available</div>}
              {clients.map(c => {
                const checked = selected.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#F8F6F1] cursor-pointer" style={{ color: COLORS.ink, borderBottom: `1px solid ${COLORS.divider}` }}>
                    <input type="checkbox" checked={checked} onChange={() => setSelected(prev => checked ? prev.filter(x => x !== c.id) : [...prev, c.id])} />
                    <span>{c.business_name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div className="p-6 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${COLORS.divider}` }}>
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn
            disabled={submitting || selected.length === 0}
            onClick={async () => {
              setSubmitting(true);
              await onSubmit({ filingType, filingName: filingType, dueDate, period, clientIds: selected });
              setSubmitting(false);
            }}>
            {submitting ? "Filing…" : `File for ${selected.length} Client${selected.length !== 1 ? "s" : ""} →`}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
