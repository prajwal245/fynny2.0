/** Webhook handling for the fallback reader: the signature check, and finishing a document whose job completed after the upload returned. */

/** Hex HMAC-SHA256 of the raw body, compared in constant time. Accepts an optional "sha256=" prefix. A missing secret or header never passes. */
export async function signatureValid(
  raw: string,
  header: string | null,
  secret: string | null,
): Promise<boolean> {
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  const want = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const got = header
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++)
    diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** The job id and whether it finished, from whatever shape the vendor posts. */
export function readWebhook(body: unknown): {
  jobId: string | null;
  finished: boolean;
} {
  const o = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const data = (
    o["data"] && typeof o["data"] === "object" ? o["data"] : {}
  ) as Record<string, unknown>;
  const id =
    [o["job_id"], o["jobId"], o["id"], data["job_id"], data["id"]].find(
      (v): v is string => typeof v === "string" && v.length > 0,
    ) ?? null;
  const status = String(
    o["status"] ?? o["event"] ?? data["status"] ?? "",
  ).toLowerCase();
  return {
    jobId: id,
    finished: /(done|complete|succeed|success|finish)/.test(status),
  };
}
