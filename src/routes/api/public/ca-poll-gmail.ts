/**
 * Gmail intake poller.
 *
 * Runs every 15 minutes from pg_cron. For every active Gmail connection it
 * looks for recent messages carrying PDF, CSV, XML or image attachments,
 * identifies the client with the 5-layer matcher, stores the attachment and
 * writes an extraction row so the document lands in the Intake inbox.
 *
 * Secret gated with the CA cron secret (`x-cron-secret` header or
 * `Authorization: Bearer <secret>`). No message content is returned.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import type { ParsedRow } from "@/lib/caGmail.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface GmailConnection {
  id: string;
  ca_firm_id: string;
  user_id: string;
  gmail_address: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expiry: string;
  last_history_id: string | null;
  refresh_locked_until: string | null;
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function authorized(request: Request): boolean {
  const accepted = [process.env["CA_CRON_SECRET"], process.env["CRON_SECRET"]].filter(
    (s): s is string => Boolean(s),
  );
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || accepted.length === 0) return false;
  // Check every candidate so timing does not reveal which secret matched.
  let ok = false;
  for (const s of accepted) if (safeEqual(provided, s)) ok = true;
  return ok;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").toLowerCase();
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // This is a cron route with no user session — if the admin client fails here, the poll cannot run.
  let supabaseAdmin: any;
  try {
    const mod = await import("@/integrations/supabase/client.server");
    supabaseAdmin = mod.supabaseAdmin;
    // The admin proxy throws lazily on first use — probe it so init failures surface here.
    await supabaseAdmin.from("ca_gmail_connections").select("id").limit(1);
  } catch (adminErr) {
    console.error("[fyn:gmail] poll cannot run — supabaseAdmin unavailable:", adminErr instanceof Error ? adminErr.message : adminErr);
    return new Response(JSON.stringify({ error: "admin client unavailable" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const gmail = await import("@/lib/caGmail.server");

  const { data: connections } = await supabaseAdmin
    .from("ca_gmail_connections")
    .select(
      "id, ca_firm_id, user_id, gmail_address, access_token_enc, refresh_token_enc, token_expiry, last_history_id, refresh_locked_until",
    )
    .eq("is_active", true);

  const list = (connections ?? []) as unknown as GmailConnection[];
  if (!list.length) {
    console.log("[fyn:gmail] poll complete — connections=0 attachments=0");
    return new Response(JSON.stringify({ connections: 0, processed: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  let totalProcessed = 0;

  for (const conn of list) {
    try {
      let accessToken = await gmail.decryptToken(conn.access_token_enc);

      // Refresh when the token expires within five minutes, under an optimistic lock
      // so two concurrent poll cycles never refresh the same token at once.
      if (new Date(conn.token_expiry).getTime() - Date.now() < 5 * 60 * 1000) {
        const nowTs = new Date();
        if (conn.refresh_locked_until && new Date(conn.refresh_locked_until) > nowTs) {
          console.log(`[fyn:gmail] skipping refresh for ${conn.gmail_address} — already locked`);
          const { data: refreshedConn } = await supabaseAdmin
            .from("ca_gmail_connections")
            .select("access_token_enc")
            .eq("id", conn.id)
            .maybeSingle();
          const enc = (refreshedConn as { access_token_enc?: string } | null)?.access_token_enc;
          if (enc) accessToken = await gmail.decryptToken(enc);
        } else {
          await supabaseAdmin
            .from("ca_gmail_connections")
            .update({ refresh_locked_until: new Date(Date.now() + 2 * 60 * 1000).toISOString() } as never)
            .eq("id", conn.id);

          const refreshed = await gmail.refreshAccessToken(await gmail.decryptToken(conn.refresh_token_enc));
          if (!refreshed) {
            await supabaseAdmin
              .from("ca_gmail_connections")
              .update({
                is_active: false,
                refresh_locked_until: null,
                error_message: "Google access was revoked. Please reconnect Gmail.",
              } as never)
              .eq("id", conn.id);
            await supabaseAdmin.from("ca_notifications").insert({
              ca_firm_id: conn.ca_firm_id,
              type: "gmail_disconnected",
              severity: "critical",
              title: "Gmail connection expired",
              message: `The Gmail connection for ${conn.gmail_address} has expired. Open Integrations to reconnect.`,
              is_read: false,
            } as never);
            continue;
          }

          accessToken = refreshed.access_token;
          await supabaseAdmin
            .from("ca_gmail_connections")
            .update({
              access_token_enc: await gmail.encryptToken(accessToken),
              token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
              refresh_locked_until: null,
              error_message: null,
            } as never)
            .eq("id", conn.id);
          console.log(`[fyn:gmail] token refreshed for ${conn.gmail_address}`);
        }
      }

      // 25-hour window gives a one-hour overlap so nothing slips through at midnight.
      const cutoffTimestamp = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000);
      const gmailQuery = `has:attachment after:${cutoffTimestamp}`;

      const allMessageIds: string[] = [];
      let pageToken: string | undefined = undefined;
      let pages = 0;

      do {
        const queryParams = new URLSearchParams({ q: gmailQuery, maxResults: "500" });
        if (pageToken) queryParams.set("pageToken", pageToken);

        const pageRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${queryParams.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const pageData = (await pageRes.json()) as {
          messages?: { id: string; threadId: string }[];
          nextPageToken?: string;
          error?: { message: string };
        };
        if (pageData.error) throw new Error(pageData.error.message);

        pages++;
        for (const m of pageData.messages ?? []) allMessageIds.push(m.id);
        pageToken = pageData.nextPageToken;

        // Safety cap: never process more than 500 messages per poll cycle per connection.
        if (allMessageIds.length >= 500) break;
      } while (pageToken);

      console.log(
        `[fyn:gmail] found ${allMessageIds.length} messages for ${conn.gmail_address} across ${pages} pages`,
      );

      for (const msg of allMessageIds.map((id) => ({ id }))) {
        const { data: seen } = await supabaseAdmin
          .from("ca_document_extractions")
          .select("id")
          .eq("ca_firm_id", conn.ca_firm_id)
          .eq("gmail_message_id", msg.id)
          .limit(1);
        if (seen && seen.length > 0) continue;

        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const msgBody = (await msgRes.json()) as {
          payload?: { headers?: { name: string; value: string }[]; parts?: any[] };
        };
        const headers = msgBody.payload?.headers ?? [];
        const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
        const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
        const senderEmail = (fromHeader.match(/<(.+?)>/)?.[1] ?? fromHeader.match(/([^\s]+@[^\s]+)/)?.[1] ?? fromHeader).trim();
        const senderName = fromHeader.replace(/<.+>/, "").replace(/"/g, "").trim();

        const match = await gmail.identifyClient(supabaseAdmin as any, conn.ca_firm_id, senderEmail, senderName, subject);

        // Attachments can be nested at any depth inside multipart parts.
        const attachments = msgBody.payload
          ? gmail.extractAttachments(msgBody.payload as Parameters<typeof gmail.extractAttachments>[0])
          : [];

        for (const att of attachments) {
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${att.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const attBody = (await attRes.json()) as { data?: string };
          if (!attBody.data) continue;
          const bytes = Uint8Array.from(
            atob(attBody.data.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          );

          const filename = String(att.filename ?? "attachment");
          const isCsv = /\.csv$/i.test(filename) || String(att.mimeType ?? "").includes("csv");
          const isXml = /\.xml$/i.test(filename);
          const isPdfOrImage =
            String(att.mimeType ?? "").includes("pdf") ||
            String(att.mimeType ?? "").startsWith("image/");
          const classification = gmail.classifyByFilename(filename);

          let rows: ParsedRow[] = [];
          let extractConfidence = 0;
          let ocrAttempted = false;
          if (isCsv) {
            rows = gmail.parseBankCsvText(new TextDecoder().decode(bytes));
            extractConfidence = gmail.scoreRows(rows);
          } else if (isXml) {
            rows = gmail.parseTallyXmlBytes(bytes);
            extractConfidence = gmail.scoreRows(rows);
          } else if (isPdfOrImage && match.businessId) {
            try {
              ocrAttempted = true;
              let binary = "";
              for (const byte of bytes) binary += String.fromCharCode(byte);
              const base64Data = btoa(binary);
              const mimeType = String(att.mimeType ?? "application/pdf");
              const docType = classification === "invoice" || classification === "expense" ? classification : "bank";
              const ocrRes = await supabaseAdmin.functions.invoke("extract-document-ai", {
                body: {
                  doc_type: docType,
                  file_base64: base64Data,
                  mime_type: mimeType,
                  filename,
                  classification,
                  firmId: conn.ca_firm_id,
                  businessId: match.businessId,
                  userId: conn.user_id,
                },
              });
              const ocrData = ocrRes.data as { rows?: ParsedRow[]; confidence?: number } | null;
              if (!ocrRes.error && Array.isArray(ocrData?.rows) && ocrData.rows.length > 0) {
                rows = ocrData.rows;
                extractConfidence = ocrData.confidence ?? gmail.scoreRows(rows);
                console.log(`[fyn:gmail] OCR complete for ${filename} — rows=${rows.length} confidence=${extractConfidence}`);
              } else if (ocrRes.error) {
                throw ocrRes.error;
              }
            } catch (ocrErr) {
              console.error(`[fyn:gmail] OCR failed for ${filename}: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`);
            }
          }

          const path = `${conn.ca_firm_id}/${match.businessId ?? "unassigned"}/gmail/${Date.now()}_${safeName(filename)}`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("ca-client-documents")
            .upload(path, bytes, { contentType: String(att.mimeType ?? "application/octet-stream"), upsert: false });
          if (upErr) {
            console.error(`[fyn:gmail] storage upload failed: ${upErr.message}`);
            continue;
          }

          const reviewState =
            !match.businessId
              ? "needs_review"
              : match.confidence < 0.75
                ? "pending_verification"
                : rows.length > 0 && extractConfidence >= 0.85
                  ? "auto_accepted"
                  : "needs_review";
          if (reviewState === "pending_verification") {
            console.log(`[fyn:gmail] pending_verification set for ${filename} — match confidence=${match.confidence}`);
          }

          const { error: insertErr } = await supabaseAdmin.from("ca_document_extractions").insert({
            ca_firm_id: conn.ca_firm_id,
            business_id: match.businessId,
            storage_path: path,
            original_filename: filename,
            classification,
            confidence: rows.length > 0 ? extractConfidence : match.confidence,
            extracted: { rows, source: "Gmail" },
            review_state: reviewState,
            source_type: "gmail",
            // The practice Extract agent re-reads the stored file into ca_txns.
            extract_status: "queued",
            source_metadata: { gmail_message_id: msg.id, from: senderEmail, subject },
            gmail_message_id: msg.id,
            gmail_sender_email: senderEmail,
            gmail_subject: subject,
            gmail_match_method: match.method,
            gmail_match_confidence: match.confidence,
            uploaded_by: conn.user_id,
            error_message: match.businessId
              ? isPdfOrImage && !ocrAttempted && rows.length === 0
                ? "PDF received but OCR not run. Assign the client, then re-extract from the Review Queue."
                : null
              : `Sender ${senderEmail} could not be matched to a client. Assign the client in the Intake inbox.`,
          } as never);

          if (insertErr) {
            console.error(`[fyn:gmail] extraction insert failed: ${insertErr.message}`);
            continue;
          }
          totalProcessed++;

          if (match.businessId && reviewState !== "pending_verification") {
            await supabaseAdmin
              .from("ca_email_sender_mappings")
              .upsert(
                {
                  ca_firm_id: conn.ca_firm_id,
                  business_id: match.businessId,
                  sender_email: senderEmail,
                  sender_domain: senderEmail.split("@")[1] ?? null,
                  sender_name: senderName || null,
                  match_method: match.method === "learned" ? "manual" : match.method,
                  confidence: match.confidence,
                } as never,
                { onConflict: "ca_firm_id,sender_email" },
              )
              .then(undefined, () => undefined);

            // Any open chaser for this client is answered by the arriving document.
            try {
              const nowIso = new Date().toISOString();
              const { data: open } = await supabaseAdmin
                .from("ca_document_requests")
                .select("id")
                .eq("ca_firm_id", conn.ca_firm_id)
                .eq("business_id", match.businessId)
                .in("status", ["open", "pending", "sent", "chased", "escalated"])
                .limit(20);
              if (open && open.length > 0) {
                await supabaseAdmin
                  .from("ca_document_requests")
                  .update({ status: "fulfilled", fulfilled_at: nowIso, updated_at: nowIso } as never)
                  .in("id", open.map((o: any) => o.id));
              }
            } catch { /* non-blocking */ }

            if (reviewState === "auto_accepted") {
              try {
                const now = new Date();
                const currentPeriod = now.toISOString().slice(0, 7);
                const periodStart = `${currentPeriod}-01`;
                const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
                  .toISOString()
                  .slice(0, 10);
                const [{ count: openRequests }, { count: openCompliance }, { count: openExceptions }, { count: txnCount }] = await Promise.all([
                  supabaseAdmin
                    .from("ca_document_requests")
                    .select("id", { count: "exact", head: true })
                    .eq("ca_firm_id", conn.ca_firm_id)
                    .eq("business_id", match.businessId)
                    .eq("period", currentPeriod)
                    .in("status", ["open", "pending", "sent", "chased", "escalated"]),
                  supabaseAdmin
                    .from("ca_compliance_events")
                    .select("id", { count: "exact", head: true })
                    .eq("ca_firm_id", conn.ca_firm_id)
                    .eq("business_id", match.businessId)
                    .neq("status", "filed")
                    .gte("due_date", periodStart)
                    .lte("due_date", periodEnd),
                  supabaseAdmin
                    .from("ca_exceptions")
                    .select("id", { count: "exact", head: true })
                    .eq("ca_firm_id", conn.ca_firm_id)
                    .eq("business_id", match.businessId)
                    .neq("status", "resolved"),
                  supabaseAdmin
                    .from("bank_transactions")
                    .select("id", { count: "exact", head: true })
                    .eq("business_id", match.businessId)
                    .gte("date", periodStart)
                    .lte("date", periodEnd),
                ]);

                if (
                  (openRequests ?? 1) === 0 &&
                  (openCompliance ?? 1) === 0 &&
                  (openExceptions ?? 1) === 0 &&
                  (txnCount ?? 0) > 0
                ) {
                  const { count: existingNotice } = await supabaseAdmin
                    .from("ca_notifications")
                    .select("id", { count: "exact", head: true })
                    .eq("ca_firm_id", conn.ca_firm_id)
                    .eq("business_id", match.businessId)
                    .eq("type", "period_ready")
                    .gte("created_at", periodStart);
                  if ((existingNotice ?? 0) === 0) {
                    const { data: clientData } = await supabaseAdmin
                      .from("ca_clients")
                      .select("client_name")
                      .eq("ca_firm_id", conn.ca_firm_id)
                      .eq("business_id", match.businessId)
                      .maybeSingle();
                    const clientName = (clientData as { client_name?: string } | null)?.client_name ?? "Client";
                    await supabaseAdmin.from("ca_notifications").insert({
                      ca_firm_id: conn.ca_firm_id,
                      business_id: match.businessId,
                      type: "period_ready",
                      severity: "info",
                      title: `${clientName} is ready for MIS`,
                      message: `All documents for ${currentPeriod} are in. No open compliance items or exceptions. Run reconciliation and generate the MIS with one click.`,
                      is_read: false,
                    } as never);
                    void supabaseAdmin.from("ca_brain_events").insert({
                      ca_firm_id: conn.ca_firm_id,
                      business_id: match.businessId,
                      event_type: "period_ready_notified",
                      payload: { period: currentPeriod, trigger: "gmail_document_completed_intake" },
                    } as never).then(undefined, () => undefined);
                    console.log(`[fyn:gmail] period_ready fired for ${match.businessId} period=${currentPeriod}`);
                  }
                }
              } catch { /* non-blocking — readiness must never break intake */ }
            }
          }

          try {
            await supabaseAdmin.from("ca_brain_events").insert({
              ca_firm_id: conn.ca_firm_id,
              business_id: match.businessId,
              event_type: "gmail_document_received",
              payload: {
                match_method: match.method,
                confidence: match.confidence,
                classification,
                row_count: rows.length,
                sender_domain: senderEmail.split("@")[1] ?? null,
              },
            } as never);
          } catch { /* fire and forget */ }

          try {
            await supabaseAdmin.from("ca_notifications").insert({
              ca_firm_id: conn.ca_firm_id,
              business_id: match.businessId,
              type: "gmail_document",
              severity: match.businessId ? "info" : "warning",
              title: match.businessId ? "Document received by email" : "Unmatched email attachment",
              message: match.businessId
                ? `${filename} arrived from ${senderEmail} and is in the Intake inbox.`
                : `${filename} arrived from ${senderEmail} but the sender could not be matched. Assign the client in the Intake inbox.`,
              is_read: false,
            } as never);
          } catch { /* fire and forget */ }
        }
      }

      await supabaseAdmin
        .from("ca_gmail_connections")
        .update({ last_polled_at: new Date().toISOString(), error_message: null } as never)
        .eq("id", conn.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gmail poll failed";
      console.error(`[fyn:gmail] poll failed for connection ${conn.id}: ${message}`);
      await supabaseAdmin
        .from("ca_gmail_connections")
        .update({ error_message: message } as never)
        .eq("id", conn.id);
    }
  }

  console.log(`[fyn:gmail] poll complete — connections=${list.length} attachments=${totalProcessed}`);
  return new Response(JSON.stringify({ connections: list.length, processed: totalProcessed }), {
    headers: { "content-type": "application/json" },
  });
}

/**
 * The 15-minute poll is also the heartbeat for the practice agents: it
 * extracts queued documents (including the attachments just pulled) and sends
 * chaser follow-ups that have fallen due. Runs only after an authorised poll.
 */
async function withPracticeTick(res: Response): Promise<Response> {
  if (res.status !== 200) return res;
  try {
    const { practiceTick } = await import("@/lib/practice/cron.server");
    const tick = await practiceTick();
    console.log(`[fyn:practice] tick ${JSON.stringify(tick)}`);
  } catch (e) {
    console.error(`[fyn:practice] tick failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}

export const Route = createFileRoute("/api/public/ca-poll-gmail")({
  server: {
    handlers: {
      POST: async ({ request }) => withPracticeTick(await run(request)),
      GET: async ({ request }) => withPracticeTick(await run(request)),
    },
  },
});
