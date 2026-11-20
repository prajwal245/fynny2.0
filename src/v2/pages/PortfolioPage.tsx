import {
  FirstCloseCard,
  useFirstCloseSteps,
} from "../components/FirstCloseGuide";
import { useEffect, useState } from "react";
import { PanelRight, PanelRightClose, Plus } from "lucide-react";
import { PageHeader } from "../ui";
import { PinwheelCard } from "../components/MotionKit";
import { monthOf, useV2 } from "../store";
import { PortfolioOverview } from "../components/PortfolioOverview";
import { rowOf } from "../lib/portfolioView";
import {
  AgentActivity,
  NeedsYou,
  SetupChecklist,
  TODAY_STYLES,
  agentSummary,
  greeting,
  useNeedsYou,
} from "../components/Today";
import AddClientModal from "../components/AddClientModal";
import { openExceptionsIn } from "../lib/exceptions";
import { ValueCard } from "../components/ValueCard";

const PANEL_KEY = "fynhelp.v2.homepanel";

/** The side panel (setup and agent activity): open by default on a wide screen, closed on a narrow one, and the choice is remembered. */
function usePanel(setUp: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(!setUp);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PANEL_KEY);
      setOpen(saved === null ? !setUp && window.innerWidth > 1100 : saved === "1");
    } catch {
      /* private mode: keep the default */
    }
  }, [setUp]);
  const toggle = () =>
    setOpen((o) => {
      try {
        window.localStorage.setItem(PANEL_KEY, o ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !o;
    });
  return [open, toggle];
}

export default function PortfolioPage() {
  const {
    clients,
    docs,
    review,
    exceptions,
    chases,
    runs,
    period,
    closeStateFor,
    session,
    agentRuns,
    partnerView,
    setChaseStatus,
  } = useV2();
  const needs = useNeedsYou();
  const guide = useFirstCloseSteps();
  const [adding, setAdding] = useState(false);
  const [panel, togglePanel] = usePanel(guide.done >= guide.steps.length);

  // Same month as the sidebar badge and the queue.
  const openEx = openExceptionsIn(exceptions, monthOf, period);
  const openRev = review.filter((r) => r.status === "open");
  const openChase = chases.filter((c) => c.status !== "Resolved");
  const closes = Object.fromEntries(
    clients.map((c) => [c.id, closeStateFor(c.id)]),
  );
  const rows = clients.map((c) =>
    rowOf(c, closes[c.id]!, {
      exceptions: openEx.filter((e) => e.clientId === c.id).length,
      review: openRev.filter((r) => r.clientId === c.id).length,
      chases: openChase.filter((h) => h.clientId === c.id).length,
    }),
  );

  return (
    <>
      <style>{TODAY_STYLES}</style>
      <PageHeader
        title={greeting(session?.name ?? "")}
        subtitle={
          clients.length
            ? `${agentSummary(agentRuns, needs.length)} Closing ${period}.`
            : "Add a client and the agents take it from there."
        }
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {clients.length > 0 && (
              <button
                className="v2-btn v2-btn-ghost"
                onClick={togglePanel}
                aria-pressed={panel}
                aria-label={
                  panel
                    ? "Hide the setup and activity panel"
                    : "Show the setup and activity panel"
                }
                title={
                  panel ? "Hide the activity panel" : "Show the activity panel"
                }
                data-testid="panel-toggle"
              >
                {panel ? (
                  <PanelRightClose size={15} />
                ) : (
                  <PanelRight size={15} />
                )}{" "}
                Activity
              </button>
            )}
            <button
              className="v2-btn v2-btn-primary"
              onClick={() => setAdding(true)}
            >
              <Plus size={15} /> Add client
            </button>
          </div>
        }
      />

      {clients.length > 0 && <ValueCard period={period} />}

      {clients.length === 0 ? (
        <PinwheelCard
          title="Add your first client to get started"
          action={
            <button
              className="v2-btn v2-btn-primary"
              onClick={() => setAdding(true)}
            >
              <Plus size={15} /> Add client
            </button>
          }
        >
          Once a client is added, their documents, reconciliation exceptions and
          MIS reports appear here, and the agents take it from there.
        </PinwheelCard>
      ) : (
        <>
          <div
            className="today-grid"
            data-panel={panel ? "open" : "closed"}
            style={{ marginBottom: 26 }}
          >
            <div className="today-main">
              <PortfolioOverview
                after={<NeedsYou items={needs} role={partnerView ? "Partner" : "Junior"} onResolveChase={(id) => setChaseStatus(id, "Resolved")} />}
                rows={rows}
                closes={closes}
                period={period}
                totals={{
                  exceptions: openEx.length,
                  review: openRev.length,
                  chases: openChase.length,
                }}
              />
            </div>
            {panel && (
              <aside
                className="today-aside"
                aria-label="Setup and agent activity"
              >
                {guide.done < guide.steps.length ? (
                  <FirstCloseCard />
                ) : (
                  <SetupChecklist />
                )}
                <AgentActivity runs={agentRuns} onClose={togglePanel} />
              </aside>
            )}
          </div>
        </>
      )}

      <AddClientModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
