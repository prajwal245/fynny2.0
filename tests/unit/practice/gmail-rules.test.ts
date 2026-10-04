import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  forwardedSender,
  parseAddress,
  pickAttachments,
  plainText,
  refreshFailure,
  searchQuery,
  senderVerdict,
  windowStart,
  type GmailPart,
} from "@/lib/practice/gmailRules";

const att = (partId: string, filename: string, mimeType: string, size: number, extraHeaders: { name: string; value: string }[] = []): GmailPart => ({
  partId,
  filename,
  mimeType,
  headers: [{ name: "Content-Disposition", value: `attachment; filename="${filename}"` }, ...extraHeaders],
  body: { attachmentId: `a-${partId}`, size },
});
const inlineImg = (partId: string, size: number): GmailPart => ({
  partId,
  filename: "image001.png",
  mimeType: "image/png",
  headers: [
    { name: "Content-Disposition", value: 'inline; filename="image001.png"' },
    { name: "Content-ID", value: "<ii_123>" },
  ],
  body: { attachmentId: `a-${partId}`, size },
});
const email = (...parts: GmailPart[]): GmailPart => ({
  mimeType: "multipart/mixed",
  parts: [{ partId: "0", mimeType: "text/plain", body: { data: "", size: 0 } }, ...parts],
});

