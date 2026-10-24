import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_FOLLOW_UPS,
  DEFAULT_SCHEDULE,
  decide,
  inSendWindow,
  nextSendWindow,
  parseTone,
  renderEmail,
  renderGroupedEmail,
  snoozeResume,
  type ChaseState,
  type TemplateInput,
} from "@/lib/practice/chaser/rules";
import { buildRawMessage, threadSubject } from "@/lib/practice/gmailSend";

const t: TemplateInput = {
  contactName: "Asha",
  clientName: "Acme Traders",
  firmName: "Rao & Co",
  item: "Bank statement",
  period: "September 2026",
  dueDate: "2026-10-10",
};

describe("cadence", () => {
  it("sends on day 0, 3 and 7 then escalates on day 10", () => {
    expect(DEFAULT_SCHEDULE).toEqual([0, 3, 7, 10]);
    const base: ChaseState = {
      status: "open", created_at: "2026-09-01T04:00:00.000Z", chaser_count: 0, max_follow_ups: DEFAULT_MAX_FOLLOW_UPS,
      schedule_days: DEFAULT_SCHEDULE, escalated_at: null, last_chased_at: null, next_follow_up_at: null,
      do_not_disturb: false, contact_email: "a@b.in",
    };
    const at = (d: number, s: Partial<ChaseState>) => decide({ ...base, ...s }, new Date(Date.parse(base.created_at) + d * 86_400_000 + 3_600_000));
    expect(at(0, {})).toMatchObject({ action: "send", follow_up_number: 1 });
    expect(at(3, { chaser_count: 1 })).toMatchObject({ action: "send", follow_up_number: 2 });
    expect(at(7, { chaser_count: 2 })).toMatchObject({ action: "send", follow_up_number: 3 });
    expect(at(10, { chaser_count: 3 })).toEqual({ action: "escalate" });
  });
});

describe("tone", () => {
  it("keeps the standard first two messages and makes the third a final reminder", () => {
    expect(renderEmail(1, t).template_id).toBe("chase_email_first");
    expect(renderEmail(2, t).template_id).toBe("chase_email_followup");
    const third = renderEmail(3, t);
    expect(third.template_id).toBe("chase_email_final");
    expect(third.subject).toMatch(/^Final reminder/);
    expect(third.text).toContain("2026-10-10");
  });
  it("gentle never turns into a final notice; firm is direct from the second", () => {
    expect(renderEmail(3, t, "gentle").template_id).toBe("chase_email_followup");
    expect(renderEmail(3, t, "gentle").text).not.toMatch(/penalty/);
    expect(renderEmail(2, t, "firm").text).toMatch(/have not yet received/);
  });
  it("falls back to standard for unknown tones", () => {
    expect(parseTone("shouty")).toBe("standard");
    expect(parseTone("firm")).toBe("firm");
  });
});

describe("one email per client", () => {
  const base = { contactName: "Asha", clientName: "Acme Traders", firmName: "Rao & Co" };
  it("reads like a single chase for one item", () => {
    const one = renderGroupedEmail(1, base, [{ item: "Bank statement", period: "September 2026", dueDate: null }]);
    expect(one.subject).toBe("Gentle reminder – Bank statement for September 2026");
  });
  it("lists every missing item in one message", () => {
    const g = renderGroupedEmail(
      1,
      base,
      [
        { item: "Bank statement", period: "September 2026", dueDate: "2026-10-10" },
        { item: "Purchase invoices", period: null, dueDate: null },
        { item: "GST confirmation", period: "September 2026", dueDate: null },
      ],
    );
    expect(g.subject).toBe("3 documents needed for Acme Traders");
    expect(g.text).toContain("• Bank statement – September 2026 (by 2026-10-10)");
    expect(g.text).toContain("• Purchase invoices");
    expect(g.text).toContain("• GST confirmation – September 2026");
    expect(renderGroupedEmail(3, base, [{ item: "A", period: null, dueDate: null }, { item: "B", period: null, dueDate: null }]).subject).toMatch(/^Final reminder/);
  });
});

describe("send window: 9:30 to 18:30 IST, Monday to Saturday", () => {
  it("opens and closes on time", () => {
    expect(inSendWindow(new Date("2026-10-26T04:00:00Z"))).toBe(true); // Mon 09:30 IST
    expect(inSendWindow(new Date("2026-10-26T03:59:00Z"))).toBe(false); // 09:29
    expect(inSendWindow(new Date("2026-10-26T13:00:00Z"))).toBe(false); // 18:30
    expect(inSendWindow(new Date("2026-10-26T12:59:00Z"))).toBe(true);
  });
  it("is closed on Sunday and open on Saturday", () => {
    expect(inSendWindow(new Date("2026-10-25T06:00:00Z"))).toBe(false); // Sun
    expect(inSendWindow(new Date("2026-10-24T06:00:00Z"))).toBe(true); // Sat
  });
  it("defers to the next working morning", () => {
    expect(nextSendWindow(new Date("2026-10-26T06:00:00Z")).toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(nextSendWindow(new Date("2026-10-26T01:00:00Z")).toISOString()).toBe("2026-10-26T04:00:00.000Z"); // early Monday
    expect(nextSendWindow(new Date("2026-10-26T14:00:00Z")).toISOString()).toBe("2026-10-27T04:00:00.000Z"); // Mon evening
    expect(nextSendWindow(new Date("2026-10-24T14:00:00Z")).toISOString()).toBe("2026-10-26T04:00:00.000Z"); // Sat evening skips Sun
  });
});

describe("client promised a date", () => {
  const now = new Date("2026-10-24T06:00:00Z");
  it("resumes the day after at 10:00 IST", () => {
    expect(snoozeResume("2026-10-28", now)).toBe("2026-10-29T04:30:00.000Z");
  });
  it("rejects past, malformed and far-off dates", () => {
    expect(snoozeResume("2026-10-23", now)).toBeNull();
    expect(snoozeResume("tomorrow", now)).toBeNull();
    expect(snoozeResume("2027-03-01", now)).toBeNull();
  });
});

describe("Gmail raw message", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
  const msg = { fromName: "Rao & Co", fromAddress: "ca@raoco.in", to: "asha@acme.in", subject: "Gentle reminder – Bank statement", text: "Hello ₹", html: "<p>Hello</p>", replyTo: "ca@raoco.in" };
  it("builds a multipart message from the firm's address", () => {
    const raw = decode(buildRawMessage(msg, "B"));
    expect(raw).toContain("From: \"Rao & Co\" <ca@raoco.in>");
    expect(raw).toContain("To: asha@acme.in");
    expect(raw).toContain("Reply-To: ca@raoco.in");
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="B"');
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/); // en dash is encoded
    const textPart = raw.split("--B")[1].split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(textPart, "base64").toString("utf8")).toBe("Hello ₹");
  });
  it("cannot be used to inject headers", () => {
    const raw = decode(buildRawMessage({ ...msg, subject: "Hi\r\nBcc: evil@x.com", to: "a@b.in\r\nBcc: evil@x.com" }, "B"));
    expect(raw).not.toMatch(/^Bcc:/m);
  });
  it("keeps follow-ups in the thread with one Re:", () => {
    expect(threadSubject("Gentle reminder – X")).toBe("Re: Gentle reminder – X");
    expect(threadSubject("Re: Gentle reminder – X")).toBe("Re: Gentle reminder – X");
  });
});
