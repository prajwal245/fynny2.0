import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  scanVerdict,
  scanWithVirusTotal,
  resolveCaFirmId,
  buildPrintableHtml,
} from "@/lib/caDocs.server";

/**
 * Scan an uploaded CA client document and auto-match it to an open document
 * request. Firm scoped: the caller must belong to the document's firm.
 */
export const scanAndClassifyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ document_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const firmId = await resolveCaFirmId(admin, context.userId);
    if (!firmId) throw new Error("No CA firm for this user");

    const { data: doc, error } = await admin
      .from("ca_client_documents")
      .select("id, ca_firm_id, business_id, original_filename, mime_type, file_size_bytes, document_type, filing_period, storage_path")
      .eq("id", data.document_id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found");

    const verdict = scanVerdict(doc);

    // Deep scan runs only when the basic checks pass and the bytes are readable.
    // Set VIRUSTOTAL_API_KEY in Lovable secrets to enable full virus scanning.
    // Without it, basic MIME + size + extension checks run.
    let status: "clean" | "infected" = verdict.status;
    let reason = verdict.reason;
    if (status === "clean" && doc.storage_path) {
      try {
        const { data: blob } = await admin.storage.from("ca-client-documents").download(doc.storage_path);
        if (blob) {
          const deep = await scanWithVirusTotal(await blob.arrayBuffer(), String(doc.original_filename ?? "document"));
          reason = deep.reason;
          if (!deep.safe) status = "infected";
        }
      } catch {
        // Download or scan failure never blocks an upload.
      }
    }

    await admin
      .from("ca_client_documents")
      .update({ virus_scan_status: status, virus_scan_at: new Date().toISOString() })
      .eq("id", doc.id)
      .eq("ca_firm_id", firmId);

    if (status === "infected") {
      await admin.storage.from("ca-client-documents").remove([doc.storage_path]);
      await admin.from("ca_client_documents").delete().eq("id", doc.id).eq("ca_firm_id", firmId);
      return { scan_status: "infected" as const, reason, matched: false, request_id: null, request_title: null };
    }

    // Auto-match against open requests for the same client.
    const { data: reqs } = await admin
      .from("ca_document_requests")
      .select("id, title, doc_types, period, status, due_date")
      .eq("ca_firm_id", firmId)
      .eq("business_id", doc.business_id)
      .eq("status", "open")
      .order("due_date", { ascending: true });

    const type = String(doc.document_type ?? "").toLowerCase();
    const name = String(doc.original_filename ?? "").toLowerCase();
    const period = String(doc.filing_period ?? "").toLowerCase();

    let match: { id: string; title: string } | null = null;
    for (const r of (reqs ?? []) as any[]) {
      const types: string[] = Array.isArray(r.doc_types) ? r.doc_types.map((t: string) => String(t).toLowerCase()) : [];
      const typeHit = types.some((t) => t && (t === type || name.includes(t.replace(/[_-]+/g, " ")) || name.includes(t)));
      if (!typeHit) continue;
      const rPeriod = String(r.period ?? "").toLowerCase();
      if (rPeriod && period && rPeriod !== period) continue;
      match = { id: r.id, title: r.title };
      break;
    }

    if (match) {
      await admin
        .from("ca_client_documents")
        .update({ matched_request_id: match.id, auto_matched: true })
        .eq("id", doc.id)
        .eq("ca_firm_id", firmId);

      const { count } = await admin
        .from("ca_client_documents")
        .select("id", { count: "exact", head: true })
        .eq("ca_firm_id", firmId)
        .eq("matched_request_id", match.id);

      if ((count ?? 0) > 0) {
        await admin
          .from("ca_document_requests")
          .update({ status: "closed", fulfilled_at: new Date().toISOString() })
          .eq("id", match.id)
          .eq("ca_firm_id", firmId);
      }

      await admin.from("ca_notifications").insert({
        ca_firm_id: firmId,
        business_id: doc.business_id,
        type: "document",
        severity: "info",
        title: "Document auto matched",
        message: `An uploaded document was matched to the open request "${match.title}" and the request is now closed.`,
      });

      await admin.from("ca_audit_events").insert({
        ca_firm_id: firmId,
        business_id: doc.business_id,
        actor_id: context.userId,
        actor_role: "system",
        action: "document.auto_matched",
        entity_type: "ca_document_request",
        entity_id: match.id,
        source_document_id: doc.id,
        detail: { document_type: doc.document_type, period: doc.filing_period },
      });
    }


    return {
      scan_status: "clean" as const,
      reason,
      matched: !!match,
      request_id: match?.id ?? null,
      request_title: match?.title ?? null,
    };
  });

