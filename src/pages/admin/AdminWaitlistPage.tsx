import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users, UserPlus, Calendar, CalendarRange, Search, Download, RefreshCw,
  CheckCircle2, RotateCcw, Trash2, ChevronUp, ChevronDown, X,
  ShieldCheck, ShieldAlert, ShieldX, Beaker,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type WaitlistRow = {
  id: string;
  email: string | null;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  company_type: string | null;
  company_size: string | null;
  location: string | null;
  position: number | null;
  is_converted: boolean | null;
  created_at: string;
};

type SortKey = keyof WaitlistRow;
type SortDir = "asc" | "desc";
type SearchField = "all" | "email" | "name" | "company_name";

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 10000;
const DISTINCT_LIMIT = 1000;

function convertedBadge(c: boolean | null) {
  const cfg = c
    ? { bg: "rgba(15,123,79,0.15)",  fg: "#0F7B4F", label: "Converted" }
    : { bg: "rgba(139,105,20,0.15)", fg: "#8B6914", label: "Pending" };
  return (
    <span style={{
      background: cfg.bg, color: cfg.fg,
      padding: "3px 10px", borderRadius: 6,
      fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 11,
      whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

function fmtDate(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Escape value for use inside a PostgREST .or() filter, commas, parens, quotes break the parser.
function escOrValue(v: string) {
  return v.replace(/[(),]/g, " ").replace(/"/g, '""').trim();
}

type Filters = {
  searchField: SearchField;
  search: string;
  convertedFilter: "all" | "converted" | "pending";
  companyFilter: string;
  locationFilter: string;
};

// Apply filters to a Supabase query builder. Returns the same builder for chaining.
function applyFilters<T extends { ilike: any; or: any; eq: any }>(q: T, f: Filters): T {
  const term = f.search.trim();
  if (term) {
    if (f.searchField === "all") {
      const v = `%${escOrValue(term)}%`;
      q = q.or(`email.ilike.${v},name.ilike.${v},company_name.ilike.${v}`);
    } else {
      q = q.ilike(f.searchField, `%${term}%`);
    }
  }
  if (f.convertedFilter !== "all") {
    q = q.eq("is_converted", f.convertedFilter === "converted");
  }
  if (f.companyFilter !== "all") q = q.eq("company_name", f.companyFilter);
  if (f.locationFilter !== "all") q = q.eq("location", f.locationFilter);
  return q;
}

export default function AdminWaitlistPage() {
  const { user, isAdmin, roles, loading: authLoading } = useAdminAuth();
  const [testing, setTesting] = useState(false);

  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters / search / sort / page
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [convertedFilter, setConvertedFilter] = useState<"all" | "converted" | "pending">("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Stats (server-counted)
  const [stats, setStats] = useState({ total: 0, converted: 0, today: 0, week: 0, month: 0 });

  // Distinct dropdown options (loaded once / on refresh)
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  // Debounce search input → search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: Filters = useMemo(() => ({
    searchField, search, convertedFilter, companyFilter, locationFilter,
  }), [searchField, search, convertedFilter, companyFilter, locationFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [searchField, search, convertedFilter, companyFilter, locationFilter, sortKey, sortDir]);

  // Server-paginated load
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("waitlist")
      .select(
        "id,email,name,company_name,phone,company_type,company_size,location,position,is_converted,created_at",
        { count: "exact" }
      );
    q = applyFilters(q, filters);
    q = q.order(sortKey as string, { ascending: sortDir === "asc", nullsFirst: false }).range(from, to);

    const { data, error, count } = await q;
    if (error) {
      setError(error.message);
      setRows([]);
      setTotalCount(0);
    } else {
      setRows((data ?? []) as WaitlistRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [page, filters, sortKey, sortDir]);

  useEffect(() => { load(); }, [load]);

  // Stats, fire 5 head-only count queries in parallel; refire on filter changes? Keep stats global (unfiltered) so they stay meaningful.
  const loadStats = useCallback(async () => {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const startOfWeek = new Date(startOfDay);
    const dow = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dow);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const head = () => supabase.from("waitlist").select("id", { count: "exact", head: true });
    const [total, converted, today, week, month] = await Promise.all([
      head(),
      head().eq("is_converted", true),
      head().gte("created_at", startOfDay.toISOString()),
      head().gte("created_at", startOfWeek.toISOString()),
      head().gte("created_at", startOfMonth.toISOString()),
    ]);
    setStats({
      total: total.count ?? 0,
      converted: converted.count ?? 0,
      today: today.count ?? 0,
      week: week.count ?? 0,
      month: month.count ?? 0,
    });
  }, []);

  // Distinct company / location values for the dropdowns
  const loadDistincts = useCallback(async () => {
    const [companies, locations] = await Promise.all([
      supabase.from("waitlist").select("company_name").not("company_name", "is", null).limit(DISTINCT_LIMIT),
      supabase.from("waitlist").select("location").not("location", "is", null).limit(DISTINCT_LIMIT),
    ]);
    const dedupSort = (rows: { [k: string]: any }[] | null, k: string) =>
      Array.from(new Set((rows ?? []).map((r) => (r[k] ?? "").toString().trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
    setCompanyOptions(dedupSort(companies.data, "company_name"));
    setLocationOptions(dedupSort(locations.data, "location"));
  }, []);

  useEffect(() => { loadStats(); loadDistincts(); }, [loadStats, loadDistincts]);

  // Realtime, refresh current page + stats on any change
  const reloadAllRef = useRef<() => void>(() => {});
  reloadAllRef.current = () => { load(); loadStats(); loadDistincts(); };
  useEffect(() => {
    const ch = supabase
      .channel("waitlist-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, () => reloadAllRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function runTestSignup() {
    setTesting(true);
    const stamp = Date.now();
    // Get current max position from server to avoid stale local state.
    const { data: maxRow } = await supabase
      .from("waitlist")
      .select("position")
      .order("position", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((maxRow?.position as number | null) ?? 0) + 1;
    const payload = {
      email: `test+${stamp}@fynhelp.test`,
      name: "Admin Test Signup",
      company_name: "FynHelp QA",
      phone: `9${String(stamp).slice(-9)}`,
      company_type: "SaaS & Technology",
      company_size: "1-10",
      location: "Bengaluru",
      position: nextPos,
    };
    const { error } = await supabase.from("waitlist").insert(payload);
    setTesting(false);
    if (error) { toast.error(`Test signup failed: ${error.message}`); return; }
    toast.success(`Test entry created (${payload.email})`);
    // realtime will refresh; trigger an immediate reload too in case the channel is slow.
    reloadAllRef.current();
  }

  // Pagination math
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function setConverted(ids: string[], value: boolean) {
    if (!ids.length) return;
    const { error } = await supabase.from("waitlist").update({ is_converted: value }).in("id", ids);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success(`${value ? "Marked" : "Unmarked"} ${ids.length} as converted`);
    reloadAllRef.current();
  }

  async function deleteRows(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} waitlist ${ids.length === 1 ? "entry" : "entries"}? This cannot be undone.`)) return;
    const { error } = await supabase.from("waitlist").delete().in("id", ids);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    toast.success(`Deleted ${ids.length} ${ids.length === 1 ? "entry" : "entries"}`);
    reloadAllRef.current();
  }

  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    let q = supabase
      .from("waitlist")
      .select("id,email,name,company_name,phone,company_type,company_size,location,position,is_converted,created_at");
    q = applyFilters(q, filters);
    q = q.order(sortKey as string, { ascending: sortDir === "asc", nullsFirst: false }).range(0, EXPORT_LIMIT - 1);

    const { data, error } = await q;
    setExporting(false);
    if (error) { toast.error(`Export failed: ${error.message}`); return; }
    const all = (data ?? []) as WaitlistRow[];
    const cols: { key: keyof WaitlistRow | "converted"; label: string }[] = [
      { key: "position", label: "Position" },
      { key: "email", label: "Email" },
      { key: "name", label: "Name" },
      { key: "company_name", label: "Company" },
      { key: "phone", label: "Phone" },
      { key: "company_type", label: "Type" },
      { key: "company_size", label: "Size" },
      { key: "location", label: "Location" },
      { key: "converted", label: "Converted" },
      { key: "created_at", label: "Created At" },
    ];
    const header = cols.map((c) => csvEscape(c.label)).join(",");
    const lines = all.map((r) =>
      cols.map((c) => {
        if (c.key === "converted") return csvEscape(r.is_converted ? "yes" : "no");
        return csvEscape((r as any)[c.key]);
      }).join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${all.length} rows`);
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setSearchField("all");
    setConvertedFilter("all");
    setCompanyFilter("all");
    setLocationFilter("all");
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedIds = Array.from(selected);
  const hasFilters = !!search || searchField !== "all" || convertedFilter !== "all" || companyFilter !== "all" || locationFilter !== "all";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: "hsl(var(--fyn-ink))", letterSpacing: -0.5 }}>
            Waitlist
          </h1>
          <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)", marginTop: 4 }}>
            Manage early-access signups from the public waitlist form.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runTestSignup} disabled={testing} style={btnGhost} title="Insert a fake waitlist row to verify the live pipeline">
            <Beaker size={16} className={testing ? "animate-pulse" : ""} /> {testing ? "Testing…" : "Test signup"}
          </button>
          <button onClick={() => reloadAllRef.current()} disabled={loading} style={btnGhost} aria-label="Refresh">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={exportCsv} disabled={exporting || totalCount === 0} style={btnPrimary}>
            <Download size={16} /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Auth status banner */}
      <AuthStatusBanner authLoading={authLoading} user={user} isAdmin={isAdmin} roles={roles} rowCount={totalCount} loading={loading} error={error} />


      {/* Stats */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <StatCard icon={<Users size={20} color="#8B6914" />} label="Total Signups" value={stats.total} />
        <StatCard icon={<CheckCircle2 size={20} color="#0F7B4F" />} label="Converted" value={stats.converted} />
        <StatCard icon={<UserPlus size={20} color="#8B6914" />} label="Today" value={stats.today} />
        <StatCard icon={<Calendar size={20} color="#8B6914" />} label="This Week" value={stats.week} />
        <StatCard icon={<CalendarRange size={20} color="#8B6914" />} label="This Month" value={stats.month} />
      </div>

      {/* Toolbar */}
      <div style={cardStyle} className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search field selector */}
          <select value={searchField} onChange={(e) => setSearchField(e.target.value as SearchField)} style={{ ...selectStyle, maxWidth: 160 }} title="Field to search">
            <option value="all">All fields</option>
            <option value="email">Email</option>
            <option value="name">Name</option>
            <option value="company_name">Company</option>
          </select>

          <div className="flex items-center gap-2 flex-1 min-w-[240px]" style={{
            background: "#fff", border: "1px solid rgba(23,18,8,0.12)",
            borderRadius: 10, padding: "8px 12px",
          }}>
            <Search size={16} color="hsl(var(--fyn-ink) / 0.5)" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                searchField === "email" ? "Search emails…" :
                searchField === "name" ? "Search names…" :
                searchField === "company_name" ? "Search companies…" :
                "Search email, name or company…"
              }
              style={{ flex: 1, border: "none", outline: "none", fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))", background: "transparent" }}
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} aria-label="Clear search" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}>
                <X size={14} color="hsl(var(--fyn-ink) / 0.5)" />
              </button>
            )}
          </div>

          <select value={convertedFilter} onChange={(e) => setConvertedFilter(e.target.value as any)} style={selectStyle}>
            <option value="all">All status</option>
            <option value="converted">Converted</option>
            <option value="pending">Pending</option>
          </select>

          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={selectStyle}>
            <option value="all">All companies ({companyOptions.length})</option>
            {companyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={selectStyle}>
            <option value="all">All locations ({locationOptions.length})</option>
            {locationOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          {hasFilters && (
            <button onClick={clearFilters} style={btnGhost}>
              <X size={14} /> Clear
            </button>
          )}

          <span style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>
            {totalCount} {totalCount === 1 ? "result" : "results"}
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: "1px dashed rgba(23,18,8,0.12)" }}>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))" }}>
              {selectedIds.length} selected
            </span>
            <button onClick={() => setConverted(selectedIds, true)} style={btnGhost}>
              <CheckCircle2 size={14} /> Mark converted
            </button>
            <button onClick={() => setConverted(selectedIds, false)} style={btnGhost}>
              <RotateCcw size={14} /> Mark pending
            </button>
            <button onClick={() => deleteRows(selectedIds)} style={{ ...btnGhost, color: "#C41E1E", borderColor: "rgba(196,30,30,0.3)" }}>
              <Trash2 size={14} /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} style={btnGhost}>Clear</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={cardStyle}>
        {error ? (
          <div className="py-12 text-center">
            <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "#C41E1E" }}>
              Failed to load waitlist: {error}
            </p>
          </div>
        ) : loading ? (
          <div className="py-12 text-center" style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <UserPlus size={36} color="hsl(var(--fyn-ink) / 0.3)" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 16, color: "hsl(var(--fyn-ink))" }}>
              {hasFilters ? "No matches for your filters" : "No waitlist signups yet"}
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Roboto, sans-serif", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(23,18,8,0.1)" }}>
                    <Th>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} aria-label="Select all on page" />
                    </Th>
                    <SortableTh label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Company" k="company_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Phone" k="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Type" k="company_type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Size" k="company_size" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Location" k="location" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Position" k="position" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Status" k="is_converted" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Created" k="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{
                      borderBottom: "1px solid rgba(23,18,8,0.06)",
                      background: selected.has(r.id) ? "rgba(139,105,20,0.06)" : "transparent",
                    }}>
                      <Td>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label={`Select ${r.email}`} />
                      </Td>
                      <Td><span style={{ color: "hsl(var(--fyn-ink))", fontWeight: 500 }}>{r.email ?? "-"}</span></Td>
                      <Td>{r.name ?? "-"}</Td>
                      <Td>{r.company_name ?? "-"}</Td>
                      <Td>{r.phone ?? "-"}</Td>
                      <Td>{r.company_type ?? "-"}</Td>
                      <Td>{r.company_size ?? "-"}</Td>
                      <Td>{r.location ?? "-"}</Td>
                      <Td><span style={{ fontFamily: "JetBrains Mono, monospace", color: "#8B6914", fontWeight: 600 }}>{r.position != null ? `#${r.position}` : "-"}</span></Td>
                      <Td>{convertedBadge(r.is_converted)}</Td>
                      <Td><span style={{ color: "hsl(var(--fyn-ink) / 0.7)", whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</span></Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          {r.is_converted ? (
                            <button onClick={() => setConverted([r.id], false)} title="Mark pending" style={iconBtn}>
                              <RotateCcw size={15} color="#8B6914" />
                            </button>
                          ) : (
                            <button onClick={() => setConverted([r.id], true)} title="Mark converted" style={iconBtn}>
                              <CheckCircle2 size={15} color="#0F7B4F" />
                            </button>
                          )}
                          <button onClick={() => deleteRows([r.id])} title="Delete" style={iconBtn}>
                            <Trash2 size={15} color="#C41E1E" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: "1px solid rgba(23,18,8,0.06)" }}>
              <span style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)" }}>
                Page {safePage} of {totalPages} · {totalCount} total
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(1)} disabled={safePage <= 1} style={btnGhost}>« First</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} style={btnGhost}>Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={btnGhost}>Next</button>
                <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} style={btnGhost}>Last »</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid hsl(var(--fyn-ink) / 0.08)",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 2px 8px hsl(var(--fyn-ink) / 0.04)",
};

