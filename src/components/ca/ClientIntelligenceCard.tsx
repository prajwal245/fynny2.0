/**
 * Client Intelligence — learned patterns for THIS client only.
 * Every value shown is a statistic computed from this client's own history
 * inside this firm. Nothing here is derived from any other client or firm.
 */
import { CA, CACard, CABadge } from "./portalUi";
import { useClientIntelligence, filingRiskBand, DOW } from "@/hooks/useCAIntelligence";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: `0.5px solid ${CA.line}` }}>
      <span style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
        {label}
      </span>
      <span style={{ fontFamily: CA.sans, fontSize: 13, color: CA.ink, textAlign: "right" }}>{children}</span>
    </div>
  );
}

export function ClientIntelligenceCard({ firmId, businessId }: { firmId: string; businessId: string }) {
  const { data, loading } = useClientIntelligence(firmId, businessId);

  const heading = (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink }}>Client Intelligence</div>
      <div style={{ fontFamily: CA.sans, fontSize: 11, color: CA.faint }}>Intelligence updates nightly</div>
    </div>
  );

  if (loading) {
    return (
      <CACard style={{ padding: 18, marginTop: 16 }}>
        {heading}
        <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 10 }}>Loading intelligence…</div>
      </CACard>
    );
  }

  if (!data) {
    return (
      <CACard style={{ padding: 18, marginTop: 16 }}>
        {heading}
        <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 10 }}>
          Learning in progress — intelligence available after first month of activity.
        </div>
      </CACard>
    );
  }

  const band = filingRiskBand(data.filing_risk_score);
  const tolerance = data.match_preferences?.tolerance_pct;
  const docs = data.typical_docs_late ?? [];

  return (
    <CACard style={{ padding: 18, marginTop: 16 }}>
      {heading}
      <div style={{ marginTop: 8 }}>
        <Row label="Filing risk">
          {band ? <CABadge tone={band.tone}>{band.label}</CABadge> : "Not enough data yet"}
        </Row>
        <Row label="Typical response time">
          {data.avg_response_days != null
            ? <span style={{ fontFamily: CA.mono, fontVariantNumeric: "tabular-nums" }}>{data.avg_response_days} days</span>
            : "Not enough data yet"}
        </Row>
        <Row label="Best day to chase">
          {data.best_chase_day != null ? DOW[data.best_chase_day] : "Not enough data yet"}
        </Row>
        <Row label="Match tolerance">
          {tolerance != null ? `Recon tuned to ${tolerance}% tolerance` : "Not enough data yet"}
        </Row>
        <div style={{ paddingTop: 10 }}>
          <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
            Docs often late
          </div>
          {docs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {docs.map((d) => (
                <span
                  key={d}
                  style={{
                    fontFamily: CA.sans, fontSize: 11.5, fontWeight: 600, color: CA.amber,
                    background: "rgba(178,107,0,0.10)", padding: "4px 10px", borderRadius: 999,
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 6 }}>
              No document type is consistently late.
            </div>
          )}
        </div>
      </div>
    </CACard>
  );
}

export default ClientIntelligenceCard;
