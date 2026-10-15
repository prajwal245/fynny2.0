import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Users, Plus, Search } from "lucide-react";
import { Card, EmptyState, PageHeader, V } from "../ui";
import { useV2 } from "../store";
import AddClientModal from "../components/AddClientModal";

export default function ClientsPage() {
  const { clients } = useV2();
  const [q, setQ] = useState("");
  // "?add=1" (from the first-run guide) opens Add client straight away.
  const [adding, setAdding] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1");
  const navigate = useNavigate();

  const filtered = useMemo(
    () => {
      const needle = q.trim().toLowerCase();
      if (!needle) return clients;
      // Name, GSTIN, PAN (characters 3 to 12 of the GSTIN), contact person and email.
      return clients.filter((c) =>
        [c.name, c.gstin, c.gstin ? c.gstin.slice(2, 12) : "", c.contactName, c.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      );
    },
    [clients, q],
  );

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Every entity your firm looks after."
        action={<button className="v2-btn v2-btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add client</button>}
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="No clients yet"
          description="Add a client to start collecting documents, running reconciliation and sending monthly reports."
          action={<button className="v2-btn v2-btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add client</button>}
        />
      ) : (
        <>
          <Card style={{ padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Search size={16} color={V.muted} />
            <input className="v2-input" style={{ border: "none", padding: 0 }} placeholder="Search by name, GSTIN, PAN, contact or email" aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
          </Card>

          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table v2-table-stack">
              <thead>
                <tr><th>Client</th><th>Entity type</th><th>GSTIN</th><th>Contact</th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate({ to: "/app/clients/$clientId", params: { clientId: c.id } })}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: V.body }}>{c.entityType}</td>
                    <td className="num" style={{ color: V.body }}>{c.gstin || "Not provided"}</td>
                    <td style={{ color: V.body }}>{c.contactName || "Not provided"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} style={{ color: V.muted, textAlign: "center", padding: 30 }}>No clients match that search.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <AddClientModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
