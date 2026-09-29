import { Fragment, useEffect, useState } from "react";
import { loadReconRuns, type ReconRun } from "@/lib/caReconRuns";
import { CA, CACard, CABadge, CAEmpty, caTh, caTd, caNum, inr } from "@/components/ca/portalUi";

const TYPE_LABEL: Record<string, string> = { bank: "Bank", itc: "ITC / GSTR-2B", three_way: "3-way match" };

function fmtWhen(s: string) {
  const d = new Date(s);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

function SnapshotCard({ snapshot }: { snapshot: Record<string, unknown> | null }) {
  const entries = Object.entries(snapshot ?? {});
  if (!entries.length) return <div style={{ padding: 14, color: CA.faint, fontFamily: CA.sans, fontSize: 13 }}>No snapshot stored for this run.</div>;
  return (
    <div style={{ padding: 14, background: "rgba(0,0,0,0.02)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {entries.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
              {k.replace(/_/g, " ")}
            </div>
            <div style={{ fontFamily: CA.mono, fontSize: 13, marginTop: 4, wordBreak: "break-word" }}>
              {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReconHistorySection({ firmId, businessId }: { firmId: string | null; businessId: string | null }) {
  const [runs, setRuns] = useState<ReconRun[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firmId || !businessId) { setRuns([]); setLoading(false); return; }
    let live = true;
    setLoading(true);
    loadReconRuns(firmId, businessId).then((r) => { if (live) { setRuns(r); setLoading(false); } });
    return () => { live = false; };
  }, [firmId, businessId]);

  return (
    <CACard style={{ marginTop: 20, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${CA.line}`, fontFamily: CA.sans, fontSize: 13, fontWeight: 700 }}>
        Recon history
      </div>
      {loading ? (
        <div style={{ padding: 16, color: CA.faint, fontFamily: CA.sans, fontSize: 13 }}>Loading…</div>
      ) : runs.length === 0 ? (
        <CAEmpty title="No reconciliation runs yet" hint="Runs from the Reconciliation and ITC modules appear here." />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={caTh}>Date</th><th style={caTh}>Type</th><th style={caTh}>Period</th>
            <th style={{ ...caTh, textAlign: "right" }}>Matched</th>
            <th style={{ ...caTh, textAlign: "right" }}>Mismatched</th>
            <th style={{ ...caTh, textAlign: "right" }}>Unmatched</th>
            <th style={{ ...caTh, textAlign: "right" }}>Value matched</th>
            <th style={{ ...caTh, textAlign: "right" }}>Value at risk</th>
          </tr></thead>
          <tbody>
            {runs.map((r) => (
              <Fragment key={r.id}>
                <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                  <td style={caTd}>{fmtWhen(r.run_at)}</td>
                  <td style={caTd}><CABadge tone={r.recon_type === "bank" ? "green" : r.recon_type === "itc" ? "amber" : "grey"}>{TYPE_LABEL[r.recon_type] ?? r.recon_type}</CABadge></td>
                  <td style={caTd}>{r.period}</td>
                  <td style={caNum}>{r.matched}</td>
                  <td style={caNum}>{r.mismatched}</td>
                  <td style={caNum}>{r.unmatched}</td>
                  <td style={caNum}>{inr(r.total_matched_value)}</td>
                  <td style={{ ...caNum, color: Number(r.total_at_risk) > 0 ? CA.red : undefined }}>{inr(r.total_at_risk)}</td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, borderBottom: `1px solid ${CA.line}` }}>
                      <SnapshotCard snapshot={r.snapshot} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </CACard>
  );
}
