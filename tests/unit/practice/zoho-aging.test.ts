import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as zoho from "@/lib/practice/zoho.server";
import type { Db, FirmContext } from "@/lib/practice/db.server";

const ctx: FirmContext = {
  firmId: "f1",
  firmName: "Rao & Co",
  firmEmail: null,
  userId: "u1",
  role: "partner",
};

async function db(linked = true): Promise<Db> {
  const enc = await (await import("@/lib/caGmail.server")).encryptToken("tok");
  const rows: Record<string, Record<string, unknown>[]> = {
    ca_zoho_connections: [
      {
        id: "c1",
        ca_firm_id: "f1",
        accounts_server: "https://accounts.zoho.in",
        api_domain: "https://www.zohoapis.in",
        refresh_token_enc: enc,
        access_token_enc: enc,
        access_expires_at: new Date(Date.now() + 3.6e6).toISOString(),
        status: "connected",
      },
    ],
    ca_zoho_links: linked
      ? [
          {
            id: "l1",
            ca_firm_id: "f1",
            business_id: "b1",
            organization_id: "o1",
            account_id: "a1",
            account_name: "HDFC Bank A/c 4417",
            posting_enabled: false,
          },
        ]
      : [],
  };
  const from = (n: string) => {
    let r = rows[n] ?? [];
    const q: Record<string, unknown> = {};
    q["select"] = () => q;
    q["limit"] = () => q;
    q["eq"] = (k: string, v: unknown) => ((r = r.filter((x) => x[k] === v)), q);
    q["maybeSingle"] = async () => ({ data: r[0] ?? null, error: null });
    return q;
  };
  return { from } as unknown as Db;
}

beforeEach(() => {
  process.env["GMAIL_ENCRYPTION_KEY"] = "k";
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).includes("/bills")
            ? {
                code: 0,
                bills: [
                  {
                    bill_id: "9",
                    bill_number: "MS-1001",
                    vendor_id: "v",
                    vendor_name: "Mahalakshmi Stores",
                    status: "open",
                    total: 9099.25,
                    balance: 9099.25,
                    due_date: "2026-10-31",
                  },
                ],
                page_context: { has_more_page: false },
              }
            : {
                code: 0,
                invoices: [
                  {
                    invoice_id: "1",
                    invoice_number: "INV-000002",
                    customer_id: "c",
                    customer_name: "Anand Retail",
                    status: "overdue",
                    total: 23800,
                    balance: 23800,
                    due_date: "2026-10-20",
                  },
                  {
                    invoice_id: "2",
                    invoice_number: "INV-000001",
                    customer_id: "c2",
                    customer_name: "Paid Co",
                    status: "paid",
                    total: 5000,
                    balance: 0,
                  },
                ],
                page_context: { has_more_page: false },
              },
        ),
      ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("aging reports from Zoho Books", () => {
  it("receivables: open invoices become aging rows, paid ones are left out", async () => {
    const rows = await zoho.agingRowsFromZoho(
      await db(),
      ctx,
      "b1",
      "receivable",
    );
    expect(rows).toEqual([
      {
        id: "zoho-1",
        party: "Anand Retail",
        ref: "INV-000002",
        date: null,
        due: "2026-10-20",
        amount: 23800,
        settled: 0,
        outstanding: 23800,
      },
    ]);
  });
  it("payables: open bills become aging rows", async () => {
    const rows = await zoho.agingRowsFromZoho(await db(), ctx, "b1", "payable");
    expect(rows?.[0]).toMatchObject({
      party: "Mahalakshmi Stores",
      ref: "MS-1001",
      outstanding: 9099.25,
    });
  });
  it("a client with no Zoho link gets nothing from Zoho", async () => {
    expect(
      await zoho.agingRowsFromZoho(await db(false), ctx, "b1", "receivable"),
    ).toBeNull();
  });
});
