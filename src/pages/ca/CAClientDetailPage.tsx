import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useParams, useNavigate } from "@/lib/router-compat";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { proxyExternalQuery } from "@/integrations/supabase/external";
import { useCAPortal } from "@/hooks/useCAPortal";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";
import { generateMisReport, type MisReport } from "@/lib/caMis.functions";
import { renderReportHtml, createReportShare, revokeReportShare } from "@/lib/caDocs.functions";
import { printHtmlDocument } from "@/lib/printPdf";
import { formatINR } from "@/lib/indian-format";

import ClientDocumentsTab from "@/components/ca/ClientDocumentsTab";
import ClientSyncPanel from "@/components/ca/ClientSyncPanel";
import ClientRemindersSection from "@/components/ca/ClientRemindersSection";
import ReconHistorySection from "@/components/ca/ReconHistorySection";
import ThreeWayMatchTab from "@/components/ca/ThreeWayMatchTab";
import ClientDeductionsTab from "@/components/ca/ClientDeductionsTab";
import ClientProfilePanel from "@/components/ca/ClientProfilePanel";
import ClientIntelligenceCard from "@/components/ca/ClientIntelligenceCard";
import ClientGroupCard from "@/components/ca/ClientGroupCard";
import TxnLineageDrawer, { sourceLabel, type LineageTxn } from "@/components/ca/TxnLineageDrawer";
import {
  CA, CACard, CAHeading, CABadge, CAButton, CAField, caInputStyle, statusTone, healthTone,
  inr, dateIN, caTh, caTd, caNum, CAEmpty,
} from "@/components/ca/portalUi";

interface Client {
  id: string;
  business_id: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  gstin: string | null;
  pan: string | null;
  client_status: string | null;
  onboarded_at: string | null;
  entity_type: string | null;
  entity_subtype: string | null;
  cin: string | null;
  llpin: string | null;
}

const TABS = ["Documents", "Reconcile", "GST and ITC", "Compliance", "Close", "Reports", "Deductions"] as const;
type Tab = typeof TABS[number];

const MIS_TEMPLATES = [
  { value: "monthly_mis", label: "Monthly MIS" },
  { value: "bank_rec_summary", label: "Bank Rec Summary" },
  { value: "variance_report", label: "Variance Report" },
  { value: "working_paper", label: "Working Paper" },
] as const;


