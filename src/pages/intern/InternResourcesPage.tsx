import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type TabKey = "getting-started" | "templates" | "glossary" | "blog";

const STEPS = ["DAY 1", "WEEK 1", "WEEK 2", "WEEK 3", "MONTH 1"] as const;
const FORMATS = ["XLSX", "PDF", "DOCX", "PPTX", "CSV", "Image", "Video", "Google Doc", "Google Sheet"];
const TEMPLATE_TYPES = [
  { id: "file", label: "Upload file" },
  { id: "gdoc", label: "Google Doc or Sheet URL" },
  { id: "office", label: "Microsoft Office URL" },
  { id: "video", label: "Video URL" },
] as const;

async function uploadFile(file: File, folder: string): Promise<{ url: string; path: string } | null> {
  const ext = file.name.split(".").pop() ?? "bin";
  const filename = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("resource-files").upload(filename, file, { upsert: false });
  if (error) {
    toast.error("Upload failed: " + error.message);
    return null;
  }
  const { data } = supabase.storage.from("resource-files").getPublicUrl(filename);
  return { url: data.publicUrl, path: filename };
}

export default function InternResourcesPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("getting-started");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate("/intern/login");
        return;
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const allowed = ["intern", "admin", "super_admin", "blog_admin"];
      if (!roles?.some((r: any) => allowed.includes(r.role))) {
        await supabase.auth.signOut();
        navigate("/intern/login");
        return;
      }
      setAuthed(true);
    })();
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/intern/login");
  };

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#F4EDDA", display: "grid", placeItems: "center" }}>
        <div style={{ fontFamily: "Inter, sans-serif", color: "rgba(23,18,8,0.6)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4EDDA" }}>
      <div
        style={{
          height: 56,
          background: "#fff",
          borderBottom: "1px solid rgba(23,18,8,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "#171208" }}>
            FYNHelp
          </span>
          <span style={{ color: "rgba(23,18,8,0.3)" }}>/</span>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: "#8B6914",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              fontWeight: 600,
            }}
          >
            Resource Manager
          </span>
        </div>
        <button
          onClick={signOut}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid rgba(23,18,8,0.15)",
            borderRadius: 8,
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            color: "#171208",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            color: "#8B6914",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 600,
          }}
        >
          Intern portal
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, color: "#171208", margin: "4px 0 24px" }}>
          Resource Manager
        </h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {(
            [
              { key: "getting-started", label: "Getting Started" },
              { key: "templates", label: "Templates" },
              { key: "glossary", label: "Glossary" },
              { key: "blog", label: "Blog" },
            ] as { key: TabKey; label: string }[]
          ).map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "8px 16px",
                  background: active ? "#A93838" : "transparent",
                  color: active ? "#fff" : "rgba(23,18,8,0.6)",
                  border: "none",
                  borderRadius: 8,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === "getting-started" && <VideosTab />}
        {activeTab === "templates" && <TemplatesTab />}
        {activeTab === "glossary" && <GlossaryTab />}
        {activeTab === "blog" && <BlogTab />}
      </div>
    </div>
  );
}

// ============= shared ui =============
const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(23,18,8,0.08)",
  borderRadius: 12,
  overflow: "hidden",
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontFamily: "Inter, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(23,18,8,0.5)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  borderBottom: "1px solid rgba(23,18,8,0.06)",
  background: "rgba(23,18,8,0.02)",
};
const tdStyle: React.CSSProperties = {
  padding: "14px 16px",
  fontFamily: "Inter, sans-serif",
  fontSize: 13,
  color: "#171208",
  borderBottom: "1px solid rgba(23,18,8,0.05)",
};
const redBtn: React.CSSProperties = {
  padding: "9px 14px",
  background: "#A93838",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontFamily: "Inter, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "6px 10px",
  background: "transparent",
  color: "#171208",
  border: "1px solid rgba(23,18,8,0.15)",
  borderRadius: 6,
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(23,18,8,0.15)",
  borderRadius: 8,
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  color: "#171208",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(23,18,8,0.7)",
  marginBottom: 6,
  marginTop: 12,
};

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23,18,8,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Badge({ on }: { on: boolean }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: on ? "rgba(16,185,129,0.12)" : "rgba(23,18,8,0.08)",
        color: on ? "#1F5A46" : "rgba(23,18,8,0.5)",
      }}
    >
      {on ? "Published" : "Draft"}
    </span>
  );
}

