// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("sending at scale", () => {
  it("retries a rate-limit answer instead of failing the reminder", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return n === 1
        ? { ok: false, status: 400, json: async () => ({ error: { code: 130429, message: "rate" } }) }
        : { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
    });
    const { post } = await import("@/lib/practice/whatsappSend.server");
    const p = post({ phoneNumberId: "111", token: "t" }, {});
    await vi.advanceTimersByTimeAsync(2000);
    const r = await p;
    vi.useRealTimers();
    expect(r.ok).toBe(true);
    expect(n).toBe(2);
  });

  it("sends one number's messages one after another", async () => {
    const order: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const id = (JSON.parse(init.body) as { id: string }).id;
      order.push(`start ${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${id}`);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id }] }) };
    });
    const { post } = await import("@/lib/practice/whatsappSend.server");
    await Promise.all([1, 2, 3].map((i) => post({ phoneNumberId: "222", token: "t" }, { id: String(i) })));
    expect(order).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });
});
