// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/practice/practice.functions", () => ({ getPracticeWhatsappTemplates: async () => ({ test: false, shared: true, stages: [] }) }));
vi.mock("../../store", () => ({ useV2: () => ({ firm: { name: "Rao & Co" } }) }));

// jsdom has no IntersectionObserver; the shimmering text uses one to start when it scrolls into view.
vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });

import { AgentTabs } from "../AgentTabs";
import { AgentRunSteps } from "../AgentRunSteps";

afterEach(cleanup);

const TABS = [
  { key: "number", label: "Number", badge: { tone: "warn" as const } },
  { key: "messages", label: "Messages", badge: { text: "2/3", tone: "info" as const } },
  { key: "rules", label: "Rules" },
  { key: "check", label: "Check" },
];
function Harness() {
  const [v, setV] = useState("number");
  return (
    <>
      <AgentTabs label="WhatsApp settings" tabs={TABS} value={v} onChange={setV} />
      <div data-testid="now">{v}</div>
    </>
  );
}

describe("agent tabs", () => {
  it("is one tab list with the chosen tab selected, and shows the badges", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Number", "Messages2/3", "Rules", "Check"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");
  });

  it("moves with the arrow keys, wraps round, and jumps with Home and End", () => {
    render(<Harness />);
    const sel = () => screen.getByTestId("now").textContent;
    fireEvent.keyDown(screen.getByRole("tab", { name: "Number" }), { key: "ArrowRight" });
    expect(sel()).toBe("messages");
    fireEvent.keyDown(screen.getByRole("tab", { name: /Messages/ }), { key: "End" });
    expect(sel()).toBe("check");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Check" }), { key: "ArrowRight" });
    expect(sel()).toBe("number");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Number" }), { key: "ArrowLeft" });
    expect(sel()).toBe("check");
    fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
    expect(sel()).toBe("rules");
  });
});

const STEPS = [
  { label: "Number in use", ok: true, detail: "FynHelp's shared number." },
  { label: "Reminder 2 template", ok: null, detail: "In review; the older one is used." },
  { label: "Final template", ok: false, detail: "Nothing to send." },
];

describe("agent run steps", () => {
  it("says what the agent is doing while it works, and shows no results yet", () => {
    render(<AgentRunSteps agent="chaser" working workingText="Chaser is checking your WhatsApp connection…" steps={null} />);
    expect(screen.getByTestId("agent-run").getAttribute("data-state")).toBe("running");
    expect(screen.getByTestId("agent-run").textContent).toContain("Chaser is checking your WhatsApp connection");
    expect(screen.queryByRole("status")?.textContent ?? "").toBe("");
  });

  it("reveals the real results one by one, then the verdict, and ends in the right state", async () => {
    render(<AgentRunSteps agent="chaser" working={false} workingText="" steps={STEPS} verdict={{ ok: false, text: "Fix the items marked and check again." }} stepMs={20} />);
    // The first result arrives before the last.
    await waitFor(() => expect(screen.getByText(/FynHelp's shared number/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Nothing to send/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText("Fix the items marked and check again.").length).toBeGreaterThan(0));
    expect(screen.getByTestId("agent-run").getAttribute("data-state")).toBe("failed");
    // Order is the order of the checks.
    const text = screen.getByRole("status").textContent ?? "";
    expect(text.indexOf("Number in use")).toBeLessThan(text.indexOf("Reminder 2 template"));
    expect(text.indexOf("Reminder 2 template")).toBeLessThan(text.indexOf("Final template"));
  });

  it("a passing check ends in the success state", async () => {
    render(<AgentRunSteps agent="chaser" working={false} workingText="" steps={[STEPS[0]]} verdict={{ ok: true, text: "WhatsApp is ready to send and receive." }} stepMs={10} />);
    await waitFor(() => expect(screen.getByTestId("agent-run").getAttribute("data-state")).toBe("succeeded"));
  });
});
