import DashboardLayout from "@/components/DashboardLayout";
import GlobalBackBar from "@/components/GlobalBackBar";
import { Briefcase } from "lucide-react";
import { useState } from "react";

// BACKEND: SELECT plan_type, is_ca_firm FROM businesses WHERE id = current_business
// For now: toggle via query param ?ca=1 to preview portal; default = gate
const useIsCAFirm = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("ca") === "1";
};

// BACKEND: ca_clients table, JOIN businesses for each client
const clients = [
  { name: "Mehta Textile Traders", industry: "Textile", turnover: "₹8.4Cr", health: 78, cash: "Safe", filing: 5, itc: "₹2.1L" },
  { name: "Patel Exports", industry: "Export", turnover: "₹14.2Cr", health: 42, cash: "Critical", filing: 2, itc: "₹4.8L" },
  { name: "Sharma Electronics", industry: "Trading", turnover: "₹3.1Cr", health: 65, cash: "Watch", filing: 8, itc: "₹0.9L" },
  { name: "Gupta Auto Parts", industry: "Manufacturing", turnover: "₹22Cr", health: 84, cash: "Safe", filing: 12, itc: "₹1.4L" },
  { name: "Krishna Fabrics", industry: "Textile", turnover: "₹5.6Cr", health: 38, cash: "Critical", filing: 1, itc: "₹3.2L" },
  { name: "Modi Trading Co", industry: "Trading", turnover: "₹6.8Cr", health: 71, cash: "Safe", filing: 6, itc: "₹1.1L" },
];

// BACKEND: SELECT compliance_events WHERE business_id IN (ca_client_ids) AND due_date < NOW()+30
const deadlines = [
  { date: "Apr 18", filing: "GSTR-3B", clients: ["Patel Exports", "Krishna Fabrics", "Mehta Textile Traders"] },
  { date: "Apr 20", filing: "GSTR-1", clients: ["Sharma Electronics", "Modi Trading Co"] },
  { date: "Apr 30", filing: "TDS Q4", clients: ["Gupta Auto Parts", "Patel Exports", "Mehta Textile Traders", "Sharma Electronics"] },
];

const DarkMetric = ({ label, value, valueColor = "#FFFFFF", sub }: any) => (
  <div className="rounded-lg p-5" style={{ background: "#171208" }}>
    <p className="text-xs font-sans" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", fontWeight: 500 }}>{label}</p>
    <p className="mt-2" style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 36, color: valueColor, lineHeight: 1.1 }}>{value}</p>
    <p className="mt-2 text-xs font-sans" style={{ color: "rgba(255,255,255,0.60)" }}>{sub}</p>
  </div>
);

const Card = ({ children, className = "" }: any) => (
  <div className={`rounded-lg p-6 ${className}`} style={{ background: "#FFFFFF", border: "1px solid #D4C9A8" }}>{children}</div>
);

const HealthBar = ({ score }: { score: number }) => {
  const color = score >= 70 ? "#16A34A" : score >= 50 ? "#F59E0B" : "#DC2626";
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "#F0EBD8" }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{score}</span>
    </div>
  );
};

