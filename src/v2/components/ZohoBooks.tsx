/**
 * Settings → Zoho Books. Read-only: a partner connects Zoho once, links each
 * client to one of its Zoho bank accounts in three short steps, and anyone can
 * pull a month's ledger in as the books side for Recon.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Link2, RefreshCw, Unlink } from "lucide-react";
import {
  zohoBooksBankAccounts,
  zohoBooksConnect,
  zohoBooksDisconnect,
  zohoBooksLink,
  zohoBooksOrganizations,
  zohoBooksPostings,
  zohoBooksSetPosting,
  zohoBooksStatus,
  zohoBooksUndoPost,
  zohoBooksSync,
  zohoBooksUnlink,
} from "@/lib/practice/practice.functions";
import { V, formatDate } from "../ui";
import { useV2 } from "../store";
import { ZohoIcon } from "./BrandIcons";
import { IntegrationCard } from "./IntegrationCard";

type Status = Awaited<ReturnType<typeof zohoBooksStatus>>;
type Org = Awaited<ReturnType<typeof zohoBooksOrganizations>>[number];
type Account = Awaited<ReturnType<typeof zohoBooksBankAccounts>>[number];
type Posting = Awaited<ReturnType<typeof zohoBooksPostings>>[number];

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ZohoBooksSection({ index = 0 }: { index?: number }) {
  const { clients, canSignOff } = useV2();
  const [st, setSt] = useState<Status | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState({ client: "", org: "", account: "" });
  const [months, setMonths] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [postings, setPostings] = useState<Posting[]>([]);

  const load = useCallback(async () => {
    try {
      const status = await zohoBooksStatus();
      setSt(status);
      if (status.writeEnabled) setPostings(await zohoBooksPostings().catch(() => []));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    const outcome = q.get("zoho");
    if (outcome === "connected") {
      setJustConnected(true);
      toast.success("Zoho Books connected. Link each client to its bank account.");
    } else if (outcome === "write_granted") {
      setJustConnected(true);
      toast.success("Zoho Books can now create entries you approve. Switch it on for each client below.");
    } else if (outcome) toast.error(q.get("zoho_msg") ?? "Zoho Books could not be connected.");
    if (outcome) {
      q.delete("zoho");
      q.delete("zoho_msg");
      window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    }
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const startPicking = async () => {
    setPicking(true);
    setPick({ client: "", org: "", account: "" });
    setAccounts(null);
    if (orgs) return;
    setBusy("orgs");
    try {
      setOrgs(await zohoBooksOrganizations());
    } catch (e) {
      toast.error(errMsg(e));
      setPicking(false);
    } finally {
      setBusy(null);
    }
  };

  const chooseOrg = async (org: string) => {
    setPick((p) => ({ ...p, org, account: "" }));
    setAccounts(null);
    if (!org) return;
    setBusy("accounts");
    try {
      setAccounts(await zohoBooksBankAccounts({ data: { organizationId: org } }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const pull = async (linkId: string) => {
    setBusy(`sync:${linkId}`);
    setDone((d) => ({ ...d, [linkId]: "" }));
    try {
      const r = await zohoBooksSync({ data: { linkId, month: months[linkId] ?? lastMonth() } });
      setDone((d) => ({ ...d, [linkId]: r.status === "synced" ? "Pulled. Extract is reading it now." : r.note }));
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client removed";

  if (!st) return <div className="ic-skel" aria-label="Loading Zoho Books" />;

  const status = st.connected
    ? { tone: "good" as const, label: st.links.length ? `Connected · ${st.links.length} linked` : "Connected", live: true }
    : st.error
      ? { tone: "bad" as const, label: "Needs reconnecting" }
      : st.available
        ? { tone: "neutral" as const, label: "Not connected" }
        : { tone: "warn" as const, label: "Not switched on yet" };

  const step = !pick.client ? 0 : !pick.org ? 1 : !pick.account ? 2 : 3;

  return (
    <IntegrationCard
      index={index}
      testId="zoho-section"
      icon={<ZohoIcon size={36} />}
      tint="rgba(228,37,39,.08)"
      name="Zoho Books"
      tag={<span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>{st.writeEnabled ? "READ + APPROVED ENTRIES" : "READ-ONLY"}</span>}
      description={
        st.error ??
        (st.available
          ? st.writeEnabled
            ? "Pull each client's bank ledger for Recon. FynHelp creates an entry in Zoho only when a partner approves that exact entry, and it can be undone."
            : "Pull each client's bank ledger from Zoho Books as the books side for Recon. FynHelp never changes anything in Zoho."
          : "Zoho Books isn't switched on for FynHelp yet.")
      }
      status={status}
      defaultOpen={st.connected && (justConnected || st.links.length > 0)}
      actions={
        st.available && canSignOff ? (
          !st.connected ? (
            <button
              className="v2-btn v2-btn-primary"
              style={{ padding: "8px 16px", fontSize: 13 }}
              disabled={busy === "connect"}
              data-testid="zoho-connect"
              onClick={() =>
                void act("connect", async () => {
                  const { url } = await zohoBooksConnect();
                  window.location.href = url;
                })
              }
            >
              {busy === "connect" ? <><span className="ic-spin" /> Opening Zoho…</> : "Connect"}
            </button>
          ) : (
            <button
              className="v2-btn v2-btn-quiet"
              disabled={busy === "disconnect"}
              onClick={() => {
                if (window.confirm("Disconnect Zoho Books? Client links are removed; documents already pulled stay."))
                  void act("disconnect", () => zohoBooksDisconnect(), "Zoho Books disconnected");
              }}
            >
              Disconnect
            </button>
          )
        ) : undefined
      }
    >
      {st.connected ? (
        <div style={{ display: "grid", gap: 10 }}>
          {st.links.length === 0 && !picking && (
            <div style={{ fontSize: 13, color: V.body }}>No client is linked yet. Link one to start pulling its ledger.</div>
          )}
          {st.links.map((l) => {
            const pulling = busy === `sync:${l.id}`;
            return (
              <div
                key={l.id}
                className="ic-row"
                data-testid="zoho-link"
                style={{ background: V.gray, borderRadius: 14, padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{clientName(l.business_id)}</div>
                  <div style={{ fontSize: 12.5, color: V.body, display: "flex", alignItems: "center", gap: 6 }}>
                    <ZohoIcon size={18} /> {l.organization_name} · {l.account_name}
                  </div>
                  <div style={{ fontSize: 12, color: V.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    {done[l.id] ? (
                      <>
                        <span className="ic-check"><Check size={12} strokeWidth={3} /></span>
                        <span style={{ color: "#1F6B45", fontWeight: 600 }}>{done[l.id]}</span>
                      </>
                    ) : l.last_synced_at ? (
                      `Last pulled ${formatDate(l.last_synced_at)}: ${l.last_sync_note ?? ""}`
                    ) : (
                      "Not pulled yet"
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="month"
                    className="v2-input"
                    aria-label="Month to pull"
                    style={{ padding: "7px 10px", fontSize: 13, width: 150 }}
                    value={months[l.id] ?? lastMonth()}
                    max={new Date().toISOString().slice(0, 7)}
                    onChange={(e) => setMonths({ ...months, [l.id]: e.target.value })}
                  />
                  <button
                    className="v2-btn v2-btn-primary"
                    style={{ padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap" }}
                    disabled={pulling}
                    data-testid="zoho-sync"
                    onClick={() => void pull(l.id)}
                  >
                    {pulling ? <><span className="ic-spin" /> Pulling…</> : <><RefreshCw size={14} /> Pull month</>}
                  </button>
                  {canSignOff && st.postingAvailable && st.writeEnabled && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: V.body, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!l.posting_enabled}
                        disabled={busy === `post:${l.id}`}
                        data-testid="zoho-posting-toggle"
                        onChange={(e) => void act(`post:${l.id}`, () => zohoBooksSetPosting({ data: { linkId: l.id, enabled: e.target.checked } }), e.target.checked ? "Posting is on for this client" : "Posting is off for this client")}
                      />
                      Allow approved entries
                    </label>
                  )}
                  {canSignOff && (
                    <button
                      className="v2-btn v2-btn-quiet"
                      aria-label={`Unlink ${clientName(l.business_id)}`}
                      title="Unlink"
                      style={{ padding: "8px 10px" }}
                      onClick={() => void act(`unlink:${l.id}`, () => zohoBooksUnlink({ data: { linkId: l.id } }), "Link removed")}
                    >
                      <Unlink size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {canSignOff && st.postingAvailable && !st.writeEnabled && st.links.length > 0 && (
            <div className="ic-row" style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 8 }} data-testid="zoho-write-consent">
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>Let FynHelp create entries you approve (optional)</div>
              <div style={{ fontSize: 12.5, color: V.body }}>
                Off by default. Once allowed, a partner can approve a single bank charge or a receipt for one named invoice from the exception drawer. Each one is previewed first, tagged &ldquo;Created by FynHelp&rdquo;, logged here and can be undone. Zoho will ask you to approve the extra permission.
              </div>
              <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start", padding: "8px 14px", fontSize: 13 }} disabled={busy === "write"}
                onClick={() => void act("write", async () => { const { url } = await zohoBooksConnect({ data: { write: true } }); window.location.href = url; })}>
                Allow approved entries
              </button>
            </div>
          )}

          {st.writeEnabled && postings.length > 0 && (
            <div className="ic-row" style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 6 }} data-testid="zoho-postings">
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>Entries FynHelp created</div>
              {postings.slice(0, 8).map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: V.body, alignItems: "center" }}>
                  <span style={{ minWidth: 0 }}>
                    {formatDate(p.txn_date)} · {clientName(p.business_id)} · {p.summary} · ₹{Number(p.amount).toLocaleString("en-IN")} ·{" "}
                    <strong style={{ color: p.status === "posted" ? "#1F6B45" : V.muted }}>{p.status === "pending" ? "check Zoho" : p.status}</strong>
                  </span>
                  {canSignOff && p.status === "posted" && (
                    <button className="v2-btn v2-btn-quiet" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy === `undo:${p.id}`}
                      onClick={() => void act(`undo:${p.id}`, () => zohoBooksUndoPost({ data: { postingId: p.id } }), "Entry removed from Zoho Books")}>
                      Undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canSignOff && !picking && (
            <button
              className="v2-btn v2-btn-ghost"
              style={{ justifySelf: "start", padding: "8px 16px", fontSize: 13 }}
              onClick={() => void startPicking()}
              data-testid="zoho-add-link"
            >
              <Link2 size={14} /> Link a client to a Zoho bank account
            </button>
          )}

          {picking && (
            <div className="ic-row" style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: 14 }}>
              <div className="ic-steps" aria-hidden>
                {[0, 1, 2].map((i) => <span key={i} data-done={step > i} />)}
              </div>
              {busy === "orgs" || !orgs ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12.5, color: V.body }}>Reading the Zoho organisations this login can see…</div>
                  <div className="ic-skel" />
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  <label>
                    <div className="ic-step-label">1 · Client</div>
                    <select className="v2-input" style={{ width: "100%" }} aria-label="Client" value={pick.client} onChange={(e) => setPick({ ...pick, client: e.target.value })} data-testid="zoho-client">
                      <option value="">Choose a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ opacity: pick.client ? 1 : 0.5, transition: "opacity .25s" }}>
                    <div className="ic-step-label">2 · Zoho organisation</div>
                    <select className="v2-input" style={{ width: "100%" }} aria-label="Zoho organisation" disabled={!pick.client} value={pick.org} onChange={(e) => void chooseOrg(e.target.value)} data-testid="zoho-org">
                      <option value="">{orgs.length ? "Choose an organisation…" : "No organisations visible"}</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}{o.gstin ? ` · ${o.gstin}` : ""}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ opacity: pick.org ? 1 : 0.5, transition: "opacity .25s" }}>
                    <div className="ic-step-label">3 · Bank account</div>
                    <select className="v2-input" style={{ width: "100%" }} aria-label="Bank account" disabled={!accounts} value={pick.account} onChange={(e) => setPick({ ...pick, account: e.target.value })} data-testid="zoho-account">
                      <option value="">{busy === "accounts" ? "Loading accounts…" : "Choose a bank account…"}</option>
                      {(accounts ?? []).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}{a.number ? ` · ${a.number}` : ""}{a.kind !== "bank" ? ` (${a.kind === "card" ? "credit card" : "cash account"})` : ""}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {orgs && orgs.length === 0 && (
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 10 }}>
                  This Zoho login can't see any Zoho Books organisation. Ask the client to add it as a user (Zoho Books → Settings → Users &amp; Roles).
                </div>
              )}
              {(accounts ?? []).find((a) => a.id === pick.account)?.hint && (
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 10 }} data-testid="zoho-cash-hint">
                  {(accounts ?? []).find((a) => a.id === pick.account)?.hint}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  className="v2-btn v2-btn-primary"
                  style={{ padding: "8px 16px", fontSize: 13 }}
                  disabled={step < 3 || busy === "link"}
                  data-testid="zoho-save-link"
                  onClick={() =>
                    void act(
                      "link",
                      async () => {
                        const org = orgs!.find((o) => o.id === pick.org)!;
                        const acc = (accounts ?? []).find((a) => a.id === pick.account)!;
                        await zohoBooksLink({ data: { businessId: pick.client, organizationId: org.id, organizationName: org.name, accountId: acc.id, accountName: acc.name } });
                        setPicking(false);
                      },
                      "Client linked to Zoho Books",
                    )
                  }
                >
                  {busy === "link" ? <><span className="ic-spin" /> Saving…</> : <><Check size={14} /> Save link</>}
                </button>
                <button className="v2-btn v2-btn-quiet" onClick={() => setPicking(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : undefined}
    </IntegrationCard>
  );
}
