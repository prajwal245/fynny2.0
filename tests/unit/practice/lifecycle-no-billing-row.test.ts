// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mails: { to: string; subject: string }[] = [];
vi.mock("@/lib/practice/email.server", () => ({
  sendEmail: async (m: { to: string; subject: string }) => {
    mails.push({ to: m.to, subject: m.subject });
    return { sent: true, simulated: false, provider_id: "stub", error: null };
  },
}));

const DAY = 86_400_000;
const now = new Date("2026-10-17T06:00:00Z"); // 11:30 IST
const firm = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  firm_name: `Firm ${id}`,
  email: `${id}@example.in`,
  created_at: new Date(now.getTime() - 2 * DAY).toISOString(),
  notification_prefs: {},
  is_demo: false,
  is_test: false,
  ...o,
});

/** A database where every query is a chain that resolves to rows for its table. */
function db(rows: Record<string, unknown[]>) {
  const inserted: { table: string; row: unknown }[] = [];
  const from = (table: string) => {
    let op = "select";
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "gte", "lte", "lt", "order", "limit", "update", "delete", "is", "not", "maybeSingle", "single"])
      b[m] = (...a: unknown[]) => {
        if (m === "update" || m === "delete") op = m;
        void a;
        return b;
      };
    b["insert"] = (row: unknown) => {
      inserted.push({ table, row });
      op = "insert";
      return b;
    };
    b["then"] = (res: (v: unknown) => void) => res({ data: op === "select" ? (rows[table] ?? []) : null, count: (rows[table] ?? []).length, error: null });
    return b;
  };
  return { from, inserted } as never as { from: (t: string) => unknown; inserted: { table: string; row: { ca_firm_id: string; kind: string } }[] };
}

beforeEach(() => {
  mails.length = 0;
  process.env["RESEND_API_KEY"] = "re_test";
  process.env["PUBLIC_APP_URL"] = "https://www.fynhelp.com";
});
afterEach(() => delete process.env["RESEND_API_KEY"]);

describe("lifecycle emails reach a firm that never opened the app again", () => {
  it("emails a firm that has no billing record yet, once, and leaves out test, demo and address-less firms", async () => {
    const { runLifecycle } = await import("@/lib/practice/lifecycle/lifecycle.server");
    const d = db({
      ca_billing: [],
      ca_firms: [firm("fresh1"), firm("tester", { is_test: true }), firm("demo", { is_demo: true }), firm("noemail", { email: null })],
    });
    const r = await runLifecycle(d as never, now, { force: true });
    expect(r.sent).toEqual([{ firmId: "fresh1", kind: "trial_upload_1" }]);
    expect(mails.map((m) => m.to)).toEqual(["fresh1@example.in"]);
    expect(d.inserted.find((x) => x.table === "ca_lifecycle_emails")?.row).toMatchObject({ ca_firm_id: "fresh1", kind: "trial_upload_1" });
  });

  it("does nothing, and says why, when email is not connected", async () => {
    delete process.env["RESEND_API_KEY"];
    const { runLifecycle } = await import("@/lib/practice/lifecycle/lifecycle.server");
    const r = await runLifecycle(db({ ca_billing: [], ca_firms: [firm("fresh1")] }) as never, now, { force: true });
    expect(r.sent).toEqual([]);
    expect(r.skipped).toBe("email not configured");
  });
});
