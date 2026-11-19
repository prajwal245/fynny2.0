// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { ANNUAL, G1, PURCHASES, SALES } from "../../helpers/gstRealLayouts";

vi.mock("@/v2/store", () => ({ useV2: () => ({ clients: [] }) }));
vi.mock("@/lib/practice/practice.functions", () => ({ getTallyGstBooks: vi.fn() }));

import GstReturnsCheck from "@/v2/components/GstReturnsCheck";

const xlsx = (name: string, sheets: Record<string, string[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  return new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], name);
};
const upload = (container: HTMLElement, slot: number, file: File) => {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(inputs[slot]!, { target: { files: [file] } });
};

describe("GST returns check with the real Excel files", () => {
  it("cuts the full-year GSTR-1 and GSTR-3B to the month of the sales register and names the missing invoice", async () => {
    const { container } = render(<GstReturnsCheck />);
    // slots in order: sales register, GSTR-1, GSTR-3B, GSTR-2B, purchase register
    upload(container, 0, xlsx("Registers.xlsx", { "Sales Register": SALES, "Purchase Register": PURCHASES }));
    await waitFor(() => expect(screen.getByText(/Registers\.xlsx: 4 invoices, 2025-12/)).toBeTruthy());
    upload(container, 1, xlsx("GSTR-1.xlsx", { Summary: [["Summary"]], "Outward Supply Details": G1 }));
    upload(container, 2, xlsx("GSTR-3B.xlsx", { Sheet1: ANNUAL }));
    await waitFor(() => expect(screen.getByText(/GSTR-3B\.xlsx: twelve months, 2025/)).toBeTruthy());
    expect((screen.getByLabelText("Month to check") as HTMLInputElement).value).toBe("2025-12");

    const outward = screen.getByTestId("check-outward");
    expect(outward.textContent).toMatch(/Agrees/);
    const sales = screen.getByTestId("check-sales");
    expect(sales.textContent).toMatch(/Differs/);
    expect(sales.textContent).toMatch(/In GSTR-1, not in the books:/);
    expect(sales.textContent).toMatch(/SGAL\/C\/09/);
  });

  it("asks for the month, and runs nothing wrong, when only a full-year file is loaded", async () => {
    const { container } = render(<GstReturnsCheck />);
    upload(container, 2, xlsx("GSTR-3B.xlsx", { Sheet1: ANNUAL }));
    await waitFor(() => expect(screen.getByText(/Choose the month so GSTR-1 and GSTR-3B are cut to it/)).toBeTruthy());
    expect(screen.getByTestId("check-outward").textContent).toMatch(/Needs a file/);
    fireEvent.change(screen.getByLabelText("Month to check"), { target: { value: "2026-02" } });
    await waitFor(() => expect(screen.getByText(/cut to this month before every check/)).toBeTruthy());
    // a month outside the report's financial year is said, not silently ignored
    fireEvent.change(screen.getByLabelText("Month to check"), { target: { value: "2024-12" } });
    await waitFor(() => expect(screen.getByText(/has no column for 2024-12/)).toBeTruthy());
  });

  it("says plainly when a file is not what the slot needs", async () => {
    const { container } = render(<GstReturnsCheck />);
    upload(container, 2, xlsx("random.xlsx", { Sheet1: [["a", "b"]] }));
    await waitFor(() => expect(screen.queryByText(/random\.xlsx/)).toBeNull());
    expect(screen.getByTestId("check-outward").textContent).toMatch(/Needs a file/);
  });
});
