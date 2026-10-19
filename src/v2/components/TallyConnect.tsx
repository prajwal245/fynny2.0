/**
 * Settings → Tally Prime. Tally only listens on the client's own PC, so a small
 * read-only agent runs there and sends ledger balances out over HTTPS. A
 * partner gets a one-time code, the client (or our team) installs the agent and
 * enters it, and the screen notices the moment it connects. Each Tally company
 * is then linked to a client.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, Monitor, Trash2 } from "lucide-react";
import { tallyLinkCompany, tallyNewPairing, tallyRevokeAgent, tallySetCompanySync, tallyStatus } from "@/lib/practice/practice.functions";
import { V, formatDate } from "../ui";
import { useV2 } from "../store";
import { IntegrationCard } from "./IntegrationCard";

type Status = Awaited<ReturnType<typeof tallyStatus>>;
type Company = Status["companies"][number];

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|and|&|co|company|traders|enterprises)\b/g, "").replace(/[^a-z0-9]/g, "");

/** A client whose name matches the Tally company, to pre-fill the link. */
const suggest = (company: string, clients: { id: string; name: string }[]) => {
  const n = norm(company);
  if (!n) return null;
  return clients.find((c) => norm(c.name) === n) ?? clients.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name))) ?? null;
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "just now";
  if (m < 90) return `${m} min ago`;
  if (m < 36 * 60) return `${Math.round(m / 60)} h ago`;
  return formatDate(iso);
};

const STEPS = [
  ["Download", "Save the agent on the PC where Tally Prime is installed."],
  ["Install", "Double-click Install.bat and paste the code when asked."],
  ["Done", "Keep Tally open. This screen shows the company the moment it connects."],
];

