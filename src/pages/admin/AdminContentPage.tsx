import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  ExternalLink,
  Archive,
  RotateCcw,
  Image as ImageIcon,
  Star,
  Eye,
  EyeOff,
  Upload,
  CalendarX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, PageHeader } from "./AdminDashboardPage";
import { BlogPost, BLOG_CATEGORIES } from "@/types/blog";
import { uploadBlogImage, validateImageFile, IMAGE_ACCEPT } from "@/lib/blogImageUpload";
import ResourceHealthCheck from "./ResourceHealthCheck";
import { logResourceAction } from "@/lib/resourceAudit";
import ResourceActivityLog from "./ResourceActivityLog";
import { isSelfHostedVideo } from "@/lib/videoSource";
import { validateUpload } from "@/lib/uploadPolicy";



const INK = "#171208";
const RED = "#C41E1E";
const GOLD = "#8B6914";
const BEIGE = "#F4EDDA";
const BORDER = "rgba(23,18,8,0.12)";
const HEADING = "'Times New Roman', Times, serif";
const BODY = "Arial, Helvetica, sans-serif";

const PER_PAGE = 5;

type Tab = "blog" | "resources" | "glossary" | "videos";

const VIDEO_STEPS = ["DAY 1", "WEEK 1", "WEEK 2", "WEEK 3", "MONTH 1"];

interface VideoRow {
  id: string;
  step: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  video_url: string | null;
  thumbnail_url: string | null;
  sort_order: number;
  is_published: boolean;
  archived_at: string | null;
  created_at: string;
}
type BlogTab = "all" | "published" | "draft" | "scheduled" | "archived";

const RESOURCE_FORMATS = ["Template", "Guide", "Checklist", "Video", "Article", "Tool"];

