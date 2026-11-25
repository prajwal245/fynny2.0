import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Badge, Card, V } from "../ui";
import { getPracticeYearChecks } from "@/lib/practice/practice.functions";
import { workbookBytes, type SheetSpec } from "@/lib/practice/review/workpaper";
import type { YearCheck } from "@/lib/practice/review/yearChecks";

const TONE = { findings: "warn", clear: "good", blocked: "neutral" } as const;
const WORD = { findings: "To look at", clear: "Nothing found", blocked: "Blocked" } as const;

const sheetOf = (c: YearCheck, header: [string, string | number][]): SheetSpec => ({
  name: c.label.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), header, columns: ["Reference", "Date", "Amount", "What we found", "CA decision"],
  rows: c.rows.map((r) => [r.ref, r.date ?? "", r.amount ?? null, r.detail, ""]),
  notes: [c.summary, "A finding is a reason to look, not a conclusion. The CA decides."],
});

/**
 * Seven year-end checks from the files already on the client. A check without its file says Blocked and names the file: never Passed.
 * Every count opens to the rows behind it.
 */
export default function YearChecks({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [res, setRes] = useState<Awaited<ReturnType<typeof getPracticeYearChecks>> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true);
    getPracticeYearChecks({ data: { business_id: clientId } })
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) toast.error(e instanceof Error ? e.message : "Could not run the year-end checks."); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [clientId]);

  const download = () => {
    if (!res) return;
    const header: [string, string | number][] = [["Client", clientName], ["Prepared by", "FynHelp"], ["Status", "For CA review"]];
    const bytes = workbookBytes(res.checks.filter((c) => c.status === "findings").map((c) => sheetOf(c, header)));
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${clientName} year-end checks.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const withFindings = res?.checks.filter((c) => c.status === "findings").length ?? 0;
  return (
    <Card data-testid="year-checks" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>Year-end checks</strong>
        {res && <Badge tone="info">{res.checks.filter((c) => c.status !== "blocked").length} of {res.checks.length} could run</Badge>}
        {withFindings > 0 && <button className="v2-btn" style={{ marginLeft: "auto" }} onClick={download}><Download size={14} /> Download the findings (Excel)</button>}
      </div>
      <p style={{ margin: "6px 0 10px", fontSize: 13, color: V.body }}>Run from the files already on this client. A check that is missing a file says so and is never shown as passed.</p>
      {busy && !res && <p style={{ fontSize: 13, color: V.muted }}>Reading the client's files…</p>}
      {res && (
        <div style={{ display: "grid", gap: 8 }}>
          {res.checks.map((c) => (
            <details key={c.id} data-testid={`year-check-${c.id}`} style={{ border: `1px solid ${V.line}`, borderRadius: 10, padding: "10px 12px" }} open={c.status === "findings" && c.rows.length <= 8}>
              <summary style={{ cursor: c.rows.length ? "pointer" : "default", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 13.5 }}>{c.label}</b>
                <Badge tone={TONE[c.status]}>{WORD[c.status]}{c.status === "findings" ? `: ${c.rows.length}` : ""}</Badge>
                <span style={{ fontSize: 12.5, color: V.body, flexBasis: "100%" }}>{c.summary}</span>
              </summary>
              {c.rows.length > 0 && (
                <ul style={{ margin: "8px 0 0 18px", fontSize: 12.5, color: V.body, display: "grid", gap: 4 }}>
                  {c.rows.slice(0, 150).map((r, i) => <li key={i}><b>{r.ref}</b>{r.date ? ` · ${r.date}` : ""}: {r.detail}</li>)}
                  {c.rows.length > 150 && <li style={{ color: V.muted }}>{c.rows.length - 150} more are in the Excel download.</li>}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
