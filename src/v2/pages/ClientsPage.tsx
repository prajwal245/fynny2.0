import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { Users, Plus, Search, ArchiveRestore } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Segmented, V } from "../ui";
import { listPracticeArchivedClients, unarchivePracticeClient } from "@/lib/practice/practice.functions";
import { RESTORE_DAYS } from "@/lib/practice/archive";
import { useV2 } from "../store";
import AddClientModal from "../components/AddClientModal";

export default function ClientsPage() {
  const { clients, refresh, canSignOff } = useV2();
  const [view, setView] = useState<"active" | "archived">("active");
  const [archived, setArchived] = useState<Awaited<ReturnType<typeof listPracticeArchivedClients>> | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const loadArchived = () => void listPracticeArchivedClients().then(setArchived).catch(() => setArchived([]));
  useEffect(loadArchived, [clients.length]);
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

      {archived && archived.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Segmented
            label="Clients view"
            value={view}
            onChange={setView}
            options={[
              { value: "active", label: "Active", count: clients.length },
              { value: "archived", label: "Archived", count: archived.length },
            ]}
          />
        </div>
      )}

      {view === "archived" && archived ? (
        <Card style={{ padding: 0 }} data-testid="archived-clients">
          <p style={{ margin: 0, padding: "14px 18px 4px", fontSize: 13, color: V.muted, lineHeight: 1.6 }}>
            Archived clients are out of the workspace and do not count toward the month's active clients. Nothing is deleted: their documents, reports and history are kept. You can restore a client for {RESTORE_DAYS} days after archiving it; after that, ask FynHelp support.
          </p>
          {archived.map((c, i) => (
            <motion.div key={c.businessId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 18px", borderTop: `1px solid ${V.line}` }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, color: V.ink }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: c.restorable ? V.muted : V.maroon }}>{c.label}</div>
              </div>
              {c.restorable ? (
                canSignOff ? (
                  <button
                    className="v2-btn v2-btn-ghost v2-btn-sm"
                    disabled={restoring === c.businessId}
                    onClick={async () => {
                      setRestoring(c.businessId);
                      try {
                        await unarchivePracticeClient({ data: { id: c.businessId } });
                        toast.success(`${c.name} is back in your clients.`);
                        await refresh();
                        loadArchived();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not restore it.");
                      } finally {
                        setRestoring(null);
                      }
                    }}
                  >
                    <ArchiveRestore size={14} /> {restoring === c.businessId ? "Restoring…" : "Restore"}
                  </button>
                ) : (
                  <Badge>A partner can restore</Badge>
                )
              ) : (
                <Badge tone="bad">Ask support</Badge>
              )}
            </motion.div>
          ))}
        </Card>
      ) : clients.length === 0 ? (
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
