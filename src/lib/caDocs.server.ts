/**
 * Server-only helpers for document safety scanning, response auto-classification
 * and printable report generation.
 *
 * Everything here runs with the service-role client, so every entry point must
 * first prove the caller belongs to the firm it names.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_DOC_BYTES = 52_428_800;

export const MIME_ALLOWLIST = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/xml",
  "text/xml",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const DANGEROUS_TAIL =
  /\.(pdf|csv|xml|xls|xlsx|jpg|jpeg|png|txt|doc|docx)\.(exe|bat|cmd|com|js|jse|vbs|vbe|sh|ps1|scr|msi|jar|apk|dll|php|py)$/i;

export interface ScanVerdict {
  status: "clean" | "infected";
  reason: string;
}

export function scanVerdict(input: {
  file_size_bytes: number | null;
  mime_type: string | null;
  original_filename: string | null;
}): ScanVerdict {
  const size = Number(input.file_size_bytes ?? 0);
  if (size > MAX_DOC_BYTES) {
    return { status: "infected", reason: "File is larger than the 50 MB safety limit" };
  }
  const mime = String(input.mime_type ?? "").toLowerCase().split(";")[0].trim();
  if (!MIME_ALLOWLIST.includes(mime)) {
    return { status: "infected", reason: "File type is not on the allowed list" };
  }
  const name = String(input.original_filename ?? "");
  if (DANGEROUS_TAIL.test(name)) {
    return { status: "infected", reason: "Filename uses a disguised double extension" };
  }
  return { status: "clean", reason: "Passed all safety checks" };
}

/**
 * Third scan layer, after MIME type, file size and extension checks.
 * Set VIRUSTOTAL_API_KEY in Lovable project secrets to enable deep file
 * scanning. Without it, MIME type, file size, and extension checks still run.
 * Never blocks an upload because the service is unavailable — an upload is only
 * rejected when VirusTotal explicitly reports malicious or suspicious hits.
 */
export async function scanWithVirusTotal(
  fileBuffer: ArrayBuffer,
  filename: string,
): Promise<{ safe: boolean; reason: string }> {
  const apiKey = process.env["VIRUSTOTAL_API_KEY"] ?? "";
  if (!apiKey) {
    return {
      safe: true,
      reason:
        "Basic checks passed. Set VIRUSTOTAL_API_KEY in Lovable secrets to enable deep scan.",
    };
  }
  try {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append("file", blob, filename);
    const uploadRes = await fetch("https://www.virustotal.com/api/v3/files", {
      method: "POST",
      headers: { "x-apikey": apiKey },
      body: formData,
    });
    if (!uploadRes.ok) return { safe: true, reason: "VirusTotal unavailable — basic checks passed." };
    const uploadData = (await uploadRes.json()) as { data?: { id?: string } };
    const analysisId = uploadData?.data?.id;
    if (!analysisId) return { safe: true, reason: "VirusTotal unavailable — basic checks passed." };

    await new Promise((r) => setTimeout(r, 4000));

    const resultRes = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!resultRes.ok) return { safe: true, reason: "VirusTotal unavailable — basic checks passed." };
    const resultData = (await resultRes.json()) as {
      data?: { attributes?: { stats?: { malicious?: number; suspicious?: number } } };
    };
    const stats = resultData?.data?.attributes?.stats;
    const malicious = (stats?.malicious ?? 0) + (stats?.suspicious ?? 0);
    if (malicious > 0) {
      return { safe: false, reason: `VirusTotal flagged by ${malicious} scanners` };
    }
    return { safe: true, reason: "VirusTotal scan clean" };
  } catch {
    return { safe: true, reason: "VirusTotal unavailable — basic checks passed." };
  }
}

/** Resolve the caller's CA firm from membership, falling back to firm ownership. */
export async function resolveCaFirmId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: member } = await admin
    .from("ca_firm_members")
    .select("ca_firm_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (member?.ca_firm_id) return member.ca_firm_id as string;
  const { data: owned } = await admin
    .from("ca_firms")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (owned?.id as string) ?? null;
}

/* ------------------------------------------------------------------ */
/* Printable report HTML                                               */
/* ------------------------------------------------------------------ */

