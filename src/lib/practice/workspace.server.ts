/**
 * One call that returns everything the v2 practice screens show, already in
 * the shapes the v2 store uses. Figures are never computed here: they come
 * from the agents' stored output.
 */
import { parsePeriod, signedAmount } from "./core";
import { clientMeta, type Db, type FirmContext } from "./db.server";
import { REASON_LABELS, type ReasonCode } from "./recon/engine";

const DOC_LIMIT = 300;
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

function docStatus(
  extractStatus: string | null,
  reviewState: string,
): "Processing" | "Parsed" | "Failed" {
  if (extractStatus === "queued" || extractStatus === "processing")
    return "Processing";
  if (extractStatus === "failed" || reviewState === "failed") return "Failed";
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
  const [cRes, xRes, rvRes, eRes, rRes, qRes, evRes, nRes, aRes] =
    await Promise.all([
      db
        .from("ca_clients")
        .select(
          "id, business_id, client_name, client_email, client_phone, gstin, notes, do_not_disturb, created_at",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false }),
      db
        .from("ca_document_extractions")
        .select(
          "id, business_id, original_filename, source_type, extracted, review_state, extract_status, side, file_kind, error_message, txn_count, review_count, duplicate_count, row_count, created_at, gmail_sender_email, gmail_subject, source_metadata",
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
          "id, business_id, reason_code, description, detail, amount, status, candidates, txn_id, txn_side, stage_reached, created_at, ca_txns(txn_date)",
        )
        .eq("ca_firm_id", f)
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("ca_reports_log")
        .select(
          "id, business_id, period, report_type, content, created_at, signed_off_at, status",
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
  for (let i = 0; i < docIds.length; i += 50) {
    const { data } = await db
      .from("ca_txns")
      .select(
        "id, extraction_id, txn_date, description, counterparty, reference, amount, direction, side, match_status, row_index",
      )
      .in("extraction_id", docIds.slice(i, i + 50))
      .order("txn_date")
      .order("row_index")
      .limit(ROWS_PER_DOC * 50);
    for (const t of data ?? []) {
      const list =
        txnsByDoc.get(t.extraction_id) ??
        txnsByDoc.set(t.extraction_id, []).get(t.extraction_id)!;
      if (list.length < ROWS_PER_DOC)
        list.push({
          id: t.id,
          date: t.txn_date,
          particulars: t.description || t.counterparty || "Transaction",
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

  const docName = new Map<string, string>();
  const docs = (xRes.data ?? []).map((r) => {
    const ex = (r.extracted ?? {}) as {
      source?: string;
      rows?: { date: string; particulars: string; amount: number }[];
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
      txnCount: r.txn_count ?? rows.length,
      reviewCount: r.review_count ?? 0,
      duplicateCount: r.duplicate_count ?? 0,
      sender:
        r.gmail_sender_email ??
        (r.source_metadata as { wa_from?: string } | null)?.wa_from ??
        undefined,
      subject: r.gmail_subject ?? undefined,
    };
  });

  const review = (rvRes.data ?? []).map((r) => {
    const p = (r.proposed ?? {}) as {
      date?: string | null;
      amount?: number | null;
      direction?: string | null;
      description?: string;
      counterparty?: string | null;
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
      },
      confidence: Number(r.confidence ?? 0),
      reason: r.reason,
      status: r.status as "open" | "confirmed" | "discarded",
    };
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
    const txn = (r as { ca_txns?: { txn_date?: string } | null }).ca_txns;
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
      status: (r.status === "resolved"
        ? "resolved"
        : r.status === "ignored"
          ? "ignored"
          : "open") as "open" | "resolved" | "ignored",
    };
  });

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
      signedOff: r.signed_off_at
        ? {
            by: c.signedOffBy ?? "Partner",
            at: String(r.signed_off_at).slice(0, 10),
          }
        : undefined,
      correction: c.correction ?? undefined,
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

  return {
    firm: { id: ctx.firmId, name: ctx.firmName, role: ctx.role },
    clients,
    docs,
    review,
    exceptions,
    reports,
    chases,
    recon,
    activity,
  };
}
