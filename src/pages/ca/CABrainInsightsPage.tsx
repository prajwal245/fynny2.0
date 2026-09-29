import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { PageWrap, PageHeader, Card, PrimaryBtn } from "@/components/ca/ui";
import { Brain, Mail } from "lucide-react";

type BrainEvent = {
  id: string;
  event_type: string;
  business_id: string | null;
  client_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type SenderMapping = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  match_method: string | null;
  confidence: number | null;
  confirmed_at: string | null;
  client_name: string | null;
};

const EVENT_LABELS: Record<string, string> = {
  gmail_connected: "Gmail connected",
  gmail_document_received: "Document via Gmail",
  gmail_client_mapped: "Sender mapped",
  gmail_match_rejected: "Gmail match rejected",
  recon_match_accepted: "Recon match confirmed",
  exception_resolved: "Exception resolved",
  period_selected: "Period selected",
  nba_clicked: "Next best action taken",
  onboarding_complete: "Onboarding completed",
  period_ready_notified: "Period ready for MIS",
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ");
}

function eventTone(type: string): string {
  if (type.includes("rejected") || type.includes("error")) return "#A93838";
  if (type.includes("gmail") || type.includes("document")) return "#8B6914";
  if (type.includes("resolved") || type.includes("complete") || type.includes("ready")) return "#1F5A46";
  return "rgba(23,18,8,0.55)";
}

export default function CABrainInsightsPage() {
  const { caFirm } = useCAAuth();
  const firmId = caFirm?.id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [eventCount, setEventCount] = useState(0);
  const [mappingCount, setMappingCount] = useState(0);
  const [events, setEvents] = useState<BrainEvent[]>([]);
  const [mappings, setMappings] = useState<SenderMapping[]>([]);

  useEffect(() => {
    console.log("[fyn:brain] brain insights loaded");
  }, []);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [
        { count: evtCount },
        { count: mapCount },
        { data: evtData },
        { data: mapData },
        { data: clients },
      ] = await Promise.all([
        supabase.from("ca_brain_events").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId),
        supabase.from("ca_email_sender_mappings").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).not("confirmed_at", "is", null),
        supabase.from("ca_brain_events").select("id, event_type, business_id, payload, created_at").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(50),
        supabase.from("ca_email_sender_mappings").select("id, sender_email, sender_name, match_method, confidence, confirmed_at, business_id").eq("ca_firm_id", firmId).not("confirmed_at", "is", null).order("confirmed_at", { ascending: false }),
        supabase.from("ca_clients").select("business_id, client_name").eq("ca_firm_id", firmId),
      ]);
      if (cancelled) return;
      const clientMap = new Map((clients ?? []).map((c) => [c.business_id, c.client_name] as const));
      setEventCount(evtCount ?? 0);
      setMappingCount(mapCount ?? 0);
      setEvents((evtData ?? []).map((e) => ({
        id: e.id,
        event_type: e.event_type,
        business_id: e.business_id,
        client_name: e.business_id ? (clientMap.get(e.business_id) ?? null) : null,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        created_at: e.created_at,
      })));
      setMappings((mapData ?? []).map((m) => ({
        id: m.id,
        sender_email: m.sender_email,
        sender_name: m.sender_name,
        match_method: m.match_method,
        confidence: m.confidence,
        confirmed_at: m.confirmed_at,
        client_name: m.business_id ? (clientMap.get(m.business_id) ?? null) : null,
      })));
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
      <PageHeader title="Brain insights" sub="What FynHelp has learned from your firm's activity" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Brain signals recorded", value: eventCount, icon: <Brain size={18} />, color: "#8B6914" },
          { label: "Sender mappings learned", value: mappingCount, icon: <Mail size={18} />, color: "#1F5A46" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#FFFDF9", border: "1px solid rgba(23,18,8,0.09)", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.45)", fontWeight: 500 }}>{s.label}</div>
              <div style={{ color: s.color }}>{s.icon}</div>
            </div>
            <div style={{ fontFamily: "'Georgia',serif", fontSize: 40, fontWeight: 700, color: loading ? "rgba(23,18,8,0.2)" : s.color }}>{loading ? "—" : s.value}</div>
          </div>
        ))}
      </div>

      {!loading && eventCount === 0 ? (
        <Card style={{ textAlign: "center", padding: "48px 32px", marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(139,105,20,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <Brain size={28} style={{ color: "#8B6914" }} />
          </div>
          <div style={{ fontFamily: "'Georgia',serif", fontSize: 20, fontWeight: 700, color: "#171208", marginBottom: 12 }}>The brain is ready — waiting for its first signal</div>
          <p style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13.5, color: "rgba(23,18,8,0.55)", maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.7 }}>
            The brain learns from your team's actions inside the portal. Every document you upload, every reconciliation match you confirm, every chaser you send, and every exception you resolve teaches the brain your firm's patterns. Once you upload your first client document and run your first reconciliation, the brain will start learning and you will see its signals here.
          </p>
          <PrimaryBtn onClick={() => navigate("/ca/intake/inbox")}>Upload first document</PrimaryBtn>
        </Card>
      ) : (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: "#171208", marginBottom: 14 }}>Recent brain signals</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={caTh}>Event</th>
              <th style={caTh}>Client</th>
              <th style={caTh}>Detail</th>
              <th style={caTh}>When</th>
            </tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={caTd}>
                    <span style={{ display: "inline-block", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(23,18,8,0.06)", color: eventTone(e.event_type) }}>
                      {eventLabel(e.event_type)}
                    </span>
                  </td>
                  <td style={{ ...caTd, fontWeight: e.client_name ? 600 : 400, color: e.client_name ? "#171208" : "rgba(23,18,8,0.35)" }}>
                    {e.client_name ?? "Firm-level"}
                  </td>
                  <td style={{ ...caTd, fontSize: 12 }}>
                    {e.payload?.filename ? String(e.payload.filename) : e.payload?.sender_email ? String(e.payload.sender_email) : e.payload?.match_method ? `via ${String(e.payload.match_method)}` : "—"}
                  </td>
                  <td style={{ ...caTd, fontSize: 12, color: "rgba(23,18,8,0.45)" }}>
                    {new Date(e.created_at).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {mappings.length > 0 && (
        <Card>
          <h3 style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 14, fontWeight: 700, color: "#171208", marginBottom: 14 }}>
            <Mail size={15} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
            Sender mappings — {mappings.length} learned
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={caTh}>Sender email</th>
              <th style={caTh}>Client</th>
              <th style={caTh}>Match method</th>
              <th style={caTh}>Confidence</th>
              <th style={caTh}>Confirmed</th>
            </tr></thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td style={{ ...caTd, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{m.sender_email}</td>
                  <td style={{ ...caTd, fontWeight: 600, color: "#171208" }}>{m.client_name ?? "—"}</td>
                  <td style={caTd}>{m.match_method ?? "—"}</td>
                  <td style={{ ...caTd, color: Number(m.confidence) >= 0.75 ? "#1F5A46" : "#8B6914" }}>
                    {m.confidence != null ? `${Math.round(Number(m.confidence) * 100)}%` : "—"}
                  </td>
                  <td style={{ ...caTd, fontSize: 12 }}>{m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString("en-IN") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageWrap>
  );
}
