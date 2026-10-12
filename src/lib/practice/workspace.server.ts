/**
 * One call that returns everything the v2 practice screens show, already in
 * the shapes the v2 store uses. Figures are never computed here: they come
 * from the agents' stored output.
 */
import { parsePeriod, signedAmount } from "./core";
import { clientMeta, type Db, type FirmContext } from "./db.server";
import { decisionPattern } from "./memory";
import { REASON_LABELS, type ReasonCode } from "./recon/engine";

const DOC_LIMIT = 300;
/** A server call is cut off after 60 s; anything still "running" after 90 s was cut off. */
const STUCK_MS = 90 * 1000;
export const STUCK_READ_MESSAGE =
  "Reading this file took too long and was stopped. Press Retry to read it again; if it stops again, send the file as CSV or Excel.";
const ROWS_PER_DOC = 200;

type Source = "Manual" | "Gmail" | "WhatsApp";

const channelOf = (
  sourceType: string | null,
  extracted: { source?: string } | null,
): Source => {
  const s = (extracted?.source ?? sourceType ?? "").toLowerCase();
  if (s.includes("gmail") || s === "email") return "Gmail";
  if (s.includes("whatsapp")) return "WhatsApp";
  return "Manual";
};

/** Uploaded → Queued → Processing → Parsed / Needs review / Failed. */
function docStatus(
  extractStatus: string | null,
  reviewState: string,
): "Queued" | "Processing" | "Parsed" | "Needs review" | "Failed" {
  if (extractStatus === "queued") return "Queued";
  if (extractStatus === "processing") return "Processing";
  if (extractStatus === "failed" || reviewState === "failed") return "Failed";
  if (extractStatus === "needs_review") return "Needs review";
  return "Parsed";
}

function chaseStatus(r: {
  status: string;
  escalated_at: string | null;
  chaser_count: number | null;
}): "Open" | "Following Up" | "Escalated" | "Resolved" {
  if (
    r.status === "fulfilled" ||
    r.status === "resolved" ||
    r.status === "cancelled"
  )
    return "Resolved";
  if (r.escalated_at || r.status === "escalated") return "Escalated";
  return (r.chaser_count ?? 0) > 0 ? "Following Up" : "Open";
}