export type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  format: string | null;
  external_url: string | null;
  file_path: string | null;
  file_url: string | null;
  sort_order: number | null;
  is_published: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GlossaryRow = {
  id: string;
  term: string;
  short_definition: string;
  full_definition: string;
  sort_order: number | null;
  is_published: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS =
  "id, slug, title, excerpt, category, tags, status, author_name, reading_time_minutes, cover_image_url, is_featured, published_at, archived_at, created_at, views";

const controlStyle: React.CSSProperties = {
  height: 32,
  border: `0.5px solid ${BORDER}`,
  borderRadius: 8,
  fontFamily: BODY,
  fontSize: 12,
  background: "#FFFFFF",
  color: INK,
  padding: "0 10px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `0.5px solid ${BORDER}`,
  borderRadius: 8,
  fontFamily: BODY,
  fontSize: 13,
  background: "#FFFFFF",
  color: INK,
  padding: "8px 10px",
};

export default function AdminContentPage() {
  const [tab, setTab] = useState<Tab>("blog");

  /* ------------------------------ resources ------------------------------ */
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [resLoading, setResLoading] = useState(true);
  const [resSearch, setResSearch] = useState("");
  const [resModal, setResModal] = useState<null | "add" | ResourceRow>(null);
  const [resDelTarget, setResDelTarget] = useState<null | ResourceRow>(null);
  const [lastResRefreshed, setLastResRefreshed] = useState<Date | null>(null);
  const [resView, setResView] = useState<"active" | "archived">("active");

  /* ------------------------------ glossary ------------------------------- */
  const [glossary, setGlossary] = useState<GlossaryRow[]>([]);
  const [glossLoading, setGlossLoading] = useState(true);
  const [glossSearch, setGlossSearch] = useState("");
  const [glossModal, setGlossModal] = useState<null | "add" | GlossaryRow>(null);
  const [glossDelTarget, setGlossDelTarget] = useState<null | GlossaryRow>(null);
  const [lastGlossRefreshed, setLastGlossRefreshed] = useState<Date | null>(null);
  const [glossView, setGlossView] = useState<"active" | "archived">("active");

  const loadResourcesRef = useRef<() => void>(() => {});
  const loadGlossaryRef = useRef<() => void>(() => {});

  const loadResources = async () => {
    setResLoading(true);
    const { data, error } = await (supabase as never as typeof supabase)
      .from("resources")
      .select("id, title, description, format, external_url, file_path, file_url, sort_order, is_published, archived_at, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setLastResRefreshed(new Date());
    setResources(((data ?? []) as unknown) as ResourceRow[]);
    setResLoading(false);
  };
  loadResourcesRef.current = loadResources;

  const loadGlossary = async () => {
    setGlossLoading(true);
    const { data, error } = await (supabase as never as typeof supabase)
      .from("resource_glossary")
      .select("id, term, short_definition, full_definition, sort_order, is_published, archived_at, created_at, updated_at")
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    else setLastGlossRefreshed(new Date());
    setGlossary(((data ?? []) as unknown) as GlossaryRow[]);
    setGlossLoading(false);
  };
  loadGlossaryRef.current = loadGlossary;

  useEffect(() => {
    loadResources();
    loadGlossary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("resources_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "resources" }, () => loadResourcesRef.current())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "resources" }, () => loadResourcesRef.current())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "resources" }, () => loadResourcesRef.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("glossary_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "resource_glossary" }, () => loadGlossaryRef.current())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "resource_glossary" }, () => loadGlossaryRef.current())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "resource_glossary" }, () => loadGlossaryRef.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredResources = useMemo(() => {
    const q = resSearch.trim().toLowerCase();
    const scoped = resources.filter((r) => (resView === "archived" ? !!r.archived_at : !r.archived_at));
    if (!q) return scoped;
    return scoped.filter((r) => r.title.toLowerCase().includes(q));
  }, [resources, resSearch, resView]);

  const filteredGlossary = useMemo(() => {
    const q = glossSearch.trim().toLowerCase();
    const scoped = glossary.filter((g) => (glossView === "archived" ? !!g.archived_at : !g.archived_at));
    if (!q) return scoped;
    return scoped.filter(
      (g) =>
        g.term.toLowerCase().includes(q) ||
        (g.short_definition ?? "").toLowerCase().includes(q) ||
        (g.full_definition ?? "").toLowerCase().includes(q),
    );
  }, [glossary, glossSearch, glossView]);

  const toggleResourcePublish = async (row: ResourceRow) => {
    const { error } = await (supabase as never as typeof supabase)
      .from("resources")
      .update({ is_published: !row.is_published } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await logResourceAction(row.is_published ? "resource_unpublish" : "resource_publish", row, {
      from: row.is_published,
      to: !row.is_published,
      file_path: row.file_path,
    });
    toast.success(row.is_published ? "Unpublished" : "Published");
    loadResources();
  };

  const toggleResourceArchive = async (row: ResourceRow) => {
    const next = row.archived_at ? null : new Date().toISOString();
    const { error } = await (supabase as never as typeof supabase)
      .from("resources")
      .update({ archived_at: next, ...(next ? { is_published: false } : {}) } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await logResourceAction(next ? "resource_archive" : "resource_unarchive", row, { file_path: row.file_path });
    toast.success(next ? "Resource archived" : "Resource restored");
    loadResources();
  };

  const deleteResource = async (row: ResourceRow) => {
    const { error } = await (supabase as never as typeof supabase).from("resources").delete().eq("id", row.id);
    setResDelTarget(null);
    if (error) return toast.error(error.message);
    await logResourceAction("resource_delete", row, { file_path: row.file_path });
    toast.success("Resource deleted");
    loadResources();
  };

  const toggleGlossaryPublish = async (row: GlossaryRow) => {
    const { error } = await (supabase as never as typeof supabase)
      .from("resource_glossary")
      .update({ is_published: !row.is_published } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(row.is_published ? "Unpublished" : "Published");
    loadGlossary();
  };

  const toggleGlossaryArchive = async (row: GlossaryRow) => {
    const next = row.archived_at ? null : new Date().toISOString();
    const { error } = await (supabase as never as typeof supabase)
      .from("resource_glossary")
      .update({ archived_at: next, ...(next ? { is_published: false } : {}) } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Term archived" : "Term restored");
    loadGlossary();
  };

  const deleteGlossary = async (row: GlossaryRow) => {
    const { error } = await (supabase as never as typeof supabase).from("resource_glossary").delete().eq("id", row.id);
    setGlossDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Term deleted");
    loadGlossary();
  };

  return (
    <div>
      <PageHeader title="Content Management" subtitle="Manage blog, resources, glossary and videos" />

      <div className="flex items-center gap-1 mb-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {(["blog", "resources", "glossary", "videos"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 capitalize"
            style={{
              fontFamily: "Raleway, sans-serif",
              fontWeight: 600,
              fontSize: 14,
              color: tab === t ? INK : "rgba(23,18,8,0.5)",
              borderBottom: tab === t ? `3px solid ${GOLD}` : "3px solid transparent",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex justify-end mb-4">
        {tab === "blog" ? (
          <Link
            to="/admin/blog/new"
            className="inline-flex items-center gap-2 px-3"
            style={{
              height: 32,
              background: RED,
              color: "#FFFFFF",
              borderRadius: 8,
              fontFamily: BODY,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Plus size={14} /> New post
          </Link>
        ) : tab === "videos" ? null : (
          <button
            onClick={() => (tab === "resources" ? setResModal("add") : setGlossModal("add"))}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white"
            style={{
              background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
              fontFamily: "Raleway, sans-serif",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <Plus size={14} /> {tab === "resources" ? "Add Resource" : "Add Term"}
          </button>
        )}
      </div>

      {tab === "blog" && <BlogSection />}

      {tab === "videos" && <VideosSection />}

      {tab === "resources" && (
        <div className="flex flex-col gap-4">
          <LiveDot />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total resources" value={String(resources.length)} />
            <Stat label="Published" value={String(resources.filter((r) => r.is_published && !r.archived_at).length)} />
          </div>
          <ViewToggle
            value={resView}
            onChange={setResView}
            activeCount={resources.filter((r) => !r.archived_at).length}
            archivedCount={resources.filter((r) => !!r.archived_at).length}
          />

          <ResourceHealthCheck onChanged={() => loadResources()} />

          <ResourceActivityLog resources={resources.map((r) => ({ id: r.id, title: r.title }))} />
          {lastResRefreshed && (
            <div style={{ fontFamily: BODY, fontSize: 10, color: "rgba(23,18,8,0.45)", marginTop: -8 }}>
              Last updated: {lastResRefreshed.toLocaleTimeString()}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={resSearch}
              onChange={(e) => setResSearch(e.target.value)}
              placeholder="Search title"
              style={{ ...controlStyle, width: 220 }}
            />
            <button
              onClick={() => setResModal("add")}
              className="inline-flex items-center gap-2 px-3 ml-auto"
              style={{ height: 32, background: RED, color: "#FFFFFF", borderRadius: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700 }}
            >
              <Plus size={14} /> Add Resource
            </button>
          </div>

          <Card>
            <Table headers={["Title", "Format", "File", "Status", "Created", "Actions"]}>
              {resLoading && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "rgba(23,18,8,0.5)" }}>Loading…</td></tr>
              )}
              {!resLoading && filteredResources.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "rgba(23,18,8,0.5)" }}>No resources yet.</td></tr>
              )}
              {!resLoading && filteredResources.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(23,18,8,0.05)" }} className="hover:bg-[rgba(23,18,8,0.03)]">
                  <td className="py-3 px-2" style={{ color: INK, fontWeight: 600 }}>{r.title}</td>
                  <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.7)" }}>{r.format ?? "—"}</td>
                  <td className="py-3 px-2" style={{ fontSize: 11 }}>
                    {r.file_path || r.file_url || r.external_url ? (
                      <span style={{ color: "#0B7A5A", fontWeight: 700 }}>Attached</span>
                    ) : (
                      <span style={{ color: RED, fontWeight: 700 }}>Missing file</span>
                    )}
                  </td>
                  <td className="py-3 px-2"><PubBadge published={r.is_published} /></td>
                  <td className="py-3 px-2 whitespace-nowrap" style={{ color: "rgba(23,18,8,0.6)", fontFamily: "monospace", fontSize: 11 }}>
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RowBtn onClick={() => setResModal(r)}><Edit2 size={12} /> Edit</RowBtn>
                      <RowBtn onClick={() => toggleResourcePublish(r)}>
                        {r.is_published ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
                      </RowBtn>
                      <RowBtn onClick={() => toggleResourceArchive(r)}>
                        {r.archived_at ? <><RotateCcw size={12} /> Unarchive</> : <><Archive size={12} /> Archive</>}
                      </RowBtn>
                      <RowBtn onClick={() => setResDelTarget(r)}><Trash2 size={12} /> Delete</RowBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {tab === "glossary" && (
        <div className="flex flex-col gap-4">
          <LiveDot />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total terms" value={String(glossary.length)} />
            <Stat label="Published" value={String(glossary.filter((g) => g.is_published && !g.archived_at).length)} />
          </div>
          <ViewToggle
            value={glossView}
            onChange={setGlossView}
            activeCount={glossary.filter((g) => !g.archived_at).length}
            archivedCount={glossary.filter((g) => !!g.archived_at).length}
          />
          {lastGlossRefreshed && (
            <div style={{ fontFamily: BODY, fontSize: 10, color: "rgba(23,18,8,0.45)", marginTop: -8 }}>
              Last updated: {lastGlossRefreshed.toLocaleTimeString()}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={glossSearch}
              onChange={(e) => setGlossSearch(e.target.value)}
              placeholder="Search term or definition"
              style={{ ...controlStyle, width: 240 }}
            />
            <button
              onClick={() => setGlossModal("add")}
              className="inline-flex items-center gap-2 px-3 ml-auto"
              style={{ height: 32, background: RED, color: "#FFFFFF", borderRadius: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700 }}
            >
              <Plus size={14} /> Add Term
            </button>
          </div>

          <Card>
            <Table headers={["Term", "Short definition", "Order", "Status", "Actions"]}>
              {glossLoading && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "rgba(23,18,8,0.5)" }}>Loading…</td></tr>
              )}
              {!glossLoading && filteredGlossary.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "rgba(23,18,8,0.5)" }}>No glossary terms yet.</td></tr>
              )}
              {!glossLoading && filteredGlossary.map((g) => (
                <tr key={g.id} style={{ borderBottom: "1px solid rgba(23,18,8,0.05)" }} className="hover:bg-[rgba(23,18,8,0.03)]">
                  <td className="py-3 px-2" style={{ color: INK, fontWeight: 700 }}>{g.term}</td>
                  <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.8)" }}>
                    {(g.short_definition ?? "").length > 80 ? `${g.short_definition.slice(0, 80)}…` : g.short_definition}
                  </td>
                  <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.7)", fontFamily: "monospace", fontSize: 11 }}>{g.sort_order ?? 0}</td>
                  <td className="py-3 px-2"><PubBadge published={g.is_published} /></td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RowBtn onClick={() => setGlossModal(g)}><Edit2 size={12} /> Edit</RowBtn>
                      <RowBtn onClick={() => toggleGlossaryPublish(g)}>
                        {g.is_published ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
                      </RowBtn>
                      <RowBtn onClick={() => toggleGlossaryArchive(g)}>
                        {g.archived_at ? <><RotateCcw size={12} /> Unarchive</> : <><Archive size={12} /> Archive</>}
                      </RowBtn>
                      <RowBtn onClick={() => setGlossDelTarget(g)}><Trash2 size={12} /> Delete</RowBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {resModal && (
        <ResourceModal
          row={resModal === "add" ? null : resModal}
          onClose={() => setResModal(null)}
          onSaved={() => {
            setResModal(null);
            loadResources();
          }}
        />
      )}
      {glossModal && (
        <GlossaryModal
          row={glossModal === "add" ? null : glossModal}
          onClose={() => setGlossModal(null)}
          onSaved={() => {
            setGlossModal(null);
            loadGlossary();
          }}
        />
      )}
      {resDelTarget && (
        <ConfirmDelete label="resource" onCancel={() => setResDelTarget(null)} onConfirm={() => deleteResource(resDelTarget)} />
      )}
      {glossDelTarget && (
        <ConfirmDelete label="term" onCancel={() => setGlossDelTarget(null)} onConfirm={() => deleteGlossary(glossDelTarget)} />
      )}
    </div>
  );
}

/* ---------------------------------- Blog ---------------------------------- */

function BlogSection() {
  const nav = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [blogTab, setBlogTab] = useState<BlogTab>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"date" | "title" | "views">("date");
  const [blogPage, setBlogPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [postDelTarget, setPostDelTarget] = useState<null | BlogPost>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverTargetId = useRef<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as never as typeof supabase)
      .from("blog_posts")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setLastRefreshed(new Date());
    setPosts(((data ?? []) as unknown) as BlogPost[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("blog_posts_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "blog_posts" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "blog_posts" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "blog_posts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setBlogPage(1);
  }, [blogTab, search, categoryFilter, sortOrder]);

  const counts = useMemo(() => {
    const active = posts.filter((p) => !p.archived_at);
    return {
      all: active.length,
      published: active.filter((p) => p.status === "published").length,
      draft: active.filter((p) => p.status === "draft").length,
      scheduled: active.filter((p) => p.status === "scheduled").length,
      archived: posts.filter((p) => p.archived_at).length,
    };
  }, [posts]);

  const analytics = useMemo(() => {
    const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
    const published = posts.filter((p) => p.status === "published" && !p.archived_at).length;
    const topViews = posts.reduce((m, p) => Math.max(m, p.views ?? 0), 0);
    const avgRead = posts.length
      ? Math.round(posts.reduce((s, p) => s + (p.reading_time_minutes ?? 0), 0) / posts.length)
      : 0;
    return { totalViews, published, topViews, avgRead };
  }, [posts]);

  const filtered = useMemo(() => {
    let rows = blogTab === "archived" ? posts.filter((p) => p.archived_at) : posts.filter((p) => !p.archived_at);
    if (blogTab === "published" || blogTab === "draft" || blogTab === "scheduled") {
      rows = rows.filter((p) => p.status === blogTab);
    }
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((p) => p.title?.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q));
    if (categoryFilter !== "all") rows = rows.filter((p) => p.category === categoryFilter);
    const sorted = [...rows];
    if (sortOrder === "title") sorted.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    else if (sortOrder === "views") sorted.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    else sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted;
  }, [posts, blogTab, search, categoryFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = Math.min(blogPage, totalPages);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const update = async (ids: string[], patch: Record<string, unknown>, msg: string) => {
    const { error } = await (supabase as never as typeof supabase)
      .from("blog_posts")
      .update(patch as never)
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(msg);
    await load();
  };

  const removePosts = async (ids: string[]) => {
    const { error } = await (supabase as never as typeof supabase).from("blog_posts").delete().in("id", ids);
    if (error) return toast.error(error.message);
    setSelectedIds((sel) => sel.filter((x) => !ids.includes(x)));
    toast.success(ids.length > 1 ? `${ids.length} posts deleted` : "Post deleted");
    await load();
  };

  const pickCover = (id: string) => {
    coverTargetId.current = id;
    coverInputRef.current?.click();
  };

  const handleCoverFile = async (file: File) => {
    const id = coverTargetId.current;
    if (!id) return;
    const invalid = validateImageFile(file);
    if (invalid) return toast.error(invalid);
    setCoverUploadingId(id);
    const url = await uploadBlogImage(file, "cover");
    if (!url) {
      setCoverUploadingId(null);
      return toast.error("Image upload failed");
    }
    await update([id], { cover_image_url: url, updated_at: new Date().toISOString() }, "Cover image updated");
    setCoverUploadingId(null);
  };

  const runBulk = async (patch: Record<string, unknown>, msg: string) => {
    setBulkLoading(true);
    await update(selectedIds, patch, msg);
    setSelectedIds([]);
    setBulkLoading(false);
  };

  const toggle = (id: string) =>
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selectedIds.includes(p.id));

  return (
    <div className="flex flex-col gap-4">
      <LiveDot />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total views" value={analytics.totalViews.toLocaleString("en-IN")} />
        <Stat label="Published" value={String(analytics.published)} />
        <Stat label="Top post views" value={analytics.topViews.toLocaleString("en-IN")} />
        <Stat label="Avg read time" value={`${analytics.avgRead} min`} />
      </div>
      {lastRefreshed && (
        <div style={{ fontFamily: BODY, fontSize: 10, color: "rgba(23,18,8,0.45)", marginTop: -8 }}>
          Last updated: {lastRefreshed.toLocaleTimeString()}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or slug"
          style={{ ...controlStyle, width: 220 }}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={controlStyle}>
          <option value="all">All categories</option>
          {BLOG_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "date" | "title" | "views")}
          style={controlStyle}
        >
          <option value="date">Date</option>
          <option value="title">Title</option>
          <option value="views">Views</option>
        </select>
        <Link
          to="/admin/blog/new"
          className="inline-flex items-center gap-2 px-3 ml-auto"
          style={{ height: 32, background: RED, color: "#FFFFFF", borderRadius: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700 }}
        >
          <Plus size={14} /> New post
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["all", "All", counts.all],
          ["published", "Published", counts.published],
          ["draft", "Drafts", counts.draft],
          ["scheduled", "Scheduled", counts.scheduled],
          ["archived", "Archived", counts.archived],
        ] as [BlogTab, string, number][]).map(([key, label, count]) => {
          const active = blogTab === key;
          return (
            <button
              key={key}
              onClick={() => setBlogTab(key)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: BODY,
                background: active ? INK : "#FFFFFF",
                color: active ? BEIGE : INK,
                border: active ? `0.5px solid ${INK}` : `0.5px solid ${BORDER}`,
              }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center"
          style={{ background: BEIGE, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", gap: 10 }}
        >
          <span style={{ fontFamily: BODY, fontSize: 12, color: INK, fontWeight: 700 }}>
            {selectedIds.length} selected
          </span>
          <BulkBtn disabled={bulkLoading} onClick={() => runBulk({ status: "published", published_at: new Date().toISOString(), archived_at: null }, "Published")}>
            Publish selected
          </BulkBtn>
          <BulkBtn disabled={bulkLoading} onClick={() => runBulk({ status: "draft", published_at: null }, "Unpublished")}>
            Unpublish selected
          </BulkBtn>
          <BulkBtn disabled={bulkLoading} onClick={() => runBulk({ archived_at: new Date().toISOString() }, "Archived")}>
            Archive selected
          </BulkBtn>
          <BulkBtn disabled={bulkLoading} onClick={() => runBulk({ archived_at: null, status: "draft" }, "Unarchived")}>
            Unarchive selected
          </BulkBtn>
          <BulkBtn disabled={bulkLoading} onClick={() => runBulk({ status: "draft", published_at: null }, "Schedule cancelled")}>
            Cancel schedule
          </BulkBtn>
          <BulkBtn disabled={bulkLoading} onClick={() => setBulkDeleteOpen(true)}>
            Delete selected
          </BulkBtn>
        </div>
      )}

      <div style={{ background: "#FFFFFF", border: `0.5px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <table className="w-full" style={{ fontFamily: BODY, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: BEIGE }}>
              <Th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) =>
                    setSelectedIds((s) =>
                      e.target.checked
                        ? Array.from(new Set([...s, ...pageRows.map((p) => p.id)]))
                        : s.filter((id) => !pageRows.some((p) => p.id === id)),
                    )
                  }
                />
              </Th>
              <Th>Cover</Th>
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>Author</Th>
              <Th>Featured</Th>
              <Th>Date</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>Loading…</td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>No posts found.</td></tr>
            )}
            {!loading && pageRows.map((p) => (
              <tr
                key={p.id}
                style={{ borderTop: `0.5px solid ${BORDER}` }}
                className="hover:bg-[rgba(23,18,8,0.03)]"
              >
                <Td><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} /></Td>
                <Td>
                  {p.cover_image_url ? (
                    <img src={p.cover_image_url} alt={p.title} style={{ width: 38, height: 28, objectFit: "cover", borderRadius: 3 }} />
                  ) : (
                    <div style={{ width: 38, height: 28, borderRadius: 3, background: "rgba(23,18,8,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ImageIcon size={12} color="rgba(23,18,8,0.35)" />
                    </div>
                  )}
                </Td>
                <Td>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{p.title}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(23,18,8,0.45)" }}>/{p.slug}</div>
                </Td>
                <Td>
                  <span style={{ fontSize: 11, color: RED, background: "rgba(196,30,30,0.08)", padding: "2px 8px", borderRadius: 99 }}>
                    {p.category}
                  </span>
                </Td>
                <Td><StatusBadge post={p} /></Td>
                <Td><span style={{ fontSize: 11, color: "rgba(23,18,8,0.65)" }}>{p.author_name}</span></Td>
                <Td>
                  <Star size={14} color={p.is_featured ? GOLD : "rgba(23,18,8,0.2)"} fill={p.is_featured ? GOLD : "none"} />
                </Td>
                <Td>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(23,18,8,0.5)" }}>
                    {new Date(p.published_at ?? p.created_at).toLocaleDateString("en-IN")}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <RowBtn onClick={() => nav(`/admin/blog/${p.id}/edit`)}>
                      <Edit2 size={12} /> Edit
                    </RowBtn>
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={rowBtnStyle}
                      className="inline-flex items-center gap-1 px-2"
                    >
                      <ExternalLink size={12} /> View
                    </a>
                    <RowBtn onClick={() => pickCover(p.id)} disabled={coverUploadingId === p.id}>
                      <Upload size={12} /> {coverUploadingId === p.id ? "Uploading…" : p.cover_image_url ? "Replace image" : "Upload image"}
                    </RowBtn>
                    {p.status === "scheduled" && (
                      <RowBtn
                        onClick={() =>
                          update([p.id], { status: "draft", published_at: null }, "Schedule cancelled — saved as draft")
                        }
                      >
                        <CalendarX size={12} /> Cancel schedule
                      </RowBtn>
                    )}
                    {p.archived_at ? (
                      <RowBtn onClick={() => update([p.id], { archived_at: null, status: "draft" }, "Unarchived")}>
                        <RotateCcw size={12} /> Unarchive
                      </RowBtn>
                    ) : (
                      <RowBtn onClick={() => update([p.id], { archived_at: new Date().toISOString() }, "Archived")}>
                        <Archive size={12} /> Archive
                      </RowBtn>
                    )}
                    <RowBtn onClick={() => setPostDelTarget(p)}>
                      <Trash2 size={12} /> Delete
                    </RowBtn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <input
        ref={coverInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleCoverFile(f);
          e.target.value = "";
        }}
      />

      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, color: "rgba(23,18,8,0.55)", fontFamily: BODY }}>
          Page {page} of {totalPages}, {filtered.length} posts
        </span>
        <div className="flex gap-2">
          <RowBtn disabled={page <= 1} onClick={() => setBlogPage(page - 1)}>Previous</RowBtn>
          <RowBtn disabled={page >= totalPages} onClick={() => setBlogPage(page + 1)}>Next</RowBtn>
        </div>
      </div>

      {postDelTarget && (
        <ConfirmDelete
          label="post"
          onCancel={() => setPostDelTarget(null)}
          onConfirm={async () => {
            const target = postDelTarget;
            setPostDelTarget(null);
            await removePosts([target.id]);
          }}
        />
      )}
      {bulkDeleteOpen && (
        <ConfirmDelete
          label={`${selectedIds.length} selected post${selectedIds.length === 1 ? "" : "s"}`}
          onCancel={() => setBulkDeleteOpen(false)}
          onConfirm={async () => {
            const ids = selectedIds;
            setBulkDeleteOpen(false);
            setBulkLoading(true);
            await removePosts(ids);
            setBulkLoading(false);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Modals --------------------------------- */

function ResourceModal({
  row,
  onClose,
  onSaved,
}: {
  row: ResourceRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [format, setFormat] = useState(row?.format ?? "Template");
  const [externalUrl, setExternalUrl] = useState(row?.external_url ?? "");
  const [isPublished, setIsPublished] = useState(row?.is_published ?? true);
  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? 0);
  const [filePath, setFilePath] = useState<string | null>(row?.file_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const policyError = validateUpload("resources", file);
    if (policyError) return toast.error(policyError);

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("resources")
      .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    setUploading(false);
    if (error) return toast.error(error.message);
    await logResourceAction(filePath ? "resource_file_replace" : "resource_file_upload", { id: row?.id, title: title || row?.title }, {
      file_path: path,
      previous_file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      content_type: file.type || null,
    });
    setFilePath(path);
    toast.success("File uploaded — save to publish it");
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      format,
      external_url: externalUrl.trim() || null,
      file_path: filePath,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (row) {
      ({ error } = await (supabase as never as typeof supabase)
        .from("resources")
        .update(payload as never)
        .eq("id", row.id));
    } else {
      const id = `${title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "resource"}-${Math.random().toString(36).slice(2, 7)}`;
      ({ error } = await (supabase as never as typeof supabase)
        .from("resources")
        .insert({ id, ...payload } as never));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    await logResourceAction(row ? "resource_update" : "resource_create", { id: row?.id, title: payload.title }, {
      file_path: filePath,
      previous_file_path: row?.file_path ?? null,
      is_published: isPublished,
      format,
      external_url: payload.external_url,
    });
    toast.success(row ? "Resource updated" : "Resource created");
    onSaved();
  };

  return (
    <AdminModal title={row ? "Edit Resource" : "Add Resource"} onClose={onClose}>
      <Field label="Title *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Resource title" />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      <Field label="Format">
        <select value={format} onChange={(e) => setFormat(e.target.value)} style={inputStyle}>
          {RESOURCE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Downloadable file">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3"
            style={{ height: 32, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}
          >
            <Upload size={13} /> {uploading ? "Uploading…" : filePath ? "Replace file" : "Upload file"}
          </button>
          <span style={{ fontFamily: BODY, fontSize: 11, color: filePath ? "#0B7A5A" : "rgba(23,18,8,0.5)" }}>
            {filePath ?? "No file attached — download will fail"}
          </span>
          {filePath && (
            <button type="button" onClick={() => setFilePath(null)} style={{ fontFamily: BODY, fontSize: 11, color: RED }}>
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.ppt,.pptx,.zip,.png,.jpg,.jpeg,.webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </Field>
      <Field label="External URL (used when no file is attached)">
        <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} style={inputStyle} placeholder="https://…" />
      </Field>
      <Field label="Sort order">
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          style={inputStyle}
        />
      </Field>
      <label className="flex items-center gap-2" style={{ fontFamily: BODY, fontSize: 13, color: INK }}>
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published
      </label>
      <ModalActions saving={saving} onCancel={onClose} onSave={save} />
    </AdminModal>
  );
}

function GlossaryModal({
  row,
  onClose,
  onSaved,
}: {
  row: GlossaryRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [term, setTerm] = useState(row?.term ?? "");
  const [shortDefinition, setShortDefinition] = useState(row?.short_definition ?? "");
  const [fullDefinition, setFullDefinition] = useState(row?.full_definition ?? "");
  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? 0);
  const [isPublished, setIsPublished] = useState(row?.is_published ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!term.trim()) return toast.error("Term is required");
    if (!shortDefinition.trim()) return toast.error("Short definition is required");
    setSaving(true);
    const payload = {
      term: term.trim(),
      short_definition: shortDefinition.trim(),
      full_definition: (fullDefinition.trim() || shortDefinition.trim()),
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (row) {
      ({ error } = await (supabase as never as typeof supabase)
        .from("resource_glossary")
        .update(payload as never)
        .eq("id", row.id));
    } else {
      ({ error } = await (supabase as never as typeof supabase)
        .from("resource_glossary")
        .insert(payload as never));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Term updated" : "Term created");
    onSaved();
  };

  return (
    <AdminModal title={row ? "Edit Term" : "Add Term"} onClose={onClose}>
      <Field label="Term *">
        <input value={term} onChange={(e) => setTerm(e.target.value)} style={inputStyle} placeholder="e.g. Input Tax Credit" />
      </Field>
      <Field label="Short definition *">
        <textarea value={shortDefinition} onChange={(e) => setShortDefinition(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="One-line summary shown on the card" />
      </Field>
      <Field label="Full definition">
        <textarea value={fullDefinition} onChange={(e) => setFullDefinition(e.target.value)} rows={5} style={{ ...inputStyle, resize: "vertical" }} placeholder="Detailed explanation shown when the term is opened" />
      </Field>
      <Field label="Sort order">
        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={inputStyle} />
      </Field>
      <label className="flex items-center gap-2" style={{ fontFamily: BODY, fontSize: 13, color: INK }}>
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published
      </label>
      <ModalActions saving={saving} onCancel={onClose} onSave={save} />
    </AdminModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontFamily: "Raleway, sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: GOLD }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function ModalActions({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onCancel} style={{ ...rowBtnStyle, height: 34, padding: "0 14px" }}>Cancel</button>
      <button
        onClick={onSave}
        disabled={saving}
        style={{
          height: 34,
          padding: "0 16px",
          borderRadius: 8,
          background: RED,
          color: "#FFFFFF",
          fontFamily: BODY,
          fontSize: 12,
          fontWeight: 700,
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

/* --------------------------------- Shared --------------------------------- */

function LiveDot() {
  return (
    <div className="flex items-center justify-end">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: BODY, fontSize: 10, color: "#1F5A46", fontWeight: 700 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "#1F5A46", animation: "fyn-blog-live-pulse 1.6s ease-out infinite" }} />
        Live
        <style>{`@keyframes fyn-blog-live-pulse { 0%{box-shadow:0 0 0 0 rgba(16,185,129,0.55)} 70%{box-shadow:0 0 0 6px rgba(16,185,129,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} }`}</style>
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#FFFFFF", border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontFamily: "Raleway, sans-serif", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: GOLD, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontFamily: HEADING, fontSize: 24, fontWeight: 700, color: INK, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function PubBadge({ published }: { published: boolean }) {
  const s: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 99 };
  return published ? (
    <span style={{ ...s, background: "rgba(16,185,129,0.12)", color: "#0B7A5A" }}>Published</span>
  ) : (
    <span style={{ ...s, background: "rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.45)" }}>Draft</span>
  );
}

function StatusBadge({ post }: { post: BlogPost }) {
  const s: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 99 };
  if (post.archived_at)
    return <span style={{ ...s, background: "rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.45)" }}>Archived</span>;
  if (post.status === "published")
    return <span style={{ ...s, background: "rgba(16,185,129,0.12)", color: "#0B7A5A" }}>Published</span>;
  if (post.status === "scheduled")
    return <span style={{ ...s, background: "rgba(37,99,235,0.10)", color: "#1D4ED8" }}>Scheduled</span>;
  return <span style={{ ...s, border: `0.5px solid ${BORDER}`, color: "rgba(23,18,8,0.6)" }}>Draft</span>;
}

const rowBtnStyle: React.CSSProperties = {
  height: 26,
  border: `0.5px solid ${BORDER}`,
  borderRadius: 8,
  fontFamily: BODY,
  fontSize: 12,
  color: INK,
  background: "#FFFFFF",
  padding: "0 8px",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

function RowBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...rowBtnStyle, opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}

function BulkBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...rowBtnStyle, height: 28, opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="text-left py-2 px-2"
      style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(23,18,8,0.5)", ...style }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="py-2.5 px-2 align-middle">{children}</td>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ fontFamily: "Roboto, sans-serif", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(23,18,8,0.08)" }}>
            {headers.map((h) => (
              <th key={h} className="text-left py-2.5 px-2"
                style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, color: "rgba(23,18,8,0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function AdminModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(23,18,8,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 20, color: INK }}>{title}</h3>
          <button onClick={onClose} aria-label="Close"><X size={18} color={INK} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
  activeCount,
  archivedCount,
}: {
  value: "active" | "archived";
  onChange: (v: "active" | "archived") => void;
  activeCount: number;
  archivedCount: number;
}) {
  const opts: { key: "active" | "archived"; label: string; count: number }[] = [
    { key: "active", label: "Active", count: activeCount },
    { key: "archived", label: "Archived", count: archivedCount },
  ];
  return (
    <div className="inline-flex items-center gap-1 p-1" style={{ border: `0.5px solid ${BORDER}`, borderRadius: 10, background: "#FFFFFF", width: "fit-content" }}>
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="px-3 py-1.5 inline-flex items-center gap-1.5"
            style={{
              borderRadius: 8,
              fontFamily: BODY,
              fontSize: 12,
              fontWeight: 700,
              background: on ? RED : "transparent",
              color: on ? "#FFFFFF" : "rgba(23,18,8,0.65)",
            }}
          >
            {o.key === "archived" ? <Archive size={12} /> : null}
            {o.label} ({o.count})
          </button>
        );
      })}
    </div>
  );
}

function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(23,18,8,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
      >
        <h4 style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 17, color: INK }}>Delete this {label}?</h4>
        <p style={{ fontFamily: BODY, fontSize: 13, color: "rgba(23,18,8,0.65)", marginTop: 6 }}>
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} style={{ ...rowBtnStyle, height: 34, padding: "0 14px" }}>Cancel</button>
          <button
            onClick={onConfirm}
            style={{ height: 34, padding: "0 16px", borderRadius: 8, background: RED, color: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 700 }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Videos --------------------------------- */

function VideosSection() {
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<null | "add" | VideoRow>(null);
  const [delTarget, setDelTarget] = useState<null | VideoRow>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const loadRef = useRef<() => void>(() => {});

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as never as typeof supabase)
      .from("resource_videos")
      .select("id, step, title, description, duration, category, video_url, thumbnail_url, sort_order, is_published, archived_at, created_at")
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    else setLastRefreshed(new Date());
    setRows(((data ?? []) as unknown) as VideoRow[]);
    setLoading(false);
  };
  loadRef.current = load;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("resource_videos_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "resource_videos" }, () => loadRef.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped = rows.filter((r) => (view === "archived" ? !!r.archived_at : !r.archived_at));
    if (!q) return scoped;
    return scoped.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.step ?? "").toLowerCase().includes(q),
    );
  }, [rows, search, view]);

  const togglePublish = async (row: VideoRow) => {
    const { error } = await (supabase as never as typeof supabase)
      .from("resource_videos")
      .update({ is_published: !row.is_published } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(row.is_published ? "Unpublished" : "Published");
    load();
  };

  const toggleArchive = async (row: VideoRow) => {
    const next = row.archived_at ? null : new Date().toISOString();
    const { error } = await (supabase as never as typeof supabase)
      .from("resource_videos")
      .update({ archived_at: next, ...(next ? { is_published: false } : {}) } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Video archived" : "Video restored");
    load();
  };

  const remove = async (row: VideoRow) => {
    const { error } = await (supabase as never as typeof supabase).from("resource_videos").delete().eq("id", row.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Video deleted");
    load();
  };

  return (
    <div className="flex flex-col gap-4">
      <LiveDot />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total videos" value={String(rows.length)} />
        <Stat label="Published" value={String(rows.filter((r) => r.is_published && !r.archived_at).length)} />
      </div>
      <ViewToggle
        value={view}
        onChange={setView}
        activeCount={rows.filter((r) => !r.archived_at).length}
        archivedCount={rows.filter((r) => !!r.archived_at).length}
      />
      {lastRefreshed && (
        <div style={{ fontFamily: BODY, fontSize: 10, color: "rgba(23,18,8,0.45)", marginTop: -8 }}>
          Last updated: {lastRefreshed.toLocaleTimeString()}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, step or category"
          style={{ ...controlStyle, width: 260 }}
        />
        <button
          onClick={() => setModal("add")}
          className="inline-flex items-center gap-2 px-3 ml-auto"
          style={{ height: 32, background: RED, color: "#FFFFFF", borderRadius: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700 }}
        >
          <Plus size={14} /> Add Video
        </button>
      </div>

      <Card>
        <Table headers={["Title", "Step", "Category", "Duration", "Link", "Order", "Status", "Actions"]}>
          {loading && (
            <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "rgba(23,18,8,0.5)" }}>Loading…</td></tr>
          )}
          {!loading && filtered.length === 0 && (
            <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "rgba(23,18,8,0.5)" }}>No videos yet.</td></tr>
          )}
          {!loading && filtered.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid rgba(23,18,8,0.05)" }} className="hover:bg-[rgba(23,18,8,0.03)]">
              <td className="py-3 px-2" style={{ color: INK, fontWeight: 600 }}>{r.title}</td>
              <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.7)", fontSize: 11, fontWeight: 700 }}>{r.step}</td>
              <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.7)" }}>{r.category || "—"}</td>
              <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.7)", fontFamily: "monospace", fontSize: 11 }}>{r.duration}</td>
              <td className="py-3 px-2" style={{ fontSize: 11 }}>
                {r.video_url ? (
                  <a href={r.video_url} target="_blank" rel="noreferrer" style={{ color: "#0B7A5A", fontWeight: 700 }} className="inline-flex items-center gap-1">
                    Embed <ExternalLink size={11} />
                  </a>
                ) : (
                  <span style={{ color: GOLD, fontWeight: 700 }}>Coming soon</span>
                )}
              </td>
              <td className="py-3 px-2" style={{ color: "rgba(23,18,8,0.7)", fontFamily: "monospace", fontSize: 11 }}>{r.sort_order ?? 0}</td>
              <td className="py-3 px-2"><PubBadge published={r.is_published} /></td>
              <td className="py-3 px-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <RowBtn onClick={() => setModal(r)}><Edit2 size={12} /> Edit</RowBtn>
                  <RowBtn onClick={() => togglePublish(r)}>
                    {r.is_published ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
                  </RowBtn>
                  <RowBtn onClick={() => toggleArchive(r)}>
                    {r.archived_at ? <><RotateCcw size={12} /> Unarchive</> : <><Archive size={12} /> Archive</>}
                  </RowBtn>
                  <RowBtn onClick={() => setDelTarget(r)}><Trash2 size={12} /> Delete</RowBtn>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {modal && (
        <VideoModal
          row={modal === "add" ? null : modal}
          nextOrder={rows.length ? Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1 : 1}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {delTarget && (
        <ConfirmDelete label="video" onCancel={() => setDelTarget(null)} onConfirm={() => remove(delTarget)} />
      )}
    </div>
  );
}

function VideoModal({
  row,
  nextOrder,
  onClose,
  onSaved,
}: {
  row: VideoRow | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(row?.step ?? "DAY 1");
  const [title, setTitle] = useState(row?.title ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [duration, setDuration] = useState(row?.duration ?? "5 min");
  const [category, setCategory] = useState(row?.category ?? "");
  const [videoUrl, setVideoUrl] = useState(row?.video_url ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(row?.thumbnail_url ?? "");
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? nextOrder);
  const [isPublished, setIsPublished] = useState(row?.is_published ?? true);
  const [saving, setSaving] = useState(false);

  const uploadThumbnail = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > 10 * 1024 * 1024) return toast.error("Image must be under 10MB");
    setUploadingThumb(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `video-thumbnails/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("resources").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
    setUploadingThumb(false);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("resources").getPublicUrl(path);
    setThumbnailUrl(data.publicUrl);
    toast.success("Thumbnail uploaded");
  };

  const uploadVideoFile = async (file: File) => {
    if (!file.type.startsWith("video/")) return toast.error("Please choose a video file (MP4/WebM)");
    if (file.size > 500 * 1024 * 1024) return toast.error("Video must be under 500MB");
    setUploadingVideo(true);
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `videos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("resources").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
    setUploadingVideo(false);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("resources").getPublicUrl(path);
    setVideoUrl(data.publicUrl);
    toast.success("Video uploaded");
  };




  const save = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!description.trim()) return toast.error("Description is required");
    if (!category.trim()) return toast.error("Category is required");
    setSaving(true);
    const payload = {
      step,
      title: title.trim(),
      description: description.trim(),
      duration: duration.trim() || "5 min",
      category: category.trim(),
      video_url: videoUrl.trim() || null,
      thumbnail_url: thumbnailUrl.trim() || null,
      sort_order: Number(sortOrder) || 0,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    };
    const client = supabase as never as typeof supabase;
    const { error } = row
      ? await client.from("resource_videos").update(payload as never).eq("id", row.id)
      : await client.from("resource_videos").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Video updated" : "Video added");
    onSaved();
  };

  return (
    <AdminModal title={row ? "Edit video" : "Add video"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, height: "auto", paddingTop: 8 }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Step">
            <select value={step} onChange={(e) => setStep(e.target.value)} style={inputStyle}>
              {VIDEO_STEPS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="GST, Dashboard, Alerts…" style={inputStyle} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration">
            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="5 min" style={inputStyle} />
          </Field>
          <Field label="Sort order">
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={inputStyle} />
          </Field>
        </div>
        <Field label="Video source (upload a file, or paste a YouTube/Vimeo embed link — leave blank for 'coming soon')">
          <div className="flex flex-col gap-2">
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/embed/…" style={inputStyle} />
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                accept="video/*"
                disabled={uploadingVideo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadVideoFile(f);
                }}
                style={{ fontFamily: BODY, fontSize: 12, color: INK }}
              />
              <span style={{ fontFamily: BODY, fontSize: 11, color: "#8A7B63" }}>
                {uploadingVideo ? "Uploading video… (large files may take a while)" : "MP4/WebM, max 500MB — stored in your Cloud bucket"}
              </span>
            </div>
            {videoUrl && isSelfHostedVideo(videoUrl) && (
              <video src={videoUrl} controls preload="metadata" style={{ width: "100%", maxHeight: 200, borderRadius: 8, background: "#000" }} />
            )}
          </div>
        </Field>

        <Field label="Thumbnail image (optional — upload JPG/PNG/WebP, max 10MB)">
          <div className="flex items-start gap-3">
            <div
              style={{
                width: 132, height: 74, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                border: `1px solid ${BORDER}`, background: "#F4EFE3",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: BODY, fontSize: 11, color: "#8A7B63",
              }}
            >
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="Video thumbnail preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                "No thumbnail"
              )}
            </div>
            <div className="flex flex-col gap-2" style={{ flex: 1 }}>
              <input
                type="file"
                accept="image/*"
                disabled={uploadingThumb}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadThumbnail(f);
                }}
                style={{ fontFamily: BODY, fontSize: 12, color: INK }}
              />
              {uploadingThumb && <span style={{ fontFamily: BODY, fontSize: 11, color: "#8A7B63" }}>Uploading…</span>}
              {thumbnailUrl && !uploadingThumb && (
                <button
                  type="button"
                  onClick={() => setThumbnailUrl("")}
                  style={{ alignSelf: "flex-start", fontFamily: BODY, fontSize: 11, color: "#A93838", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Remove thumbnail
                </button>
              )}
            </div>
          </div>
        </Field>

        <label className="flex items-center gap-2" style={{ fontFamily: BODY, fontSize: 12, color: INK }}>
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Published
        </label>
      </div>
      <ModalActions saving={saving} onCancel={onClose} onSave={save} />
    </AdminModal>
  );
}