function Metric({ label, value }: { label: string; value: string }) {
  return (
    <CACard style={{ padding: "14px 16px" }}>
      <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>{label}</div>
      <div style={{ fontFamily: CA.mono, fontSize: 19, fontWeight: 600, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </CACard>
  );
}

export default function CAClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { firmId, userId } = useCAPortal();
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<Tab>("Documents");
  const [loading, setLoading] = useState(true);

  // Tab data
  const [liquidity, setLiquidity] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [itc, setItc] = useState<any[]>([]);
  const [tds, setTds] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [txnPage, setTxnPage] = useState(0);
  const [lineageTxn, setLineageTxn] = useState<LineageTxn | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [showTdsForm, setShowTdsForm] = useState(false);
  const [showComplianceForm, setShowComplianceForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [misBusy, setMisBusy] = useState(false);
  const [misTemplate, setMisTemplate] = useState<"monthly_mis" | "bank_rec_summary" | "variance_report" | "working_paper">("monthly_mis");

  const [hideDemo, setHideDemoState] = useState<boolean>(() => {
    try { return window.localStorage.getItem("hide_seed_transactions") === "1"; } catch { return false; }
  });
  const setHideDemo = (v: boolean) => {
    setHideDemoState(v);
    try { window.localStorage.setItem("hide_seed_transactions", v ? "1" : "0"); } catch { /* restricted browser */ }
  };
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const monthStartIso = () => `${todayIso().slice(0, 7)}-01`;
  const [groupStart, setGroupStart] = useState(monthStartIso);
  const [groupEnd, setGroupEnd] = useState(todayIso);
  const [groupMisPhase, setGroupMisPhase] = useState<"idle" | "picking" | "loading" | "done">("idle");
  const [groupBusy, setGroupBusy] = useState(false);
  const [subCount, setSubCount] = useState(0);
  const [groupMis, setGroupMis] = useState<{
    period_start: string;
    period_end: string;
    entities: { client_name: string; business_id: string; revenue: number; expenses: number; net: number }[];
    group_revenue: number;
    group_expenses: number;
    group_net: number;
  } | null>(null);
  const [groupLogId, setGroupLogId] = useState<string | null>(null);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [sharePanel, setSharePanel] = useState<{ reportId: string; url: string; expires_at: string } | null>(null);
  const revokeShare = useServerFn(revokeReportShare);
  const renderPdf = useServerFn(renderReportHtml);
  const shareReport = useServerFn(createReportShare);

  const downloadReportPdf = async (id: string) => {
    setReportBusyId(id);
    try {
      const res = await renderPdf({ data: { kind: "mis_report", id } });
      printHtmlDocument(res.html);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare the PDF");
    } finally {
      setReportBusyId(null);
    }
  };

  const shareReportLink = async (id: string) => {
    setReportBusyId(id);
    try {
      const res = await shareReport({ data: { report_log_id: id, origin: window.location.origin, expires_days: 30 } });
      setSharePanel({ reportId: id, url: res.url, expires_at: res.expires_at });
      try {
        await navigator.clipboard.writeText(res.url);
        toast.success("Share link copied. It works for 30 days.");
      } catch {
        toast.success("Share link ready. Copy it from the panel below.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the share link");
    } finally {
      setReportBusyId(null);
    }
  };

  const revokeShareLink = async (id: string) => {
    setReportBusyId(id);
    try {
      await revokeShare({ data: { report_log_id: id } });
      setSharePanel(null);
      toast.success("Share link revoked. The client can no longer open it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke the share link");
    } finally {
      setReportBusyId(null);
    }
  };

  const [activePeriod, setActivePeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const periodStart = `${activePeriod}-01`;
  const periodEnd = (() => {
    const [y, m] = activePeriod.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${activePeriod}-${String(last).padStart(2, "0")}`;
  })();
  const periodLabel = new Date(Number(activePeriod.split("-")[0]), Number(activePeriod.split("-")[1]) - 1, 1)
    .toLocaleString("en-IN", { month: "long", year: "numeric" });

  const [mis, setMis] = useState<MisReport | null>(null);
  const [misPeriodInput, setMisPeriodInput] = useState(activePeriod);
  const [gstrUploads, setGstrUploads] = useState<any[]>([]);
  const [uploadingGstr, setUploadingGstr] = useState(false);
  const [gstrPeriod, setGstrPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => { setMisPeriodInput(activePeriod); }, [activePeriod]);

  useEffect(() => {
    console.log(`[fyn:ca] period-selector active — period=${activePeriod}`);
  }, [activePeriod]);

  const [clientNba, setClientNba] = useState<{ action: string; path: string; tone: string } | null>(null);
  const [closingPeriod, setClosingPeriod] = useState(false);


  const businessId = client?.business_id ?? null;

  useEffect(() => {
    if (!firmId || !businessId || !clientId) return;
    void (async () => {
      // Never reopen a period the firm has already closed.
      const { data: existing } = await supabase
        .from("ca_client_periods")
        .select("status")
        .eq("ca_firm_id", firmId)
        .eq("client_id", clientId)
        .eq("period", activePeriod)
        .maybeSingle();
      if (existing?.status === "closed") return;
      await supabase.from("ca_client_periods").upsert({
        ca_firm_id: firmId,
        client_id: clientId,
        business_id: businessId,
        period: activePeriod,
        period_start: periodStart,
        period_end: periodEnd,
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "ca_firm_id,client_id,period" });
      console.log(`[fyn:period] persisted ${activePeriod} for client ${clientId}`);
    })();

    try {
      void supabase.from("ca_brain_events").insert({
        ca_firm_id: firmId,
        business_id: businessId,
        event_type: "period_selected",
        payload: { period: activePeriod, client_id: clientId },
      });
    } catch { /* non-blocking */ }
  }, [activePeriod, firmId, businessId, clientId, periodStart, periodEnd]);


  useEffect(() => {
    if (!businessId || !firmId) return;
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    let cancelled = false;
    (async () => {
      try {
        const [excRes, compRes, txnRes] = await Promise.all([
          supabase.from("ca_exceptions").select("amount, status").eq("ca_firm_id", firmId).eq("business_id", businessId).neq("status", "resolved").order("amount", { ascending: false }).limit(1),
          supabase.from("ca_compliance_events").select("status, due_date, event_type").eq("ca_firm_id", firmId).eq("business_id", businessId).neq("status", "filed").lte("due_date", in3Days).order("due_date", { ascending: true }).limit(1),
          supabase.from("bank_transactions").select("id").eq("business_id", businessId).gte("date", periodStart).limit(1),
        ]);
        if (cancelled) return;
        const topException = excRes.data?.[0] as { amount: number; status: string } | undefined;
        const nextCompliance = compRes.data?.[0] as { due_date: string; event_type: string; status: string } | undefined;
        const hasTxns = (txnRes.data?.length ?? 0) > 0;

        if (topException && topException.amount > 10000) {
          setClientNba({ action: `Resolve exception — ₹${Math.round(topException.amount).toLocaleString("en-IN")} at risk`, path: "/ca/exceptions", tone: "#A93838" });
        } else if (nextCompliance && new Date(nextCompliance.due_date) < new Date()) {
          setClientNba({ action: `File overdue ${nextCompliance.event_type} — was due ${nextCompliance.due_date}`, path: `/ca/clients/${clientId}`, tone: "#A93838" });
        } else if (!hasTxns) {
          setClientNba({ action: "No bank transactions this period — upload a bank statement", path: "/ca/intake/inbox", tone: "#8B6914" });
        } else if (nextCompliance) {
          setClientNba({ action: `File ${nextCompliance.event_type} by ${nextCompliance.due_date}`, path: `/ca/clients/${clientId}`, tone: "#1F5A46" });
        } else {
          setClientNba(null);
        }
      } catch { setClientNba(null); }
    })();
    return () => { cancelled = true; };
  }, [businessId, firmId, periodStart, clientId]);



  useEffect(() => {
    if (!clientId || !firmId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("ca_clients")
        .select("id, business_id, client_name, client_email, client_phone, gstin, pan, client_status, onboarded_at, entity_type, entity_subtype, cin, llpin")
        .eq("id", clientId)
        .maybeSingle();
      if (error) toast.error(error.message);
      setClient((data as Client) ?? null);
      setLoading(false);
      const { count } = await supabase
        .from("ca_clients")
        .select("id", { count: "exact", head: true })
        .eq("ca_firm_id", firmId)
        .eq("parent_id", clientId);
      setSubCount(count ?? 0);
      // Restore the last period this client was worked on.
      const { data: lastPeriod } = await supabase
        .from("ca_client_periods")
        .select("period")
        .eq("ca_firm_id", firmId)
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastPeriod?.period && /^\d{4}-\d{2}$/.test(lastPeriod.period)) {
        setActivePeriod(lastPeriod.period);
      }
      console.log("[fyn:ca] client detail mount", { clientId, business_id: (data as Client)?.business_id ?? null });

    })();
  }, [clientId, firmId]);

  // Overview (external)
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const { data } = await proxyExternalQuery({
          table: "liquidity_metrics", business_id: businessId,
          order: { column: "recorded_at", ascending: false }, limit: 1,
        });
        setLiquidity(data?.[0] ?? null);
        console.log("[fyn:ca] overview.liquidity_metrics", businessId, data);
      } catch (e) { console.warn("[fyn:ca] liquidity_metrics", e); }
      try {
        const { data } = await proxyExternalQuery({
          table: "revenue_metrics", business_id: businessId,
          order: { column: "created_at", ascending: false }, limit: 1,
        });
        setRevenue(data?.[0] ?? null);
        console.log("[fyn:ca] overview.revenue_metrics", businessId, data);
      } catch (e) { console.warn("[fyn:ca] revenue_metrics", e); }
    })();
  }, [businessId]);

  const loadItc = useCallback(async () => {
    if (!businessId || !firmId) return;
    const { data, error } = await supabase
      .from("ca_itc_records").select("*")
      .eq("business_id", businessId).eq("ca_firm_id", firmId).eq("is_demo", false)
      .order("invoice_date", { ascending: false });
    if (error) console.warn("[fyn:ca] ca_itc_records", error);
    const [py, pm] = activePeriod.split("-");
    const itcPeriodStr = `${pm}${py}`;
    const rows = (data ?? []).filter((r: any) => !r.filing_period || r.filing_period === itcPeriodStr);
    setItc(rows);
    console.log("[fyn:ca] tab.itc", businessId, rows.length);
  }, [businessId, firmId, activePeriod]);


  const loadTds = useCallback(async () => {
    if (!businessId || !firmId) return;
    const { data, error } = await supabase
      .from("ca_tds_records").select("*")
      .eq("business_id", businessId).eq("ca_firm_id", firmId).eq("is_demo", false)
      .order("payment_date", { ascending: false });
    if (error) console.warn("[fyn:ca] ca_tds_records", error);
    setTds(data ?? []);
    console.log("[fyn:ca] tab.tds", businessId, data?.length ?? 0);
  }, [businessId, firmId]);

  const loadCompliance = useCallback(async () => {
    if (!businessId || !firmId) return;
    const { data, error } = await supabase
      .from("ca_compliance_events").select("*")
      .eq("business_id", businessId).eq("ca_firm_id", firmId).eq("is_demo", false)
      .order("due_date", { ascending: true });
    if (error) console.warn("[fyn:ca] ca_compliance_events", error);
    const filtered = (data ?? []).filter((e: any) => {
      if (!e.due_date) return true;
      return e.due_date >= periodStart && e.due_date <= periodEnd;
    });
    setCompliance(filtered);
    console.log("[fyn:ca] tab.compliance", businessId, filtered.length);
  }, [businessId, firmId, periodStart, periodEnd]);

  const loadTxns = useCallback(async (page: number) => {
    if (!businessId) return;
    try {
      const base = {
        table: "bank_transactions",
        business_id: businessId,
        order: { column: "date", ascending: false },
        limit: (page + 1) * 100,
      } as const;
      // Lineage columns are optional on older datasets — fall back when absent.
      let { data, error } = await proxyExternalQuery({
        ...base,
        select: "id, date, description, category, amount, balance, type, source_type, source_reference, source_document_id",
      });
      if (error) {
        ({ data, error } = await proxyExternalQuery({
          ...base,
          select: "id, date, description, category, amount, balance, type",
        }));
      }
      if (error) throw new Error(error);
      const inPeriod = (data ?? []).filter((t: any) => {
        if (!t.date) return true;
        const d = String(t.date).slice(0, 10);
        return d >= periodStart && d <= periodEnd;
      });
      const pageRows = inPeriod.slice(page * 100, page * 100 + 100);
      setTxns((prev) => (page === 0 ? pageRows : [...prev, ...pageRows]));
      console.log("[fyn:ca] tab.bank_transactions", businessId, pageRows.length);
    } catch (e) { console.warn("[fyn:ca] bank_transactions", e); }
  }, [businessId, periodStart, periodEnd]);


  const loadReports = useCallback(async () => {
    if (!businessId || !firmId) return;
    const { data, error } = await supabase
      .from("ca_reports_log").select("*")
      .eq("ca_firm_id", firmId).eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) console.warn("[fyn:ca] ca_reports_log", error);
    setReports(data ?? []);
    console.log("[fyn:ca] tab.reports", businessId, data?.length ?? 0);
  }, [businessId, firmId]);

  const loadGstrUploads = useCallback(async () => {
    if (!businessId || !firmId) return;
    const { data, error } = await supabase
      .from("ca_gstr2b_uploads").select("*")
      .eq("ca_firm_id", firmId).eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) console.warn("[fyn:ca] ca_gstr2b_uploads", error);
    setGstrUploads(data ?? []);
  }, [businessId, firmId]);

  useEffect(() => {
    if (!businessId) return;
    loadItc(); loadTds(); loadCompliance(); loadReports(); loadTxns(0); loadGstrUploads();
  }, [businessId, activePeriod, loadItc, loadTds, loadCompliance, loadReports, loadTxns, loadGstrUploads]);


  // ---- Actions ----
  const uploadGstr2b = async (file: File) => {
    if (!businessId || !firmId) return;
    const m = gstrPeriod.match(/^(\d{4})-(\d{2})$/);
    if (!m) return toast.error("Pick a filing period first");
    const filingPeriod = `${m[2]}${m[1]}`; // MMYYYY

    setUploadingGstr(true);
    const toastId = toast.loading("Processing GSTR-2B file…");

    const form = new FormData();
    form.append("file", file);
    form.append("ca_firm_id", firmId);
    form.append("business_id", businessId);
    form.append("filing_period", filingPeriod);

    const { data, error } = await supabase.functions.invoke("parse-gstr2b", { body: form });
    setUploadingGstr(false);

    if (error || !data?.success) {
      toast.error(data?.error ?? error?.message ?? "GSTR-2B processing failed", { id: toastId });
    } else {
      toast.success(
        `GSTR-2B processed. ${data.records_matched} records matched, ${data.records_mismatched} mismatched, ${data.records_new} new records added.`,
        { id: toastId },
      );
    }
    loadItc();
    loadGstrUploads();
  };



  const generateReport = async () => {
    if (!businessId || !firmId) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const period_start = start.toISOString().slice(0, 10);
    const period_end = now.toISOString().slice(0, 10);

    setGenerating(true);
    const loadingId = toast.loading("Generating PDF report...");
    const { data, error } = await supabase.functions.invoke("generate-mis-report", {
      body: {
        ca_firm_id: firmId,
        business_id: businessId,
        period_start,
        period_end,
        generated_by_user_id: userId,
      },
    });
    setGenerating(false);
    toast.dismiss(loadingId);

    if (error) return toast.error(`Report generation failed: ${error.message}`);
    if (!data?.success) return toast.error(data?.error ?? "Report generation failed");

    await loadReports();
    toast.success("MIS PDF report generated successfully.", {
      action: data.file_url
        ? { label: "Download PDF", onClick: () => window.open(data.file_url, "_blank", "noopener") }
        : undefined,
    });
  };

  const runMis = useServerFn(generateMisReport);

  const generateMis = async () => {
    if (!businessId || !firmId) return;
    const m = misPeriodInput.match(/^(\d{4})-(\d{2})$/);
    if (!m) return toast.error("Pick a period first");
    const label = new Date(Number(m[1]), Number(m[2]) - 1, 1)
      .toLocaleString("en-IN", { month: "short", year: "numeric" });

    setMisBusy(true);
    try {
      const report = await runMis({
        data: { firm_id: firmId, business_id: businessId, client_id: clientId ?? null, period: label, report_type: misTemplate },
      });
      console.log(`[fyn:mis] template=${misTemplate} generated for ${businessId}`);

      setMis(report);
      await loadReports();
      toast.success(`MIS for ${label} generated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "MIS generation failed");
    } finally {
      setMisBusy(false);
    }
  };

  /**
   * Consolidated group MIS. One MIS run per entity (parent plus every
   * subsidiary) over a single date range, executed in parallel, then summed.
   * The consolidated JSON is stored in ca_reports_log so it can be shared
   * through the existing share link flow.
   */
  const generateGroupMis = async () => {
    if (!businessId || !firmId || !clientId) return;
    const period_start = groupStart;
    const period_end = groupEnd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
      return toast.error("Choose a start date and an end date");
    }
    if (period_end < period_start) return toast.error("The end date cannot be before the start date");

    setGroupBusy(true);
    setGroupMisPhase("loading");
    try {
      const { data: kids } = await supabase
        .from("ca_clients")
        .select("id, client_name, business_id")
        .eq("ca_firm_id", firmId)
        .eq("parent_id", clientId);

      const clients = [
        { client_name: client?.client_name ?? "Parent entity", business_id: businessId },
        ...((kids ?? []) as { client_name: string; business_id: string | null }[])
          .filter((k) => k.business_id)
          .map((k) => ({ client_name: k.client_name, business_id: k.business_id as string })),
      ];

      const results = await Promise.all(
        clients.map((c) =>
          runMis({
            data: { firm_id: firmId, business_id: c.business_id, period: "", period_start, period_end },
          }).catch(() => null),
        ),
      );

      const consolidated = {
        period_start,
        period_end,
        entities: results.map((r, i) => ({
          client_name: clients[i].client_name,
          business_id: clients[i].business_id,
          revenue: r?.revenue ?? 0,
          expenses: r?.expenses ?? 0,
          net: (r?.revenue ?? 0) - (r?.expenses ?? 0),
        })),
        group_revenue: results.reduce((s, r) => s + (r?.revenue ?? 0), 0),
        group_expenses: results.reduce((s, r) => s + (r?.expenses ?? 0), 0),
        group_net: results.reduce((s, r) => s + ((r?.revenue ?? 0) - (r?.expenses ?? 0)), 0),
      };
      setGroupMis(consolidated);

      const { data: logRow, error: logErr } = await supabase
        .from("ca_reports_log")
        .insert({
          ca_firm_id: firmId,
          business_id: businessId,
          period: `${period_start} to ${period_end}`,
          period_start,
          period_end,
          report_type: "group_mis",
          report_name: `Group MIS — ${consolidated.entities.length} entities`,
          status: "ready",
          generated_by_user_id: userId ?? null,
          content: consolidated as any,
        })
        .select("id")
        .maybeSingle();
      if (logErr) console.warn("[fyn:ca] group_mis log", logErr);
      setGroupLogId(logRow?.id ?? null);

      await loadReports();
      setGroupMisPhase("done");
      toast.success(`Group MIS built for ${consolidated.entities.length} entities`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Group MIS failed");
      setGroupMisPhase("picking");
    } finally {
      setGroupBusy(false);
    }
  };

  const downloadGroupPdf = async () => {
    if (!groupMis) return;
    // Same window.open print flow as the other report PDF buttons, via the
    // shared report HTML renderer server function.
    if (groupLogId) {
      setReportBusyId(groupLogId);
      try {
        const res = await renderPdf({ data: { kind: "mis_report", id: groupLogId } });
        printHtmlDocument(res.html);
        return;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not prepare the PDF");
        return;
      } finally {
        setReportBusyId(null);
      }
    }
    toast.error("Generate the report first");
  };

  const resetGroupPeriod = () => {
    setGroupMis(null);
    setGroupLogId(null);
    setGroupStart(monthStartIso());
    setGroupEnd(todayIso());
    setGroupMisPhase("picking");
  };

  const seedCount = useMemo(() => txns.filter((t) => t.source_type === "seed").length, [txns]);
  const visibleTxns = useMemo(
    () => (hideDemo ? txns.filter((t) => t.source_type !== "seed") : txns),
    [txns, hideDemo],
  );


  const itcTotals = useMemo(() => {
    const sum = (f: (r: any) => number) => itc.reduce((s, r) => s + (Number(f(r)) || 0), 0);
    return {
      claimed: sum((r) => r.total_itc),
      matched: sum((r) => (r.match_status === "matched" ? r.total_itc : 0)),
      mismatched: sum((r) => (r.match_status === "mismatched" ? r.total_itc : 0)),
      pending: sum((r) => (r.match_status !== "matched" && r.match_status !== "mismatched" ? r.total_itc : 0)),
    };
  }, [itc]);

  const tdsTotals = useMemo(() => {
    const deducted = tds.reduce((s, r) => s + (Number(r.tds_amount) || 0), 0);
    const deposited = tds.reduce((s, r) => s + (Number(r.deposited_amount) || 0), 0);
    return { deducted, deposited, outstanding: deducted - deposited };
  }, [tds]);

  const groupedCompliance = useMemo(() => {
    const now = new Date();
    const isOverdue = (e: any) => e.status !== "filed" && e.due_date && new Date(e.due_date) < now;
    return [
      ...compliance.filter(isOverdue),
      ...compliance.filter((e) => e.status !== "filed" && !isOverdue(e)),
      ...compliance.filter((e) => e.status === "filed"),
    ];
  }, [compliance]);

  const closeChecklist = useMemo(() => {
    const monthLabel = new Date(Number(activePeriod.split("-")[0]), Number(activePeriod.split("-")[1]) - 1, 1)
      .toLocaleString("en-IN", { month: "short", year: "numeric" });
    const thisMonthEvents = compliance.filter((c: any) => {
      const d = c.due_date ? String(c.due_date).slice(0, 7) : null;
      return d === activePeriod;
    });
    return [
      {
        label: "Bank statement uploaded",
        done: txns.filter((t: any) => t.source_type !== "seed" && t.date && String(t.date).slice(0, 10) >= periodStart).length > 0,
      },
      {
        label: "ITC reconciled",
        done: itc.filter((r: any) => r.match_status === "matched").length > 0,
      },
      {
        label: "Compliance events filed",
        done: thisMonthEvents.length > 0 && thisMonthEvents.every((c: any) => c.status === "filed"),
      },
      {
        label: "MIS report generated",
        done: reports.filter((r: any) => (r.period ?? "").includes(monthLabel)).length > 0,
      },
    ];
  }, [txns, itc, compliance, reports, activePeriod, periodStart, periodEnd]);

  const handleClosePeriod = async () => {
    if (!firmId || !clientId || !businessId) return;
    if (!window.confirm(`Close ${periodLabel}? No new transactions can be posted to this period after closing.`)) return;
    setClosingPeriod(true);
    const { error } = await supabase.from("ca_client_periods").upsert({
      ca_firm_id: firmId,
      client_id: clientId,
      business_id: businessId,
      period: activePeriod,
      period_start: periodStart,
      period_end: periodEnd,
      status: "closed",
      close_step_1: closeChecklist[0].done,
      close_step_2: closeChecklist[1].done,
      close_step_3: closeChecklist[2].done,
      close_step_4: closeChecklist[3].done,
      updated_at: new Date().toISOString(),
    }, { onConflict: "ca_firm_id,client_id,period" });
    setClosingPeriod(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${periodLabel} closed. Switch to the next period to continue posting.`);
    void supabase.from("ca_brain_events").insert({
      ca_firm_id: firmId,
      business_id: businessId,
      event_type: "period_closed",
      payload: { period: activePeriod },
    });
  };




  if (loading) return <CAEmpty title="Loading client…" />;
  if (!client) return <CAEmpty title="Client not found" hint="This client may have been removed." />;

  return (
    <div>
      <button onClick={() => navigate("/ca/clients")} style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        ← All clients
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginTop: 10, gap: 16 }}>
        <div>
          <CAHeading>{client.client_name}</CAHeading>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <CABadge tone="teal">{client.entity_type ?? "—"}</CABadge>
            {client.entity_subtype && <CABadge tone="grey">{client.entity_subtype}</CABadge>}
            {client.cin && <CABadge tone="grey">CIN {client.cin}</CABadge>}
            {client.llpin && <CABadge tone="grey">LLPIN {client.llpin}</CABadge>}
          </div>
          <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>GSTIN <b style={{ fontFamily: CA.mono }}>{client.gstin ?? "—"}</b></span>
            <span>PAN <b style={{ fontFamily: CA.mono }}>{client.pan ?? "—"}</b></span>
            <span>{client.client_email ?? "—"}</span>
            <span>{client.client_phone ?? "—"}</span>
            <span>Onboarded {dateIN(client.onboarded_at)}</span>
          </div>
        </div>
        <CABadge tone={statusTone(client.client_status)}>{client.client_status ?? "—"}</CABadge>
      </div>

      <div style={{
        background: CA.card, border: "1px solid rgba(23,18,8,0.09)", borderRadius: 12,
        padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12, marginTop: 12, marginBottom: 0,
      }}>
        <div>
          <div style={{ fontFamily: CA.sans, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: CA.faint, fontWeight: 700 }}>Cash position</div>
          <div style={{ fontFamily: CA.mono, fontSize: 16, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{inr(liquidity?.cash_position)}</div>
        </div>
        <div>
          <div style={{ fontFamily: CA.sans, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: CA.faint, fontWeight: 700 }}>Runway</div>
          <div style={{ fontFamily: CA.mono, fontSize: 16, fontWeight: 600, marginTop: 4 }}>{liquidity?.runway_months != null ? `${liquidity.runway_months} months` : "—"}</div>
        </div>
        <div>
          <div style={{ fontFamily: CA.sans, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: CA.faint, fontWeight: 700 }}>Monthly burn</div>
          <div style={{ fontFamily: CA.mono, fontSize: 16, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{inr(liquidity?.burn_rate_current)}</div>
        </div>
        <div>
          <div style={{ fontFamily: CA.sans, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: CA.faint, fontWeight: 700 }}>Health</div>
          <div style={{ marginTop: 4 }}><CABadge tone={healthTone(liquidity?.health_status)}>{liquidity?.health_status ?? "no data"}</CABadge></div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginTop: 14, marginBottom: 0,
        padding: "10px 16px", background: CA.card,
        border: "1px solid rgba(23,18,8,0.09)", borderRadius: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: CA.faint }}>
          Period
        </span>
        <input
          type="month"
          value={activePeriod}
          onChange={(e) => { if (e.target.value) setActivePeriod(e.target.value); }}
          style={{ ...caInputStyle, width: 160, height: 34, fontSize: 13 }}
          aria-label="Select period"
        />
        <span style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 600, color: CA.ink }}>
          {periodLabel}
        </span>
        <span style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginLeft: "auto" }}>
          {periodStart} to {periodEnd}
        </span>
      </div>

      {clientNba && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginTop: 10,
          padding: "10px 16px", borderRadius: 10,
          background: `${clientNba.tone}14`,
          border: `1px solid ${clientNba.tone}30`,
        }}>
          <span style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: clientNba.tone, flexShrink: 0 }}>
            Next action
          </span>
          <span style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 600, color: CA.ink, flex: 1 }}>
            {clientNba.action}
          </span>
          <button
            onClick={() => navigate(clientNba.path)}
            style={{ background: clientNba.tone, color: "#F7F1E6", border: "none", borderRadius: 8, padding: "6px 14px", fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            Go
          </button>
        </div>
      )}



      <div className="ca-tabstrip" style={{ display: "flex", gap: 6, marginTop: 20, borderBottom: `0.5px solid ${CA.line}`, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: CA.sans, fontSize: 13, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? CA.teal : CA.muted, background: "none", border: "none",
              padding: "10px 14px", cursor: "pointer",
              borderBottom: tab === t ? `2px solid ${CA.teal}` : "2px solid transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {!businessId && tab !== "Reports" && (
          <CACard style={{ marginBottom: 16 }}>
            <CAEmpty title="Client has not linked their business yet" hint="Financial data appears once the client accepts the access invitation." />
          </CACard>
        )}

        {tab === "Documents" && (
          <>
            {businessId && firmId && <ClientDocumentsTab firmId={firmId} businessId={businessId} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 20 }}>
              <Metric label="MRR" value={inr(revenue?.mrr)} />
              <Metric label="ARR" value={inr(revenue?.arr)} />
              <Metric label="Customers" value={revenue?.customer_count != null ? String(revenue.customer_count) : "—"} />
              <Metric label="Churn rate" value={revenue?.churn_rate != null ? `${revenue.churn_rate}%` : "—"} />
            </div>
            {firmId && businessId && <ClientIntelligenceCard firmId={firmId} businessId={businessId} />}
            {firmId && clientId && (
              <ClientProfilePanel firmId={firmId} clientId={clientId} businessId={businessId} />
            )}
            {businessId && firmId && <ClientSyncPanel firmId={firmId} businessId={businessId} />}
            {businessId && firmId && (
              <ClientRemindersSection firmId={firmId} businessId={businessId} userId={userId} />
            )}
            {firmId && clientId && <ClientGroupCard firmId={firmId} clientId={clientId} />}
          </>
        )}

        {tab === "Close" && (
          <>
          <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink, marginBottom: 12 }}>
            Close readiness — {periodLabel}
          </div>
          <CACard style={{ padding: 20, maxWidth: 620 }}>
            <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink }}>Close readiness</div>

            <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 4 }}>
              {closeChecklist.filter((i) => i.done).length} of 4 steps complete
            </div>
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {closeChecklist.map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 999, display: "inline-flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0,
                      background: item.done ? "rgba(31,90,70,0.12)" : "rgba(23,18,8,0.06)",
                      color: item.done ? "#1F5A46" : CA.faint, fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {item.done ? "✓" : ""}
                  </span>
                  <span style={{ fontFamily: CA.sans, fontSize: 13.5, color: item.done ? CA.ink : CA.muted }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
              <input
                type="month"
                value={misPeriodInput}
                onChange={(e) => setMisPeriodInput(e.target.value)}
                style={{ ...caInputStyle, width: 170, height: 38 }}
                aria-label="MIS period"
              />
              <CAButton onClick={generateMis} disabled={!businessId || misBusy}>
                {misBusy ? "Building…" : "Generate MIS for this client"}
              </CAButton>
              <CAButton
                variant="ghost"
                onClick={handleClosePeriod}
                disabled={closingPeriod || closeChecklist.filter((i) => i.done).length < 4}
              >
                {closingPeriod ? "Closing…" : "Close this period"}
              </CAButton>
            </div>
            <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 6 }}>
              {closeChecklist.filter((i) => i.done).length < 4
                ? "Complete all 4 steps before closing the period."
                : "All steps complete. Safe to close."}
            </div>

          </CACard>
          </>
        )}


        {tab === "Deductions" && businessId && firmId && (
          <ClientDeductionsTab firmId={firmId} businessId={businessId} clientId={clientId ?? null} userId={userId} />
        )}



        {tab === "GST and ITC" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              <Metric label="Total ITC claimed" value={inr(itcTotals.claimed)} />
              <Metric label="Matched" value={inr(itcTotals.matched)} />
              <Metric label="Mismatched" value={inr(itcTotals.mismatched)} />
              <Metric label="Pending" value={inr(itcTotals.pending)} />
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <CAField label="Filing period">
                <input
                  type="month"
                  value={gstrPeriod}
                  onChange={(e) => setGstrPeriod(e.target.value)}
                  style={caInputStyle}
                />
              </CAField>
              <label>
                <input type="file" accept=".json,.csv" style={{ display: "none" }} disabled={uploadingGstr}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGstr2b(f); e.currentTarget.value = ""; }} />
                <span style={{
                  display: "inline-block", fontFamily: CA.sans, fontSize: 13, fontWeight: 600,
                  background: uploadingGstr ? CA.faint : CA.teal, color: "#fff", padding: "9px 16px",
                  borderRadius: 9, cursor: uploadingGstr ? "not-allowed" : "pointer",
                }}>
                  {uploadingGstr ? "Processing…" : "Upload GSTR-2B"}
                </span>
              </label>
              <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, paddingBottom: 10 }}>
                GST portal JSON or a simple CSV
              </div>
            </div>

            <CACard style={{ marginTop: 16, overflow: "hidden" }}>
              {itc.length === 0 ? <CAEmpty title="No ITC records" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={caTh}>Period</th><th style={caTh}>Supplier</th><th style={caTh}>Invoice</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Total ITC</th><th style={caTh}>Match</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Mismatch</th>
                  </tr></thead>
                  <tbody>
                    {itc.map((r) => (
                      <tr key={r.id}>
                        <td style={caTd}>{r.filing_period ?? "—"}</td>
                        <td style={caTd}>{r.supplier_name ?? "—"}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono }}>{r.invoice_number ?? "—"}</td>
                        <td style={caNum}>{inr(r.total_itc)}</td>
                        <td style={caTd}><CABadge tone={statusTone(r.match_status)}>{r.match_status ?? "pending"}</CABadge></td>
                        <td style={caNum}>{inr(r.mismatch_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CACard>

            <CAHeading style={{ marginTop: 26, fontSize: 16 }}>GSTR-2B upload history</CAHeading>
            <CACard style={{ marginTop: 10, overflow: "hidden" }}>
              {gstrUploads.length === 0 ? <CAEmpty title="No GSTR-2B uploads yet" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={caTh}>File</th><th style={caTh}>Period</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Parsed</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Matched</th>
                    <th style={caTh}>Status</th><th style={caTh}>Uploaded</th>
                  </tr></thead>
                  <tbody>
                    {gstrUploads.map((u) => (
                      <tr key={u.id}>
                        <td style={caTd}>{u.file_name}</td>
                        <td style={caTd}>{u.filing_period}</td>
                        <td style={caNum}>{u.records_parsed ?? u.record_count ?? 0}</td>
                        <td style={caNum}>{u.records_matched ?? 0}</td>
                        <td style={caTd}><CABadge tone={statusTone(u.processing_status)}>{u.processing_status}</CABadge></td>
                        <td style={caTd}>{dateIN(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CACard>
          </>

        )}

        {tab === "Compliance" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <Metric label="TDS deducted" value={inr(tdsTotals.deducted)} />
              <Metric label="Deposited" value={inr(tdsTotals.deposited)} />
              <Metric label="Outstanding" value={inr(tdsTotals.outstanding)} />
            </div>
            <div style={{ marginTop: 16 }}>
              <CAButton onClick={() => setShowTdsForm((s) => !s)}>{showTdsForm ? "Close form" : "New TDS record"}</CAButton>
            </div>
            {showTdsForm && businessId && firmId && (
              <TdsForm
                businessId={businessId}
                firmId={firmId}
                onSaved={() => { setShowTdsForm(false); loadTds(); }}
              />
            )}
            <CACard style={{ marginTop: 16, overflow: "hidden" }}>
              {tds.length === 0 ? <CAEmpty title="No TDS records" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={caTh}>Qtr</th><th style={caTh}>FY</th><th style={caTh}>Section</th><th style={caTh}>Deductee</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Payment</th><th style={{ ...caTh, textAlign: "right" }}>TDS</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Deposited</th><th style={caTh}>Status</th><th style={caTh}>Return</th>
                  </tr></thead>
                  <tbody>
                    {tds.map((r) => (
                      <tr key={r.id}>
                        <td style={caTd}>{r.quarter ?? "—"}</td>
                        <td style={caTd}>{r.financial_year ?? "—"}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono }}>{r.section_code ?? "—"}</td>
                        <td style={caTd}>{r.deductee_name ?? "—"}</td>
                        <td style={caNum}>{inr(r.payment_amount)}</td>
                        <td style={caNum}>{inr(r.tds_amount)}</td>
                        <td style={caNum}>{inr(r.deposited_amount)}</td>
                        <td style={caTd}><CABadge tone={statusTone(r.status)}>{r.status ?? "—"}</CABadge></td>
                        <td style={caTd}><CABadge tone={r.return_filed ? "green" : "amber"}>{r.return_filed ? "filed" : "not filed"}</CABadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CACard>
          </>
        )}

        {tab === "Compliance" && (
          <>
            <CAButton onClick={() => setShowComplianceForm((s) => !s)}>
              {showComplianceForm ? "Close form" : "New compliance event"}
            </CAButton>
            {showComplianceForm && businessId && firmId && (
              <ComplianceForm
                businessId={businessId}
                firmId={firmId}
                onSaved={() => { setShowComplianceForm(false); loadCompliance(); }}
              />
            )}
            <CACard style={{ marginTop: 16, overflow: "hidden" }}>
              {groupedCompliance.length === 0 ? <CAEmpty title="No compliance events" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={caTh}>Event</th><th style={caTh}>Period</th><th style={caTh}>Due</th>
                    <th style={caTh}>Status</th><th style={{ ...caTh, textAlign: "right" }}>Penalty</th>
                  </tr></thead>
                  <tbody>
                    {groupedCompliance.map((e) => {
                      const overdue = e.status !== "filed" && e.due_date && new Date(e.due_date) < new Date();
                      return (
                        <tr key={e.id}>
                          <td style={caTd}>{e.event_type ?? "—"}</td>
                          <td style={caTd}>{e.filing_period ?? "—"}</td>
                          <td style={caTd}>{dateIN(e.due_date)}</td>
                          <td style={caTd}>
                            <CABadge tone={e.status === "filed" ? "green" : overdue ? "red" : "amber"}>
                              {e.status === "filed" ? "filed" : overdue ? "overdue" : e.status ?? "pending"}
                            </CABadge>
                          </td>
                          <td style={caNum}>{inr(e.penalty_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CACard>
          </>
        )}

        {tab === "Reconcile" && (
          <>
          <div style={{
            background: "rgba(139,105,20,0.07)", border: "1px solid rgba(139,105,20,0.20)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: CA.sans, fontSize: 12, fontWeight: 700, color: "#8B6914", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Period scope
            </span>
            <span style={{ fontFamily: CA.mono, fontSize: 13, color: CA.ink }}>
              {periodStart} to {periodEnd}
            </span>
            <span style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted }}>
              Only transactions and documents within this period are matched. Change period using the selector above.
            </span>
          </div>
          <ThreeWayMatchTab firmId={firmId} businessId={businessId} periodStart={periodStart} periodEnd={periodEnd} />
          <div style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: CA.faint, marginTop: 20, marginBottom: 10 }}>
            Bank transactions
          </div>
          {seedCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: CA.sans, fontSize: 13, color: CA.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={hideDemo} onChange={(e) => setHideDemo(e.target.checked)} />
                Hide demo data
              </label>
              <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                {seedCount} of {txns.length} rows loaded are sample data, not client records.
              </span>
            </div>
          )}
          <CACard style={{ overflow: "hidden" }}>
            {visibleTxns.length === 0 ? (
              <CAEmpty
                title={hideDemo && txns.length > 0 ? "No real bank transactions" : "No bank transactions"}
                hint={hideDemo && txns.length > 0 ? "Only sample rows are loaded for this client." : undefined}
              />
            ) : (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={caTh}>Date</th><th style={caTh}>Description</th><th style={caTh}>Category</th>
                    <th style={{ ...caTh, textAlign: "right" }}>Amount</th><th style={{ ...caTh, textAlign: "right" }}>Balance</th>
                    <th style={caTh}>Source</th>
                  </tr></thead>
                  <tbody>
                    {visibleTxns.map((t) => {
                      const signed = t.type === "debit" ? -Math.abs(Number(t.amount)) : Number(t.amount);
                      return (
                        <tr key={t.id}>
                          <td style={caTd}>{dateIN(t.date)}</td>
                          <td style={caTd}>
                            {t.description ?? "—"}
                            {t.source_type === "seed" && (
                              <span style={{ marginLeft: 8 }}><CABadge tone="amber">Demo data</CABadge></span>
                            )}
                          </td>
                          <td style={caTd}>{t.category ?? "—"}</td>
                          <td style={{ ...caNum, color: signed < 0 ? CA.red : CA.green }}>{inr(signed)}</td>
                          <td style={caNum}>{inr(t.balance)}</td>
                          <td style={caTd}>
                            <button
                              onClick={() => setLineageTxn(t as LineageTxn)}
                              title="Show where this number came from"
                              style={{
                                background: "none", border: "none", padding: 0, cursor: "pointer",
                                fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, color: CA.teal,
                              }}
                            >
                              {sourceLabel(t)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: 14 }}>
                  <CAButton variant="ghost" onClick={() => { const p = txnPage + 1; setTxnPage(p); loadTxns(p); }}>
                    Show more
                  </CAButton>
                </div>
              </>
            )}
          </CACard>
          <ReconHistorySection firmId={firmId} businessId={businessId} />
          {lineageTxn && firmId && businessId && (
            <TxnLineageDrawer
              firmId={firmId}
              businessId={businessId}
              txn={lineageTxn}
              onClose={() => setLineageTxn(null)}
            />
          )}
          </>
        )}

        {tab === "Reports" && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <CAButton onClick={generateReport} disabled={!businessId || generating}>
                {generating ? "Generating…" : "Generate MIS PDF"}
              </CAButton>
              <input
                type="month"
                value={misPeriodInput}
                onChange={(e) => setMisPeriodInput(e.target.value)}
                style={{ ...caInputStyle, width: 170, height: 38 }}
                aria-label="MIS period"
              />
              <select
                style={{ ...caInputStyle, width: 200, height: 38 }}
                value={misTemplate}
                onChange={(e) => setMisTemplate(e.target.value as typeof misTemplate)}
                aria-label="MIS template"
              >
                {MIS_TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <CAButton variant="ghost" onClick={generateMis} disabled={!businessId || misBusy}>
                {misBusy ? "Building…" : "Generate MIS"}
              </CAButton>

            </div>

            {subCount > 0 && (
              <div style={{ position: "relative", marginTop: 16 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <CAButton
                    variant="ghost"
                    onClick={() => { setGroupMis(null); setGroupLogId(null); setGroupMisPhase("picking"); }}
                    disabled={!businessId || groupBusy}
                  >
                    {groupMisPhase === "loading" ? "Generating group MIS…" : "Group MIS"}
                  </CAButton>
                  {groupMisPhase === "loading" && (
                    <span style={{ fontFamily: CA.sans, fontSize: 12.5, fontStyle: "italic", color: CA.muted }}>
                      Generating group MIS…
                    </span>
                  )}
                </div>

                {groupMisPhase === "picking" && (
                  <CACard style={{ marginTop: 14, padding: "18px 20px", maxWidth: 420 }}>
                    <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink }}>
                      Group MIS period
                    </div>
                    <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 4 }}>
                      Covers this entity and its {subCount} {subCount === 1 ? "subsidiary" : "subsidiaries"}.
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <CAField label="Period start">
                        <input
                          type="date"
                          value={groupStart}
                          onChange={(e) => setGroupStart(e.target.value)}
                          style={{ ...caInputStyle, width: 150, height: 38 }}
                        />
                      </CAField>
                      <CAField label="Period end">
                        <input
                          type="date"
                          value={groupEnd}
                          onChange={(e) => setGroupEnd(e.target.value)}
                          style={{ ...caInputStyle, width: 150, height: 38 }}
                        />
                      </CAField>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                      <CAButton onClick={generateGroupMis} disabled={groupBusy}>
                        Generate
                      </CAButton>
                      <CAButton variant="ghost" onClick={() => setGroupMisPhase("idle")}>
                        Cancel
                      </CAButton>
                    </div>
                  </CACard>
                )}

                {groupMisPhase === "done" && groupMis && (
                  <CACard style={{ marginTop: 14, padding: "18px 20px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: CA.serif, fontSize: 18, fontWeight: 700, color: CA.ink }}>
                        Group MIS
                      </div>
                      <div style={{ fontFamily: CA.mono, fontSize: 13, color: CA.muted }}>
                        {groupMis.period_start} to {groupMis.period_end}
                      </div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
                      <thead><tr>
                        <th style={caTh}>Entity</th>
                        <th style={{ ...caTh, textAlign: "right" }}>Revenue</th>
                        <th style={{ ...caTh, textAlign: "right" }}>Expenses</th>
                        <th style={{ ...caTh, textAlign: "right" }}>Net</th>
                      </tr></thead>
                      <tbody>
                        {groupMis.entities.map((e) => (
                          <tr key={e.business_id}>
                            <td style={caTd}>{e.client_name}</td>
                            <td style={caNum}>{formatINR(e.revenue)}</td>
                            <td style={caNum}>{formatINR(e.expenses)}</td>
                            <td style={{ ...caNum, color: e.net < 0 ? CA.red : CA.green }}>{formatINR(e.net)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...caTd, fontWeight: 700, borderTop: `1px solid ${CA.line}` }}>Group Total</td>
                          <td style={{ ...caNum, fontWeight: 700, borderTop: `1px solid ${CA.line}` }}>{formatINR(groupMis.group_revenue)}</td>
                          <td style={{ ...caNum, fontWeight: 700, borderTop: `1px solid ${CA.line}` }}>{formatINR(groupMis.group_expenses)}</td>
                          <td style={{ ...caNum, fontWeight: 700, borderTop: `1px solid ${CA.line}`, color: groupMis.group_net < 0 ? CA.red : CA.green }}>{formatINR(groupMis.group_net)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <CAButton variant="ghost" onClick={downloadGroupPdf} disabled={reportBusyId === groupLogId}>
                        {reportBusyId === groupLogId ? "Preparing…" : "Download PDF"}
                      </CAButton>
                      <CAButton variant="ghost" onClick={resetGroupPeriod}>
                        New period
                      </CAButton>
                    </div>
                  </CACard>
                )}
              </div>
            )}

            <CACard style={{ marginTop: 16, overflow: "hidden" }}>
              {reports.length === 0 ? <CAEmpty title="No reports yet" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={caTh}>Type</th><th style={caTh}>Period</th><th style={caTh}>Status</th>
                    <th style={caTh}>Created</th><th style={caTh} />
                  </tr></thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td style={caTd}>{r.report_type ?? "—"}</td>
                        <td style={caTd}>{r.period ?? "—"}</td>
                        <td style={caTd}><CABadge tone={statusTone(r.status)}>{r.status ?? "—"}</CABadge></td>
                        <td style={caTd}>{dateIN(r.created_at)}</td>
                        <td style={{ ...caTd, textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {r.file_url && (
                              <a href={r.file_url} target="_blank" rel="noreferrer" style={{ color: CA.teal, fontWeight: 600, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <FileText size={14} strokeWidth={2} aria-hidden="true" />
                                Stored PDF
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => void downloadReportPdf(r.id)}
                              disabled={reportBusyId === r.id}
                              style={{ background: "none", border: "none", padding: 0, color: CA.teal, fontFamily: CA.sans, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                            >
                              {reportBusyId === r.id ? "Working" : "Download PDF"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void shareReportLink(r.id)}
                              disabled={reportBusyId === r.id}
                              style={{ background: "none", border: "none", padding: 0, color: CA.ink, fontFamily: CA.sans, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                            >
                              Share with client
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CACard>

            {sharePanel && (
              <CACard style={{ marginTop: 14, padding: 18 }}>
                <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
                  Client share link
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    readOnly
                    value={sharePanel.url}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ ...caInputStyle, flex: "1 1 320px", fontFamily: CA.mono, fontSize: 12.5 }}
                    aria-label="Share link"
                  />
                  <CAButton
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(sharePanel.url).then(
                        () => toast.success("Link copied"),
                        () => toast.error("Copy the link from the box"),
                      );
                    }}
                  >
                    Copy
                  </CAButton>
                  <CAButton
                    variant="ghost"
                    onClick={() => void revokeShareLink(sharePanel.reportId)}
                    disabled={reportBusyId === sharePanel.reportId}
                  >
                    Revoke
                  </CAButton>
                </div>
                <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 10 }}>
                  Expires on {dateIN(sharePanel.expires_at)}. Anyone with this link can view the report until then.
                </div>
              </CACard>
            )}
          </>
        )}
      </div>

      {mis && <MisModal report={mis} onClose={() => setMis(null)} />}
    </div>
  );
}

function MisModal({ report, onClose }: { report: MisReport; onClose: () => void }) {
  const [drilldownIds, setDrilldownIds] = useState<string[] | null>(null);
  const [drilldownLabel, setDrilldownLabel] = useState("");
  const [drilldownTxns, setDrilldownTxns] = useState<any[]>([]);
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [preparerNotes, setPreparerNotes] = useState("");
  const reportType = report.report_type ?? "monthly_mis";
  const templateLabel = MIS_TEMPLATES.find((t) => t.value === reportType)?.label ?? "MIS";


  const drilldown = async (ids: string[] | undefined, label: string) => {
    if (!ids || ids.length === 0) return;
    setDrilldownLabel(label);
    setDrilldownIds(ids);
    setLoadingDrill(true);
    const { data } = await supabase
      .from("bank_transactions")
      .select("id, date, description, amount, type, source_reference")
      .in("id", ids.slice(0, 50));
    setDrilldownTxns(data ?? []);
    setLoadingDrill(false);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mis-${report.client_name.replace(/\s+/g, "-").toLowerCase()}-${report.period.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const rows = [
      ["FynHelp MIS Report", "", "", ""],
      ["Client", report.client_name, "Period", report.period],
      ["Generated", new Date(report.generated_at).toLocaleString("en-IN"), "", ""],
      ["", "", "", ""],
      ["Revenue and Expenses", "", "", ""],
      ["Revenue", report.revenue, "", ""],
      ["Expenses", report.expenses, "", ""],
      ["Gross Profit", report.gross_profit, "", ""],
      ["", "", "", ""],
      ["GST Summary", "", "", ""],
      ["GST Collected", report.gst_collected, "", ""],
      ["GST Paid", report.gst_paid, "", ""],
      ["", "", "", ""],
      ["ITC Status", "", "", ""],
      ["ITC Available", report.itc_available, "", ""],
      ["ITC Claimed", report.itc_claimed, "", ""],
      ["ITC Balance", report.itc_balance, "", ""],
      ["", "", "", ""],
      ["Compliance", "", "", ""],
      ["Filed", report.compliance_summary.filed, "", ""],
      ["Pending", report.compliance_summary.pending, "", ""],
      ["Overdue", report.compliance_summary.overdue, "", ""],
      ["", "", "", ""],
      ["Exceptions", "", "", ""],
      ["Open count", report.exceptions_summary.open_count, "", ""],
      ["Amount at risk", report.exceptions_summary.amount_at_risk, "", ""],
      ["", "", "", ""],
      ["Data Quality", "", "", ""],
      ["Documents posted", report.data_quality.doc_count, "", ""],
      ["Avg confidence", `${report.data_quality.confidence_avg}%`, "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MIS");
    XLSX.writeFile(wb, `MIS-${report.client_name.replace(/\s+/g, "-")}-${report.period.replace(/\s+/g, "-")}.xlsx`);
  };

  const Row = ({ label, value, ids, rowLabel }: { label: string; value: string; ids?: string[]; rowLabel?: string }) => (
    <div
      onClick={ids?.length ? () => void drilldown(ids, rowLabel ?? label) : undefined}
      style={{
        display: "flex", justifyContent: "space-between", padding: "7px 0",
        borderBottom: `0.5px solid ${CA.line}`,
        cursor: ids?.length ? "pointer" : "default",
        borderRadius: ids?.length ? 4 : 0,
      }}
    >
      <span style={{ fontSize: 12.5, color: CA.muted }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: CA.mono, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {ids?.length ? <span style={{ fontSize: 11, color: CA.teal, fontWeight: 600 }}>View</span> : null}
      </div>
    </div>
  );


  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: CA.faint, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,20,18,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#FFFFFF", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "88vh", overflow: "auto", padding: 24, border: `0.5px solid ${CA.line}` }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700 }}>{templateLabel} — {report.period}</div>
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 4 }}>{report.client_name}</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: CA.muted }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <Section title="Revenue & expenses">
          <Row label="Revenue" value={inr(report.revenue)} ids={report.source_txn_ids?.revenue} rowLabel="Revenue transactions" />
          <Row label="Expenses" value={inr(report.expenses)} ids={report.source_txn_ids?.expenses} rowLabel="Expense transactions" />

          <Row label="Gross profit" value={inr(report.gross_profit)} />
        </Section>

        {reportType === "variance_report" && (
          <Section title="Variance indicators">
            <Row label="Expense to revenue ratio" value={report.revenue ? `${Math.round((report.expenses / report.revenue) * 100)}%` : "No revenue recorded"} />
            <Row label="Margin" value={report.revenue ? `${Math.round((report.gross_profit / report.revenue) * 100)}%` : "No revenue recorded"} />
            <Row label="Unreconciled amount at risk" value={inr(report.exceptions_summary.amount_at_risk)} />
          </Section>
        )}

        {reportType !== "bank_rec_summary" && reportType !== "variance_report" && (
          <>
            <Section title="GST summary">
              <Row label="GST collected" value={inr(report.gst_collected)} />
              <Row label="GST paid" value={inr(report.gst_paid)} />
            </Section>

            <Section title="ITC status">
              <Row label="ITC available" value={inr(report.itc_available)} />
              <Row label="ITC claimed" value={inr(report.itc_claimed)} />
              <Row label="ITC balance" value={inr(report.itc_balance)} />
            </Section>

            <Section title="Compliance status">
              <Row label="Filed" value={String(report.compliance_summary.filed)} />
              <Row label="Pending" value={String(report.compliance_summary.pending)} />
              <Row label="Overdue" value={String(report.compliance_summary.overdue)} />
            </Section>
          </>
        )}

        <Section title={reportType === "bank_rec_summary" ? "Unmatched items" : "Exceptions"}>
          <Row label="Open exceptions" value={String(report.exceptions_summary.open_count)} ids={report.source_txn_ids?.exceptions} rowLabel="Open exceptions" />
          <Row label="Amount at risk" value={inr(report.exceptions_summary.amount_at_risk)} />
        </Section>

        <Section title="Data quality">
          <Row label="Posted documents" value={String(report.data_quality.doc_count)} />
          <Row label="Average confidence" value={`${report.data_quality.confidence_avg}%`} />
        </Section>

        {reportType === "working_paper" && (
          <Section title="Preparer notes">
            <textarea
              value={preparerNotes}
              onChange={(e) => setPreparerNotes(e.target.value)}
              placeholder="Notes for the reviewer — assumptions, open items, sampling basis."
              style={{ ...caInputStyle, width: "100%", minHeight: 90, padding: 10, fontFamily: CA.sans, fontSize: 13, resize: "vertical" }}
            />
          </Section>
        )}


        {drilldownIds && (
          <div style={{ marginTop: 16, background: CA.card, borderRadius: 10, border: "1px solid rgba(23,18,8,0.09)", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: CA.faint }}>{drilldownLabel}</div>
              <button aria-label="Close details" onClick={() => { setDrilldownIds(null); setDrilldownTxns([]); }} style={{ background: "none", border: "none", cursor: "pointer", color: CA.muted, fontSize: 18 }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {loadingDrill ? (
              <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.faint }}>Loading…</div>
            ) : drilldownTxns.length === 0 ? (
              <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.faint }}>No transactions found.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={caTh}>Date</th><th style={caTh}>Description</th>
                  <th style={{ ...caTh, textAlign: "right" }}>Amount</th><th style={caTh}>Source</th>
                </tr></thead>
                <tbody>
                  {drilldownTxns.map((t: any) => (
                    <tr key={t.id}>
                      <td style={caTd}>{dateIN(t.date)}</td>
                      <td style={caTd}>{t.description ?? "—"}</td>
                      <td style={{ ...caNum, color: t.type === "debit" ? CA.red : CA.green }}>{inr(Math.abs(Number(t.amount)))}</td>
                      <td style={caTd}><span style={{ fontFamily: CA.mono, fontSize: 11, color: CA.faint }}>{t.source_reference ?? "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {drilldownIds.length > 50 && (
              <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 8 }}>
                Showing first 50 of {drilldownIds.length} transactions.
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <CAButton variant="ghost" onClick={onClose}>Close</CAButton>
          <CAButton onClick={download}>Download JSON</CAButton>
          <CAButton onClick={downloadExcel}>Download Excel</CAButton>
        </div>

      </div>
    </div>
  );
}

function TdsForm({ businessId, firmId, onSaved }: { businessId: string; firmId: string; onSaved: () => void }) {
  const [f, setF] = useState({
    financial_year: "", quarter: "Q1", section_code: "", deductee_name: "", deductee_pan: "",
    payment_date: "", payment_amount: "", tds_rate: "", tds_amount: "", deposited_amount: "",
    challan_number: "", status: "pending", return_filed: false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("ca_tds_records").insert({
      business_id: businessId,
      ca_firm_id: firmId,
      financial_year: f.financial_year || "",
      quarter: f.quarter,
      section_code: f.section_code || "",
      deductee_name: f.deductee_name || "",
      deductee_pan: f.deductee_pan ? f.deductee_pan.toUpperCase() : undefined,
      payment_date: f.payment_date || undefined,
      payment_amount: f.payment_amount ? Number(f.payment_amount) : undefined,
      tds_rate: f.tds_rate ? Number(f.tds_rate) : undefined,
      tds_amount: f.tds_amount ? Number(f.tds_amount) : undefined,
      deposited_amount: f.deposited_amount ? Number(f.deposited_amount) : 0,
      challan_number: f.challan_number || undefined,
      status: f.status,
      return_filed: f.return_filed,
      is_demo: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("TDS record saved");
    onSaved();
  };

  return (
    <CACard style={{ padding: 20, marginTop: 16 }}>
      <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <CAField label="Financial year"><input style={caInputStyle} value={f.financial_year} onChange={set("financial_year")} placeholder="2025-26" /></CAField>
        <CAField label="Quarter">
          <select style={caInputStyle as any} value={f.quarter} onChange={set("quarter")}>
            {["Q1", "Q2", "Q3", "Q4"].map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </CAField>
        <CAField label="Section code"><input style={caInputStyle} value={f.section_code} onChange={set("section_code")} placeholder="194C" /></CAField>
        <CAField label="Deductee name"><input style={caInputStyle} value={f.deductee_name} onChange={set("deductee_name")} /></CAField>
        <CAField label="Deductee PAN"><input style={caInputStyle} value={f.deductee_pan} onChange={set("deductee_pan")} placeholder="ABCDE1234F" /></CAField>
        <CAField label="Payment date"><input style={caInputStyle} type="date" value={f.payment_date} onChange={set("payment_date")} /></CAField>
        <CAField label="Payment amount"><input style={caInputStyle} type="number" value={f.payment_amount} onChange={set("payment_amount")} /></CAField>
        <CAField label="TDS rate (%)"><input style={caInputStyle} type="number" step="0.01" value={f.tds_rate} onChange={set("tds_rate")} /></CAField>
        <CAField label="TDS amount"><input style={caInputStyle} type="number" value={f.tds_amount} onChange={set("tds_amount")} /></CAField>
        <CAField label="Deposited amount"><input style={caInputStyle} type="number" value={f.deposited_amount} onChange={set("deposited_amount")} /></CAField>
        <CAField label="Challan number"><input style={caInputStyle} value={f.challan_number} onChange={set("challan_number")} /></CAField>
        <CAField label="Status">
          <select style={caInputStyle as any} value={f.status} onChange={set("status")}>
            <option value="pending">Pending</option>
            <option value="deposited">Deposited</option>
            <option value="overdue">Overdue</option>
          </select>
        </CAField>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: CA.sans, fontSize: 13 }}>
          <input type="checkbox" checked={f.return_filed} onChange={set("return_filed")} /> Return filed
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <CAButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save TDS record"}</CAButton>
        </div>
      </form>
    </CACard>
  );
}

function ComplianceForm({ businessId, firmId, onSaved }: { businessId: string; firmId: string; onSaved: () => void }) {
  const [f, setF] = useState({
    event_type: "GSTR-3B", filing_period: "", due_date: "", filing_date: "",
    status: "pending", penalty_amount: "", late_fee_amount: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("ca_compliance_events").insert({
      business_id: businessId,
      ca_firm_id: firmId,
      event_type: f.event_type,
      filing_period: f.filing_period || "",
      due_date: f.due_date || "",
      filing_date: f.filing_date || undefined,
      status: f.status,
      penalty_amount: f.penalty_amount ? Number(f.penalty_amount) : 0,
      late_fee_amount: f.late_fee_amount ? Number(f.late_fee_amount) : 0,
      notes: f.notes || null,
      is_demo: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Compliance event saved");
    onSaved();
  };

  return (
    <CACard style={{ padding: 20, marginTop: 16 }}>
      <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <CAField label="Event type">
          <select style={caInputStyle as any} value={f.event_type} onChange={set("event_type")}>
            {["GSTR-1", "GSTR-3B", "GSTR-9", "TDS Return", "ITR", "ROC Filing", "Advance Tax"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </CAField>
        <CAField label="Filing period"><input style={caInputStyle} value={f.filing_period} onChange={set("filing_period")} placeholder="Jul 2026" /></CAField>
        <CAField label="Due date"><input style={caInputStyle} type="date" value={f.due_date} onChange={set("due_date")} /></CAField>
        <CAField label="Filing date"><input style={caInputStyle} type="date" value={f.filing_date} onChange={set("filing_date")} /></CAField>
        <CAField label="Status">
          <select style={caInputStyle as any} value={f.status} onChange={set("status")}>
            <option value="pending">Pending</option>
            <option value="filed">Filed</option>
          </select>
        </CAField>
        <CAField label="Penalty amount"><input style={caInputStyle} type="number" value={f.penalty_amount} onChange={set("penalty_amount")} /></CAField>
        <CAField label="Late fee"><input style={caInputStyle} type="number" value={f.late_fee_amount} onChange={set("late_fee_amount")} /></CAField>
        <CAField label="Notes"><input style={caInputStyle} value={f.notes} onChange={set("notes")} /></CAField>
        <div style={{ gridColumn: "1 / -1" }}>
          <CAButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save event"}</CAButton>
        </div>
      </form>
    </CACard>
  );
}
