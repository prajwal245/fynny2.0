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
import { useV2 } from "../store";

type MemoryData = Awaited<ReturnType<typeof getPracticeMemory>>;
type Pipeline = Awaited<ReturnType<typeof getPracticePipelineSettings>>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  const { clientName, canSignOff } = useV2();
  const getMemory = useServerFn(getPracticeMemory);
  const forget = useServerFn(forgetPracticeMemory);
  const getPipeline = useServerFn(getPracticePipelineSettings);
  const savePipeline = useServerFn(updatePracticePipelineSettings);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([getMemory(), getPipeline()]);
      setMemory(m);
      setPipeline(p);
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
      setPipeline(await savePipeline({ data: patch }));
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

  const partner = canSignOff;

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15.5, marginBottom: 4 }}>Automation</h3>
        <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 14px" }}>
          How the agents hand work to each other. Narrate always waits for a person, and matching never uses AI.
        </p>
        {!pipeline ? (
          <RowSkeleton />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={row}>
              <div>
                <div style={{ fontWeight: 600 }}>Run Recon automatically</div>
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                  As soon as a month has both the bank statement and the books, Recon matches it without anyone pressing a button.
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  aria-label="Run Recon automatically"
                  checked={pipeline.auto_recon}
                  disabled={!partner || busy === "pipeline"}
                  onChange={(e) => save({ auto_recon: e.target.checked })}
                />
                {pipeline.auto_recon ? "On" : "Off"}
              </label>
            </div>
            <div style={row}>
              <div>
                <div style={{ fontWeight: 600 }}>Chase missing bank statements</div>
                <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                  If a client has not sent last month's bank statement by this day, Chaser opens a chase and emails them on the usual Day 0, 3, 7 schedule.
                </div>
              </div>
              <select
                className="v2-input"
                aria-label="Chase day"
                style={{ width: "auto" }}
                value={pipeline.auto_chase_day ?? ""}
                disabled={!partner || busy === "pipeline"}
                onChange={(e) => save({ auto_chase_day: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Off</option>
                {[3, 5, 7, 10, 15].map((d) => (
                  <option key={d} value={d}>
                    By the {d}th
                  </option>
                ))}
              </select>
            </div>
            {!partner && (
              <div style={{ fontSize: 12.5, color: V.muted }}>Only a partner can change these.</div>
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
              const lesson = m.lesson as { direction?: string; counterparty?: string; description?: string };
              return (
                <div key={m.id} style={row} data-memory="lesson">
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      Lines like “{m.pattern}”
                      <span style={{ fontWeight: 400, color: V.muted }}> · {clientName(m.business_id)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>
                      {lesson.direction === "out" ? "Money out" : "Money in"}
                      {lesson.counterparty ? `, party ${lesson.counterparty}` : ""}
                      {lesson.description ? `, described as “${lesson.description}”` : ""}
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
