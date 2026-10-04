/**
 * Gmail intake: turns client emails with attachments into documents.
 *
 * For each connected inbox it lists new emails with attachments (never the
 * firm's own sent mail, drafts, spam or trash), works out which client sent
 * each one, keeps only real documents (no signature logos, invites or
 * digital-signature files) and hands each file to registerDocument, the same
 * path uploads and WhatsApp use: duplicate check, Extract, then chase
 * closing for the right month.
 *
 * Safe to run often and in parallel: every email is claimed in
 * ca_gmail_processed before any work, so it is handled exactly once, and a
 * run that hits its time budget leaves the rest for the next one.
 *
 * Rules for what to take and who sent it live in ./gmailRules (unit tested).
 */
import { adminDb, type Db } from "./db.server";
import { BUCKET, registerDocument } from "./documents.server";
import { PracticeError } from "./core";
import {
  base64UrlToBytes,
  forwardedSender,
  gmailHeader,
  parseAddress,
  pickAttachments,
  plainText,
  searchQuery,
  senderVerdict,
  windowStart,
  type GmailPart,
  type PickedAttachment,
} from "./gmailRules";

// GMAIL_API_BASE exists only so tests can point intake at a fake Gmail.
const GMAIL = process.env.GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_LISTED = 300;
const REPROCESS_STUCK_AFTER_MS = 10 * 60 * 1000;

interface Connection {
  id: string;
  ca_firm_id: string;
  user_id: string;
  gmail_address: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expiry: string;
  last_polled_at: string | null;
}

export interface InboxResult {
  gmail: string;
  emails: number;
  filed: number;
  unassigned: number;
  duplicates: number;
  skipped: Record<string, number>;
  complete: boolean;
  error?: string;
  disconnected?: boolean;
}

export interface PollSummary {
  inboxes: InboxResult[];
  documents: number;
  ms: number;
}

class GmailApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 120) || "attachment";

/* ─────────────────────────── Google calls ─────────────────────────── */

/** One Gmail API call, retrying briefly when Google is busy (429/5xx). */
async function gmailGet<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      if (attempt < 2) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new GmailApiError(0, "network", e instanceof Error ? e.message : String(e));
    }
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
    const retryable = res.status === 429 || res.status >= 500 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
    if (retryable && attempt < 2) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new GmailApiError(res.status, reason, body?.error?.message ?? `Gmail returned ${res.status}`);
  }
}

async function setConnection(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from("ca_gmail_connections").update(patch).eq("id", id);
}

async function disconnect(db: Db, conn: Connection, message: string) {
  await setConnection(db, conn.id, { is_active: false, refresh_locked_until: null, error_message: message });
  await db.from("ca_notifications").insert({
    ca_firm_id: conn.ca_firm_id,
    type: "gmail_disconnected",
    severity: "critical",
    title: "Gmail needs reconnecting",
    message: `${message} (${conn.gmail_address})`,
    is_read: false,
  });
}

/**
 * A valid access token, refreshing it when it expires within 5 minutes.
 * Only one run refreshes at a time (atomic lock); the others wait for it.
 */
async function accessToken(db: Db, conn: Connection, force = false): Promise<string> {
  const { decryptToken, encryptToken, refreshAccessTokenDetailed } = await import("@/lib/caGmail.server");
  if (!force && new Date(conn.token_expiry).getTime() - Date.now() > 5 * 60 * 1000) return decryptToken(conn.access_token_enc);

  const { data: claimed } = await db.rpc("claim_gmail_token_refresh", { p_connection_id: conn.id });
  if (claimed !== true) {
    // Another run is refreshing: use its token once it lands.
    for (let i = 0; i < 6; i++) {
      await sleep(1000);
      const { data } = await db.from("ca_gmail_connections").select("access_token_enc, token_expiry").eq("id", conn.id).maybeSingle();
      if (data && new Date(data.token_expiry as string).getTime() - Date.now() > 5 * 60 * 1000) return decryptToken(data.access_token_enc as string);
    }
    throw new GmailApiError(0, "refresh_busy", "Another check is refreshing Google access; trying again next time.");
  }

  const refreshed = await refreshAccessTokenDetailed(await decryptToken(conn.refresh_token_enc));
  if (!refreshed.ok) {
    if (refreshed.kind === "revoked") {
      await disconnect(db, conn, "Google access was removed or has expired. Open Settings and connect Gmail again.");
      throw new GmailApiError(401, "revoked", "Google access was revoked");
    }
    await setConnection(db, conn.id, { refresh_locked_until: null });
    throw new GmailApiError(0, "refresh_transient", `Could not reach Google to renew access (${refreshed.error}); retrying next time.`);
  }
  const expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await setConnection(db, conn.id, {
    access_token_enc: await encryptToken(refreshed.access_token),
    token_expiry: expiry,
    refresh_locked_until: null,
  });
  conn.token_expiry = expiry;
  return refreshed.access_token;
}