function PairingPanel({ code, expiresAt, found, onClose }: { code: string; expiresAt: string; found: boolean; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  return (
    <div className="ic-row" style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: 16, display: "grid", gap: 14 }} data-testid="tally-pairing">
      <div className="ic-steps" aria-hidden>{[0, 1, 2].map((i) => <span key={i} data-done={found || i === 0} />)}</div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {STEPS.map(([t, d], i) => (
          <div key={t}>
            <div className="ic-step-label">{i + 1} · {t}</div>
            <div style={{ fontSize: 13, color: V.body, lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <a className="v2-btn v2-btn-ghost" href="/tally-agent/fynhelp-tally-agent.zip" download style={{ padding: "8px 14px", fontSize: 13 }}><Download size={14} /> Download agent</a>
        <a className="v2-btn v2-btn-quiet" href="/tally-agent/guide.html" style={{ padding: "8px 14px", fontSize: 13 }}>Client guide</a>
      </div>
      <div style={{ background: V.cream, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <div className="ic-step-label">Pairing code</div>
          <div style={{ fontFamily: V.mono, fontSize: 26, fontWeight: 650, letterSpacing: ".08em" }} data-testid="tally-code">{code}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {found ? (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "#1F6B45", fontWeight: 650, fontSize: 14 }}><span className="ic-check"><Check size={12} strokeWidth={3} /></span> Connected</span>
          ) : left > 0 ? (
            <div style={{ fontSize: 12.5, color: V.body, display: "flex", alignItems: "center", gap: 8 }}><span className="ic-spin" /> Waiting for the agent · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
          ) : (
            <div style={{ fontSize: 12.5, color: V.maroon }}>This code has expired. Get a new one.</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => { void navigator.clipboard?.writeText(code); toast.success("Code copied"); }}><Copy size={13} /> Copy</button>
            <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={onClose}>{found ? "Done" : "Cancel"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TallySection({ index = 0 }: { index?: number }) {
  const { clients, canSignOff } = useV2();
  const [st, setSt] = useState<Status | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string; baseline: number } | null>(null);
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const baseline = useRef(0);

  const load = useCallback(async () => {
    try { setSt(await tallyStatus()); } catch (e) { toast.error(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // While a code is showing, look for the agent every few seconds.
  useEffect(() => {
    if (!pairing || found) return;
    const t = setInterval(async () => {
      try {
        const s = await tallyStatus();
        setSt(s);
        if (s.agents.length > baseline.current) {
          setFound(true);
          toast.success("Tally agent connected");
        }
      } catch { /* try again on the next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [pairing, found]);

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  const start = () =>
    void act("pair", async () => {
      const p = await tallyNewPairing();
      baseline.current = st?.agents.length ?? 0;
      setFound(false);
      setPairing({ ...p, baseline: baseline.current });
    });

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "Client removed";
  if (!st) return <div className="ic-skel" aria-label="Loading Tally Prime" />;

  // Exact name matches for companies not linked yet, each client used once.
  const suggestions = (() => {
    const used = new Set(st.companies.filter((c) => c.business_id).map((c) => c.business_id));
    const out: { company: Company; client: { id: string; name: string } }[] = [];
    for (const company of st.companies) {
      if (company.business_id) continue;
      const client = suggest(company.name, clients);
      if (client && !used.has(client.id)) { used.add(client.id); out.push({ company, client }); }
    }
    return out;
  })();
  const online = st.agents.filter((a) => a.online).length;
  const linked = st.companies.filter((c) => c.business_id).length;
  const status = st.agents.length
    ? online
      ? { tone: "good" as const, label: `Connected · ${linked} linked`, live: true }
      : { tone: "warn" as const, label: "Agent offline" }
    : { tone: "neutral" as const, label: "Not connected" };

  return (
    <IntegrationCard
      index={index}
      testId="tally-section"
      icon={<span style={{ fontWeight: 800, fontSize: 18, color: "#C8102E", fontFamily: V.font }}>T</span>}
      tint="rgba(200,16,46,.08)"
      name="Tally Prime"
      tag={<span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>READ-ONLY</span>}
      description="A small agent on the client's PC sends their ledgers to FynHelp, which builds the Trial Balance, P&L and Balance Sheet and reads the books for you. Nothing is ever changed in Tally."
      status={status}
      defaultOpen={!!pairing || st.agents.length > 0}
      actions={canSignOff ? (
        <button className="v2-btn v2-btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} disabled={busy === "pair"} onClick={start} data-testid="tally-add">
          {busy === "pair" ? <><span className="ic-spin" /> One moment…</> : st.agents.length ? "Add another PC" : "Connect"}
        </button>
      ) : undefined}
    >
      <div style={{ display: "grid", gap: 12 }}>
        {pairing && <PairingPanel code={pairing.code} expiresAt={pairing.expiresAt} found={found} onClose={() => setPairing(null)} />}

        {st.agents.map((a) => (
          <div key={a.id} className="ic-row" style={{ background: V.gray, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <Monitor size={18} color={a.online ? "#1F6B45" : V.muted} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 650 }}>{a.label}</div>
                <div style={{ fontSize: 12.5, color: V.body }}>
                  {a.online ? "Online" : "Offline"} · last heard {ago(a.last_seen_at)}{a.tally_version ? ` · ${a.tally_version}` : ""}{a.agent_version ? ` · agent ${a.agent_version}` : ""}
                </div>
                {!a.online && <div style={{ fontSize: 12, color: V.warnFg }}>The PC may be off, or Tally is not open. It catches up on its own.</div>}
              </div>
            </div>
            {canSignOff && (
              <button className="v2-btn v2-btn-quiet" style={{ padding: "8px 10px" }} aria-label={`Remove ${a.label}`} title="Remove this PC"
                onClick={() => { if (window.confirm(`Remove ${a.label}? It stops sending data; what it already sent stays.`)) void act(`rm:${a.id}`, () => tallyRevokeAgent({ data: { agentId: a.id } }), "PC removed"); }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        {st.companies.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <div className="ic-step-label" style={{ margin: 0 }}>Tally companies</div>
            {canSignOff && suggestions.length > 1 && (
              <button className="v2-btn v2-btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy === "linkall"} data-testid="tally-link-all"
                onClick={() => void act("linkall", async () => { for (const s of suggestions) await tallyLinkCompany({ data: { companyId: s.company.id, businessId: s.client.id } }); }, `Linked ${suggestions.length} companies`)}>
                Link all {suggestions.length} suggested
              </button>
            )}
          </div>
        )}
        {linked > 0 && (
          <div style={{ fontSize: 12.5, color: V.body, lineHeight: 1.55, background: V.cream, borderRadius: 12, padding: "10px 12px" }}>
            For each linked client, FynHelp now receives the books by itself: the month's vouchers go straight to <b>Documents</b> and into <b>Recon</b>, and the <b>Books</b> tab keeps the P&amp;L, Balance Sheet and Trial Balance current. Nobody has to export Tally or upload it.
          </div>
        )}
        {st.companies.map((c: Company) => {
          const sug = !c.business_id ? suggest(c.name, clients) : null;
          const value = pick[c.id] ?? sug?.id ?? "";
          return (
            <div key={c.id} className="ic-row" data-testid="tally-company" style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                <div style={{ fontSize: 14, fontWeight: 650 }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: c.business_id ? V.body : V.muted }}>
                  {c.business_id ? <>Linked to <b>{clientName(c.business_id)}</b></> : "Not linked to a client yet"}
                </div>
                <div style={{ fontSize: 12, color: V.muted, marginTop: 2 }}>
                  {c.last_synced_at ? `Synced ${ago(c.last_synced_at)}${c.last_sync_note ? `: ${c.last_sync_note}` : ""}` : "Nothing received yet"}
                </div>
              </div>
              {canSignOff && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {c.business_id ? (
                    <>
                      <button className="v2-btn v2-btn-quiet" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => void act(`sync:${c.id}`, () => tallySetCompanySync({ data: { companyId: c.id, enabled: !c.sync_enabled } }), c.sync_enabled ? "Sync paused" : "Sync resumed")}>
                        {c.sync_enabled ? "Pause" : "Resume"}
                      </button>
                      <button className="v2-btn v2-btn-quiet" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => void act(`unlink:${c.id}`, () => tallyLinkCompany({ data: { companyId: c.id, businessId: null } }), "Unlinked")}>Unlink</button>
                    </>
                  ) : (
                    <>
                      <select className="v2-input" style={{ width: "auto", maxWidth: 220, padding: "7px 10px", fontSize: 13 }} aria-label={`Client for ${c.name}`} value={value} onChange={(e) => setPick({ ...pick, [c.id]: e.target.value })}>
                        <option value="">Choose a client…</option>
                        {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                      </select>
                      <button className="v2-btn v2-btn-primary" style={{ padding: "8px 14px", fontSize: 13 }} disabled={!value || busy === `link:${c.id}`} data-testid="tally-link"
                        onClick={() => void act(`link:${c.id}`, () => tallyLinkCompany({ data: { companyId: c.id, businessId: value } }), "Linked. The Books tab fills in on the next sync.")}>
                        Link
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {st.agents.length === 0 && !pairing && (
          <div style={{ fontSize: 13, color: V.body, lineHeight: 1.55 }}>
            Press Connect to get a one-time code. The client installs the agent on the PC that runs Tally, or our team can do it on a short call. The agent only reads Tally and only sends data out; nothing connects in to the client's PC.
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}
