import { beforeAll, describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

beforeAll(() => {
  process.env["GMAIL_ENCRYPTION_KEY"] = "a".repeat(64);
});

describe("saved passwords of locked files", () => {
  it("are stored encrypted, read back by the server, and only the fact is listed", async () => {
    const { db, tables } = memoryDb({ ca_file_passwords: [] });
    const { saveFilePassword, getFilePassword, documentsWithPassword } = await import("@/lib/practice/filePasswords.server");
    expect(await saveFilePassword(db, "f1", "d1", "secret123")).toBe(true);
    const row = (tables["ca_file_passwords"] as Record<string, unknown>[])[0]!;
    expect(String(row["password_enc"])).not.toContain("secret123");
    expect(await getFilePassword(db, "d1")).toBe("secret123");
    expect(await getFilePassword(db, "other")).toBeNull();
    expect([...(await documentsWithPassword(db, "f1", ["d1", "d2"]))]).toEqual(["d1"]);
  });
  it("saving twice keeps one row with the newest password", async () => {
    const { db, tables } = memoryDb({ ca_file_passwords: [] });
    const { saveFilePassword, getFilePassword } = await import("@/lib/practice/filePasswords.server");
    await saveFilePassword(db, "f1", "d1", "old");
    await saveFilePassword(db, "f1", "d1", "new");
    expect((tables["ca_file_passwords"] as unknown[]).length).toBe(1);
    expect(await getFilePassword(db, "d1")).toBe("new");
  });
  it("never breaks an upload: with no key or no table it just saves nothing", async () => {
    const saved = process.env["GMAIL_ENCRYPTION_KEY"];
    delete process.env["GMAIL_ENCRYPTION_KEY"];
    try {
      const { db } = memoryDb({ ca_file_passwords: [] });
      const { saveFilePassword, getFilePassword } = await import("@/lib/practice/filePasswords.server");
      expect(await saveFilePassword(db, "f1", "d1", "x")).toBe(false);
      expect(await getFilePassword(db, "d1")).toBeNull();
    } finally {
      process.env["GMAIL_ENCRYPTION_KEY"] = saved;
    }
  });
});