const INK = "#1A1008";
const CREAM = "#F4EDDA";
const RED = "#B8333A";

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const inr = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "");
  return `Rs ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const looksLikeAmount = (k: string) =>
  /(amount|total|revenue|expense|income|value|balance|tax|gst|net|cash|profit|loss|due|paid)/i.test(k);

function titleCase(k: string) {
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "<span class='muted'>Not available</span>";
  if (typeof value === "number") return looksLikeAmount(key) ? esc(inr(value)) : esc(String(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "<span class='muted'>None</span>";
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return value.map((v) => esc(String(v))).join(", ");
    }
    return value.map((v) => renderSection("", v)).join("");
  }
  if (typeof value === "object") return renderSection("", value);
  return esc(String(value));
}

function renderSection(title: string, obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") {
    return `<p>${esc(String(obj))}</p>`;
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length) return "";
  const rows = entries
    .map(([k, v]) => {
      const isScalar = v === null || typeof v !== "object";
      if (isScalar) {
        return `<tr><th>${esc(titleCase(k))}</th><td class="num">${renderValue(k, v)}</td></tr>`;
      }
      return `<tr><th colspan="2" class="sub">${esc(titleCase(k))}</th></tr><tr><td colspan="2">${renderValue(k, v)}</td></tr>`;
    })
    .join("");
  return `${title ? `<h2>${esc(title)}</h2>` : ""}<table class="kv">${rows}</table>`;
}

export interface PrintDoc {
  firmName: string;
  clientName: string;
  heading: string;
  subheading: string;
  period: string;
  generatedAt: string;
  body: unknown;
  bodyText?: string | null;
}

export function buildPrintableHtml(doc: PrintDoc): string {
  const content = doc.bodyText
    ? `<pre class="plain">${esc(doc.bodyText)}</pre>`
    : renderSection("", doc.body) || "<p class='muted'>This report has no stored content.</p>";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(doc.heading)}</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: ${INK}; background: #fff; margin: 0; }
  .sheet { max-width: 800px; margin: 0 auto; padding: 28px 24px 60px; }
  .head { background: ${CREAM}; border-left: 4px solid ${RED}; padding: 18px 20px; border-radius: 8px; }
  .brand { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: ${RED}; font-family: Arial, Helvetica, sans-serif; }
  .firm { font-size: 22px; font-weight: 700; margin-top: 4px; }
  h1 { font-size: 19px; margin: 22px 0 2px; }
  .meta { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: rgba(26,16,8,.62); margin-top: 6px; }
  .meta span { margin-right: 18px; }
  h2 { font-size: 14px; margin: 22px 0 8px; border-bottom: 1px solid rgba(26,16,8,.16); padding-bottom: 5px; }
  table.kv { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.kv th { text-align: left; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 600;
    padding: 7px 8px; border-bottom: 1px solid rgba(26,16,8,.10); vertical-align: top; width: 55%; }
  table.kv th.sub { background: ${CREAM}; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; width: auto; }
  table.kv td { padding: 7px 8px; border-bottom: 1px solid rgba(26,16,8,.10); font-size: 13px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: rgba(26,16,8,.45); }
  pre.plain { white-space: pre-wrap; font-family: Georgia, serif; font-size: 13px; line-height: 1.6; }
  .foot { margin-top: 34px; padding-top: 10px; border-top: 1px solid rgba(26,16,8,.16);
    font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: rgba(26,16,8,.55); text-align: center; }
</style></head>
<body><div class="sheet">
  <div class="head">
    <div class="brand">FynHelp</div>
    <div class="firm">${esc(doc.firmName)}</div>
  </div>
  <h1>${esc(doc.heading)}</h1>
  <div class="meta">
    <span>Client: ${esc(doc.clientName)}</span>
    <span>Period: ${esc(doc.period)}</span>
    <span>Generated: ${esc(doc.generatedAt)}</span>
  </div>
  ${doc.subheading ? `<p class="meta">${esc(doc.subheading)}</p>` : ""}
  ${content}
  <div class="foot">Generated by FynHelp. Confidential.</div>
</div></body></html>`;
}
