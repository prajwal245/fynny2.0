import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { startInvoicePayment, reportManualPayment } from "@/lib/caPayments.functions";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Send, FileText, Download, AlertCircle, CheckCircle2, Clock } from "lucide-react";

const INK = "#171208";
const RED = "#C41E1E";
const BEIGE = "#F4EDDA";
const BORDER = "rgba(23,18,8,0.08)";
const GOLD = "#8B6914";
const GREEN = "#166534";
const AMBER = "#92400E";

interface CAFirmInfo {
  id: string;
  firm_name: string;
  ca_name: string | null;
  phone: string | null;
  email: string | null;
  client_reference_code: string | null;
  access_level: string | null;
  granted_at: string | null;
}

interface ComplianceEvent {
  id: string;
  event_type: string;
  filing_period: string;
  due_date: string;
  filing_date: string | null;
  status: string;
  penalty_amount: number;
}

interface Document {
  id: string;
  original_filename: string;
  document_type: string;
  filing_period: string | null;
  description: string | null;
  file_size_bytes: number | null;
  storage_path: string;
  created_at: string;
}

interface Message {
  id: string;
  sender_type: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface SharedReport {
  id: string;
  created_at: string;
  note: string | null;
  report: {
    report_name: string | null;
    report_type: string | null;
    period: string | null;
    file_path: string | null;
  } | null;
}

interface ClientInvoice {
  id: string;
  invoice_number: string | null;
  period: string | null;
  total: number | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
}

export default function MyCAPage() {
  const { user, businessId } = useAuth();

  const [caFirm, setCAFirm] = useState<CAFirmInfo | null>(null);
  const [compliance, setCompliance] = useState<ComplianceEvent[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<SharedReport[]>([]);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"compliance" | "documents" | "reports" | "invoices" | "messages">("compliance");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const startInvoicePaymentFn = useServerFn(startInvoicePayment);
  const reportManualPaymentFn = useServerFn(reportManualPayment);

  useEffect(() => {
    if (!businessId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!businessId || !caFirm?.id) return;
    const channel = supabase
      .channel("ca_client_messages:" + businessId)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "ca_client_messages",
        filter: "business_id=eq." + businessId,
      }, (payload) => {
        setMessages((prev) => {
          const next = payload.new as Message;
          if (prev.some((m) => m.id === next.id)) return prev;
          return [...prev, next];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId, caFirm?.id]);

  const loadAll = async () => {
    if (!businessId) return;
    setLoading(true);

    const { data: access } = await supabase
      .from("ca_client_access")
      .select("ca_firm_id, access_level, client_reference_code, granted_at, ca_firms(id, firm_name, ca_name, phone, email)")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!access) {
      setLoading(false);
      return;
    }

    const firm = access.ca_firms as any;
    setCAFirm({
      id: firm?.id,
      firm_name: firm?.firm_name ?? "Your CA Firm",
      ca_name: firm?.ca_name ?? null,
      phone: firm?.phone ?? null,
      email: firm?.email ?? null,
      client_reference_code: (access as any).client_reference_code,
      access_level: access.access_level,
      granted_at: access.granted_at,
    });

    const [complianceRes, docsRes, msgsRes, reportsRes, invoicesRes] = await Promise.all([
      supabase
        .from("ca_compliance_events")
        .select("id, event_type, filing_period, due_date, filing_date, status, penalty_amount")
        .eq("business_id", businessId)
        .eq("ca_firm_id", firm?.id)
        .order("due_date", { ascending: true }),
      supabase
        .from("ca_client_documents")
        .select("id, original_filename, document_type, filing_period, description, file_size_bytes, storage_path, created_at")
        .eq("business_id", businessId)
        .eq("ca_firm_id", firm?.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("ca_client_messages")
        .select("id, sender_type, sender_id, message, is_read, created_at")
        .eq("business_id", businessId)
        .eq("ca_firm_id", firm?.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("ca_report_shares")
        .select("id, created_at, note, ca_reports_log(report_name, report_type, period, file_path)")
        .eq("business_id", businessId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("ca_invoices")
        .select("id, invoice_number, period, total, status, due_date, paid_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
    ]);

    setCompliance((complianceRes.data ?? []) as ComplianceEvent[]);
    setDocuments((docsRes.data ?? []) as Document[]);
    setMessages((msgsRes.data ?? []) as Message[]);
    setReports(((reportsRes.data ?? []) as any[]).map(r => ({
      id: r.id,
      created_at: r.created_at,
      note: r.note,
      report: r.ca_reports_log ?? null,
    })));
    setInvoices((invoicesRes.data ?? []) as ClientInvoice[]);
    setLoading(false);

    if (firm?.id) {
      await supabase
        .from("ca_client_messages")
        .update({ is_read: true })
        .eq("business_id", businessId)
        .eq("ca_firm_id", firm.id)
        .eq("sender_type", "ca")
        .eq("is_read", false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !caFirm?.id || !businessId || !user) return;
    setSending(true);
    const { error } = await supabase.from("ca_client_messages").insert({
      ca_firm_id: caFirm.id,
      business_id: businessId,
      sender_type: "client",
      sender_id: user.id,
      message: newMessage.trim(),
    });
    if (error) toast.error("Could not send message");
    else setNewMessage("");
    setSending(false);
  };

  const downloadDocument = async (doc: Document) => {
    const { data, error } = await supabase.storage
      .from("ca-client-documents")
      .createSignedUrl(doc.storage_path, 3600);
    if (error || !data) { toast.error("Could not generate download link"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const downloadReport = async (r: SharedReport) => {
    if (!r.report?.file_path) { toast.error("This report has no file attached"); return; }
    const { data, error } = await supabase.storage
      .from("ca-reports")
      .createSignedUrl(r.report.file_path, 3600);
    if (error || !data) { toast.error("Could not generate download link"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const payInvoice = async (inv: ClientInvoice) => {
    setPayingId(inv.id);
    try {
      const res = await startInvoicePaymentFn({ data: { invoiceId: inv.id } });
      if (res.alreadyPaid) { toast.success("This invoice is already marked paid"); return; }
      if (!res.configured) {
        toast.info("Online payment is not switched on yet — pay your CA directly and record the reference below.");
        const reference = window.prompt("Payment reference (UTR / UPI transaction id)")?.trim();
        if (!reference || reference.length < 3) return;
        await reportManualPaymentFn({ data: { invoiceId: inv.id, reference, method: "upi" } });
        toast.success("Your CA has been notified of the payment");
        return;
      }
      if (res.paymentUrl) window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setPayingId(null);
    }
  };

  const formatMoney = (n: number | null) =>
    "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const daysUntil = (d: string) =>
    Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

  const statusColor = (status: string, due: string) => {
    if (status === "filed") return GREEN;
    if (daysUntil(due) < 0) return RED;
    if (daysUntil(due) <= 7) return "#D97706";
    return GOLD;
  };

  const statusIcon = (status: string, due: string) => {
    if (status === "filed") return <CheckCircle2 size={14} style={{ color: GREEN }} />;
    if (daysUntil(due) < 0) return <AlertCircle size={14} style={{ color: RED }} />;
    return <Clock size={14} style={{ color: GOLD }} />;
  };

  if (loading) {
    return (
      <div style={{ padding: "48px 32px", fontFamily: "Inter, sans-serif", color: INK, opacity: 0.5 }}>
        Loading your CA information...
      </div>
    );
  }

  if (!caFirm) {
    return (
      <div style={{ padding: "48px 32px", maxWidth: 480, fontFamily: "Inter, sans-serif", color: INK }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 500, marginBottom: 8 }}>
          No CA connected
        </h1>
        <p style={{ fontSize: 14, color: "rgba(23,18,8,0.6)", lineHeight: 1.6, marginBottom: 24 }}>
          Your chartered accountant has not connected to your FYNHelp account yet. Share your business profile with your CA and ask them to connect via the FYNHelp CA Partner Portal.
        </p>
        <div style={{ background: BEIGE, border: "0.5px solid " + BORDER, borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "rgba(23,18,8,0.7)" }}>
          Your CA needs your registered email address to connect their firm to your account.
        </div>
      </div>
    );
  }

  const upcomingCount = compliance.filter(c => c.status !== "filed" && daysUntil(c.due_date) >= 0).length;
  const overdueCount = compliance.filter(c => c.status !== "filed" && daysUntil(c.due_date) < 0).length;
  const unreadCount = messages.filter(m => m.sender_type === "ca" && !m.is_read).length;

  return (
    <div style={{ padding: "32px", minHeight: "100vh", background: BEIGE, fontFamily: "Inter, sans-serif" }}>

      <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(23,18,8,0.4)", letterSpacing: "0.02em" }}>
        Dashboard / My CA
      </div>

      <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: INK, marginBottom: 4, lineHeight: 1.2 }}>
        Your CA Partner
      </h1>
      <p style={{ fontSize: 14, color: "rgba(23,18,8,0.55)", marginBottom: 28 }}>
        Track filings, access documents, and message your CA from one place.
      </p>

      <div style={{ background: "white", border: "0.5px solid " + BORDER, borderRadius: 12, padding: "24px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: GOLD, marginBottom: 6 }}>
              Connected CA firm
            </div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 500, color: INK, marginBottom: 4 }}>
              {caFirm.firm_name}
            </div>
            {caFirm.ca_name && (
              <div style={{ fontSize: 14, color: "rgba(23,18,8,0.65)", marginBottom: 2 }}>
                {caFirm.ca_name}
              </div>
            )}
            {caFirm.email && (
              <div style={{ fontSize: 13, color: RED }}>
                {caFirm.email}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            {caFirm.client_reference_code && (
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, background: BEIGE, border: "0.5px solid " + BORDER, borderRadius: 6, padding: "6px 12px", color: INK, letterSpacing: "0.05em" }}>
                Ref: {caFirm.client_reference_code}
              </div>
            )}
            <div style={{ fontSize: 12, color: "rgba(23,18,8,0.45)" }}>
              Connected {caFirm.granted_at ? formatDate(caFirm.granted_at) : "recently"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 20 }}>
          {[
            { label: "Upcoming Filings", value: String(upcomingCount), color: upcomingCount > 0 ? AMBER : GREEN },
            { label: "Overdue Filings", value: String(overdueCount), color: overdueCount > 0 ? RED : GREEN },
            { label: "Shared Documents", value: String(documents.length), color: INK },
          ].map(m => (
            <div key={m.label} style={{ background: BEIGE, borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "rgba(23,18,8,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, fontWeight: 500, color: m.color }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid " + BORDER, marginBottom: 20 }}>
        {(["compliance", "documents", "reports", "invoices", "messages"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "Inter, sans-serif",
              border: "none",
              borderBottom: activeTab === t ? "2px solid " + RED : "2px solid transparent",
              background: "transparent",
              color: activeTab === t ? RED : "rgba(23,18,8,0.5)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              textTransform: "capitalize",
            }}
          >
            {t}
            {t === "messages" && unreadCount > 0 && (
              <span style={{ background: RED, color: "white", fontSize: 10, fontWeight: 600, borderRadius: "99px", padding: "1px 6px" }}>
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "compliance" && (
        <div style={{ background: "white", border: "0.5px solid " + BORDER, borderRadius: 12, overflow: "hidden" }}>
          {compliance.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", fontSize: 14, color: "rgba(23,18,8,0.4)" }}>
              No compliance events have been added by your CA yet.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: BEIGE }}>
                  {["Filing type", "Period", "Due date", "Status", "Penalty"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(23,18,8,0.5)", borderBottom: "0.5px solid " + BORDER }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compliance.map((c, i) => (
                  <tr key={c.id} style={{ borderTop: i > 0 ? "0.5px solid " + BORDER : "none" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {statusIcon(c.status, c.due_date)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: INK }}>{c.event_type}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "rgba(23,18,8,0.65)" }}>{c.filing_period}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontSize: 13, color: statusColor(c.status, c.due_date), fontWeight: c.status !== "filed" && daysUntil(c.due_date) <= 7 ? 600 : 400 }}>
                        {formatDate(c.due_date)}
                      </div>
                      {c.status !== "filed" && (
                        <div style={{ fontSize: 11, color: "rgba(23,18,8,0.4)", marginTop: 2 }}>
                          {daysUntil(c.due_date) < 0
                            ? Math.abs(daysUntil(c.due_date)) + " days overdue"
                            : daysUntil(c.due_date) + " days left"}
                        </div>
                      )}
                      {c.status === "filed" && c.filing_date && (
                        <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>Filed {formatDate(c.filing_date)}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: "99px",
                        background: c.status === "filed" ? "#DCFCE7" : daysUntil(c.due_date) < 0 ? "#FEE2E2" : "#FEF3C7",
                        color: c.status === "filed" ? GREEN : daysUntil(c.due_date) < 0 ? RED : AMBER,
                        textTransform: "capitalize",
                      }}>
                        {c.status === "filed" ? "Filed" : daysUntil(c.due_date) < 0 ? "Overdue" : "Pending"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: c.penalty_amount > 0 ? RED : "rgba(23,18,8,0.35)" }}>
                      {c.penalty_amount > 0 ? "Rs " + c.penalty_amount.toLocaleString("en-IN") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div style={{ background: "white", border: "0.5px solid " + BORDER, borderRadius: 12, overflow: "hidden" }}>
          {documents.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <FileText size={32} style={{ color: "rgba(23,18,8,0.2)", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 14, color: "rgba(23,18,8,0.4)" }}>No documents shared by your CA yet.</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: BEIGE }}>
                  {["Document", "Type", "Period", "Size", "Shared on", ""].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(23,18,8,0.5)", borderBottom: "0.5px solid " + BORDER }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, i) => (
                  <tr key={doc.id} style={{ borderTop: i > 0 ? "0.5px solid " + BORDER : "none" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FileText size={16} style={{ color: GOLD, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: INK }}>{doc.original_filename}</span>
                      </div>
                      {doc.description && (
                        <div style={{ fontSize: 12, color: "rgba(23,18,8,0.45)", marginTop: 3, paddingLeft: 24 }}>{doc.description}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "rgba(23,18,8,0.6)", textTransform: "capitalize" }}>
                      {doc.document_type.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "rgba(23,18,8,0.65)" }}>{doc.filing_period || "-"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", color: "rgba(23,18,8,0.5)" }}>
                      {formatSize(doc.file_size_bytes)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>{formatDate(doc.created_at)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => downloadDocument(doc)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: RED, background: "none", border: "none", cursor: "pointer" }}
                      >
                        <Download size={13} /> Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div style={{ background: "white", border: "0.5px solid " + BORDER, borderRadius: 12, overflow: "hidden" }}>
          {reports.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", fontSize: 14, color: "rgba(23,18,8,0.4)" }}>
              Your CA has not shared any reports with you yet.
            </div>
          ) : (
            reports.map((r, i) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", borderTop: i > 0 ? "0.5px solid " + BORDER : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <FileText size={15} style={{ color: GOLD, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: INK }}>
                      {r.report?.report_name ?? r.report?.report_type ?? "Report"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(23,18,8,0.45)", marginTop: 2 }}>
                      {[r.report?.period, "Shared " + formatDate(r.created_at)].filter(Boolean).join(" · ")}
                      {r.note ? " · " + r.note : ""}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => downloadReport(r)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: RED, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                >
                  <Download size={13} /> Download
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "invoices" && (
        <div style={{ background: "white", border: "0.5px solid " + BORDER, borderRadius: 12, overflow: "hidden" }}>
          {invoices.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", fontSize: 14, color: "rgba(23,18,8,0.4)" }}>
              No invoices from your CA yet.
            </div>
          ) : (
            invoices.map((inv, i) => {
              const paid = inv.status === "paid";
              return (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", borderTop: i > 0 ? "0.5px solid " + BORDER : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: INK }}>
                      {inv.invoice_number ?? "Invoice"} {inv.period ? "· " + inv.period : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(23,18,8,0.45)", marginTop: 2 }}>
                      {paid
                        ? "Paid " + (inv.paid_at ? formatDate(inv.paid_at) : "")
                        : inv.due_date ? "Due " + formatDate(inv.due_date) : "Payment pending"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, fontWeight: 500, color: paid ? GREEN : INK }}>
                      {formatMoney(inv.total)}
                    </div>
                    {!paid && (
                      <button
                        onClick={() => payInvoice(inv)}
                        disabled={payingId === inv.id}
                        style={{ height: 32, padding: "0 14px", borderRadius: 7, background: RED, color: "white", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: payingId === inv.id ? 0.6 : 1 }}
                      >
                        {payingId === inv.id ? "Starting…" : "Pay now"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "messages" && (
        <div style={{ background: "white", border: "0.5px solid " + BORDER, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: 480 }}>
          <div style={{ padding: "12px 16px", borderBottom: "0.5px solid " + BORDER, fontSize: 12, color: "rgba(23,18,8,0.4)", fontWeight: 500 }}>
            Conversation with {caFirm.firm_name}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(23,18,8,0.4)" }}>
                No messages yet. Send your CA a message below.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map(m => {
                  const isClient = m.sender_type === "client";
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isClient ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "70%", padding: "10px 14px", borderRadius: 10,
                        background: isClient ? RED : BEIGE,
                        color: isClient ? "white" : INK,
                        fontSize: 13, lineHeight: 1.5,
                      }}>
                        <div>{m.message}</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: "right" }}>
                          {new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "0.5px solid " + BORDER, display: "flex", gap: 10 }}>
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message to your CA..."
              style={{ flex: 1, height: 40, padding: "0 14px", fontSize: 13, border: "0.5px solid rgba(23,18,8,0.15)", borderRadius: 8, fontFamily: "Inter, sans-serif", outline: "none", background: BEIGE }}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              style={{ height: 40, width: 40, borderRadius: 8, background: RED, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: !newMessage.trim() || sending ? 0.5 : 1 }}
            >
              <Send size={16} color="white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
