import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  Edit2,
  ExternalLink,
  Archive,
  RotateCcw,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import { BlogPost, BLOG_CATEGORIES } from "@/types/blog";

const INK = "#171208";
const RED = "#C41E1E";
const GOLD = "#8B6914";
const BEIGE = "#F4EDDA";
const BORDER = "rgba(23,18,8,0.12)";
const HEADING = "'Times New Roman', Times, serif";
const BODY = "Arial, Helvetica, sans-serif";
const PER_PAGE = 5;

type Tab = "all" | "published" | "draft" | "scheduled" | "archived";

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "0.5px solid " + BORDER,
  borderRadius: 8,
};

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  border: "0.5px solid " + BORDER,
  borderRadius: 8,
  fontFamily: BODY,
  fontSize: 12,
  color: INK,
  background: "#FFFFFF",
  outline: "none",
};

function statusStyle(status: string, archived: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 99,
    fontFamily: BODY,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
  if (archived) return { ...base, background: "rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.45)" };
  if (status === "published") return { ...base, background: "rgba(16,185,129,0.12)", color: "#0B7A5A" };
  if (status === "scheduled") return { ...base, background: "rgba(37,99,235,0.10)", color: "#1D4ED8" };
  return { ...base, background: "transparent", color: "rgba(23,18,8,0.6)", border: "0.5px solid " + BORDER };
}

