// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetTemplates, listTemplates } from "@/lib/practice/whatsappTemplates.server";

const t = (name: string) => ({ name, language: "en", status: "APPROVED", category: "UTILITY", components: [] });
let calls: string[] = [];
const pages: Record<string, { data: unknown[]; paging?: { next: string } }> = {
  first: { data: [t("a"), t("b")], paging: { next: "https://graph.test/page2" } },
  "https://graph.test/page2": { data: [t("c")], paging: { next: "https://graph.test/page3" } },
  "https://graph.test/page3": { data: [t("fh_setup_help_v2")] },
};

beforeEach(() => {
  calls = [];
  forgetTemplates();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const body = url.includes("message_templates?") ? pages["first"] : pages[url];
    return { ok: true, json: async () => body } as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("reading the template list from Meta", () => {
  it("follows every page, so a template past the first 200 is not reported missing", async () => {
    const list = await listTemplates({ wabaId: "123", token: "tok" });
    expect(list?.map((x) => x.name)).toEqual(["a", "b", "c", "fh_setup_help_v2"]);
    expect(calls).toHaveLength(3);
  });
  it("keeps the list for a few minutes, and reads again when asked to check now", async () => {
    await listTemplates({ wabaId: "123", token: "tok" });
    await listTemplates({ wabaId: "123", token: "tok" });
    expect(calls).toHaveLength(3);
    await listTemplates({ wabaId: "123", token: "tok" }, Date.now(), { fresh: true });
    expect(calls).toHaveLength(6);
  });
});