const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "#fff", border: "1px solid rgba(23,18,8,0.15)",
  borderRadius: 8, padding: "8px 12px",
  fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13,
  color: "hsl(var(--fyn-ink))", cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
  color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px",
  fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13,
  cursor: "pointer", boxShadow: "0 2px 8px rgba(196,30,30,0.25)",
};

const selectStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid rgba(23,18,8,0.12)", borderRadius: 10,
  padding: "10px 14px", fontFamily: "Roboto, sans-serif", fontSize: 14,
  color: "hsl(var(--fyn-ink))", outline: "none", maxWidth: 240,
};

const iconBtn: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  padding: 6, borderRadius: 6, display: "grid", placeItems: "center",
};

type SortKey2 = SortKey;
type SortDir2 = SortDir;

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={cardStyle}>
      <div className="flex items-center justify-between mb-2">{icon}</div>
      <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: "hsl(var(--fyn-ink))", lineHeight: 1 }}>
        {value.toLocaleString("en-IN")}
      </div>
      <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 12px",
      fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 11,
      color: "hsl(var(--fyn-ink) / 0.6)", textTransform: "uppercase", letterSpacing: 0.5,
    }}>{children}</th>
  );
}

function SortableTh({
  label, k, sortKey, sortDir, onSort,
}: { label: string; k: SortKey2; sortKey: SortKey2; sortDir: SortDir2; onSort: (k: SortKey2) => void }) {
  const active = sortKey === k;
  return (
    <th style={{ textAlign: "left", padding: "10px 12px" }}>
      <button
        onClick={() => onSort(k)}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 4,
          fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 11,
          color: active ? "hsl(var(--fyn-ink))" : "hsl(var(--fyn-ink) / 0.6)",
          textTransform: "uppercase", letterSpacing: 0.5, padding: 0,
        }}
      >
        {label}
        {active && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "12px", color: "hsl(var(--fyn-ink) / 0.85)", verticalAlign: "middle" }}>{children}</td>;
}

