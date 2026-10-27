// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WhatsappPreview } from "../WhatsappPreview";

afterEach(cleanup);

describe("WhatsApp preview", () => {
  it("shows the message the client gets and the four buttons", () => {
    render(<WhatsappPreview clientName="Acme Traders" contact="Asha" item="Bank statement" firmName="Rao & Co" />);
    const box = screen.getByTestId("whatsapp-preview");
    expect(box.textContent).toContain("Hello Asha, this is Rao & Co. For Acme Traders we are still waiting for: Bank statement.");
    for (const label of ["Upload documents", "Sending today", "Need more time", "Stop reminders"]) expect(box.textContent).toContain(label);
  });

  it("switches wording for the day 3 and day 7 reminders", () => {
    render(<WhatsappPreview clientName="Acme" contact="Asha" item="Invoice" firmName="Rao & Co" />);
    fireEvent.click(screen.getByRole("tab", { name: "Day 3" }));
    expect(screen.getByTestId("whatsapp-preview").textContent).toContain("gentle reminder");
    fireEvent.click(screen.getByRole("tab", { name: "Day 7" }));
    expect(screen.getByTestId("whatsapp-preview").textContent).toContain("final reminder");
  });

  it("uses a friendly name when none is typed yet", () => {
    render(<WhatsappPreview clientName="Acme" contact="  " item="Invoice" firmName="Rao & Co" />);
    expect(screen.getByTestId("whatsapp-preview").textContent).toContain("Hello Asha");
  });

  it("previews only the reminders whose template Meta approved", () => {
    render(<WhatsappPreview clientName="Acme" contact="Asha" item="Invoice" firmName="Rao & Co" steps={[2]} />);
    expect(screen.queryByRole("tab", { name: "Day 0" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Day 7" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Day 3" })).toBeTruthy();
    expect(screen.getByTestId("whatsapp-preview").textContent).toContain("gentle reminder");
  });

  it("shows no message at all while nothing is approved or while Meta is still being asked", () => {
    const { rerender } = render(<WhatsappPreview clientName="Acme" contact="Asha" item="Invoice" firmName="Rao & Co" steps={[]} />);
    expect(screen.getByTestId("whatsapp-preview").textContent).toContain("nothing to preview");
    expect(screen.queryByText("Upload documents")).toBeNull();
    rerender(<WhatsappPreview clientName="Acme" contact="Asha" item="Invoice" firmName="Rao & Co" steps={null} />);
    expect(screen.getByTestId("whatsapp-preview").textContent).toContain("Checking which messages");
  });
});
