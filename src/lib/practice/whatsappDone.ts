/**
 * The message a client gets on WhatsApp when a file they sent has been read. Plain words only: no technical reason, no amounts, no
 * other client's name. It is sent for every outcome (read, held for a person, or could not be read), because silence after "Received your
 * file" leaves the client unsure whether anything happened.
 */
export type DoneOutcome = "read" | "held" | "unreadable";

export interface DoneInput {
  filename: string;
  outcome: DoneOutcome;
  /** How many entries were read, when it was read. */
  lines?: number | null;
  /** The plain reason a file could not be read, as the product already words it for a firm. */
  reason?: string | null;
}

const short = (name: string) => (name.length > 40 ? `${name.slice(0, 37)}...` : name);

export function doneMessage(i: DoneInput): string {
  const f = short(i.filename || "your file");
  if (i.outcome === "read") return `Your file ${f} has been read${i.lines ? ` (${i.lines} entries)` : ""}. Thank you. Nothing more is needed from you for it.`;
  if (i.outcome === "held") return `Your file ${f} has been read. Our team will check a few details and will message you only if something is missing. Thank you.`;
  const why = (i.reason ?? "").replace(/\s+/g, " ").trim();
  return `We could not read ${f}${why ? `: ${why.length > 160 ? `${why.slice(0, 157)}...` : why}` : "."} Please send it again, or send a different copy (the PDF or Excel from the bank works best).`;
}

/** Whether a document has reached its final state for this purpose: read, held, or failed with no automatic retry left. */
export function finalOutcome(d: { extract_status: string | null; extract_next_attempt_at: string | null; extract_attempts: number | null }, maxAttempts: number): DoneOutcome | null {
  if (d.extract_status === "parsed") return "read";
  if (d.extract_status === "needs_review") return "held";
  if (d.extract_status === "failed" && !d.extract_next_attempt_at && (d.extract_attempts ?? 0) >= 1) return "unreadable";
  if (d.extract_status === "failed" && (d.extract_attempts ?? 0) >= maxAttempts) return "unreadable";
  return null;
}

/**
 * What a "file read" message costs on WhatsApp, as an ESTIMATE in rupees. A free-text reply inside the 24-hour window after the client's
 * own message is a service message and is free. Outside it only an approved template can be sent, billed at its category rate.
 * Rates are Meta's India rate card as last checked; they change, so they can be overridden without a deploy (WHATSAPP_RATE_UTILITY_INR,
 * WHATSAPP_RATE_MARKETING_INR) and every total is labelled an estimate. Check Meta's current rate card before relying on a figure.
 */
export type WaKind = "service" | "utility" | "marketing";
const DEFAULT_RATE_INR: Record<WaKind, number> = { service: 0, utility: 0.115, marketing: 0.7846 };

export function estimateWhatsappCost(kind: WaKind, env: Record<string, string | undefined> = {}): number {
  if (kind === "service") return 0;
  const key = kind === "utility" ? "WHATSAPP_RATE_UTILITY_INR" : "WHATSAPP_RATE_MARKETING_INR";
  const n = Number(env[key]);
  return Number.isFinite(n) && n >= 0 && env[key] !== undefined && env[key] !== "" ? n : DEFAULT_RATE_INR[kind];
}
