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