export default function AdminBlogListPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"date" | "title" | "views">("date");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const loadPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blog_posts")
      .select(
        "id, slug, title, excerpt, category, tags, status, author_name, reading_time_minutes, cover_image_url, is_featured, published_at, archived_at, created_at, views",
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setPosts([]);
    } else {
      const rows = (data ?? []) as unknown as BlogPost[];
      setPosts(rows);
      const counts = rows.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {});
      console.log("[AdminBlogListPage] total posts loaded", rows.length, "count per status", counts);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [tab, search, categoryFilter, sortOrder]);

  const counts = useMemo(
    () => ({
      all: posts.filter((p) => !p.archived_at).length,
      published: posts.filter((p) => !p.archived_at && p.status === "published").length,
      draft: posts.filter((p) => !p.archived_at && p.status === "draft").length,
      scheduled: posts.filter((p) => !p.archived_at && p.status === "scheduled").length,
      archived: posts.filter((p) => p.archived_at).length,
    }),
    [posts],
  );

  const filtered = useMemo(() => {
    let rows = posts.filter((p) => {
      if (tab === "archived") return !!p.archived_at;
      if (p.archived_at) return false;
      if (tab === "all") return true;
      return p.status === tab;
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) => p.title.toLowerCase().includes(q) || (p.slug ?? "").toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== "all") rows = rows.filter((p) => p.category === categoryFilter);
    rows = [...rows].sort((a, b) => {
      if (sortOrder === "title") return a.title.localeCompare(b.title);
      if (sortOrder === "views") return (b.views ?? 0) - (a.views ?? 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }, [posts, tab, search, categoryFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const analytics = useMemo(() => {
    const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
    const topViews = posts.reduce((m, p) => Math.max(m, p.views ?? 0), 0);
    const avgRead = posts.length
      ? Math.round(posts.reduce((s, p) => s + (p.reading_time_minutes ?? 0), 0) / posts.length)
      : 0;
    return { totalViews, published: counts.published, topViews, avgRead };
  }, [posts, counts.published]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () => {
    const ids = pageRows.map((p) => p.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  };

  const runBulk = async (action: "publish" | "unpublish" | "archive") => {
    if (!selectedIds.length) return;
    setBulkLoading(true);
    const now = new Date().toISOString();
    let query;
    if (action === "publish") {
      query = supabase
        .from("blog_posts")
        .update({ status: "published", published_at: now, updated_at: now })
        .in("id", selectedIds)
        .in("status", ["draft", "scheduled"]);
    } else if (action === "unpublish") {
      query = supabase
        .from("blog_posts")
        .update({ status: "draft", published_at: null, updated_at: now })
        .in("id", selectedIds);
    } else {
      query = supabase
        .from("blog_posts")
        .update({ archived_at: now, updated_at: now })
        .in("id", selectedIds);
    }
    const { error } = await query;
    if (error) toast.error(error.message);
    else toast.success("Bulk action applied to " + selectedIds.length + " posts");
    setSelectedIds([]);
    await loadPosts();
    setBulkLoading(false);
  };

  const archiveOne = async (id: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("blog_posts")
      .update({ archived_at: now, updated_at: now })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Post archived");
      await loadPosts();
    }
  };

  const restoreOne = async (id: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("blog_posts")
      .update({ archived_at: null, status: "draft", updated_at: now })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Post restored to drafts");
      await loadPosts();
    }
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set";

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "published", label: "Published", count: counts.published },
    { key: "draft", label: "Drafts", count: counts.draft },
    { key: "scheduled", label: "Scheduled", count: counts.scheduled },
    { key: "archived", label: "Archived", count: counts.archived },
  ];

  return (
    <div style={{ fontFamily: BODY, color: INK }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: HEADING, fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD }}>Admin</div>
          <h1 style={{ fontFamily: HEADING, fontSize: 26, fontWeight: 700, margin: 0 }}>Blog management</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts"
            style={{ ...inputStyle, width: 220 }}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={inputStyle}>
            <option value="all">All categories</option>
            {BLOG_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)} style={inputStyle}>
            <option value="date">Date</option>
            <option value="title">Title</option>
            <option value="views">Views</option>
          </select>
          <Link
            to="/admin/blog/new"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", background: RED, color: "#FFFFFF", borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none" }}
          >
            <Plus size={14} /> New post
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Total views", value: analytics.totalViews.toLocaleString("en-IN") },
          { label: "Published", value: String(analytics.published) },
          { label: "Top post views", value: analytics.topViews.toLocaleString("en-IN") },
          { label: "Average read time", value: analytics.avgRead + " min" },
        ].map((c) => (
          <div key={c.label} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: HEADING, fontSize: 24, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                border: "0.5px solid " + BORDER,
                background: active ? INK : "#FFFFFF",
                color: active ? BEIGE : "rgba(23,18,8,0.7)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.label}
              <span style={{ fontSize: 10, background: active ? "rgba(255,255,255,0.18)" : BEIGE, color: active ? BEIGE : INK, padding: "1px 6px", borderRadius: 99 }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <div style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: BEIGE }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{selectedIds.length} selected</span>
          <button disabled={bulkLoading} onClick={() => runBulk("publish")} style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}>Publish selected</button>
          <button disabled={bulkLoading} onClick={() => runBulk("unpublish")} style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}>Unpublish selected</button>
          <button disabled={bulkLoading} onClick={() => runBulk("archive")} style={{ ...inputStyle, cursor: "pointer", fontWeight: 600, color: RED }}>Archive selected</button>
        </div>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "rgba(23,18,8,0.45)" }}>Loading posts</div>
        ) : pageRows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "rgba(23,18,8,0.45)" }}>No posts here yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BEIGE }}>
                <th style={{ padding: "8px 12px", width: 34 }}>
                  <input type="checkbox" checked={pageRows.every((p) => selectedIds.includes(p.id))} onChange={toggleAll} />
                </th>
                {["Cover", "Title", "Category", "Status", "Author", "Featured", "Date", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(23,18,8,0.5)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderTop: "0.5px solid " + BORDER }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {p.cover_image_url ? (
                      <img src={p.cover_image_url} alt={p.title} style={{ width: 38, height: 28, objectFit: "cover", borderRadius: 3 }} />
                    ) : (
                      <div style={{ width: 38, height: 28, borderRadius: 3, background: "rgba(23,18,8,0.08)", display: "grid", placeItems: "center", color: "rgba(23,18,8,0.35)" }}>
                        <ImageIcon size={12} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(23,18,8,0.45)" }}>{p.slug}</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, color: RED, background: "rgba(196,30,30,0.08)", padding: "2px 8px", borderRadius: 99 }}>{p.category}</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={statusStyle(p.status, !!p.archived_at)}>{p.archived_at ? "archived" : p.status}</span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(23,18,8,0.65)" }}>{p.author_name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <Star size={14} color={p.is_featured ? GOLD : "rgba(23,18,8,0.2)"} fill={p.is_featured ? GOLD : "none"} />
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "rgba(23,18,8,0.5)" }}>{formatDate(p.published_at ?? p.created_at)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => navigate("/admin/blog/" + p.id + "/edit")} style={{ ...inputStyle, height: 26, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Edit2 size={11} /> Edit
                      </button>
                      <a href={"/blog/" + p.slug} target="_blank" rel="noreferrer" style={{ ...inputStyle, height: 26, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                        <ExternalLink size={11} /> View live
                      </a>
                      {p.archived_at ? (
                        <button onClick={() => restoreOne(p.id)} style={{ ...inputStyle, height: 26, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <RotateCcw size={11} /> Restore
                        </button>
                      ) : (
                        <button onClick={() => archiveOne(p.id)} style={{ ...inputStyle, height: 26, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: RED }}>
                          <Archive size={11} /> Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12 }}>
        <span style={{ color: "rgba(23,18,8,0.55)" }}>
          Page {page} of {totalPages}, {filtered.length} posts
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ ...inputStyle, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>Previous</button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ ...inputStyle, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
        </div>
      </div>
    </div>
  );
}
