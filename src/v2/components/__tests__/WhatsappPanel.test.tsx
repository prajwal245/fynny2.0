// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const status = vi.fn();
const templates = vi.fn();
const check = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/practice/practice.functions", () => ({
  getPracticeWhatsappStatus: () => status(),
  connectPracticeWhatsapp: vi.fn(),
  checkPracticeWhatsapp: () => check(),
  getPracticeWhatsappTemplates: () => templates(),
}));
vi.mock("@/lib/caGmail.functions", () => ({
  getChaserPrefs: async () => ({ viaGmail: false, sendGranted: false, tone: "standard", whatsappAuto: false, countryCode: "91", whatsappSender: null }),
  setChaserPrefs: vi.fn(),
}));
vi.mock("../../lib/billing", () => ({ useBilling: () => ({ access: { whatsappChaser: true } }) }));
vi.mock("../../lib/credits", () => ({ useCredits: () => ({ unmetered: false, balance: 320 }) }));
vi.mock("../../store", () => ({ useV2: () => ({ firm: { name: "Rao & Co" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// jsdom has no IntersectionObserver; the shimmering text uses one to start when it scrolls into view.
vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });

import { WhatsappSetup } from "../WhatsappSetup";

const ready = { channels: [], sender: "fynhelp", sender_pref: "fynhelp", shared: { configured: true, missing: [], display: "+91 96063 70717", join_code: "M9F38E" } };
const stage = (stage: string, label: string, using: string | null, st: string) => ({ stage, label, using, status: st, buttons: true, note: `${label} note` });
const ui = () => render(<WhatsappSetup firmId="f1" webhook="https://x.test/api/public/whatsapp-webhook" />);

beforeEach(() => {
  status.mockResolvedValue(ready);
  templates.mockResolvedValue({ test: false, shared: true, stages: [stage("request", "First request", "document_request_v2", "approved"), stage("followup", "Gentle reminder", "document_followup_v2", "approved"), stage("final", "Final reminder", "document_followup_v2", "missing")] });
  check.mockResolvedValue({ ok: false, steps: [{ label: "Number in use", ok: true, detail: "FynHelp's shared number." }, { label: "Final reminder template", ok: false, detail: "Nothing to send." }] });
});
afterEach(cleanup);

describe("the WhatsApp settings panel", () => {
  it("shows the agent's state at a glance and four tabs instead of one long page", async () => {
    ui();
    await waitFor(() => expect(screen.getByText("Chaser on WhatsApp")).toBeTruthy());
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d\/\d/, "").trim())).toEqual(["Number", "Messages", "Rules", "Check"]);
    expect(screen.getByText("Active")).toBeTruthy();
    // The header carries the number, the messages and the credits.
    // Nothing about approval is shown to firms: the wording is managed by FynHelp.
    expect(screen.queryByText(/of 3 ready|approved|Meta has/i)).toBeNull();
    expect(screen.getByText("3 reminders, managed by FynHelp")).toBeTruthy();
    expect(screen.getAllByText(/\+91 96063 70717/).length).toBeGreaterThan(0);
    // Only the open tab's content is on the page.
    expect(screen.getByText("Which WhatsApp number should FynHelp use?")).toBeTruthy();
    expect(screen.queryByText("How reminders work")).toBeNull();
    expect(screen.queryByText("Test the connection")).toBeNull();
  });

  it("switches tabs: messages show what clients receive, rules show the settings", async () => {
    ui();
    await waitFor(() => expect(screen.getByText("Chaser on WhatsApp")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: /Messages/ }));
    await waitFor(() => expect(screen.getByTestId("whatsapp-preview")).toBeTruthy());
    expect(screen.getByText("What your clients receive")).toBeTruthy();
    expect(screen.queryByText(/Meta|approved|template/i)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
    await waitFor(() => expect(screen.getByText("How reminders work")).toBeTruthy());
    expect(screen.getByLabelText(/Phone numbers saved without a country code/)).toBeTruthy();
  });

  it("runs the check as the agent working, then shows each real result and the verdict", async () => {
    ui();
    await waitFor(() => expect(screen.getByText("Chaser on WhatsApp")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check WhatsApp connection" }));
    await waitFor(() => expect(screen.getByTestId("agent-run")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Nothing to send/)).toBeTruthy(), { timeout: 4000 });
    await waitFor(() => expect(screen.getAllByText("Fix the items marked and check again.").length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("opens on the number tab when there is no number, and says so in the header", async () => {
    status.mockResolvedValue({ channels: [], sender: null, sender_pref: null, shared: { configured: false, missing: ["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"], display: null, join_code: null } });
    ui();
    await waitFor(() => expect(screen.getByText("Needs a number")).toBeTruthy());
    expect(screen.getByLabelText("Phone number ID")).toBeTruthy();
  });
});