/* ─────────────────────────── Firm context ─────────────────────────── */

/** Addresses that belong to the firm itself: emails from these are forwards, not client mail. */
async function firmAddresses(db: Db, firmId: string, conns: Connection[]): Promise<Set<string>> {
  const out = new Set(conns.filter((c) => c.ca_firm_id === firmId).map((c) => c.gmail_address.toLowerCase()));
  const { data: members } = await db.from("ca_firm_members").select("user_id, invited_email").eq("ca_firm_id", firmId).neq("status", "revoked");
  const { data: firm } = await db.from("ca_firms").select("user_id, email").eq("id", firmId).maybeSingle();
  for (const m of members ?? []) if (m.invited_email) out.add(String(m.invited_email).toLowerCase());
  if (firm?.email) out.add(String(firm.email).toLowerCase());
  const userIds = [...new Set([...(members ?? []).map((m) => m.user_id), firm?.user_id].filter(Boolean) as string[])];
  for (const uid of userIds.slice(0, 50)) {
    const { data } = await db.auth.admin.getUserById(uid);
    if (data?.user?.email) out.add(data.user.email.toLowerCase());
  }
  return out;
}

const systemSender = (email: string) => {
  const own = (process.env.PRACTICE_FROM_EMAIL ?? "").toLowerCase();
  return email.endsWith("@fynhelp.com") || (own !== "" && email === own) || /^(mailer-daemon|postmaster)@/i.test(email);
};

/* ─────────────────────────── One email ─────────────────────────── */

type Claim = "claimed" | "skip";

/** Claims an email (or one of its parts) for this run. Exactly-once across parallel runs. */
async function claim(db: Db, conn: Connection, messageId: string, partId: string, extra: Record<string, unknown> = {}): Promise<Claim> {
  const row = { connection_id: conn.id, ca_firm_id: conn.ca_firm_id, message_id: messageId, part_id: partId, outcome: "processing", ...extra };
  const { data: inserted } = await db
    .from("ca_gmail_processed")
    .upsert(row, { onConflict: "connection_id,message_id,part_id", ignoreDuplicates: true })
    .select("message_id");
  if (inserted?.length) return "claimed";
  const { data: existing } = await db
    .from("ca_gmail_processed")
    .select("outcome, updated_at")
    .eq("connection_id", conn.id)
    .eq("message_id", messageId)
    .eq("part_id", partId)
    .maybeSingle();
  // A run that died half-way leaves "processing" behind: take it over after 10 minutes.
  if (existing?.outcome === "processing" && Date.now() - new Date(existing.updated_at as string).getTime() > REPROCESS_STUCK_AFTER_MS) {
    await db
      .from("ca_gmail_processed")
      .update({ updated_at: new Date().toISOString() })
      .eq("connection_id", conn.id)
      .eq("message_id", messageId)
      .eq("part_id", partId);
    return "claimed";
  }
  return "skip";
}

async function settle(db: Db, conn: Connection, messageId: string, partId: string, patch: Record<string, unknown>) {
  await db
    .from("ca_gmail_processed")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("connection_id", conn.id)
    .eq("message_id", messageId)
    .eq("part_id", partId);
}

interface Sender {
  email: string;
  name: string;
  /** Business to file under (certain matches only). */
  businessId: string | null;
  suggestedBusinessId: string | null;
  method: string;
  confidence: number;
  /** Why it did not file automatically, shown on the document. */
  note: string | null;
}

