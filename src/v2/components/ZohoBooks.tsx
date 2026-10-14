/**
 * Settings → Zoho Books. Read-only: a partner connects Zoho once, links each
 * client to one of its Zoho bank accounts, and anyone can pull a month's
 * ledger in as the books side for Recon.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  zohoBooksBankAccounts,
  zohoBooksConnect,
  zohoBooksDisconnect,
  zohoBooksLink,
  zohoBooksOrganizations,
  zohoBooksStatus,
  zohoBooksSync,
  zohoBooksUnlink,
} from "@/lib/practice/practice.functions";
import { Badge, V, formatDate } from "../ui";
import { useV2 } from "../store";

type Status = Awaited<ReturnType<typeof zohoBooksStatus>>;
type Org = Awaited<ReturnType<typeof zohoBooksOrganizations>>[number];
type Account = Awaited<ReturnType<typeof zohoBooksBankAccounts>>[number];

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ZohoBooksMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#E42527" />
      <path d="M7 8h10l-7 8h7" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ZohoBooksSection() {
  const { clients, canSignOff } = useV2();
  const [st, setSt] = useState<Status | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [pick, setPick] = useState({ client: "", org: "", account: "" });
  const [months, setMonths] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSt(await zohoBooksStatus());
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    const outcome = q.get("zoho");
    if (outcome === "connected") toast.success("Zoho Books connected. Link each client to its bank account below.");
    else if (outcome) toast.error(q.get("zoho_msg") ?? "Zoho Books could not be connected.");
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

  const openPicker = async () => {
    setBusy("orgs");
    try {
      setOrgs(await zohoBooksOrganizations());
    } catch (e) {
      toast.error(errMsg(e));
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

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client removed";

  if (!st) return null;
  return (
    <div style={{ background: V.gray, borderRadius: 14, padding: "12px 14px" }} data-testid="zoho-section">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <ZohoBooksMark /> Zoho Books
          </div>
          <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
            Pulls each client's bank ledger from Zoho Books as the books side for Recon. Read-only: FynHelp never changes anything in Zoho.
          </div>
          {!st.available && (
            <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>Zoho Books isn't switched on for FynHelp yet.</div>
          )}
          {st.error && <div style={{ fontSize: 12.5, color: V.maroon, marginTop: 3 }}>{st.error}</div>}
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <Badge tone={st.connected ? "good" : st.error ? "bad" : "neutral"}>{st.connected ? "Connected" : st.error ? "Needs reconnecting" : "Not connected"}</Badge>
          {st.available && canSignOff && (!st.connected ? (
            <button
              className="v2-btn v2-btn-primary"
              style={{ padding: "7px 14px", fontSize: 13 }}
              disabled={busy === "connect"}
              data-testid="zoho-connect"
              onClick={() =>
                void act("connect", async () => {
                  const { url } = await zohoBooksConnect();
                  window.location.href = url;
                })
              }
            >
              {busy === "connect" ? "Opening Zoho…" : "Connect Zoho Books"}
            </button>
          ) : (
            <button
              className="v2-btn v2-btn-ghost"
              style={{ padding: "6px 12px", fontSize: 12.5 }}
              disabled={busy === "disconnect"}
              onClick={() => {
                if (window.confirm("Disconnect Zoho Books? Client links are removed; documents already pulled stay."))
                  void act("disconnect", () => zohoBooksDisconnect(), "Zoho Books disconnected");
              }}
            >
              Disconnect
            </button>
          ))}
        </div>
      </div>

      {st.connected && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {st.links.length === 0 && <div style={{ fontSize: 12.5, color: V.body }}>No client is linked yet.</div>}
          {st.links.map((l) => (
            <div key={l.id} style={{ background: "#fff", borderRadius: 12, padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }} data-testid="zoho-link">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{clientName(l.business_id)}</div>
                <div style={{ fontSize: 12, color: V.body }}>
                  {l.organization_name} · {l.account_name}
                </div>
                <div style={{ fontSize: 12, color: V.muted }}>
                  {l.last_synced_at ? `Last pulled ${formatDate(l.last_synced_at)}: ${l.last_sync_note ?? ""}` : "Not pulled yet"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="month"
                  className="v2-input"
                  aria-label="Month to pull"
                  style={{ padding: "6px 10px", fontSize: 13 }}
                  value={months[l.id] ?? lastMonth()}
                  max={new Date().toISOString().slice(0, 7)}
                  onChange={(e) => setMonths({ ...months, [l.id]: e.target.value })}
                />
                <button
                  className="v2-btn v2-btn-primary"
                  style={{ padding: "6px 12px", fontSize: 12.5 }}
                  disabled={busy === `sync:${l.id}`}
                  data-testid="zoho-sync"
                  onClick={() =>
                    void act(`sync:${l.id}`, async () => {
                      const r = await zohoBooksSync({ data: { linkId: l.id, month: months[l.id] ?? lastMonth() } });
                      toast.success(r.status === "synced" ? `Pulled from Zoho. ${r.note}. Extract is reading it now.` : r.note);
                    })
                  }
                >
                  {busy === `sync:${l.id}` ? "Pulling…" : "Pull month"}
                </button>
                {canSignOff && (
                  <button className="v2-btn v2-btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => void act(`unlink:${l.id}`, () => zohoBooksUnlink({ data: { linkId: l.id } }), "Link removed")}>
                    Unlink
                  </button>
                )}
              </div>
            </div>
          ))}

          {canSignOff &&
            (orgs === null ? (
              <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start", padding: "7px 14px", fontSize: 13 }} disabled={busy === "orgs"} onClick={() => void openPicker()} data-testid="zoho-add-link">
                {busy === "orgs" ? "Reading your Zoho organisations…" : "Link a client to a Zoho bank account"}
              </button>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                {orgs.length === 0 && <div style={{ fontSize: 12.5, color: V.body }}>This Zoho login can't see any Zoho Books organisation. Ask the client to invite it as an accountant.</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <select className="v2-input" aria-label="Client" value={pick.client} onChange={(e) => setPick({ ...pick, client: e.target.value })} data-testid="zoho-client">
                    <option value="">Client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select className="v2-input" aria-label="Zoho organisation" value={pick.org} onChange={(e) => void chooseOrg(e.target.value)} data-testid="zoho-org">
                    <option value="">Zoho organisation…</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}{o.gstin ? ` · ${o.gstin}` : ""}</option>
                    ))}
                  </select>
                  <select className="v2-input" aria-label="Bank account" value={pick.account} disabled={!accounts} onChange={(e) => setPick({ ...pick, account: e.target.value })} data-testid="zoho-account">
                    <option value="">{busy === "accounts" ? "Loading accounts…" : "Bank account…"}</option>
                    {(accounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}{a.number ? ` · ${a.number}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="v2-btn v2-btn-primary"
                    style={{ padding: "7px 14px", fontSize: 13 }}
                    disabled={!pick.client || !pick.org || !pick.account || busy === "link"}
                    data-testid="zoho-save-link"
                    onClick={() =>
                      void act(
                        "link",
                        async () => {
                          const org = orgs.find((o) => o.id === pick.org)!;
                          const acc = (accounts ?? []).find((a) => a.id === pick.account)!;
                          await zohoBooksLink({ data: { businessId: pick.client, organizationId: org.id, organizationName: org.name, accountId: acc.id, accountName: acc.name } });
                          setPick({ client: "", org: "", account: "" });
                          setOrgs(null);
                          setAccounts(null);
                        },
                        "Client linked to Zoho Books",
                      )
                    }
                  >
                    Save link
                  </button>
                  <button className="v2-btn v2-btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => { setOrgs(null); setAccounts(null); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
