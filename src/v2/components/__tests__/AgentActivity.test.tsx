// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../store", () => ({ useV2: () => ({ clientName: (id: string) => (id === "c1" ? "Sun International" : "") }) }));

import { AgentActivity, TODAY_STYLES } from "../Today";

afterEach(cleanup);
const run = (i: number) => ({ id: `r${i}`, agent: "recon", clientId: "c1", status: "succeeded", summary: `Recon ran ${i}`, trigger: "automatic", at: new Date().toISOString() }) as never;

describe("agent activity on the home page", () => {
  it("can be hidden from the panel itself", () => {
    const close = vi.fn();
    render(<AgentActivity runs={[run(1)]} onClose={close} />);
    fireEvent.click(screen.getByLabelText("Hide agent activity"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("has no close button when it is not in a closable panel", () => {
    render(<AgentActivity runs={[run(1)]} />);
    expect(screen.queryByLabelText("Hide agent activity")).toBeNull();
  });

  it("keeps a long feed inside a scroll area, and the panel in view while the page scrolls", () => {
    const { container } = render(<AgentActivity runs={Array.from({ length: 7 }, (_, i) => run(i))} />);
    expect(container.querySelector(".today-feed")).toBeTruthy();
    expect(TODAY_STYLES).toMatch(/\.today-feed \{[^}]*max-height:min\(46vh/);
    expect(TODAY_STYLES).toMatch(/\.today-aside \{[^}]*position:sticky/);
    expect(TODAY_STYLES).toMatch(/\.today-grid\[data-panel="closed"\]/);
  });
});
