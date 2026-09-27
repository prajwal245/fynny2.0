/**
 * Billing OS — invoices raised by the firm against client engagements.
 *
 * Everything here is real: invoices live in `ca_invoices`, numbering is
 * sequential per firm per calendar year, and every status change writes an
 * immutable `ca_audit_events` row.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import {
  CA, CACard, CAButton, CABadge, CAField, CAEmpty, caInputStyle, inr, dateIN,
  caTd, caTh, caNum, statusTone,
} from "@/components/ca/portalUi";
import { ModuleHeader, StatStrip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";
import { Plus, Trash2, X } from "lucide-react";

interface LineItem { description: string; amount: number }

interface InvoiceRow {
  id: string;
  ca_firm_id: string;
  business_id: string;
  engagement_id: string | null;
  invoice_number: string;
  period: string;
  line_items: LineItem[];
  subtotal: number;
  gst_rate: number;
  gst_amount: number;
  total: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_ref: string | null;
  created_at: string;
}

interface EngagementOption {
  id: string;
  business_id: string;
  name: string;
  fee_amount: number | null;
}

const TABS = ["drafts", "sent", "paid"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { drafts: "Drafts", sent: "Sent", paid: "Paid" };
const GST_RATES = [0, 5, 12, 18];

const monthKey = (d = new Date()) =>
  `${d.toLocaleString("en-IN", { month: "short" })} ${d.getFullYear()}`;

const emptyDraft = () => ({
  business_id: "",
  engagement_id: "",
  period: monthKey(),
  gst_rate: 18,
  due_date: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
  items: [{ description: "", amount: "" }] as { description: string; amount: string }[],
});

export default function CABillingPage() {
  const { firmId } = useCAPortal();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [firmName, setFirmName] = useState("");
  const [tab, setTab] = useState<Tab>("drafts");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<InvoiceRow | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const clientName = useCallback(
    (businessId: string) => clients.find((c) => c.business_id === businessId)?.client_name ?? "Unknown client",
    [clients],
  );
  const engagementName = useCallback(
    (id: string | null) => (id ? engagements.find((e) => e.id === id)?.name ?? "—" : "—"),
    [engagements],
  );

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const [inv, eng, firm] = await Promise.all([
      supabase.from("ca_invoices").select("*").eq("ca_firm_id", firmId).order("created_at", { ascending: false }),
      supabase.from("ca_engagements").select("id, business_id, name, fee_amount").eq("ca_firm_id", firmId),
      supabase.from("ca_firms").select("firm_name").eq("id", firmId).maybeSingle(),
    ]);
    if (inv.error) toast.error(inv.error.message);
    setRows(((inv.data ?? []) as unknown as InvoiceRow[]).map((r) => ({
      ...r,
      line_items: Array.isArray(r.line_items) ? r.line_items : [],
    })));
    setEngagements((eng.data ?? []) as EngagementOption[]);
    setFirmName(firm.data?.firm_name ?? "Your firm");
    setLoading(false);
  }, [firmId]);

  useEffect(() => { void load(); }, [load]);

  // ---- derived ----
  const visible = useMemo(
    () => rows.filter((r) => (tab === "drafts" ? r.status === "draft" : tab === "sent" ? r.status === "sent" : r.status === "paid")),
    [rows, tab],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const billed = rows
      .filter((r) => r.status !== "draft" && String(r.created_at).slice(0, 7) === thisMonth)
      .reduce((s, r) => s + Number(r.total || 0), 0);
    const collected = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.total || 0), 0);
    const outstanding = rows.filter((r) => r.status === "sent").reduce((s, r) => s + Number(r.total || 0), 0);
    const overdue = rows
      .filter((r) => r.status === "sent" && r.due_date && new Date(r.due_date) < now)
      .reduce((s, r) => s + Number(r.total || 0), 0);
    return { billed, collected, outstanding, overdue };
  }, [rows]);

  const draftTotals = useMemo(() => {
    const subtotal = draft.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const gst = Math.round(subtotal * (draft.gst_rate / 100) * 100) / 100;
    return { subtotal, gst, total: subtotal + gst };
  }, [draft]);

  const draftEngagements = engagements.filter((e) => e.business_id === draft.business_id);

  // ---- actions ----
  const nextInvoiceNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data } = await supabase
      .from("ca_invoices")
      .select("invoice_number")
      .eq("ca_firm_id", firmId!)
      .like("invoice_number", `${prefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(1);
    const last = data?.[0]?.invoice_number as string | undefined;
    const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
  };

  const createInvoice = async () => {
    if (!firmId) return;
    const items: LineItem[] = draft.items
      .filter((i) => i.description.trim() && Number(i.amount) > 0)
      .map((i) => ({ description: i.description.trim(), amount: Number(i.amount) }));

    const errs: Record<string, string> = {};
    if (!draft.business_id) errs.business_id = "Pick the client to bill";
    if (!draft.period.trim()) errs.period = "Enter the billing period";
    if (!items.length) errs.items = "Add at least one line with a description and an amount above zero";
    if (!GST_RATES.includes(draft.gst_rate)) errs.gst_rate = "Pick a valid GST rate";
    setFormErrors(errs);
    if (Object.keys(errs).length) return toast.error("Please fix the highlighted fields");

    setBusy(true);
    let created: { id: string; invoice_number: string } | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const invoice_number = await nextInvoiceNumber();
      const { data, error } = await supabase
        .from("ca_invoices")
        .insert({
          ca_firm_id: firmId,
          business_id: draft.business_id,
          engagement_id: draft.engagement_id || null,
          invoice_number,
          period: draft.period.trim(),
          line_items: items as never,
          subtotal: draftTotals.subtotal,
          gst_rate: draft.gst_rate,
          gst_amount: draftTotals.gst,
          total: draftTotals.total,
          status: "draft",
          due_date: draft.due_date || null,
        })
        .select("id, invoice_number")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") continue; // number raced, retry
        setBusy(false);
        return toast.error(error.message);
      }
      created = data as { id: string; invoice_number: string };
    }
    setBusy(false);
    if (!created) return toast.error("Could not allocate an invoice number, please retry");

    await logCAAudit({
      firmId, businessId: draft.business_id, entityType: "invoice", entityId: created.id,
      action: "invoice_created",
      detail: { invoice_number: created.invoice_number, total: draftTotals.total, period: draft.period },
    });
    toast.success(`Invoice ${created.invoice_number} created as a draft`);
    setShowForm(false);
    setDraft(emptyDraft());
    setTab("drafts");
    void load();
  };

  const markSent = async (row: InvoiceRow) => {
    if (!firmId) return;
    const { error } = await supabase.from("ca_invoices").update({ status: "sent" }).eq("id", row.id);
    if (error) return toast.error(error.message);
    await supabase.from("ca_notifications").insert({
      ca_firm_id: firmId,
      business_id: row.business_id,
      type: "billing",
      severity: "info",
      title: `Invoice ${row.invoice_number} sent`,
      message: `${inr(row.total)} billed to ${clientName(row.business_id)} for ${row.period}.`,
      metadata: { invoice_id: row.id, invoice_number: row.invoice_number } as never,
    });
    await logCAAudit({
      firmId, businessId: row.business_id, entityType: "invoice", entityId: row.id,
      action: "invoice_sent", detail: { invoice_number: row.invoice_number, total: row.total },
    });
    toast.success(`Invoice ${row.invoice_number} marked as sent`);
    setPreview(null);
    void load();
  };

  const recordPayment = async (row: InvoiceRow) => {
    if (!firmId) return;
    const ref = window.prompt(`Payment reference for ${row.invoice_number} (UTR / cheque no.)`);
    if (ref === null) return;
    const { error } = await supabase
      .from("ca_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_ref: ref.trim() || null })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId, businessId: row.business_id, entityType: "invoice", entityId: row.id,
      action: "invoice_paid", detail: { invoice_number: row.invoice_number, total: row.total, payment_ref: ref.trim() },
    });
    toast.success(`Payment recorded for ${row.invoice_number}`);
    setPreview(null);
    void load();
  };

  // ---- render ----
  return (
    <div>
      <ModuleHeader
        title="Billing"
        subtitle="Raise invoices against engagements, track what has been sent and what has actually been collected."
        right={<CAButton onClick={() => { setDraft(emptyDraft()); setFormErrors({}); setShowForm(true); }}>Generate invoice</CAButton>}
      />

      <StatStrip
        items={[
          { label: "Billed this month", value: inr(stats.billed) },
          { label: "Collected", value: inr(stats.collected) },
          { label: "Outstanding", value: inr(stats.outstanding) },
          { label: "Overdue", value: inr(stats.overdue) },
        ]}
      />

      <div style={{ display: "flex", gap: 6, borderBottom: `0.5px solid ${CA.line}`, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: CA.sans, fontSize: 13, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? CA.teal : CA.muted, background: "none", border: "none",
              padding: "10px 14px", cursor: "pointer",
              borderBottom: tab === t ? `2px solid ${CA.teal}` : "2px solid transparent",
            }}
          >
            {TAB_LABEL[t]} ({rows.filter((r) => (t === "drafts" ? r.status === "draft" : r.status === t.slice(0, -1) || r.status === t)).length})
          </button>
        ))}
      </div>

      <CACard style={{ overflow: "hidden" }}>
        {loading ? (
          <CAEmpty title="Loading invoices…" />
        ) : visible.length === 0 ? (
          <CAEmpty title={`No ${TAB_LABEL[tab].toLowerCase()} invoices`} hint="Generate an invoice from an engagement to get started." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={caTh}>Invoice</th>
                  <th style={caTh}>Client</th>
                  <th style={caTh}>Engagement</th>
                  <th style={caTh}>Period</th>
                  <th style={{ ...caTh, textAlign: "right" }}>Total</th>
                  <th style={caTh}>Due</th>
                  <th style={caTh}>Status</th>
                  <th style={caTh} />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setPreview(r)}>
                    <td style={{ ...caTd, fontFamily: CA.mono }}>{r.invoice_number}</td>
                    <td style={caTd}>{clientName(r.business_id)}</td>
                    <td style={caTd}>{engagementName(r.engagement_id)}</td>
                    <td style={caTd}>{r.period}</td>
                    <td style={caNum}>{inr(r.total)}</td>
                    <td style={caTd}>{dateIN(r.due_date)}</td>
                    <td style={caTd}>
                      {r.status === "sent" && r.due_date && new Date(r.due_date) < new Date() ? (
                        <CABadge tone="red">overdue</CABadge>
                      ) : (
                        <CABadge tone={statusTone(r.status)}>{r.status}</CABadge>
                      )}
                    </td>

                    <td style={{ ...caTd, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      {r.status === "draft" && <CAButton variant="ghost" onClick={() => markSent(r)}>Mark as sent</CAButton>}
                      {r.status === "sent" && <CAButton variant="ghost" onClick={() => recordPayment(r)}>Record payment</CAButton>}
                      {r.status === "paid" && <span style={{ fontSize: 12.5, color: CA.faint }}>{r.payment_ref ?? "Paid"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CACard>

      {/* ---- Create invoice modal ---- */}
      {showForm && (
        <Modal title="Generate invoice" onClose={() => setShowForm(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <CAField label="Client" error={formErrors.business_id}>
              <select
                style={caInputStyle}
                value={draft.business_id}
                onChange={(e) => setDraft((d) => ({ ...d, business_id: e.target.value, engagement_id: "" }))}
              >
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.business_id} value={c.business_id}>{c.client_name}</option>)}
              </select>
            </CAField>
            <CAField label="Engagement (optional)">
              <select
                style={caInputStyle}
                value={draft.engagement_id}
                onChange={(e) => {
                  const eng = draftEngagements.find((x) => x.id === e.target.value);
                  setDraft((d) => ({
                    ...d,
                    engagement_id: e.target.value,
                    items: eng && d.items.length === 1 && !d.items[0].description
                      ? [{ description: eng.name, amount: eng.fee_amount ? String(eng.fee_amount) : "" }]
                      : d.items,
                  }));
                }}
                disabled={!draft.business_id}
              >
                <option value="">None</option>
                {draftEngagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </CAField>
            <CAField label="Period" error={formErrors.period}>
              <input style={caInputStyle} value={draft.period} onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value }))} placeholder="Apr 2026" />
            </CAField>
            <CAField label="Due date">
              <input type="date" style={caInputStyle} value={draft.due_date} onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))} />
            </CAField>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: CA.faint, marginBottom: 8 }}>
              Line items
            </div>
            {draft.items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  style={{ ...caInputStyle, flex: 1 }}
                  placeholder="Description (e.g. GST compliance — Apr 2026)"
                  value={item.description}
                  onChange={(e) => setDraft((d) => ({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) }))}
                />
                <input
                  style={{ ...caInputStyle, width: 150, fontFamily: CA.mono }}
                  placeholder="Amount"
                  inputMode="decimal"
                  value={item.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) }))}
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, j) => j !== i) : d.items }))}
                  style={{ background: "none", border: `0.5px solid ${CA.line}`, borderRadius: 6, cursor: "pointer", padding: "0 10px", color: CA.muted }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            <CAButton variant="ghost" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { description: "", amount: "" }] }))}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} aria-hidden="true" /> Add line</span>
            </CAButton>
            {formErrors.items && (
              <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.red, marginTop: 6 }}>{formErrors.items}</div>
            )}
          </div>


          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginTop: 18 }}>
            <CAField label="GST rate" error={formErrors.gst_rate}>
              <select style={{ ...caInputStyle, width: 140 }} value={draft.gst_rate} onChange={(e) => setDraft((d) => ({ ...d, gst_rate: Number(e.target.value) }))}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </CAField>
            <div style={{ textAlign: "right", fontFamily: CA.mono, fontSize: 13 }}>
              <div>Subtotal <b>{inr(draftTotals.subtotal)}</b></div>
              <div>GST ({draft.gst_rate}%) <b>{inr(draftTotals.gst)}</b></div>
              <div style={{ fontSize: 17, marginTop: 4 }}>Total <b>{inr(draftTotals.total)}</b></div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <CAButton variant="ghost" onClick={() => setShowForm(false)}>Cancel</CAButton>
            <CAButton onClick={createInvoice} disabled={busy}>{busy ? "Saving…" : "Create draft invoice"}</CAButton>
          </div>
        </Modal>
      )}

      {/* ---- Invoice preview ---- */}
      {preview && (
        <Modal title={`Invoice ${preview.invoice_number}`} onClose={() => setPreview(null)}>
          <div style={{ fontFamily: CA.sans, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
              <div>
                <div style={{ fontFamily: CA.serif, fontSize: 18, fontWeight: 700 }}>{firmName}</div>
                <div style={{ color: CA.muted, marginTop: 4 }}>Tax invoice</div>
              </div>
              <div style={{ textAlign: "right", color: CA.muted }}>
                <div>Billed to <b style={{ color: CA.ink }}>{clientName(preview.business_id)}</b></div>
                <div>Period {preview.period}</div>
                <div>Due {dateIN(preview.due_date)}</div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
              <thead><tr><th style={caTh}>Description</th><th style={{ ...caTh, textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>
                {preview.line_items.map((li, i) => (
                  <tr key={i}><td style={caTd}>{li.description}</td><td style={caNum}>{inr(li.amount)}</td></tr>
                ))}
                <tr><td style={caTd}>Subtotal</td><td style={caNum}>{inr(preview.subtotal)}</td></tr>
                <tr><td style={caTd}>GST ({preview.gst_rate}%)</td><td style={caNum}>{inr(preview.gst_amount)}</td></tr>
                <tr><td style={{ ...caTd, fontWeight: 700 }}>Total</td><td style={{ ...caNum, fontWeight: 700 }}>{inr(preview.total)}</td></tr>
              </tbody>
            </table>

            <div style={{ marginTop: 18, padding: 12, background: CA.tealSoft, borderRadius: 8, color: CA.muted, fontSize: 12.5 }}>
              <b style={{ color: CA.ink }}>Bank details</b>
              <div>Add your firm's bank account, IFSC and UPI ID in Settings to print them here.</div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              {preview.status === "draft" && <CAButton onClick={() => markSent(preview)}>Mark as sent</CAButton>}
              {preview.status === "sent" && <CAButton onClick={() => recordPayment(preview)}>Record payment</CAButton>}
              <CAButton variant="ghost" onClick={() => setPreview(null)}>Close</CAButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(15,20,18,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#FFFFFF", borderRadius: 12, maxWidth: 760, width: "100%", maxHeight: "88vh", overflow: "auto", padding: 24, border: `0.5px solid ${CA.line}` }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700 }}>{title}</div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: CA.muted }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
