import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import DashboardLayout from "@/components/DashboardLayout";
import {
  FynPage,
  FynPageTitle,
  FynCard,
  FynCardTitle,
  FynButton,
  FynInput,
  FynTextarea,
  FynSelect,
  FynField,
  FynBadge,
  FynLoading,
  FynEmpty,
} from "@/components/dashboard/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type ResourceRow = {
  id: string;
  title: string;
  description: string;
  format: string;
  icon_url: string | null;
  file_url: string | null;
  file_path: string | null;
  icon_path: string | null;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
};

const FORMATS = ["Excel", "PDF", "Word", "PPT", "CSV", "Other"];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export default function AdminResourcesPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ResourceRow>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Admin gate
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user, authLoading]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ResourceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const startEdit = (row: ResourceRow) => {
    setEditingId(row.id);
    setDraft(row);
  };

  const startNew = () => {
    setEditingId("__new");
    setDraft({
      id: "",
      title: "",
      description: "",
      format: "Excel",
      sort_order: (rows[rows.length - 1]?.sort_order ?? 0) + 10,
      is_published: true,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };

  const saveDraft = async () => {
    if (!draft.title?.trim()) return toast.error("Title is required");
    const id = (draft.id?.trim() || slugify(draft.title)).toLowerCase();
    if (!id) return toast.error("ID is required");

    const payload = {
      id,
      title: draft.title!.trim(),
      description: draft.description ?? "",
      format: draft.format ?? "Excel",
      sort_order: Number(draft.sort_order ?? 0),
      is_published: draft.is_published ?? true,
      icon_url: draft.icon_url ?? null,
      file_url: draft.file_url ?? null,
      file_path: draft.file_path ?? null,
      icon_path: draft.icon_path ?? null,
    };

    const { error } =
      editingId === "__new"
        ? await supabase.from("resources").insert(payload)
        : await supabase.from("resources").update(payload).eq("id", editingId!);

    if (error) return toast.error(error.message);
    toast.success("Saved");
    cancelEdit();
    load();
  };

  const removeRow = async (row: ResourceRow) => {
    if (!confirm(`Delete "${row.title}"? Stored files will remain in storage.`)) return;
    const { error } = await supabase.from("resources").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const uploadAsset = async (
    row: ResourceRow,
    file: File,
    kind: "file" | "icon",
  ) => {
    setBusyId(row.id);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${kind === "icon" ? "icons" : "files"}/${row.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("resources")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("resources").getPublicUrl(path);
      const url = pub.publicUrl;

      // Best-effort: remove the previous asset if it lived in our bucket
      const oldPath = kind === "icon" ? row.icon_path : row.file_path;
      if (oldPath && oldPath !== path) {
        await supabase.storage.from("resources").remove([oldPath]).catch(() => {});
      }

      const patch =
        kind === "icon"
          ? { icon_url: url, icon_path: path }
          : { file_url: url, file_path: path };
      const { error: updErr } = await supabase
        .from("resources")
        .update(patch)
        .eq("id", row.id);
      if (updErr) throw updErr;

      toast.success(kind === "icon" ? "Icon updated" : "File replaced");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <DashboardLayout>
        <FynPage>
          <FynLoading rows={4} />
        </FynPage>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <FynPage>
          <FynPageTitle sub="Admin role required.">Admin · Resources</FynPageTitle>
          <FynCard>
            <p className="text-fyn-body text-fyn-ink-60 mb-fyn-md">
              You don’t have access to this page. Sign in with an admin account.
            </p>
            <FynButton onClick={() => navigate("/dashboard/cockpit")}>Back to dashboard</FynButton>
          </FynCard>
        </FynPage>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FynPage>
        <div className="flex items-center justify-between gap-fyn-md">
          <FynPageTitle sub="Manage downloadable templates shown on the public Resources page.">
            Admin · Resources
          </FynPageTitle>
          <FynButton onClick={startNew}>+ New resource</FynButton>
        </div>

        {editingId && (
          <FynCard>
            <FynCardTitle>{editingId === "__new" ? "New resource" : "Edit resource"}</FynCardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-fyn-md mt-fyn-md">
              <FynField label="ID (slug)" hint="Stable identifier used in download URLs. Lowercase, hyphenated.">
                <FynInput
                  value={draft.id ?? ""}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  placeholder="auto from title"
                  disabled={editingId !== "__new"}
                />
              </FynField>
              <FynField label="Title">
                <FynInput
                  value={draft.title ?? ""}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </FynField>
              <FynField label="Format">
                <FynSelect
                  value={draft.format ?? "Excel"}
                  onChange={(e) => setDraft({ ...draft, format: e.target.value })}
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </FynSelect>
              </FynField>
              <FynField label="Sort order">
                <FynInput
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                />
              </FynField>
              <div className="md:col-span-2">
                <FynField label="Description">
                  <FynTextarea
                    rows={3}
                    value={draft.description ?? ""}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </FynField>
              </div>
              <label className="flex items-center gap-2 text-fyn-body text-fyn-ink">
                <input
                  type="checkbox"
                  checked={draft.is_published ?? true}
                  onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                />
                Published (visible on public page)
              </label>
            </div>
            <div className="flex gap-fyn-sm mt-fyn-lg">
              <FynButton onClick={saveDraft}>Save</FynButton>
              <FynButton variant="secondary" onClick={cancelEdit}>Cancel</FynButton>
            </div>
          </FynCard>
        )}

        {loading ? (
          <FynLoading rows={4} />
        ) : rows.length === 0 ? (
          <FynEmpty title="No resources yet" description="Create your first downloadable template." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-md">
            {rows.map((row) => (
              <FynCard key={row.id}>
                <div className="flex items-start gap-fyn-md">
                  <div className="w-16 h-16 rounded bg-fyn-beige-dark flex items-center justify-center shrink-0">
                    {row.icon_url ? (
                      <img src={row.icon_url} alt="" className="w-12 h-12" />
                    ) : (
                      <span className="text-fyn-ink-40 text-fyn-tiny">no icon</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif text-fyn-h3 text-fyn-ink truncate">{row.title}</h3>
                      <FynBadge tone={row.is_published ? "success" : "neutral"}>
                        {row.is_published ? "Published" : "Draft"}
                      </FynBadge>
                      <FynBadge tone="neutral">{row.format}</FynBadge>
                    </div>
                    <p className="text-fyn-small text-fyn-ink-60 mt-1">id: {row.id} · order {row.sort_order}</p>
                    <p className="text-fyn-small text-fyn-ink-60 mt-2 line-clamp-2">{row.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-fyn-sm mt-fyn-md">
                  <UploadButton
                    label={row.file_url ? "Replace file" : "Upload file"}
                    accept=".xlsx,.xls,.pdf,.doc,.docx,.ppt,.pptx,.csv,.zip"
                    disabled={busyId === row.id}
                    onFile={(f) => uploadAsset(row, f, "file")}
                  />
                  <UploadButton
                    label={row.icon_url ? "Replace icon" : "Upload icon"}
                    accept="image/svg+xml,image/png,image/jpeg,image/webp"
                    disabled={busyId === row.id}
                    onFile={(f) => uploadAsset(row, f, "icon")}
                  />
                </div>

                <div className="flex flex-wrap gap-fyn-sm mt-fyn-md">
                  <FynButton variant="secondary" onClick={() => startEdit(row)}>Edit</FynButton>
                  {row.file_url && (
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fyn-small text-fyn-ink-60 underline self-center"
                    >
                      Open file
                    </a>
                  )}
                  <button
                    onClick={() => removeRow(row)}
                    className="ml-auto text-fyn-small text-fyn-red hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </FynCard>
            ))}
          </div>
        )}
      </FynPage>
    </DashboardLayout>
  );
}

function UploadButton({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  const id = useMemo(() => `up-${Math.random().toString(36).slice(2)}`, []);
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center justify-center px-4 py-2 rounded-md border border-fyn-ink-10 bg-fyn-beige-card text-fyn-small text-fyn-ink cursor-pointer hover:bg-fyn-beige-dark transition-colors ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {label}
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
