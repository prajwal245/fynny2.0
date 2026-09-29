import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { renderReportHtml } from "@/lib/caDocs.functions";
import { printHtmlDocument } from "@/lib/printPdf";

import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, CAEmpty, caInputStyle } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, StateChip, StatStrip } from "@/components/ca/os/primitives";
import { periodLabel, recentPeriods } from "@/lib/caClose";
import { buildPaperContent, PAPER_TYPES, type PaperContent, type PaperType } from "@/lib/caWorkingPapers";
import { logCAAudit } from "@/lib/caAudit";

interface PaperRow {
  id: string;
  business_id: string;
  title: string;
  paper_type: string;
  status: string;
  content: PaperContent | null;
  prepared_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function CAWorkingPapersPage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CAWorkingPapersPage mounted"); }, []);
  const { firmId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();

  const periods = useMemo(() => recentPeriods(12), []);
  const [businessId, setBusinessId] = useState("");
  const [period, setPeriod] = useState(periods[0]);
  const [paperType, setPaperType] = useState<PaperType>("bank_recon");
  const [rows, setRows] = useState<PaperRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const renderPdf = useServerFn(renderReportHtml);

  const downloadPdf = async (id: string) => {
    setPdfId(id);
    try {
      const res = await renderPdf({ data: { kind: "working_paper", id } });
      printHtmlDocument(res.html);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare the PDF");
    } finally {
      setPdfId(null);
    }
  };


  useEffect(() => {
    if (!businessId && clients.length) setBusinessId(clients[0].business_id);
  }, [clients, businessId]);

  const load = useCallback(async () => {
    if (!firmId) return;
    let q = supabase
      .from("ca_working_papers")
      .select("id, business_id, title, paper_type, status, content, prepared_by, reviewed_at, created_at")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (businessId) q = q.eq("business_id", businessId);
    const { data } = await q;
    setRows((data ?? []) as unknown as PaperRow[]);
  }, [firmId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    if (!firmId || !businessId) return toast.error("Pick a client first");
    setBusy(true);
    try {
      const content = await buildPaperContent(businessId, period, paperType);
      const meta = PAPER_TYPES.find((p) => p.value === paperType)!;
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ca_working_papers")
        .insert({
          ca_firm_id: firmId,
          business_id: businessId,
          title: `${meta.label} — ${periodLabel(period)}`,
          paper_type: paperType,
          status: "draft",
          content: content as never,
          prepared_by: userRes?.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      await logCAAudit({
        firmId,
        businessId,
        entityType: "working_paper",
        entityId: data.id,
        action: "working_paper_prepared",
        actorRole: role,
        detail: { paper_type: paperType, period },
      });
      toast.success("Working paper prepared");
      setOpenId(data.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare the paper");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (p: PaperRow, status: string) => {
    const { data: userRes } = await supabase.auth.getUser();
    const patch = {
      status,
      reviewed_at: status === "approved" ? new Date().toISOString() : null,
      reviewed_by: status === "approved" ? userRes?.user?.id ?? null : null,
    };
    const { error } = await supabase.from("ca_working_papers").update(patch).eq("id", p.id);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId: firmId!,
      businessId: p.business_id,
      entityType: "working_paper",
      entityId: p.id,
      action: `working_paper_${status}`,
      actorRole: role,
    });
    void load();
  };

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Working papers" subtitle="Evidence behind every number the firm signs." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  const nameFor = (id: string) => clients.find((c) => c.business_id === id)?.client_name ?? "Client";

  return (
    <div>
      <ModuleHeader
        title="Working papers"
        subtitle="Each paper freezes what the ledger said when it was prepared, so a reviewer approves a fixed snapshot rather than a moving target."
      />

      <StatStrip
        items={[
          { label: "Papers", value: String(rows.length) },
          { label: "Draft", value: String(rows.filter((r) => r.status === "draft").length) },
          { label: "In review", value: String(rows.filter((r) => r.status === "in_review").length), tone: "amber" },
          { label: "Approved", value: String(rows.filter((r) => r.status === "approved").length), tone: "green" },
        ]}
      />

      <CACard style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...caInputStyle, maxWidth: 240 }} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            {!clients.length && <option value="">No clients yet</option>}
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>
                {c.client_name}
              </option>
            ))}
          </select>
          <select style={{ ...caInputStyle, maxWidth: 180 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
          <select style={{ ...caInputStyle, maxWidth: 230 }} value={paperType} onChange={(e) => setPaperType(e.target.value as PaperType)}>
            {PAPER_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <CAButton onClick={generate} disabled={busy || !businessId}>
            {busy ? "Preparing…" : "Prepare paper"}
          </CAButton>
        </div>
        <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 10 }}>
          {PAPER_TYPES.find((p) => p.value === paperType)?.blurb}
        </div>
      </CACard>

      {!rows.length ? (
        <CACard style={{ padding: 22 }}>
          <CAEmpty title="No working papers yet" hint="Prepare one for the period you are closing." />
        </CACard>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((p) => {
            const open = openId === p.id;
            return (
              <CACard key={p.id} style={{ padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setOpenId(open ? null : p.id)}
                    style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", flex: 1 }}
                  >
                    <div style={{ fontFamily: CA.sans, fontSize: 14.5, fontWeight: 600, color: CA.ink }}>{p.title}</div>
                    <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 2 }}>
                      {nameFor(p.business_id)} · prepared {new Date(p.created_at).toLocaleDateString("en-IN")}
                    </div>
                  </button>
                  <StateChip value={p.status} />
                  <CAButton
                    variant="ghost"
                    disabled={pdfId === p.id}
                    onClick={() => void downloadPdf(p.id)}
                  >
                    {pdfId === p.id ? "Preparing PDF" : "Download PDF"}
                  </CAButton>

                  {p.status === "draft" && <CAButton variant="ghost" onClick={() => setStatus(p, "in_review")}>Send to review</CAButton>}
                  {p.status === "in_review" && can("sign_off") && <CAButton onClick={() => setStatus(p, "approved")}>Approve</CAButton>}
                  {p.status === "approved" && can("sign_off") && (
                    <CAButton variant="ghost" onClick={() => setStatus(p, "draft")}>
                      Re-open
                    </CAButton>
                  )}
                </div>

                {open && p.content && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${CA.line}` }}>
                    <div style={{ display: "grid", gap: 0 }}>
                      {p.content.lines.map((l) => (
                        <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: `0.5px solid ${CA.line}` }}>
                          <span style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>{l.label}</span>
                          <span style={{ fontFamily: CA.mono, fontSize: 13, fontVariantNumeric: "tabular-nums", color: CA.ink }}>{l.value}</span>
                        </div>
                      ))}
                    </div>
                    {p.content.observations.length > 0 && (
                      <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
                        {p.content.observations.map((o) => (
                          <li key={o} style={{ display: "flex", gap: 9, fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: CA.red, marginTop: 6, flexShrink: 0 }} />
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint, marginTop: 14 }}>
                      Snapshot taken {new Date(p.content.generated_at).toLocaleString("en-IN")} — figures are frozen at that moment.
                    </div>
                  </div>
                )}
              </CACard>
            );
          })}
        </div>
      )}
    </div>
  );
}
