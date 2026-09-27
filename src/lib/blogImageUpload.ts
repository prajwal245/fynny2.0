import { supabase } from "@/integrations/supabase/client";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Every image format we accept in blog uploads. */
export const IMAGE_ACCEPT =
  "image/*,.jpg,.jpeg,.png,.gif,.webp,.avif,.svg,.bmp,.tif,.tiff,.ico,.heic,.heif,.jfif,.apng";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

const EXT_FALLBACK: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jfif: "image/jpeg",
  avif: "image/avif",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
  bmp: "image/bmp",
  apng: "image/apng",
};

function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** Returns an error message when the file cannot be uploaded, otherwise null. */
export function validateImageFile(file: File): string | null {
  const ext = extOf(file.name);
  const looksLikeImage = file.type.startsWith("image/") || ext in EXT_FALLBACK;
  if (!looksLikeImage) return "That file is not an image. Pick a JPG, PNG, GIF, WebP, AVIF, SVG, HEIC, TIFF or BMP file.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is larger than 20 MB. Please compress it and try again.";
  return null;
}

export async function uploadBlogImage(
  file: File,
  folder: "cover" | "content",
): Promise<string | null> {
  const ext = extOf(file.name) || "jpg";
  const contentType = file.type || EXT_FALLBACK[ext] || "application/octet-stream";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("blog-images")
    .upload(path, file, { upsert: false, contentType });
  if (error) return null;

  const { data: signed } = await supabase.storage
    .from("blog-images")
    .createSignedUrl(path, YEAR_SECONDS);
  if (signed?.signedUrl) return signed.signedUrl;

  const { data } = supabase.storage.from("blog-images").getPublicUrl(path);
  return data.publicUrl;
}