// ============= VIDEOS =============
function VideosTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [modal, setModal] = useState<any | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () => {
    supabase
      .from("resource_videos")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, []);

  const del = async (id: string) => {
    const { error } = await supabase.from("resource_videos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Video deleted");
    setConfirmId(null);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.6)" }}>
          {rows.length} video{rows.length === 1 ? "" : "s"}
        </div>
        <button style={redBtn} onClick={() => setModal({})}>+ Add Video</button>
      </div>
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Step</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={{ ...tdStyle, textAlign: "center", color: "rgba(23,18,8,0.4)" }} colSpan={6}>
                  No videos yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}><strong>{r.step}</strong></td>
                <td style={tdStyle}>{r.title}</td>
                <td style={tdStyle}>{r.category}</td>
                <td style={tdStyle}>{r.duration}</td>
                <td style={tdStyle}><Badge on={r.is_published} /></td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <button style={ghostBtn} onClick={() => setModal(r)}>Edit</button>{" "}
                  {confirmId === r.id ? (
                    <>
                      <button style={{ ...ghostBtn, color: "#A93838", borderColor: "#A93838" }} onClick={() => del(r.id)}>
                        Confirm
                      </button>{" "}
                      <button style={ghostBtn} onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button style={ghostBtn} onClick={() => setConfirmId(r.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal !== null && (
        <VideoModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function VideoModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    step: initial.step ?? "DAY 1",
    title: initial.title ?? "",
    description: initial.description ?? "",
    duration: initial.duration ?? "5 min",
    category: initial.category ?? "",
    video_url: initial.video_url ?? "",
    thumbnail_url: initial.thumbnail_url ?? "",
    is_published: initial.is_published ?? true,
    sort_order: initial.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onThumb = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const res = await uploadFile(file, "thumbnails");
    setUploading(false);
    if (res) setForm((f) => ({ ...f, thumbnail_url: res.url }));
  };

  const save = async () => {
    if (!form.title || !form.description || !form.category) {
      toast.error("Title, description, category are required");
      return;
    }
    setSaving(true);
    const payload = { ...form };
    let error;
    if (initial.id) {
      ({ error } = await supabase.from("resource_videos").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("resource_videos").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(initial.id ? "Video updated" : "Video created");
    onSaved();
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "#171208" }}>
        {initial.id ? "Edit video" : "New video"}
      </div>
      <label style={labelStyle}>Step</label>
      <select style={inputStyle} value={form.step} onChange={(e) => setForm({ ...form, step: e.target.value })}>
        {STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label style={labelStyle}>Title</label>
      <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label style={labelStyle}>Description</label>
      <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <label style={labelStyle}>Duration</label>
      <input style={inputStyle} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
      <label style={labelStyle}>Category</label>
      <input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      <label style={labelStyle}>Video URL (optional)</label>
      <input style={inputStyle} value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
      <label style={labelStyle}>Thumbnail</label>
      <input type="file" accept="image/*" onChange={(e) => onThumb(e.target.files?.[0])} />
      {uploading && <div style={{ fontSize: 12, color: "rgba(23,18,8,0.5)", marginTop: 6 }}>Uploading…</div>}
      {form.thumbnail_url && (
        <img src={form.thumbnail_url} alt="" style={{ marginTop: 8, maxHeight: 100, borderRadius: 6 }} />
      )}
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
        Published
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
        <button style={ghostBtn} onClick={onClose}>Cancel</button>
        <button style={redBtn} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ============= TEMPLATES =============
function TemplatesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [modal, setModal] = useState<any | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () => {
    supabase
      .from("resources")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, []);

  const del = async (id: string) => {
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Template deleted");
    setConfirmId(null);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.6)" }}>
          {rows.length} template{rows.length === 1 ? "" : "s"}
        </div>
        <button style={redBtn} onClick={() => setModal({})}>+ Add Template</button>
      </div>
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Format</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={{ ...tdStyle, textAlign: "center", color: "rgba(23,18,8,0.4)" }} colSpan={5}>
                  No templates yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>{r.title}</td>
                <td style={tdStyle}>{r.format}</td>
                <td style={tdStyle}>{r.file_path ? "file" : r.external_url ? "URL" : "—"}</td>
                <td style={tdStyle}><Badge on={r.is_published} /></td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <button style={ghostBtn} onClick={() => setModal(r)}>Edit</button>{" "}
                  {confirmId === r.id ? (
                    <>
                      <button style={{ ...ghostBtn, color: "#A93838", borderColor: "#A93838" }} onClick={() => del(r.id)}>
                        Confirm
                      </button>{" "}
                      <button style={ghostBtn} onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button style={ghostBtn} onClick={() => setConfirmId(r.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal !== null && (
        <TemplateModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialType = initial.file_path ? "file" : initial.external_url ? "gdoc" : "file";
  const [type, setType] = useState<string>(initialType);
  const [form, setForm] = useState({
    title: initial.title ?? "",
    description: initial.description ?? "",
    format: initial.format ?? "PDF",
    external_url: initial.external_url ?? "",
    file_path: initial.file_path ?? "",
    is_published: initial.is_published ?? true,
    sort_order: initial.sort_order ?? 0,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const res = await uploadFile(file, "templates");
    setUploading(false);
    if (res) setForm((f) => ({ ...f, file_path: res.path, external_url: "" }));
  };

  const save = async () => {
    if (!form.title) { toast.error("Title is required"); return; }
    setSaving(true);
    const payload: any = {
      title: form.title,
      description: form.description,
      format: form.format,
      is_published: form.is_published,
      sort_order: form.sort_order,
    };
    if (type === "file") {
      payload.file_path = form.file_path || null;
      payload.external_url = null;
    } else {
      payload.external_url = form.external_url || null;
      payload.file_path = null;
    }
    let error;
    if (initial.id) {
      ({ error } = await supabase.from("resources").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("resources").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(initial.id ? "Template updated" : "Template created");
    onSaved();
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "#171208" }}>
        {initial.id ? "Edit template" : "New template"}
      </div>

      <label style={labelStyle}>Source type</label>
      <div style={{ display: "grid", gap: 6 }}>
        {TEMPLATE_TYPES.map((t) => (
          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Inter, sans-serif", fontSize: 13 }}>
            <input type="radio" checked={type === t.id} onChange={() => setType(t.id)} />
            {t.label}
          </label>
        ))}
      </div>

      {type === "file" ? (
        <>
          <label style={labelStyle}>File</label>
          <input type="file" onChange={(e) => onFile(e.target.files?.[0])} />
          {uploading && <div style={{ fontSize: 12, color: "rgba(23,18,8,0.5)", marginTop: 6 }}>Uploading…</div>}
          {form.file_path && <div style={{ fontSize: 12, color: "rgba(23,18,8,0.6)", marginTop: 6 }}>Path: {form.file_path}</div>}
        </>
      ) : (
        <>
          <label style={labelStyle}>URL</label>
          <input style={inputStyle} value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://…" />
        </>
      )}

      <label style={labelStyle}>Title</label>
      <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label style={labelStyle}>Description</label>
      <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <label style={labelStyle}>Format</label>
      <select style={inputStyle} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
        {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>

      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
        Published
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
        <button style={ghostBtn} onClick={onClose}>Cancel</button>
        <button style={redBtn} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ============= GLOSSARY =============
function GlossaryTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [modal, setModal] = useState<any | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () => {
    supabase
      .from("resource_glossary")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, []);

  const del = async (id: string) => {
    const { error } = await supabase.from("resource_glossary").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Term deleted");
    setConfirmId(null);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.6)" }}>
          {rows.length} term{rows.length === 1 ? "" : "s"}
        </div>
        <button style={redBtn} onClick={() => setModal({})}>+ Add Term</button>
      </div>
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Term</th>
              <th style={thStyle}>Short definition</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={{ ...tdStyle, textAlign: "center", color: "rgba(23,18,8,0.4)" }} colSpan={4}>
                  No terms yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.term}</td>
                <td style={tdStyle}>
                  {(r.short_definition ?? "").length > 80
                    ? (r.short_definition ?? "").slice(0, 80) + "…"
                    : r.short_definition}
                </td>
                <td style={tdStyle}><Badge on={r.is_published} /></td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <button style={ghostBtn} onClick={() => setModal(r)}>Edit</button>{" "}
                  {confirmId === r.id ? (
                    <>
                      <button style={{ ...ghostBtn, color: "#A93838", borderColor: "#A93838" }} onClick={() => del(r.id)}>
                        Confirm
                      </button>{" "}
                      <button style={ghostBtn} onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button style={ghostBtn} onClick={() => setConfirmId(r.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal !== null && (
        <GlossaryModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function GlossaryModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    term: initial.term ?? "",
    short_definition: initial.short_definition ?? "",
    full_definition: initial.full_definition ?? "",
    related_terms: (initial.related_terms ?? []).join(", "),
    is_published: initial.is_published ?? true,
    sort_order: initial.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.term || !form.short_definition || !form.full_definition) {
      toast.error("Term, short and full definition are required");
      return;
    }
    setSaving(true);
    const payload = {
      term: form.term,
      short_definition: form.short_definition,
      full_definition: form.full_definition,
      related_terms: form.related_terms
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
      is_published: form.is_published,
      sort_order: form.sort_order,
    };
    let error;
    if (initial.id) {
      ({ error } = await supabase.from("resource_glossary").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("resource_glossary").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(initial.id ? "Term updated" : "Term created");
    onSaved();
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "#171208" }}>
        {initial.id ? "Edit term" : "New term"}
      </div>
      <label style={labelStyle}>Term</label>
      <input style={inputStyle} value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
      <label style={labelStyle}>Short definition (max 100 chars)</label>
      <input
        style={inputStyle}
        maxLength={100}
        value={form.short_definition}
        onChange={(e) => setForm({ ...form, short_definition: e.target.value })}
      />
      <label style={labelStyle}>Full definition</label>
      <textarea
        style={{ ...inputStyle, minHeight: 100 }}
        value={form.full_definition}
        onChange={(e) => setForm({ ...form, full_definition: e.target.value })}
      />
      <label style={labelStyle}>Related terms (comma-separated)</label>
      <input
        style={inputStyle}
        value={form.related_terms}
        onChange={(e) => setForm({ ...form, related_terms: e.target.value })}
      />
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
        Published
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
        <button style={ghostBtn} onClick={onClose}>Cancel</button>
        <button style={redBtn} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ============= BLOG =============
const BLOG_CATEGORIES = ["GST", "Cash flow", "MSME", "Startup finance", "Compliance", "CA resources", "Hiring"];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").slice(0, 80);

const emptyBlogForm = {
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

function BlogTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyBlogForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("blog_posts")
      .select("id, slug, title, category, views, status, published_at, created_at, author_name, reading_time_minutes, excerpt, content, author_role, tags")
      .order("created_at", { ascending: false });
    setPosts(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyBlogForm);
    setModal(true);
  };

  const openEdit = (p: any) => {
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
    setModal(true);
  };

  const handleSave = async (publishNow: boolean) => {
    if (!form.title.trim() || !form.slug.trim() || !form.excerpt.trim() || !form.content.trim()) {
      toast.error("Title, slug, excerpt, and content are required.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      excerpt: form.excerpt.trim(),
      content: form.content.trim(),
      category: form.category,
      author_name: form.author_name.trim() || "FYNHelp Editorial",
      author_role: form.author_role.trim() || "Editorial",
      reading_time_minutes: form.reading_time_minutes,
      tags: form.tags.split(",").map((t: string) => t.trim()).filter(Boolean),
      status: publishNow ? "published" : "draft",
      published_at: publishNow ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from("blog_posts").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("blog_posts").insert({ ...payload, views: 0 }));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(publishNow ? "Post published." : "Saved as draft.");
    setModal(false);
    load();
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "archived", archived_at: new Date().toISOString() } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post archived."); load(); }
  };

  const handleUnarchive = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "draft", archived_at: null } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Moved to drafts."); load(); }
  };

  const handlePublish = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post published."); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Post deleted."); load(); }
    setDeleteId(null);
  };

  const published = posts.filter((p) => p.status === "published");
  const drafts = posts.filter((p) => p.status === "draft");
  const archived = posts.filter((p) => p.status === "archived");

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set";

  const PostSection = ({ title, rows, actions }: { title: string; rows: any[]; actions: (p: any) => React.ReactNode }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: "#171208", marginBottom: 10 }}>
        {title} ({rows.length})
      </div>
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Views</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "rgba(23,18,8,0.4)" }}>
                  No posts here yet.
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={p.id} style={{ borderTop: i > 0 ? "1px solid rgba(23,18,8,0.05)" : "none" }}>
                  <td style={tdStyle}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 13, fontWeight: 600, color: "#171208" }}>{p.title}</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "rgba(23,18,8,0.4)", marginTop: 2 }}>{p.slug}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#C41E1E", background: "rgba(196,30,30,0.08)", padding: "3px 8px", borderRadius: 99 }}>
                      {p.category}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{p.views}</td>
                  <td style={{ ...tdStyle, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(23,18,8,0.5)" }}>
                    {formatDate(p.published_at ?? p.created_at)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{actions(p)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.6)" }}>
          {posts.length} total posts
        </div>
        <button style={redBtn} onClick={openCreate}>+ New Post</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.4)" }}>
          Loading posts...
        </div>
      ) : (
        <>
          <PostSection
            title="Published"
            rows={published}
            actions={(p) => (
              <>
                <button style={ghostBtn} onClick={() => openEdit(p)}>Edit</button>
                <button style={{ ...ghostBtn, color: "#A93838", borderColor: "#A93838" }} onClick={() => handleArchive(p.id)}>Archive</button>
              </>
            )}
          />
          <PostSection
            title="Drafts"
            rows={drafts}
            actions={(p) => (
              <>
                <button style={ghostBtn} onClick={() => openEdit(p)}>Edit</button>
                <button style={{ ...ghostBtn, color: "#8B6914", borderColor: "#8B6914" }} onClick={() => handlePublish(p.id)}>Publish</button>
                <button style={{ ...ghostBtn, color: "#A93838", borderColor: "#A93838" }} onClick={() => setDeleteId(p.id)}>Delete</button>
              </>
            )}
          />
          <PostSection
            title="Archived"
            rows={archived}
            actions={(p) => (
              <>
                <button style={ghostBtn} onClick={() => handleUnarchive(p.id)}>Unarchive</button>
                <button style={{ ...ghostBtn, color: "#A93838", borderColor: "#A93838" }} onClick={() => setDeleteId(p.id)}>Delete</button>
              </>
            )}
          />
        </>
      )}

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(23,18,8,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "#171208", marginBottom: 18 }}>
              {editId ? "Edit post" : "Create new post"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input style={inputStyle} value={form.title} onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, title: v, ...(!editId ? { slug: slugify(v) } : {}) }));
                }} />
              </div>
              <div>
                <label style={labelStyle}>Slug</label>
                <input style={inputStyle} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {BLOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Excerpt (max 300 characters)</label>
                <textarea style={{ ...inputStyle, minHeight: 70 }} maxLength={300} value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Content (separate paragraphs with a blank line)</label>
                <textarea style={{ ...inputStyle, minHeight: 200, fontFamily: "Georgia, serif" }} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Author name</label>
                  <input style={inputStyle} value={form.author_name} onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Author role</label>
                  <input style={inputStyle} value={form.author_role} onChange={(e) => setForm((f) => ({ ...f, author_role: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Tags (comma separated)</label>
                  <input style={inputStyle} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="GST, Startup" />
                </div>
                <div>
                  <label style={labelStyle}>Min read</label>
                  <input type="number" min={1} max={60} style={{ ...inputStyle, width: 70 }} value={form.reading_time_minutes} onChange={(e) => setForm((f) => ({ ...f, reading_time_minutes: Number(e.target.value) }))} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(23,18,8,0.08)" }}>
              <button style={ghostBtn} onClick={() => setModal(false)}>Cancel</button>
              <button style={{ ...ghostBtn, fontWeight: 600 }} disabled={saving} onClick={() => handleSave(false)}>Save draft</button>
              <button style={redBtn} disabled={saving} onClick={() => handleSave(true)}>{saving ? "Saving..." : "Publish"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,8,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 400, width: "calc(100% - 32px)" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: "#171208", marginBottom: 8 }}>Delete this post?</div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.6)", marginBottom: 20 }}>
              This is permanent and cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={ghostBtn} onClick={() => setDeleteId(null)}>Cancel</button>
              <button style={redBtn} onClick={handleDelete}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
