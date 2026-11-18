import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

describe("a file from a number no firm knows", () => {
  it("tells the sender how to link once, and records every drop for the admin", async () => {
    const { db, tables } = memoryDb({ ca_ai_calls: [] });
    const { tellUnlinkedSender } = await import("@/lib/practice/whatsapp.server");
    const said: string[] = [];
    const m = { id: "w1", from: "919611329404", type: "document", timestamp: String(Math.floor(Date.now() / 1000)) } as never;
    await tellUnlinkedSender(db, m, async (t) => void said.push(t));
    await tellUnlinkedSender(db, { ...(m as object), id: "w2" } as never, async (t) => void said.push(t));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/JOIN/);
    const rows = tables["ca_ai_calls"] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r["purpose"] === "whatsapp_inbound" && r["ca_firm_id"] === null)).toBe(true);
    expect(String(rows[0]!["error"])).toMatch(/not delivered to any firm/);
    expect(String(rows[0]!["error"])).not.toContain("919611329404");
  });
});
