import { describe, expect, it } from "vitest";
import { identifyClient } from "@/lib/caGmail.server";

// Minimal stand-in for the Supabase client: every query resolves to the table's rows.
function fakeAdmin(tables: Record<string, unknown[]>) {
  const q = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "in", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: rows[0] ?? null });
    chain.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(res);
    return chain;
  };
  return { from: (t: string) => q(tables[t] ?? []) } as never;
}

const clients = [
  { business_id: "sundara", client_email: "accounts@sundaratextiles.in", client_name: "Sundara Textiles Pvt Ltd", gstin: "29AABCS1429B1ZL" },
  { business_id: "vireo", client_email: "finance@vireofoods.com", client_name: "Vireo Foods LLP", gstin: "27AAGFV1234K1Z5" },
  { business_id: "twin-a", client_email: "ca-desk@sharedbooks.in", client_name: "Twin A", gstin: null },
  { business_id: "twin-b", client_email: "ca-desk@sharedbooks.in", client_name: "Twin B", gstin: null },
];

describe("Gmail intake never files a document under a guessed client", () => {
  it("files automatically on the exact address of exactly one client", async () => {
    const m = await identifyClient(fakeAdmin({ ca_clients: clients }), "f", "accounts@sundaratextiles.in", "", "");
    expect(m).toMatchObject({ businessId: "sundara", method: "exact" });
  });

  it("only suggests on a matching domain", async () => {
    const m = await identifyClient(fakeAdmin({ ca_clients: clients }), "f", "ravi@sundaratextiles.in", "", "");
    expect(m.businessId).toBeNull();
    expect(m.suggestedBusinessId).toBe("sundara");
    expect(m.method).toBe("domain");
  });

  it("only suggests on a similar sender name or a GSTIN in the subject", async () => {
    const byName = await identifyClient(fakeAdmin({ ca_clients: clients }), "f", "someone@gmail.com", "Vireo Foods", "");
    expect(byName.businessId).toBeNull();
    expect(byName.suggestedBusinessId).toBe("vireo");
    const byGstin = await identifyClient(fakeAdmin({ ca_clients: clients }), "f", "x@gmail.com", "", "Sept statement 27AAGFV1234K1Z5");
    expect(byGstin.businessId).toBeNull();
    expect(byGstin.suggestedBusinessId).toBe("vireo");
  });

  it("refuses an address shared by two clients", async () => {
    const m = await identifyClient(fakeAdmin({ ca_clients: clients }), "f", "ca-desk@sharedbooks.in", "", "");
    expect(m.businessId).toBeNull();
    expect(m.method).toBe("ambiguous");
  });

  it("files on a mapping a person already confirmed", async () => {
    const m = await identifyClient(
      fakeAdmin({ ca_clients: clients, ca_email_sender_mappings: [{ business_id: "vireo" }] }),
      "f",
      "owner@gmail.com",
      "",
      "",
    );
    expect(m).toMatchObject({ businessId: "vireo", method: "learned" });
  });
});
