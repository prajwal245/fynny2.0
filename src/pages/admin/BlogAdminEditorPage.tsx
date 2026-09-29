import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Archive, RotateCcw, Trash2, X, Eye, LogOut } from "lucide-react";
import { useBlogAdmin } from "@/contexts/BlogAdminContext";

const INK = "#171208";
const RED = "#C41E1E";
const BEIGE = "#F4EDDA";
const GOLD = "#8B6914";
const BORDER = "rgba(23,18,8,0.08)";

const CATEGORIES = ["GST", "Cash flow", "MSME", "Startup finance", "Compliance", "CA resources", "Hiring"];

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author_name: string;
  author_role: string;
  tags: string[];
  views: number;
  reading_time_minutes: number;
  status: string;
  published_at: string | null;
  created_at: string;
}

const emptyForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Startup finance",
  author_name: "FYNHelp Editorial",
  author_role: "Editorial",
  reading_time_minutes: 4,
  tags: "",
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").slice(0, 80);

export default function BlogAdminEditorPage() {
  const nav = useNavigate();
  const { isBlogAdmin, loading: authLoading, signOut } = useBlogAdmin();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isBlogAdmin) nav("/blog-admin/login", { replace: true });
  }, [authLoading, isBlogAdmin, nav]);

  const loadPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blog_posts")
      .select("id, slug, title, excerpt, content, category, author_name, author_role, tags, views, reading_time_minutes, status, published_at, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setPosts((data ?? []) as BlogPost[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isBlogAdmin) loadPosts();
  }, [isBlogAdmin]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: BlogPost) => {
    setEditId(p.id);
    setForm({
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.content,
      category: p.category,
      author_name: p.author_name,
      author_role: p.author_role,
      reading_time_minutes: p.reading_time_minutes,
      tags: (p.tags ?? []).join(", "),
    });
    setModalOpen(true);
  };

  const handleSave = async (publishNow: boolean) => {
    if (!form.title.trim() || !form.slug.trim() || !form.excerpt.trim() || !form.content.trim()) {
      toast.error("Title, slug, excerpt, and content are required.");
      return;
    }
    if (form.content.trim().split(/\s+/).length < 50) {
      toast.error("Content must be at least 50 words.");
      return;
    }
    setSaving(true);
    const payload: any = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      excerpt: form.excerpt.trim(),
      content: form.content.trim(),
      category: form.category,
      author_name: form.author_name.trim() || "FYNHelp Editorial",
      author_role: form.author_role.trim() || "Editorial",
      reading_time_minutes: form.reading_time_minutes,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      status: publishNow ? "published" : "draft",
      updated_at: new Date().toISOString(),
    };
    if (publishNow) payload.published_at = new Date().toISOString();

    let error;
    if (editId) {
      ({ error } = await supabase.from("blog_posts").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("blog_posts").insert({ ...payload, views: 0 }));
    }

    if (error) toast.error(error.message);
    else {
      toast.success(publishNow ? "Post published." : "Saved as draft.");
      setModalOpen(false);
      await loadPosts();
    }
    setSaving(false);
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "archived", archived_at: new Date().toISOString() } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post archived."); await loadPosts(); }
  };

  const handleUnarchive = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "draft", archived_at: null } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post moved to drafts."); await loadPosts(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Post deleted permanently."); await loadPosts(); }
    setDeleteId(null);
  };

  const handlePublish = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post published."); await loadPosts(); }
  };

  const handleSignOut = async () => {
    await signOut();
    nav("/blog-admin/login", { replace: true });
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: BEIGE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.5)" }}>
        Checking permissions…
      </div>
    );
  }

  if (!isBlogAdmin) return null;

  const published = posts.filter((p) => p.status === "published");
  const drafts = posts.filter((p) => p.status === "draft");
  const archived = posts.filter((p) => p.status === "archived");

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set";

  const PostTable = ({ rows, actions }: { rows: BlogPost[]; actions: (p: BlogPost) => React.ReactNode }) => (
    <div style={{ background: "white", border: "1px solid " + BORDER, borderRadius: 12, overflow: "hidden" }}>
      {rows.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.4)" }}>No posts here yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: BEIGE }}>
              {["Title", "Category", "Views", "Date", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(23,18,8,0.5)", borderBottom: "1px solid " + BORDER }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} style={{ borderTop: i > 0 ? "1px solid " + BORDER : "none" }}>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.3, marginBottom: 2 }}>{p.title}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(23,18,8,0.4)" }}>{p.slug}</div>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: RED, background: "rgba(196,30,30,0.08)", padding: "3px 10px", borderRadius: 99 }}>{p.category}</span>
                </td>
                <td style={{ padding: "12px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "rgba(23,18,8,0.65)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Eye size={12} /> {(p.views ?? 0).toLocaleString("en-IN")}</div>
                </td>
                <td style={{ padding: "12px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>{formatDate(p.published_at ?? p.created_at)}</td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions(p)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const ActionBtn = ({ onClick, icon, label, variant = "ghost" }: { onClick: () => void; icon: React.ReactNode; label: string; variant?: "ghost" | "red" | "gold" }) => {
    const bg = variant === "red" ? RED : variant === "gold" ? GOLD : "transparent";
    const color = variant !== "ghost" ? "white" : "rgba(23,18,8,0.65)";
    return (
      <button onClick={onClick} title={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, border: "1px solid " + BORDER, background: bg, color, fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
        {icon} {label}
      </button>
    );
  };

  return (
    <div style={{ background: BEIGE, minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{ background: "white", borderBottom: "1px solid " + BORDER, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link to="/" style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 20, color: INK, textDecoration: "none" }}>FYNHelp</Link>
          <span style={{ color: "rgba(23,18,8,0.25)", fontSize: 14 }}>/</span>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: GOLD, textTransform: "uppercase", letterSpacing: "0.06em" }}>Blog Admin</span>
        </div>
        <button
          onClick={handleSignOut}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "transparent", border: "1px solid " + BORDER, borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(23,18,8,0.7)", cursor: "pointer" }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <div style={{ padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, marginBottom: 4 }}>Content team</div>
              <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, color: INK, margin: 0 }}>Blog management</h1>
            </div>
            <button onClick={openCreate} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: RED, color: "white", border: "none", borderRadius: 8, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              <Plus size={16} /> New post
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 48, fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.4)" }}>Loading posts…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <div>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: INK, marginBottom: 12 }}>Published ({published.length})</h2>
                <PostTable rows={published} actions={(p) => (<>
                  <ActionBtn onClick={() => openEdit(p)} icon={<Edit2 size={12} />} label="Edit" />
                  <ActionBtn onClick={() => handleArchive(p.id)} icon={<Archive size={12} />} label="Archive" />
                </>)} />
              </div>
              <div>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: INK, marginBottom: 12 }}>Drafts ({drafts.length})</h2>
                <PostTable rows={drafts} actions={(p) => (<>
                  <ActionBtn onClick={() => openEdit(p)} icon={<Edit2 size={12} />} label="Edit" />
                  <ActionBtn onClick={() => handlePublish(p.id)} icon={<Eye size={12} />} label="Publish" variant="gold" />
                  <ActionBtn onClick={() => setDeleteId(p.id)} icon={<Trash2 size={12} />} label="Delete" variant="red" />
                </>)} />
              </div>
              <div>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: INK, marginBottom: 12 }}>Archived ({archived.length})</h2>
                <PostTable rows={archived} actions={(p) => (<>
                  <ActionBtn onClick={() => handleUnarchive(p.id)} icon={<RotateCcw size={12} />} label="Unarchive" />
                  <ActionBtn onClick={() => setDeleteId(p.id)} icon={<Trash2 size={12} />} label="Delete" variant="red" />
                </>)} />
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(23,18,8,0.7)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "100%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto", padding: 28, position: "relative" }}>
            <button onClick={() => setModalOpen(false)} style={{ position: "absolute", top: 14, right: 14, background: "transparent", border: "none", cursor: "pointer", color: "rgba(23,18,8,0.4)" }}><X size={18} /></button>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: INK, margin: "0 0 20px 0" }}>{editId ? "Edit post" : "Create new post"}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[{ label: "Title", key: "title" }, { label: "Slug (URL)", key: "slug" }].map((field) => (
                <div key={field.key}>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>{field.label}</label>
                  <input type="text" value={(form as any)[field.key]}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((f) => ({ ...f, [field.key]: val, ...(field.key === "title" && !editId ? { slug: slugify(val) } : {}) }));
                    }}
                    style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 14, color: INK, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>Category</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 14, color: INK, outline: "none" }}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {["excerpt", "content"].map((key) => (
                <div key={key}>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>
                    {key === "excerpt" ? "Excerpt (max 300 characters)" : "Content (separate paragraphs with a blank line)"}
                  </label>
                  <textarea value={(form as any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    rows={key === "content" ? 14 : 3}
                    maxLength={key === "excerpt" ? 300 : undefined}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: key === "content" ? "Georgia, serif" : "Inter, sans-serif", fontSize: 14, color: INK, outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 12 }}>
                <div>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>Author name</label>
                  <input type="text" value={form.author_name} onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))} style={{ width: "100%", height: 38, padding: "0 10px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 13, color: INK, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>Author role</label>
                  <input type="text" value={form.author_role} onChange={(e) => setForm((f) => ({ ...f, author_role: e.target.value }))} style={{ width: "100%", height: 38, padding: "0 10px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 13, color: INK, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>Tags (comma-separated)</label>
                  <input type="text" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="GST, Startup, Tax" style={{ width: "100%", height: 38, padding: "0 10px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 13, color: INK, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "rgba(23,18,8,0.65)", display: "block", marginBottom: 5 }}>Min read</label>
                  <input type="number" min={1} max={60} value={form.reading_time_minutes} onChange={(e) => setForm((f) => ({ ...f, reading_time_minutes: Number(e.target.value) }))} style={{ width: "100%", height: 38, padding: "0 10px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: INK, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(23,18,8,0.08)" }}>
              <button onClick={() => setModalOpen(false)} style={{ padding: "9px 18px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, background: "transparent", fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.65)", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: "9px 18px", border: "1px solid rgba(23,18,8,0.2)", borderRadius: 8, background: "transparent", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: INK, cursor: "pointer" }}>Save as draft</button>
              <button onClick={() => handleSave(true)} disabled={saving} style={{ padding: "9px 20px", background: RED, color: "white", border: "none", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Publish now"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,8,0.7)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 28, maxWidth: 400, width: "calc(100% - 32px)" }}>
            <h3 style={{ fontFamily: "Georgia, serif", fontSize: 20, color: INK, margin: "0 0 10px 0" }}>Delete this post?</h3>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.65)", marginBottom: 22 }}>This action is permanent and cannot be undone. The post and all its data will be removed.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: "9px 18px", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, background: "transparent", fontFamily: "Inter, sans-serif", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: "9px 18px", background: RED, color: "white", border: "none", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
