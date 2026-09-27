/**
 * Central upload allow-list. Bucket-level MIME/size limits cannot be set from
 * the app, so every upload path validates against these rules before it hits
 * storage. Keep this the single source of truth.
 */
export type BucketKey =
  | "blog-images"
  | "site-media"
  | "resources"
  | "ca-client-documents"
  | "ca-verification-documents"
  | "business-documents"
  | "financial-imports"
  | "profile-photos";

const MB = 1024 * 1024;

const IMAGES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml", "image/avif", "image/heic", "image/heif"];
const DOCS = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

export const UPLOAD_POLICY: Record<BucketKey, { maxBytes: number; mimes: string[]; exts?: string[] }> = {
  "blog-images": { maxBytes: 20 * MB, mimes: IMAGES },
  "site-media": { maxBytes: 50 * MB, mimes: [...IMAGES, ...VIDEO, "application/pdf"] },
  resources: { maxBytes: 500 * MB, mimes: [...IMAGES, ...DOCS, ...VIDEO, "application/zip"] },
  "ca-client-documents": {
    maxBytes: 25 * MB,
    mimes: [
      "application/pdf", "text/csv", "application/vnd.ms-excel", "text/xml", "application/xml",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png", "image/jpeg", "image/jpg", "image/webp",
    ],
    exts: ["pdf", "csv", "xml", "xlsx", "png", "jpg", "jpeg", "webp"],
  },
  "ca-verification-documents": { maxBytes: 50 * MB, mimes: [...DOCS, ...IMAGES] },
  "business-documents": { maxBytes: 50 * MB, mimes: [...DOCS, ...IMAGES] },
  "financial-imports": { maxBytes: 20 * MB, mimes: [...DOCS, ...IMAGES, "application/json", "text/xml", "application/xml", "text/plain"] },
  "profile-photos": { maxBytes: 5 * MB, mimes: IMAGES },
};

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${Math.round(bytes / MB)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

/** Returns an error message, or null when the file is acceptable. */
export function validateUpload(bucket: BucketKey, file: File): string | null {
  const policy = UPLOAD_POLICY[bucket];
  if (!policy) return "Unknown upload destination.";
  if (file.size > policy.maxBytes) {
    return `File is too large. Maximum size is ${formatBytes(policy.maxBytes)}.`;
  }
  const type = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const exts = (policy as { exts?: string[] }).exts;
  if (exts) {
    // Extension must always be on the allow-list; MIME must match when the browser supplies one.
    if (!exts.includes(ext)) return "That file type isn't allowed here.";
    if (type && !policy.mimes.includes(type)) return "That file type isn't allowed here.";
    return null;
  }
  if (!type || !policy.mimes.includes(type)) {
    return "That file type isn't allowed here.";
  }
  return null;
}

/** `accept` attribute string for an <input type="file"> on a given bucket. */
export function acceptFor(bucket: BucketKey): string {
  return UPLOAD_POLICY[bucket].mimes.join(",");
}
