/**
 * "Export for your books": files a CA imports by hand into the client's accounting software, listing
 * what the books are missing. Zoho Books gets CSVs, Tally gets an XML of vouchers. FynHelp never
 * writes to either for this. The format follows the books the client already keeps in FynHelp.
 */
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Card, Drawer, V, formatINR } from "../ui";
import { tallyConnectors, zohoBooksStatus } from "@/lib/practice/practice.functions";
import { useV2, monthOf } from "../store";
import { EXPORT_KINDS, buildTallyExport, buildZohoExport, countFor, detectBooks, similarLines, type BooksSystem, type ExportKind } from "@/lib/practice/zohoExport";

function save(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob(["﻿", body], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const ledgerKey = (clientId: string) => `fh.tallyBank.${clientId}`;
const readLedger = (clientId: string) => {
  try {
    return window.localStorage.getItem(ledgerKey(clientId)) ?? "";
  } catch {
    return "";
  }
};


/** Larger, easy-to-press export buttons with a red edge highlight and gentle motion (off for reduced motion). */
export const BX_STYLES = `
.bx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 16px;border-radius:12px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;color:#141210;background:#fff;border:1.5px solid var(--v2-line);transition:transform .16s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease,border-color .2s ease,background .2s ease}
.bx-btn:hover:not(:disabled){border-color:var(--v2-brand);box-shadow:0 0 0 3px rgba(217,43,43,.14),0 8px 18px -12px rgba(142,27,31,.55);transform:translateY(-1px)}
.bx-btn:active:not(:disabled){transform:translateY(0) scale(.97);box-shadow:0 0 0 2px rgba(217,43,43,.22)}
.bx-sm{min-height:38px;padding:7px 14px;font-size:13px}
.bx-btn:focus-visible{outline:2px solid var(--v2-brand);outline-offset:3px}
.bx-btn:disabled{opacity:.5;cursor:not-allowed}
.bx-btn[aria-pressed="true"],.bx-primary{background:#fff;color:#141210;border-color:var(--v2-brand);box-shadow:0 0 0 3px rgba(217,43,43,.12)}
.bx-logo{min-height:52px;padding:8px 20px}
.bx-logo img{display:block;height:28px;width:auto;max-width:150px}
.bx-label{font-size:12.5px;color:var(--v2-muted);font-weight:600}
.bx-hint{margin-top:14px;padding:14px 14px 14px 16px;border-radius:14px;background:var(--v2-gray);border:1.5px solid rgba(217,43,43,.35);border-left:4px solid var(--v2-brand);animation:bx-in .32s cubic-bezier(.2,.8,.2,1) both,bx-ring 1.6s ease-out .35s 1}
.bx-hint strong{display:block;font-size:14px;margin-bottom:4px}
.bx-hint p{margin:0 0 12px;font-size:13px;line-height:1.55;color:var(--v2-muted)}
@keyframes bx-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes bx-ring{0%{box-shadow:0 0 0 0 rgba(217,43,43,.38)}100%{box-shadow:0 0 0 12px rgba(217,43,43,0)}}
@media (prefers-reduced-motion:reduce){.bx-btn,.bx-hint{transition:none;animation:none}.bx-btn:hover:not(:disabled),.bx-btn:active:not(:disabled){transform:none}}
`;

export const SYSTEM_LABEL: Record<BooksSystem, string> = { zoho: "Zoho Books", tally: "Tally" };
/** The product's own logo, as a white button face. The name is carried by aria-label and title. */
export const SystemLogo = ({ system }: { system: BooksSystem }) => (
  <img src={system === "zoho" ? "/brand/zoho-books.png" : "/brand/tally-prime.png"} alt="" draggable={false} style={system === "tally" ? { height: 34 } : undefined} />
);

type Linked = { zoho: Set<string>; tally: Set<string> };
let linkedCache: { at: number; value: Linked } | null = null;
/** Forget what was read (used when connections change, and in tests). */
export const resetBooksCache = () => {
  linkedCache = null;
};

/** Clients with a Zoho Books link or a Tally company mapped to them, read once a minute. */
async function loadLinked(): Promise<Linked> {
  if (linkedCache && Date.now() - linkedCache.at < 60_000) return linkedCache.value;
  const value: Linked = { zoho: new Set(), tally: new Set() };
  await Promise.all([
    zohoBooksStatus()
      .then((s) => s.links.forEach((l) => value.zoho.add(l.business_id)))
      .catch(() => undefined),
    tallyConnectors()
      .then((cs) => cs.forEach((c) => c.companies.forEach((co) => co.business_id && value.tally.add(co.business_id))))
      .catch(() => undefined),
  ]);
  linkedCache = { at: Date.now(), value };
  return value;
}

/**
 * The books a client keeps, decided by what is actually connected: a Zoho Books link, a Tally company
 * mapped to the client, or documents already pulled from either. Both may be true.
 */
export function useBooksFor(clientId: string | null): BooksSystem[] & { ready: boolean } {
  const { docs } = useV2();
  const [linked, setLinked] = useState<Linked | null>(linkedCache?.value ?? null);
  useEffect(() => {
    let live = true;
    void loadLinked().then((l) => live && setLinked(l));
    return () => {
      live = false;
    };
  }, []);
  const ready = linked !== null || !clientId;
  const withReady = (list: BooksSystem[]) => Object.assign(list, { ready });
  if (!clientId || !linked) return withReady([]);
  const out = new Set<BooksSystem>();
  if (linked.zoho.has(clientId)) out.add("zoho");
  if (linked.tally.has(clientId)) out.add("tally");
  const seen = detectBooks(docs, clientId);
  if (seen) out.add(seen);
  return withReady([...out]);
}

/** Export buttons for the queue's filter bar: one per connected system, with its logo; both when none is known. */
export function BooksExportButton({ clientId, allPeriods }: { clientId: string; allPeriods: boolean }) {
  const [open, setOpen] = useState<BooksSystem | null>(null);
  const { exceptions } = useV2();
  const forClient = clientId !== "all" ? clientId : null;
  const connected = useBooksFor(forClient);
  const hasAny = exceptions.some((e) => e.status === "open" && e.side !== "books");
  const shown: BooksSystem[] = connected.length ? connected : ["zoho", "tally"];
  if (!connected.ready)
    return (
      <button className="bx-btn" disabled aria-busy="true">
        Export…
      </button>
    );
  return (
    <>
      <style>{BX_STYLES}</style>
      <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="bx-label">Export to</span>
        {shown.map((s) => (
          <button key={s} className="bx-btn bx-logo" onClick={() => setOpen(s)} disabled={!hasAny} aria-label={`Export to ${SYSTEM_LABEL[s]}`} title={hasAny ? `Export to ${SYSTEM_LABEL[s]}: download what the books are missing, ready to import` : "Nothing open to export"}>
            <SystemLogo system={s} />
          </button>
        ))}
      </span>
      <BooksExportDrawer open={open !== null} onClose={() => setOpen(null)} clientId={forClient} allPeriods={allPeriods} initialSystem={open ?? undefined} />
    </>
  );
}

export function BooksExportDrawer({ open, onClose, clientId, allPeriods, initialSystem, similarTo }: { open: boolean; onClose: () => void; clientId: string | null; allPeriods: boolean; initialSystem?: BooksSystem; similarTo?: { amount: number; narration: string } }) {
  const { exceptions, clients, clientName, docs, period } = useV2();
  const month = allPeriods ? null : period;
  const [onlySimilar, setOnlySimilar] = useState(true);
  const everything = useMemo(
    () =>
      exceptions
        .filter((e) => !month || monthOf(e.date) === month)
        .map((e) => ({ id: e.id, clientId: e.clientId, date: e.date, amount: e.amount, narration: e.narration, side: e.side, status: e.status })),
    [exceptions, month],
  );
  const mine = clientId ? everything.filter((e) => e.clientId === clientId && e.status === "open") : [];
  const similar = similarTo ? similarLines(mine, similarTo) : null;
  const list = similar && onlySimilar ? everything.filter((e) => similar.some((x) => x.id === e.id)) : everything;
  // With no client chosen, offer the ones that have something to export.
  const withWork = clients.filter((c) => countFor(list, c.id, null).all > 0);
  const [picked, setPicked] = useState<string | null>(null);
  const id = clientId ?? picked ?? withWork[0]?.id ?? null;
  const connected = useBooksFor(id);
  const detected = connected[0] ?? null;
  const [system, setSystem] = useState<BooksSystem>("zoho");
  const [bank, setBank] = useState("");
  useEffect(() => {
    if (id) setBank(readLedger(id));
  }, [id]);
  useEffect(() => {
    if (open) setSystem(initialSystem ?? connected[0] ?? "zoho");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSystem, id, connected.join(",")]);

  if (!id) {
    return (
      <Drawer open={open} onClose={onClose} title="Export for your books">
        <p style={{ fontSize: 13, color: V.muted }}>Nothing is open to export for {month ?? "any period"}. Lines the books are missing appear here once Recon has run.</p>
      </Drawer>
    );
  }
  const name = clientName(id);
  const opts = { clientId: id, clientName: name, period: null, stamp: month ?? "all periods" };
  const n = countFor(list, id, null);
  const tally = buildTallyExport(list, { ...opts, bankLedger: bank });

  return (
    <Drawer open={open} onClose={onClose} title={`Export to ${SYSTEM_LABEL[system]}`}>
      <style>{BX_STYLES}</style>
      {!clientId && (
        <div style={{ marginBottom: 14 }}>
          <label className="v2-label" htmlFor="export-client">Client</label>
          <select id="export-client" className="v2-input" value={id} onChange={(e) => setPicked(e.target.value)}>
            {withWork.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {countFor(list, c.id, null).all} lines</option>
            ))}
          </select>
        </div>
      )}
      <div role="group" aria-label="Accounting software" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        {(["zoho", "tally"] as const).map((s) => (
          <button key={s} className="bx-btn bx-logo" aria-pressed={system === s} aria-label={SYSTEM_LABEL[s]} title={SYSTEM_LABEL[s]} onClick={() => setSystem(s)}>
            <SystemLogo system={s} />
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: V.muted, marginBottom: 12 }}>
        {connected.length ? `${name} is connected to ${connected.map((c) => SYSTEM_LABEL[c]).join(" and ")}.` : `${name} has no Zoho Books or Tally connection yet, so pick the software they use. Connect it in Settings → Integrations and this picks itself.`}
      </div>
      {similar && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: "0 0 12px" }}>
          <input type="checkbox" checked={onlySimilar} onChange={(e) => setOnlySimilar(e.target.checked)} />
          Only lines like this one ({similar.length}); untick for all {mine.length} open lines
        </label>
      )}
      <p style={{ fontSize: 13, color: V.muted, lineHeight: 1.6, marginTop: 0 }}>
        What the books of {name} {month ? `(${month})` : "(all periods)"} are missing, as files for {SYSTEM_LABEL[system]}. FynHelp does not connect to or change anything there for this.
      </p>

      {system === "zoho" ? (
        <>
          <ol style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Download a file below.</li>
            <li>In Zoho Books open the path shown under it and choose the file.</li>
            <li>Map the columns (they match by name), pick your bank account, check the guesses, and import.</li>
            <li>Come back and pull the month again, then run Recon: the lines should now match.</li>
          </ol>
          <div style={{ display: "grid", gap: 10 }}>
            {EXPORT_KINDS.map((k) => {
              const x = buildZohoExport(k.kind as ExportKind, list, opts);
              return (
                <Card key={k.kind}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{k.label} · {x.count}</div>
                      <div style={{ fontSize: 12.5, color: V.muted }}>{k.hint} {x.count > 0 && `Total ${formatINR(x.total)}.`}</div>
                      <div style={{ fontSize: 11.5, color: V.muted, marginTop: 4 }}>Zoho Books: {k.zohoPath}</div>
                    </div>
                    <button className="bx-btn bx-primary" disabled={x.count === 0} onClick={() => { save(x.filename, x.csv, "text/csv"); toast.success(`${x.count} line${x.count === 1 ? "" : "s"} downloaded.`); }}>
                      Download CSV
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <ol style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Type the exact name of the bank ledger in Tally, then download the file.</li>
            <li>In Tally: Gateway of Tally → Import → Data, choose the file, and set "If data already exists" to "Ignore duplicates".</li>
            <li>Check the new vouchers (Day Book) and reclassify any ledger the guess got wrong.</li>
            <li>Sync Tally to FynHelp again and run Recon: the lines should now match.</li>
          </ol>
          <Card>
            <label className="v2-label" htmlFor="tally-bank">Bank ledger name in Tally</label>
            <input
              id="tally-bank"
              className="v2-input"
              placeholder="e.g. Axis Bank A/c"
              value={bank}
              onChange={(e) => {
                setBank(e.target.value);
                try {
                  window.localStorage.setItem(ledgerKey(id), e.target.value);
                } catch {
                  /* remembered only when the browser allows */
                }
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, color: V.muted }}>
                {n.out} payment{n.out === 1 ? "" : "s"} and {n.in} receipt{n.in === 1 ? "" : "s"} as vouchers{tally.count > 0 && `, ${formatINR(tally.total)}`}. Missing ledgers are created.
              </div>
              <button
                className="bx-btn bx-primary"
                disabled={tally.count === 0 || !bank.trim()}
                title={bank.trim() ? undefined : "Enter the bank ledger name first"}
                onClick={() => { save(tally.filename, tally.xml, "text/xml"); toast.success(`${tally.count} voucher${tally.count === 1 ? "" : "s"} downloaded.`); }}
              >
                Download XML
              </button>
            </div>
          </Card>
        </>
      )}
      <p style={{ fontSize: 12, color: V.muted, marginTop: 14, lineHeight: 1.6 }}>
        The account, party and invoice are guesses from the bank narration. A person checks them before they count.
      </p>
    </Drawer>
  );
}
