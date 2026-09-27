import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CA, CACard, CABadge, CAField, caInputStyle, statusTone, dateIN, caTh, caTd, CAEmpty,
} from "@/components/ca/portalUi";
import { DOC_CLASS_LABELS, guessClassification, intakeDocument, type CADocClass } from "@/lib/caIntake";
import { scanAndClassifyDocument } from "@/lib/caDocs.functions";


const CLASSES: CADocClass[] = ["bank", "invoice", "expense", "challan", "other"];

interface DocRow {
  id: string;
  document_id: string | null;
  original_filename: string | null;
  classification: string;
  confidence: number;
  review_state: string;
  storage_path: string | null;
  created_at: string;
}

interface VersionRow {
  id: string;
  version_number: number;
  original_filename: string | null;
  uploaded_by: string | null;
  reason: string | null;
  created_at: string;
}

interface DocMeta {
  virus_scan_status: string | null;
  auto_matched: boolean | null;
}

export default function ClientDocumentsTab({ firmId, businessId }: { firmId: string; businessId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [meta, setMeta] = useState<Record<string, DocMeta>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [classification, setClassification] = useState<CADocClass | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, VersionRow[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const scanDoc = useServerFn(scanAndClassifyDocument);


  const load = useCallback(async () => {
    if (!firmId || !businessId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_document_extractions")
      .select("id, document_id, original_filename, classification, confidence, review_state, storage_path, created_at")
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) console.warn("[fyn:ca] ca_document_extractions", error);
    const rows = (data ?? []) as DocRow[];
    setDocs(rows);

    const ids = rows.map((r) => r.document_id).filter((v): v is string => !!v);
    if (ids.length) {
      const { data: metaRows } = await supabase
        .from("ca_client_documents")
        .select("id, virus_scan_status, auto_matched")
        .eq("ca_firm_id", firmId)
        .in("id", ids);
      const map: Record<string, DocMeta> = {};
      for (const m of (metaRows ?? []) as any[]) {
        map[m.id] = { virus_scan_status: m.virus_scan_status ?? null, auto_matched: m.auto_matched ?? null };
      }
      setMeta(map);
    } else {
      setMeta({});
    }
    setLoading(false);
  }, [firmId, businessId]);

  useEffect(() => { void load(); }, [load]);


  const loadVersions = async (extractionId: string) => {
    const { data, error } = await supabase
      .from("ca_document_versions")
      .select("id, version_number, original_filename, uploaded_by, reason, created_at")
      .eq("extraction_id", extractionId)
      .order("version_number", { ascending: false });
    if (error) return toast.error(error.message);
    setVersions((v) => ({ ...v, [extractionId]: (data ?? []) as VersionRow[] }));
  };

  const toggle = (id: string) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (!versions[id]) void loadVersions(id);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !firmId || !businessId) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const cls = classification === "auto" ? guessClassification(file.name) : classification;

      // Find an existing document for the same period + classification — this upload replaces it.
      const { data: priorDocs } = await supabase
        .from("ca_client_documents")
        .select("id, storage_path, original_filename")
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .eq("document_type", cls)
        .eq("filing_period", period)
        .order("created_at", { ascending: false })
        .limit(1);
      const prior = priorDocs?.[0] ?? null;

      let priorExtraction: { id: string; storage_path: string | null; original_filename: string | null } | null = null;
      if (prior) {
        const { data: pe } = await supabase
          .from("ca_document_extractions")
          .select("id, storage_path, original_filename")
          .eq("document_id", prior.id)
          .order("created_at", { ascending: false })
          .limit(1);
        priorExtraction = pe?.[0] ?? null;
      }

      const res = await intakeDocument({
        file,
        firmId,
        businessId,
        clientReferenceCode: businessId.slice(0, 8).toUpperCase(),
        period,
        classification: cls,
      });

      if (!res.ok) {
        toast.error(`${file.name}: ${res.error}`);
        continue;
      }

      if (priorExtraction) {
        const { data: last } = await supabase
          .from("ca_document_versions")
          .select("version_number")
          .eq("extraction_id", priorExtraction.id)
          .order("version_number", { ascending: false })
          .limit(1);
        const nextVersion = (last?.[0]?.version_number ?? 0) + 1;
        const { data: userRes } = await supabase.auth.getUser();
        const { error: verErr } = await supabase.from("ca_document_versions").insert({
          ca_firm_id: firmId,
          business_id: businessId,
          extraction_id: priorExtraction.id,
          version_number: nextVersion,
          storage_path: priorExtraction.storage_path ?? prior?.storage_path ?? "unknown",
          original_filename: priorExtraction.original_filename ?? prior?.original_filename ?? null,
          replaced_by: res.extractionId ?? null,
          uploaded_by: userRes?.user?.id ?? null,
          reason: "re-upload",
        });
        if (verErr) toast.warning(`Version history not recorded: ${verErr.message}`);
        else {
          toast.info(`${file.name} replaces an earlier ${DOC_CLASS_LABELS[cls]} for ${period} — version ${nextVersion} archived`);
          setVersions((v) => { const n = { ...v }; delete n[priorExtraction!.id]; return n; });
        }
      }

      if (res.documentId) {
        try {
          const scan = await scanDoc({ data: { document_id: res.documentId } });
          if (scan.scan_status === "infected") {
            toast.error(`${file.name} was rejected: ${scan.reason}`);
            continue;
          }
          if (scan.matched) {
            toast.success(`${file.name} uploaded and matched to request "${scan.request_title}"`);
            continue;
          }
        } catch (e) {
          toast.warning(`${file.name}: safety scan could not run right now`);
        }
      }

      toast.success(`${file.name} uploaded`);

    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    void load();
  };

  return (
    <div>
      <CACard style={{ padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "end" }}>
          <CAField label="Period">
            <input type="month" style={caInputStyle} value={period} onChange={(e) => setPeriod(e.target.value)} />
          </CAField>
          <CAField label="Classification">
            <select style={caInputStyle as any} value={classification} onChange={(e) => setClassification(e.target.value as CADocClass | "auto")}>
              <option value="auto">Classify automatically</option>
              {CLASSES.map((c) => <option key={c} value={c}>{DOC_CLASS_LABELS[c]}</option>)}
            </select>
          </CAField>
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              disabled={busy}
              onChange={(e) => handleFiles(e.target.files)}
              style={{ fontFamily: CA.sans, fontSize: 13 }}
            />
          </div>
        </div>
        <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 10 }}>
          Re-uploading for the same period and classification archives the earlier file into version history.
        </div>
      </CACard>

      <CACard style={{ marginTop: 16, overflow: "hidden" }}>
        {loading ? <CAEmpty title="Loading documents…" /> : docs.length === 0 ? (
          <CAEmpty title="No documents yet" hint="Upload a photo or PDF above." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={caTh}>File</th><th style={caTh}>Class</th><th style={caTh}>Confidence</th>
              <th style={caTh}>Safety</th><th style={caTh}>Request</th>
              <th style={caTh}>State</th><th style={caTh}>Uploaded</th><th style={caTh} />
            </tr></thead>
            <tbody>
              {docs.map((d) => (
                <Fragment key={d.id}>
                  <tr>
                    <td style={caTd}>{d.original_filename ?? "—"}</td>
                    <td style={caTd}>{DOC_CLASS_LABELS[d.classification as CADocClass] ?? d.classification}</td>
                    <td style={caTd}>{Math.round((d.confidence ?? 0) * (d.confidence <= 1 ? 100 : 1))}%</td>
                    <td style={caTd}>
                      {(() => {
                        const scan = d.document_id ? meta[d.document_id]?.virus_scan_status : null;
                        if (!scan) return <span style={{ color: CA.faint }}>not scanned</span>;
                        return <CABadge tone={scan === "clean" ? "green" : scan === "infected" ? "red" : "amber"}>{scan}</CABadge>;
                      })()}
                    </td>
                    <td style={caTd}>
                      {d.document_id && meta[d.document_id]?.auto_matched
                        ? <CABadge tone="teal">auto matched</CABadge>
                        : <span style={{ color: CA.faint }}>—</span>}
                    </td>
                    <td style={caTd}><CABadge tone={statusTone(d.review_state)}>{d.review_state}</CABadge></td>
                    <td style={caTd}>{dateIN(d.created_at)}</td>

                    <td style={{ ...caTd, textAlign: "right" }}>
                      <button
                        onClick={() => toggle(d.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: CA.teal, fontFamily: CA.sans, fontSize: 12.5 }}
                      >
                        {expanded === d.id ? "Hide version history" : "Version history"}
                      </button>
                    </td>
                  </tr>
                  {expanded === d.id && (
                    <tr>
                      <td style={{ ...caTd, background: "rgba(26,26,26,0.02)" }} colSpan={8}>
                        {!versions[d.id] ? (
                          <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>Loading versions…</span>
                        ) : versions[d.id].length === 0 ? (
                          <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>No earlier versions — this is version 1.</span>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              <th style={caTh}>Version</th><th style={caTh}>File</th>
                              <th style={caTh}>Uploaded by</th><th style={caTh}>Archived</th><th style={caTh}>Reason</th>
                            </tr></thead>
                            <tbody>
                              {versions[d.id].map((v) => (
                                <tr key={v.id}>
                                  <td style={caTd}>v{v.version_number}</td>
                                  <td style={caTd}>{v.original_filename ?? "—"}</td>
                                  <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 11.5 }}>{v.uploaded_by ?? "—"}</td>
                                  <td style={caTd}>{dateIN(v.created_at)}</td>
                                  <td style={caTd}>{v.reason ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </CACard>
    </div>
  );
}
