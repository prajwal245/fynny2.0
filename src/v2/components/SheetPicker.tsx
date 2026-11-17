import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, FileSpreadsheet } from "lucide-react";
import { previewPracticeDocumentSheets } from "@/lib/practice/practice.functions";
import { V } from "../ui";
import { AgentTrace } from "./AgentTrace";

type Preview = Awaited<ReturnType<typeof previewPracticeDocumentSheets>>;

/**
 * An Excel file with several sheets: each sheet as a card saying what FynHelp finds in it, the one it would read marked, and one tap to
 * read another. A books file read as a TDS register is the usual reason to open this.
 */
export function SheetPicker({ docId, current, busy, onPick }: { docId: string; current: string | null | undefined; busy: boolean; onPick: (sheet: string | null) => void }) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    void previewPracticeDocumentSheets({ data: { id: docId } }).then((d) => live && setData(d)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [docId]);
  if (error) return null;
  if (!data) return <div style={{ padding: "10px 12px", border: `1px solid ${V.line}`, borderRadius: 12, margin: "0 0 12px" }}><AgentTrace agent="extract" compact title="Looking at each sheet" steps={["Opening the workbook", "Finding the tables", "Counting the lines in each"]} /></div>;
  const selected = current ?? data.sheets.find((s) => s.chosen)?.name ?? null;
  return (
    <div data-testid="sheet-picker" style={{ margin: "0 0 12px", padding: 12, border: `1px solid ${V.line}`, borderRadius: 14 }}>
      <div style={{ fontWeight: 600, color: V.ink }}>This Excel file has {data.sheets.length} sheets</div>
      <div style={{ fontSize: 12.5, color: V.muted, margin: "2px 0 10px" }}>Choose the one that holds the transactions. The file is read again. {current ? "You chose a sheet; pick “Let FynHelp choose” to go back." : "FynHelp is reading the marked one."}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {data.sheets.map((s, i) => {
          const on = selected === s.name;
          return (
            <motion.button
              key={s.name}
              type="button"
              disabled={busy}
              onClick={() => onPick(s.name)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 6) * 0.04 }}
              whileHover={{ y: -1 }}
              aria-pressed={on}
              style={{ textAlign: "left", display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, alignItems: "start", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${on ? V.brand : V.line}`, background: on ? "rgba(217,43,43,.06)" : V.card, cursor: busy ? "progress" : "pointer", color: V.ink }}
            >
              <FileSpreadsheet size={18} color={on ? V.brand : V.muted} />
              <span>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ display: "block", fontSize: 12.5, color: V.body }}>{s.finds}</span>
                {s.title && <span style={{ display: "block", fontSize: 11.5, color: V.muted, marginTop: 2 }}>{s.title}</span>}
              </span>
              <span style={{ fontSize: 11.5, color: V.muted, display: "inline-flex", gap: 6, alignItems: "center" }}>
                {s.rows.toLocaleString("en-IN")} rows {on && <Check size={14} color={V.green} />}
              </span>
            </motion.button>
          );
        })}
        {current && <button type="button" className="bx-btn bx-sm" disabled={busy} onClick={() => onPick(null)}>Let FynHelp choose</button>}
      </div>
    </div>
  );
}
