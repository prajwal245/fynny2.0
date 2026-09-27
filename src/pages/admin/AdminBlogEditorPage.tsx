import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@/lib/router-compat";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uploadBlogImage, validateImageFile, IMAGE_ACCEPT } from "@/lib/blogImageUpload";
import { BLOG_CATEGORIES } from "@/types/blog";
import { sanitizeForStorage } from "@/lib/sanitizeHtml";

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  ImagePlus,
  Undo2,
  Redo2,
  Check,
  Loader2,
  X,
} from "lucide-react";

const INK = "#171208";
const RED = "#C41E1E";
const GOLD = "#8B6914";
const BEIGE = "#F4EDDA";
const BORDER = "rgba(23,18,8,0.12)";
const HEADING = "'Times New Roman', Times, serif";
const BODY = "Arial, Helvetica, sans-serif";

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "0.5px solid " + BORDER,
  borderRadius: 8,
  padding: 14,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  border: "0.5px solid " + BORDER,
  borderRadius: 8,
  fontFamily: BODY,
  fontSize: 12,
  color: INK,
  background: "#FFFFFF",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: GOLD,
  marginBottom: 5,
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);

export default function AdminBlogEditorPage() {
  const { postId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState(BLOG_CATEGORIES[0]);
  const [authorName, setAuthorName] = useState("FynHelp Team");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule" | "draft">("draft");
  const [scheduleAt, setScheduleAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [contentText, setContentText] = useState("");
  const [uploading, setUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      setContentText(ed.getText());
      triggerAutosave();
    },
  });

  const triggerAutosave = useCallback(() => {
    setAutosaveState("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => setAutosaveState("saved"), 1200);
  }, []);

  useEffect(() => {
    console.log("[AdminBlogEditorPage]", postId ? "editing post " + postId : "new post");
    if (!postId || !editor) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", postId).maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) return;
      const p = data as Record<string, unknown>;
      setTitle((p.title as string) ?? "");
      setSlug((p.slug as string) ?? "");
      setSlugTouched(true);
      setExcerpt((p.excerpt as string) ?? "");
      setCategory((p.category as string) ?? BLOG_CATEGORIES[0]);
      setAuthorName((p.author_name as string) ?? "FynHelp Team");
      setTags(((p.tags as string[]) ?? []) as string[]);
      setCoverImage((p.cover_image_url as string) ?? "");
      setIsFeatured(Boolean(p.is_featured));
      setSeoTitle((p.seo_title as string) ?? "");
      setSeoDescription((p.seo_description as string) ?? "");
      setOgImage((p.og_image as string) ?? "");
      const status = (p.status as string) ?? "draft";
      setPublishMode(status === "published" ? "now" : status === "scheduled" ? "schedule" : "draft");
      if (p.published_at) setScheduleAt(new Date(p.published_at as string).toISOString().slice(0, 16));
      editor.commands.setContent((p.content as string) ?? "");
      setContentText(editor.getText());
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, editor]);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (!slugTouched || !slug) setSlug(slugify(v));
    triggerAutosave();
  };

  const words = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.ceil(words / 200));

  const seoChecks = useMemo(() => {
    const list = [
      title.length > 10,
      seoDescription.length > 40,
      words > 50,
      seoTitle.length >= 40 && seoTitle.length <= 60,
    ];
    const passed = list.filter(Boolean).length;
    const grade = passed === 4 ? "A" : passed === 3 ? "B" : passed === 2 ? "C" : "D";
    return { passed, grade };
  }, [title, seoDescription, words, seoTitle]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
  };

  const handleCoverUpload = async (file: File) => {
    const invalid = validateImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    const url = await uploadBlogImage(file, "cover");
    setUploading(false);
    if (!url) {
      toast.error("Cover image upload failed");
      return;
    }
    console.log("[AdminBlogEditorPage] cover image uploaded", url);
    setCoverImage(url);
    toast.success("Cover image uploaded");
  };

  const handleContentImage = async (file: File) => {
    const invalid = validateImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    const url = await uploadBlogImage(file, "content");
    setUploading(false);
    if (!url || !editor) {
      toast.error("Image upload failed");
      return;
    }
    console.log("[AdminBlogEditorPage] content image uploaded", url);
    editor.chain().focus().setImage({ src: url }).run();
  };

  const uniqueSlug = async (base: string): Promise<string> => {
    const clean = base || "post";
    const { data } = await supabase
      .from("blog_posts")
      .select("id, slug")
      .like("slug", `${clean}%`);
    const taken = new Set(
      (data ?? []).filter((r: { id: string }) => r.id !== postId).map((r: { slug: string }) => r.slug),
    );
    if (!taken.has(clean)) return clean;
    let n = 2;
    while (taken.has(`${clean}-${n}`)) n += 1;
    return `${clean}-${n}`;
  };

  const save = async (mode: "draft" | "publish") => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const finalSlug = await uniqueSlug(slugify(slug.trim() || title));
    if (finalSlug !== slug.trim()) setSlug(finalSlug);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      slug: finalSlug,

      content: sanitizeForStorage(editor?.getHTML() ?? ""),
      excerpt: excerpt.trim(),
      category,
      tags,
      author_name: authorName.trim() || "FynHelp Team",
      reading_time_minutes: readTime,
      cover_image_url: coverImage || null,
      is_featured: isFeatured,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      og_image: ogImage || null,
      updated_at: now,
    };

    if (mode === "draft") {
      payload.status = "draft";
      payload.published_at = null;
    } else if (publishMode === "now") {
      payload.status = "published";
      payload.published_at = now;
    } else if (publishMode === "schedule") {
      if (!scheduleAt) {
        toast.error("Choose a date and time for the schedule");
        setSaving(false);
        return;
      }
      const when = new Date(scheduleAt);
      if (Number.isNaN(when.getTime())) {
        toast.error("That schedule date is not valid");
        setSaving(false);
        return;
      }
      if (when.getTime() <= Date.now()) {
        toast.error("Schedule time must be in the future");
        setSaving(false);
        return;
      }
      payload.status = "scheduled";
      payload.published_at = when.toISOString();
    } else {
      payload.status = "draft";
    }

    const { error } = postId
      ? await supabase.from("blog_posts").update(payload as never).eq("id", postId)
      : await supabase.from("blog_posts").insert({ ...payload, views: 0 } as never);

    setSaving(false);
    if (error) {
      toast.error(
        error.message.includes("blog_posts_slug_key")
          ? "A post with this URL slug already exists. Change the slug and try again."
          : error.message,
      );
      return;
    }

    setAutosaveState("saved");
    toast.success(mode === "draft" ? "Saved as draft" : "Post saved");
    if (mode === "publish") navigate("/admin/blog");
  };

  const tb = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    border: "0.5px solid " + BORDER,
    background: active ? INK : "#FFFFFF",
    color: active ? BEIGE : INK,
    cursor: "pointer",
  });

  return (
    <div style={{ fontFamily: BODY, color: INK }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/admin/content")} style={{ ...field, width: "auto", cursor: "pointer" }}>Back to posts</button>
          <span style={{ fontSize: 11, color: "rgba(23,18,8,0.55)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            {autosaveState === "saving" ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Saving
              </>
            ) : autosaveState === "saved" ? (
              <>
                <Check size={12} color="#0B7A5A" /> Autosaved
              </>
            ) : null}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => save("draft")} disabled={saving} style={{ ...field, width: "auto", cursor: "pointer", fontWeight: 700 }}>Save draft</button>
          <button onClick={() => save("publish")} disabled={saving} style={{ ...field, width: "auto", cursor: "pointer", fontWeight: 700, background: RED, color: "#FFFFFF", border: "none" }}>
            {saving ? "Saving" : "Publish"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 320 }}>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Post title"
              style={{ width: "100%", border: "none", outline: "none", fontFamily: HEADING, fontSize: 19, fontWeight: 700, color: INK, background: "transparent" }}
            />
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(23,18,8,0.45)" }}>fynhelp.com/blog/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                  triggerAutosave();
                }}
                style={{ flex: 1, border: "none", outline: "none", fontFamily: "monospace", fontSize: 11, color: INK, background: "transparent" }}
              />
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: 10, borderBottom: "0.5px solid " + BORDER, background: BEIGE }}>
              <button style={tb(!!editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={13} /></button>
              <button style={tb(!!editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={13} /></button>
              <button style={tb(!!editor?.isActive("underline"))} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={13} /></button>
              <button style={tb(!!editor?.isActive("strike"))} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={13} /></button>
              <button style={tb(!!editor?.isActive("heading", { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={13} /></button>
              <button style={tb(!!editor?.isActive("heading", { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={13} /></button>
              <button style={tb(!!editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={13} /></button>
              <button style={tb(!!editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={13} /></button>
              <button style={tb(!!editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={13} /></button>
              <button style={tb(!!editor?.isActive("codeBlock"))} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code size={13} /></button>
              <button
                style={tb(!!editor?.isActive("link"))}
                onClick={() => {
                  const url = window.prompt("Enter the link URL");
                  if (url) editor?.chain().focus().setLink({ href: url }).run();
                }}
              >
                <Link2 size={13} />
              </button>
              <button style={tb(false)} onClick={() => contentInputRef.current?.click()}><ImagePlus size={13} /></button>
              <button style={tb(false)} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={13} /></button>
              <button style={tb(false)} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={13} /></button>
              <input
                ref={contentInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleContentImage(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div style={{ minHeight: 280, padding: "14px 16px", overflowY: "auto", lineHeight: 1.85, fontFamily: BODY, fontSize: 14 }}>
              <EditorContent editor={editor} />
            </div>
            <div style={{ display: "flex", gap: 16, padding: "8px 16px", borderTop: "0.5px solid " + BORDER, fontSize: 11, color: "rgba(23,18,8,0.55)" }}>
              <span>{words} words</span>
              <span>{readTime} min read</span>
              <span>{contentText.length} characters</span>
            </div>
          </div>
        </div>

        <div style={{ width: 264, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={card}>
            <div style={{ fontFamily: HEADING, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Publish</div>
            {([
              { key: "now", label: "Publish now" },
              { key: "schedule", label: "Schedule" },
              { key: "draft", label: "Keep as draft" },
            ] as const).map((o) => (
              <label key={o.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, marginBottom: 7, cursor: "pointer" }}>
                <input type="radio" name="publishMode" checked={publishMode === o.key} onChange={() => setPublishMode(o.key)} />
                {o.label}
              </label>
            ))}
            {publishMode === "schedule" && (
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} style={{ ...field, marginTop: 4 }} />
            )}
          </div>

          <div style={card}>
            <div style={{ fontFamily: HEADING, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Post settings</div>
            <label style={labelStyle}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...field, marginBottom: 10 }}>
              {BLOG_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label style={labelStyle}>Excerpt</label>
            <textarea
              value={excerpt}
              maxLength={500}
              rows={3}
              onChange={(e) => {
                setExcerpt(e.target.value);
                triggerAutosave();
              }}
              style={{ ...field, resize: "vertical" }}
            />
            <div style={{ fontSize: 10, color: "rgba(23,18,8,0.45)", marginBottom: 10 }}>{excerpt.length} of 500 characters</div>
            <label style={labelStyle}>Author name</label>
            <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} style={{ ...field, marginBottom: 10 }} />
            <label style={labelStyle}>Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
              {tags.map((t) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: BEIGE, borderRadius: 99, padding: "2px 8px", fontSize: 11 }}>
                  {t}
                  <X size={10} style={{ cursor: "pointer" }} onClick={() => setTags((prev) => prev.filter((x) => x !== t))} />
                </span>
              ))}
            </div>
            <input
              value={tagDraft}
              placeholder="Type a tag then press Enter"
              onChange={(e) => {
                if (e.target.value.endsWith(",")) {
                  addTag(e.target.value);
                  setTagDraft("");
                } else setTagDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagDraft);
                  setTagDraft("");
                }
              }}
              style={{ ...field, marginBottom: 10 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              Featured post
            </label>
          </div>

          <div style={card}>
            <div style={{ fontFamily: HEADING, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Cover image</div>
            {coverImage && (
              <img src={coverImage} alt="Cover preview" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />
            )}
            <button onClick={() => coverInputRef.current?.click()} disabled={uploading} style={{ ...field, cursor: "pointer", fontWeight: 700, marginBottom: 8 }}>
              {uploading ? "Uploading" : "Upload image"}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCoverUpload(f);
                e.target.value = "";
              }}
            />
            <label style={labelStyle}>Or paste an image URL</label>
            <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} style={field} />
          </div>

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 99, background: BEIGE, color: GOLD, display: "grid", placeItems: "center", fontFamily: HEADING, fontSize: 16, fontWeight: 700 }}>
                {seoChecks.grade}
              </div>
              <div style={{ fontFamily: HEADING, fontSize: 14, fontWeight: 700 }}>SEO</div>
            </div>
            <label style={labelStyle}>SEO title</label>
            <input value={seoTitle} maxLength={60} onChange={(e) => setSeoTitle(e.target.value)} style={field} />
            <div style={{ fontSize: 10, color: "rgba(23,18,8,0.45)", marginBottom: 10 }}>{seoTitle.length} of 60 characters</div>
            <label style={labelStyle}>Meta description</label>
            <textarea value={seoDescription} maxLength={160} rows={3} onChange={(e) => setSeoDescription(e.target.value)} style={{ ...field, resize: "vertical" }} />
            <div style={{ fontSize: 10, color: "rgba(23,18,8,0.45)", marginBottom: 10 }}>{seoDescription.length} of 160 characters</div>
            <div style={{ border: "0.5px solid " + BORDER, borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#0B7A5A" }}>fynhelp.com/blog/{slug}</div>
              <div style={{ fontSize: 13, color: "#1A0DAB", lineHeight: 1.3 }}>{seoTitle || title || "Post title"}</div>
              <div style={{ fontSize: 11, color: "rgba(23,18,8,0.55)" }}>{seoDescription || "Meta description preview"}</div>
            </div>
            <label style={labelStyle}>Social share image URL</label>
            <input value={ogImage} onChange={(e) => setOgImage(e.target.value)} style={field} />
          </div>
        </div>
      </div>
    </div>
  );
}
