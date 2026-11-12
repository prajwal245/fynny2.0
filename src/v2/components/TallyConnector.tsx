/**
 * Settings → TallyPrime, live connection. A partner creates a connector, runs the small
 * FynHelp Connector program on the PC that has Tally open, and links each Tally company to a
 * client. After that, each month's Day Book arrives on its own as the books side for Recon.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import {
  tallyCompanyMap,
  tallyConnectorCreate,
  tallyConnectorRevoke,
  tallyConnectors,
  tallySyncNow,
} from "@/lib/practice/practice.functions";
import { V, formatDate } from "../ui";
import { useV2 } from "../store";

type Connector = Awaited<ReturnType<typeof tallyConnectors>>[number];
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

/** none: no connector online. connected: online but no books have arrived. active: books have arrived. */
export type TallyLink = "none" | "connected" | "active";

/** The last 12 months, newest first, for fetching an older month again from Tally. */
const lastMonths = (): { value: string; label: string }[] => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
};

export function TallyConnector({ onChange }: { onChange?: (state: TallyLink) => void }) {
  const { clients, canSignOff } = useV2();
  const [list, setList] = useState<Connector[] | null>(null);
  const [name, setName] = useState("");
  const [month, setMonth] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await tallyConnectors();
      setList(l);
      const online = l.filter((c) => c.online);
      onChange?.(!online.length ? "none" : online.some((c) => c.companies.some((co) => co.last_synced_at)) ? "active" : "connected");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [onChange]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
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

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
  };

  return (
    <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 12, display: "grid", gap: 12 }} data-testid="tally-connector">
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Live connection</div>
      <div style={{ fontSize: 12.5, color: V.body, lineHeight: 1.6 }}>
        Install the FynHelp Connector on the PC where TallyPrime is open. It reads Tally on that PC and sends each month's Day Book to FynHelp over the internet.
        Nothing is installed in Tally and no port is opened to the internet. Reading is automatic. Writing approved entries into Tally is off until the person at that PC turns it on in the connector's settings, and FynHelp only writes lines your team has approved.
      </div>

      {fresh && (
        <div style={{ background: "rgba(31,90,70,.07)", border: "1px solid rgba(31,90,70,.25)", borderRadius: 12, padding: 14, display: "grid", gap: 8, fontSize: 13 }}>
          <b>Connector "{fresh.name}" created. Copy the token now: it is shown only once.</b>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ wordBreak: "break-all", fontSize: 12 }}>{fresh.token}</code>
            <button className="v2-btn v2-btn-ghost" onClick={() => copy(fresh.token)}><Copy size={14} /> Copy</button>
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>In TallyPrime press <span className="num">F1 (Help) → Settings → Connectivity → Client/Server configuration</span> and set <b>TallyPrime acts as: Both</b> on port <span className="num">9000</span>.</li>
            <li>On that PC, <a href="/downloads/fynhelp-connector-setup.cmd" download style={{ color: V.maroon, fontWeight: 600 }}>download the setup</a> and double-click it. It installs what is needed, asks for the token above, tests the connection and starts the connector by itself.</li>
          </ol>
          <details style={{ fontSize: 12.5, color: V.body }}>
            <summary style={{ cursor: "pointer" }}>Set it up by hand instead</summary>
            <div style={{ marginTop: 6, lineHeight: 1.7 }}>
              <a href="/downloads/fynhelp-tally-connector.mjs" download style={{ color: V.maroon, fontWeight: 600 }}>Download the connector</a>, install Node.js 18 or later from nodejs.org, create <span className="num">fynhelp-connector.json</span> next to it with the token, then run <span className="num">node fynhelp-tally-connector.mjs</span>. The steps are at the top of the file.
            </div>
          </details>
          <div><button className="v2-btn v2-btn-ghost" onClick={() => setFresh(null)}>I have saved the token</button></div>
        </div>
      )}

      {list === null ? null : list.length === 0 ? (
        <div style={{ fontSize: 13, color: V.muted }}>No connector yet.</div>
      ) : (
        list.map((c) => (
          <div key={c.id} style={{ border: `1px solid ${V.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13.5 }}>
                <b>{c.name}</b>{" "}
                <span style={{ color: c.online ? V.green : V.muted }}>
                  · {c.online ? "Online" : c.last_seen_at ? `Offline since ${formatDate(c.last_seen_at)}` : "Waiting for the first check-in"}
                </span>
                {c.host_name && <span style={{ color: V.muted }}> · {c.host_name}</span>}
                {c.agent_version && <span style={{ color: V.muted }}> · v{c.agent_version}</span>}
              </div>
              {canSignOff && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <label className="v2-label" htmlFor={`month-${c.id}`} style={{ margin: 0 }}>Month</label>
                  <select id={`month-${c.id}`} className="v2-input" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month to fetch from Tally">
                    <option value="">Recent months</option>
                    {lastMonths().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <button className="v2-btn v2-btn-ghost" disabled={busy === `sync-${c.id}` || !c.online} title={c.online ? (month ? "Fetch this month again from Tally, including entries added later" : "Ask the connector to send now") : "The connector is offline"}
                    onClick={() => run(`sync-${c.id}`, () => tallySyncNow({ data: { id: c.id, months: month ? [month] : undefined } }), month ? `Asked the connector to fetch ${month} again. It starts within a few minutes.` : "Asked the connector to sync. It starts within a few minutes.")}>
                    <RefreshCw size={14} /> {month ? "Fetch this month" : "Sync now"}
                  </button>
                  <button className="v2-btn v2-btn-quiet" disabled={busy === `rm-${c.id}`}
                    onClick={() => { if (window.confirm(`Remove the connector "${c.name}"? It will stop sending.`)) void run(`rm-${c.id}`, () => tallyConnectorRevoke({ data: { id: c.id } }), "Connector removed"); }}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              )}
            </div>
            {c.last_error && <div style={{ fontSize: 12.5, color: V.maroon }}>Connector says: {c.last_error}</div>}
            {c.companies.length === 0 ? (
              <div style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.6 }}>
                {c.online
                  ? `Connected${c.last_seen_at ? ` (last check-in ${formatDate(c.last_seen_at)})` : ""}, but no Tally companies have been reported yet. In TallyPrime, check that Client/Server is set to Both on port 9000 and that a company is loaded. If it already is, update the connector to the latest version and read the message in its window.`
                  : "No Tally companies reported yet. Start the connector on the PC where TallyPrime is open."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {c.companies.map((co) => (
                  <div key={co.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                    <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <b>{co.company_name}</b>
                      <span style={{ display: "block", fontSize: 12, color: V.muted }}>
                        {co.business_id ? (co.last_sync_note ? `${co.last_sync_note}${co.last_synced_at ? ` · ${formatDate(co.last_synced_at)}` : ""}` : "Linked. Waiting for the first sync.") : "Not linked to a client yet: nothing is sent."}
                      </span>
                    </span>
                    <select className="v2-input" style={{ flex: "0 1 240px" }} disabled={!canSignOff || busy === `map-${co.id}`}
                      value={co.business_id ?? ""} aria-label={`Client for ${co.company_name}`}
                      onChange={(e) => run(`map-${co.id}`, () => tallyCompanyMap({ data: { company_id: co.id, business_id: e.target.value || null } }), e.target.value ? "Linked. The next sync brings in its books." : "Unlinked")}>
                      <option value="">Choose a client…</option>
                      {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {canSignOff ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="v2-input" style={{ flex: "1 1 220px" }} placeholder="Name this connector, e.g. Office PC" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <button className="v2-btn v2-btn-primary" disabled={!name.trim() || busy === "create"}
            onClick={() => run("create", async () => { const r = await tallyConnectorCreate({ data: { name } }); setFresh({ name: r.name, token: r.token }); setName(""); })}>
            Add connector
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: V.muted }}>Only a partner can add or remove a connector.</div>
      )}
    </div>
  );
}
