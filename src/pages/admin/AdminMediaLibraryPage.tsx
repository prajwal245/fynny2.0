import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Image as ImageIcon, Upload, Search as SearchIcon, CheckSquare, Square as SquareIcon,
  RefreshCw, Copy, Pencil, Trash2, X, RotateCw, AlertTriangle, UploadCloud,
} from "lucide-react";
import Cropper from "react-easy-crop";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useMediaAssets, useUploadMedia, useReplaceMedia, useDeleteMedia,
  useBulkDeleteMedia, type MediaAsset,
} from "@/hooks/admin/useMediaAssets";

const RED = "#A93838";
const BORDER = "#E0D9C8";
const FOLDERS = ["landing", "blog", "dashboard", "uploads"] as const;
const ACCEPTED = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
const MAX_BYTES = 5 * 1024 * 1024;

const formatBytes = (n: number | null) => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default function AdminMediaLibraryPage() {
  const [folder, setFolder] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<MediaAsset | null>(null);
  const [editTarget, setEditTarget] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const { data, isLoading } = useMediaAssets(folder);
  const rows = data?.rows ?? [];
  const backendReady = data?.backendReady !== false;

  const filtered = useMemo(
    () => rows.filter((r) => r.file_name.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  const deleteOne = useDeleteMedia();
  const bulkDelete = useBulkDeleteMedia();

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedRows = filtered.filter((r) => selected.has(r.id));

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("URL copied — paste anywhere on the site");
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold" style={{ color: "#171208" }}>Media Library</h1>
        <p className="text-[13px] mt-1" style={{ color: "rgba(23,18,8,0.6)" }}>
          Upload, replace, and manage images used across FynHelp
        </p>
      </div>

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="w-[160px] h-9 bg-white" style={{ borderColor: BORDER }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All folders</SelectItem>
            {FOLDERS.map((f) => (
              <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(23,18,8,0.4)" }} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filename…"
            className="h-9 pl-9 bg-white"
            style={{ borderColor: BORDER }}
          />
        </div>

        <button
          onClick={() => { setMultiSelect((m) => !m); setSelected(new Set()); }}
          className="h-9 px-3 rounded-md border bg-white inline-flex items-center gap-2 text-[13px]"
          style={{ borderColor: multiSelect ? RED : BORDER, color: multiSelect ? RED : "#171208" }}
        >
          {multiSelect ? <CheckSquare size={14} /> : <SquareIcon size={14} />}
          Multi-select
        </button>

        {multiSelect && selectedRows.length > 0 && (
          <Button
            onClick={() => setBulkConfirm(true)}
            className="h-9 text-white"
            style={{ background: RED }}
          >
            <Trash2 size={14} /> Delete Selected ({selectedRows.length})
          </Button>
        )}

        <div className="ml-auto">
          <Button onClick={() => setUploadOpen(true)} className="h-9 text-white" style={{ background: RED }}>
            <Upload size={14} /> Upload New Image
          </Button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-white p-3" style={{ borderColor: BORDER }}>
              <div className="aspect-square rounded-md animate-pulse" style={{ background: "rgba(23,18,8,0.08)" }} />
              <div className="h-3 mt-2 rounded animate-pulse" style={{ background: "rgba(23,18,8,0.08)" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg bg-white p-12 text-center" style={{ borderColor: BORDER }}>
          <ImageIcon size={32} className="mx-auto mb-3" style={{ color: "rgba(23,18,8,0.3)" }} />
          <p className="text-[14px] font-medium" style={{ color: "#171208" }}>
            {backendReady ? "No images yet. Upload your first image to get started." : "Media library is being set up — check back shortly"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {filtered.map((asset, idx) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              index={idx}
              multiSelect={multiSelect}
              selected={selected.has(asset.id)}
              onToggleSelect={() => toggleSelect(asset.id)}
              onReplace={() => setReplaceTarget(asset)}
              onEdit={() => setEditTarget(asset)}
              onDelete={() => setDeleteTarget(asset)}
              onCopy={() => copyUrl(asset.public_url)}
            />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadModal mode="upload" onClose={() => setUploadOpen(false)} />
      )}
      {replaceTarget && (
        <UploadModal mode="replace" asset={replaceTarget} onClose={() => setReplaceTarget(null)} />
      )}
      {editTarget && (
        <EditModal asset={editTarget} onClose={() => setEditTarget(null)} />
      )}

      {/* Single delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.used_in?.length ? "Delete image with active references?" : "Delete this image?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.used_in?.length
                ? `This image is tagged as used in: ${deleteTarget.used_in.join(", ")}. Deleting will break those references.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-white"
              style={{ background: RED }}
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteOne.mutateAsync(deleteTarget);
                  toast.success("Image deleted");
                } catch (e: any) {
                  toast.error(e?.message ?? "Could not delete");
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedRows.length} images?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRows.some((r) => r.used_in?.length)
                ? "Some of these images are referenced in pages. Deleting will break those references."
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-white"
              style={{ background: RED }}
              onClick={async () => {
                try {
                  await bulkDelete.mutateAsync(selectedRows);
                  toast.success(`${selectedRows.length} images deleted`);
                  setSelected(new Set());
                } catch (e: any) {
                  toast.error(e?.message ?? "Could not delete");
                }
                setBulkConfirm(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============== Card ============== */
function MediaCard({
  asset, index, multiSelect, selected, onToggleSelect,
  onReplace, onEdit, onDelete, onCopy,
}: {
  asset: MediaAsset; index: number; multiSelect: boolean; selected: boolean;
  onToggleSelect: () => void; onReplace: () => void; onEdit: () => void;
  onDelete: () => void; onCopy: () => void;
}) {
  const tags = asset.used_in ?? [];
  return (
    <div
      className="group relative rounded-lg border bg-white overflow-hidden animate-fade-in"
      style={{ borderColor: selected ? RED : BORDER, animationDelay: `${Math.min(index * 30, 400)}ms` }}
    >
      <div className="relative aspect-square overflow-hidden" style={{ background: "rgba(23,18,8,0.04)" }}>
        <img src={asset.public_url} alt={asset.alt_text ?? asset.file_name} className="w-full h-full object-cover" loading="lazy" />

        {/* Folder badge */}
        <span
          className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
          style={{ background: "rgba(255,255,255,0.92)", color: "#171208" }}
        >
          {asset.folder}
        </span>

        {asset.version > 1 && (
          <span
            className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold text-white"
            style={{ background: RED }}
          >
            v{asset.version}
          </span>
        )}

        {multiSelect && (
          <button
            onClick={onToggleSelect}
            className="absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center"
            style={{ background: selected ? RED : "rgba(255,255,255,0.92)", color: selected ? "#fff" : "#171208" }}
          >
            {selected ? <CheckSquare size={14} /> : <SquareIcon size={14} />}
          </button>
        )}

        {/* Hover overlay */}
        {!multiSelect && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
            style={{ background: "rgba(23,18,8,0.55)" }}
          >
            <IconBtn label="Replace" onClick={onReplace}><RefreshCw size={14} /></IconBtn>
            <IconBtn label="Copy URL" onClick={onCopy}><Copy size={14} /></IconBtn>
            <IconBtn label="Edit" onClick={onEdit}><Pencil size={14} /></IconBtn>
          </div>
        )}

        {/* Bottom-right delete */}
        {!multiSelect && (
          <button
            onClick={onDelete}
            aria-label="Delete"
            className="absolute bottom-2 right-2 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.92)", color: "#171208" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = RED; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.92)"; e.currentTarget.style.color = "#171208"; }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-[11px] font-medium truncate" style={{ color: "#171208" }} title={asset.file_name}>
          {asset.file_name}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "rgba(23,18,8,0.5)" }}>
          {formatBytes(asset.size_bytes)}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(139,105,20,0.12)", color: "#8B6914" }}>
                {t}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.6)" }}>
                +{tags.length - 2} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-md flex items-center justify-center transition-colors"
      style={{ background: "rgba(255,255,255,0.95)", color: "#171208" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.95)"; }}
    >
      {children}
    </button>
  );
}

/* ============== Upload / Replace Modal ============== */
function UploadModal({
  mode, asset, onClose,
}: {
  mode: "upload" | "replace";
  asset?: MediaAsset;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState<string>(asset?.folder ?? "landing");
  const [altText, setAltText] = useState(asset?.alt_text ?? "");
  const [tagsRaw, setTagsRaw] = useState((asset?.used_in ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<MediaAsset | null>(null);
  const upload = useUploadMedia();
  const replace = useReplaceMedia();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setDuplicate(null);
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError("File type not supported. Use PNG, JPG, SVG, or WEBP.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File exceeds 5 MB.");
      return;
    }
    setFile(f);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : asset?.public_url ?? null), [file, asset]);

  const submit = async (force = false) => {
    if (!file) return;
    try {
      if (mode === "replace" && asset) {
        await replace.mutateAsync({ asset, file, fileName: file.name });
        toast.success("Image replaced — new version is now live");
        onClose();
      } else {
        const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
        const res = await upload.mutateAsync({ file, folder, altText, tags, forceUpload: force });
        if (res.duplicate && res.existing) {
          setDuplicate(res.existing);
          return;
        }
        toast.success("Image uploaded");
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  };

  const busy = upload.isPending || replace.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "replace" ? `Replace ${asset?.file_name}` : "Upload new image"}
          </DialogTitle>
        </DialogHeader>

        {mode === "replace" && asset?.used_in?.length ? (
          <div className="rounded-md p-3 text-[12px] flex gap-2" style={{ background: "rgba(139,105,20,0.08)", color: "#8B6914" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              This will update the image used in: <strong>{asset.used_in.join(", ")}</strong>. The change will appear everywhere this image is referenced.
            </span>
          </div>
        ) : null}

        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
          style={{ borderColor: BORDER, background: "rgba(23,18,8,0.02)" }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded" />
          ) : (
            <div>
              <UploadCloud size={28} className="mx-auto mb-2" style={{ color: "rgba(23,18,8,0.5)" }} />
              <p className="text-[13px] font-medium" style={{ color: "#171208" }}>Drag & drop, or click to browse</p>
              <p className="text-[11px] mt-1" style={{ color: "rgba(23,18,8,0.55)" }}>PNG, JPG, SVG, WEBP · up to 5 MB</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {error && <p className="text-[12px]" style={{ color: RED }}>{error}</p>}

        {duplicate && (
          <div className="rounded-md p-3 text-[12px]" style={{ background: "rgba(169,56,56,0.06)", color: "#171208" }}>
            <p className="mb-2">This image already exists as <strong>{duplicate.file_name}</strong>.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { toast.success("Using existing image"); onClose(); }}>
                Use existing
              </Button>
              <Button size="sm" className="text-white" style={{ background: RED }} onClick={() => submit(true)}>
                Upload anyway
              </Button>
            </div>
          </div>
        )}

        {mode === "upload" && (
          <>
            <div>
              <Label className="text-[12px]">Folder</Label>
              <Select value={folder} onValueChange={setFolder}>
                <SelectTrigger className="h-9 mt-1" style={{ borderColor: BORDER }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLDERS.map((f) => (
                    <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Alt text</Label>
              <Input
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe this image for accessibility"
                className="h-9 mt-1"
                style={{ borderColor: BORDER }}
              />
            </div>
            <div>
              <Label className="text-[12px]">Tags (optional)</Label>
              <Input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="e.g. homepage-hero, blog-cover-3"
                className="h-9 mt-1"
                style={{ borderColor: BORDER }}
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            onClick={() => submit(false)}
            disabled={!file || busy}
            className="w-full text-white"
            style={{ background: RED }}
          >
            {busy ? "Uploading..." : mode === "replace" ? "Replace" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Edit (crop) Modal ============== */
function EditModal({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedArea, setCroppedArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const replace = useReplaceMedia();

  const save = async () => {
    if (!croppedArea) return;
    try {
      const blob = await getCroppedBlob(asset.public_url, croppedArea, rotation);
      await replace.mutateAsync({ asset, file: blob, fileName: asset.file_name });
      toast.success("Image updated");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {asset.file_name}</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-[360px] rounded-md overflow-hidden" style={{ background: "#000" }}>
          <Cropper
            image={asset.public_url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_a, b) => setCroppedArea(b)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] mr-1" style={{ color: "rgba(23,18,8,0.6)" }}>Aspect:</span>
          {[
            { label: "Free", v: undefined },
            { label: "1:1", v: 1 },
            { label: "16:9", v: 16 / 9 },
            { label: "4:3", v: 4 / 3 },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => setAspect(a.v)}
              className="text-[12px] px-2.5 py-1 rounded border"
              style={{
                background: aspect === a.v ? RED : "transparent",
                color: aspect === a.v ? "#fff" : "#171208",
                borderColor: aspect === a.v ? RED : BORDER,
              }}
            >
              {a.label}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw size={14} /> Rotate
          </Button>
        </div>
        <div>
          <Label className="text-[12px]">Zoom</Label>
          <Slider value={[zoom]} min={1} max={4} step={0.1} onValueChange={(v) => setZoom(v[0])} className="mt-2" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={replace.isPending} className="text-white" style={{ background: RED }}>
            {replace.isPending ? "Saving..." : "Save as new version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function getCroppedBlob(
  src: string,
  area: { x: number; y: number; width: number; height: number },
  rotation: number
): Promise<Blob> {
  const img = await loadImage(src);
  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const bBoxW = img.width * cos + img.height * sin;
  const bBoxH = img.width * sin + img.height * cos;

  const canvas = document.createElement("canvas");
  canvas.width = bBoxW;
  canvas.height = bBoxH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(bBoxW / 2, bBoxH / 2);
  ctx.rotate(radians);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  const data = ctx.getImageData(area.x, area.y, area.width, area.height);
  canvas.width = area.width;
  canvas.height = area.height;
  ctx.putImageData(data, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop failed"))), "image/webp", 0.9);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
