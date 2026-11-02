/**
 * The one look for every email FynHelp sends to a firm (billing, trial, referral, team invites, sign-off).
 * It follows the website: warm cream page, white card with a red top edge, ink text, red buttons with a deep-red
 * edge, and the FynHelp wordmark. Email clients ignore web fonts, so the system font stack is used.
 *
 * Messages a firm sends to its own clients (Chaser) use `plainEmailBody` instead: same type and colours,
 * but no FynHelp branding, because those read as the CA's own email.
 */
export const BRAND = {
  page: "#F2EEE7",
  card: "#FFFFFF",
  panel: "#F7F3EC",
  line: "#E7E0D3",
  ink: "#171208",
  body: "#3A342C",
  muted: "#6B645A",
  faint: "#8A8276",
  red: "#D92B2B",
  redDeep: "#8E1B1F",
} as const;

const FONT = "'Instrument Sans','Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

export const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface BrandedParts {
  /** The grey preview line shown beside the subject in an inbox. */
  preheader: string;
  /** "Hello Rao & Co," */
  greeting?: string;
  heading: string;
  paragraphs: string[];
  /** Label and value rows in a soft panel: amounts, dates, who and what. */
  figures?: [string, string][];
  bullets?: string[];
  /** Absolute URL. */
  cta?: { label: string; url: string };
  /** A quieter second link under the button. */
  secondary?: { label: string; url: string };
  note?: string;
  /** Closing line. Defaults to "The FynHelp team". */
  signoff?: string;
}

export function brandedEmail(
  parts: BrandedParts,
  opts: { footer: string; unsubscribeUrl?: string | null },
): { html: string; text: string } {
  const e = escHtml;
  const signoff = parts.signoff ?? "The FynHelp team";

  const text = [
    ...(parts.greeting ? [parts.greeting, ""] : []),
    parts.heading,
    "",
    ...parts.paragraphs.flatMap((p) => [p, ""]),
    ...(parts.figures?.length ? [...parts.figures.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(parts.bullets?.length ? [...parts.bullets.map((b) => `- ${b}`), ""] : []),
    ...(parts.cta ? [`${parts.cta.label}: ${parts.cta.url}`, ""] : []),
    ...(parts.secondary ? [`${parts.secondary.label}: ${parts.secondary.url}`, ""] : []),
    ...(parts.note ? [parts.note, ""] : []),
    signoff,
    "",
    "--",
    opts.footer,
    ...(opts.unsubscribeUrl ? [`Stop these emails: ${opts.unsubscribeUrl}`] : []),
  ].join("\n");

  const figures = parts.figures?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:4px 0 20px;background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:12px">${parts.figures
        .map(
          ([k, v], i) =>
            `<tr><td style="padding:12px 16px;font-size:15.5px;color:${BRAND.muted};${i ? `border-top:1px solid ${BRAND.line};` : ""}">${e(k)}</td><td align="right" style="padding:12px 16px;font-size:15.5px;font-weight:600;color:${BRAND.ink};${i ? `border-top:1px solid ${BRAND.line};` : ""}">${e(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const bullets = parts.bullets?.length
    ? `<ul style="margin:0 0 20px;padding-left:20px;color:${BRAND.body}">${parts.bullets.map((b) => `<li style="margin:5px 0">${e(b)}</li>`).join("")}</ul>`
    : "";
  // Solid red with a deep-red lower edge: the same "pressed" button the site uses, without gradients email clients drop.
  const button = parts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px"><tr><td style="background:${BRAND.red};border-bottom:3px solid ${BRAND.redDeep};border-radius:12px"><a href="${e(parts.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px">${e(parts.cta.label)}</a></td></tr></table>`
    : "";
  const secondary = parts.secondary
    ? `<p style="margin:10px 0 0;font-size:15.5px"><a href="${e(parts.secondary.url)}" style="color:${BRAND.redDeep};font-weight:600;text-decoration:underline">${e(parts.secondary.label)}</a></p>`
    : "";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(parts.heading)}</title><style>@media (max-width:480px){.fh-pad{padding:24px 20px !important}h1{font-size:22px !important}}</style></head><body style="margin:0;padding:0;background:${BRAND.page}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${e(parts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page}"><tr><td align="center" style="padding:28px 14px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px"><tr><td style="padding:0 6px 14px;font-family:${FONT};font-size:23px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink}">Fyn<span style="color:${BRAND.red}">Help</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:${BRAND.card};border:1px solid ${BRAND.line};border-top:4px solid ${BRAND.red};border-radius:18px"><tr><td class="fh-pad" style="padding:32px 34px;font-family:${FONT};font-size:16.5px;line-height:1.65;color:${BRAND.body}">
${parts.greeting ? `<p style="margin:0 0 14px">${e(parts.greeting)}</p>` : ""}
<h1 style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:1.25;letter-spacing:-0.02em;font-weight:700;color:${BRAND.ink}">${e(parts.heading)}</h1>
${parts.paragraphs.map((p) => `<p style="margin:0 0 14px">${e(p)}</p>`).join("")}
${figures}${bullets}${button}${secondary}
${parts.note ? `<p style="margin:18px 0 0;font-size:14.5px;line-height:1.55;color:${BRAND.muted}">${e(parts.note)}</p>` : ""}
<p style="margin:24px 0 0;color:${BRAND.ink};font-weight:600">${e(signoff)}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px"><tr><td style="padding:16px 8px 0;font-family:${FONT};font-size:13.5px;line-height:1.55;color:${BRAND.faint}">${e(opts.footer)}${opts.unsubscribeUrl ? ` <a href="${e(opts.unsubscribeUrl)}" style="color:${BRAND.faint};text-decoration:underline">Stop these emails</a>.` : ""}<br>FynHelp, Bengaluru, India &middot; <a href="https://www.fynhelp.com" style="color:${BRAND.faint}">fynhelp.com</a></td></tr></table>
</td></tr></table></body></html>`;
  return { html, text };
}

/** A firm's message to its own client: the site's type and colours, no FynHelp branding. */
export function plainEmailBody(text: string): string {
  return `<div style="font-family:${FONT};font-size:16.5px;line-height:1.65;color:${BRAND.body}">${text
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 14px">${escHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}
