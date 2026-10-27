import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  advances,
  buildTemplateMessage,
  chaseTemplateParams,
  classifyInbound,
  explainWaError,
  PLATFORM_FAILURE_MESSAGE,
  waParam,
} from "@/lib/practice/whatsappFlow";

describe("template message", () => {
  it("fills four body fields and cleans them", () => {
    const p = chaseTemplateParams({ contactName: "Asha", clientName: "Acme\nTraders", items: ["Bank statement (Sep 2026)"], firmName: "Rao  &  Co" });
    expect(p).toEqual(["Asha", "Acme Traders", "Bank statement (Sep 2026)", "Rao & Co"]);
  });
  it("summarises long item lists and never sends an empty field", () => {
    const p = chaseTemplateParams({ contactName: "", clientName: "A", items: ["a", "b", "c", "d", "e"], firmName: "F" });
    expect(p[0]).toBe("there");
    expect(p[2]).toBe("a, b, c and 2 more");
    expect(waParam("   ")).toBe("-");
  });
  it("builds the Cloud API payload", () => {
    const m = buildTemplateMessage("919845012345", "document_request", "en", ["a", "b", "c", "d"]);
    expect(m).toMatchObject({ messaging_product: "whatsapp", to: "919845012345", type: "template" });
    expect(m.template.components[0].parameters).toHaveLength(4);
  });
});

describe("Meta errors in plain words", () => {
  it("treats bad numbers and unapproved templates as permanent", () => {
    expect(explainWaError(131026, undefined)).toMatchObject({ permanent: true });
    // Faults that only FynHelp can fix are never explained to the firm: it sees "Failed", the reason goes to the logs.
    for (const code of [132001, 190, 132000, 131047, 100]) {
      const e = explainWaError(code, undefined);
      expect(e.message).toBe(PLATFORM_FAILURE_MESSAGE);
      expect(e.message).not.toMatch(/template|token|meta|approved/i);
      expect(e.internal).toBeTruthy();
    }
    expect(explainWaError(132001, undefined).internal).toMatch(/template/i);
    expect(explainWaError(190, undefined).internal).toMatch(/token/i);
  });
  it("treats rate limits as retryable", () => {
    expect(explainWaError(130429, undefined).permanent).toBe(false);
    expect(explainWaError(131056, undefined).permanent).toBe(false);
    expect(explainWaError(undefined, "boom").internal).toContain("boom");
    expect(explainWaError(undefined, "boom").message).not.toContain("boom");
  });
});

describe("inbound text", () => {
  it("recognises opt-outs", () => {
    for (const t of ["STOP", "stop please", "Unsubscribe", "opt out", "Do not message me", "band karo"])
      expect(classifyInbound(t)).toBe("stop");
  });
  it("treats everything else as a reply", () => {
    for (const t of ["Will send tomorrow", "Please stop by tomorrow to collect it", "ok", "", null])
      expect(classifyInbound(t)).toBe("reply");
  });
});

describe("delivery receipts only move forward", () => {
  it("ignores late or repeated receipts", () => {
    expect(advances(null, "sent")).toBe(true);
    expect(advances("sent", "delivered")).toBe(true);
    expect(advances("read", "delivered")).toBe(false);
    expect(advances("delivered", "delivered")).toBe(false);
    expect(advances("delivered", "failed")).toBe(true);
  });
});

import { normalisePhone, samePhone, parseCountryCode } from "@/lib/practice/chaser/rules";
import { buildTextMessage, chaseText, inServiceWindow, windowClosed } from "@/lib/practice/whatsappFlow";

describe("phone numbers in any country", () => {
  it("keeps the India rules by default", () => {
    expect(normalisePhone("98450 12345")).toBe("919845012345");
    expect(normalisePhone("098450 12345")).toBe("919845012345");
    expect(normalisePhone("12345")).toBeNull();
  });
  it("uses international numbers as written", () => {
    expect(normalisePhone("+971 50 123 4567")).toBe("971501234567");
    expect(normalisePhone("00447911123456")).toBe("447911123456");
    expect(normalisePhone("+12025550123", "91")).toBe("12025550123");
  });
  it("adds the firm's own country code to local numbers", () => {
    expect(normalisePhone("050 123 4567", "971")).toBe("971501234567");
    expect(normalisePhone("501234567", "971")).toBe("971501234567");
    expect(normalisePhone("971501234567", "971")).toBe("971501234567"); // already has it
    expect(normalisePhone("8123 4567", "65")).toBe("6581234567"); // 8-digit Singapore
    expect(normalisePhone("2025550123", "1")).toBe("12025550123");
    expect(normalisePhone("abc", "971")).toBeNull();
  });
  it("matches the same person across formats", () => {
    expect(samePhone("+91 98450 12345", "919845012345")).toBe(true);
    expect(samePhone("050 123 4567", "971501234567", "971")).toBe(true);
    expect(samePhone("9845012345", "9845012346")).toBe(false);
    expect(samePhone(null, "919845012345")).toBe(false);
  });
  it("falls back to India for a bad country code", () => {
    expect(parseCountryCode("abc")).toBe("91");
    expect(parseCountryCode("+971")).toBe("971");
    expect(parseCountryCode("12345")).toBe("91");
  });
});