export default function CAPartnerPage() {
  const isCA = useIsCAFirm();
  const [selected, setSelected] = useState<string[]>([]);

  if (!isCA) {
    return (
      <DashboardLayout>
        <GlobalBackBar />
        <div className="max-w-[600px] mx-auto px-6 py-24 text-center font-sans">
          <Briefcase size={64} strokeWidth={1.5} color="rgba(23,18,8,0.15)" className="mx-auto" />
          <h1 className="mt-4" style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: "#171208" }}>CA Partner Hub</h1>
          <p className="mt-3 mx-auto" style={{ fontFamily: "Inter", fontSize: 15, color: "rgba(23,18,8,0.60)", maxWidth: 400 }}>
            This section is for Chartered Accountants managing multiple client portfolios on FynHelp.
          </p>
          <a href="mailto:partners@fynhelp.com" className="inline-block mt-6 px-5 py-2.5 rounded text-white text-sm font-semibold" style={{ background: "#C41E1E" }}>
            Are you a CA firm? Apply for partner access →
          </a>
        </div>
      </DashboardLayout>
    );
  }

  const toggle = (name: string) => setSelected((s) => s.includes(name) ? s.filter((n) => n !== name) : [...s, name]);

  return (
    <DashboardLayout>
      <GlobalBackBar />
      <div className="max-w-[1280px] mx-auto px-6 py-8 space-y-6 font-sans pb-24">
        <div>
          <h1 style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 28, color: "#171208" }}>CA Partner Hub</h1>
          <p className="mt-1.5" style={{ fontFamily: "Inter", fontSize: 15, color: "rgba(23,18,8,0.60)" }}>
            Your client portfolio. All in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DarkMetric label="TOTAL CLIENTS" value="60" sub="Active portfolios" />
          <DarkMetric label="NEEDING ATTENTION" value="8" valueColor="#F87171" sub="Health score below 50" />
          <DarkMetric label="FILINGS DUE THIS WEEK" value="12" valueColor="#FCD34D" sub="Across portfolio" />
          <DarkMetric label="TOTAL ITC AT RISK" value="₹24.8L" valueColor="#F87171" sub="Across all clients" />
        </div>

        {/* Client matrix */}
        <Card>
          <h2 style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 15, color: "#171208" }}>Portfolio health today</h2>
          <p className="text-xs mt-1 mb-4" style={{ color: "rgba(23,18,8,0.55)" }}>Sorted by urgency. Clients needing attention first.</p>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontFamily: "Inter", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #D4C9A8" }}>
                  <th className="py-2.5 w-8"></th>
                  {["Client", "Industry", "Turnover", "Health", "Cash", "Next Filing", "ITC Risk", ""].map((h) => (
                    <th key={h} className="text-left py-2.5 font-medium" style={{ color: "rgba(23,18,8,0.55)", fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.name} style={{ borderBottom: "1px solid #F0EBD8" }}>
                    <td className="py-2.5"><input type="checkbox" checked={selected.includes(c.name)} onChange={() => toggle(c.name)} /></td>
                    <td className="py-2.5" style={{ color: "#171208", fontWeight: 600 }}>{c.name}</td>
                    <td className="py-2.5" style={{ color: "rgba(23,18,8,0.65)" }}>{c.industry}</td>
                    <td className="py-2.5" style={{ color: "rgba(23,18,8,0.65)" }}>{c.turnover}</td>
                    <td className="py-2.5"><HealthBar score={c.health} /></td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                        background: c.cash === "Safe" ? "#F0FDF4" : c.cash === "Watch" ? "#FFFBEB" : "#FEF2F2",
                        color: c.cash === "Safe" ? "#166534" : c.cash === "Watch" ? "#8B5A00" : "#991B1B",
                      }}>{c.cash}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                        background: c.filing < 3 ? "#FEF2F2" : c.filing < 7 ? "#FFFBEB" : "#F4EDDA",
                        color: c.filing < 3 ? "#991B1B" : c.filing < 7 ? "#8B5A00" : "rgba(23,18,8,0.65)",
                      }}>{c.filing}d</span>
                    </td>
                    <td className="py-2.5" style={{ color: "#C41E1E", fontWeight: 600 }}>{c.itc}</td>
                    <td className="py-2.5"><button className="text-xs font-medium" style={{ color: "#C41E1E" }}>Open client →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Deadlines */}
        <Card>
          <h2 style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 15, color: "#171208", marginBottom: 16 }}>Upcoming filings, all clients</h2>
          <div className="space-y-4">
            {deadlines.map((d) => (
              <div key={d.date}>
                <p style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: "#171208" }}>{d.date}, {d.filing}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.clients.map((cn) => (
                    <span key={cn} className="px-2.5 py-1 rounded-full text-xs" style={{ background: "#F4EDDA", color: "rgba(23,18,8,0.75)" }}>{cn}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Add client */}
        <div className="rounded-lg py-10 text-center cursor-pointer" style={{ border: "1.5px dashed #D4C9A8" }}>
          {/* BACKEND: POST /api/ca/invite-client { email } */}
          <p style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 15, color: "rgba(23,18,8,0.50)" }}>+ Add a client to your portfolio</p>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 z-50 px-6 py-3.5 flex items-center gap-4" style={{ background: "#171208" }}>
          <span className="text-white text-sm font-medium">{selected.length} client{selected.length > 1 ? "s" : ""} selected</span>
          <div className="flex gap-2 ml-auto">
            <button className="px-3 py-1.5 rounded text-xs font-semibold text-white" style={{ background: "#C41E1E" }}>Generate reports</button>
            <button className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: "rgba(255,255,255,0.10)", color: "#FFF" }}>Export all data</button>
            <button className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: "rgba(255,255,255,0.10)", color: "#FFF" }}>Send filing reminders</button>
            <button onClick={() => setSelected([])} className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Deselect all</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
