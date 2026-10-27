/**
 * What Recon needs for the month on screen, worked out by rules from what
 * has been uploaded (no AI): which side is missing, which months the files
 * actually cover, and every way to supply it without leaving the client:
 * upload it here, pick a file that already arrived, ask the client, or
 * connect Gmail so statements file themselves.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarSearch, FileUp, FolderInput, Landmark, MailPlus, NotebookText, Send } from "lucide-react";
import { Card, V } from "../ui";
import { Doc, monthOf, useV2 } from "../store";
import { GmailIcon } from "./BrandIcons";

const ACCEPT = ".csv,.xls,.xlsx,.xml,.pdf,.png,.jpg,.jpeg,.heic,.webp";

export function ReconGuide({ clientId, onUpload, onTab }: { clientId: string; onUpload: () => void; onTab?: (tab: string) => void }) {
  const { docs, period, setPeriod, addDoc, assignDoc, addChase, clients, firm, clientName, partnerView } = useV2();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const cDocs = docs.filter((d) => d.clientId === clientId);
  const rows = cDocs.flatMap((d) => d.rows.map((r) => ({ ...r, side: r.side ?? d.side })));
  const here = rows.filter((r) => r.date && monthOf(r.date) === period);
  const bank = here.filter((r) => r.side !== "books").length;
  const books = here.filter((r) => r.side === "books").length;
  if (bank && books) return null;

  const months = [...new Set(rows.map((r) => (r.date ? monthOf(r.date) : null)).filter(Boolean) as string[])];
  const registers = cDocs.filter((d: Doc) => d.register).map((d) => d.register!.label);
  // The side Recon is waiting for (both, when nothing is in).
  const need: "bank" | "books" | null = !bank && books ? "bank" : bank && !books ? "books" : null;
  const needLabel = need === "bank" ? "bank statement" : need === "books" ? "books (Tally day book or ledger)" : "bank statement and books";

  // Files that could be the missing side: arrivals without a client, and this
  // client's files filed on the other side. Registers never count.
  const candidates = docs.filter(
    (d) =>
      !d.register &&
      d.status !== "Processing" &&
      (!d.clientId || (d.clientId === clientId && need !== null && d.side !== need)),
  );

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach((f) => addDoc(f.name, clientId, "Manual", f));
    toast.success(`Reading ${files.length > 1 ? `${files.length} files` : files[0].name} for ${clientName(clientId)}. Recon runs once both sides are in.`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const useFile = async () => {
    const d = docs.find((x) => x.id === pick);
    if (!d) return;
    setBusy(true);
    await assignDoc(d.id, clientId, need ?? undefined);
    setBusy(false);
    setPick("");
  };

  const askClient = () => {
    const c = clients.find((x) => x.id === clientId);
    if (!c?.email && !c?.phone) {
      toast.info("Add the client's email or WhatsApp number in the chase, then send it.");
      onTab?.("chaser");
      return;
    }
    addChase({
      clientId,
      type: need === "bank" || need === null ? "Missing bank statement" : "Custom",
      contact: c.contactName || c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      due: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
      note: `Please share the ${needLabel} for ${period}.`,
    });
    toast.success(`Chase created: ${needLabel} for ${period}. The Chaser follows up until it arrives.`);
  };

  let icon = <FileUp size={18} />;
  let title = "";
  let body = "";
  if (!bank && !books) {
    icon = <CalendarSearch size={18} />;
    title = months.length ? `Nothing dated in ${period}` : "Recon needs two files for the month";
    body = months.length
      ? `This client's files cover ${months.slice(0, 4).join(", ")}${months.length > 4 ? " and more" : ""}. Open one of those months, or add the bank statement and Tally books for ${period}.`
      : `Add the bank statement and the Tally day book (or ledger) for ${period}. Recon matches one against the other as soon as both are in.`;
  } else if (!books) {
    icon = <NotebookText size={18} />;
    title = `Recon needs the books for ${period}`;
    body = `The bank statement is in (${bank} line${bank === 1 ? "" : "s"}). Add the Tally day book or ledger for the same month and bank account, and Recon runs by itself.`;
  } else {
    icon = <Landmark size={18} />;
    title = `Recon needs the bank statement for ${period}`;
    body = `The books are in (${books} entr${books === 1 ? "y" : "ies"}). Add the bank statement for the same month, and Recon runs by itself.`;
  }
  if (registers.length)
    body += ` ${[...new Set(registers)].join(", ")} ${registers.length === 1 ? "is" : "are"} kept as a register and not reconciled.`;

  return (
    <Card style={{ borderLeft: `3px solid ${V.brand}`, background: V.cream, marginBottom: 18 }} data-testid="recon-guide">
      <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(249,16,58,.16)", color: V.brand, display: "grid", placeItems: "center" }}>{icon}</span>
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 13.5, color: V.body, marginTop: 4, lineHeight: 1.55 }}>{body}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="v2-btn v2-btn-primary" onClick={() => fileRef.current?.click()} data-testid="recon-guide-upload">
              <FileUp size={15} /> Upload {need === "bank" ? "bank statement" : need === "books" ? "books" : "files"}
            </button>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => upload(e.target.files)} />
            <button className="v2-btn v2-btn-ghost" onClick={askClient}>
              <Send size={15} /> Ask the client
            </button>
            {!firm?.gmailConnected && partnerView && (
              <button className="v2-btn v2-btn-ghost" onClick={onUpload} title="Statements emailed by the client file themselves">
                <GmailIcon size={15} /> Connect Gmail
              </button>
            )}
            {!bank && !books &&
              months.slice(0, 3).map((m) => (
                <button key={m} className="v2-btn v2-btn-ghost" onClick={() => setPeriod(m)}>
                  <CalendarSearch size={15} /> Open {m}
                </button>
              ))}
          </div>

          {candidates.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <label className="v2-label" htmlFor={`recon-pick-${clientId}`} style={{ marginBottom: 0 }}>
                <FolderInput size={12} style={{ verticalAlign: "-1px" }} /> Or use a file that already arrived
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select id={`recon-pick-${clientId}`} className="v2-input" style={{ width: "auto", minWidth: 240, flex: "1 1 240px" }} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose a file…</option>
                  {candidates.slice(0, 40).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.clientId ? `filed as ${d.side === "books" ? "books" : "bank"}` : `unassigned${d.source !== "Manual" ? `, from ${d.source}` : ""}`}
                    </option>
                  ))}
                </select>
                <button className="v2-btn v2-btn-ghost" disabled={!pick || busy} data-busy={busy} onClick={useFile}>
                  <MailPlus size={15} /> File it {need ? `as ${need === "bank" ? "the bank statement" : "the books"}` : "here"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
