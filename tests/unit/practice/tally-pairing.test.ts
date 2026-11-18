import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { PAIRING_MINUTES, newPairingCode, normalizePairingCode, pairingExpired, pairingHash, looksLikeToken } from "@/lib/practice/tallyConnector";
// @ts-expect-error the connector is a plain script
import { pairWithCode, mergeConfig } from "../../../public/downloads/fynhelp-tally-connector.mjs";

const ctx = { firmId: "f1", firmName: "Firm", firmEmail: null, userId: "u1", role: "owner" as const };

describe("pairing code format", () => {
  it("is 10 characters in two groups, without look-alike letters, and survives typing in any case or with spaces", () => {
    for (let i = 0; i < 200; i++) {
      const c = newPairingCode();
      expect(c).toMatch(/^[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/);
      expect(c).not.toMatch(/[01ILOU]/);
      expect(normalizePairingCode(c.toLowerCase().replace("-", " "))).toBe(c.replace("-", ""));
    }
  });
  it("rejects what is not a code", () => {
    for (const bad of ["", "ABC", "7K2QM-X9HT", "7K2QM-X9HTDD", "0O1IL-UUUUU", null, undefined]) expect(normalizePairingCode(bad as string)).toBeNull();
  });
  it("expires after the stated minutes", () => {
    const t = Date.now();
    expect(pairingExpired(new Date(t - (PAIRING_MINUTES - 1) * 60_000), t)).toBe(false);
    expect(pairingExpired(new Date(t - (PAIRING_MINUTES + 1) * 60_000), t)).toBe(true);
  });
});

describe("redeeming a code", () => {
  it("gives the connector a working token once, and the code then stops working", async () => {
    const { db, tables } = memoryDb({ ca_tally_connectors: [] });
    const t = await import("@/lib/practice/tallyConnector.server");
    const made = await t.createPairing(db, ctx, "Office PC");
    expect(made.code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    // Before it is redeemed the row exists but cannot be used as a connector.
    const row = (tables["ca_tally_connectors"] as Record<string, unknown>[])[0]!;
    expect(row["is_active"]).toBe(false);

    const first = await t.redeemPairing(db, made.code, "OFFICE-PC", "1.6.0");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(looksLikeToken(first.token)).toBe(true);
    expect(first.name).toBe("Office PC");
    // The new token authenticates; the code does not.
    const authed = await t.authConnector(db, `Bearer ${first.token}`);
    expect(authed?.ca_firm_id).toBe("f1");
    const again = await t.redeemPairing(db, made.code);
    expect(again).toMatchObject({ ok: false, status: 404 });
  });
  it("refuses a wrong code and an expired one", async () => {
    const { db, tables } = memoryDb({ ca_tally_connectors: [] });
    const t = await import("@/lib/practice/tallyConnector.server");
    const made = await t.createPairing(db, ctx, "PC");
    expect(await t.redeemPairing(db, "ZZZZZ-ZZZZZ")).toMatchObject({ ok: false, status: 404 });
    expect(await t.redeemPairing(db, "nope")).toMatchObject({ ok: false, status: 400 });
    (tables["ca_tally_connectors"] as Record<string, unknown>[])[0]!["created_at"] = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(await t.redeemPairing(db, made.code)).toMatchObject({ ok: false, status: 410 });
  });
  it("a pairing hash is not the token hash of the same text", async () => {
    expect(await pairingHash("ABCDEFGHJK")).not.toBe(await (await import("@/lib/practice/tallyConnector")).hashToken("ABCDEFGHJK"));
  });
});

describe("the connector script's side", () => {
  const good = "fyn_tc_" + "A".repeat(43);
  it("sends the code and returns the token", async () => {
    let sent: { url: string; body: Record<string, string> } | null = null;
    const fake = async (url: string, init: { body: string }) => ((sent = { url, body: JSON.parse(init.body) }), { ok: true, status: 200, json: async () => ({ token: good, name: "Office PC" }) });
    const r = await pairWithCode("https://fynhelp.com/", "7k2qm x9htd", fake, "PC1");
    expect(r.token).toBe(good);
    expect(sent!.url).toBe("https://www.fynhelp.com/api/public/tally-pair");
    expect(sent!.body).toMatchObject({ code: "7K2QMX9HTD", host_name: "PC1" });
  });
  it("says why when the code is refused or the network is down", async () => {
    await expect(pairWithCode(undefined, "AAAAA-AAAAA", async () => ({ ok: false, status: 410, json: async () => ({ error: "That code has expired" }) }))).rejects.toThrow(/expired/);
    await expect(pairWithCode(undefined, "AAAAA-AAAAA", async () => { throw new Error("getaddrinfo ENOTFOUND"); })).rejects.toThrow(/Could not reach FynHelp/);
    await expect(pairWithCode(undefined, "short")).rejects.toThrow(/10 letters/);
  });
  it("keeps the settings a person already made when the token is added", () => {
    const merged = JSON.parse(mergeConfig('{"allowWrite":true,"tallyUrl":"http://localhost:9001"}', good));
    expect(merged).toEqual({ allowWrite: true, tallyUrl: "http://localhost:9001", token: good });
    expect(JSON.parse(mergeConfig("", good))).toEqual({ token: good });
  });
});
