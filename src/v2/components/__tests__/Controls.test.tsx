// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox, Disclosure, Field, SettingRow, Tip, Toggle } from "../Controls";

afterEach(cleanup);

function Demo() {
  const [on, setOn] = useState(false);
  return (
    <SettingRow title="Run Recon automatically" description="Matches without a button press." tip="Matching never uses AI.">
      <Toggle label="Run Recon automatically" checked={on} onChange={setOn} />
    </SettingRow>
  );
}

describe("shared form controls", () => {
  it("a toggle is a switch that flips and says its state", () => {
    render(<Demo />);
    const sw = screen.getByRole("switch", { name: "Run Recon automatically" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("detail lives in a tip, not on the page, and a tap opens it", () => {
    render(<Tip>Scans go through text recognition.</Tip>);
    const btn = screen.getByRole("button", { name: "More detail" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("tooltip").textContent).toContain("text recognition");
  });

  it("a disclosure stays folded until opened", () => {
    render(<Disclosure label="Connection check">the raw log</Disclosure>);
    const b = screen.getByRole("button", { name: /Connection check/ });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });

  it("a field shows its hint, and an error instead of it", () => {
    const { rerender } = render(<Field label="Mobile" hint="Never shared."><input /></Field>);
    expect(screen.getByText("Never shared.")).toBeTruthy();
    rerender(<Field label="Mobile" hint="Never shared." error="Enter a valid number."><input /></Field>);
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid number.");
    expect(screen.queryByText("Never shared.")).toBeNull();
  });

  it("a checkbox carries its sentence and reports changes", () => {
    let v = false;
    render(<Checkbox checked={v} onChange={(x) => (v = x)}>Setup tips on WhatsApp.</Checkbox>);
    fireEvent.click(screen.getByLabelText("Setup tips on WhatsApp."));
    expect(v).toBe(true);
  });
});
