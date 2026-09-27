import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logReconRun } from "@/lib/caReconRuns";
import {
  CA, CACard, CABadge, CAButton, CAEmpty, caTh, caTd, caNum, inr, dateIN,
} from "@/components/ca/portalUi";

type Status = "fully_matched" | "timing_gap" | "invoice_only" | "bank_only";

const STATUS_LABEL: Record<Status, string> = {
  fully_matched: "Fully matched",
  timing_gap: "Timing gap",
  invoice_only: "Invoice only",
  bank_only: "Bank only",
};
const STATUS_TONE: Record<Status, "green" | "amber" | "red" | "grey"> = {
  fully_matched: "green",
  timing_gap: "amber",
  invoice_only: "red",
  bank_only: "grey",
};

interface Row {
  key: string;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  invoiceAmount: number | null;
  bankDate: string | null;
  bankAmount: number | null;
  status: Status;
  variance: number | null;
}

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY;

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const hit = Object.keys(obj).find((o) => o.toLowerCase() === k);
    if (hit && obj[hit] !== null && obj[hit] !== undefined && obj[hit] !== "") return obj[hit];
  }
  return undefined;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isoDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let d = new Date(s);
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export default function ThreeWayMatchTab({ firmId, businessId, periodStart, periodEnd }: { firmId: string | null; businessId: string | null; periodStart?: string; periodEnd?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const run = useCallback(async () => {
    if (!firmId || !businessId) return;
    setLoading(true);
    console.log(`[fyn:recon] period-scoped periodStart=${periodStart ?? "none"} periodEnd=${periodEnd ?? "none"}`);
    const [extRes, bankRes] = await Promise.all([
      supabase
        .from("ca_document_extractions")
        .select("id, extracted, created_at")
        .eq("business_id", businessId)
        .eq("ca_firm_id", firmId)
        .eq("classification", "invoice")
        .eq("review_state", "posted")
        .gte("created_at", periodStart ? `${periodStart}T00:00:00Z` : "2000-01-01T00:00:00Z")
        .lte("created_at", periodEnd ? `${periodEnd}T23:59:59Z` : new Date().toISOString()),
      supabase
        .from("bank_transactions")
        .select("id, date, amount, description, type")
        .eq("business_id", businessId)
        .eq("type", "credit")
        .gte("date", periodStart ?? "2000-01-01")
        .lte("date", periodEnd ?? new Date().toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(1000),
    ]);
    if (extRes.error) toast.error(extRes.error.message);
    if (bankRes.error) toast.error(bankRes.error.message);

    const invoices = (extRes.data ?? []).map((e) => {
      const ex = (e.extracted ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        number: (pick(ex, ["invoice_number", "invoiceno", "invoice_no", "bill_number", "number"]) as string | undefined) ?? null,
        date: isoDate(pick(ex, ["invoice_date", "date", "bill_date"])) ?? isoDate(e.created_at),
        amount: num(pick(ex, ["total_amount", "total", "amount", "grand_total", "invoice_amount"])),
      };
    });

    const credits = (bankRes.data ?? []).map((b) => ({
      id: b.id,
      date: String(b.date),
      amount: Math.abs(Number(b.amount) || 0),
      description: b.description as string | null,
    }));

    const usedCredits = new Set<string>();
    const out: Row[] = [];

    for (const inv of invoices) {
      if (inv.amount === null || !inv.date) {
        out.push({
          key: inv.id, invoiceDate: inv.date, invoiceNumber: inv.number, invoiceAmount: inv.amount,
          bankDate: null, bankAmount: null, status: "invoice_only", variance: null,
        });
        continue;
      }
      const tolerance = Math.max(inv.amount * 0.02, 1);
      const candidates = credits
        .filter((c) => !usedCredits.has(c.id) && Math.abs(c.amount - (inv.amount as number)) <= tolerance)
        .sort((a, b) => daysApart(a.date, inv.date!) - daysApart(b.date, inv.date!));
      const near = candidates.find((c) => daysApart(c.date, inv.date!) <= 3);
      const wider = candidates[0];
      const hit = near ?? (wider && daysApart(wider.date, inv.date) <= 60 ? wider : undefined);

      if (!hit) {
        out.push({
          key: inv.id, invoiceDate: inv.date, invoiceNumber: inv.number, invoiceAmount: inv.amount,
          bankDate: null, bankAmount: null, status: "invoice_only", variance: null,
        });
        continue;
      }
      usedCredits.add(hit.id);
      const gap = daysApart(hit.date, inv.date);
      out.push({
        key: inv.id,
        invoiceDate: inv.date,
        invoiceNumber: inv.number,
        invoiceAmount: inv.amount,
        bankDate: hit.date,
        bankAmount: hit.amount,
        status: gap > 7 ? "timing_gap" : "fully_matched",
        variance: Math.round((hit.amount - inv.amount) * 100) / 100,
      });
    }

    for (const c of credits) {
      if (usedCredits.has(c.id)) continue;
      out.push({
        key: c.id, invoiceDate: null, invoiceNumber: c.description ?? null, invoiceAmount: null,
        bankDate: c.date, bankAmount: c.amount, status: "bank_only", variance: null,
      });
    }

    out.sort((a, b) => String(b.invoiceDate ?? b.bankDate ?? "").localeCompare(String(a.invoiceDate ?? a.bankDate ?? "")));
    setRows(out);
    setRan(true);
    setLoading(false);

    const matched = out.filter((r) => r.status === "fully_matched");
    const timing = out.filter((r) => r.status === "timing_gap");
    const invoiceOnly = out.filter((r) => r.status === "invoice_only");
    const bankOnly = out.filter((r) => r.status === "bank_only");
    await logReconRun({
      firmId,
      businessId,
      reconType: "three_way",
      period: new Date().toISOString().slice(0, 7),
      totalItems: out.length,
      matched: matched.length,
      mismatched: timing.length,
      unmatched: invoiceOnly.length + bankOnly.length,
      totalMatchedValue: matched.reduce((s, r) => s + (r.bankAmount ?? 0), 0),
      totalAtRisk: invoiceOnly.reduce((s, r) => s + (r.invoiceAmount ?? 0), 0),
      snapshot: {
        invoices_posted: invoices.length,
        bank_credits: credits.length,
        fully_matched: matched.length,
        timing_gaps: timing.length,
        invoice_only: invoiceOnly.length,
        bank_only: bankOnly.length,
        total_invoiced: invoices.reduce((s, i) => s + (i.amount ?? 0), 0),
        total_received: credits.reduce((s, c) => s + c.amount, 0),
      },
    });
  }, [firmId, businessId, periodStart, periodEnd]);

  useEffect(() => { void run(); }, [run]);

  const totals = useMemo(() => {
    const invoiced = rows.reduce((s, r) => s + (r.invoiceAmount ?? 0), 0);
    const received = rows.reduce((s, r) => s + (r.bankAmount ?? 0), 0);
    const outstanding = rows.filter((r) => r.status === "invoice_only").reduce((s, r) => s + (r.invoiceAmount ?? 0), 0);
    const gaps = rows.filter((r) => r.status === "timing_gap").length;
    return { invoiced, received, outstanding, gaps };
  }, [rows]);

  const exportCsv = () => {
    if (!rows.length) return toast.info("Nothing to export");
    const headers = ["Invoice date", "Invoice number", "Invoice amount", "Bank credit date", "Bank credit amount", "Status", "Variance"];
    const body = rows.map((r) => [
      r.invoiceDate ?? "", (r.invoiceNumber ?? "").replace(/"/g, "'"), r.invoiceAmount ?? "",
      r.bankDate ?? "", r.bankAmount ?? "", STATUS_LABEL[r.status], r.variance ?? "",
    ]);
    const csv = [headers, ...body].map((line) => line.map((c) => `"${String(c)}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `three-way-match-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Card = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <CACard style={{ padding: "14px 16px" }}>
      <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>{label}</div>
      <div style={{ fontFamily: CA.mono, fontSize: 19, fontWeight: 600, marginTop: 6, color: tone, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </CACard>
  );

  if (!businessId) return <CACard><CAEmpty title="No linked business" hint="Link this client to a business to run the 3-way match." /></CACard>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Card label="Total invoiced" value={inr(totals.invoiced)} />
        <Card label="Total received" value={inr(totals.received)} tone={CA.green} />
        <Card label="Outstanding receivables" value={inr(totals.outstanding)} tone={CA.red} />
        <Card label="Timing gaps" value={String(totals.gaps)} />
      </div>

      {periodStart && periodEnd && (
        <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginBottom: 8 }}>
          Showing reconciliation for {periodStart} to {periodEnd}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <CAButton onClick={run} disabled={loading}>{loading ? "Matching…" : "Re-run match"}</CAButton>
        <CAButton variant="ghost" onClick={exportCsv}>Export CSV</CAButton>
      </div>

      <CACard style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 16, color: CA.faint, fontFamily: CA.sans, fontSize: 13 }}>Matching invoices to bank credits…</div>
        ) : rows.length === 0 ? (
          <CAEmpty
            title={ran ? "Nothing to match" : "Not run yet"}
            hint="Needs posted invoice extractions and imported bank credits for this client."
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={caTh}>Invoice date</th><th style={caTh}>Invoice no.</th>
              <th style={{ ...caTh, textAlign: "right" }}>Amount</th>
              <th style={caTh}>Bank credit date</th>
              <th style={{ ...caTh, textAlign: "right" }}>Bank credit</th>
              <th style={caTh}>Status</th>
              <th style={{ ...caTh, textAlign: "right" }}>Variance</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  <tr>
                    <td style={caTd}>{r.invoiceDate ? dateIN(r.invoiceDate) : "—"}</td>
                    <td style={caTd}>{r.invoiceNumber ?? "—"}</td>
                    <td style={caNum}>{r.invoiceAmount === null ? "—" : inr(r.invoiceAmount)}</td>
                    <td style={caTd}>{r.bankDate ? dateIN(r.bankDate) : "—"}</td>
                    <td style={caNum}>{r.bankAmount === null ? "—" : inr(r.bankAmount)}</td>
                    <td style={caTd}><CABadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</CABadge></td>
                    <td style={caNum}>{r.variance === null ? "—" : inr(r.variance)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </CACard>
    </div>
  );
}
