/**
 * Settings → Zoho Books. One guided path, and nothing else is shown until it is needed:
 *   not connected → what it does + a single Connect button;
 *   connected     → three steps (connect, link a client, pull a month), then each linked client
 *                   as a card with Pull, What's owed, and (only if a partner enabled it) approved entries.
 * Read-only by default. Every destructive step asks first, every button locks while it works.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronRight, Link2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import {
  zohoBooksBankAccounts,
  zohoBooksConnect,
  zohoBooksDisconnect,
  zohoBooksLink,
  zohoBooksOpenInvoices,
  zohoBooksOrganizations,
  zohoBooksPostings,
  zohoBooksSetPosting,
  zohoBooksStatus,
  zohoBooksSync,
  zohoBooksUndoPost,
  zohoBooksUnlink,
} from "@/lib/practice/practice.functions";
import { V, formatDate, formatINR } from "../ui";
import { useV2 } from "../store";
import { ZohoIcon } from "./BrandIcons";
import { IntegrationCard } from "./IntegrationCard";
import { defaultMonth, monthOptions, owedSummary, setupStage, suggestOrganisation } from "@/lib/practice/zohoLink";

type Status = Awaited<ReturnType<typeof zohoBooksStatus>>;
type Link = Status["links"][number];
type Org = Awaited<ReturnType<typeof zohoBooksOrganizations>>[number];
type Account = Awaited<ReturnType<typeof zohoBooksBankAccounts>>[number];
type Posting = Awaited<ReturnType<typeof zohoBooksPostings>>[number];

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const NEEDS_RECONNECT = /reconnect/i;

const STYLES = `
.zb-steps { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:8px; }
.zb-step { display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:12px; background:${V.gray}; font-size:12.5px; color:${V.muted}; font-weight:600; transition: background .3s ease, color .3s ease; min-width:0; }
.zb-step b { display:grid; place-items:center; flex:none; width:22px; height:22px; border-radius:50%; background:${V.line}; color:${V.body}; font-size:11.5px; transition: background .3s ease, color .3s ease; }
.zb-step[data-state="done"] { color:#1F6B45; }
.zb-step[data-state="done"] b { background:#1F6B45; color:#fff; }
.zb-step[data-state="now"] { background:${V.blue}; color:${V.ink}; }
.zb-step[data-state="now"] b { background:${V.maroon}; color:#fff; }
.zb-step span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.zb-cards { display:grid; gap:12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.zb-card { border:1px solid ${V.line}; border-radius:16px; padding:14px; display:grid; gap:12px; background:${V.card}; min-width:0; }
.zb-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.zb-meta { font-size:12.5px; color:${V.body}; display:flex; align-items:center; gap:6px; min-width:0; }
.zb-meta span { overflow:hidden; text-overflow:ellipsis; }
.zb-btn { min-height:40px; }
.zb-field { display:grid; gap:4px; min-width:0; }
.zb-grid3 { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); }
.zb-note { font-size:12.5px; color:${V.body}; line-height:1.5; }
.zb-banner { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:12px; background:rgba(180,83,9,.1); color:#92400E; font-size:13px; line-height:1.45; }
.zb-confirm { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12.5px; color:${V.body}; padding:8px 10px; border-radius:10px; background:${V.gray}; }
@media (max-width: 560px) { .zb-steps { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .zb-step, .zb-step b { transition:none !important; } }
`;

function Benefit({ children }: { children: string }) {
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: V.ink, lineHeight: 1.45 }}>
      <span className="ic-check" style={{ marginTop: 1, flex: "none" }}><Check size={12} strokeWidth={3} /></span>
      {children}
    </li>
  );
}

function Steps({ stage }: { stage: 0 | 1 | 2 | 3 }) {
  const items = ["Connected", "Link a client", "Pull a month"];
  return (
    <div className="zb-steps" role="list" aria-label="Zoho Books setup" data-testid="zoho-steps">
      {items.map((t, i) => {
        const state = stage > i ? "done" : stage === i ? "now" : "todo";
        return (
          <div key={t} className="zb-step" role="listitem" data-state={state} aria-current={state === "now" ? "step" : undefined}>
            <b>{state === "done" ? <Check size={12} strokeWidth={3} /> : i + 1}</b>
            <span>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

function Owed({ linkId, onReconnect }: { linkId: string; onReconnect: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | { error: string } | ReturnType<typeof owedSummary>>("idle");
  const load = async () => {
    setState("loading");
    try {
      const list = await zohoBooksOpenInvoices({ data: { linkId } });
      setState(owedSummary(list, new Date().toISOString().slice(0, 10)));
    } catch (e) {
      setState({ error: errMsg(e) });
    }
  };
  if (state === "idle")
    return (
      <button className="v2-btn v2-btn-quiet zb-btn" style={{ justifySelf: "start", fontSize: 13 }} onClick={() => void load()} data-testid="zoho-owed">
        See what this client is owed <ChevronRight size={14} />
      </button>
    );
  if (state === "loading") return <div className="ic-skel" aria-label="Reading open invoices" />;
  if ("error" in state)
    return (
      <div className="zb-banner" role="alert">
        <AlertTriangle size={16} style={{ flex: "none", marginTop: 1 }} />
        <div>
          {state.error}
          {NEEDS_RECONNECT.test(state.error) && (
            <div style={{ marginTop: 8 }}>
              <button className="v2-btn v2-btn-ghost zb-btn" style={{ fontSize: 13 }} onClick={onReconnect}>Reconnect Zoho Books</button>
            </div>
          )}
        </div>
      </div>
    );
  return (
    <div style={{ display: "grid", gap: 6, background: V.gray, borderRadius: 12, padding: "10px 12px" }} data-testid="zoho-owed-result">
      {state.count === 0 ? (
        <div style={{ fontSize: 13, color: V.body }}>Nothing is owed on sent invoices. Draft invoices are not counted.</div>
      ) : (
        <>
          <div style={{ fontSize: 13.5 }}>
            <strong className="num">{formatINR(state.total)}</strong> owed across {state.count} invoice{state.count === 1 ? "" : "s"}
            {state.overdueCount > 0 && <> · <span style={{ color: V.maroon, fontWeight: 650 }}>{formatINR(state.overdueTotal)} overdue ({state.overdueCount})</span></>}
          </div>
          {state.top.map((t) => (
            <div key={t.customer} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: V.body }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{t.customer}</span>
              <span className="num">{formatINR(t.balance)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function ZohoBooksSection({ index = 0 }: { index?: number }) {
  const { clients, canSignOff } = useV2();
  const [st, setSt] = useState<Status | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState({ client: "", org: "", account: "" });
  const [suggested, setSuggested] = useState<string | null>(null);
  const [months, setMonths] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [postings, setPostings] = useState<Posting[]>([]);
  const monthList = useMemo(() => monthOptions(new Date()), []);
  const fallbackMonth = useMemo(() => defaultMonth(new Date()), []);

  const load = useCallback(async () => {
    try {
      const status = await zohoBooksStatus();
      setSt(status);
      if (status.connected && status.writeEnabled) setPostings(await zohoBooksPostings().catch(() => []));
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
      toast.success("Zoho Books connected. Link your first client.");
    } else if (outcome === "write_granted") {
      setJustConnected(true);
      toast.success("Done. Switch approved entries on for the clients you want.");
    } else if (outcome) toast.error(q.get("zoho_msg") ?? "Zoho Books could not be connected.");
    if (outcome) {
      q.delete("zoho");
      q.delete("zoho_msg");
      window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    }
  }, [load]);

  const stage = st ? setupStage(st) : 0;
  // The first client is linked straight away: open the guided picker without a click.
  useEffect(() => {
    if (st?.connected && st.links.length === 0 && canSignOff && clients.length > 0 && !picking && !orgs) void startPicking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.connected, st?.links.length, clients.length]);

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
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

  const connect = (write = false) =>
    act(write ? "write" : "connect", async () => {
      const { url } = await zohoBooksConnect({ data: { write } });
      window.location.href = url;
    });

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client removed";

  async function startPicking() {
    setPicking(true);
    setPick({ client: "", org: "", account: "" });
    setAccounts(null);
    setSuggested(null);
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
  }

  async function chooseOrg(org: string, auto = false) {
    setPick((p) => ({ ...p, org, account: "" }));
    setAccounts(null);
    if (!org) return;
    setBusy("accounts");
    try {
      const list = await zohoBooksBankAccounts({ data: { organizationId: org } });
      setAccounts(list);
      // Exactly one real bank account: choose it, the person still sees it.
      const banks = list.filter((a) => a.kind === "bank");
      if (banks.length === 1) setPick((p) => ({ ...p, org, account: banks[0]!.id }));
      if (auto) setSuggested(org);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  function chooseClient(clientId: string) {
    setPick({ client: clientId, org: "", account: "" });
    setAccounts(null);
    setSuggested(null);
    const c = clients.find((x) => x.id === clientId);
    const guess = c && orgs ? suggestOrganisation(c.name, orgs) : null;
    if (guess) void chooseOrg(guess.id, true);
  }

  const duplicate = !!st?.links.some((l) => l.business_id === pick.client && l.account_id === pick.account);

  async function pull(l: Link) {
    if (busy) return;
    setBusy(`sync:${l.id}`);
    setDone((d) => ({ ...d, [l.id]: "" }));
    try {
      const r = await zohoBooksSync({ data: { linkId: l.id, month: months[l.id] ?? fallbackMonth } });
      setDone((d) => ({ ...d, [l.id]: r.status === "synced" ? `Pulled ${r.entries} entries. Extract is reading them now.` : r.note }));
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  if (!st) return <div className="ic-skel" aria-label="Loading Zoho Books" />;

  const status = st.connected
    ? { tone: "good" as const, label: st.links.length ? `Connected · ${st.links.length} linked` : "Connected", live: true }
    : st.error
      ? { tone: "bad" as const, label: "Needs reconnecting" }
      : st.available
        ? { tone: "neutral" as const, label: "Not connected" }
        : { tone: "warn" as const, label: "Not switched on yet" };

  const step = !pick.client ? 0 : !pick.org ? 1 : !pick.account ? 2 : 3;
  const picked = (accounts ?? []).find((a) => a.id === pick.account);

  return (
    <IntegrationCard
      index={index}
      testId="zoho-section"
      icon={<ZohoIcon size={36} />}
      tint="rgba(228,37,39,.08)"
      name="Zoho Books"
      tag={st.connected ? <span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>{st.writeEnabled ? "READ + APPROVED ENTRIES" : "READ-ONLY"}</span> : undefined}
      description={
        st.error ??
        (st.available
          ? st.connected
            ? "Each client's bank ledger flows into Recon as the books side. Nothing in Zoho changes unless a partner approves an entry."
            : "Bring each client's Zoho Books ledger into Recon in a few clicks."
          : "Zoho Books isn't switched on for FynHelp yet.")
      }
      status={status}
      defaultOpen={st.connected ? justConnected || stage < 3 : st.available}
      actions={
        st.available && canSignOff && !st.connected ? (
          <button className="v2-btn v2-btn-primary zb-btn" style={{ padding: "8px 18px", fontSize: 13 }} disabled={!!busy} data-testid="zoho-connect" onClick={() => void connect()}>
            {busy === "connect" ? <><span className="ic-spin" /> Opening Zoho…</> : st.error ? "Reconnect" : "Connect Zoho Books"}
          </button>
        ) : undefined
      }
    >
      <style>{STYLES}</style>

      {!st.connected ? (
        st.available ? (
          <div style={{ display: "grid", gap: 14 }} data-testid="zoho-intro">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              <Benefit>Pull any month's bank ledger from Zoho Books. No exports, no uploads.</Benefit>
              <Benefit>Recon matches it to the bank statement and shows only the real exceptions.</Benefit>
              <Benefit>Read-only. FynHelp changes nothing in Zoho unless a partner later approves a specific entry. Disconnect any time.</Benefit>
            </ul>
            {!canSignOff && <div className="zb-note">Only a partner can connect Zoho Books. Ask a partner at your firm.</div>}
          </div>
        ) : undefined
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <Steps stage={stage} />

          {st.links.length > 0 && (
            <div className="zb-cards">
              {st.links.map((l) => {
                const pulling = busy === `sync:${l.id}`;
                const removing = confirm === `unlink:${l.id}`;
                return (
                  <div key={l.id} className="zb-card ic-row" data-testid="zoho-link">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis" }}>{clientName(l.business_id)}</div>
                      <div className="zb-meta"><ZohoIcon size={16} /><span>{l.organization_name} · {l.account_name}</span></div>
                    </div>

                    <div className="zb-row" style={{ alignItems: "stretch" }}>
                      <select className="v2-input zb-btn" style={{ flex: "1 1 130px", minWidth: 0 }} aria-label={`Month to pull for ${clientName(l.business_id)}`} value={months[l.id] ?? fallbackMonth} onChange={(e) => setMonths({ ...months, [l.id]: e.target.value })}>
                        {monthList.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <button className="v2-btn v2-btn-primary zb-btn" style={{ padding: "8px 16px", fontSize: 13, whiteSpace: "nowrap", flex: "1 1 130px" }} disabled={!!busy} data-testid="zoho-sync" onClick={() => void pull(l)}>
                        {pulling ? <><span className="ic-spin" /> Pulling…</> : <><RefreshCw size={14} /> Pull month</>}
                      </button>
                    </div>

                    <div className="zb-meta" style={{ color: V.muted }} aria-live="polite">
                      {done[l.id] ? (
                        <><span className="ic-check"><Check size={12} strokeWidth={3} /></span><span style={{ color: "#1F6B45", fontWeight: 600 }}>{done[l.id]}</span></>
                      ) : l.last_synced_at ? (
                        <span>Last pulled {formatDate(l.last_synced_at)}: {l.last_sync_note ?? ""}</span>
                      ) : (
                        <span>Not pulled yet. Choose a month and press Pull.</span>
                      )}
                    </div>

                    <Owed linkId={l.id} onReconnect={() => void connect()} />

                    {canSignOff && st.postingAvailable && st.writeEnabled && (
                      <label className="zb-row" style={{ fontSize: 13, color: V.body, cursor: "pointer", gap: 10 }}>
                        <input type="checkbox" checked={!!l.posting_enabled} disabled={!!busy} data-testid="zoho-posting-toggle" style={{ width: 18, height: 18 }}
                          onChange={(e) => void act(`post:${l.id}`, () => zohoBooksSetPosting({ data: { linkId: l.id, enabled: e.target.checked } }), e.target.checked ? "Approved entries are on for this client" : "Approved entries are off for this client")} />
                        <span>Allow entries I approve for this client</span>
                      </label>
                    )}

                    {canSignOff &&
                      (removing ? (
                        <div className="zb-confirm" role="alertdialog" aria-label="Remove link">
                          <span>Remove this link? Documents already pulled stay.</span>
                          <button className="v2-btn v2-btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={!!busy} onClick={() => void act(`unlink:${l.id}`, async () => { await zohoBooksUnlink({ data: { linkId: l.id } }); setConfirm(null); }, "Link removed")}>Remove</button>
                          <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setConfirm(null)}>Keep</button>
                        </div>
                      ) : (
                        <button className="v2-btn v2-btn-quiet" style={{ justifySelf: "start", padding: "6px 10px", fontSize: 12.5 }} aria-label={`Unlink ${clientName(l.business_id)}`} onClick={() => setConfirm(`unlink:${l.id}`)}>
                          <Trash2 size={13} /> Unlink
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}

          {canSignOff && !picking && clients.length > 0 && (
            <button className="v2-btn v2-btn-ghost zb-btn" style={{ justifySelf: "start", padding: "8px 16px", fontSize: 13 }} onClick={() => void startPicking()} data-testid="zoho-add-link">
              <Link2 size={14} /> Link {st.links.length ? "another" : "a"} client
            </button>
          )}
          {canSignOff && clients.length === 0 && <div className="zb-note">Add a client first, then link it to its Zoho Books account here.</div>}

          {picking && (
            <div className="zb-card ic-row" data-testid="zoho-wizard">
              <div className="ic-steps" aria-hidden>{[0, 1, 2].map((i) => <span key={i} data-done={step > i} />)}</div>
              {busy === "orgs" || !orgs ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="zb-note">Reading the Zoho organisations this login can see…</div>
                  <div className="ic-skel" />
                </div>
              ) : (
                <>
                  <div className="zb-grid3">
                    <label className="zb-field">
                      <div className="ic-step-label">1 · Client</div>
                      <select className="v2-input zb-btn" aria-label="Client" value={pick.client} onChange={(e) => chooseClient(e.target.value)} data-testid="zoho-client">
                        <option value="">Choose a client…</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                    <label className="zb-field" style={{ opacity: pick.client ? 1 : 0.5 }}>
                      <div className="ic-step-label">2 · Zoho organisation</div>
                      <select className="v2-input zb-btn" aria-label="Zoho organisation" disabled={!pick.client} value={pick.org} onChange={(e) => void chooseOrg(e.target.value)} data-testid="zoho-org">
                        <option value="">{orgs.length ? "Choose an organisation…" : "No organisations visible"}</option>
                        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.gstin ? ` · ${o.gstin}` : ""}</option>)}
                      </select>
                      {suggested === pick.org && pick.org && <span className="zb-note" style={{ color: "#1F6B45" }}>Matched by name. Check it is right.</span>}
                    </label>
                    <label className="zb-field" style={{ opacity: pick.org ? 1 : 0.5 }}>
                      <div className="ic-step-label">3 · Bank account</div>
                      <select className="v2-input zb-btn" aria-label="Bank account" disabled={!accounts} value={pick.account} onChange={(e) => setPick({ ...pick, account: e.target.value })} data-testid="zoho-account">
                        <option value="">{busy === "accounts" ? "Loading accounts…" : accounts && accounts.length === 0 ? "No bank accounts in Zoho" : "Choose a bank account…"}</option>
                        {(accounts ?? []).map((a) => (
                          <option key={a.id} value={a.id}>{a.name}{a.number ? ` · ${a.number}` : ""}{a.kind !== "bank" ? ` (${a.kind === "card" ? "credit card" : "cash account"})` : ""}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {orgs.length === 0 && <div className="zb-note">This Zoho login can't see any Zoho Books organisation. Ask the client to add it as a user (Zoho Books → Settings → Users &amp; Roles).</div>}
                  {accounts && accounts.length === 0 && <div className="zb-note">This organisation has no bank account in Zoho Books yet. Add one there, then come back.</div>}
                  {picked?.hint && <div className="zb-banner" data-testid="zoho-cash-hint"><AlertTriangle size={16} style={{ flex: "none", marginTop: 1 }} /><div>{picked.hint}</div></div>}
                  {duplicate && <div className="zb-banner" role="alert">This client is already linked to that account.</div>}
                </>
              )}
              <div className="zb-row">
                <button className="v2-btn v2-btn-primary zb-btn" style={{ padding: "8px 18px", fontSize: 13 }} disabled={step < 3 || duplicate || !!busy} data-testid="zoho-save-link"
                  onClick={() => void act("link", async () => {
                    const org = orgs!.find((o) => o.id === pick.org)!;
                    const acc = (accounts ?? []).find((a) => a.id === pick.account)!;
                    await zohoBooksLink({ data: { businessId: pick.client, organizationId: org.id, organizationName: org.name, accountId: acc.id, accountName: acc.name } });
                    setPicking(false);
                  }, "Client linked. Now pull a month.")}>
                  {busy === "link" ? <><span className="ic-spin" /> Saving…</> : <><Check size={14} /> Save link</>}
                </button>
                {st.links.length > 0 && <button className="v2-btn v2-btn-quiet zb-btn" onClick={() => setPicking(false)}>Cancel</button>}
              </div>
            </div>
          )}

          {canSignOff && st.postingAvailable && !st.writeEnabled && st.links.length > 0 && stage === 3 && (
            <div className="zb-card" data-testid="zoho-write-consent">
              <div className="zb-row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "nowrap" }}>
                <ShieldCheck size={18} style={{ flex: "none", marginTop: 2, color: V.maroon }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 650 }}>Optional: let FynHelp create entries you approve</div>
                  <div className="zb-note">Off by default. A partner can approve a single bank charge, or a receipt for one named invoice. Each is previewed first, tagged &ldquo;Created by FynHelp&rdquo;, logged below and can be undone. Zoho will ask you to approve one extra permission.</div>
                </div>
              </div>
              <button className="v2-btn v2-btn-ghost zb-btn" style={{ justifySelf: "start", padding: "8px 16px", fontSize: 13 }} disabled={!!busy} onClick={() => void connect(true)}>Allow approved entries</button>
            </div>
          )}

          {st.writeEnabled && postings.length > 0 && (
            <div className="zb-card" data-testid="zoho-postings">
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>Entries FynHelp created</div>
              {postings.slice(0, 8).map((p) => (
                <div key={p.id} className="zb-row" style={{ justifyContent: "space-between", fontSize: 12.5, color: V.body }}>
                  <span style={{ minWidth: 0, flex: "1 1 220px" }}>
                    {formatDate(p.txn_date)} · {clientName(p.business_id)} · {p.summary} · {formatINR(Number(p.amount))} ·{" "}
                    <strong style={{ color: p.status === "posted" ? "#1F6B45" : V.muted }}>{p.status === "pending" ? "check Zoho" : p.status}</strong>
                  </span>
                  {canSignOff && p.status === "posted" && (
                    <button className="v2-btn v2-btn-quiet" style={{ padding: "4px 10px", fontSize: 12 }} disabled={!!busy} onClick={() => void act(`undo:${p.id}`, () => zohoBooksUndoPost({ data: { postingId: p.id } }), "Entry removed from Zoho Books")}>Undo</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canSignOff && (
            <div style={{ borderTop: `1px dashed ${V.line}`, paddingTop: 10 }}>
              {confirm === "disconnect" ? (
                <div className="zb-confirm" role="alertdialog" aria-label="Disconnect Zoho Books">
                  <span>Disconnect Zoho Books? All client links are removed. Documents already pulled stay.</span>
                  <button className="v2-btn v2-btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={!!busy} onClick={() => void act("disconnect", async () => { await zohoBooksDisconnect(); setConfirm(null); }, "Zoho Books disconnected")}>Disconnect</button>
                  <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setConfirm(null)}>Keep connected</button>
                </div>
              ) : (
                <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setConfirm("disconnect")}>Disconnect Zoho Books</button>
              )}
            </div>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}
