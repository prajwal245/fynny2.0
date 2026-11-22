import { useMemo, useState } from "react";
import { ArrowRight, Bot, UserRound } from "lucide-react";
import { Badge, Card, Segmented, V } from "../ui";
import {
  nextActionFromSteps,
  rankPortfolio,
  type NextAction,
  type Owner,
} from "@/lib/practice/agents/conductor";
import { formatDate } from "../ui";
import type { StepState } from "@/lib/practice/close/steps";

export interface NeedsYouRow {
  businessId: string;
  name: string;
  period: string;
  steps: StepState[];
  bankLines?: number;
}
type Who = "team" | "client" | "all";
const OWNER_LABEL: Record<Owner, string> = {
  agent: "FynHelp",
  junior: "Junior",
  manager: "Manager",
  partner: "Partner",
  client: "Client",
};
const SHOWN = 6;

/** The next step for every client, most overdue first, and who has it. Read-only: it changes nothing and sends nothing. */
export function NeedsYou({
  rows,
  now = new Date(),
  onOpen,
}: {
  rows: NeedsYouRow[];
  now?: Date;
  onOpen: (businessId: string) => void;
}) {
  const [who, setWho] = useState<Who>("team");
  const [all, setAll] = useState(false);
  const actions = useMemo(
    () =>
      rankPortfolio(
        rows.map((r) =>
          nextActionFromSteps(
            { clientId: r.businessId, clientName: r.name, period: r.period },
            r.steps,
            { bankLines: r.bankLines ?? 1 },
            now,
          ),
        ),
      ),
    [rows, now],
  );
  const open = actions.filter((a) => a.urgency !== "done");
  const byAgent = open.filter((a) => a.owner === "agent").length;
  const team = (a: NextAction) =>
    a.owner === "junior" || a.owner === "manager" || a.owner === "partner";
  const list = open.filter((a) =>
    who === "all"
      ? a.owner !== "agent"
      : who === "team"
        ? team(a)
        : a.owner === "client",
  );
  const shown = all ? list : list.slice(0, SHOWN);
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginBottom: 20 }} data-testid="needs-you">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            What needs a person
          </div>
          <div style={{ fontSize: 12.5, color: V.muted, marginTop: 2 }}>
            The next step for each client, most overdue first.
            {byAgent ? ` FynHelp is working on ${byAgent} more.` : ""}
          </div>
        </div>
        <Segmented
          label="Whose turn"
          value={who}
          onChange={(v) => {
            setWho(v);
            setAll(false);
          }}
          options={[
            {
              value: "team",
              label: "My team",
              count: open.filter(team).length,
            },
            {
              value: "client",
              label: "Waiting on client",
              count: open.filter((a) => a.owner === "client").length,
            },
            {
              value: "all",
              label: "Everyone",
              count: open.filter((a) => a.owner !== "agent").length,
            },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 13.5, color: V.muted, padding: "10px 0" }}>
          Nothing waiting here. Every open step is with someone else or being
          handled.
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((a) => (
            <li key={a.clientId + a.period}>
              <button
                type="button"
                onClick={() => onOpen(a.clientId)}
                aria-label={`${a.clientName}: ${a.action}`}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: 0,
                  borderTop: `1px solid ${V.line}`,
                  padding: "11px 2px",
                  cursor: "pointer",
                  font: "inherit",
                  color: "inherit",
                }}
              >
                <span aria-hidden style={{ color: V.muted, display: "flex" }}>
                  {a.owner === "agent" ? (
                    <Bot size={16} />
                  ) : (
                    <UserRound size={16} />
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{a.clientName}</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: V.body,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.action}
                  </span>
                  {a.blockedOn && (
                    <span
                      style={{ display: "block", fontSize: 12, color: V.muted }}
                    >
                      {a.blockedOn}
                    </span>
                  )}
                </span>
                <Badge
                  tone={
                    a.urgency === "overdue"
                      ? "bad"
                      : a.urgency === "due_soon"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {a.urgency === "overdue"
                    ? `${a.daysLate} day${a.daysLate === 1 ? "" : "s"} late`
                    : a.dueOn
                      ? `Due ${formatDate(a.dueOn)}`
                      : "On track"}
                </Badge>
                <span style={{ fontSize: 12, color: V.muted, minWidth: 54 }}>
                  {OWNER_LABEL[a.owner]}
                </span>
                <ArrowRight size={14} aria-hidden style={{ color: V.muted }} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((x) => !x)}
          style={{
            marginTop: 8,
            background: "none",
            border: 0,
            color: V.brand,
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
          }}
        >
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </Card>
  );
}
