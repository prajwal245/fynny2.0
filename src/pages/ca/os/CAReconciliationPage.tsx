import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { logReconRun } from "@/lib/caReconRuns";
import { useClientIntelligence } from "@/hooks/useCAIntelligence";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, CABadge, caInputStyle, inr, dateIN } from "@/components/ca/portalUi";
import { ConfidenceChip, ModuleHeader, PermissionNotice, QueueTable, StatStrip } from "@/components/ca/os/primitives";
import {
  acceptMatch,
  raiseExceptions,
  reconcile,
  REASON_LABELS,
  type BankLine,
  type ExpenseLine,
  type InvoiceLine,
  type MatchPass,
  type MatchSuggestion,
  type ReconResult,
} from "@/lib/caRecon";

const PASS_LABEL: Record<MatchPass, string> = { exact: "Exact", fuzzy: "Fuzzy", rule: "Rule" };
const PASS_TONE: Record<MatchPass, "green" | "amber" | "grey"> = { exact: "green", fuzzy: "amber", rule: "grey" };

export default function CAReconciliationPage() {
  const { firmId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();

  const [businessId, setBusinessId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [bankCount, setBankCount] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);

  const { data: clientIntel } = useClientIntelligence(firmId ?? null, businessId || null);

  /** Learned date window from the client's intelligence row; defaults when unset. */
  const reconOpts = useMemo(
    () => ({
      exactWindowDays:
        clientIntel?.match_preferences?.exact_window_days ??
        clientIntel?.match_preferences?.date_window_days ??
        3,
      fuzzyWindowDays:
        clientIntel?.match_preferences?.fuzzy_window_days ??
        Math.min(28, (clientIntel?.match_preferences?.date_window_days ?? 3) * 7),
      partPaymentFloor: clientIntel?.match_preferences?.part_payment_floor ?? 0.1,
    }),
    [clientIntel],
  );

  useEffect(() => {
    if (!businessId && clients.length) setBusinessId(clients[0].business_id);
  }, [clients, businessId]);

  const run = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setResult(null);

    const [bankRes, invRes, expRes, custRes, vendRes] = await Promise.all([
      supabase
        .from("bank_transactions")
        .select("id, date, description, amount, type, reconciled, source_reference")
        .eq("business_id", businessId)
        .gte("date", from)
        .lte("date", to)
        .order("date"),
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, outstanding_amount, status, customer_id")
        .eq("business_id", businessId),
      supabase
        .from("expenses")
        .select("id, date, description, amount, payment_status, vendor_id")
        .eq("business_id", businessId),
      supabase.from("customers").select("id, customer_name").eq("business_id", businessId),
      supabase.from("vendors").select("id, vendor_name").eq("business_id", businessId),
    ]);

    const custMap = new Map(((custRes.data ?? []) as { id: string; customer_name: string }[]).map((c) => [c.id, c.customer_name]));
    const vendMap = new Map(((vendRes.data ?? []) as { id: string; vendor_name: string }[]).map((v) => [v.id, v.vendor_name]));

    const bank = (bankRes.data ?? []) as BankLine[];
    const invoices: InvoiceLine[] = ((invRes.data ?? []) as (InvoiceLine & { customer_id: string | null })[]).map((i) => ({
      ...i,
      customer_name: i.customer_id ? custMap.get(i.customer_id) ?? null : null,
    }));
    const expenses: ExpenseLine[] = ((expRes.data ?? []) as (ExpenseLine & { vendor_id: string | null })[]).map((e) => ({
      ...e,
      vendor_name: e.vendor_id ? vendMap.get(e.vendor_id) ?? null : null,
    }));

    setBankCount(bank.length);
    const res = reconcile(bank, invoices, expenses, reconOpts);
    setResult(res);
    setLoading(false);

    if (firmId) {
      const partial = res.suggestions.filter((s) => s.partial).length;
      await logReconRun({
        firmId,
        businessId,
        reconType: "bank",
        period: `${from} → ${to}`,
        totalItems: bank.length,
        matched: res.suggestions.length,
        mismatched: partial,
        unmatched: res.unmatched.length,
        totalMatchedValue: res.suggestions.reduce((s, x) => s + x.bank.amount, 0),
        totalAtRisk: res.unmatched.reduce((s, x) => s + Math.abs(x.bank.amount), 0),
        snapshot: {
          bank_lines: bank.length,
          open_invoices: invoices.filter((i) => i.outstanding_amount > 0).length,
          open_expenses: expenses.filter((e) => e.payment_status !== "paid").length,
          exact: res.suggestions.filter((s) => s.pass === "exact").length,
          fuzzy: res.suggestions.filter((s) => s.pass === "fuzzy").length,
          rule: res.suggestions.filter((s) => s.pass === "rule").length,
          part_payments: partial,
          unmatched: res.unmatched.length,
          window: `${from} to ${to}`,
        },
      });
    }
  }, [businessId, from, to, firmId, reconOpts]);


  const accept = async (s: MatchSuggestion) => {
    if (!firmId) return;
    setApplying(s.bank.id);
    const res = await acceptMatch(s, { firmId, businessId, actorRole: role });
    setApplying(null);
    if (!res.ok) return toast.error(res.error ?? "Could not apply match");
    toast.success("Matched and settled");
    setResult((r) => (r ? { ...r, suggestions: r.suggestions.filter((x) => x.bank.id !== s.bank.id) } : r));
  };

  const acceptAllExact = async () => {
    if (!result || !firmId) return;
    const exact = result.suggestions.filter((s) => s.pass === "exact");
    if (!exact.length) return;
    setApplying("bulk");
    let ok = 0;
    for (const s of exact) {
      const r = await acceptMatch(s, { firmId, businessId, actorRole: role });
      if (r.ok) ok += 1;
    }
    setApplying(null);
    toast.success(`${ok} exact matches applied`);
    void run();
  };

  const sendToExceptions = async () => {
    if (!result || !firmId) return;
    const res = await raiseExceptions(result.unmatched, { firmId, businessId, actorRole: role });
    if (res.error) return toast.error(res.error);
    toast.success(res.created ? `${res.created} exceptions raised` : "No new exceptions — all already in the queue");
  };

  const matchedValue = useMemo(
    () => (result?.suggestions ?? []).reduce((s, x) => s + x.bank.amount, 0),
    [result],
  );

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Reconciliation" subtitle="Match bank lines to invoices and bills." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Reconciliation"
        subtitle="Three passes over the client's bank lines — exact, then fuzzy on party name, then part-payment rules. Nothing is written until you accept."
      />

      {clientIntel?.match_preferences?.tolerance_pct != null && (
        <div style={{ fontFamily: CA.mono, fontSize: 11, color: CA.faint, margin: "-8px 0 12px" }}>
          Tolerance tuned to {clientIntel.match_preferences.tolerance_pct}% for this client
        </div>
      )}

      <CACard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <select style={caInputStyle} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>
                {c.client_name}
              </option>
            ))}
          </select>
          <input style={caInputStyle} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input style={caInputStyle} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <CAButton onClick={run} disabled={!businessId || loading}>
            {loading ? "Matching…" : "Run reconciliation"}
          </CAButton>
        </div>
      </CACard>

      {result && (
        <>
          <StatStrip
            items={[
              { label: "Bank lines scanned", value: String(bankCount) },
              { label: "Suggested matches", value: String(result.suggestions.length) },
              { label: "Value matched", value: inr(matchedValue) },
              { label: "Unmatched", value: String(result.unmatched.length), tone: result.unmatched.length ? "amber" : "green" },
            ]}
          />

          <CACard style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink }}>Suggested matches</div>
              <CAButton
                variant="ghost"
                onClick={acceptAllExact}
                disabled={applying !== null || !result.suggestions.some((s) => s.pass === "exact")}
              >
                Accept all exact
              </CAButton>
            </div>
            <QueueTable
              columns={["Date", "Bank line", "Amount", "Matches", "Pass", "Confidence", ""]}
              empty="No suggestions"
              emptyHint="Every line in this window is either already reconciled or sitting in the unmatched list below."
              rows={result.suggestions.map((s) => [
                dateIN(s.bank.date),
                <div key="d">
                  <div style={{ fontWeight: 600 }}>{s.bank.description ?? "—"}</div>
                  <div style={{ fontSize: 11.5, color: CA.faint }}>{s.rationale}</div>
                </div>,
                <span key="a" style={{ fontFamily: CA.mono }}>
                  {inr(s.bank.amount)}
                </span>,
                <div key="c">
                  <div>{s.counterpartLabel}</div>
                  <div style={{ fontSize: 11.5, color: CA.faint }}>
                    open {inr(s.counterpartAmount)}
                    {s.partial ? " · part payment" : ""}
                  </div>
                </div>,
                <CABadge key="p" tone={PASS_TONE[s.pass]}>
                  {PASS_LABEL[s.pass]}
                </CABadge>,
                <ConfidenceChip key="cf" value={s.confidence} />,
                <CAButton key="b" onClick={() => accept(s)} disabled={applying !== null}>
                  Accept
                </CAButton>,
              ])}
            />
          </CACard>

          <CACard style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink }}>Unmatched lines</div>
              <CAButton variant="ghost" onClick={sendToExceptions} disabled={!result.unmatched.length}>
                Send to exception queue
              </CAButton>
            </div>
            <QueueTable
              columns={["Date", "Bank line", "Amount", "Reason", "Severity"]}
              empty="Nothing unmatched"
              emptyHint="Every bank line in this window found a counterpart."
              rows={result.unmatched.map((u) => [
                dateIN(u.bank.date),
                u.bank.description ?? "—",
                <span key="a" style={{ fontFamily: CA.mono }}>
                  {inr(u.bank.amount)}
                </span>,
                REASON_LABELS[u.reason],
                <CABadge key="s" tone={u.severity === "high" ? "red" : u.severity === "medium" ? "amber" : "grey"}>
                  {u.severity}
                </CABadge>,
              ])}
            />
          </CACard>
        </>
      )}
    </div>
  );
}
