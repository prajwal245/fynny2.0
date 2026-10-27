// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fn = {
  status: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), link: vi.fn(), orgs: vi.fn(), accounts: vi.fn(), sync: vi.fn(),
  unlink: vi.fn(), owed: vi.fn(), postings: vi.fn(), setPosting: vi.fn(), undo: vi.fn(), preview: vi.fn(), post: vi.fn(),
};
vi.mock("@/lib/practice/practice.functions", () => ({
  zohoBooksStatus: () => fn.status(), zohoBooksConnect: (a: unknown) => fn.connect(a), zohoBooksDisconnect: () => fn.disconnect(),
  zohoBooksLink: (a: unknown) => fn.link(a), zohoBooksOrganizations: () => fn.orgs(), zohoBooksBankAccounts: (a: unknown) => fn.accounts(a),
  zohoBooksSync: (a: unknown) => fn.sync(a), zohoBooksUnlink: (a: unknown) => fn.unlink(a), zohoBooksOpenInvoices: (a: unknown) => fn.owed(a),
  zohoBooksPostings: () => fn.postings(), zohoBooksSetPosting: (a: unknown) => fn.setPosting(a), zohoBooksUndoPost: (a: unknown) => fn.undo(a),
  zohoBooksPreviewPost: (a: unknown) => fn.preview(a), zohoBooksPost: (a: unknown) => fn.post(a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const v2 = { clients: [{ id: "b1", name: "Kaveri Textiles Pvt Ltd" }, { id: "b2", name: "Mehta Foods LLP" }], canSignOff: true };
vi.mock("../../store", () => ({ useV2: () => v2 }));

import { ZohoBooksSection } from "../ZohoBooks";
import { ZohoPostPanel } from "../ZohoPost";

const base = { available: true, connected: false, error: null, connectedAt: null, postingAvailable: false, writeEnabled: false, links: [] as unknown[] };
const link = { id: "l1", business_id: "b1", organization_id: "60093542506", organization_name: "Kaveri Textiles Private Limited", account_id: "a1", account_name: "HDFC Current", last_synced_at: null, last_sync_note: null, posting_enabled: false };

beforeEach(() => {
  Object.values(fn).forEach((f) => f.mockReset());
  fn.postings.mockResolvedValue([]);
  v2.canSignOff = true;
});
afterEach(cleanup);

describe("Zoho Books on Settings", () => {
  it("before connecting, shows only what it does and one Connect button", async () => {
    fn.status.mockResolvedValue(base);
    render(<ZohoBooksSection />);
    expect(await screen.findByTestId("zoho-intro")).toBeTruthy();
    expect(screen.getByTestId("zoho-connect")).toBeTruthy();
    for (const id of ["zoho-steps", "zoho-wizard", "zoho-link", "zoho-add-link", "zoho-write-consent", "zoho-postings"]) expect(screen.queryByTestId(id)).toBeNull();
  });

  it("offers nothing to connect when Zoho is not switched on", async () => {
    fn.status.mockResolvedValue({ ...base, available: false });
    render(<ZohoBooksSection />);
    await screen.findByText(/isn't switched on/);
    expect(screen.queryByTestId("zoho-connect")).toBeNull();
  });

  it("tells a non-partner to ask a partner rather than offering Connect", async () => {
    v2.canSignOff = false;
    fn.status.mockResolvedValue(base);
    render(<ZohoBooksSection />);
    expect(await screen.findByText(/Only a partner can connect/)).toBeTruthy();
    expect(screen.queryByTestId("zoho-connect")).toBeNull();
  });

  it("connected with no client: opens the picker, matches the organisation by name, picks the single bank account and links", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true });
    fn.orgs.mockResolvedValue([{ id: "o1", name: "Kaveri Textiles Private Limited", gstin: null }, { id: "o2", name: "Mehta Foods LLP", gstin: null }]);
    fn.accounts.mockResolvedValue([{ id: "a1", name: "HDFC Current", kind: "bank", number: null, bank: null, hint: null }, { id: "a2", name: "Undeposited Funds", kind: "cash", number: null, bank: null, hint: "Holds receipts" }]);
    fn.link.mockResolvedValue({ ok: true });
    render(<ZohoBooksSection />);
    expect(await screen.findByTestId("zoho-wizard")).toBeTruthy();
    await waitFor(() => expect((screen.getByTestId("zoho-client") as HTMLSelectElement).options.length).toBeGreaterThan(2));
    fireEvent.change(screen.getByTestId("zoho-client"), { target: { value: "b1" } });
    await waitFor(() => expect((screen.getByTestId("zoho-account") as HTMLSelectElement).value).toBe("a1"));
    expect((screen.getByTestId("zoho-org") as HTMLSelectElement).value).toBe("o1");
    expect(screen.getByText(/Matched by name/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("zoho-save-link"));
    await waitFor(() => expect(fn.link).toHaveBeenCalledWith({ data: { businessId: "b1", organizationId: "o1", organizationName: "Kaveri Textiles Private Limited", accountId: "a1", accountName: "HDFC Current" } }));
  });

  it("warns on a cash account and blocks linking the same client and account twice", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, links: [link] });
    fn.orgs.mockResolvedValue([{ id: "o1", name: "Other Org", gstin: null }]);
    fn.accounts.mockResolvedValue([{ id: "a1", name: "HDFC Current", kind: "bank", number: null, bank: null, hint: null }, { id: "a2", name: "Undeposited Funds", kind: "cash", number: null, bank: null, hint: "Holds receipts before they reach the bank." }]);
    render(<ZohoBooksSection />);
    fireEvent.click(await screen.findByTestId("zoho-add-link"));
    await waitFor(() => expect((screen.getByTestId("zoho-client") as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId("zoho-client"), { target: { value: "b1" } });
    fireEvent.change(screen.getByTestId("zoho-org"), { target: { value: "o1" } });
    await waitFor(() => expect((screen.getByTestId("zoho-account") as HTMLSelectElement).options.length).toBe(3));
    fireEvent.change(screen.getByTestId("zoho-account"), { target: { value: "a2" } });
    expect(screen.getByTestId("zoho-cash-hint").textContent).toContain("before they reach the bank");
    fireEvent.change(screen.getByTestId("zoho-account"), { target: { value: "a1" } });
    expect(await screen.findByText(/already linked/)).toBeTruthy();
    expect((screen.getByTestId("zoho-save-link") as HTMLButtonElement).disabled).toBe(true);
  });

  it("pulls last month by default, and asks before unlinking or disconnecting", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, links: [link] });
    fn.sync.mockResolvedValue({ status: "synced", entries: 8, note: "", extractionId: "x" });
    fn.unlink.mockResolvedValue({ ok: true });
    render(<ZohoBooksSection />);
    fireEvent.click(await screen.findByTestId("zoho-sync"));
    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await waitFor(() => expect(fn.sync).toHaveBeenCalledWith({ data: { linkId: "l1", month: `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}` } }));
    expect(await screen.findByText(/Pulled 8 entries/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Unlink Kaveri Textiles Pvt Ltd"));
    expect(fn.unlink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Keep"));
    expect(fn.unlink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Disconnect Zoho Books"));
    expect(fn.disconnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Disconnect Zoho Books" })).toBeTruthy();
  });

  it("shows what a client is owed, and asks to reconnect when Zoho has not granted invoices", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, links: [link] });
    fn.owed.mockResolvedValueOnce([{ id: "1", number: "INV-2601", customerId: "c", customer: "Kaveri", total: 118000, balance: 18000, dueDate: "2026-09-02", status: "overdue" }]);
    render(<ZohoBooksSection />);
    fireEvent.click(await screen.findByTestId("zoho-owed"));
    expect((await screen.findByTestId("zoho-owed-result")).textContent).toContain("1 invoice");
    cleanup();
    fn.status.mockResolvedValue({ ...base, connected: true, links: [link] });
    fn.owed.mockRejectedValueOnce(new Error("Zoho Books has not allowed this yet. Reconnect Zoho Books in Settings to grant the permission."));
    render(<ZohoBooksSection />);
    fireEvent.click(await screen.findByTestId("zoho-owed"));
    expect(await screen.findByText("Reconnect Zoho Books")).toBeTruthy();
  });

  it("keeps approved-entries controls out of sight until the platform switch and consent are on", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, links: [{ ...link, last_synced_at: "2026-10-01T00:00:00Z", last_sync_note: "x" }] });
    render(<ZohoBooksSection />);
    await screen.findByTestId("zoho-link");
    expect(screen.queryByTestId("zoho-write-consent")).toBeNull();
    expect(screen.queryByTestId("zoho-posting-toggle")).toBeNull();
    cleanup();
    fn.status.mockResolvedValue({ ...base, connected: true, postingAvailable: true, links: [{ ...link, last_synced_at: "2026-10-01T00:00:00Z", last_sync_note: "x" }] });
    render(<ZohoBooksSection />);
    expect(await screen.findByTestId("zoho-write-consent")).toBeTruthy();
    cleanup();
    fn.status.mockResolvedValue({ ...base, connected: true, postingAvailable: true, writeEnabled: true, links: [{ ...link, last_synced_at: "2026-10-01T00:00:00Z", last_sync_note: "x" }] });
    render(<ZohoBooksSection />);
    expect(await screen.findByTestId("zoho-posting-toggle")).toBeTruthy();
  });
});