async function identify(db: Db, conn: Connection, headers: { name: string; value: string }[], payload: GmailPart, internal: Set<string>): Promise<Sender> {
  const { identifyClient } = await import("@/lib/caGmail.server");
  const from = parseAddress(gmailHeader(headers, "From"));
  const replyTo = parseAddress(gmailHeader(headers, "Reply-To"));
  const subject = gmailHeader(headers, "Subject");
  let email = from.email;
  let name = from.name;
  let note: string | null = null;
  let forwarded = false;

  // Someone at the firm forwarded the client's email: the client is the sender.
  if (internal.has(email)) {
    const original = forwardedSender(plainText(payload));
    if (original && !internal.has(original)) {
      email = original;
      name = "";
      forwarded = true;
    } else {
      return {
        email: from.email,
        name: from.name,
        businessId: null,
        suggestedBusinessId: null,
        method: "internal",
        confidence: 0,
        note: "Sent by someone at your firm. Choose the client this belongs to.",
      };
    }
  }

  let match = await identifyClient(db as never, conn.ca_firm_id, email, name, subject);
  // Some clients send from one address and reply from another (their accountant's, say).
  if (!match.businessId && replyTo.email && replyTo.email !== email && !internal.has(replyTo.email)) {
    const viaReplyTo = await identifyClient(db as never, conn.ca_firm_id, replyTo.email, replyTo.name, subject);
    if (viaReplyTo.businessId) match = viaReplyTo;
  }

  // Gmail could not confirm the From address is genuine: never file automatically.
  if (!forwarded && match.businessId && senderVerdict(gmailHeader(headers, "Authentication-Results")) === "fail") {
    return {
      email,
      name,
      businessId: null,
      suggestedBusinessId: match.businessId,
      method: match.method,
      confidence: match.confidence,
      note: `Gmail could not verify that this email really came from ${email}. Check it, then confirm the client.`,
    };
  }

  if (!match.businessId) {
    note =
      match.method === "ambiguous"
        ? `${email} is the contact email of more than one client. Choose which one this is for.`
        : match.suggestedBusinessId
          ? `Looks like a client (matched by ${match.method}); only exact matches are filed automatically. Confirm the client.`
          : `${email} is not the email of any client. Choose the client, or add this address to the client so next time it files itself.`;
  }
  return {
    email,
    name,
    businessId: match.businessId,
    suggestedBusinessId: match.suggestedBusinessId ?? null,
    method: forwarded ? `${match.method}_forwarded` : match.method,
    confidence: match.confidence,
    note,
  };
}

async function attachmentBytes(token: string, messageId: string, a: PickedAttachment): Promise<Uint8Array> {
  if (a.inlineData) return base64UrlToBytes(a.inlineData);
  const body = await gmailGet<{ data?: string }>(token, `/messages/${messageId}/attachments/${a.attachmentId}`);
  return body.data ? base64UrlToBytes(body.data) : new Uint8Array();
}

