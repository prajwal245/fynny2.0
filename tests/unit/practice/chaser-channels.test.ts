// @vitest-environment node
import { describe, expect, it } from "vitest";
import { channelFromNotes, parseChaseChannel, stepChannels } from "@/lib/practice/chaser/rules";

describe("chase channels", () => {
  it("reads the channel saved with a chase, and nothing for older chases", () => {
    expect(channelFromNotes(JSON.stringify({ note: "", channels: "whatsapp" }))).toBe("whatsapp");
    expect(channelFromNotes(JSON.stringify({ channels: "both" }))).toBe("both");
    expect(channelFromNotes(JSON.stringify({ channels: "email" }))).toBe("email");
    expect(channelFromNotes(JSON.stringify({ note: "old chase" }))).toBeNull();
    expect(channelFromNotes("not json")).toBeNull();
    expect(channelFromNotes(null)).toBeNull();
    expect(parseChaseChannel("sms")).toBeNull();
  });

  it("email only, WhatsApp only and both do exactly what they say at every step", () => {
    for (const step of [1, 2, 3]) {
      expect(stepChannels("email", step, true)).toEqual({ email: true, whatsapp: false });
      expect(stepChannels("whatsapp", step, false)).toEqual({ email: false, whatsapp: true });
      expect(stepChannels("both", step, false)).toEqual({ email: true, whatsapp: true });
    }
  });

  it("a chase made before channels existed keeps its old behaviour", () => {
    expect(stepChannels(null, 1, true)).toEqual({ email: true, whatsapp: false });
    expect(stepChannels(null, 2, true)).toEqual({ email: true, whatsapp: true });
    expect(stepChannels(null, 3, false)).toEqual({ email: true, whatsapp: false });
  });
});
