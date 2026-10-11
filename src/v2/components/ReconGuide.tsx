/**
 * What Recon needs for the month on screen, worked out by rules from what
 * has been uploaded (no AI): which side is missing, which months the files
 * actually cover, and the one thing to do next.
 */
import { CalendarSearch, FileUp, Landmark, NotebookText } from "lucide-react";
import { Card, V } from "../ui";
import { Doc, monthOf, useV2 } from "../store";

export function ReconGuide({ clientId, onUpload }: { clientId: string; onUpload: () => void }) {
  const { docs, period, setPeriod } = useV2();
  const cDocs = docs.filter((d) => d.clientId === clientId);
  const rows = cDocs.flatMap((d) => d.rows.map((r) => ({ ...r, side: r.side ?? d.side })));
  const here = rows.filter((r) => r.date && monthOf(r.date) === period);
  const bank = here.filter((r) => r.side !== "books").length;
  const books = here.filter((r) => r.side === "books").length;
  if (bank && books) return null;

  const months = [...new Set(rows.map((r) => (r.date ? monthOf(r.date) : null)).filter(Boolean) as string[])];
  const registers = cDocs.filter((d: Doc) => d.register).map((d) => d.register!.label);

  let icon = <FileUp size={18} />;
  let title = "";
  let body = "";
  if (!bank && !books) {
    icon = <CalendarSearch size={18} />;
    title = months.length ? `Nothing dated in ${period}` : "Recon needs two files for the month";
    body = months.length
      ? `This client's files cover ${months.slice(0, 4).join(", ")}${months.length > 4 ? " and more" : ""}. Open one of those months, or upload the bank statement and Tally books for ${period}.`
      : `Upload the bank statement and the Tally day book (or ledger) for ${period}. Recon matches one against the other as soon as both are in.`;
  } else if (!books) {
    icon = <NotebookText size={18} />;
    title = `Upload the books for ${period}`;
    body = `The bank statement is in (${bank} line${bank === 1 ? "" : "s"}). Add the Tally day book or ledger for the same month and bank account, and Recon runs by itself.`;
  } else {
    icon = <Landmark size={18} />;
    title = `Upload the bank statement for ${period}`;
    body = `The books are in (${books} entr${books === 1 ? "y" : "ies"}). Add the bank statement for the same month, and Recon runs by itself.`;
  }
  if (registers.length)
    body += ` ${[...new Set(registers)].join(", ")} ${registers.length === 1 ? "is" : "are"} kept as a register and not reconciled.`;

  return (
    <Card style={{ borderLeft: `3px solid ${V.brand}`, background: V.cream, marginBottom: 18 }} data-testid="recon-guide">
      <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", color: V.brand, display: "grid", placeItems: "center" }}>{icon}</span>
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 13.5, color: V.body, marginTop: 4, lineHeight: 1.55 }}>{body}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="v2-btn v2-btn-primary" onClick={onUpload}><FileUp size={15} /> Upload files</button>
            {!bank && !books &&
              months.slice(0, 3).map((m) => (
                <button key={m} className="v2-btn v2-btn-ghost" onClick={() => setPeriod(m)}>
                  <CalendarSearch size={15} /> Open {m}
                </button>
              ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
