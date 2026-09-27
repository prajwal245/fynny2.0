import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFirmIntegrations, syncZohoBooks, syncRazorpay, getAutoSyncSettings, setAutoSync, type AutoSyncSetting } from "@/lib/caSync.functions";
import { CA, CACard, CABadge, CAButton, dateIN, caTh, caTd, CAEmpty } from "@/components/ca/portalUi";

interface SyncJob {
  id: string;
  source_system: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
}

const LABELS: Record<string, string> = { zoho_books: "Zoho Books", razorpay: "Razorpay" };

export default function ClientSyncPanel({ firmId, businessId }: { firmId: string; businessId: string }) {
  const [providers, setProviders] = useState<string[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const runZoho = useServerFn(syncZohoBooks);
  const runRazorpay = useServerFn(syncRazorpay);
  const loadIntegrations = useServerFn(getFirmIntegrations);
  const loadAuto = useServerFn(getAutoSyncSettings);
  const saveAuto = useServerFn(setAutoSync);
  const [autoSettings, setAutoSettings] = useState<AutoSyncSetting[]>([]);

  const load = useCallback(async () => {
    try {
      const rows = await loadIntegrations({ data: { firmId } });
      setProviders(
        rows.filter((r) => r.business_id === businessId && (r.status ?? "active") === "active").map((r) => r.provider),
      );
    } catch {
      setProviders([]);
    }
    try {
      setAutoSettings(await loadAuto({ data: { firmId, businessId } }));
    } catch {
      setAutoSettings([]);
    }
    const { data } = await supabase
      .from("ca_sync_jobs")
      .select("id, source_system, status, records_synced, error_message, completed_at, created_at")
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(10);
    setJobs((data as SyncJob[]) ?? []);
  }, [firmId, businessId, loadIntegrations, loadAuto]);

  useEffect(() => { load(); }, [load]);

  const run = async (source: "zoho_books" | "razorpay") => {
    setBusy(source);
    try {
      const fn = source === "zoho_books" ? runZoho : runRazorpay;
      const res = await fn({ data: { businessId, firmId } });
      if (res.success) {
        toast.success(`${LABELS[source]}: ${res.records_synced} new record(s) synced`);
        if (res.errors.length) toast.warning(res.errors.join("; "));
      } else {
        toast.error(res.errors[0] ?? "Sync failed");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Sync failed");
    } finally {
      setBusy(null);
      load();
    }
  };

  const toggleAuto = async (provider: string, enabled: boolean) => {
    try {
      await saveAuto({ data: { firmId, businessId, provider, enabled } });
      toast.success(enabled ? `${LABELS[provider] ?? provider} will sync automatically every night` : `Automatic sync turned off for ${LABELS[provider] ?? provider}`);
      load();
    } catch (e) {
      toast.error((e as Error).message ?? "Could not update auto-sync");
    }
  };

  return (
    <CACard style={{ marginTop: 18, overflow: "hidden" }}>
      <div style={{
        padding: "14px 18px", borderBottom: `0.5px solid ${CA.line}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontFamily: CA.serif, fontSize: 15, fontWeight: 700 }}>Connected data sources</div>
        <div style={{ display: "flex", gap: 8 }}>
          {providers.includes("zoho_books") && (
            <CAButton onClick={() => run("zoho_books")} disabled={busy !== null} style={{ padding: "7px 13px", fontSize: 12.5 }}>
              {busy === "zoho_books" ? "Syncing…" : "Sync Zoho"}
            </CAButton>
          )}
          {providers.includes("razorpay") && (
            <CAButton onClick={() => run("razorpay")} disabled={busy !== null} style={{ padding: "7px 13px", fontSize: 12.5 }}>
              {busy === "razorpay" ? "Syncing…" : "Sync Razorpay"}
            </CAButton>
          )}
          {providers.length === 0 && (
            <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint }}>
              No accounting or payment source connected by this client yet.
            </span>
          )}
        </div>
      </div>

      {providers.length > 0 && (
        <div style={{
          padding: "12px 18px", borderBottom: `0.5px solid ${CA.line}`,
          display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center",
        }}>
          <span style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
            Automatic nightly sync
          </span>
          {providers.map((p) => {
            const setting = autoSettings.find((a) => a.provider === p);
            return (
              <label key={p} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: CA.sans, fontSize: 13, color: CA.ink }}>
                <input
                  type="checkbox"
                  checked={Boolean(setting?.auto_sync_enabled)}
                  onChange={(e) => toggleAuto(p, e.target.checked)}
                />
                {LABELS[p] ?? p}
                {setting?.last_auto_sync_at && (
                  <span style={{ color: CA.faint, fontSize: 12 }}>· last {dateIN(setting.last_auto_sync_at)}</span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {jobs.length === 0 ? (
        <CAEmpty title="No syncs yet" hint="Sync history appears here once you pull data from a connected source." />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={caTh}>Source</th>
            <th style={caTh}>Status</th>
            <th style={{ ...caTh, textAlign: "right" }}>Records</th>
            <th style={caTh}>Finished</th>
            <th style={caTh}>Error</th>
          </tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td style={caTd}>{LABELS[j.source_system] ?? j.source_system}</td>
                <td style={caTd}>
                  <CABadge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : "amber"}>
                    {j.status}
                  </CABadge>
                </td>
                <td style={{ ...caTd, textAlign: "right", fontFamily: CA.mono }}>{j.records_synced ?? 0}</td>
                <td style={caTd}>{dateIN(j.completed_at ?? j.created_at)}</td>
                <td style={{ ...caTd, color: CA.muted, fontSize: 12 }}>{j.error_message ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CACard>
  );
}
