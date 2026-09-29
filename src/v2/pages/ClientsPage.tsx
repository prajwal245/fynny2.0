import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Users, Plus, Search } from "lucide-react";
import { Card, EmptyState, PageHeader, V } from "../ui";
import { useV2 } from "../store";
import AddClientModal from "../components/AddClientModal";

export default function ClientsPage() {
  const { clients } = useV2();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(
    () => clients.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())),
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
            <input className="v2-input" style={{ border: "none", padding: 0 }} placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
          </Card>

          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table">
              <thead>
                <tr><th>Client</th><th>Entity type</th><th>GSTIN</th><th>Contact</th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate({ to: "/v2/clients/$clientId", params: { clientId: c.id } })}>
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