describe("24-hour reply window", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  it("is open for 23 hours after the client last wrote", () => {
    expect(inServiceWindow("2026-10-26T09:00:00Z", now)).toBe(true);
    expect(inServiceWindow("2026-10-25T11:30:00Z", now)).toBe(true); // 22.5h
    expect(inServiceWindow("2026-10-25T10:00:00Z", now)).toBe(false); // 24h
    expect(inServiceWindow(null, now)).toBe(false);
    expect(inServiceWindow("2026-10-27T10:00:00Z", now)).toBe(false); // future: clock skew, do not trust
  });
  it("sends the same wording as the template, as plain text", () => {
    const body = chaseText(["Asha", "Acme", "Bank statement", "Rao & Co"]);
    expect(body).toBe("Hello Asha, this is Rao & Co. For Acme we are still waiting for: Bank statement. Please reply here with the file attached. Thank you.");
    expect(buildTextMessage("919845012345", body)).toMatchObject({ type: "text", to: "919845012345", text: { preview_url: false } });
    expect(windowClosed(131047)).toBe(true);
  });
});

import { chooseSender, newJoinCode, parseJoinCode } from "@/lib/practice/whatsappFlow";

describe("which WhatsApp number a firm uses", () => {
  it("honours the firm's choice when it can be used", () => {
    expect(chooseSender({ pref: "own", hasOwn: true, sharedConfigured: true })).toBe("own");
    expect(chooseSender({ pref: "fynhelp", hasOwn: true, sharedConfigured: true })).toBe("fynhelp");
  });
  it("falls back to what exists", () => {
    expect(chooseSender({ pref: "own", hasOwn: false, sharedConfigured: true })).toBe("fynhelp");
    expect(chooseSender({ pref: "fynhelp", hasOwn: true, sharedConfigured: false })).toBe("own");
  });
  it("keeps a number linked before the choice existed, else uses FynHelp's", () => {
    expect(chooseSender({ pref: null, hasOwn: true, sharedConfigured: true })).toBe("own");
    expect(chooseSender({ pref: null, hasOwn: false, sharedConfigured: true })).toBe("fynhelp");
    expect(chooseSender({ pref: null, hasOwn: false, sharedConfigured: false })).toBeNull();
    expect(chooseSender({ pref: "bogus", hasOwn: false, sharedConfigured: false })).toBeNull();
  });
});

describe("join codes on the shared number", () => {
  it("reads JOIN messages, ignoring case and spacing", () => {
    expect(parseJoinCode("JOIN k7m2qx")).toBe("K7M2QX");
    expect(parseJoinCode("  join   K7M2QX  ")).toBe("K7M2QX");
    expect(parseJoinCode("please join K7M2QX")).toBeNull();
    expect(parseJoinCode("JOIN K7M2")).toBeNull();
    expect(parseJoinCode(null)).toBeNull();
  });
  it("makes readable six-character codes", () => {
    for (let i = 0; i < 50; i++) expect(newJoinCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });
});

import { phoneTail, pickAutoRoute } from "@/lib/practice/whatsappFlow";

describe("matching a first-time sender to a firm", () => {
  it("takes only an unambiguous match", () => {
    expect(pickAutoRoute(["f1"])).toBe("f1");
    expect(pickAutoRoute(["f1", "f1"])).toBe("f1");
    expect(pickAutoRoute(["f1", "f2"])).toBeNull();
    expect(pickAutoRoute([])).toBeNull();
  });
  it("compares the last 10 digits, ignoring formatting", () => {
    expect(phoneTail("+91 98450 12345")).toBe("9845012345");
    expect(phoneTail("919845012345")).toBe("9845012345");
    expect(phoneTail("12345")).toBeNull();
    expect(phoneTail(null)).toBeNull();
  });
});

describe("shared number setting names", () => {
  const keys = ["WHATSAPP_DEFAULT_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_PHONE_ID"];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
  afterEach(() => keys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }));
  it("accepts the documented name, then the common alternatives, digits only", async () => {
    const { sharedPhoneNumberId } = await import("@/lib/practice/whatsappSend.server");
    expect(sharedPhoneNumberId()).toBeUndefined();
    process.env["WHATSAPP_PHONE_ID"] = " 1234567890 ";
    expect(sharedPhoneNumberId()).toBe("1234567890");
    process.env["WHATSAPP_PHONE_NUMBER_ID"] = "555000111222";
    expect(sharedPhoneNumberId()).toBe("555000111222");
    process.env["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"] = "999888777666";
    expect(sharedPhoneNumberId()).toBe("999888777666");
  });
});
