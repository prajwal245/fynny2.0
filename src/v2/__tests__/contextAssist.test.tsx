// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({
      location: { pathname: "/app/exceptions" },
      resolvedLocation: { pathname: "/app/exceptions" },
    }),
}));
vi.mock("framer-motion", async () => {
  const React = await import("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion: {
      div: ({
        children,
        className,
        ...rest
      }: { children: React.ReactNode; className?: string } & Record<
        string,
        unknown
      >) =>
        React.createElement(
          "div",
          { className, "data-assist": rest["data-assist"] ? "" : undefined },
          children,
        ),
    },
    useReducedMotion: () => true,
  };
});
vi.mock("@/lib/practice/practice.functions", () => ({
  askAssistant: vi.fn(async () => ({
    answer: "Open an item to see why it could not be matched.",
  })),
}));

import { ContextAssist } from "../assist/ContextAssist";
import { loadPrefs } from "../assist/assistStore";

const facts = { exceptions: 5, review: 0, chases: 0 };
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "fynhelp.assist.config",
    JSON.stringify({ idleMs: 1000, typingQuietMs: 0 }),
  );
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("ContextAssist", () => {
  it("stays quiet at first, then offers help once the screen has sat idle with work waiting", async () => {
    render(<ContextAssist facts={facts} />);
    await wait(3000);
    expect(screen.queryByText("Show me how")).toBeNull();
    await wait(6000);
    expect(screen.getByText("Show me how")).toBeTruthy();
    expect(screen.getByText(/5 items could not be matched/)).toBeTruthy();
  });
  it("does not offer when nothing is waiting", async () => {
    render(<ContextAssist facts={{ exceptions: 0, review: 0, chases: 0 }} />);
    await wait(20000);
    expect(screen.queryByText("Show me how")).toBeNull();
  });
  it("remembers 'Maybe later' and does not come back", async () => {
    render(<ContextAssist facts={facts} />);
    await wait(9000);
    fireEvent.click(screen.getByText("Maybe later"));
    expect(loadPrefs().screens["/app/exceptions"]?.dismissed).toBe(1);
    await wait(60000);
    expect(screen.queryByText("Show me how")).toBeNull();
  });
  it("turns itself off from the card", async () => {
    render(<ContextAssist facts={facts} />);
    await wait(9000);
    fireEvent.click(screen.getByText("Turn off tips"));
    expect(loadPrefs().enabled).toBe(false);
  });
  it("does not interrupt someone typing in a field", async () => {
    render(
      <>
        <input aria-label="note" />
        <ContextAssist facts={facts} />
      </>,
    );
    (screen.getByLabelText("note") as HTMLInputElement).focus();
    await wait(30000);
    expect(screen.queryByText("Show me how")).toBeNull();
  });
  it("walks through the steps and answers a follow-up question", async () => {
    render(<ContextAssist facts={facts} />);
    await wait(9000);
    fireEvent.click(screen.getByText("Show me how"));
    expect(screen.getByText(/Step 1 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText(/Step 2 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByText("Ask a question"));
    fireEvent.change(screen.getByLabelText("Your question about this screen"), {
      target: { value: "why unmatched?" },
    });
    await act(async () => {
      fireEvent.submit(
        screen
          .getByLabelText("Your question about this screen")
          .closest("form")!,
      );
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(
      screen.getByText("Open an item to see why it could not be matched."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Stop guide"));
    expect(screen.queryByText(/Step 2 of 3/)).toBeNull();
  });
});

describe("ContextAssist: the 23 Nov retest", () => {
  it("offers help when the same panel is opened and closed three times, even while the person keeps clicking", async () => {
    render(<ContextAssist facts={facts} />);
    const open = (label: string) => {
      const el = document.createElement("aside");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", label);
      document.body.appendChild(el);
      return el;
    };
    for (let i = 0; i < 3; i++) {
      const el = open("Decide");
      await wait(1000);
      fireEvent.click(document.body);
      el.remove();
      await wait(1000);
    }
    await wait(6000);
    expect(screen.getByText("Show me how")).toBeTruthy();
  });
  it("is not silenced by an ordinary banner or a loader", async () => {
    render(
      <>
        <div role="dialog" aria-label="Banner" />
        <div aria-busy="true" />
        <ContextAssist facts={facts} />
      </>,
    );
    await wait(9000);
    expect(screen.getByText("Show me how")).toBeTruthy();
  });
  it("waits while a modal panel is open", async () => {
    const m = document.createElement("aside");
    m.setAttribute("aria-modal", "true");
    document.body.appendChild(m);
    render(<ContextAssist facts={facts} />);
    await wait(30000);
    expect(screen.queryByText("Show me how")).toBeNull();
    m.remove();
  });
  it("shows a tip on request, even with tips switched off", async () => {
    localStorage.setItem(
      "fynhelp.assist.v1",
      JSON.stringify({ enabled: false, lastShownAt: null, screens: {} }),
    );
    render(<ContextAssist facts={{ exceptions: 0, review: 0, chases: 0 }} />);
    await act(async () => {
      window.dispatchEvent(new Event("fynhelp:assist-show"));
    });
    expect(screen.getByText("Show me how")).toBeTruthy();
  });
});
