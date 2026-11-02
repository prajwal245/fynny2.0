import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminDeleteFirm, adminExtendTrial, adminFirm, adminFirms, adminSetFirmStatus, adminSetFirmsTest, adminSignupSources } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { useAdminSession } from "@/components/admin/AdminSessionGate";
import { Btn, Empty, ErrorNote, PageHead, Panel, Pill, Table, Td, day, line, muted, when } from "./ui";

type Status = "" | "active" | "suspended" | "flagged";
type PlanFilter = "" | "trial" | "paid" | "paused" | "cancelled";

const STATE_TONE = { trial: "info", paid: "good", paused: "warn", cancelled: "bad" } as const;
const STATUS_TONE = { active: "good", suspended: "bad", flagged: "warn" } as const;

export default function FirmsPage() {
  const { can } = useAdminSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [plan, setPlan] = useState<PlanFilter>("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [tests, setTests] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "firms", q, status, plan, page, tests],
    queryFn: () => adminCall(() => adminFirms({ data: { q, status, plan, page, tests } })),
    placeholderData: (p) => p,
  });
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulkMark = async (isTest: boolean) => {
    setBulkBusy(true);
    try {
      const r = await adminCall(() => adminSetFirmsTest({ data: { firmIds: [...picked], isTest } }));
      if (r.failed.length) toast.error(r.failed.join("; "));
      if (r.changed) toast.success(isTest ? `${r.changed} firm${r.changed === 1 ? "" : "s"} marked as test and removed from reports.` : `${r.changed} firm${r.changed === 1 ? "" : "s"} marked as real.`);
      setPicked(new Set());
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Firms" sub="Every CA firm on FynHelp: plan, clients, how they signed up, and their account status." />
      <SourcesPanel />
      <Panel>
        <div className="flex gap-2 mb-3" role="tablist" aria-label="Real or test firms">
          <Btn kind={tests ? undefined : "primary"} onClick={() => { setTests(false); setPicked(new Set()); setPage(0); }}>Real firms</Btn>
          <Btn kind={tests ? "primary" : undefined} onClick={() => { setTests(true); setPicked(new Set()); setPage(0); }} testId="firms-tests-tab">Test firms</Btn>
        </div>
        {can("firms.update") && picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl px-3 py-2" style={{ background: "rgba(138,30,24,.06)" }} data-testid="firm-bulk-bar">
            <span className="text-sm font-medium">{picked.size} selected</span>
            {!tests ? (
              <Btn disabled={bulkBusy} onClick={() => void bulkMark(true)} testId="firm-bulk-test">Mark as test</Btn>
            ) : (
              <Btn disabled={bulkBusy} onClick={() => void bulkMark(false)}>Mark as real</Btn>
            )}
            <Btn onClick={() => setPicked(new Set())}>Clear</Btn>
            <span className="text-xs" style={{ color: muted }}>{tests ? "Real firms count in reports and revenue." : "Test firms are left out of every report and the revenue figures. You can undo this."}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]" placeholder="Search firm, email or city" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} data-testid="firm-search" />
          <select className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as Status); setPage(0); }} aria-label="Account status" data-testid="firm-status-filter">
            <option value="">All accounts</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="flagged">Flagged</option>
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={plan} onChange={(e) => { setPlan(e.target.value as PlanFilter); setPage(0); }} aria-label="Plan">
            <option value="">All plans</option>
            <option value="trial">On trial</option>
            <option value="paid">Paying</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <ErrorNote error={list.error} />
        {list.data && list.data.rows.length === 0 && <Empty>No firms match.</Empty>}
        {list.data && list.data.rows.length > 0 && (
          <Table head={["", "Firm", "Plan", "Clients", "Signed up", "Came from", "Last sign-in", "Account"]} testId="firms-table">
            {list.data.rows.map((f) => (
              <tr key={f.id} className="cursor-pointer hover:bg-black/[.02]" onClick={() => setOpen(f.id)}>
                <Td>
                  {can("firms.update") && (
                    <input type="checkbox" aria-label={`Select ${f.name}`} checked={picked.has(f.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(f.id)} />
                  )}
                </Td>
                <Td>
                  <div className="font-semibold">{f.name} {f.looksLikeTest && <Pill tone="warn">looks like a test</Pill>}</div>
                  <div className="text-xs" style={{ color: muted }}>{f.email}{f.city ? ` · ${f.city}` : ""}</div>
                </Td>
                <Td>
                  <div>{f.plan}</div>
                  <Pill tone={STATE_TONE[f.planState]}>{f.planState === "trial" && f.trialEnds ? `trial to ${day(f.trialEnds)}` : f.planState}</Pill>
                </Td>
                <Td className="tabular-nums">{f.clients}</Td>
                <Td>{day(f.createdAt)}</Td>
                <Td>
                  <div className="capitalize">{f.channel ? f.channel.replace("-", " ") : <span style={{ color: muted }}>not tracked</span>}</div>
                  {f.from && <div className="text-xs" style={{ color: muted }}>{f.from}</div>}
                </Td>
                <Td>{when(f.lastSignIn)}</Td>
                <Td><Pill tone={STATUS_TONE[f.status]}>{f.status}</Pill></Td>
              </tr>
            ))}
          </Table>
        )}
        {list.data && list.data.total > 50 && (
          <div className="flex items-center justify-between mt-3 text-sm" style={{ color: muted }}>
            <span>{list.data.total} firms</span>
            <div className="flex gap-2">
              <Btn disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn disabled={(page + 1) * 50 >= list.data.total} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </Panel>
      {open && <FirmDrawer firmId={open} onClose={() => setOpen(null)} canUpdate={can("firms.update")} canDelete={can("firms.delete")} />}
    </div>
  );
}

function FirmDrawer({ firmId, onClose, canUpdate, canDelete }: { firmId: string; onClose: () => void; canUpdate: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["admin", "firm", firmId], queryFn: () => adminCall(() => adminFirm({ data: { firmId } })) });
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [alsoLogin, setAlsoLogin] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await adminCall(fn);
      toast.success(ok);
      setNote("");
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin", "firm", firmId] }), qc.invalidateQueries({ queryKey: ["admin", "firms"] })]);
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };

  const f = d.data?.firm;
  const b = d.data?.billing as Record<string, string | null> | null | undefined;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Firm details">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[560px] bg-white overflow-y-auto p-6" data-testid="firm-drawer">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold">{f?.firm_name ?? "Loading…"}</h2>
            {f && <p className="text-sm" style={{ color: muted }}>{f.email} · {f.phone ?? "no phone"} · {f.city ?? ""}</p>}
          </div>
          <Btn onClick={onClose}>Close</Btn>
        </div>
        <ErrorNote error={d.error} />
        {d.data && f && (
          <div className="grid gap-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Clients" value={d.data.clients} />
              <Stat label="Documents" value={d.data.documents} />
              <Stat label="Members" value={d.data.members.length} />
            </div>
            <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }}>
              <div className="font-semibold mb-1">Plan</div>
              {b ? (
                <div>
                  {b.plan} · {b.cycle} · <b>{b.status}</b>
                  {b.status === "trialing" && <> · trial ends {day(b.trial_ends_at)}</>}
                  {b.current_period_end && <> · period ends {day(b.current_period_end)}</>}
                  {b.billing_gstin && <div className="text-xs mt-1" style={{ color: muted }}>GSTIN {b.billing_gstin}</div>}
                </div>
              ) : (
                <span style={{ color: muted }}>No billing record yet (trial starts on first use).</span>
              )}
            </div>
            <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }}>
              <div className="font-semibold mb-1">Account</div>
              <div>
                Status: <b data-testid="firm-account-status">{f.admin_status}</b>
                {f.admin_note && <span style={{ color: muted }}> · {f.admin_note}</span>}
              </div>
              <div className="text-xs mt-1" style={{ color: muted }}>ICAI {f.icai_membership_number ?? "—"} · verification {f.verification_status ?? "—"}</div>
              {canUpdate && (
                <div className="grid gap-2 mt-3">
                  <input className="rounded-lg border px-3 py-2" placeholder="Reason (required to suspend or flag)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="firm-note" />
                  <div className="flex flex-wrap gap-2">
                    {f.admin_status !== "suspended" && (
                      <Btn kind="danger" disabled={busy} testId="firm-suspend" onClick={() => void act(() => adminSetFirmStatus({ data: { firmId, status: "suspended", note } }), "Firm suspended. Its users can no longer work.")}>Suspend</Btn>
                    )}
                    {f.admin_status !== "flagged" && (
                      <Btn disabled={busy} onClick={() => void act(() => adminSetFirmStatus({ data: { firmId, status: "flagged", note } }), "Firm flagged for review.")}>Flag</Btn>
                    )}
                    {f.admin_status !== "active" && (
                      <Btn kind="primary" disabled={busy} testId="firm-reactivate" onClick={() => void act(() => adminSetFirmStatus({ data: { firmId, status: "active", note } }), "Firm active again.")}>Make active</Btn>
                    )}
                  </div>
                  {b?.status === "trialing" && (
                    <div className="flex items-center gap-2 mt-1">
                      <span>Extend trial by</span>
                      <input type="number" min={1} max={60} className="w-20 rounded-lg border px-2 py-1.5" value={days} onChange={(e) => setDays(Number(e.target.value))} />
                      <span>days</span>
                      <Btn disabled={busy} testId="firm-extend" onClick={() => void act(() => adminExtendTrial({ data: { firmId, days } }), `Trial extended by ${days} days.`)}>Extend</Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }} data-testid="firm-source">
              <div className="font-semibold mb-1">Where they came from</div>
              {d.data.attribution?.signup_channel ? (
                <div>
                  <span className="capitalize">{d.data.attribution.signup_channel.replace("-", " ")}</span>
                  {[d.data.attribution.signup_source, d.data.attribution.signup_medium].filter(Boolean).length > 0 && <> · {[d.data.attribution.signup_source, d.data.attribution.signup_medium].filter(Boolean).join(" / ")}</>}
                  {d.data.attribution.signup_campaign && <div className="text-xs" style={{ color: muted }}>Campaign {d.data.attribution.signup_campaign}{d.data.attribution.signup_content ? ` · ${d.data.attribution.signup_content}` : ""}</div>}
                  {(d.data.attribution.signup_landing || d.data.attribution.signup_referrer_host) && <div className="text-xs" style={{ color: muted }}>{d.data.attribution.signup_referrer_host ? `via ${d.data.attribution.signup_referrer_host} · ` : ""}landed on {d.data.attribution.signup_landing ?? "—"}</div>}
                </div>
              ) : (
                <span style={{ color: muted }}>Not tracked (signed up before source tracking, or the visitor was a tester).</span>
              )}
              {d.data.lead && (["first", "last"] as const).map((w) => {
                const t = (d.data.lead as Record<string, Record<string, string>>)[w] ?? {};
                const line = [t["utm_source"], t["utm_medium"]].filter(Boolean).join(" / ");
                const ad = [t["utm_campaign"], t["utm_content"], t["utm_term"]].filter(Boolean).join(" · ");
                if (!line && !ad && !t["gclid"] && !t["fbclid"]) return null;
                return (
                  <div key={w} className="text-xs mt-2" style={{ color: muted }}>
                    <b style={{ color: "#171208" }}>{w === "first" ? "First click" : "Last click"}:</b> {line}{ad ? ` | ${ad}` : ""}{t["gclid"] ? " | gclid" : ""}{t["fbclid"] ? " | fbclid" : ""}
                  </div>
                );
              })}
            </div>
            {canUpdate && (
              <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }}>
                <div className="font-semibold mb-1">Test or real</div>
                <p className="text-xs mb-2" style={{ color: muted }}>{f.is_test ? "This is a test firm: it is left out of every report and the revenue figures." : "Fake or test sign-ups should be marked as test, so they stop counting as customers. You can undo it."}</p>
                <Btn disabled={busy} testId="firm-mark-test" onClick={() => void act(() => adminSetFirmsTest({ data: { firmIds: [firmId], isTest: !f.is_test } }), f.is_test ? "Marked as a real firm." : "Marked as a test firm.")}>{f.is_test ? "Mark as real" : "Mark as test"}</Btn>
              </div>
            )}
            {canDelete && (
              <div className="rounded-xl p-3" style={{ border: "1px solid rgba(138,30,24,.35)", background: "rgba(138,30,24,.04)" }} data-testid="firm-delete-box">
                <div className="font-semibold mb-1" style={{ color: "#8A1E18" }}>Delete this firm</div>
                <p className="text-xs mb-2" style={{ color: muted }}>Permanently removes the firm and its clients, documents, reports and chases. This cannot be undone. Firms that have paid cannot be deleted here. If you only want it out of the numbers, use Mark as test.</p>
                <input className="rounded-lg border px-3 py-2 w-full" placeholder={`Type “${f.firm_name}” to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} data-testid="firm-delete-confirm" aria-label="Type the firm name to confirm deletion" />
                <label className="flex items-center gap-2 mt-2 text-xs"><input type="checkbox" checked={alsoLogin} onChange={(e) => setAlsoLogin(e.target.checked)} /> Also delete the owner&rsquo;s login, so the email can sign up again (only if it belongs to no other firm)</label>
                <div className="mt-2">
                  <Btn kind="danger" disabled={busy || confirmName.trim() !== f.firm_name.trim()} testId="firm-delete" onClick={() => void (async () => { await act(() => adminDeleteFirm({ data: { firmId, confirmName, alsoDeleteLogin: alsoLogin } }), "Firm deleted."); onClose(); })()}>Delete firm permanently</Btn>
                </div>
              </div>
            )}
            <div>
              <div className="font-semibold mb-1">Team</div>
              {d.data.members.length === 0 ? <p style={{ color: muted }}>Only the owner.</p> : (
                <ul>{d.data.members.map((m, i) => <li key={i}>{m.invited_email} · {m.role} · {m.status}</li>)}</ul>
              )}
            </div>
            <div>
              <div className="font-semibold mb-1">Recent MIS</div>
              {d.data.reports.length === 0 ? <p style={{ color: muted }}>None yet.</p> : (
                <ul>{d.data.reports.map((r) => <li key={r.id}>{r.report_name ?? "MIS"} · {r.period} · {r.status} · {day(r.created_at)}</li>)}</ul>
              )}
            </div>
            <div>
              <div className="font-semibold mb-1">Activity</div>
              <ul className="grid gap-1">{d.data.activity.map((a, i) => <li key={i}><span className="text-xs" style={{ color: muted }}>{when(a.created_at)}</span> {a.description}</li>)}</ul>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }}>
      <div className="text-xs" style={{ color: muted }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SourcesPanel() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["admin", "sources", days], queryFn: () => adminCall(() => adminSignupSources({ data: { days } })) });
  const d = q.data;
  return (
    <Panel
      title="Sign-ups by source"
      testId="signup-sources"
      action={
        <select className="rounded-lg border px-2 py-1 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      }
    >
      <ErrorNote error={q.error} />
      {d && !d.ready && <Empty>Source tracking switches on once the latest database change is applied.</Empty>}
      {d && d.ready && d.total === 0 && <Empty>No real sign-ups in this period.</Empty>}
      {d && d.ready && d.total > 0 && (
        <>
          <p className="text-xs mb-2" style={{ color: muted }}>{d.total} real sign-ups (test and demo firms left out). {d.tracked} have a recorded source; the rest signed up before tracking or without a trace.</p>
          <Table head={["Channel", "Sign-ups", "Added a client", "Paying"]}>
            {d.channels.map((r) => (
              <tr key={r.label}><Td className="capitalize">{r.label.replace("-", " ")}</Td><Td className="tabular-nums">{r.signups}</Td><Td className="tabular-nums">{r.activated}</Td><Td className="tabular-nums">{r.paid}</Td></tr>
            ))}
          </Table>
          {d.campaigns.length > 0 && (
            <div className="mt-4">
              <Table head={["Campaign · who or which ad", "Sign-ups", "Added a client", "Paying"]}>
                {d.campaigns.map((r) => (
                  <tr key={r.label}><Td>{r.label}</Td><Td className="tabular-nums">{r.signups}</Td><Td className="tabular-nums">{r.activated}</Td><Td className="tabular-nums">{r.paid}</Td></tr>
                ))}
              </Table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
