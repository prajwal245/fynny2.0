import { afterEach, describe, expect, it } from "vitest";
import { tallyPostingEnabled } from "@/lib/practice/posting";

describe("posting to Tally is off by default", () => {
  afterEach(() => { delete process.env["PRACTICE_TALLY_POSTING"]; });
  it("is off unless a deployment turns it on", () => {
    expect(tallyPostingEnabled()).toBe(false);
    process.env["PRACTICE_TALLY_POSTING"] = "1";
    expect(tallyPostingEnabled()).toBe(false);
    process.env["PRACTICE_TALLY_POSTING"] = "on";
    expect(tallyPostingEnabled()).toBe(true);
  });
  it("refuses an approval and hands the connector nothing while off", async () => {
    const { approvePosting, claimPostings } = await import("@/lib/practice/tallyPosting.server");
    await expect(approvePosting({} as never, { firmId: "f", role: "owner", userId: "u" } as never, { txnId: "t", partyLedger: "p", bankLedger: "b" })).rejects.toThrow(/switched off/);
    expect(await claimPostings({} as never, { id: "c" } as never)).toEqual([]);
  });
});
