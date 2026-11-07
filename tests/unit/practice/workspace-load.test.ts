import { describe, expect, it } from "vitest";
import { WorkspaceUnavailable, loadWorkspaceWithRetry } from "@/v2/lib/workspaceLoad";

const noWait = async () => undefined;
describe("opening an existing firm never falls through to 'Name your firm'", () => {
  it("returns the workspace on the first try", async () => {
    expect(await loadWorkspaceWithRetry(async () => ({ firm: 1 }), noWait)).toEqual({ firm: 1 });
  });
  it("a few 'Too many requests' answers are retried and then succeed", async () => {
    let n = 0;
    const r = await loadWorkspaceWithRetry(async () => {
      if (++n < 3) throw new Error("Too many requests");
      return "ok";
    }, noWait);
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });
  it("only the server's 'Create your practice first' means no firm", async () => {
    expect(await loadWorkspaceWithRetry(async () => { throw new Error("Create your practice first."); }, noWait)).toBeNull();
  });
  it("a failure that never clears is a failure, not 'no firm'", async () => {
    let n = 0;
    await expect(loadWorkspaceWithRetry(async () => { n++; throw new Error("Too many requests"); }, noWait)).rejects.toBeInstanceOf(WorkspaceUnavailable);
    expect(n).toBe(4);
  });
  it("an ended session is passed on at once so the person signs in again", async () => {
    let n = 0;
    await expect(loadWorkspaceWithRetry(async () => { n++; throw new Error("Unauthorized: session ended"); }, noWait)).rejects.toThrow(/Unauthorized/);
    expect(n).toBe(1);
  });
});
