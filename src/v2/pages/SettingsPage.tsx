import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader, Badge, V } from "../ui";

const TEAM = [
  { name: "Prajwal Vakode", email: "prajwal@fynhelp.com", role: "Partner" },
  { name: "Nidhi Sharma", email: "nidhi@fynhelp.com", role: "Manager" },
  { name: "Tarun Adireddy", email: "adireddytarun@fynhelp.com", role: "Partner" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15.5, marginBottom: 14 }}>{title}</h3>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const [firm, setFirm] = useState({ name: "FynHelp Advisory LLP", city: "Hyderabad", frn: "012345S" });
  const [invite, setInvite] = useState("");

  return (
    <>
      <PageHeader title="Settings" subtitle="Firm, team and connections." />

      <Section title="Firm details">
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <div><label className="v2-label">Firm name</label><input className="v2-input" value={firm.name} onChange={(e) => setFirm({ ...firm, name: e.target.value })} /></div>
          <div><label className="v2-label">City</label><input className="v2-input" value={firm.city} onChange={(e) => setFirm({ ...firm, city: e.target.value })} /></div>
          <div><label className="v2-label">Firm registration number</label><input className="v2-input" value={firm.frn} onChange={(e) => setFirm({ ...firm, frn: e.target.value })} /></div>
        </div>
        <button className="v2-btn v2-btn-primary" style={{ marginTop: 16 }} onClick={() => toast.success("Firm details saved")}>Save changes</button>
      </Section>

      <Section title="Team members">
        <div style={{ display: "grid", gap: 10 }}>
          {TEAM.map((t) => (
            <div key={t.email} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", background: V.gray, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: V.muted }}>{t.email}</div>
              </div>
              <Badge tone="info">{t.role}</Badge>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <input className="v2-input" style={{ flex: "1 1 220px" }} placeholder="colleague@firm.com" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button className="v2-btn v2-btn-primary" onClick={() => { if (!invite.trim()) return; toast.success(`Invite sent to ${invite}`); setInvite(""); }}>Send invite</button>
        </div>
      </Section>

      <Section title="Integrations">
        <div style={{ display: "grid", gap: 12 }}>
          {[
            { name: "Gmail", desc: "Pull statements and bills straight from the inbox.", status: "Not connected" },
            { name: "WhatsApp Business", desc: "Send and receive chase messages in one thread.", status: "Not connected" },
          ].map((i) => (
            <div key={i.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", background: V.gray, borderRadius: 14, padding: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{i.name}</div>
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>{i.desc}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Badge>{i.status}</Badge>
                <button className="v2-btn v2-btn-ghost" onClick={() => toast("Connection opens once this preview goes live")}>Connect</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Profile">
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <div><label className="v2-label">Name</label><input className="v2-input" defaultValue="Prajwal Vakode" /></div>
          <div><label className="v2-label">Email</label><input className="v2-input" defaultValue="prajwal@fynhelp.com" /></div>
        </div>
        <button className="v2-btn v2-btn-primary" style={{ marginTop: 16 }} onClick={() => toast.success("Profile saved")}>Save profile</button>
      </Section>
    </>
  );
}
