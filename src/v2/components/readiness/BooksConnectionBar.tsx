import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, Plug, RefreshCw, X } from "lucide-react";
import { V } from "../../ui";
import { getPracticeBooksConnection, syncPracticeBooks } from "@/lib/practice/practice.functions";
import { inputDef } from "@/lib/practice/readiness/model";

type Conn = Awaited<ReturnType<typeof getPracticeBooksConnection>>;

const CSS = `
.bc { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:14px 18px; border-radius:20px; border:1px solid ${V.line}; background:${V.card}; box-shadow: var(--v2-card-shadow); position:relative; }
.bc-dot { width:10px; height:10px; border-radius:999px; flex:none; box-shadow:0 0 0 4px rgba(20,18,16,.05); }
.bc-dot.live { background:${V.green}; box-shadow:0 0 0 4px var(--v2-good-bg); } .bc-dot.stale, .bc-dot.waiting { background:#C98A1B; box-shadow:0 0 0 4px ${V.warnBg}; } .bc-dot.error { background:#C23030; box-shadow:0 0 0 4px rgba(217,43,43,.14); } .bc-dot.none { background:${V.muted}; }
.bc b { font-size:14.5px; font-weight:650; letter-spacing:-.01em; color:${V.ink}; } .bc small { display:block; font-size:12.5px; color:${V.muted}; margin-top:1px; }
.bc-go { margin-left:auto; display:inline-flex; border-radius:999px; box-shadow:0 12px 24px -14px var(--v2-brand); }
.bc-go button { border:0; cursor:pointer; font:inherit; font-size:14px; font-weight:650; color:#fff; background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); height:42px; display:inline-flex; align-items:center; gap:8px; }
.bc-go .main { padding:0 18px 0 20px; border-radius:999px 0 0 999px; } .bc-go .more { padding:0 12px 0 10px; border-radius:0 999px 999px 0; border-left:1px solid rgba(255,255,255,.28); }
.bc-go.solo .main { border-radius:999px; } .bc-go button:disabled { opacity:.6; cursor:default; } .bc-go button:hover:not(:disabled) { filter:brightness(1.06); }
.bc-pop { position:absolute; right:14px; top:calc(100% + 8px); z-index:30; width:min(420px, calc(100vw - 48px)); border-radius:18px; border:1px solid ${V.line}; background:var(--v2-pop); box-shadow:0 28px 70px -28px rgba(20,18,16,.5); padding:14px 16px; display:grid; gap:10px; }
.bc-pop h5 { margin:0; font-size:11.5px; letter-spacing:.1em; text-transform:uppercase; color:${V.muted}; font-weight:700; }
.bc-row { display:grid; grid-template-columns:18px 1fr; gap:10px; font-size:13px; line-height:1.45; color:${V.body}; } .bc-row b { font-size:13px; }
.bc-link { display:inline-flex; align-items:center; gap:8px; text-decoration:none; }
`;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null);
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The books connection of the client, with the button that matters: Sync now. It says which system, whether it is live, when it last synced, what it
 * fills for the month and what it cannot send. Not connected: the button goes to where it is connected. Nothing here writes to Tally or Zoho.
 */
export default function BooksConnectionBar({ clientId, month, onSynced }: { clientId: string; month: string; onSynced?: () => void }) {
  const [c, setC] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setC(await getPracticeBooksConnection({ data: { business_id: clientId, month } })); } catch { setC(null); } }, [clientId, month]);
  useEffect(() => { void load(); }, [load]);
  if (!c) return null;
  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncPracticeBooks({ data: { business_id: clientId, month } });
      toast.success(r.note);
      await load();
      if (r.mode === "done") onSynced?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sync.");
    } finally {
      setBusy(false);
    }
  };
  return <BooksConnectionView c={c} month={month} busy={busy} onSync={() => void sync()} />;
}

/** The bar itself, from data, so it can be shown in every state without a connection. */
export function BooksConnectionView({ c, month, busy, onSync, defaultOpen }: { c: Conn; month: string; busy?: boolean; onSync: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const status = { none: "Not connected", waiting: "Waiting for the first sync", live: "Live", stale: "Not synced for over a day", error: "Needs attention" }[c.state];
  return (
    <div className="bc" data-testid="books-connection">
      <style>{CSS}</style>
      <span className={`bc-dot ${c.state}`} aria-hidden="true" />
      <div>
        <b>{c.source === "files" ? "No books system connected" : c.label}</b>
        <small>{c.error ? c.error : c.source === "files" ? "Reviews use the files you upload. Connect Tally or Zoho Books and the books arrive on their own." : `${status}${c.lastSyncedAt ? ` · last synced ${when(c.lastSyncedAt)}` : ""}${c.source === "tally" && !c.online ? " · connector offline" : ""}`}</small>
      </div>
      <div className={`bc-go${c.source === "files" ? " solo" : ""}`}>
        {c.source === "files"
          ? <button className="main" type="button" onClick={() => window.location.assign("/app/settings")}><Plug size={16} /> Connect Tally or Zoho</button>
          : <button className="main" type="button" onClick={onSync} disabled={busy} data-testid="books-sync"><RefreshCw size={15} className={busy ? "v2-spin" : undefined} /> {busy ? "Syncing…" : `Sync ${monthName(month).split(" ")[0]} now`}</button>}
        {c.source !== "files" && <button className="more" type="button" aria-label="What this connection supplies" aria-expanded={open} onClick={() => setOpen((o) => !o)}><ChevronDown size={15} /></button>}
      </div>
      {open && (
        <div className="bc-pop" role="dialog" aria-label="What this connection supplies">
          <div style={{ display: "flex", alignItems: "center" }}><h5>For {monthName(month)}</h5><button onClick={() => setOpen(false)} aria-label="Close" style={{ marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer", color: V.muted }}><X size={15} /></button></div>
          {c.supplies.length ? c.supplies.map((k) => <div className="bc-row" key={k}><Check size={15} color="var(--v2-green)" /><span><b>{inputDef(k)?.label ?? k}</b> · from {c.source === "tally" ? "Tally" : "Zoho Books"}</span></div>) : <div style={{ fontSize: 13, color: V.muted }}>Nothing has arrived for this month yet. Press Sync.</div>}
          {c.gaps.length > 0 && <h5 style={{ marginTop: 4 }}>Not sent by {c.source === "tally" ? "Tally" : "Zoho Books"}</h5>}
          {c.gaps.map((g) => <div className="bc-row" key={g.input}><AlertTriangle size={15} color="#C98A1B" /><span><b>{inputDef(g.input)?.label ?? g.input}.</b> {g.why}</span></div>)}
          {c.note && <div style={{ fontSize: 12, color: V.muted }}>Last sync: {c.note}</div>}
        </div>
      )}
    </div>
  );
}