function AuthStatusBanner({
  authLoading, user, isAdmin, roles, rowCount, loading, error,
}: {
  authLoading: boolean;
  user: { email?: string | null; id?: string } | null;
  isAdmin: boolean;
  roles: string[];
  rowCount: number;
  loading: boolean;
  error: string | null;
}) {
  // Decide tone
  let tone: "ok" | "warn" | "bad" = "ok";
  let title = "";
  let detail = "";
  let Icon = ShieldCheck;

  if (authLoading) {
    return null;
  }

  if (!user) {
    tone = "bad"; Icon = ShieldX;
    title = "Not signed in";
    detail = "RLS requires an authenticated session to read the waitlist. Sign in via /admin/login, then return to this page.";
  } else if (!isAdmin) {
    tone = "warn"; Icon = ShieldAlert;
    title = `Signed in as ${user.email ?? user.id}, no admin role`;
    detail = `Roles: ${roles.length ? roles.join(", ") : "(none)"}. The "Authenticated can read waitlist" policy still allows reads, but admin-only update/delete will fail.`;
  } else if (error) {
    tone = "bad"; Icon = ShieldX;
    title = "Authorized, but the query failed";
    detail = error;
  } else if (!loading && rowCount === 0) {
    tone = "warn"; Icon = ShieldAlert;
    title = `Authorized as ${user.email ?? user.id} (${roles.join(", ") || "admin"}), but the table is empty`;
    detail = "The query succeeded with 0 rows. Click \"Test signup\" to insert a row and confirm the live pipeline end-to-end.";
  } else {
    tone = "ok"; Icon = ShieldCheck;
    title = `Authorized as ${user.email ?? user.id} (${roles.join(", ") || "admin"})`;
    detail = `Reading from Lovable Cloud · ${rowCount} ${rowCount === 1 ? "row" : "rows"} loaded · realtime subscription active.`;
  }

  const palette =
    tone === "ok"   ? { bg: "rgba(15,123,79,0.08)",  border: "rgba(15,123,79,0.35)",  fg: "#0F7B4F" } :
    tone === "warn" ? { bg: "rgba(139,105,20,0.08)", border: "rgba(139,105,20,0.35)", fg: "#8B6914" } :
                      { bg: "rgba(196,30,30,0.08)",  border: "rgba(196,30,30,0.35)",  fg: "#C41E1E" };

  return (
    <div className="mb-4" style={{
      background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 10,
      padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <Icon size={18} color={palette.fg} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 13, color: palette.fg }}>
          {title}
        </div>
        <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.7)", marginTop: 4 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}
