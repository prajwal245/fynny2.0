/**
 * Copy and layout for the lifecycle emails. Each template returns plain parts
 * (heading, paragraphs, figures, one button) and `renderEmail` turns them into
 * matching HTML and text, so every email looks the same and reads well in
 * clients that show only text. Figures come from the firm's own data; nothing
 * here is invented or estimated.
 */
import { monthName, arrearsLines, type Arrears } from "../billing/arrears";
import { PLANS, TRIAL_MAX_ACTIVE_CLIENTS, TRIAL_MAX_DOCUMENTS, type Cycle, type PlanKey } from "../billing/plans";
import type { LifecycleKind } from "./schedule";

export interface EmailParts {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Label and value pairs shown as a small table. */
  figures?: [string, string][];
  bullets?: string[];
  cta?: { label: string; path: string };
  /** Shown under the button, e.g. how the charge is collected. */
  note?: string;
}

export interface EmailContext {
  firmName: string;
  plan: PlanKey;
  cycle: Cycle;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  /** Everything the firm has done so far (trial recap). */
  totals: { clients: number; documents: number; matchedLines: number; reports: number };
  /** This month so far. */
  usage: { activeClients: number; documents: number };
  documentLimit: number | null;
  /** Cheapest plan for this month's active clients, before GST. */
  recommended: { plan: PlanKey; subtotal: number };
  /** Last month, for the usage summary. */
  previous?: {
    month: string;
    activeClients: number;
    documents: number;
    reports: number;
    arrears: Arrears | null;
    method: "none" | "addon" | "invoice";
    payUrl: string | null;
    nextPaymentDate: string | null;
  };
  dormantClientNames: string[];
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const date = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }) : "soon";
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function lifecycleEmail(kind: LifecycleKind, c: EmailContext): EmailParts {
  const rec = PLANS[c.recommended.plan];
  const recLine = `For ${plural(c.usage.activeClients || c.totals.clients || 1, "active client")} a month, ${rec.name} comes to ${inr(c.recommended.subtotal)} a month before GST. Pay yearly and get 2 months free.`;
  switch (kind) {
    case "trial_upload_1":
      return {
        subject: "Your FynHelp trial starts with one bank statement",
        preheader: "The 14-day clock only starts when you upload.",
        heading: "Start with one client's bank statement",
        paragraphs: [
          `Your firm is set up on FynHelp. Upload one bank statement for one client and FynHelp reads every line, matches it against the books and shows you only what needs a decision.`,
          `Your free trial has not started yet. The 14 days begin with your first upload, so nothing is lost by waiting until you have a real file to hand.`,
        ],
        bullets: ["A CSV, Excel or PDF bank statement from any Indian bank", "A Tally day book or ledger export (XML or Excel), or connect Zoho Books", "Photos and scans work too"],
        cta: { label: "Upload a statement", path: "/app" },
      };
    case "trial_upload_4":
      return {
        subject: "Still deciding? Try FynHelp on last month's statement",
        preheader: "Ten minutes on one client is enough to judge it.",
        heading: "Ten minutes, one client",
        paragraphs: [
          `Most firms decide after closing one client. Pick last month's bank statement for any client, upload it, and add the Tally export if you have it. FynHelp matches the two and flags only the lines that disagree, each with a reason.`,
          `Your trial clock still has not started, and no card is needed.`,
        ],
        cta: { label: "Close one client now", path: "/app" },
        note: "Prefer a walkthrough? Reply to this email and we will set up a 15-minute call.",
      };
    case "trial_welcome":
      return {
        subject: "Your 14-day FynHelp trial has started",
        preheader: "Close one real client within your 14 days.",
        heading: "Your trial is running",
        paragraphs: [
          `Your first document is in, so your free trial has started. It runs until ${date(c.trialEndsAt)}.`,
          `You have 14 days. Run one reconciliation and make one MIS on your own data to take a real month-end through FynHelp before you pay anything.`,
        ],
        figures: [
          ["Active clients in the trial", `up to ${TRIAL_MAX_ACTIVE_CLIENTS}`],
          ["Documents in the trial", `up to ${TRIAL_MAX_DOCUMENTS}`],
          ["Users", "Unlimited"],
        ],
        cta: { label: "Continue your first close", path: "/app" },
      };
    case "trial_activated":
      return {
        subject: "You closed your first client on FynHelp",
        preheader: "You ran a reconciliation and made an MIS. Here is what to try next.",
        heading: "Your first close is done",
        paragraphs: [
          `You reconciled a client and made an MIS on your own data. Your free trial runs until ${date(c.trialEndsAt)}, so there is time to bring in your other clients.`,
          `Next, bring in your other clients for the month: forward client emails to your FynHelp Gmail intake, or let the Chaser ask clients for missing statements for you.`,
        ],
        cta: { label: "Add your next client", path: "/app/clients" },
      };
    case "trial_first_recon":
      return {
        subject: "Run your first reconciliation in FynHelp",
        preheader: "Bank against books, with every exception explained.",
        heading: "Your documents are in. Reconcile them.",
        paragraphs: [
          `You have ${plural(c.totals.documents, "document")} in FynHelp. Add the books side (a Tally export or Zoho Books) for the same client and month, then run Recon. Exact, fuzzy and your own rules run in turn, and you review only the lines left over.`,
          `Then make one MIS from it to see a complete close before your trial ends.`,
        ],
        cta: { label: "Run a reconciliation", path: "/app" },
      };
    case "trial_recap":
      return {
        subject: "Your first days on FynHelp, in numbers",
        preheader: `${plural(c.totals.documents, "document")} read so far.`,
        heading: "What your firm has done so far",
        paragraphs: [`Here is your trial to date, from your own data.`],
        figures: [
          ["Clients", c.totals.clients.toLocaleString("en-IN")],
          ["Documents read", c.totals.documents.toLocaleString("en-IN")],
          ["Bank lines matched", c.totals.matchedLines.toLocaleString("en-IN")],
          ["MIS reports", c.totals.reports.toLocaleString("en-IN")],
        ],
        bullets:
          c.totals.reports === 0
            ? ["Next: make an MIS for a reconciled client. Every figure in it links back to the lines behind it."]
            : ["Next: add the rest of this month's clients, so the trial shows you a whole month-end."],
        cta: { label: "Open FynHelp", path: "/app" },
      };
    case "trial_ending_5":
      return {
        subject: `${plural(c.trialDaysLeft ?? 5, "day")} left in your FynHelp trial`,
        preheader: "Choose a plan any time; you pay only from the day you choose.",
        heading: `Your trial ends on ${date(c.trialEndsAt)}`,
        paragraphs: [
          `You have ${plural(c.trialDaysLeft ?? 5, "day")} left. So far you have read ${plural(c.totals.documents, "document")}, matched ${plural(c.totals.matchedLines, "bank line")} and made ${plural(c.totals.reports, "MIS report")}.`,
          recLine,
        ],
        cta: { label: "Choose a plan", path: "/app/settings" },
        note: "Annual plans have a full refund within 30 days.",
      };
    case "trial_ending_2":
      return {
        subject: "Your FynHelp trial ends in 2 days",
        preheader: "Keep your work going without a gap.",
        heading: "Two days left",
        paragraphs: [
          `Your trial ends on ${date(c.trialEndsAt)}. After that, new work pauses but everything you have done stays readable, and you can pick up where you left off the moment you choose a plan.`,
          recLine,
        ],
        cta: { label: "Choose a plan", path: "/app/settings" },
        note: "Questions about plans? Reply to this email.",
      };
    case "trial_ended":
      return {
        subject: "Your FynHelp trial has ended. Your work is safe.",
        preheader: "Choose a plan to carry on where you left off.",
        heading: "Your trial has ended",
        paragraphs: [
          `New work is paused, but nothing is lost. Your clients, documents, matches and reports stay readable and exportable for 30 days.`,
          `Choose a plan and everything carries on as it was. ${recLine}`,
        ],
        cta: { label: "Choose a plan", path: "/app/settings" },
      };
    case "trial_winback":
      return {
        subject: "Your FynHelp work is still here",
        preheader: "Pick up this month's close where you left it.",
        heading: "Come back to a faster month-end",
        paragraphs: [
          `You read ${plural(c.totals.documents, "document")} and matched ${plural(c.totals.matchedLines, "bank line")} during your trial. All of it is still in your account.`,
          `If something did not work for your firm, reply and tell us. We read every reply, and a founder will answer.`,
        ],
        cta: { label: "Choose a plan", path: "/app/settings" },
      };
    case "usage_summary": {
      const p = c.previous!;
      const lines = p.arrears ? arrearsLines(c.plan, p.arrears) : [];
      const charged = p.arrears && p.arrears.subtotal > 0;
      return {
        subject: charged ? `Your FynHelp usage for ${monthName(p.month)}: ${inr(p.arrears!.total)} in extras` : `Your FynHelp month: ${monthName(p.month)}`,
        preheader: `${plural(p.activeClients, "active client")}, ${plural(p.documents, "document")}.`,
        heading: `${monthName(p.month)} at your firm`,
        paragraphs: charged
          ? [
              `Here is what your firm used last month on ${PLANS[c.plan].name}, and the extras billed for it.`,
              p.method === "addon"
                ? `The extras are added to your next subscription payment${p.nextPaymentDate ? ` on ${date(p.nextPaymentDate)}` : ""}; you do not need to do anything.`
                : `Razorpay has sent you an invoice for the extras. Pay it from the link below within 15 days.`,
            ]
          : [`Here is what your firm used last month on ${PLANS[c.plan].name}. Everything was inside your plan, so there is nothing extra to pay.`],
        figures: [
          ["Active clients", `${p.activeClients} (${PLANS[c.plan].clientsIncluded} included)`],
          ["Documents read", p.documents.toLocaleString("en-IN")],
          ["MIS reports made", p.reports.toLocaleString("en-IN")],
          ...(charged
            ? ([
                ["Extras before GST", inr(p.arrears!.subtotal)],
                ["GST", inr(p.arrears!.gst)],
                ["Extras total", inr(p.arrears!.total)],
              ] as [string, string][])
            : []),
        ],
        bullets: lines,
        cta: charged && p.method === "invoice" && p.payUrl ? { label: "Pay the invoice", path: p.payUrl } : { label: "See usage in Settings", path: "/app/settings" },
        note: charged ? "Clients you do not work on in a month are never charged. A GST invoice follows from Razorpay." : undefined,
      };
    }
    case "docs_100":
      return {
        subject: "You have used this month's FynHelp document allowance",
        preheader: "Uploads carry on. Extra documents are ₹499 per 250.",
        heading: "Document allowance used",
        paragraphs: [
          `Your firm has read ${plural(c.usage.documents, "document")} this month, which is your pooled allowance of ${(c.documentLimit ?? 0).toLocaleString("en-IN")}. Nothing is blocked: uploads carry on, and documents past the allowance are billed at ₹499 per 250 at the end of the month.`,
          `The allowance grows with every active client, so it usually takes care of itself in a busy month.`,
        ],
        cta: { label: "See usage", path: "/app/settings" },
      };
    case "docs_80":
      return {
        subject: "80% of this month's FynHelp documents used",
        preheader: "A heads-up, not a limit.",
        heading: "You are at 80% of this month's documents",
        paragraphs: [
          `Your firm has read ${plural(c.usage.documents, "document")} of its ${(c.documentLimit ?? 0).toLocaleString("en-IN")} this month. Work is never blocked; past the allowance it is ₹499 per 250 documents on the next bill.`,
        ],
        cta: { label: "See usage", path: "/app/settings" },
      };
    case "essential_cap": {
      const firm = PLANS.professional;
      return {
        subject: `${plural(c.usage.activeClients, "active client")} this month: Essential stops at 25`,
        preheader: "Firm may already cost about the same.",
        heading: "Your firm is outgrowing Essential",
        paragraphs: [
          `You have worked on ${plural(c.usage.activeClients, "client")} this month. Essential covers up to ${PLANS.starter.maxActiveClients} active clients; past that, new clients need Firm.`,
          `Firm is ${inr(firm.monthly)} a month for ${firm.clientsIncluded} active clients, then ${inr(firm.extraClient)} each, and adds the WhatsApp Chaser and your firm's branding on MIS exports. ${recLine}`,
        ],
        cta: { label: "Compare plans", path: "/app/settings" },
      };
    }
    case "inactive":
      return {
        subject: "Anything we can help with on FynHelp?",
        preheader: "It has been two weeks since your last upload.",
        heading: "It has gone quiet",
        paragraphs: [
          `Nothing has been uploaded or reconciled for your firm in two weeks. If that is a quiet patch, no action needed: clients you do not work on are free.`,
          `If something got in the way (a bank format we did not read, a client who will not send statements), reply and tell us. We fix formats quickly, and the Chaser can follow up with clients for you.`,
        ],
        cta: { label: "Open FynHelp", path: "/app" },
      };
    case "month_end_prep": {
      const names = c.dormantClientNames.slice(0, 8);
      const more = c.dormantClientNames.length - names.length;
      return {
        subject: `Month-end: ${plural(c.dormantClientNames.length, "client")} with nothing in yet`,
        preheader: "Ask for statements now and close on time.",
        heading: "Get ahead of month-end",
        paragraphs: [`These clients were active last month but have no documents in FynHelp this month yet. The Chaser can ask them for statements by email${c.plan === "starter" ? "" : " or WhatsApp"} and follow up on its own.`],
        bullets: [...names, ...(more > 0 ? [`and ${more} more`] : [])],
        cta: { label: "Open the Chaser", path: "/app/chaser" },
      };
    }
  }
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML and text versions of an email. `appUrl` turns relative button paths into links. */
export function renderEmail(parts: EmailParts, opts: { appUrl: string; firmName: string; unsubscribeUrl: string | null; category: "billing" | "lifecycle" }) {
  const link = (path: string) => (/^https?:\/\//.test(path) ? path : `${opts.appUrl.replace(/\/$/, "")}${path}`);
  const footer =
    opts.category === "billing"
      ? "You get this email because your firm has a paid FynHelp plan. Questions about billing: billing@fynhelp.com."
      : opts.unsubscribeUrl
        ? "You get these emails to help your firm get the most out of FynHelp."
        : "You get these emails to help your firm get the most out of FynHelp. A partner can turn them off in Settings.";

  const text = [
    `Hello ${opts.firmName},`,
    "",
    parts.heading,
    "",
    ...parts.paragraphs.flatMap((p) => [p, ""]),
    ...(parts.figures?.length ? [...parts.figures.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(parts.bullets?.length ? [...parts.bullets.map((b) => `- ${b}`), ""] : []),
    ...(parts.cta ? [`${parts.cta.label}: ${link(parts.cta.path)}`, ""] : []),
    ...(parts.note ? [parts.note, ""] : []),
    "The FynHelp team",
    "",
    "--",
    footer,
    ...(opts.category === "lifecycle" && opts.unsubscribeUrl ? [`Stop these emails: ${opts.unsubscribeUrl}`] : []),
  ].join("\n");

  const fig = parts.figures?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 18px;background:#F6F1E8;border-radius:12px">${parts.figures
        .map(
          ([k, v], i) =>
            `<tr><td style="padding:10px 16px;font-size:14px;color:#5A534A;${i ? "border-top:1px solid #E9E1D3;" : ""}">${esc(k)}</td><td style="padding:10px 16px;font-size:14px;font-weight:600;text-align:right;color:#171208;${i ? "border-top:1px solid #E9E1D3;" : ""}">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const bullets = parts.bullets?.length
    ? `<ul style="margin:0 0 18px;padding-left:20px;color:#3A342C">${parts.bullets.map((b) => `<li style="margin:4px 0">${esc(b)}</li>`).join("")}</ul>`
    : "";
  const cta = parts.cta
    ? `<p style="margin:22px 0 8px"><a href="${esc(link(parts.cta.path))}" style="display:inline-block;background:#E2673F;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:15px">${esc(parts.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F2EDE4">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(parts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2EDE4"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF9;border-radius:18px;border:1px solid #E9E1D3">
<tr><td style="padding:26px 28px 6px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:700;font-size:18px;color:#171208">FynHelp</td></tr>
<tr><td style="padding:6px 28px 26px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3A342C">
<p style="margin:0 0 14px">Hello ${esc(opts.firmName)},</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#171208">${esc(parts.heading)}</h1>
${parts.paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join("")}
${fig}${bullets}${cta}
${parts.note ? `<p style="margin:10px 0 0;font-size:13px;color:#6B645A">${esc(parts.note)}</p>` : ""}
<p style="margin:22px 0 0">The FynHelp team</p>
</td></tr></table>
<p style="max-width:560px;margin:14px auto 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8A8276">${esc(footer)}${
    opts.category === "lifecycle" && opts.unsubscribeUrl ? ` <a href="${esc(opts.unsubscribeUrl)}" style="color:#8A8276">Stop these emails</a>.` : ""
  }</p>
</td></tr></table></body></html>`;
  return { html, text };
}