/**
 * Render a stored working paper or MIS report as printable HTML the browser
 * can turn into a PDF. Firm scoped.
 */
export const renderReportHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        kind: z.enum(["working_paper", "mis_report"]),
        id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const firmId = await resolveCaFirmId(admin, context.userId);
    if (!firmId) throw new Error("No CA firm for this user");

    const { data: firm } = await admin.from("ca_firms").select("firm_name").eq("id", firmId).maybeSingle();

    const table = data.kind === "working_paper" ? "ca_working_papers" : "ca_reports_log";
    const { data: row, error } = await admin
      .from(table)
      .select("*")
      .eq("id", data.id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Report not found");

    let clientName = "Client";
    if (row.business_id) {
      const { data: c } = await admin
        .from("ca_clients")
        .select("client_name")
        .eq("ca_firm_id", firmId)
        .eq("business_id", row.business_id)
        .maybeSingle();
      clientName = c?.client_name ?? clientName;
    }

    const body = row.content ?? row.computed_data ?? row.report_data ?? null;
    const bodyText = typeof row.report_text === "string" ? row.report_text : null;

    const heading =
      data.kind === "working_paper"
        ? row.title ?? `Working Paper: ${row.paper_type ?? "Return"}`
        : row.report_name ?? `MIS Report: ${row.report_type ?? "Management Summary"}`;


    const html = buildPrintableHtml({
      firmName: firm?.firm_name ?? "FynHelp",
      clientName,
      heading,
      subheading: data.kind === "working_paper" ? "Prepared for review and sign-off" : "Management information summary",
      period: row.filing_period ?? row.period ?? row.report_period ?? "Not specified",
      generatedAt: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      body,
      bodyText,
    });

    return { html, filename: `${heading.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf` };
  });

/**
 * Create (or reuse) a client-facing share link for a generated MIS report.
 * Firm scoped. Links expire after the requested number of days.
 */
export const createReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        report_log_id: z.string().uuid(),
        origin: z.string().url(),
        expires_days: z.number().int().min(1).max(90).default(30),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const firmId = await resolveCaFirmId(admin, context.userId);
    if (!firmId) throw new Error("No CA firm for this user");

    const { data: log, error } = await admin
      .from("ca_reports_log")
      .select("id, business_id, report_name")
      .eq("id", data.report_log_id)
      .eq("ca_firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!log) throw new Error("Report not found");

    const { data: existing } = await admin
      .from("ca_report_shares")
      .select("share_token, expires_at, share_url")
      .eq("ca_firm_id", firmId)
      .eq("report_log_id", log.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existing?.share_token) {
      return {
        url: existing.share_url ?? `${data.origin}/shared/mis/${existing.share_token}`,
        expires_at: existing.expires_at as string,
        reused: true,
      };
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const expiresAt = new Date(Date.now() + data.expires_days * 86_400_000).toISOString();
    const url = `${data.origin}/shared/mis/${token}`;

    const { error: insErr } = await admin.from("ca_report_shares").insert({
      ca_firm_id: firmId,
      business_id: log.business_id,
      report_log_id: log.id,
      shared_by: context.userId,
      share_token: token,
      expires_at: expiresAt,
      share_url: url,
      note: data.note ?? null,
    });
    if (insErr) throw new Error(insErr.message);

    return { url, expires_at: expiresAt, reused: false };
  });


/**
 * Look up the live share link for a report, if one exists.
 */
export const getReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ report_log_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const firmId = await resolveCaFirmId(admin, context.userId);
    if (!firmId) throw new Error("No CA firm for this user");

    const { data: row } = await admin
      .from("ca_report_shares")
      .select("id, share_url, share_token, expires_at")
      .eq("ca_firm_id", firmId)
      .eq("report_log_id", data.report_log_id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!row) return { active: false as const };
    return {
      active: true as const,
      url: (row.share_url as string) ?? "",
      expires_at: row.expires_at as string,
    };
  });

/**
 * Withdraw every live share link for a report. The public page stops resolving
 * immediately because it filters on revoked_at.
 */
export const revokeReportShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ report_log_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const firmId = await resolveCaFirmId(admin, context.userId);
    if (!firmId) throw new Error("No CA firm for this user");

    const { error } = await admin
      .from("ca_report_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("ca_firm_id", firmId)
      .eq("report_log_id", data.report_log_id)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { revoked: true as const };
  });
