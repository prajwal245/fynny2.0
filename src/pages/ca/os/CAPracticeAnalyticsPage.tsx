/**
 * Practice analytics — how the firm is actually running.
 *
 * Every number here is derived from work that already happened (extractions,
 * exceptions, tasks, filings) rather than anything typed in, so it can be
 * trusted as a management view.
 */
import { useEffect, useMemo, useState } from "react";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { useCAFirmMembers } from "@/hooks/useCAFirmMembers";
import { CA, CACard, CABadge, inr } from "@/components/ca/portalUi";
import { ModuleHeader, QueueTable, StatStrip } from "@/components/ca/os/primitives";
import { loadPracticeAnalytics, type PracticeAnalytics } from "@/lib/caPractice";

const hours = (h: number | null) =>
  h == null ? "—" : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;

export default function CAPracticeAnalyticsPage() {
  const { firmId } = useCAPortal();
  const { clients } = useCAClientOptions();
  const { nameById } = useCAFirmMembers();
  const [data, setData] = useState<PracticeAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clientNames = useMemo(
    () => new Map(clients.map((c) => [c.business_id, c.client_name] as const)),
    [clients],
  );

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    setIsLoading(true);
    loadPracticeAnalytics(firmId, clientNames, nameById)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firmId, clientNames, nameById]);

  if (isLoading || !data) {
    return (
      <div>
        <ModuleHeader title="Practice analytics" subtitle="Reading the firm's work history…" />
      </div>
    );
  }

  const { turnaround, staff, clients: effort, capacity, annualisedFees, clientsWithoutEngagement } = data;

  return (
    <div>
      <ModuleHeader
        title="Practice analytics"
        subtitle="Turnaround, staff load, client effort against fee, and what the filing calendar is about to demand. All derived from work already recorded in the portal."
      />

      <StatStrip
        items={[
          { label: "Median turnaround", value: hours(turnaround.medianHours) },
          {
            label: "Awaiting review",
            value: String(turnaround.awaitingReview),
            tone: turnaround.awaitingReview ? "amber" : "green",
          },
          { label: "Stale over 7 days", value: String(turnaround.stale), tone: turnaround.stale ? "red" : "green" },
          { label: "Annualised fee book", value: inr(annualisedFees) },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        <CACard style={{ padding: 20 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 16, color: CA.ink, marginBottom: 4 }}>Turnaround</div>
          <p style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint, marginBottom: 14 }}>
            From the moment a document lands in intake to the moment it is posted to the ledger.
          </p>
          <QueueTable
            columns={["Measure", "Value"]}
            empty="Nothing posted yet"
            emptyHint="Post a document from the review queue and turnaround starts being measured."
            rows={
              turnaround.posted
                ? [
                    ["Documents posted", String(turnaround.posted)],
                    ["Median time to post", hours(turnaround.medianHours)],
                    ["Slowest document", hours(turnaround.worstHours)],
                    ["Still awaiting review", String(turnaround.awaitingReview)],
                  ]
                : []
            }
          />
        </CACard>

        <CACard style={{ padding: 20 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 16, color: CA.ink, marginBottom: 4 }}>Filing capacity</div>
          <p style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint, marginBottom: 14 }}>
            What the compliance calendar is about to demand of the team.
          </p>
          <QueueTable
            columns={["Window", "Due", "Filings"]}
            empty="No obligations on the calendar"
            emptyHint="Generate a compliance calendar from an engagement to populate this."
            rows={capacity.map((b) => [
              b.label,
              b.dueWithin,
              <CABadge key="f" tone={b.filings ? (b.label.includes("overdue") ? "red" : "amber") : "green"}>
                {b.filings}
              </CABadge>,
            ])}
          />
        </CACard>
      </div>

      <CACard style={{ padding: 20, marginTop: 20 }}>
        <div style={{ fontFamily: CA.serif, fontSize: 16, color: CA.ink, marginBottom: 4 }}>Staff load</div>
        <p style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint, marginBottom: 14 }}>
          Open exceptions each team member is carrying, and how much value is sitting behind them.
        </p>
        <QueueTable
          columns={["Team member", "Open", "Resolved", "Clearance", "Value at risk"]}
          empty="No exception ownership yet"
          emptyHint="Assign exceptions in the exception queue to see load per person."
          rows={staff.map((s) => [
            s.name,
            <CABadge key="o" tone={s.open ? "amber" : "green"}>
              {s.open}
            </CABadge>,
            String(s.resolved),
            s.clearanceRate == null ? "—" : `${s.clearanceRate}%`,
            <span key="v" style={{ fontFamily: CA.mono }}>
              {inr(s.valueAtRisk)}
            </span>,
          ])}
        />
      </CACard>

      <CACard style={{ padding: 20, marginTop: 20 }}>
        <div style={{ fontFamily: CA.serif, fontSize: 16, color: CA.ink, marginBottom: 4 }}>Client effort against fee</div>
        <p style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint, marginBottom: 14 }}>
          A low fee per document with a high exception count is the signal that an engagement is underpriced.
          {clientsWithoutEngagement > 0 && ` ${clientsWithoutEngagement} client(s) have no engagement recorded, so their fee reads as nil.`}
        </p>
        <QueueTable
          columns={["Client", "Annual fee", "Documents", "Open exceptions", "Open tasks", "Fee per document"]}
          empty="No clients yet"
          emptyHint="Add clients and engagements to compare effort against fee."
          rows={effort.map((c) => [
            c.name,
            <span key="f" style={{ fontFamily: CA.mono }}>
              {c.annualFee ? inr(c.annualFee) : <CABadge tone="amber">No engagement</CABadge>}
            </span>,
            String(c.documents),
            <CABadge key="e" tone={c.exceptions ? "amber" : "green"}>
              {c.exceptions}
            </CABadge>,
            String(c.openTasks),
            <span key="fp" style={{ fontFamily: CA.mono }}>
              {c.feePerDocument == null ? "—" : inr(c.feePerDocument)}
            </span>,
          ])}
        />
      </CACard>
    </div>
  );
}
