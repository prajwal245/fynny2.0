// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanMetaId, bodyVariables, buttonLayoutOf, chaseTemplateStatus, pickTemplate, templateCandidates, templateStatus, type MetaTemplate } from "@/lib/practice/whatsappFlow";

const OURS = (order: "url_first" | "qr_first") => {
  const url = { type: "URL", text: "Upload documents", url: "https://fynhelp.com/u/{{1}}" };
  const qr = ["Sending today", "Need more time", "Stop reminders"].map((text) => ({ type: "QUICK_REPLY", text }));
  return [{ type: "BODY" }, { type: "BUTTONS", buttons: order === "url_first" ? [url, ...qr] : [...qr, url] }];
};
const t = (name: string, status: string, o: Partial<MetaTemplate> = {}): MetaTemplate => ({ name, status, language: "en", category: "UTILITY", components: [{ type: "BODY" }], ...o });

describe("reading Meta's templates", () => {
  it("recognises exactly our four buttons, in either order, and nothing else", () => {
    expect(buttonLayoutOf({ components: OURS("url_first") })).toBe("url_first");
    expect(buttonLayoutOf({ components: OURS("qr_first") })).toBe("qr_first");
    expect(buttonLayoutOf({ components: [{ type: "BODY" }] })).toBe("none");
    expect(buttonLayoutOf({ components: [{ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Yes" }] }] })).toBe("other");
    // The URL's variable must be the last thing in the address.
    expect(buttonLayoutOf({ components: [{ type: "BUTTONS", buttons: [{ type: "URL", url: "https://fynhelp.com/{{1}}/x" }, ...OURS("qr_first").flatMap((c) => c.buttons ?? []).filter((b) => b.type === "QUICK_REPLY")] }] })).toBe("other");
  });

  it("says in plain terms what state each template is in", () => {
    expect(templateStatus(t("a", "APPROVED"))).toBe("approved");
    expect(templateStatus(t("a", "PENDING"))).toBe("review");
    expect(templateStatus(t("a", "REJECTED"))).toBe("rejected");
    expect(templateStatus(t("a", "PAUSED"))).toBe("paused");
    expect(templateStatus(t("a", "APPROVED", { category: "MARKETING" }))).toBe("marketing");
    expect(templateStatus(t("a", "APPROVED", { components: [{ type: "BUTTONS", buttons: [{ type: "PHONE_NUMBER" }] }] }))).toBe("unsupported");
    expect(templateStatus(undefined)).toBe("missing");
  });

  it("each stage tries its own template first and falls back to older approved ones", () => {
    expect(templateCandidates("request", {})).toEqual(["document_request_v2", "document_request", "document_followup_v1", "document_followup_v2", "document_final_v2"]);
    expect(templateCandidates("followup", {})).toEqual(["document_followup_v1", "document_followup_v2", "document_request_v2", "document_request"]);
    expect(templateCandidates("final", { final: "my_final" })).toEqual(["my_final", "document_followup_v1", "document_followup_v2", "document_request_v2", "document_request"]);
    // A name set in WHATSAPP_FOLLOWUP_TEMPLATE replaces the defaults.
    expect(templateCandidates("followup", { followup: "my_followup" })).toEqual(["my_followup", "document_request_v2", "document_request"]);
  });

  it("while the new template is in review, the old approved one keeps working", () => {
    const list = [t("document_request_v2", "PENDING", { components: OURS("url_first") }), t("document_request", "APPROVED")];
    expect(pickTemplate(list, templateCandidates("request", {}), "en")).toEqual({ name: "document_request", layout: null, language: "en" });
  });

  it("once approved, the new template is used with the button order it was created in", () => {
    const list = [t("document_request_v2", "APPROVED", { components: OURS("qr_first") }), t("document_request", "APPROVED")];
    expect(pickTemplate(list, templateCandidates("request", {}), "en")).toEqual({ name: "document_request_v2", layout: "qr_first", language: "en" });
  });

  it("the gentle reminder uses document_followup_v1 first, then v2 if v1 is not approved", () => {
    const four = [{ type: "BODY", text: "Hello {{1}}, a gentle reminder from {{4}}. For {{2}} we still need {{3}}." }, ...OURS("url_first").slice(1)];
    const both = [t("document_followup_v1", "APPROVED", { components: four }), t("document_followup_v2", "APPROVED", { components: four }), t("document_request_v2", "APPROVED", { components: four })];
    expect(pickTemplate(both, templateCandidates("followup", {}), "en")?.name).toBe("document_followup_v1");
    const v1Review = [t("document_followup_v1", "PENDING", { components: four }), ...both.slice(1)];
    expect(pickTemplate(v1Review, templateCandidates("followup", {}), "en")?.name).toBe("document_followup_v2");
    const v1Missing = both.slice(1);
    expect(pickTemplate(v1Missing, templateCandidates("followup", {}), "en")?.name).toBe("document_followup_v2");
    // The request and the final reminder are untouched: still v2.
    expect(pickTemplate(both, templateCandidates("request", {}), "en")?.name).toBe("document_request_v2");
  });

  it("skips a chase template whose body takes a different number of variables than the four we fill in", () => {
    const three = [{ type: "BODY", text: "Hello {{1}}, reminder for {{2}}: {{3}}." }, ...OURS("url_first").slice(1)];
    const four = [{ type: "BODY", text: "Hello {{1}}, {{4}} needs {{3}} for {{2}}." }, ...OURS("url_first").slice(1)];
    expect(bodyVariables({ components: three })).toBe(3);
    expect(bodyVariables({ components: four })).toBe(4);
    expect(bodyVariables({ components: [{ type: "BODY" }] })).toBeNull();
    expect(chaseTemplateStatus(t("document_followup_v1", "APPROVED", { components: three }))).toBe("unsupported");
    expect(chaseTemplateStatus(t("document_followup_v1", "APPROVED", { components: four }))).toBe("approved");
    const list = [t("document_followup_v1", "APPROVED", { components: three }), t("document_followup_v2", "APPROVED", { components: four })];
    expect(pickTemplate(list, templateCandidates("followup", {}), "en")?.name).toBe("document_followup_v2");
  });

  it("the final reminder uses the follow-up template when it has none of its own", () => {
    const list = [t("document_followup_v2", "APPROVED", { components: OURS("url_first") }), t("document_request", "APPROVED")];
    expect(pickTemplate(list, templateCandidates("final", {}), "en")).toEqual({ name: "document_followup_v2", layout: "url_first", language: "en" });
  });

  it("never picks a Marketing template, and returns null when nothing is approved", () => {
    const list = [t("_fh_doc_request", "APPROVED", { category: "MARKETING" }), t("document_request_v2", "REJECTED")];
    expect(pickTemplate(list, ["_fh_doc_request", "document_request_v2"], "en")).toBeNull();
  });
});

/* ── asking Meta, with a stand-in ─────────────────────────── */

let metaList: MetaTemplate[] = [];
let calls = 0;
beforeEach(() => {
  calls = 0;
  delete process.env["WHATSAPP_CHASE_BUTTONS"];
  for (const k of ["WHATSAPP_CHASE_TEMPLATE", "WHATSAPP_FOLLOWUP_TEMPLATE", "WHATSAPP_FINAL_TEMPLATE"]) delete process.env[k];
  vi.stubGlobal("fetch", async () => {
    calls++;
    return { ok: true, json: async () => ({ data: metaList }) };
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  (await import("@/lib/practice/whatsappTemplates.server")).forgetTemplates();
});
const sender = { wabaId: "999", token: "tok" };

describe("choosing the template for a reminder", () => {
  it("uses what Meta has approved, reads the list once for a few minutes, and needs no settings", async () => {
    const m = await import("@/lib/practice/whatsappTemplates.server");
    metaList = [t("document_request_v2", "APPROVED", { components: OURS("url_first") }), t("document_followup_v2", "PENDING"), t("document_request", "APPROVED")];
    expect(await m.resolveTemplate(sender, 1)).toEqual({ name: "document_request_v2", layout: "url_first", language: "en" });
    expect(await m.resolveTemplate(sender, 2)).toEqual({ name: "document_request_v2", layout: "url_first", language: "en" });
    expect(await m.resolveTemplate(sender, 3)).toEqual({ name: "document_request_v2", layout: "url_first", language: "en" });
    expect(calls).toBe(1);
  });

  it("WHATSAPP_CHASE_BUTTONS=off sends the body only, and a value overrides the detected order", async () => {
    const m = await import("@/lib/practice/whatsappTemplates.server");
    metaList = [t("document_request_v2", "APPROVED", { components: OURS("url_first") })];
    process.env["WHATSAPP_CHASE_BUTTONS"] = "off";
    expect(await m.resolveTemplate(sender, 1)).toEqual({ name: "document_request_v2", layout: null, language: "en" });
    process.env["WHATSAPP_CHASE_BUTTONS"] = "qr_first";
    expect(await m.resolveTemplate(sender, 1)).toEqual({ name: "document_request_v2", layout: "qr_first", language: "en" });
  });

  it("with no business account id it falls back to the settings, as before", async () => {
    const m = await import("@/lib/practice/whatsappTemplates.server");
    process.env["WHATSAPP_FOLLOWUP_TEMPLATE"] = "my_followup";
    process.env["WHATSAPP_CHASE_BUTTONS"] = "on";
    expect(await m.resolveTemplate({ wabaId: null, token: "t" }, 2)).toEqual({ name: "my_followup", layout: "url_first", language: "en" });
    expect(await m.resolveTemplate({ wabaId: null, token: "t" }, 1)).toEqual({ name: "document_request", layout: "url_first", language: "en" });
    expect(calls).toBe(0);
  });

  it("the Settings panel explains each stage in one sentence", async () => {
    const m = await import("@/lib/practice/whatsappTemplates.server");
    metaList = [t("document_request_v2", "APPROVED", { components: OURS("url_first") }), t("document_followup_v1", "PENDING"), t("document_request", "APPROVED")];
    const v = await m.stagesView(sender);
    expect(v.map((s) => [s.stage, s.status, s.using])).toEqual([
      ["request", "approved", "document_request_v2"],
      ["followup", "review", "document_request_v2"],
      ["final", "missing", "document_request_v2"],
    ]);
    expect(v[1].note).toContain("in review");
    expect(v[1].note).toContain("is used");
    expect(v[0].buttons).toBe(true);
  });
});

describe("account IDs pasted with extra characters", () => {
  it("keeps only the digits, and refuses anything that is not an ID", async () => {
    const { cleanMetaId } = await import("@/lib/practice/whatsappFlow");
    expect(cleanMetaId("$$\\mathbf{2457752908089073}$$")).toBe("2457752908089073");
    expect(cleanMetaId(' "2457752908089073" \n')).toBe("2457752908089073");
    expect(cleanMetaId("2457752908089073")).toBe("2457752908089073");
    expect(cleanMetaId("")).toBeNull();
    expect(cleanMetaId(undefined)).toBeNull();
    expect(cleanMetaId("12345")).toBeNull();
    expect(cleanMetaId("1".repeat(25))).toBeNull();
  });

  it("the sender uses the cleaned ID, so the template lookup goes to the right address", async () => {
    process.env["WHATSAPP_WABA_ID"] = "$$\\mathbf{2457752908089073}$$";
    process.env["WHATSAPP_ACCESS_TOKEN"] = "tok";
    process.env["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"] = "111222333444";
    const { touchSender } = await import("@/lib/practice/touchpoints/whatsapp.server");
    expect(touchSender()?.wabaId).toBe("2457752908089073");
    delete process.env["WHATSAPP_WABA_ID"];
    delete process.env["WHATSAPP_ACCESS_TOKEN"];
    delete process.env["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"];
  });
});

describe("the connection check", () => {
  it("is red only for a stage that has nothing to send, and plain about the rest", async () => {
    const m = await import("@/lib/practice/whatsappTemplates.server");
    // What the customer saw: request still in review, follow-up approved, final not created.
    metaList = [t("document_request_v2", "PENDING", { components: OURS("url_first") }), t("document_followup_v1", "APPROVED", { components: OURS("url_first") })];
    const lines = (await m.stagesView(sender)).map((s) => ({ stage: s.stage, ...m.stageHealth(s) }));
    // The first request borrows the approved follow-up while its own is in review: not a failure.
    expect(lines[0]).toMatchObject({ stage: "request", ok: null });
    expect(lines[0].detail).toContain("in review");
    // The follow-up is ready, and the final reminder borrows it: not a failure.
    expect(lines[1]).toMatchObject({ stage: "followup", ok: true });
    expect(lines[2]).toMatchObject({ stage: "final", ok: null });
    expect(lines[2].detail).toContain("document_followup_v1");
    // With the older template approved, reminder 1 is also fine while the new one is in review.
    metaList.push(t("document_request", "APPROVED"));
    m.forgetTemplates();
    const again = (await m.stagesView(sender)).map((s) => m.stageHealth(s));
    expect(again[0].ok).toBeNull();
    // Nothing approved at all: the reminder cannot go, and it says so.
    metaList = [t("document_request_v2", "PENDING", { components: OURS("url_first") })];
    m.forgetTemplates();
    const none = await m.stagesView(sender);
    expect(m.stageHealth(none[0]).ok).toBe(false);
    expect((await m.resolveTemplate(sender, 1)).none).toBe(true);
  });
});

describe("many firms at once", () => {
  it("share one read of Meta's template list", async () => {
    const m = await import("@/lib/practice/whatsappTemplates.server");
    metaList = [t("document_request_v2", "APPROVED", { components: OURS("url_first") })];
    calls = 0;
    const all = await Promise.all(Array.from({ length: 25 }, () => m.listTemplates(sender)));
    expect(calls).toBe(1);
    expect(all.every((l) => l?.length === 1)).toBe(true);
  });
});
