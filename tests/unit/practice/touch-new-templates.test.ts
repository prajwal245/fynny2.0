import { describe, expect, it } from "vitest";
import { pickTouchTemplate, touchParams, TOUCH_TEMPLATES, TOUCH_TEMPLATES_UTILITY, type TouchTemplateKey } from "@/lib/practice/touchpoints/whatsapp";
import type { MetaTemplate } from "@/lib/practice/whatsappFlow";

const threeButtons = [
  { type: "URL", text: "Open FynHelp", url: "https://fynhelp.com/app" },
  { type: "QUICK_REPLY", text: "Call me" },
  { type: "QUICK_REPLY", text: "Not now" },
  { type: "QUICK_REPLY", text: "Stop messages" },
];
const tpl = (name: string, category: string, status: string, buttons: unknown[]): MetaTemplate =>
  ({ name, language: "en", category, status, components: [{ type: "BODY", text: "Hello {{1}} {{2}} {{3}}" }, { type: "BUTTONS", buttons }] }) as unknown as MetaTemplate;

describe("fh_account_update and fh_results_ready are picked once approved", () => {
  for (const key of ["issue", "ready"] as const) {
    const name = TOUCH_TEMPLATES[key].name;
    const o = { language: "en", allowMarketing: true };
    it(`${key}: not used while in review`, () => {
      expect(pickTouchTemplate(key, [tpl(name, "MARKETING", "PENDING", threeButtons)], o).template).toBeUndefined();
    });
    it(`${key}: used once approved, even if Meta classed it Marketing (flagged as Marketing)`, () => {
      const p = pickTouchTemplate(key, [tpl(name, "MARKETING", "APPROVED", threeButtons)], o);
      expect(p.template?.name).toBe(name);
      expect(p.marketing).toBe(true);
    });
    it(`${key}: used as Utility when approved as Utility`, () => {
      const p = pickTouchTemplate(key, [tpl(name, "UTILITY", "APPROVED", threeButtons)], o);
      expect(p.template?.name).toBe(name);
      expect(p.marketing).toBe(false);
    });
    it(`${key}: refused with the wrong buttons (dynamic link, phone button, two quick replies)`, () => {
      const wrong = [{ type: "URL", text: "Open Account", url: "https://fynhelp.com/account/{{1}}" }, { type: "PHONE_NUMBER", text: "Ask us to call", phone_number: "+9100" }, { type: "QUICK_REPLY", text: "Pause Updates" }, { type: "QUICK_REPLY", text: "Stop Messages" }];
      expect(pickTouchTemplate(key, [tpl(name, "UTILITY", "APPROVED", wrong)], o).template).toBeUndefined();
    });
    it(`${key}: Marketing is not used when Marketing is switched off`, () => {
      expect(pickTouchTemplate(key, [tpl(name, "MARKETING", "APPROVED", threeButtons)], { ...o, allowMarketing: false }).template).toBeUndefined();
    });
  }
  it("fills three fields for both", () => {
    expect(touchParams("processing_issue", { name: "Asha Rao", firmName: "Rao & Co" }, { failedDocs: 2 })).toHaveLength(3);
    expect(touchParams("results_ready", { name: "Asha Rao", firmName: "Rao & Co" }, { readyDocs: 3, readyReports: 1 })?.[2]).toBe("3 documents were read and 1 report is ready.");
  });
});

describe("Utility names for every follow-up", () => {
  const keys = ["setup", "trial", "plan", "issue", "ready"] as const;
  const o = { language: "en", allowMarketing: true };
  it("every Utility name differs from the original, because Meta locks a name's category", () => {
    for (const k of keys) expect(TOUCH_TEMPLATES_UTILITY[k].name, k).not.toBe(TOUCH_TEMPLATES[k].name);
    expect(TOUCH_TEMPLATES_UTILITY.issue.name).toBe("fh_account_update_v2");
    expect(TOUCH_TEMPLATES_UTILITY.ready.name).toBe("fh_results_ready_v2");
  });
  for (const k of keys as readonly TouchTemplateKey[]) {
    it(`${k}: an approved Utility _v2 beats a Marketing original`, () => {
      const list = [tpl(TOUCH_TEMPLATES[k].name, "MARKETING", "APPROVED", threeButtons), tpl(TOUCH_TEMPLATES_UTILITY[k].name, "UTILITY", "APPROVED", threeButtons)];
      const p = pickTouchTemplate(k, list, o);
      expect(p.template?.name).toBe(TOUCH_TEMPLATES_UTILITY[k].name);
      expect(p.marketing).toBe(false);
    });
    it(`${k}: when Marketing is off and only the Marketing original exists, the reason says it is Marketing and the template to submit is the _v2 name`, () => {
      const p = pickTouchTemplate(k, [tpl(TOUCH_TEMPLATES[k].name, "MARKETING", "APPROVED", threeButtons)], { ...o, allowMarketing: false });
      expect(p.template).toBeUndefined();
      expect(p.name).toBe(TOUCH_TEMPLATES_UTILITY[k].name);
      expect(p.why).toBe(`${TOUCH_TEMPLATES[k].name} was classed as Marketing`);
    });
  }
  it("a template in another language code that starts with the wanted one still counts", () => {
    const t = { ...tpl("fh_setup_help_v2", "UTILITY", "APPROVED", threeButtons), language: "en_US" } as MetaTemplate;
    expect(pickTouchTemplate("setup", [t], o).template?.name).toBe("fh_setup_help_v2");
  });
  it("the template script creates exactly the Utility templates the app expects, with the same wording", async () => {
    const { TEMPLATES } = (await import("../../../scripts/whatsapp-templates.mjs")) as { TEMPLATES: { name: string; components: { type: string; text?: string }[] }[] };
    for (const k of keys) {
      const t = TEMPLATES.find((x) => x.name === TOUCH_TEMPLATES_UTILITY[k].name);
      expect(t, TOUCH_TEMPLATES_UTILITY[k].name).toBeTruthy();
      expect(t!.components.find((c) => c.type === "BODY")?.text).toBe(TOUCH_TEMPLATES_UTILITY[k].body);
    }
  });
});

describe("the reason names what is actually wrong with a template that exists", () => {
  const o = { language: "en", allowMarketing: false };
  it("says the original is in review, not only that the _v2 name is missing", () => {
    const p = pickTouchTemplate("setup", [tpl("fh_setup_help", "UTILITY", "PENDING", threeButtons)], o);
    expect(p.template).toBeUndefined();
    expect(p.why).toBe("fh_setup_help is pending");
  });
  it("lists each template that exists and what is wrong with it", () => {
    const list = [tpl("fh_setup_help", "MARKETING", "APPROVED", threeButtons), tpl("fh_setup_help_v2", "UTILITY", "REJECTED", threeButtons)];
    const p = pickTouchTemplate("setup", list, o);
    expect(p.why).toBe("fh_setup_help_v2 is rejected; fh_setup_help was classed as Marketing");
  });
  it("says it does not exist only when neither name is on the account", () => {
    expect(pickTouchTemplate("setup", [], o).why).toMatch(/does not exist/);
  });
});
