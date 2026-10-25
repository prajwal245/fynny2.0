/**
 * Outbound email for the Chaser (Resend). Without RESEND_API_KEY the send is
 * simulated: nothing leaves the server, and the timeline says so plainly.
 */
export interface SendResult {
  sent: boolean;
  simulated: boolean;
  /** A test firm's message to someone outside the team: recorded, never sent. */
  sandbox?: boolean;
  provider_id: string | null;
  error: string | null;
}

export async function sendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  fromName?: string;
  /** Extra headers, e.g. List-Unsubscribe on lifecycle emails. */
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const key = process.env["RESEND_API_KEY"];
  if (!key)
    return { sent: false, simulated: true, provider_id: null, error: null };
  const fromAddress =
    process.env["PRACTICE_FROM_EMAIL"] || "noreply@fynhelp.com";
  const from = msg.fromName
    ? `${msg.fromName.replace(/[<>"]/g, "")} via FynHelp <${fromAddress}>`
    : `FynHelp <${fromAddress}>`;
  try {
    // RESEND_API_BASE exists only so tests can point at a stand-in.
    const base = process.env["RESEND_API_BASE"] || "https://api.resend.com";
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok)
      return {
        sent: false,
        simulated: false,
        provider_id: null,
        error: body.message ?? `Resend ${res.status}`,
      };
    return {
      sent: true,
      simulated: false,
      provider_id: body.id ?? null,
      error: null,
    };
  } catch (e) {
    return {
      sent: false,
      simulated: false,
      provider_id: null,
      error: (e as Error).message,
    };
  }
}

export const isEmail = (s: string | null | undefined) =>
  Boolean(s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()));
