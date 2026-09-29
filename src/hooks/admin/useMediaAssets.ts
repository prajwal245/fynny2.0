import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import imageCompression from "browser-image-compression";

const BUCKET = "site-media";
const TABLE = "media_assets" as never; // table may not be in generated types yet

export interface MediaAsset {
  id: string;
  file_name: string;
  file_path: string;
  public_url: string;
  folder: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  file_hash: string | null;
  version: number;
  used_in: string[] | null;
  alt_text: string | null;
  created_at: string;
  updated_at: string;
}

const SIGNED_TTL = 60 * 60 * 24 * 365; // 1 year

export async function signMediaUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? "";
}

async function withSignedUrls(rows: MediaAsset[]): Promise<MediaAsset[]> {
  if (!rows.length) return rows;
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.file_path), SIGNED_TTL);
  const map = new Map<string, string>();
  (data ?? []).forEach((d: any) => { if (d?.path && d?.signedUrl) map.set(d.path, d.signedUrl); });
  return rows.map((r) => ({ ...r, public_url: map.get(r.file_path) ?? r.public_url }));
}

export const useMediaAssets = (folder?: string) => {
  return useQuery({
    queryKey: ["media_assets", folder ?? "all"],
    queryFn: async () => {
      try {
        let q = (supabase.from(TABLE) as any).select("*").order("created_at", { ascending: false });
        if (folder && folder !== "all") q = q.eq("folder", folder);
        const { data, error } = await q;
        if (error) {
          console.error("media_assets query failed:", error.message);
          return { rows: [] as MediaAsset[], backendReady: false };
        }
        const rows = await withSignedUrls((data ?? []) as MediaAsset[]);
        return { rows, backendReady: true };
      } catch (e) {
        console.error("media_assets query threw:", e);
        return { rows: [] as MediaAsset[], backendReady: false };
      }
    },
    staleTime: 30_000,
  });
};


async function sha256(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function compressIfImage(file: File | Blob, fileName: string): Promise<Blob> {
  const isSvg = fileName.toLowerCase().endsWith(".svg") || (file as File).type === "image/svg+xml";
  if (isSvg) return file;
  try {
    const compressed = await imageCompression(file as File, {
      maxWidthOrHeight: 1920,
      initialQuality: 0.82,
      fileType: "image/webp",
      useWebWorker: true,
    });
    return compressed;
  } catch {
    return file;
  }
}

export interface UploadInput {
  file: File;
  folder: string;
  altText?: string;
  tags?: string[];
  forceUpload?: boolean;
}

export interface UploadResult {
  duplicate?: boolean;
  existing?: MediaAsset;
  row?: MediaAsset;
}

export const useUploadMedia = () => {
  const qc = useQueryClient();
  return useMutation<UploadResult, Error, UploadInput>({
    mutationFn: async ({ file, folder, altText, tags, forceUpload }) => {
      const hash = await sha256(file);

      if (!forceUpload) {
        const { data: existing } = await (supabase.from(TABLE) as any)
          .select("*").eq("file_hash", hash).maybeSingle();
        if (existing) return { duplicate: true, existing: existing as MediaAsset };
      }

      const isSvg = file.name.toLowerCase().endsWith(".svg");
      const processed = await compressIfImage(file, file.name);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const finalName = isSvg ? file.name : `${baseName}.webp`;
      const path = `${folder}/${Date.now()}-${finalName}`;
      const dims = await getDimensions(processed);

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, processed, {
        cacheControl: "3600",
        upsert: false,
        contentType: isSvg ? "image/svg+xml" : "image/webp",
      });
      if (upErr) throw new Error(upErr.message);

      const publicUrl = await signMediaUrl(path);


      const { data: row, error: insErr } = await (supabase.from(TABLE) as any).insert({
        file_name: finalName,
        file_path: path,
        public_url: publicUrl,
        folder,
        size_bytes: processed.size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        mime_type: isSvg ? "image/svg+xml" : "image/webp",
        file_hash: hash,
        version: 1,
        alt_text: altText ?? null,
        used_in: tags && tags.length ? tags : [],
      }).select().single();
      if (insErr) throw new Error(insErr.message);
      return { row: row as MediaAsset };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media_assets"] }),
  });
};

export const useReplaceMedia = () => {
  const qc = useQueryClient();
  return useMutation<MediaAsset, Error, { asset: MediaAsset; file: File | Blob; fileName?: string }>({
    mutationFn: async ({ asset, file, fileName }) => {
      const name = fileName ?? (file as File).name ?? asset.file_name;
      const processed = await compressIfImage(file, name);
      const dims = await getDimensions(processed);
      const isSvg = name.toLowerCase().endsWith(".svg");

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(asset.file_path, processed, {
        upsert: true,
        contentType: isSvg ? "image/svg+xml" : "image/webp",
        cacheControl: "3600",
      });
      if (upErr) throw new Error(upErr.message);

      const publicUrl = await signMediaUrl(asset.file_path);

      const newHash = await sha256(processed);

      const { data: row, error } = await (supabase.from(TABLE) as any)
        .update({
          version: (asset.version ?? 1) + 1,
          public_url: publicUrl,
          size_bytes: processed.size,
          width: dims?.width ?? asset.width,
          height: dims?.height ?? asset.height,
          file_hash: newHash,
          updated_at: new Date().toISOString(),
        })
        .eq("id", asset.id).select().single();
      if (error) throw new Error(error.message);
      return row as MediaAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media_assets"] }),
  });
};

export const useDeleteMedia = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, MediaAsset>({
    mutationFn: async (asset) => {
      await supabase.storage.from(BUCKET).remove([asset.file_path]);
      const { error } = await (supabase.from(TABLE) as any).delete().eq("id", asset.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media_assets"] }),
  });
};

export const useBulkDeleteMedia = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, MediaAsset[]>({
    mutationFn: async (assets) => {
      if (!assets.length) return;
      await supabase.storage.from(BUCKET).remove(assets.map((a) => a.file_path));
      const ids = assets.map((a) => a.id);
      const { error } = await (supabase.from(TABLE) as any).delete().in("id", ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media_assets"] }),
  });
};