describe("pickAttachments", () => {
  it("takes statements, Tally exports, spreadsheets and photos of bills", () => {
    const { take } = pickAttachments(
      email(
        att("1", "HDFC_Sep.pdf", "application/pdf", 90_000),
        att("2", "daybook.xml", "text/xml", 20_000),
        att("3", "stmt.csv", "text/csv", 4_000),
        att("4", "ledger.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 30_000),
        att("5", "IMG_2041.jpg", "image/jpeg", 1_800_000),
      ),
    );
    expect(take.map((t) => t.filename)).toEqual(["HDFC_Sep.pdf", "daybook.xml", "stmt.csv", "ledger.xlsx", "IMG_2041.jpg"]);
  });

  it("skips signature logos, calendar invites, digital signatures and winmail.dat", () => {
    const { take, skipped } = pickAttachments(
      email(
        att("1", "statement.pdf", "application/pdf", 80_000),
        inlineImg("2", 40_000),
        att("3", "logo.png", "image/png", 6_000),
        att("4", "invite.ics", "text/calendar", 2_000),
        att("5", "smime.p7s", "application/pkcs7-signature", 3_000),
        att("6", "winmail.dat", "application/ms-tnef", 50_000),
      ),
    );
    expect(take.map((t) => t.filename)).toEqual(["statement.pdf"]);
    expect(skipped.map((s) => s.reason).sort()).toEqual(["signature_image", "signature_image", "system_file", "system_file", "system_file"]);
  });

  it("keeps a large photo even when the mail app embedded it inline", () => {
    const big = inlineImg("1", 900_000);
    expect(pickAttachments(email(big)).take).toHaveLength(1);
  });

  it("takes zip and Word files so the firm gets a clear 'send PDF or Excel' message", () => {
    const { take } = pickAttachments(email(att("1", "statements.zip", "application/zip", 300_000), att("2", "note.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 20_000)));
    expect(take).toHaveLength(2);
  });

  it("refuses files over 25 MB and empty ones without downloading them", () => {
    const { take, skipped } = pickAttachments(email(att("1", "huge.pdf", "application/pdf", 30 * 1024 * 1024), att("2", "empty.csv", "text/csv", 0)));
    expect(take).toHaveLength(0);
    expect(skipped.map((s) => s.reason).sort()).toEqual(["empty", "too_large"]);
  });

  it("finds attachments inside a forwarded email at any depth", () => {
    const nested: GmailPart = {
      mimeType: "multipart/mixed",
      parts: [{ partId: "1", mimeType: "message/rfc822", parts: [{ partId: "1.1", mimeType: "multipart/mixed", parts: [att("1.1.2", "Axis_Aug.pdf", "application/pdf", 70_000)] }] }],
    };
    expect(pickAttachments(nested).take.map((t) => t.partId)).toEqual(["1.1.2"]);
  });

  it("names an attachment that came without a file name", () => {
    const noName: GmailPart = { partId: "3", mimeType: "application/pdf", headers: [{ name: "Content-Disposition", value: "attachment" }], body: { attachmentId: "x", size: 50_000 } };
    expect(pickAttachments(email(noName)).take[0].filename).toBe("attachment-3.pdf");
  });

  it("uses small attachments Gmail sends inline in the message", () => {
    const small: GmailPart = { partId: "2", filename: "tiny.csv", mimeType: "text/csv", headers: [], body: { data: "RGF0ZSxBbW91bnQK", size: 12 } };
    const [t] = pickAttachments(email(small)).take;
    expect(t.attachmentId).toBeNull();
    expect(new TextDecoder().decode(base64UrlToBytes(t.inlineData!))).toBe("Date,Amount\n");
  });
});

describe("senders", () => {
  it("parses the usual From formats", () => {
    expect(parseAddress('"Ramesh Sundaram" <Ramesh@SundaraTextiles.in>')).toEqual({ email: "ramesh@sundaratextiles.in", name: "Ramesh Sundaram" });
    expect(parseAddress("accounts@client.in")).toEqual({ email: "accounts@client.in", name: "" });
  });

  it("finds the client inside a forwarded email (Gmail, Outlook, Apple Mail)", () => {
    expect(forwardedSender("FYI\n\n---------- Forwarded message ---------\nFrom: Ramesh <ramesh@sundara.in>\nDate: Mon")).toBe("ramesh@sundara.in");
    expect(forwardedSender("see below\n-----Original Message-----\nFrom: accounts@kothari.in\nSent: Tuesday")).toBe("accounts@kothari.in");
    expect(forwardedSender("Begin forwarded message:\n\nFrom: \"Meera\" <meera@iyer.co.in>\nSubject: stmt")).toBe("meera@iyer.co.in");
    expect(forwardedSender("Hi, please find the statement attached.")).toBeNull();
  });

  it("reads Gmail's verdict on whether the sender is genuine", () => {
    expect(senderVerdict("mx.google.com; dkim=pass header.i=@sundara.in; spf=pass; dmarc=pass")).toBe("pass");
    expect(senderVerdict("mx.google.com; spf=fail smtp.mailfrom=sundara.in; dmarc=fail")).toBe("fail");
    expect(senderVerdict("mx.google.com; spf=softfail; dkim=none")).toBe("fail");
    expect(senderVerdict("mx.google.com; spf=softfail; dkim=pass")).toBe("pass");
    expect(senderVerdict("")).toBe("unknown");
  });

  it("reads the plain-text body for forward detection", () => {
    const text = btoa("---------- Forwarded message ---------\nFrom: a@b.in").replace(/\+/g, "-").replace(/\//g, "_");
    expect(plainText({ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: text } }] })).toContain("From: a@b.in");
  });
});

describe("what to look at", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  it("covers the last 7 days on the first check", () => {
    expect(windowStart(null, now).toISOString()).toBe("2026-09-27T10:00:00.000Z");
  });
  it("overlaps the last complete check by 6 hours, never more than 30 days back", () => {
    expect(windowStart("2026-10-04T09:00:00Z", now).toISOString()).toBe("2026-10-04T03:00:00.000Z");
    expect(windowStart("2026-06-01T00:00:00Z", now).toISOString()).toBe("2026-09-04T10:00:00.000Z");
  });
  it("never looks at the firm's own sent mail, drafts, spam or trash", () => {
    const q = searchQuery(now);
    for (const part of ["has:attachment", "-from:me", "-in:sent", "-in:drafts", "-in:spam", "-in:trash"]) expect(q).toContain(part);
    expect(q).toContain(`after:${Math.floor(now.getTime() / 1000)}`);
  });
});

describe("token refresh failures", () => {
  it("treats a removed or expired grant as needing reconnection", () => {
    expect(refreshFailure(400, { error: "invalid_grant" })).toBe("revoked");
  });
  it("keeps the connection on network trouble or Google being busy", () => {
    expect(refreshFailure(503, null)).toBe("transient");
    expect(refreshFailure(500, { error: "internal_failure" })).toBe("transient");
    expect(refreshFailure(0, null)).toBe("transient");
  });
});