export async function loadWorkspace(db: Db, ctx: FirmContext) {
  const f = ctx.firmId;
  const [cRes, xRes, rvRes, eRes, rRes, qRes, evRes, nRes, aRes, runRes, misRes, firmRes, gmailRes, memRes] =
    await Promise.all([
      db
        .from("ca_clients")
        .select(
          "id, business_id, client_name, client_email, client_phone, gstin, notes, do_not_disturb, created_at",
        )
        .eq("ca_firm_id", f)
        // Archived clients keep their history but leave the workspace.
        .neq("client_status", "archived")
        .order("created_at", { ascending: false }),
      db
        .from("ca_document_extractions")
        .select(
          "id, business_id, original_filename, source_type, extracted, review_state, extract_status, extract_started_at, extract_next_attempt_at, extract_attempts, side, file_kind, error_message, txn_count, review_count, duplicate_count, row_count, created_at, gmail_sender_email, gmail_subject, source_metadata",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(DOC_LIMIT),
      db
        .from("ca_review_items")
        .select(
          "id, business_id, extraction_id, raw_text, proposed, confidence, reason, status, corrected, created_at",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("ca_exceptions")
        .select(
          "id, business_id, reason_code, description, detail, amount, status, candidates, txn_id, txn_side, stage_reached, created_at, ca_txns(txn_date, direction, description, counterparty)",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("ca_reports_log")
        .select(
          "id, business_id, period, period_start, period_end, report_type, content, created_at, signed_off_at, status, input_hash",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("ca_document_requests")
        .select(
          "id, business_id, title, notes, due_date, status, chaser_count, escalated_at, contact_name, contact_email, contact_phone, next_follow_up_at, period, created_at",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("ca_chaser_events")
        .select("chaser_id, event_type, note, channel, created_at")
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: true })
        .limit(3000),
      db
        .from("ca_recon_runs")
        .select(
          "business_id, period, matched, unmatched, total_items, run_at, created_at, snapshot",
        )
        .eq("ca_firm_id", f)
        .order("run_at", { ascending: false })
        .limit(500),
      db
        .from("ca_activity_log")
        .select("id, business_id, action_type, description, created_at")
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("ca_agent_runs")
        .select(
          "id, business_id, agent, trigger, period, subject_id, subject_label, status, attempt, summary, error, detail, started_at, duration_ms",
        )
        .eq("ca_firm_id", f)
        .order("started_at", { ascending: false })
        .limit(200),
      db
        .from("ca_notifications")
        .select("business_id, metadata, created_at")
        .eq("ca_firm_id", f)
        .eq("type", "mis_ready")
        .order("created_at", { ascending: false })
        .limit(200),
      // Firm profile and Gmail status ride along, so the app opens in one round trip.
      db.from("ca_firms").select("firm_name, ca_name, email, city, membership_number").eq("id", f).maybeSingle(),
      db.from("ca_gmail_connections").select("id").eq("ca_firm_id", f).eq("is_active", true).limit(1),
      // Decisions the Recon agent learned from the Exception Queue, proposed again for the same lines.
      db
        .from("ca_agent_memory")
        .select("business_id, pattern, lesson, times_taught, updated_at")
        .eq("ca_firm_id", f)
        .eq("kind", "recon_decision")
        .limit(1000),
    ]);

  const clients = (cRes.data ?? []).map((r) => {
    const meta = clientMeta(r.notes);
    return {
      id: r.business_id ?? r.id,
      name: r.client_name,
      entityType: meta.entityType ?? "Private Limited",
      gstin: r.gstin ?? undefined,
      contactName: meta.contactName || undefined,
      email: r.client_email ?? undefined,
      phone: r.client_phone ?? undefined,
      lastMis: meta.lastMis ?? undefined,
      doNotDisturb: Boolean(r.do_not_disturb),
    };
  });

  // Transactions for the listed documents (capped per document for the drawer).
  const docIds = (xRes.data ?? []).map((d) => d.id);
  const txnsByDoc = new Map<
    string,
    {
      id: string;
      date: string;
      particulars: string;
      amount: number;
      side: string;
      matchStatus: string;
      counterparty: string | null;
      reference: string | null;
    }[]
  >();
  // All batches at once: one round trip instead of one per 50 documents.
  const batches = await Promise.all(
    Array.from({ length: Math.ceil(docIds.length / 50) }, (_, k) => k * 50).map((i) =>
      db
      .from("ca_txns")
      .select(
        "id, extraction_id, txn_date, description, counterparty, reference, amount, direction, side, match_status, row_index",
      )
      .in("extraction_id", docIds.slice(i, i + 50))
      .order("txn_date")
      .order("row_index")
      .limit(ROWS_PER_DOC * 50),
    ),
  );
  for (const { data } of batches) {
    for (const t of data ?? []) {
      const list =
        txnsByDoc.get(t.extraction_id) ??
        txnsByDoc.set(t.extraction_id, []).get(t.extraction_id)!;
      if (list.length < ROWS_PER_DOC)
        list.push({
          id: t.id,
          date: t.txn_date,
          // Books show the party first (Ravi Enterprises), then the narration.
          particulars:
            t.side === "books" && t.counterparty
              ? `${t.counterparty}${t.description && t.description !== t.counterparty ? ` · ${t.description}` : ""}`
              : t.description || t.counterparty || "Transaction",
          amount: signedAmount({
            amount: Number(t.amount),
            direction: t.direction,
          }),
          side: t.side,
          matchStatus: t.match_status,
          counterparty: t.counterparty,
          reference: t.reference,
        });
    }
  }

  // Close reads and runs that a timeout cut off, so nothing says "Running" forever.
  const cutoff = Date.now() - STUCK_MS;
  const stuckDocs = (xRes.data ?? []).filter(
    (r) => r.extract_status === "processing" && r.extract_started_at && Date.parse(r.extract_started_at) < cutoff,
  );
  const stuckRuns = (runRes.data ?? []).filter((r) => r.status === "running" && r.started_at && Date.parse(r.started_at) < cutoff);
  if (stuckDocs.length || stuckRuns.length) {
    await Promise.all([
      stuckDocs.length
        ? db
            .from("ca_document_extractions")
            .update({ extract_status: "failed", error_message: STUCK_READ_MESSAGE, extract_next_attempt_at: null })
            .in("id", stuckDocs.map((r) => r.id))
            .eq("extract_status", "processing")
        : null,
      stuckRuns.length
        ? db
            .from("ca_agent_runs")
            .update({ status: "failed", error: "Stopped: the server cut this run off after 60 seconds.", summary: "Timed out", finished_at: new Date().toISOString() })
            .in("id", stuckRuns.map((r) => r.id))
            .eq("status", "running")
        : null,
    ]);
    for (const r of stuckDocs) Object.assign(r, { extract_status: "failed", error_message: STUCK_READ_MESSAGE, extract_next_attempt_at: null });
    for (const r of stuckRuns) Object.assign(r, { status: "failed", error: "Stopped: the server cut this run off after 60 seconds.", summary: "Timed out" });
  }

  const docName = new Map<string, string>();
  const docs = (xRes.data ?? []).map((r) => {
    const ex = (r.extracted ?? {}) as {
      source?: string;
      rows?: { date: string; particulars: string; amount: number }[];
      register?: { kind: string; label: string; entries: number; totals: { label: string; amount: number }[]; groups?: { key: string; amount: number; count: number }[]; note: string };
    };
    docName.set(r.id, r.original_filename ?? "Document");
    const rows =
      txnsByDoc.get(r.id) ??
      (r.extract_status ? [] : Array.isArray(ex.rows) ? ex.rows : []);
    return {
      id: r.id,
      name: r.original_filename ?? "Document",
      clientId: r.business_id ?? "",
      source: channelOf(r.source_type, ex),
      status: docStatus(r.extract_status, r.review_state),
      date: String(r.created_at ?? "").slice(0, 10),
      rows,
      side: r.side ?? undefined,
      kind: r.file_kind ?? undefined,
      error: r.error_message ?? undefined,
      retryAt:
        r.extract_status === "failed" && r.extract_next_attempt_at
          ? String(r.extract_next_attempt_at)
          : undefined,
      attempts: r.extract_attempts ?? 0,
      suggestedClientId:
        (r.source_metadata as { suggested_business_id?: string | null } | null)
          ?.suggested_business_id ?? undefined,
      suggestedBy:
        (r.source_metadata as { suggested_by?: string | null } | null)
          ?.suggested_by ?? undefined,
      txnCount: r.txn_count ?? rows.length,
      reviewCount: r.review_count ?? 0,
      duplicateCount: r.duplicate_count ?? 0,
      sender:
        r.gmail_sender_email ??
        (r.source_metadata as { wa_from?: string } | null)?.wa_from ??
        undefined,
      subject: r.gmail_subject ?? undefined,
      register: ex.register ?? undefined,
    };
  });

  const review = (rvRes.data ?? []).map((r) => {
    const p = (r.proposed ?? {}) as {
      date?: string | null;
      amount?: number | null;
      direction?: string | null;
      description?: string;
      counterparty?: string | null;
      reference?: string | null;
    };
    const amount = p.amount
      ? p.direction === "out"
        ? -Math.abs(p.amount)
        : Math.abs(p.amount)
      : 0;
    return {
      id: r.id,
      clientId: r.business_id ?? "",
      docId: r.extraction_id,
      docName: docName.get(r.extraction_id) ?? "Document",
      rawText: r.raw_text ?? "",
      suggestion: {
        date: p.date ?? String(r.created_at).slice(0, 10),
        particulars: p.description || p.counterparty || "",
        amount,
        counterparty: p.counterparty ?? null,
        reference: p.reference ?? null,
      },
      confidence: Number(r.confidence ?? 0),
      reason: r.reason,
      status: r.status as "open" | "confirmed" | "discarded",
    };
  });

  const learned = new Map<string, { action: string; note: string; times: number; at: string; by: string | null }>();
  const memRows = (memRes.data ?? []) as { business_id: string; pattern: string; lesson: { action: string; note: string; by?: string | null; by_name?: string | null; at?: string }; times_taught: number; updated_at: string }[];
  // Lessons learned before names were stored: look the person up once.
  const missing = [...new Set(memRows.filter((m) => !m.lesson.by_name && m.lesson.by).map((m) => m.lesson.by as string))];
  const names = new Map<string, string>();
  await Promise.all(
    missing.slice(0, 20).map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id).catch(() => ({ data: null }));
      const meta = (data?.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
      const n = meta.full_name || meta.name || data?.user?.email;
      if (n) names.set(id, n);
    }),
  );
  for (const m of memRows)
    learned.set(`${m.business_id}|${m.pattern}`, {
      action: m.lesson.action,
      note: m.lesson.note,
      times: m.times_taught,
      at: m.lesson.at ?? m.updated_at,
      by: m.lesson.by_name ?? (m.lesson.by ? names.get(m.lesson.by) ?? null : null),
    });
  const exceptions = (eRes.data ?? []).map((r) => {
    const cands = Array.isArray(r.candidates)
      ? (r.candidates as {
          txn_id: string;
          amount: number;
          txn_date: string;
          description: string | null;
          reason: string;
          score: number;
        }[])
      : [];
    let narration = r.description ?? "";
    let legacyCandidates: string[] = [];
    // Rows written by the old browser-side recon stored JSON in description.
    try {
      const parsed = JSON.parse(narration);
      if (parsed && typeof parsed === "object") {
        narration = parsed.n ?? "";
        legacyCandidates = parsed.c ?? [];
      }
    } catch {
      /* plain text */
    }
    const txn = (r as { ca_txns?: { txn_date?: string; direction?: string; description?: string | null; counterparty?: string | null } | null }).ca_txns;
    const key = txn?.direction && r.txn_side ? decisionPattern({ side: r.txn_side, direction: txn.direction, description: txn.description ?? null, counterparty: txn.counterparty }) : "";
    const precedent = r.status === "open" && key ? learned.get(`${r.business_id}|${key}`) : undefined;
    return {
      id: r.id,
      clientId: r.business_id,
      reason:
        REASON_LABELS[r.reason_code as ReasonCode] ??
        (r.reason_code || "No candidate"),
      reasonCode: r.reason_code,
      amount: Number(r.amount ?? 0),
      date: txn?.txn_date ?? String(r.created_at ?? "").slice(0, 10),
      narration,
      detail: r.detail ?? undefined,
      side: r.txn_side ?? undefined,
      stage: r.stage_reached ?? undefined,
      candidates: cands.length
        ? cands.map(
            (c) =>
              `${c.description ?? "Entry"} · ₹${Number(c.amount).toLocaleString("en-IN")} on ${c.txn_date} (${c.reason})`,
          )
        : legacyCandidates,
      candidateIds: cands.map((c) => c.txn_id),
      candidateAmounts: cands.map((c) => Number(c.amount)),
      txnId: r.txn_id ?? undefined,
      precedent,
      status: (r.status === "resolved"
        ? "resolved"
        : r.status === "ignored"
          ? "ignored"
          : "open") as "open" | "resolved" | "ignored",
    };
  });

  const staleIds = await staleReportIds(db, ctx.firmId, (rRes.data ?? []) as ReportRow[]);
  const reports = (rRes.data ?? []).map((r) => {
    const c = (r.content ?? {}) as Record<string, unknown> & {
      signedOffBy?: string;
      correction?: unknown;
    };
    return {
      id: r.id,
      clientId: r.business_id,
      period: r.period ?? "",
      template: r.report_type ?? "Monthly MIS",
      generated: String(r.created_at ?? "").slice(0, 10),
      excluded: (c.excluded as number) ?? 0,
      revenue: (c.revenue as number) ?? 0,
      expenses: (c.expenses as number) ?? 0,
      sources: (c.sources as unknown) ?? { revenue: [], expenses: [] },
      insights: (c.insights as unknown) ?? [],
      variances: (c.variances as unknown) ?? [],
      bankSummary: (c.bankSummary as unknown) ?? [],
      warnings: (c.warnings as string[]) ?? [],
      otherFlows: (c.other_flows as unknown) ?? [],
      gateway: (c.gateway as unknown) ?? null,
      decisions: (c.decisions as unknown) ?? [],
      statutory: (c.statutory as unknown) ?? [],
      signedOffWithOpen: (c.signedOffWithOpen as unknown) ?? null,
      signedOff: r.signed_off_at
        ? {
            by: c.signedOffBy ?? "Partner",
            at: String(r.signed_off_at).slice(0, 10),
          }
        : undefined,
      stale: staleIds.has(r.id),
      status: r.status ?? "generated",
      correction: (c.correction as Record<string, string | null> | null)?.note
        ? {
            note: (c.correction as Record<string, string | null>).note,
            at: (c.correction as Record<string, string | null>).at,
            byName: (c.correction as Record<string, string | null>).by_name ?? null,
            resolvedAt: (c.correction as Record<string, string | null>).resolved_at ?? null,
            resolvedByName: (c.correction as Record<string, string | null>).resolved_by_name ?? null,
            resolution: (c.correction as Record<string, string | null>).resolution ?? null,
          }
        : undefined,
    };
  });

  const events = evRes.data ?? [];
  const chases = (qRes.data ?? []).map((r) => {
    let meta: { note?: string; contact?: string; phone?: string } = {};
    try {
      meta = JSON.parse(r.notes ?? "{}");
    } catch {
      meta = { note: r.notes ?? "" };
    }
    return {
      id: r.id,
      clientId: r.business_id,
      type: r.title,
      contact: meta.contact || r.contact_name || r.contact_email || "",
      phone: r.contact_phone || meta.phone || "",
      email: r.contact_email ?? undefined,
      due: r.due_date ?? String(r.created_at).slice(0, 10),
      note: meta.note ?? "",
      followUps: r.chaser_count ?? 0,
      status: chaseStatus(r),
      nextFollowUp: r.next_follow_up_at ?? undefined,
      timeline: events
        .filter((e) => e.chaser_id === r.id)
        .map((e) => ({
          at: String(e.created_at).slice(0, 10),
          text: e.note ?? e.event_type,
          agent: "chaser" as const,
        })),
    };
  });

  // Latest recon per client, with counts taken live from the transactions so
  // manual matches and resolved exceptions made after the run are reflected.
  const recon: Record<
    string,
    {
      matched: number;
      exceptions: number;
      bank: number;
      at: string;
      period?: string;
    }
  > = {};
  for (const r of nRes.data ?? []) {
    if (recon[r.business_id]) continue;
    recon[r.business_id] = {
      matched: r.matched ?? 0,
      exceptions: r.unmatched ?? 0,
      bank: r.total_items ?? 0,
      at: String(r.run_at ?? r.created_at ?? "").slice(0, 10),
      period: r.period,
    };
  }
  await Promise.all(
    Object.entries(recon).map(async ([businessId, summary]) => {
      let p;
      try {
        p = parsePeriod(summary.period ?? "");
      } catch {
        return;
      }
      const bankQ = () =>
        db
          .from("ca_txns")
          .select("id", { count: "exact", head: true })
          .eq("ca_firm_id", f)
          .eq("business_id", businessId)
          .eq("side", "bank")
          .gte("txn_date", p.start)
          .lte("txn_date", p.end);
      const [all, matched, open] = await Promise.all([
        bankQ().neq("match_status", "ignored"),
        bankQ().eq("match_status", "matched"),
        db
          .from("ca_exceptions")
          .select("id", { count: "exact", head: true })
          .eq("ca_firm_id", f)
          .eq("business_id", businessId)
          .eq("status", "open")
          .gte("period_start", p.start)
          .lte("period_end", p.end),
      ]);
      recon[businessId] = {
        ...summary,
        bank: all.count ?? summary.bank,
        matched: matched.count ?? summary.matched,
        exceptions: open.count ?? summary.exceptions,
      };
    }),
  );

  const activity = (aRes.data ?? []).map((r) => ({
    id: r.id,
    clientId: r.business_id ?? "",
    at: String(r.created_at ?? "").slice(0, 10),
    text: r.description ?? r.action_type,
    agent: ["extract", "recon", "narrate", "chaser"].includes(r.action_type)
      ? r.action_type
      : undefined,
  }));

  const agentRuns = (runRes.data ?? []).map((r) => ({
    id: r.id as string,
    clientId: (r.business_id as string | null) ?? "",
    agent: r.agent as string,
    trigger: r.trigger as string,
    period: (r.period as string | null) ?? undefined,
    subjectId: (r.subject_id as string | null) ?? undefined,
    subject: (r.subject_label as string | null) ?? undefined,
    status: r.status as string,
    attempt: (r.attempt as number) ?? 1,
    summary: (r.summary as string | null) ?? "",
    error: (r.error as string | null) ?? undefined,
    retryAt:
      ((r.detail as { retry_at?: string | null } | null)?.retry_at ?? undefined) || undefined,
    memoryReleased:
      (r.detail as { memory_released?: number } | null)?.memory_released ?? 0,
    at: String(r.started_at ?? ""),
    ms: (r.duration_ms as number | null) ?? undefined,
  }));
  const readyForMis = (misRes.data ?? []).map((n) => ({
    clientId: (n.business_id as string | null) ?? "",
    period: String((n.metadata as { period?: string } | null)?.period ?? ""),
  }));

  return {
    firm: {
      id: ctx.firmId,
      name: firmRes.data?.firm_name ?? ctx.firmName,
      role: ctx.role,
      partnerName: (firmRes.data?.ca_name as string | null) ?? null,
      email: (firmRes.data?.email as string | null) ?? null,
      city: (firmRes.data?.city as string | null) ?? "",
      frn: (firmRes.data?.membership_number as string | null) ?? "",
      gmailConnected: Boolean(gmailRes.data?.length),
    },
    clients,
    docs,
    review,
    exceptions,
    reports,
    chases,
    recon,
    activity,
    agentRuns,
    readyForMis,
  };
}

interface ReportRow {
  id: string;
  business_id: string;
  period_start: string | null;
  period_end: string | null;
  input_hash: string | null;
}

/**
 * Reports whose matched bank lines have changed since they were generated
 * (a revised ledger, a new recon, an unmatch): same fingerprint the report
 * was made from, recomputed from today's data.
 */
async function staleReportIds(db: Db, firmId: string, rows: ReportRow[]): Promise<Set<string>> {
  const out = new Set<string>();
  const checkable = rows.filter((r) => r.input_hash && r.period_start && r.period_end && r.business_id);
  if (!checkable.length) return out;
  const { sha256Hex } = await import("./core");
  const byBiz = new Map<string, ReportRow[]>();
  for (const r of checkable) (byBiz.get(r.business_id) ?? byBiz.set(r.business_id, []).get(r.business_id)!).push(r);
  await Promise.all(
    [...byBiz.entries()].map(async ([biz, list]) => {
      const from = list.reduce((m, r) => (r.period_start! < m ? r.period_start! : m), list[0].period_start!);
      const to = list.reduce((m, r) => (r.period_end! > m ? r.period_end! : m), list[0].period_end!);
      const { data } = await db
        .from("ca_txns")
        .select("id, amount, txn_date, direction")
        .eq("ca_firm_id", firmId)
        .eq("business_id", biz)
        .eq("side", "bank")
        .eq("match_status", "matched")
        .gte("txn_date", from)
        .lte("txn_date", to)
        .limit(20000);
      const lines = data ?? [];
      for (const r of list) {
        const inPeriod = lines.filter((t) => String(t.txn_date) >= r.period_start! && String(t.txn_date) <= r.period_end!);
        const hash = await sha256Hex(
          new TextEncoder().encode(
            inPeriod
              .map((t) => `${t.id}:${Number(t.amount)}:${t.txn_date}:${t.direction}`)
              .sort()
              .join("|"),
          ),
        );
        if (hash !== r.input_hash) out.add(r.id);
      }
    }),
  );
  return out;
}
