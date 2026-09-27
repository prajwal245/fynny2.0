import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const leadSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  firm_name: z.string().trim().min(1).max(150),
  role: z.string().max(50),
  client_entities: z.string().max(20),
  hear_about: z.string().max(100),
  month_end_pain: z.string().max(500).optional().default(""),
  utm_source: z.string().max(200).optional().default(""),
  utm_medium: z.string().max(200).optional().default(""),
  utm_campaign: z.string().max(200).optional().default(""),
  referrer: z.string().max(500).optional().default(""),
  landing_page: z.string().max(500).optional().default(""),
});

const RECIPIENTS = ["nidhi@fynhelp.com", "prajwal@fynhelp.com", "adireddytarun@fynhelp.com", "samiksha.ch1511@gmail.com"];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const notifyWaitlistLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      console.error("[waitlist-notify] RESEND_API_KEY is not configured");
      return { sent: false };
    }

    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:6px 0;font-size:13px;color:#1A1008;">${esc(value) || "—"}</td></tr>`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;">
        <h2 style="color:#A93838;margin:0 0 12px;">New FynHelp Waitlist Lead</h2>
        <table style="border-collapse:collapse;">
          ${row("Name", data.full_name)}
          ${row("Email", data.email)}
          ${row("Firm", data.firm_name)}
          ${row("Role", data.role)}
          ${row("Client entities", data.client_entities)}
          ${row("Heard via", data.hear_about)}
          ${row("Month-end pain", data.month_end_pain)}
          ${row("UTM source", data.utm_source)}
          ${row("UTM medium", data.utm_medium)}
          ${row("UTM campaign", data.utm_campaign)}
          ${row("Referrer", data.referrer)}
          ${row("Landing page", data.landing_page)}
        </table>
      </div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "FynHelp Waitlist <waitlist@fynhelp.com>",
        to: RECIPIENTS,
        reply_to: data.email,
        subject: `Waitlist: ${data.full_name} — ${data.firm_name}`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[waitlist-notify] Resend failed [${response.status}]: ${body}`);
      return { sent: false };
    }
    const body = await response.json();
    console.log("[waitlist-notify] Resend success", body.id);
    return { sent: true, id: body.id };
  });
