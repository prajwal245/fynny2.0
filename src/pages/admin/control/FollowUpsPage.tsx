import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { adminFollowUpAct, adminFollowUps } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { KIND_LABEL, type TouchKind } from "@/lib/practice/touchpoints/rules";
import { Btn, Empty, ErrorNote, Kpi, PageHead, Panel, Pill, day, ink, line, muted } from "./ui";

type Tab = "open" | "closed";
const OUTCOMES = [
  ["reached", "Reached them"],
  ["no_answer", "No answer"],
  ["not_interested", "Not interested"],
  ["needs_demo", "Wants a demo"],
  ["wrong_number", "Wrong number"],
  ["other", "Other"],
] as const;
type Outcome = (typeof OUTCOMES)[number][0];

const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES) as Record<string, string>;

export default function FollowUpsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("open");
  const [doing, setDoing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("reached");
  const [note, setNote] = useState("");
  const list = useQuery({ queryKey: ["admin", "follow-ups", tab], queryFn: () => adminCall(() => adminFollowUps({ data: { status: tab } })), placeholderData: (p) => p });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "done" | "snooze" | "dismiss" | "reopen"; outcome?: Outcome; note?: string }) => adminCall(() => adminFollowUpAct({ data: v })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "follow-ups"] });
      setDoing(null);
      setNote("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  const d = list.data;
  const top = d?.funnel[0]?.n ?? 0;

  return (
    <div>
      <PageHead title="Follow-ups" sub="People who stalled on the way to a working, paying firm, and what to say to each. A follow-up closes by itself when the person moves on." />
      <ErrorNote error={list.error} />

      {d && (
        <Panel title="The last 30 days, step by step" testId="funnel">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
            {d.funnel.map((s, i) => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: "rgba(23,18,8,.04)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: muted }}>{s.label}</div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: ink }}>{s.n}</div>
                <div className="text-xs" style={{ color: muted }}>{i === 0 ? "everyone" : top ? `${Math.round((s.n / top) * 100)}% of sign-ups` : ""}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Kpi label="Waiting for you" value={d.stats.open} hint="open follow-ups" />
            <Kpi label="Came back" value={d.stats.cameBack} hint="moved on after we reached out" />
            <Kpi label="Moved on alone" value={d.stats.movedOn} hint="before we reached out" />
            <Kpi label="Reached by a person" value={d.stats.reached} hint="marked reached" />
            <Kpi label="Emails sent" value={d.stats.emailed} hint="automatic nudges" />
          </div>
        </Panel>
      )}

      <div className="flex gap-2 mb-4" role="tablist">
        {(["open", "closed"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="rounded-full px-4 py-1.5 text-sm font-semibold" style={{ background: tab === t ? ink : "#fff", color: tab === t ? "#fff" : ink, border: `1px solid ${line}` }}>
            {t === "open" ? "To do" : "Closed (30 days)"}
          </button>
        ))}
      </div>

      {d && d.rows.length === 0 && <Empty>{tab === "open" ? "Nobody is waiting. Everyone is moving along." : "Nothing closed in the last 30 days."}</Empty>}
      <div className="grid gap-3" data-testid="follow-up-list">
        {d?.rows.map((r) => (
          <section key={r.id} className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${r.hot ? "rgba(138,30,24,.35)" : line}` }}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {r.hot && <Pill tone="bad">Hot</Pill>}
              <Pill>{KIND_LABEL[r.kind as TouchKind] ?? r.kind}</Pill>
              {r.emailSentAt && <Pill tone="good">Emailed {day(r.emailSentAt)}</Pill>}
              {r.status === "auto_resolved" && <Pill tone={r.recovered ? "good" : "info"}>{r.recovered ? "Came back after we reached out" : "Moved on by themselves"}</Pill>}
              {r.status === "done" && <Pill tone="good">{OUTCOME_LABEL[r.outcome ?? "other"]}</Pill>}
              <span className="text-xs ml-auto" style={{ color: muted }}>since {r.since}</span>
            </div>
            <p className="text-sm font-medium" style={{ color: ink }}>{r.headline}</p>
            <div className="text-xs mt-1" style={{ color: muted }}>
              {r.name ?? "No name"} · {r.phone ? `+${r.phone}` : "no phone yet"} · {r.email ?? "no email"}
              {r.whatsappOk ? " · agreed to WhatsApp" : ""}
              {r.doneBy ? ` · ${r.doneBy}` : ""}
            </div>
            {r.note && <p className="text-sm mt-2 rounded-lg px-3 py-2" style={{ background: "rgba(23,18,8,.04)" }}>{r.note}</p>}

            {tab === "open" && (
              <>
                <p className="text-sm mt-3 rounded-lg px-3 py-2" style={{ background: "rgba(23,18,8,.04)", color: ink }}>{r.script}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {r.phone && (
                    <a className="rounded-lg px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5" style={{ background: "#25D366", color: "#fff" }} href={waLink(r.phone, r.script)} target="_blank" rel="noreferrer">
                      <MessageCircle size={14} aria-hidden /> WhatsApp
                    </a>
                  )}
                  {r.phone && (
                    <a className="rounded-lg px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5" style={{ border: `1px solid ${line}`, color: ink }} href={`tel:+${r.phone.replace(/\D/g, "")}`}>
                      <Phone size={14} aria-hidden /> Call
                    </a>
                  )}
                  <Btn onClick={() => void navigator.clipboard?.writeText(r.script).then(() => toast.success("Copied"))}>
                    <Copy size={13} className="inline mr-1" aria-hidden />Copy message
                  </Btn>
                  <Btn kind="primary" onClick={() => setDoing(doing === r.id ? null : r.id)}>Mark done</Btn>
                  <Btn onClick={() => act.mutate({ id: r.id, action: "snooze" })}>Snooze 2 days</Btn>
                  <Btn kind="danger" onClick={() => act.mutate({ id: r.id, action: "dismiss" })}>Not needed</Btn>
                </div>
                {doing === r.id && (
                  <form
                    className="mt-3 grid gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act.mutate({ id: r.id, action: "done", outcome, note });
                    }}
                  >
                    <select className="rounded-lg border px-3 py-2 text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} aria-label="How did it go">
                      {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <textarea className="rounded-lg border px-3 py-2 text-sm" rows={2} placeholder="What did they say? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div><Btn type="submit" kind="primary" disabled={act.isPending}>Save</Btn></div>
                  </form>
                )}
              </>
            )}
            {tab === "closed" && (
              <div className="mt-3"><Btn onClick={() => act.mutate({ id: r.id, action: "reopen" })}>Reopen</Btn></div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
