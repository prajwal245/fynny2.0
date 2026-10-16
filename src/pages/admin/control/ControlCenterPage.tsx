import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminActivity, adminDashboard } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { ErrorNote, Kpi, PageHead, Panel, inr, ink, maroon, muted, when } from "./ui";

type Feed = Awaited<ReturnType<typeof adminActivity>>;

export default function ControlCenterPage() {
  const q = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => adminCall(() => adminDashboard()), refetchInterval: 60_000 });
  const [feed, setFeed] = useState<Feed>([]);
  const newest = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const rows = await adminCall(() => adminActivity({ data: { after: newest.current } }));
        if (!live || !rows.length) return;
        newest.current = rows[0].at;
        setFeed((f) => [...rows, ...f].slice(0, 60));
      } catch {
        /* the session gate handles sign-out */
      }
    };
    void load();
    const t = window.setInterval(load, 10_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  const d = q.data;
  return (
    <div>
      <PageHead title="Control Center" sub="Firms, revenue and the agents' work across FynHelp. Figures refresh every minute; the feed every 10 seconds." />
      <ErrorNote error={q.error} />
      {d && (
        <>
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }} data-testid="admin-kpis">
            <Kpi label="Firms" value={d.kpis.firms} hint={`${d.kpis.newFirms30} new in 30 days`} />
            <Kpi label="On free trial" value={d.kpis.trials} />
            <Kpi label="Paying firms" value={d.kpis.paid} />
            <Kpi label="MRR (excl. GST)" value={inr(d.kpis.mrr)} hint="Yearly plans counted per month" />
            <Kpi label="Churn, 30 days" value={`${d.kpis.churnRate}%`} />
            <Kpi label="Documents, 30 days" value={d.kpis.documents30.toLocaleString("en-IN")} />
            <Kpi label="MIS generated, 30 days" value={d.kpis.mis30.toLocaleString("en-IN")} />
            <Kpi label="Agents running now" value={d.kpis.runningNow} hint={`${d.kpis.failed24h} failed in 24 h`} />
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(420px,100%),1fr))" }}>
            <Panel title="Daily volume, last 30 days">
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={d.days.map((x) => ({ ...x, day: x.day.slice(5) }))}>
                    <CartesianGrid stroke="rgba(23,18,8,.06)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: muted }} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: muted }} allowDecimals={false} width={36} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="documents" name="Documents" stroke={maroon} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="mis" name="MIS" stroke="#B07A1E" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="signups" name="New firms" stroke={ink} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="MRR by plan">
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={d.byPlan}>
                    <CartesianGrid stroke="rgba(23,18,8,.06)" vertical={false} />
                    <XAxis dataKey="plan" tick={{ fontSize: 12, fill: muted }} />
                    <YAxis tick={{ fontSize: 11, fill: muted }} width={56} tickFormatter={(v) => inr(Number(v))} />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Bar dataKey="mrr" name="MRR" fill={maroon} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="When documents arrive (IST, last 30 days)">
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={d.hours}>
                    <CartesianGrid stroke="rgba(23,18,8,.06)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: muted }} tickFormatter={(h) => `${h}:00`} interval={2} />
                    <YAxis tick={{ fontSize: 11, fill: muted }} allowDecimals={false} width={36} />
                    <Tooltip labelFormatter={(h) => `${h}:00 to ${h}:59`} />
                    <Bar dataKey="documents" name="Documents" fill="#B07A1E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Live activity" testId="admin-feed">
              <ul className="text-sm max-h-[260px] overflow-y-auto pr-1">
                {feed.length === 0 && <li style={{ color: muted }}>Nothing yet.</li>}
                {feed.map((f) => (
                  <li key={f.id} className="py-1.5" style={{ borderBottom: "1px solid rgba(23,18,8,.06)" }}>
                    <span className="text-xs tabular-nums mr-2" style={{ color: muted }}>{when(f.at)}</span>
                    <b className="mr-1">{f.firm}</b>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
      {q.isLoading && <p className="text-sm" style={{ color: muted }}>Loading…</p>}
    </div>
  );
}
