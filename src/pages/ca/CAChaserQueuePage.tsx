/**
 * Chaser OS — every overdue document request across the portfolio, ranked by
 * how long the client has kept the firm waiting. Chases send a real email,
 * record a client message and increment the chaser counter.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { CA, CACard, CAButton, CABadge, CAEmpty, caTd, caTh, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, StatStrip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";
import { useFirmClientIntelligence, DOW } from "@/hooks/useCAIntelligence";
import { signalBrain } from "@/lib/caBrainSignals";

interface RequestRow {
  id: string;
  business_id: string;
  title: string;
  period: string | null;
  doc_types: string[] | null;
  due_date: string;
  status: string;
  last_chased_at: string | null;
  chaser_count: number | null;
}

interface ClientInfo {
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
}

const DAY = 86_400_000;
const daysOverdue = (due: string) => Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / DAY));

export default function CAChaserQueuePage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CAChaserPage mounted"); }, []);
  const { firmId, firmName, userId } = useCAPortal();
  const { byBusiness: intel } = useFirmClientIntelligence(firmId);
  const { can, role, isLoading: roleLoading } = useCARole();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientInfo>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [timelineChaser, setTimelineChaser] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<{ event_type: string; note: string | null; actor_id: string | null; created_at: string }[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  /** One timeline open at a time — clicking the open row collapses it. */
  const loadTimeline = async (chaserId: string) => {
    if (timelineChaser === chaserId) { setTimelineChaser(null); return; }
    setTimelineChaser(chaserId);
    setLoadingTimeline(true);
    const { data } = await supabase
      .from("ca_chaser_events")
      .select("event_type, note, actor_id, created_at")
      .eq("chaser_id", chaserId)
      .order("created_at", { ascending: true });
    const events = (data ?? []) as { event_type: string; note: string | null; actor_id: string | null; created_at: string }[];
    setTimelineEvents(events);
    setLoadingTimeline(false);
    console.log(`[fyn:chaser] timeline loaded ${events.length} events for ${chaserId}`);
  };

  /** Non-blocking chase history entry. */
  const logChaserEvent = async (r: RequestRow, eventType: string, note: string) => {
    if (!firmId) return;
    try {
      await supabase.from("ca_chaser_events").insert({
        chaser_id: r.id,
        ca_firm_id: firmId,
        business_id: r.business_id,
        event_type: eventType,
        actor_id: userId ?? null,
        note,
      });
    } catch { /* history must never block the action */ }
  };


  const load = useCallback(async () => {
    if (!firmId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: reqs, error }, { data: cls }] = await Promise.all([
      supabase
        .from("ca_document_requests")
        .select("id, business_id, title, period, doc_types, due_date, status, last_chased_at, chaser_count")
        .eq("ca_firm_id", firmId)
        .neq("status", "fulfilled")
        .lt("due_date", today)
        .order("due_date", { ascending: true }),
      supabase.from("ca_clients").select("business_id, client_name, client_email, client_phone").eq("ca_firm_id", firmId),
    ]);
    if (error) toast.error(error.message);
    setRows((reqs ?? []) as RequestRow[]);
    const map = new Map<string, ClientInfo>();
    for (const c of (cls ?? []) as ({ business_id: string | null } & ClientInfo)[]) {
      if (c.business_id) map.set(c.business_id, { client_name: c.client_name, client_email: c.client_email, client_phone: c.client_phone });
    }
    setClients(map);
    setSelected(new Set());
    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Most-overdue first.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date)),
    [rows],
  );

  const docList = (r: RequestRow) => (r.doc_types?.length ? r.doc_types.join(", ") : "the requested documents");

  const chaseMessage = (r: RequestRow) => {
    const c = clients.get(r.business_id);
    return `Hi ${c?.client_name ?? "there"}, this is a reminder from ${firmName ?? "your CA firm"} — we are still waiting for ${docList(r)}${r.period ? ` for the period ${r.period}` : ""}. It was due on ${dateIN(r.due_date)} (${daysOverdue(r.due_date)} days ago). Please upload via your FynHelp portal. Thank you.`;
  };

  const whatsappHref = (r: RequestRow) => {
    const c = clients.get(r.business_id);
    const phone = (c?.client_phone ?? "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Hi, this is a reminder from ${firmName ?? "your CA firm"} — we are waiting for ${docList(r)} for the period ${r.period ?? "the current period"}. Please upload via your FynHelp portal. Thank you.`,
    );
    return `https://wa.me/${phone}?text=${text}`;
  };

  /** Sends the chase email, records the message and bumps the counter. */
  const chaseOne = async (r: RequestRow, silent = false): Promise<boolean> => {
    if (!firmId) return false;
    const c = clients.get(r.business_id);
    const message = chaseMessage(r);
    const nowIso = new Date().toISOString();

    if (c?.client_email) {
      const { error: fnErr } = await supabase.functions.invoke("ca-send-email", {
        body: {
          kind: "document_chase",
          ca_firm_id: firmId,
          to: c.client_email,
          client_name: c.client_name,
          request_title: r.title,
          period: r.period,
          doc_types: r.doc_types ?? [],
          due_date: r.due_date,
          days_overdue: daysOverdue(r.due_date),
        },
      });
      if (fnErr) {
        if (!silent) toast.error(`Email failed for ${c.client_name}: ${fnErr.message}`);
        return false;
      }
    } else if (!silent) {
      toast.warning(`${c?.client_name ?? "Client"} has no email on file — chase recorded in the portal only`);
    }

    const { error: msgErr } = await supabase.from("ca_client_messages").insert({
      ca_firm_id: firmId,
      business_id: r.business_id,
      sender_type: "ca",
      sender_id: userId ?? "",
      message,
      is_read: false,
    });
    if (msgErr && !silent) toast.error(msgErr.message);

    const { error: updErr } = await supabase
      .from("ca_document_requests")
      .update({
        last_chased_at: nowIso,
        chaser_count: (r.chaser_count ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq("id", r.id)
      .eq("ca_firm_id", firmId);
    if (updErr) {
      if (!silent) toast.error(updErr.message);
      return false;
    }

    await logCAAudit({
      firmId,
      businessId: r.business_id,
      entityType: "document_request",
      entityId: r.id,
      action: "chaser_sent",
      actorRole: role,
      detail: { title: r.title, period: r.period, days_overdue: daysOverdue(r.due_date), channel: c?.client_email ? "email" : "portal" },
    });
    await logChaserEvent(r, "sent", c?.client_email ? "Email sent" : "Chase recorded in the portal");
    return true;

  };

  /** Client came back — record the reply and teach the brain. */
  const onMarkReplied = async (r: RequestRow) => {
    if (!firmId) return;
    setBusy(r.id);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("ca_document_requests")
      .update({ status: "responded", updated_at: nowIso })
      .eq("id", r.id)
      .eq("ca_firm_id", firmId);
    setBusy(null);
    if (error) return toast.error(error.message);
    const c = clients.get(r.business_id);
    void signalBrain(firmId, r.business_id, "chaser_replied", {
      channel: c?.client_email ? "email" : "portal",
      days_to_reply: r.last_chased_at
        ? Math.floor((Date.now() - new Date(r.last_chased_at).getTime()) / DAY)
        : 0,
      subject: r.title,
    });
    await logCAAudit({
      firmId,
      businessId: r.business_id,
      entityType: "document_request",
      entityId: r.id,
      action: "chaser_replied",
      actorRole: role,
      detail: { title: r.title, period: r.period },
    });
    await logChaserEvent(r, "replied", "Marked replied manually");
    toast.success("Reply recorded");

    void load();
  };

  /** Deliberately not chasing this round — logged so the queue stays honest. */
  const onSkip = async (r: RequestRow) => {
    if (!firmId) return;
    const reason = window.prompt("Why is this chase being skipped?");
    if (!reason) return;
    await logCAAudit({
      firmId,
      businessId: r.business_id,
      entityType: "document_request",
      entityId: r.id,
      action: "chaser_skipped",
      actorRole: role,
      detail: { title: r.title, period: r.period, reason, days_overdue: daysOverdue(r.due_date) },
    });
    await logChaserEvent(r, "skipped", `Skipped by user — ${reason}`);
    toast.success("Skip logged");

  };

  const onChase = async (r: RequestRow) => {
    setBusy(r.id);
    const ok = await chaseOne(r);
    setBusy(null);
    if (ok) {
      toast.success(`Chase sent to ${clients.get(r.business_id)?.client_name ?? "client"}`);
      void load();
    }
  };

  const onChaseAll = async () => {
    const targets = sorted.filter((r) => selected.has(r.id));
    if (!targets.length) return toast.error("Select at least one request");
    setBusy("bulk");
    let sent = 0;
    for (const r of targets) {
      if (await chaseOne(r, true)) sent++;
    }
    setBusy(null);
    toast.success(`${sent} of ${targets.length} chase(s) sent`);
    void load();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = sorted.length > 0 && selected.size === sorted.length;

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Chaser queue" subtitle="Clients keeping the firm waiting." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  const neverChased = sorted.filter((r) => !r.last_chased_at).length;
  const worst = sorted.length ? daysOverdue(sorted[0]!.due_date) : 0;

  return (
    <div>
      <ModuleHeader
        title="Chaser queue"
        subtitle="Every document request the client has missed, ranked by how long the firm has been waiting."
        right={
          <CAButton onClick={() => void onChaseAll()} disabled={busy === "bulk" || selected.size === 0}>
            {busy === "bulk" ? "Chasing…" : `Chase all (${selected.size})`}
          </CAButton>
        }
      />

      <StatStrip
        items={[
          { label: "Overdue requests", value: String(sorted.length), tone: sorted.length ? "red" : "green" },
          { label: "Never chased", value: String(neverChased), tone: neverChased ? "amber" : "green" },
          { label: "Worst delay", value: sorted.length ? `${worst} days` : "—" },
          { label: "Clients affected", value: String(new Set(sorted.map((r) => r.business_id)).size) },
        ]}
      />

      <CACard style={{ padding: sorted.length ? 0 : 24, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24, fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading chaser queue…</div>
        ) : !sorted.length ? (
          <CAEmpty title="Nothing to chase" hint="Every document request in your portfolio is either fulfilled or still within its due date." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={caTh}>
                    <input
                      type="checkbox"
                      aria-label="Select all overdue requests"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(sorted.map((r) => r.id)))}
                    />
                  </th>
                  {["Client", "Request", "Period", "Documents", "Due", "Overdue", "Last chased", "Chases", "Predicted response", "History", ""].map((h) => (
                    <th key={h} style={caTh}>{h}</th>
                  ))}

                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const c = clients.get(r.business_id);
                  const od = daysOverdue(r.due_date);
                  return (
                    <Fragment key={r.id}>
                    <tr>

                      <td style={caTd}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.title}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                      <td style={{ ...caTd, fontWeight: 600 }}>{c?.client_name ?? "Unknown client"}</td>
                      <td style={caTd}>{r.title}</td>
                      <td style={caTd}>{r.period ?? "—"}</td>
                      <td style={{ ...caTd, color: CA.muted }}>{r.doc_types?.length ? r.doc_types.join(", ") : "—"}</td>
                      <td style={caTd}>{dateIN(r.due_date)}</td>
                      <td style={caTd}>
                        <CABadge tone={od > 14 ? "red" : od > 5 ? "amber" : "grey"}>{od} days</CABadge>
                      </td>
                      <td style={caTd}>{r.last_chased_at ? dateIN(r.last_chased_at) : "Never"}</td>
                      <td style={{ ...caTd, fontFamily: CA.mono }}>{r.chaser_count ?? 0}</td>
                      <td style={caTd}>
                        {(() => {
                          const ci = intel.get(r.business_id);
                          if (!ci || ci.avg_response_days == null) {
                            return <span style={{ color: CA.faint }}>Learning…</span>;
                          }
                          const best = ci.best_chase_day != null ? ` · best on ${DOW[ci.best_chase_day]}` : "";
                          const channel = ci.preferred_channel ? ` · ${ci.preferred_channel}` : "";
                          return (
                            <span style={{ color: CA.muted }}>
                              <span style={{ fontFamily: CA.mono, color: CA.ink }}>~{ci.avg_response_days}d</span>
                              {best}{channel}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={caTd}>
                        <button
                          onClick={() => void loadTimeline(r.id)}
                          style={{ background: "none", border: "none", color: CA.teal, fontFamily: CA.sans, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                        >
                          {timelineChaser === r.id ? "Hide" : "Timeline"}
                        </button>
                      </td>
                      <td style={{ ...caTd, textAlign: "right", whiteSpace: "nowrap" }}>

                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <CAButton onClick={() => void onChase(r)} disabled={busy === r.id}>
                            {busy === r.id ? "Chasing…" : "Chase now"}
                          </CAButton>
                          {r.last_chased_at && (
                            <CAButton variant="ghost" onClick={() => void onMarkReplied(r)} disabled={busy === r.id}>
                              Mark replied
                            </CAButton>
                          )}
                          <CAButton variant="ghost" onClick={() => void onSkip(r)}>
                            Skip
                          </CAButton>
                          <a
                            href={whatsappHref(r)}
                            target="_blank"
                            rel="noreferrer"
                            title="Chase on WhatsApp"
                            aria-label={`Chase ${c?.client_name ?? "client"} on WhatsApp`}
                            style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 32, height: 32, borderRadius: 8, textDecoration: "none",
                              border: `0.5px solid ${CA.line}`, color: CA.green, fontSize: 15,
                            }}
                          >
                            ✆
                          </a>
                        </span>
                      </td>
                    </tr>
                    {timelineChaser === r.id && (
                      <tr key={`timeline-${r.id}`}>
                        <td colSpan={12} style={{ padding: "0 14px 12px", background: "rgba(23,18,8,0.02)" }}>
                          {loadingTimeline ? (
                            <span style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint }}>Loading…</span>
                          ) : timelineEvents.length === 0 ? (
                            <span style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint }}>No events recorded yet.</span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10 }}>
                              {timelineEvents.map((e, i) => (
                                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 999, background: e.event_type.includes("escalat") ? "#A93838" : e.event_type.includes("resolv") ? "#1F5A46" : "#8B6914", marginTop: 5, flexShrink: 0 }} />
                                  <div>
                                    <span style={{ fontFamily: CA.sans, fontSize: 12, fontWeight: 600, color: CA.ink, textTransform: "capitalize" }}>{e.event_type.replace(/_/g, " ")}</span>
                                    {e.note && <span style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted }}> — {e.note}</span>}
                                    <span style={{ fontFamily: CA.mono, fontSize: 11, color: CA.faint, marginLeft: 8 }}>{dateIN(e.created_at)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );

                })}
              </tbody>
            </table>
          </div>
        )}
      </CACard>
    </div>
  );
}
