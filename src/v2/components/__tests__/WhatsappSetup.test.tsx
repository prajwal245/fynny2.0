// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const status = vi.fn();
const prefs = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/practice/practice.functions", () => ({
  getPracticeWhatsappStatus: () => status(),
  connectPracticeWhatsapp: vi.fn(),
  checkPracticeWhatsapp: vi.fn(),
  getPracticeWhatsappTemplates: async () => ({
    test: false,
    shared: true,
    stages: [{ stage: "request", label: "First request", using: "document_request", status: "approved", buttons: false, note: "Ready." }],
  }),
}));
vi.mock("../../store", () => ({ useV2: () => ({ firm: { name: "Rao & Co" } }) }));
vi.mock("../../lib/credits", () => ({ useCredits: () => null }));
vi.mock("@/lib/caGmail.functions", () => ({ getChaserPrefs: () => prefs(), setChaserPrefs: vi.fn() }));
vi.mock("../../lib/billing", () => ({ useBilling: () => ({ access: { whatsappChaser: false } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// jsdom has no IntersectionObserver; the shimmering text uses one to start when it scrolls into view.
vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });

import { WhatsappSetup } from "../WhatsappSetup";

const base = {
  channels: [] as { phone_number_id: string; display_phone: string | null; is_active: boolean }[],
  sender: null as "fynhelp" | "own" | null,
  sender_pref: null,
  shared: { configured: false, missing: ["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"], display: "9606370717", join_code: null as string | null },
};
const ui = () => render(<WhatsappSetup firmId="f1" webhook="https://x.test/api/public/whatsapp-webhook" />);

beforeEach(() => {
  prefs.mockResolvedValue({ viaGmail: false, sendGranted: false, tone: "standard", whatsappAuto: false, countryCode: "91", whatsappSender: null });
});
afterEach(cleanup);

describe("WhatsApp setup", () => {
  it("names the missing server setting when FynHelp's number is not on, and offers the own-number form", async () => {
    status.mockResolvedValue(base);
    ui();
    await waitFor(() => expect(screen.getByText("Which WhatsApp number should FynHelp use?")).toBeTruthy());
    // Defaults to the choice that can work: own number, so the Phone number ID box is shown at once.
    expect(screen.getByLabelText("Phone number ID")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /FynHelp's number/ }));
    expect(await screen.findByText(/WHATSAPP_DEFAULT_PHONE_NUMBER_ID/)).toBeTruthy();
    expect(screen.queryByLabelText("Phone number ID")).toBeNull();
  });

  it("with FynHelp's number on: nothing to fill in, shows the number and the join code", async () => {
    status.mockResolvedValue({ ...base, sender: "fynhelp", shared: { configured: true, missing: [], display: "9606370717", join_code: "K7M2QX" } });
    ui();
    expect(await screen.findByText(/Ready: 9606370717/)).toBeTruthy();
    expect(screen.getByText("JOIN K7M2QX")).toBeTruthy();
    expect(screen.queryByLabelText("Phone number ID")).toBeNull();
    // No plan running: the automatic-reminder switch is explained, not shown.
    expect(screen.getByText(/paused until you choose a plan/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("with an own number linked: shows it, hides the form until Change is pressed", async () => {
    status.mockResolvedValue({ ...base, sender: "own", channels: [{ phone_number_id: "123456789", display_phone: "+91 98450 12345", is_active: true }] });
    ui();
    expect(await screen.findByText(/Linked: \+91 98450 12345/)).toBeTruthy();
    expect(screen.queryByLabelText("Phone number ID")).toBeNull();
    fireEvent.click(screen.getByText("Change"));
    expect(screen.getByLabelText("Phone number ID")).toBeTruthy();
  });
});
