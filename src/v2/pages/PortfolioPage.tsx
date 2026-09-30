import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Users, Plus } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Stat, V, formatDate, Tone } from "../ui";
import { AgentStatusBadge, AnimatedCounter, ProcessingCard } from "../agents";
import { useV2 } from "../store";
import { CloseProgress } from "../components/CloseProgress";
import AddClientModal from "../components/AddClientModal";

export default function PortfolioPage() {
  const { clients, docs, review, exceptions, chases, runs, dismissRun, period, role, closeStateFor } = useV2();
  const [adding, setAdding] = useState(false);

  const openEx = exceptions.filter((e) => e.status === "open");
  const openRev = review.filter((r) => r.status === "open");
  const openChase = chases.filter((c) => c.status !== "Resolved");

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={role === "Partner"
          ? `Where every client stands in the ${period} close.`
          : `What needs you today across the ${period} close.`}
        action={<button className="v2-btn v2-btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add client</button>}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {(["extract", "recon", "narrate", "chaser"] as const).map((a) => (
          <AgentStatusBadge key={a} agent={a} active={runs.some((r) => r.agent === a && r.status === "running")} />
        ))}
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: runs.length ? 18 : 0 }}>
        <AnimatePresence>
          {runs.map((r) => (
            <ProcessingCard key={r.id} run={r} onDismiss={() => dismissRun(r.id)} />
          ))}
        </AnimatePresence>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="Add your first client to get started"
          description="Once a client is added, their documents, reconciliation exceptions and MIS reports appear here."
          action={<button className="v2-btn v2-btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add client</button>}
        />
      ) : (
        <>
          <div className="v2-grid-cards" style={{ marginBottom: 22 }}>
            <Stat label="Clients" value={<AnimatedCounter value={clients.length} />} hint="Active engagements" />
            <Stat label="Open exceptions" value={<AnimatedCounter value={openEx.length} />} tone={openEx.length ? "bad" : "neutral"} hint="Across the portfolio" />
            <Stat label="Awaiting review" value={<AnimatedCounter value={openRev.length} />} hint="Low confidence extractions" />
            <Stat label="Open chases" value={<AnimatedCounter value={openChase.length} />} hint="Documents still pending" />
          </div>

          <div className="v2-grid-cards">
            <AnimatePresence initial={false}>
              {clients.map((c, i) => {
                const ex = openEx.filter((e) => e.clientId === c.id).length;
                const rv = openRev.filter((r) => r.clientId === c.id).length;
                const ch = openChase.filter((h) => h.clientId === c.id).length;
                const started = docs.some((d) => d.clientId === c.id);
                const status: { label: string; tone: Tone } = !started
                  ? { label: "Not started", tone: "neutral" }
                  : ex > 0
                  ? { label: "Needs attention", tone: "bad" }
                  : rv > 0 || ch > 0
                    ? { label: "Ready for review", tone: "warn" }
                    : { label: "All clear", tone: "good" };
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.32, delay: Math.min(i, 6) * 0.04 }}
                  >
                    <Link to="/v2/clients/$clientId" params={{ clientId: c.id }} style={{ textDecoration: "none" }}>
                      <Card hover style={{ height: "100%" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "start" }}>
                          <h3 style={{ fontSize: 15.5, minWidth: 0 }}>{c.name}</h3>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <div style={{ fontSize: 12, color: V.muted, marginTop: 4 }}>{c.entityType}</div>
                        <div style={{ marginTop: 14 }}><CloseProgress state={closeStateFor(c.id)} compact /></div>
                        <div style={{ marginTop: 12, background: V.gray, borderRadius: 12, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Next</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{closeStateFor(c.id).next.label}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 16 }}>
                          {[
                            { k: "Exceptions", v: ex },
                            { k: "Review", v: rv },
                            { k: "Chases", v: ch },
                          ].map((m) => (
                            <div key={m.k} style={{ background: V.gray, borderRadius: 12, padding: "10px 12px" }}>
                              <div className="num" style={{ fontSize: 19, fontWeight: 600 }}><AnimatedCounter value={m.v} /></div>
                              <div style={{ fontSize: 10.5, color: V.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>{m.k}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 12, color: V.body, marginTop: 14 }}>
                          Last MIS: {c.lastMis ? formatDate(c.lastMis) : "Not generated yet"}
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      <AddClientModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
