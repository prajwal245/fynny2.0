// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BulkBar, ConfirmButton, SelectAllHeader, SelectCell, useSelection } from "../Selection";

const ids = ["a", "b", "c", "d"];
function Demo({ onConfirm = () => undefined }: { onConfirm?: () => void }) {
  const sel = useSelection(ids);
  return (
    <>
      <table>
        <thead><tr><SelectAllHeader sel={sel} total={ids.length} /></tr></thead>
        <tbody>{ids.map((id) => <tr key={id} className={sel.has(id) ? "is-selected" : ""}><SelectCell sel={sel} id={id} label={`row ${id}`} /></tr>)}</tbody>
      </table>
      <BulkBar sel={sel} total={ids.length} noun="lines"><ConfirmButton label="Discard" confirmLabel="Really?" onConfirm={onConfirm} /></BulkBar>
    </>
  );
}
afterEach(cleanup);
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe("selection on a table", () => {
  it("shows nothing until a row is ticked, then a live count and the actions", () => {
    render(<Demo />);
    expect(screen.queryByText(/selected/)).toBeNull();
    fireEvent.click(box("Select row b"));
    expect(screen.getByText("1 lines selected")).toBeTruthy();
    expect(screen.getByText("Discard")).toBeTruthy();
  });

  it("the header box is a dash for some, a tick for all, and clears when ticked again", async () => {
    render(<Demo />);
    fireEvent.click(box("Select row a"));
    expect((box("Select all 4") as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(box("Select all 4"));
    expect(screen.getByText("4 lines selected")).toBeTruthy();
    fireEvent.click(box("Clear selection"));
    await waitFor(() => expect(screen.queryByText(/selected/)).toBeNull());
  });

  it("shift-click ticks every row in between", () => {
    render(<Demo />);
    fireEvent.click(box("Select row a"));
    fireEvent.click(box("Select row c"), { shiftKey: true });
    expect(box("Select row b").checked).toBe(true);
    expect(screen.getByText("3 lines selected")).toBeTruthy();
  });

  it("Ctrl+A selects everything shown and Esc clears it", async () => {
    render(<Demo />);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByText("4 lines selected")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(/selected/)).toBeNull());
  });

  it("a destructive action asks again before it runs", () => {
    let ran = 0;
    render(<Demo onConfirm={() => ran++} />);
    fireEvent.click(box("Select row a"));
    fireEvent.click(screen.getByText("Discard"));
    expect(ran).toBe(0);
    fireEvent.click(screen.getByText("Really?"));
    expect(ran).toBe(1);
  });
});
