import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Badge, Card, V } from "../ui";
import { readAuditedPdf } from "@/lib/practice/practice.functions";
import { compareOpening, proveStatements, type Statement } from "@/lib/practice/audited";
import { isTallyMastersXml, readTallyMasters } from "@/lib/practice/extract/tallyMasters";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/**
 * Opening balances against last year's signed audit. The audited Balance Sheet and Profit and Loss are read by code and proved first
 * (they must add up and roll forward); only a proved statement is set against the opening balances in Tally.
 */
export default function OpeningBalanceCheck() {
  const [bs, setBs] = useState<Statement | null>(null);
  const [pl, setPl] = useState<Statement | null>(null);
  const [masters, setMasters] = useState<ReturnType<typeof readTallyMasters> | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (files: FileList | File[]) => {
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        if (/\.pdf$/i.test(f.name)) {
          const r = await readAuditedPdf({ data: { base64: await toBase64(f) } });
          if (!r.ok) { toast.error(`${f.name}: ${r.reason}`); continue; }
          (r.statement.kind === "balance_sheet" ? setBs : setPl)(r.statement);
        } else if (/\.xml$/i.test(f.name)) {
          const text = await f.text();
          if (!isTallyMastersXml(text)) { toast.error(`${f.name}: this is not a Tally masters file (ledgers with their opening balances).`); continue; }
          setMasters(readTallyMasters(text));
        } else toast.error(`${f.name}: use the signed Balance Sheet and Profit and Loss PDFs, and the Tally masters XML.`);
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setBusy(false);
  };

  const proofs = bs ? proveStatements(bs, pl) : [];
  const proved = proofs.length > 0 && proofs.slice(0, 3).every((p) => p.ok);
  const compare = bs && masters && proved ? compareOpening(bs, masters.ledgers) : null;

  return (
    <Card data-testid="opening-balance-check" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>Opening balances against last year's audit</strong>
        {bs && <Badge tone={proved ? "good" : "bad"}>{proved ? "Statements add up" : "Statements do not add up"}</Badge>}
      </div>
      <p style={{ margin: "6px 0 10px", fontSize: 13, color: V.body }}>Drop the signed audited Balance Sheet and Profit and Loss PDFs, and the Tally masters XML (ledgers with their opening balances). The statements are read by code and must add up before they are compared. Nothing is posted or changed.</p>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }}
        style={{ border: `1px dashed ${V.line}`, borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}
      >
        <input ref={input} type="file" multiple accept=".pdf,.xml" hidden onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} />
        <Upload size={18} color={V.muted} />
        <span style={{ fontSize: 13 }}>{busy ? "Reading…" : "Drop the files here or click to choose"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {bs && <Badge tone="info">Balance Sheet {bs.asAt ?? ""}</Badge>}
          {pl && <Badge tone="info">Profit and Loss</Badge>}
          {masters && <Badge tone="info">Tally masters: {masters.ledgers.length} ledgers</Badge>}
        </span>
      </div>

      {proofs.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          {proofs.map((p) => (
            <div key={p.label} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
              {p.ok ? <CheckCircle2 size={15} color={V.green} style={{ marginTop: 2 }} /> : <AlertTriangle size={15} color={V.maroon} style={{ marginTop: 2 }} />}
              <span><b>{p.label}.</b> <span style={{ color: V.muted }}>{p.detail}</span></span>
            </div>
          ))}
        </div>
      )}
      {bs && !proved && <p role="alert" style={{ color: V.maroon, fontSize: 13, margin: "10px 0 0" }}>The statements do not add up, so they are not compared with Tally. Check the PDF, or send the figures in Excel.</p>}
      {bs && proved && !masters && <p style={{ color: V.muted, fontSize: 13, margin: "10px 0 0" }}>Add the Tally masters XML (Gateway of Tally → Export → Masters) to compare the opening balances.</p>}

      {compare && (
        <div className="v2-scroll" style={{ marginTop: 12 }}>
          <table className="v2-table">
            <thead><tr><th>Head</th><th style={{ textAlign: "right" }}>Audited closing</th><th style={{ textAlign: "right" }}>Tally opening</th><th style={{ textAlign: "right" }}>Difference</th></tr></thead>
            <tbody>
              {compare.rows.map((r) => (
                <tr key={r.bucket}>
                  <td>{r.label}</td>
                  <td style={{ textAlign: "right" }} className="num">{inr(r.audited)}</td>
                  <td style={{ textAlign: "right" }} className="num">{inr(r.tally)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: r.status === "agree" ? V.green : V.maroon }} className="num">{r.status === "agree" ? "Agrees" : inr(r.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {compare.unmapped.length > 0 && <p style={{ fontSize: 12.5, color: V.body }}>Not placed in a head (custom groups): {compare.unmapped.map((u) => `${u.group} ${inr(u.amount)} (${u.ledgers} ledger${u.ledgers === 1 ? "" : "s"})`).join("; ")}.</p>}
          {compare.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: "4px 0 0" }}>{n}</p>)}
        </div>
      )}
    </Card>
  );
}
