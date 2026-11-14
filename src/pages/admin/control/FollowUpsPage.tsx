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

const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

type Delivery = {
  emailConnected: boolean;
  touchpoints: { at: string; opened: number | null; emailed: number | null; whatsapped: number | null } | null;
  lifecycle: { at: string; checked: number | null; sent: number | null; errors: number | null } | null;
  lifecycleEmails30: number;
};

/** Whether the hourly job is firing and whether email can leave the server, so "nothing was sent" has a reason. */
function DeliveryHealth({ d }: { d: Delivery }) {
  const hoursAgo = d.touchpoints ? (Date.now() - new Date(d.touchpoints.at).getTime()) / 3_600_000 : null;
  const tickOk = hoursAgo != null && hoursAgo <= 3;
  const rows: { ok: boolean | null; label: string; detail: string }[] = [
    {
      ok: tickOk,
      label: "Hourly job",
      detail: d.touchpoints
        ? tickOk
          ? `Last ran ${ist(d.touchpoints.at)} IST (opened ${d.touchpoints.opened ?? 0}, emailed ${d.touchpoints.emailed ?? 0}, WhatsApp ${d.touchpoints.whatsapped ?? 0}). It sends only between 9 am and 8 pm IST.`
          : `Last ran ${ist(d.touchpoints.at)} IST, which is a long time ago. The 15-minute job in Supabase is not calling the site: check that the ca_cron_secret secret exists in Vault and the job ca-poll-gmail-15min is scheduled.`
        : "It has never run. The 15-minute job in Supabase is not calling the site: check the ca_cron_secret secret in Vault and the job ca-poll-gmail-15min.",
    },
    {
      ok: d.emailConnected,
      label: "Email",
      detail: d.emailConnected ? "The email provider is connected." : "No email provider is connected, so no email leaves the server at all. Add RESEND_API_KEY (and PRACTICE_FROM_EMAIL) in Vercel and redeploy.",
    },
    {
      ok: d.lifecycleEmails30 > 0 ? true : null,
      label: "Nudge emails",
      detail: `${d.lifecycleEmails30} sent in the last 30 days (upload nudges, trial reminders, recaps). These are separate from the follow-up emails counted above, and every one is recorded.`,
    },
  ];
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-start gap-2 text-sm">
          <Pill tone={r.ok === true ? "good" : r.ok === false ? "bad" : "info"}>{r.ok === true ? "OK" : r.ok === false ? "Check" : "Nothing yet"}</Pill>
          <b>{r.label}</b>
          <span style={{ color: muted }}>{r.detail}</span>
        </div>
      ))}
    </div>
  );
}

export default function FollowUpsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("open");
  const [doing, setDoing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("reached");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const list = useQuery({ queryKey: ["admin", "follow-ups", tab], queryFn: () => adminCall(() => adminFollowUps({ data: { status: tab } })), placeholderData: (p) => p });
  // Reads the templates from Meta now, not from the list kept for a few minutes.
  const checkAgain = async () => {
    setChecking(true);
    try {
      const fresh = await adminCall(() => adminFollowUps({ data: { status: tab, refresh: true } }));
      qc.setQueryData(["admin", "follow-ups", tab], fresh);
      toast.success("Read the templates from WhatsApp just now.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check.");
    } finally {
      setChecking(false);
    }
  };
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
            <Kpi label="Follow-up emails" value={d.stats.emailed} hint="sent for unfinished sign-ups and unpaid plans only" />
            <Kpi label="WhatsApp sent" value={d.stats.whatsapped} hint="to people who agreed" />
            <Kpi label="Asked for a call" value={d.stats.asked} hint="tapped Call me or wrote back" />
          </div>
        </Panel>
      )}

      {d && (
        <Panel title="Is it running?" testId="delivery-health">
          <DeliveryHealth d={d.delivery} />
        </Panel>
      )}

      {d && (
        <Panel title="WhatsApp follow-ups" testId="wa-ready" action={<Btn disabled={checking} onClick={() => void checkAgain()} testId="wa-check-again">{checking ? "Checking…" : "Check again"}</Btn>}>
          {d.whatsapp.problem ? (
            <p className="text-sm" style={{ color: muted }}>{d.whatsapp.problem} Until then follow-ups go by email and by a person.</p>
          ) : (
            <div className="grid gap-2">
              {d.whatsapp.templates.map((t) => (
                <div key={t.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={t.ok ? (t.marketing ? "warn" : "good") : "bad"}>{t.ok ? (t.marketing ? "Sending, Marketing rate" : "Ready") : "Not ready"}</Pill>
                  <code>{t.name}</code>
                  {!t.ok && <span style={{ color: muted }}>{t.why}. Messages that need it wait and are left to a person. Submit <code>{t.submitName}</code> as Utility (wording in the guide).</span>}
                  {t.ok && t.marketing && <span style={{ color: muted }}>Meta classed this as Marketing, so each message costs more. Submit <code>{t.submitName}</code> as Utility and it is used automatically once approved.</span>}
                </div>
              ))}
            </div>
          )}
          {d.whatsapp.account && (
            <details className="mt-3 text-xs" data-testid="wa-found">
              <summary className="cursor-pointer" style={{ color: muted }}>
                What WhatsApp returned for account {d.whatsapp.account}: {d.whatsapp.found.length} FynHelp template{d.whatsapp.found.length === 1 ? "" : "s"} of {d.whatsapp.totalTemplates}, language {d.whatsapp.language}
              </summary>
              {d.whatsapp.found.length === 0 ? (
                <p className="mt-1" style={{ color: muted }}>No template starting with fh_ is on this account. If you created them, they are on a different WhatsApp Business Account than WHATSAPP_WABA_ID points to, or the token cannot see them.</p>
              ) : (
                <ul className="mt-1 grid gap-0.5">
                  {d.whatsapp.found.map((t) => (
                    <li key={`${t.name}-${t.language}`} className="flex flex-wrap gap-2"><code>{t.name}</code><span>{t.language}</span><Pill tone={t.status.toUpperCase() === "APPROVED" ? "good" : "warn"}>{t.status.toLowerCase()}</Pill><span style={{ color: muted }}>{(t.category ?? "").toLowerCase()}</span></li>
                  ))}
                </ul>
              )}
            </details>
          )}
          {d.whatsapp.ready && !d.whatsapp.marketingAllowed && (
            <p className="text-xs mt-2" style={{ color: "#92400e" }} data-testid="wa-marketing-off">Marketing templates are switched off here (WHATSAPP_TOUCH_ALLOW_MARKETING is set to off in Vercel), so a template Meta classed as Marketing waits for a person. Remove that setting to let it send at the Marketing rate.</p>
          )}
          <p className="text-xs mt-3" style={{ color: muted }}>Sent only to people who agreed to WhatsApp, about their own set-up, trial, plan, documents or results, 9 am to 8 pm IST, at most once in 3 days. Each message has Call me, Not now and Stop messages buttons.</p>
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
              {r.callbackRequested && <Pill tone="bad">{r.replied ? "Replied: call back today" : "Asked for a call"}</Pill>}
              {r.emailSentAt && <Pill tone="good">Emailed {day(r.emailSentAt)}</Pill>}
              {r.whatsappSentAt && <Pill tone="good">WhatsApp {day(r.whatsappSentAt)}</Pill>}
              {r.whatsappError && <Pill tone="warn">WhatsApp stopped: {r.whatsappError}</Pill>}
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
