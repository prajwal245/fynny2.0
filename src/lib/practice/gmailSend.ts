/**
 * Building the raw message Gmail's send API takes (RFC 822, base64url).
 * Pure, so the headers and encoding are tested on their own.
 */

export interface RawMessage {
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
}

/** Strip anything that could end a header line and inject another one. */
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const encodeWord = (s: string) =>
  // eslint-disable-next-line no-control-regex
  /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

const b64Lines = (s: string) => (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");

export function buildRawMessage(m: RawMessage, boundary = `fyn_${Math.random().toString(36).slice(2)}`): string {
  const name = clean(m.fromName).replace(/["<>]/g, "");
  const headers = [
    `From: ${name ? `${encodeWord(`"${name}"`)} ` : ""}<${clean(m.fromAddress)}>`,
    `To: ${clean(m.to)}`,
    ...(m.replyTo ? [`Reply-To: ${clean(m.replyTo)}`] : []),
    `Subject: ${encodeWord(clean(m.subject))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(m.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(m.html),
    `--${boundary}--`,
    "",
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/** Follow-ups in a Gmail thread must carry the same subject with a single "Re: ". */
export const threadSubject = (firstSubject: string) =>
  /^re:/i.test(firstSubject.trim()) ? firstSubject.trim() : `Re: ${firstSubject.trim()}`;