describe("Post to Zoho in the exception drawer", () => {
  it("is absent unless Zoho is connected, posting is allowed, and the client's switch is on", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, postingAvailable: true, writeEnabled: true, links: [{ ...link, posting_enabled: false }] });
    const { container } = render(<ZohoPostPanel clientId="b1" txnId="t1" side="bank" open />);
    await waitFor(() => expect(fn.status).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    cleanup();
    fn.status.mockResolvedValue({ ...base, connected: true, postingAvailable: true, writeEnabled: true, links: [{ ...link, posting_enabled: true }] });
    const books = render(<ZohoPostPanel clientId="b1" txnId="t1" side="books" open />);
    expect(books.container.textContent).toBe("");
  });

  it("previews first, posts only on approval, and can undo", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, postingAvailable: true, writeEnabled: true, links: [{ ...link, posting_enabled: true }] });
    fn.preview.mockResolvedValue({ kind: "bank_charge", title: "Record a bank charge as an expense", lines: [["Amount", "₹590.00"]] });
    fn.post.mockResolvedValue({ ok: true, postingId: "p1", zohoId: "E1" });
    fn.undo.mockResolvedValue({ ok: true });
    render(<ZohoPostPanel clientId="b1" txnId="t1" side="bank" open />);
    fireEvent.click(await screen.findByTestId("zoho-preview"));
    expect(await screen.findByText("Record a bank charge as an expense")).toBeTruthy();
    expect(fn.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("zoho-approve"));
    await waitFor(() => expect(fn.post).toHaveBeenCalledWith({ data: { linkId: "l1", txnId: "t1" } }));
    fireEvent.click(await screen.findByText("Undo"));
    await waitFor(() => expect(fn.undo).toHaveBeenCalledWith({ data: { postingId: "p1" } }));
  });

  it("explains why a line cannot be posted, instead of failing", async () => {
    fn.status.mockResolvedValue({ ...base, connected: true, postingAvailable: true, writeEnabled: true, links: [{ ...link, posting_enabled: true }] });
    fn.preview.mockRejectedValue(new Error("Only bank charges can be posted. Make this entry in Zoho Books."));
    render(<ZohoPostPanel clientId="b1" txnId="t1" side="bank" open />);
    fireEvent.click(await screen.findByTestId("zoho-preview"));
    expect((await screen.findByTestId("zoho-why")).textContent).toContain("Only bank charges");
  });
});
