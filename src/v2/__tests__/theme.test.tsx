// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { V, V2_STYLES, useV2Theme } from "../ui";

function Probe() {
  const [mode, toggle] = useV2Theme();
  return <button onClick={toggle}>{mode}</button>;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("light and dark themes", () => {
  it("starts in light and switches to dark and back, remembering the choice", () => {
    render(<Probe />);
    expect(document.documentElement.getAttribute("data-v2-theme")).toBe("light");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-v2-theme")).toBe("dark");
    expect(window.localStorage.getItem("fynhelp-theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-v2-theme")).toBe("light");
  });

  it("opens in dark for someone who chose it before", () => {
    window.localStorage.setItem("fynhelp-theme", "dark");
    render(<Probe />);
    expect(document.documentElement.getAttribute("data-v2-theme")).toBe("dark");
  });

  it("defines every colour for both themes", () => {
    const light = V2_STYLES.split(':root[data-v2-theme="dark"]')[0];
    const dark = V2_STYLES.split(':root[data-v2-theme="dark"]')[1].split("}")[0];
    for (const name of Object.values(V).filter((v) => typeof v === "string" && v.startsWith("var(--v2-")).map((v) => (v as string).slice(4, -1))) {
      expect(light).toContain(`${name}:`);
      expect(dark).toContain(`${name}:`);
    }
  });
});
