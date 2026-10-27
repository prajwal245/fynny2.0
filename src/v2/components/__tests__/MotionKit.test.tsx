// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExpandCard, PinwheelCard, Slider, StatefulButton } from "../MotionKit";

afterEach(cleanup);

describe("motion kit", () => {
  it("a stateful button shows progress, then a tick, then its label again", async () => {
    let done!: () => void;
    render(<StatefulButton label="Save changes" successMs={20} onAction={() => new Promise<void>((r) => (done = r))} />);
    const b = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(b);
    expect(b.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(b); // a second click while it works does nothing
    await act(async () => done());
    expect(screen.getByRole("button", { name: "Save changes: done" })).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(screen.getByRole("button", { name: "Save changes" }).getAttribute("aria-busy")).toBe("false");
  });

  it("a failed action returns the button to its label", async () => {
    render(<StatefulButton label="Save" onAction={async () => { throw new Error("no"); }} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("a slider reports changes live and the final value when let go", () => {
    const seen: number[] = [];
    const final: number[] = [];
    render(<Slider label="Chase day" min={3} max={15} value={5} onChange={(n) => seen.push(n)} onCommit={(n) => final.push(n)} format={(n) => `Day ${n}`} />);
    const s = screen.getByRole("slider", { name: "Chase day" });
    fireEvent.change(s, { target: { value: "9" } });
    fireEvent.keyUp(s, { key: "ArrowRight" });
    expect(seen).toEqual([9]);
    expect(final.length).toBe(1);
    expect(screen.getByText("Day 5")).toBeTruthy();
  });

  it("an expand card opens and closes with its plus", () => {
    render(<ExpandCard title="How it works">The detail.</ExpandCard>);
    const plus = screen.getByRole("button", { name: "Open How it works" });
    expect(screen.queryByText("The detail.")).toBeNull();
    fireEvent.click(plus);
    expect(screen.getByText("The detail.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close How it works" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("a pinwheel card carries its message and action", () => {
    render(<PinwheelCard title="Add your first client" action={<button>Add client</button>}>Documents appear here.</PinwheelCard>);
    expect(screen.getByTestId("pinwheel-card").textContent).toContain("Documents appear here.");
    expect(screen.getByRole("button", { name: "Add client" })).toBeTruthy();
  });
});
