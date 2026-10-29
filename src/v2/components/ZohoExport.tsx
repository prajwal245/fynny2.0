/**
 * "Export for Zoho": CSVs of what the books are missing, for the CA to import into Zoho
 * Books by hand. No Zoho connection or write access is involved.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Card, Drawer, V, formatINR } from "../ui";
import { useV2, monthOf } from "../store";
import { EXPORT_KINDS, buildZohoExport, countFor, type ExportKind } from "@/lib/practice/zohoExport";

function save(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ZohoExportButton({ clientId, allPeriods }: { clientId: string; allPeriods: boolean }) {
  const { exceptions, clientName, period } = useV2();
  const [open, setOpen] = useState(false);
  const month = allPeriods ? null : period;
  const list = exceptions
    .filter((e) => !month || monthOf(e.date) === month)
    .map((e) => ({ id: e.id, clientId: e.clientId, date: e.date, amount: e.amount, narration: e.narration, side: e.side, status: e.status }));
  const n = countFor(list, clientId, null);
  const opts = { clientId, clientName: clientName(clientId), period: null, stamp: month ?? "all periods" };

  return (
    <>
      <button className="v2-btn v2-btn-ghost" onClick={() => setOpen(true)} disabled={n.all === 0} title={n.all === 0 ? "Nothing open to export" : undefined}>
        <Download size={14} style={{ marginRight: 6 }} />Export for Zoho
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Export for Zoho Books">
        <p style={{ fontSize: 13, color: V.muted, lineHeight: 1.6, marginTop: 0 }}>
          Files for {clientName(clientId)} {month ? `(${month})` : "(all periods)"} listing what the books are missing. Download one, then import it in Zoho Books. FynHelp does not connect to or change anything in Zoho for this.
        </p>
        <ol style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Download a file below.</li>
          <li>In Zoho Books open the path shown under it and choose the file.</li>
          <li>Map the columns (they match by name), check the account guesses, and import.</li>
          <li>Come back and run Recon again: the lines should now match.</li>
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
                  <button
                    className="v2-btn v2-btn-primary"
                    disabled={x.count === 0}
                    onClick={() => { save(x.filename, x.csv); toast.success(`${x.count} line${x.count === 1 ? "" : "s"} downloaded.`); }}
                  >
                    Download CSV
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: V.muted, marginTop: 14, lineHeight: 1.6 }}>
          The expense account, customer and invoice are guesses from the bank narration. Leave "Paid Through" and "Deposit To" blank in the file and pick your bank account while importing.
        </p>
      </Drawer>
    </>
  );
}
