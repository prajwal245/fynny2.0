import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  forgetPracticeMemory,
  getPracticeMemory,
  getPracticePipelineSettings,
  updatePracticePipelineSettings,
} from "@/lib/practice/practice.functions";
import { Badge, Card, V, formatDate } from "../ui";
import { RowSkeleton } from "../agents";
import { SettingRow, Toggle } from "./Controls";
import { ExpandCard, Slider } from "./MotionKit";
import { useV2 } from "../store";

type MemoryData = Awaited<ReturnType<typeof getPracticeMemory>>;
type Pipeline = Awaited<ReturnType<typeof getPracticePipelineSettings>>;

const errMsg = (e: unknown) => (e instanceof Error && e.message && e.message !== "[object Object]" ? e.message : typeof e === "string" ? e : "Something went wrong. Please try again.");

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: 12,
  alignItems: "center",
  background: V.gray,
  borderRadius: 14,
  padding: "12px 14px",
};

/** Settings: how the agents hand work to each other, and what they have learned. */
export function AgentSettings() {
  const { clientName, partnerView } = useV2();
  const getMemory = useServerFn(getPracticeMemory);
  const forget = useServerFn(forgetPracticeMemory);
  const getPipeline = useServerFn(getPracticePipelineSettings);
  const savePipeline = useServerFn(updatePracticePipelineSettings);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([getMemory(), getPipeline()]);
      setMemory(m);
      setPipeline(p);
      setDay(p.auto_chase_day ?? null);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [getMemory, getPipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: { auto_recon?: boolean; auto_chase_day?: number | null }) => {
    setBusy("pipeline");
    try {
      const next = await savePipeline({ data: patch });
      setPipeline(next);
      setDay(next.auto_chase_day ?? null);
      toast.success("Automation saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const drop = async (kind: "lesson" | "alias", id: string) => {
    setBusy(id);
    try {
      await forget({ data: { kind, id } });
      toast.success("Forgotten. The agent will ask a person again next time.");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const partner = partnerView;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <ExpandCard title="How your agents work together" summary="Four agents hand the month to each other. A person decides at the end.">
          <b>Extract</b> reads each document. <b>Recon</b> matches the bank to the books and lists what is left. <b>Narrate</b> drafts the MIS from the matched lines. <b>Chaser</b> asks clients for what is missing. Nothing is signed off until a partner has reviewed it.
        </ExpandCard>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15.5, marginBottom: 4 }}>Automation</h3>
        <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 14px" }}>
          What the agents do on their own. Nothing is signed off without a person.
        </p>
        {!pipeline ? (
          <RowSkeleton />
        ) : (
          <div>
            <SettingRow title="Run Recon automatically" description="As soon as a month has its bank statement and its books, Recon matches it without anyone pressing a button." tip="Matching never uses AI, and the MIS always waits for a person to review it.">
              <span style={{ fontSize: 12.5, color: V.muted }}>{pipeline.auto_recon ? "On" : "Off"}</span>
              <Toggle label="Run Recon automatically" checked={pipeline.auto_recon} disabled={!partner || busy === "pipeline"} onChange={(v) => save({ auto_recon: v })} />
            </SettingRow>
            <SettingRow title="Chase missing bank statements" description="If a client has not sent last month's statement by this day, the Chaser opens a chase and follows up for you.">
              <Toggle label="Chase missing bank statements" checked={pipeline.auto_chase_day != null} disabled={!partner || busy === "pipeline"} onChange={(v) => { setDay(v ? 5 : null); void save({ auto_chase_day: v ? 5 : null }); }} />
              <Slider
                label="Chase day of the month"
                min={3}
                max={15}
                value={day ?? 5}
                disabled={!partner || busy === "pipeline" || day == null}
                onChange={setDay}
                onCommit={(n) => void save({ auto_chase_day: n })}
                format={(n) => `By the ${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`}
              />
            </SettingRow>
            {!partner && (
              <div style={{ fontSize: 12.5, color: V.muted, paddingTop: 8 }}>Only a partner can change these. Switch to Partner under "Working as" if you are one.</div>
            )}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15.5, marginBottom: 4 }}>Agent memory</h3>
        <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 14px" }}>
          What the agents learned from your team. Corrections made in the Review Queue settle the same line automatically next month. Manual matches between differently named parties teach Recon an alias. Forget anything that is wrong.
        </p>
        {!memory ? (
          <RowSkeleton />
        ) : memory.lessons.length === 0 && memory.aliases.length === 0 ? (
          <div style={{ fontSize: 13, color: V.body }}>
            Nothing learned yet. Confirm or correct a line in the Review Queue, or match an exception by hand, and it will appear here.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {memory.lessons.map((m) => {
              const lesson = m.lesson as { direction?: string; counterparty?: string; description?: string; action?: string; note?: string };
              // Recon decisions are stored as "side:direction:pattern"; extract lessons as the pattern.
              const decision = (m as { kind?: string }).kind === "recon_decision";
              const [side, , ...rest] = decision ? m.pattern.split(":") : [];
              const pattern = decision ? rest.join(":") : m.pattern;
              return (
                <div key={m.id} style={row} data-memory={decision ? "decision" : "lesson"}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {decision ? `${side === "books" ? "Book entries" : "Bank lines"} like “${pattern}”` : <>Lines like “{pattern}”</>}
                      <span style={{ fontWeight: 400, color: V.muted }}> · {clientName(m.business_id)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                      {decision ? (
                        <>
                          Recon proposes: {lesson.action === "ignore" ? "Ignore" : "Reconciled elsewhere"}
                          {lesson.note ? ` · “${lesson.note}”` : ""}
                        </>
                      ) : (
                        <>
                          {lesson.direction === "out" ? "Money out" : "Money in"}
                          {lesson.counterparty ? `, party ${lesson.counterparty}` : ""}
                          {lesson.description ? `, described as “${lesson.description}”` : ""}
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <Badge>Taught {m.times_taught}×</Badge>
                      <Badge tone={m.times_applied ? "good" : "neutral"}>Used {m.times_applied}×</Badge>
                      {m.last_applied_at && <Badge>Last used {formatDate(m.last_applied_at)}</Badge>}
                    </div>
                  </div>
                  <button className="v2-btn v2-btn-quiet" disabled={busy === m.id} onClick={() => drop("lesson", m.id)}>
                    Forget
                  </button>
                </div>
              );
            })}
            {memory.aliases.map((a) => (
              <div key={a.id} style={row} data-memory="alias">
                <div>
                  <div style={{ fontWeight: 600 }}>
                    “{a.alias}” is “{a.canonical}”
                  </div>
                  <div style={{ fontSize: 12.5, color: V.muted, marginTop: 3 }}>
                    Recon alias · {a.source === "learned" ? "learned from a manual match" : "added by hand"} · {formatDate(a.created_at)}
                  </div>
                </div>
                <button className="v2-btn v2-btn-quiet" disabled={busy === a.id} onClick={() => drop("alias", a.id)}>
                  Forget
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
