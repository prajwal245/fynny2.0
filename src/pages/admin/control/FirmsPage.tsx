import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminExtendTrial, adminFirm, adminFirms, adminSetFirmStatus } from "@/lib/admin/admin.functions";
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
  const list = useQuery({
    queryKey: ["admin", "firms", q, status, plan, page],
    queryFn: () => adminCall(() => adminFirms({ data: { q, status, plan, page } })),
    placeholderData: (p) => p,
  });

  return (
    <div>
      <PageHead title="Firms" sub="Every CA firm on FynHelp: plan, clients, how they signed up, and their account status." />
      <Panel>
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
          <Table head={["Firm", "Plan", "Clients", "Signed up", "Via", "Last sign-in", "Account"]} testId="firms-table">
            {list.data.rows.map((f) => (
              <tr key={f.id} className="cursor-pointer hover:bg-black/[.02]" onClick={() => setOpen(f.id)}>
                <Td>
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-xs" style={{ color: muted }}>{f.email}{f.city ? ` · ${f.city}` : ""}</div>
                </Td>
                <Td>
                  <div>{f.plan}</div>
                  <Pill tone={STATE_TONE[f.planState]}>{f.planState === "trial" && f.trialEnds ? `trial to ${day(f.trialEnds)}` : f.planState}</Pill>
                </Td>
                <Td className="tabular-nums">{f.clients}</Td>
                <Td>{day(f.createdAt)}</Td>
                <Td className="capitalize">{f.source}</Td>
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
      {open && <FirmDrawer firmId={open} onClose={() => setOpen(null)} canUpdate={can("firms.update")} />}
    </div>
  );
}

function FirmDrawer({ firmId, onClose, canUpdate }: { firmId: string; onClose: () => void; canUpdate: boolean }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["admin", "firm", firmId], queryFn: () => adminCall(() => adminFirm({ data: { firmId } })) });
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

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
