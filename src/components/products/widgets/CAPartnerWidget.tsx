import { Users, FileCheck, Bell } from "lucide-react";
import { FYN, MetricCard, WidgetShell, ImpactStat } from "./Shared";

export default function CAPartnerWidget() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: "8px 4px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(196,30,30,0.04)",
              border: "1px solid rgba(196,30,30,0.1)",
            }}
          >
            <Users size={20} color={FYN.red} />
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: FYN.ink }}>
                Manage every client from one dashboard
              </div>
              <div style={{ fontFamily: "'Roboto', sans-serif", fontSize: 12.5, color: FYN.gray, marginTop: 2 }}>
                Portfolio view across all your CA firm's clients
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(196,30,30,0.04)",
              border: "1px solid rgba(196,30,30,0.1)",
            }}
          >
            <FileCheck size={20} color={FYN.red} />
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: FYN.ink }}>
                Bulk GST filing and ITC reconciliation
              </div>
              <div style={{ fontFamily: "'Roboto', sans-serif", fontSize: 12.5, color: FYN.gray, marginTop: 2 }}>
                File returns and reconcile ITC across clients in one flow
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(196,30,30,0.04)",
              border: "1px solid rgba(196,30,30,0.1)",
            }}
          >
            <Bell size={20} color={FYN.red} />
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: FYN.ink }}>
                Proactive client alerts and scheduled reports
              </div>
              <div style={{ fontFamily: "'Roboto', sans-serif", fontSize: 12.5, color: FYN.gray, marginTop: 2 }}>
                Never miss a filing deadline or compliance risk
              </div>
            </div>
          </div>
        </div>
      </WidgetShell>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <MetricCard label="Practice Areas" value="Tax & Audit" delta="More added soon" />
        <MetricCard label="Client Tools" value="Reports + Alerts" delta="Live now" />
      </div>

      <ImpactStat stat="Built for India's working CAs, from solo practitioners to multi-partner firms" source="FYNHelp CA Workbench" />
    </div>
  );
}
