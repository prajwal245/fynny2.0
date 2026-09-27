import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { PageWrap, PageHeader, Card } from "@/components/ca/ui";
import { FileText, CheckCheck, AlertTriangle, BellRing } from "lucide-react";

type ClientDocStats = {
  business_id: string;
  client_name: string;
  received: number;
  pending_review: number;
  posted: number;
  last_received: string | null;
};

type MemberStats = {
  user_id: string;
  email: string;
  role: string;
  docs_reviewed: number;
  reports_generated: number;
};

const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

export default function CAPracticeAnalyticsPage() {
  const { caFirm } = useCAAuth();
  const firmId = caFirm?.id;
  const [loading, setLoading] = useState(true);
  const [docsThisMonth, setDocsThisMonth] = useState(0);
  const [filingsThisMonth, setFilingsThisMonth] = useState(0);
  const [exceptionsResolved, setExceptionsResolved] = useState(0);
  const [activeChasers, setActiveChasers] = useState(0);
  const [clientStats, setClientStats] = useState<ClientDocStats[]>([]);
  const [memberStats, setMemberStats] = useState<MemberStats[]>([]);
  const [complianceDue, setComplianceDue] = useState(0);
  const [complianceFiled, setComplianceFiled] = useState(0);
  const [complianceOverdue, setComplianceOverdue] = useState(0);

  useEffect(() => {
    console.log("[fyn:analytics] practice analytics loaded");
  }, []);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

      const [
        { count: docs },
        { count: filings },
        { count: resolved },
        { count: chasers },
        { data: extractions },
        { data: clients },
        { data: members },
        { data: compliance },
        { data: reports },
      ] = await Promise.all([
        supabase.from("ca_document_extractions").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).gte("created_at", monthStart),
        supabase.from("ca_compliance_events").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("status", "filed").gte("updated_at", monthStart),
        supabase.from("ca_exceptions").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("status", "resolved").gte("updated_at", monthStart),
        supabase.from("ca_document_requests").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).not("status", "in", '("resolved","fulfilled")'),
        supabase.from("ca_document_extractions").select("business_id, review_state, created_at").eq("ca_firm_id", firmId).gte("created_at", monthStart).order("created_at", { ascending: false }),
        supabase.from("ca_clients").select("business_id, client_name").eq("ca_firm_id", firmId),
        supabase.from("ca_firm_members").select("user_id, invited_email, role").eq("ca_firm_id", firmId).eq("status", "active"),
        supabase.from("ca_compliance_events").select("status, due_date").eq("ca_firm_id", firmId).gte("due_date", monthStart.slice(0, 10)).lte("due_date", monthEnd),
        supabase.from("ca_reports_log").select("generated_by_user_id").eq("ca_firm_id", firmId).gte("created_at", monthStart),
      ]);

      if (cancelled) return;

      setDocsThisMonth(docs ?? 0);
      setFilingsThisMonth(filings ?? 0);
      setExceptionsResolved(resolved ?? 0);
      setActiveChasers(chasers ?? 0);

      // Client doc stats
      const clientMap = new Map((clients ?? []).map((c) => [c.business_id, c.client_name] as const));
      const byClient = new Map<string, ClientDocStats>();
      for (const ex of extractions ?? []) {
        if (!ex.business_id) continue;
        const existing = byClient.get(ex.business_id) ?? {
          business_id: ex.business_id,
          client_name: clientMap.get(ex.business_id) ?? ex.business_id,
          received: 0, pending_review: 0, posted: 0, last_received: null,
        };
        existing.received++;
        if (ex.review_state === "needs_review" || ex.review_state === "pending_verification") existing.pending_review++;
        if (ex.review_state === "posted" || ex.review_state === "auto_accepted") existing.posted++;
        if (!existing.last_received || ex.created_at > existing.last_received) existing.last_received = ex.created_at;
        byClient.set(ex.business_id, existing);
      }
      setClientStats(Array.from(byClient.values()).sort((a, b) => b.received - a.received));

      // Member stats
      const reportsByUser = new Map<string, number>();
      for (const r of reports ?? []) {
        if (r.generated_by_user_id) reportsByUser.set(r.generated_by_user_id, (reportsByUser.get(r.generated_by_user_id) ?? 0) + 1);
      }
      setMemberStats((members ?? []).map((m) => ({
        user_id: m.user_id ?? m.invited_email,
        email: m.invited_email ?? "",
        role: m.role ?? "",
        docs_reviewed: 0,
        reports_generated: m.user_id ? (reportsByUser.get(m.user_id) ?? 0) : 0,
      })));

      // Compliance
      const due = (compliance ?? []).length;
      const filed = (compliance ?? []).filter((c) => c.status === "filed").length;
      const overdue = (compliance ?? []).filter((c) => c.status !== "filed" && c.due_date < today).length;
      setComplianceDue(due);
      setComplianceFiled(filed);
      setComplianceOverdue(overdue);

      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [firmId]);

  if (!caFirm) return null;

  const caTh: CSSProperties = { padding: "8px 12px", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(23,18,8,0.4)", textAlign: "left", borderBottom: "1px solid rgba(23,18,8,0.07)", whiteSpace: "nowrap" };
  const caTd: CSSProperties = { padding: "10px 12px", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, color: "rgba(23,18,8,0.75)", borderBottom: "1px solid rgba(23,18,8,0.05)", verticalAlign: "top" };

  return (
    <PageWrap>
      <PageHeader title="Practice analytics" sub="Firm-level activity and performance across all clients this month" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Documents processed", value: docsThisMonth, icon: <FileText size={18} />, color: "#1F5A46" },
          { label: "Filings completed", value: filingsThisMonth, icon: <CheckCheck size={18} />, color: "#1F5A46" },
          { label: "Exceptions resolved", value: exceptionsResolved, icon: <AlertTriangle size={18} />, color: "#8B6914" },
          { label: "Active chasers", value: activeChasers, icon: <BellRing size={18} />, color: "#A93838" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#FFFDF9", border: "1px solid rgba(23,18,8,0.09)", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.45)", fontWeight: 500 }}>{s.label}</div>
              <div style={{ color: s.color }}>{s.icon}</div>
            </div>
            <div style={{ fontFamily: "'Georgia',serif", fontSize: 32, fontWeight: 700, color: loading ? "rgba(23,18,8,0.2)" : s.color }}>{loading ? "—" : s.value}</div>
            <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 11, color: "rgba(23,18,8,0.35)", marginTop: 4 }}>This month</div>
          </div>
        ))}
      </div>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: "#171208", marginBottom: 14 }}>Client document activity</h3>
        {loading ? (
          <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, color: "rgba(23,18,8,0.38)", padding: "20px 0" }}>Loading…</div>
        ) : clientStats.length === 0 ? (
          <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, color: "rgba(23,18,8,0.45)", padding: "24px 0", lineHeight: 1.7 }}>
            No documents have been processed yet. Upload a client bank statement from the Intake inbox or connect Gmail to start seeing analytics here.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={caTh}>Client</th>
              <th style={caTh}>Received</th>
              <th style={caTh}>Pending review</th>
              <th style={caTh}>Posted</th>
              <th style={caTh}>Last received</th>
            </tr></thead>
            <tbody>
              {clientStats.map((c) => (
                <tr key={c.business_id}>
                  <td style={{ ...caTd, fontWeight: 600, color: "#171208" }}>{c.client_name}</td>
                  <td style={caTd}>{c.received}</td>
                  <td style={{ ...caTd, color: c.pending_review > 0 ? "#8B6914" : "rgba(23,18,8,0.45)" }}>{c.pending_review}</td>
                  <td style={{ ...caTd, color: c.posted > 0 ? "#1F5A46" : "rgba(23,18,8,0.45)" }}>{c.posted}</td>
                  <td style={{ ...caTd, fontSize: 12 }}>{c.last_received ? new Date(c.last_received).toLocaleDateString("en-IN") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: "#171208", marginBottom: 14 }}>Team activity this month</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={caTh}>Member</th>
            <th style={caTh}>Role</th>
            <th style={caTh}>Reports generated</th>
          </tr></thead>
          <tbody>
            {memberStats.length === 0 ? (
              <tr><td colSpan={3} style={{ ...caTd, color: "rgba(23,18,8,0.38)", textAlign: "center", padding: "24px" }}>No team members found</td></tr>
            ) : memberStats.map((m) => (
              <tr key={m.user_id}>
                <td style={{ ...caTd, fontWeight: 600, color: "#171208" }}>{m.email}</td>
                <td style={{ ...caTd, textTransform: "capitalize" }}>{m.role}</td>
                <td style={caTd}>{m.reports_generated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: "#171208", marginBottom: 16 }}>Filing compliance — this month</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {[
            { label: "Total due", value: complianceDue, color: "rgba(23,18,8,0.75)" },
            { label: "Filed on time", value: complianceFiled, color: "#1F5A46" },
            { label: "Overdue", value: complianceOverdue, color: complianceOverdue > 0 ? "#A93838" : "rgba(23,18,8,0.45)" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontFamily: "'Georgia',serif", fontSize: 42, fontWeight: 700, color: loading ? "rgba(23,18,8,0.2)" : s.color }}>{loading ? "—" : s.value}</div>
              <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.45)", marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </PageWrap>
  );
}