/** Handles one email. Returns per-outcome counts for the run summary. */
async function processEmail(db: Db, conn: Connection, token: string, messageId: string, internal: Set<string>, out: InboxResult) {
  if ((await claim(db, conn, messageId, "*")) === "skip") return;

  let msg: { payload?: GmailPart & { headers?: { name: string; value: string }[] }; internalDate?: string };
  try {
    msg = await gmailGet(token, `/messages/${messageId}?format=full`);
  } catch (e) {
    if (e instanceof GmailApiError && e.status === 404) {
      await settle(db, conn, messageId, "*", { outcome: "skipped", reason: "deleted before it could be read" });
      return;
    }
    // Release the claim so the next run tries again.
    await db.from("ca_gmail_processed").delete().eq("connection_id", conn.id).eq("message_id", messageId).eq("part_id", "*");
    throw e;
  }
  out.emails++;
  const payload = msg.payload ?? {};
  const headers = payload.headers ?? [];
  const fromEmail = parseAddress(gmailHeader(headers, "From")).email;

  if (systemSender(fromEmail)) {
    await settle(db, conn, messageId, "*", { outcome: "skipped", reason: "email from FynHelp or a mail server", sender_email: fromEmail });
    out.skipped.system_email = (out.skipped.system_email ?? 0) + 1;
    return;
  }

  const { take, skipped } = pickAttachments(payload);
  for (const s of skipped) out.skipped[s.reason] = (out.skipped[s.reason] ?? 0) + 1;
  if (!take.length) {
    await settle(db, conn, messageId, "*", {
      outcome: "skipped",
      reason: skipped.length ? `no documents (${[...new Set(skipped.map((s) => s.reason))].join(", ")})` : "no documents",
      sender_email: fromEmail,
    });
    return;
  }

  const sender = await identify(db, conn, headers, payload, internal);
  const subject = gmailHeader(headers, "Subject").slice(0, 300);
  const receivedAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null;
  let filed = 0;
  let unassigned = 0;

  for (const a of take) {
    if ((await claim(db, conn, messageId, a.partId, { filename: a.filename, sender_email: sender.email })) === "skip") continue;
    try {
      const bytes = await attachmentBytes(token, messageId, a);
      if (!bytes.length) {
        await settle(db, conn, messageId, a.partId, { outcome: "skipped", reason: "empty" });
        continue;
      }
      // Deterministic path: a retried run overwrites its own half-finished upload.
      const path = `${conn.ca_firm_id}/${sender.businessId ?? "unassigned"}/gmail/${messageId}-${a.partId}-${safeName(a.filename)}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: a.mimeType, upsert: true });
      if (upErr) throw new Error(`storage: ${upErr.message}`);

      const reg = await registerDocument(db, { firmId: conn.ca_firm_id, userId: conn.user_id }, {
        storage_path: path,
        filename: a.filename,
        mime: a.mimeType,
        business_id: sender.businessId,
        channel: "Gmail",
        process: false,
        source_metadata: {
          gmail_message_id: messageId,
          gmail_part_id: a.partId,
          gmail_inbox: conn.gmail_address,
          from: sender.email,
          subject,
          received_at: receivedAt,
          suggested_business_id: sender.suggestedBusinessId,
          suggested_by: sender.suggestedBusinessId ? sender.method : null,
          intake_note: sender.note,
        },
      });
      if (reg.duplicate) {
        await settle(db, conn, messageId, a.partId, { outcome: "duplicate", extraction_id: reg.extraction_id, business_id: sender.businessId });
        out.duplicates++;
        continue;
      }
      await db
        .from("ca_document_extractions")
        .update({
          gmail_message_id: messageId,
          gmail_sender_email: sender.email,
          gmail_subject: subject,
          gmail_match_method: sender.method,
          gmail_match_confidence: sender.confidence,
          error_message: sender.businessId ? null : sender.note,
        })
        .eq("id", reg.extraction_id);
      await settle(db, conn, messageId, a.partId, {
        outcome: sender.businessId ? "filed" : "unassigned",
        reason: sender.note,
        extraction_id: reg.extraction_id,
        business_id: sender.businessId,
      });
      if (sender.businessId) {
        filed++;
        out.filed++;
      } else {
        unassigned++;
        out.unassigned++;
      }
    } catch (e) {
      const permanent = e instanceof PracticeError && ["too_large", "empty", "forbidden"].includes(e.code);
      if (permanent) {
        await settle(db, conn, messageId, a.partId, { outcome: "skipped", reason: e.message });
        out.skipped[(e as PracticeError).code] = (out.skipped[(e as PracticeError).code] ?? 0) + 1;
        continue;
      }
      // Leave it for the next run to retry.
      await db.from("ca_gmail_processed").delete().eq("connection_id", conn.id).eq("message_id", messageId).eq("part_id", a.partId);
      throw e;
    }
  }

  await settle(db, conn, messageId, "*", {
    outcome: "done",
    sender_email: sender.email,
    business_id: sender.businessId,
    reason: sender.note,
  });
  if (filed + unassigned > 0) {
    let client = "";
    if (sender.businessId) {
      const { data } = await db.from("ca_clients").select("client_name").eq("ca_firm_id", conn.ca_firm_id).eq("business_id", sender.businessId).maybeSingle();
      client = (data?.client_name as string | undefined) ?? "";
    }
    const n = filed + unassigned;
    await db.from("ca_notifications").insert({
      ca_firm_id: conn.ca_firm_id,
      business_id: sender.businessId,
      type: "gmail_document",
      severity: sender.businessId ? "info" : "warning",
      title: sender.businessId ? `${n} document${n === 1 ? "" : "s"} from ${client || sender.email}` : `Email from ${sender.email} needs a client`,
      message: sender.businessId
        ? `Arrived by email and filed under ${client || "the client"}. Extract is reading ${n === 1 ? "it" : "them"}.`
        : sender.note ?? "Choose the client in Documents → Unassigned.",
      is_read: false,
    });
  }
}

/* ─────────────────────────── One inbox, all inboxes ─────────────────────────── */

async function pollInbox(db: Db, conn: Connection, internal: Set<string>, deadlineAt: number): Promise<InboxResult> {
  const out: InboxResult = { gmail: conn.gmail_address, emails: 0, filed: 0, unassigned: 0, duplicates: 0, skipped: {}, complete: false };
  const startedAt = new Date();
  try {
    let token = await accessToken(db, conn);
    const call = async <T,>(fn: (t: string) => Promise<T>): Promise<T> => {
      try {
        return await fn(token);
      } catch (e) {
        if (e instanceof GmailApiError && e.status === 401) {
          token = await accessToken(db, conn, true);
          return fn(token);
        }
        throw e;
      }
    };

    const q = searchQuery(windowStart(conn.last_polled_at, startedAt));
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q, maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await call((t) => gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(t, `/messages?${params}`));
      for (const m of page.messages ?? []) ids.push(m.id);
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < MAX_LISTED);

    // Oldest first, so a busy inbox catches up in order across runs.
    let finished = true;
    for (const id of ids.reverse()) {
      if (Date.now() > deadlineAt) {
        finished = false;
        break;
      }
      await call((t) => processEmail(db, conn, t, id, internal, out));
    }
    out.complete = finished && !pageToken;
    await setConnection(db, conn.id, {
      // Only move the window forward once everything in it has been seen.
      ...(out.complete ? { last_polled_at: startedAt.toISOString() } : {}),
      error_message: null,
      last_poll_stats: { ...out, at: startedAt.toISOString() },
    });
  } catch (e) {
    const err = e as GmailApiError;
    if (err.reason === "revoked") {
      out.disconnected = true;
      out.error = "Google access was removed. Reconnect Gmail in Settings.";
    } else if (err.status === 403 && /insufficient|scope|permission/i.test(`${err.reason} ${err.message}`)) {
      out.disconnected = true;
      out.error = "FynHelp was not allowed to read this inbox.";
      await disconnect(db, conn, "FynHelp was not allowed to read this inbox. Connect Gmail again and tick the box that lets FynHelp view your email messages.");
    } else {
      out.error = err.message || "Gmail check failed";
      await setConnection(db, conn.id, { error_message: `Last check failed: ${out.error} Retrying automatically.`, last_poll_stats: { ...out, at: startedAt.toISOString() } });
    }
    console.error(`[fyn:gmail] ${conn.gmail_address}: ${out.error}`);
  }
  return out;
}

/**
 * Checks every active inbox (or one firm's) until the time budget runs out.
 * Never throws: each inbox's problem is recorded on that connection.
 */
export async function pollGmailInboxes(opts: { firmId?: string; budgetMs?: number; db?: Db } = {}): Promise<PollSummary> {
  const started = Date.now();
  const deadlineAt = started + (opts.budgetMs ?? 25_000);
  const db = opts.db ?? (await adminDb());
  const { gmailCredentials } = await import("@/lib/caGmail.server");
  try {
    gmailCredentials();
  } catch {
    return { inboxes: [], documents: 0, ms: 0 };
  }
  let query = db
    .from("ca_gmail_connections")
    .select("id, ca_firm_id, user_id, gmail_address, access_token_enc, refresh_token_enc, token_expiry, last_polled_at")
    .eq("is_active", true);
  if (opts.firmId) query = query.eq("ca_firm_id", opts.firmId);
  const { data } = await query.order("last_polled_at", { ascending: true, nullsFirst: true });
  const conns = (data ?? []) as Connection[];

  const internalByFirm = new Map<string, Set<string>>();
  const inboxes: InboxResult[] = [];
  for (const conn of conns) {
    if (Date.now() > deadlineAt) break;
    if (!internalByFirm.has(conn.ca_firm_id)) internalByFirm.set(conn.ca_firm_id, await firmAddresses(db, conn.ca_firm_id, conns));
    inboxes.push(await pollInbox(db, conn, internalByFirm.get(conn.ca_firm_id)!, deadlineAt));
  }
  const documents = inboxes.reduce((n, i) => n + i.filed + i.unassigned, 0);
  if (inboxes.length) console.log(`[fyn:gmail] checked ${inboxes.length} inbox(es): ${documents} new document(s) in ${Date.now() - started} ms`);
  return { inboxes, documents, ms: Date.now() - started };
}

/** One sentence for the person who clicked "Check now". */
export function describePoll(s: PollSummary): string {
  if (!s.inboxes.length) return "No connected inbox to check.";
  const i = s.inboxes[0];
  if (i.disconnected) return i.error ?? "Gmail needs reconnecting.";
  if (i.error) return `Could not finish checking ${i.gmail}: ${i.error}`;
  const parts: string[] = [];
  if (i.filed) parts.push(`${i.filed} filed under clients`);
  if (i.unassigned) parts.push(`${i.unassigned} waiting in Unassigned for a client`);
  if (i.duplicates) parts.push(`${i.duplicates} already received`);
  const head = parts.length ? `New documents: ${parts.join(", ")}.` : "No new documents.";
  const skippedTotal = Object.values(i.skipped).reduce((a, b) => a + b, 0);
  const tail = skippedTotal ? ` Skipped ${skippedTotal} non-document attachment${skippedTotal === 1 ? "" : "s"} (logos, invites).` : "";
  return `${head}${tail}${i.complete ? "" : " More emails are still being checked."}`;
}
