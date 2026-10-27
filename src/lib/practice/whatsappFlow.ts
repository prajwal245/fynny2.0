/**
 * The decisions around WhatsApp Business Cloud API messages, as pure functions
 * so each is tested on its own: how a chase becomes a template message, what
 * Meta's error codes mean, and what an inbound text is.
 */

export interface ChaseTemplateInput {
  contactName: string;
  clientName: string;
  items: string[];
  firmName: string;
}

/** Template parameters may not contain newlines, tabs or runs of spaces, and are capped by Meta. */
export const waParam = (s: string, max = 200) =>
  s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, max) || "-";

/**
 * Body of the approved template "document_request" (en):
 *   Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}.
 *   Please reply here with the file attached. Thank you.
 */
export function chaseTemplateParams(i: ChaseTemplateInput): string[] {
  const items = i.items.length <= 3 ? i.items.join(", ") : `${i.items.slice(0, 3).join(", ")} and ${i.items.length - 3} more`;
  return [waParam(i.contactName || "there", 60), waParam(i.clientName, 80), waParam(items, 300), waParam(i.firmName, 80)];
}

export type TemplateComponent = Record<string, unknown>;

export function buildTemplateMessage(to: string, template: string, language: string, params: string[], buttons: TemplateComponent[] = []) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: language },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }, ...buttons],
    },
  };
}

/* ── buttons on the chase ──
 * The approved template "document_request_v2" has four buttons:
 *   URL          "Upload documents"  https://fynhelp.com/u/{{1}}   (one variable, at the end, as Meta requires)
 *   Quick reply  "Sending today", "Need more time", "Stop reminders"
 * A tap on a quick reply comes back as a payload "chase:<chase id>:<action>"; any tap also opens
 * the 24-hour window in which the client's files and our answers cost nothing.
 */

export type ChaseAction = "sending" | "later" | "stop" | "in1" | "in3" | "in7";
/** The three buttons on every reminder. The "in…" actions are the answers to "When can you send it?". */
export const CHASE_ACTIONS: ChaseAction[] = ["sending", "later", "stop"];
export const DATE_ACTIONS: ChaseAction[] = ["in1", "in3", "in7"];
export const CHASE_BUTTON_LABEL: Record<ChaseAction, string> = {
  sending: "Sending today",
  later: "Need more time",
  stop: "Stop reminders",
  in1: "Tomorrow",
  in3: "In 3 days",
  in7: "Next week",
};
export const UPLOAD_BUTTON_LABEL = "Upload documents";

export const chasePayload = (chaseId: string, action: ChaseAction) => `chase:${chaseId}:${action}`;

const PAYLOAD_RE = /^chase:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(sending|later|stop|in1|in3|in7)$/i;
export function parseChasePayload(p: string | null | undefined): { chaseId: string; action: ChaseAction } | null {
  const m = PAYLOAD_RE.exec(p ?? "");
  return m ? { chaseId: m[1].toLowerCase(), action: m[2].toLowerCase() as ChaseAction } : null;
}

/**
 * What a tap does. `pauseDays`: no reminder before then. `askDate`: follow up with "When can you send it?"
 * `exact`: the pause is the client's promise, so it replaces any other pause instead of only extending it.
 */
export interface ChaseActionRule {
  pauseDays: number;
  stop: boolean;
  askDate: boolean;
  exact: boolean;
  note: string;
  reply: (uploadUrl: string | null) => string;
}
const sendHere = (u: string | null) => `Send it here whenever you are ready${u ? `, or upload it here: ${u}` : ""}.`;
export const CHASE_ACTION_RULES: Record<ChaseAction, ChaseActionRule> = {
  sending: {
    pauseDays: 1,
    stop: false,
    askDate: false,
    exact: false,
    note: "Client said they are sending it today.",
    reply: (u) => `Thank you. ${sendHere(u)} We will not remind you again until tomorrow.`,
  },
  // Safe default first (3 days), then the client can say exactly when.
  later: {
    pauseDays: 3,
    stop: false,
    askDate: true,
    exact: false,
    note: "Client asked for more time.",
    reply: () => "No problem. When can you send it?",
  },
  in1: { pauseDays: 2, stop: false, askDate: false, exact: true, note: "Client promised it for tomorrow.", reply: (u) => `Thank you, we will wait until tomorrow. ${sendHere(u)}` },
  in3: { pauseDays: 4, stop: false, askDate: false, exact: true, note: "Client promised it within 3 days.", reply: (u) => `Thank you, we will check back in 3 days. ${sendHere(u)}` },
  in7: { pauseDays: 8, stop: false, askDate: false, exact: true, note: "Client promised it by next week.", reply: (u) => `Thank you, we will check back next week. ${sendHere(u)}` },
  stop: {
    pauseDays: 0,
    stop: true,
    askDate: false,
    exact: false,
    note: "Client asked to stop reminders.",
    reply: () => "Understood. We have stopped the reminders. If you change your mind, just send the file here.",
  },
};

/** The component list for the template's buttons. `layout` is the order the buttons were created in. */
export type ButtonLayout = "url_first" | "qr_first";
export function chaseButtonComponents(layout: ButtonLayout, uploadToken: string, chaseId: string): TemplateComponent[] {
  const url = { type: "button", sub_type: "url", parameters: [{ type: "text", text: uploadToken }] };
  const qr = CHASE_ACTIONS.map((a) => ({ type: "button", sub_type: "quick_reply", parameters: [{ type: "payload", payload: chasePayload(chaseId, a) }] }));
  const ordered = layout === "url_first" ? [url, ...qr] : [...qr, url];
  return ordered.map((c, i) => ({ ...c, index: String(i) }));
}

/** Reply buttons in a free-form message (WhatsApp allows three, titles up to 20 characters). */
export const buildButtons = (to: string, body: string, buttons: { id: string; title: string }[]) => ({
  messaging_product: "whatsapp",
  to,
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: body.slice(0, 1024) },
    action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
  },
});

/** The three chase buttons inside the window. */
export const buildReplyButtons = (to: string, body: string, chaseId: string) =>
  buildButtons(to, body, CHASE_ACTIONS.map((a) => ({ id: chasePayload(chaseId, a), title: CHASE_BUTTON_LABEL[a] })));

/** "When can you send it?" */
export const buildDateButtons = (to: string, body: string, chaseId: string) =>
  buildButtons(to, body, DATE_ACTIONS.map((a) => ({ id: chasePayload(chaseId, a), title: CHASE_BUTTON_LABEL[a] })));

/** A tap on a button, whichever way Meta delivers it (template quick reply or interactive reply). */
export function buttonPayloadOf(m: { type: string; button?: { payload?: string; text?: string }; interactive?: { button_reply?: { id?: string } } }): string | null {
  if (m.type === "button") return m.button?.payload ?? null;
  if (m.type === "interactive") return m.interactive?.button_reply?.id ?? null;
  return null;
}

/** The free-form message inside the window: the same words, plus the upload link. */
export const chaseTextWithLink = (p: string[], uploadUrl: string | null, step = 1) =>
  `${chaseText(p, step)}${uploadUrl ? `\n\nOr upload here, no login needed: ${uploadUrl}` : ""}`;

export interface WaSendError {
  /** Retrying the same message will not help. */
  permanent: boolean;
  /** What to tell the person, in plain words. */
  message: string;
}

/** Meta error codes the Chaser can hit, in words a CA firm can act on. */
export function explainWaError(code: number | undefined, raw: string | undefined): WaSendError {
  const detail = raw ? ` (${raw})` : "";
  switch (code) {
    case 131026:
      return { permanent: true, message: "That number is not on WhatsApp or cannot receive this message. Use email or call the client." };
    case 131030:
      return { permanent: true, message: "The number is not on the allowed list for this WhatsApp test number. Add it in Meta's WhatsApp Manager, or move to a live number." };
    case 131047:
      return { permanent: true, message: "More than 24 hours since the client last wrote, so only an approved template can be sent. Check that the template is approved." };
    case 132001:
      return { permanent: true, message: "The message template is not approved or does not exist in this language. Check the template name in Meta's WhatsApp Manager." };
    case 132000:
    case 132012:
      return { permanent: true, message: "The template's fields do not match what FynHelp sends. The template needs four body fields, and when buttons are switched on, the four buttons (Upload documents, Sending today, Need more time, Stop reminders)." };
    case 131056:
    case 130429:
    case 131048:
      return { permanent: false, message: "WhatsApp is limiting messages right now. FynHelp will try again later." };
    case 190:
    case 102:
      return { permanent: true, message: "The WhatsApp access token has expired or is invalid. Create a new permanent token and update it." };
    case 100:
      return { permanent: true, message: `WhatsApp rejected the request${detail}. Check the phone number ID.` };
    default:
      return { permanent: false, message: `WhatsApp could not send this message${detail}.` };
  }
}

const STOP_RE = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|do not (?:message|contact|disturb)|dont (?:message|contact)|band karo|mat bhejo)\b/i;

/** What an inbound text means for the chase. Documents are handled separately. */
export function classifyInbound(text: string | null | undefined): "stop" | "reply" {
  return STOP_RE.test(text ?? "") ? "stop" : "reply";
}

export type WaDelivery = "sent" | "delivered" | "read" | "failed";
const RANK: Record<WaDelivery, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
export const isWaDelivery = (s: unknown): s is WaDelivery => typeof s === "string" && s in RANK;
/** Meta can deliver statuses out of order; never go backwards (read, then a late "delivered"). */
export const advances = (from: WaDelivery | null, to: WaDelivery) => !from || RANK[to] > RANK[from];

/**
 * WhatsApp lets a business send free-form text for 24 hours after the customer last
 * wrote. We stop an hour short so a message never lands right on the edge.
 */
export const SERVICE_WINDOW_MS = 23 * 3_600_000;
export const inServiceWindow = (lastInboundAt: string | null | undefined, now: Date = new Date()): boolean => {
  if (!lastInboundAt) return false;
  const age = now.getTime() - Date.parse(lastInboundAt);
  return Number.isFinite(age) && age >= 0 && age < SERVICE_WINDOW_MS;
};

/**
 * The same wording as the three approved templates, for free-form sends inside the window.
 * Step 1 asks, step 2 is a gentle reminder, step 3 is the last one before the partner is told.
 */
export const chaseText = (p: string[], step = 1) =>
  step <= 1
    ? `Hello ${p[0]}, this is ${p[3]}. For ${p[1]} we are still waiting for: ${p[2]}. Please reply here with the file attached. Thank you.`
    : step === 2
      ? `Hello ${p[0]}, a gentle reminder from ${p[3]}. For ${p[1]} we are still waiting for: ${p[2]}. Please reply here with the file attached, or use the buttons below. Thank you.`
      : `Hello ${p[0]}, this is ${p[3]} with a final reminder. For ${p[1]} we still need: ${p[2]}. Please send it here, or tell us when you can, so we can complete the work on time. Thank you.`;

/** Which approved template a reminder uses: the first request, a gentle follow-up, or the final one. */
export type ChaseStage = "request" | "followup" | "final";
export const stageForStep = (step: number): ChaseStage => (step <= 1 ? "request" : step === 2 ? "followup" : "final");

export const buildTextMessage = (to: string, body: string) => ({
  messaging_product: "whatsapp",
  to,
  type: "text",
  text: { body: body.slice(0, 4096), preview_url: false },
});

/** 131047: the window had already closed; the caller retries with the template. */
export const windowClosed = (code: number | undefined) => code === 131047;

/* ── which number a firm uses ── */

export type WaSenderChoice = "fynhelp" | "own";

/**
 * The number a firm sends from and receives on. The firm's choice wins when it can be used;
 * with no choice, a linked number of its own is kept (that is how firms connected before this
 * option existed), otherwise FynHelp's shared number. Null when neither exists.
 */
export function chooseSender(i: { pref: unknown; hasOwn: boolean; sharedConfigured: boolean }): WaSenderChoice | null {
  if (i.pref === "own" && i.hasOwn) return "own";
  if (i.pref === "fynhelp" && i.sharedConfigured) return "fynhelp";
  if (i.hasOwn) return "own";
  if (i.sharedConfigured) return "fynhelp";
  return null;
}

/** "JOIN K7M2QX": the client links their phone to a firm on the shared number. */
export const parseJoinCode = (text: string | null | undefined): string | null => {
  const m = /^\s*join\s+([A-Za-z0-9]{6})\s*$/i.exec(text ?? "");
  return m ? m[1].toUpperCase() : null;
};

// No 0/O/1/I/L: codes get read out and typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newJoinCode = (rand: () => number = Math.random): string =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]).join("");

/**
 * A phone number written to FynHelp's shared number is matched to a firm by the phone numbers
 * in the firms' client lists. Only an unambiguous match is used: exactly one firm. Two firms
 * with a client on the same number, or none, means the client must send the firm's JOIN code.
 */
export function pickAutoRoute(firmIds: string[]): string | null {
  const distinct = [...new Set(firmIds)];
  return distinct.length === 1 ? distinct[0] : null;
}

/** The last 10 digits, the same key the database stores for every client phone. */
export const phoneTail = (raw: string | null | undefined): string | null => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};

/* ── choosing the template from what Meta has approved ──
 * The app reads the firm's templates from Meta and uses, for each stage of a chase, the first template
 * that is approved, is not Marketing, and has either no buttons or exactly ours (one URL with a single
 * trailing variable, plus three quick replies). While a new template is still in review, the older approved
 * one keeps working, so nobody has to flip a setting at the right moment.
 */
export interface MetaTemplate {
  name: string;
  status: string;
  language: string;
  category?: string;
  components?: { type: string; buttons?: { type: string; url?: string; text?: string }[] }[];
}

/** "none": no buttons. A layout: exactly our four buttons. "other": buttons we cannot fill in. */
export function buttonLayoutOf(t: Pick<MetaTemplate, "components">): ButtonLayout | "none" | "other" {
  const bar = (t.components ?? []).find((c) => c.type === "BUTTONS");
  if (!bar?.buttons?.length) return "none";
  const b = bar.buttons;
  const urls = b.filter((x) => x.type === "URL");
  const qrs = b.filter((x) => x.type === "QUICK_REPLY");
  if (b.length !== 4 || urls.length !== 1 || qrs.length !== 3) return "other";
  if (!/\{\{1\}\}$/.test(urls[0].url ?? "")) return "other";
  if (b[0].type === "URL") return "url_first";
  if (b[3].type === "URL") return "qr_first";
  return "other";
}

export type TemplateStatus = "approved" | "review" | "rejected" | "paused" | "marketing" | "missing" | "unsupported";

export function templateStatus(t: MetaTemplate | undefined): TemplateStatus {
  if (!t) return "missing";
  const s = t.status.toUpperCase();
  if (s === "PENDING" || s === "IN_APPEAL") return "review";
  if (s === "REJECTED" || s === "DISABLED") return "rejected";
  if (s === "PAUSED") return "paused";
  if (s !== "APPROVED") return "review";
  if ((t.category ?? "").toUpperCase() === "MARKETING") return "marketing";
  if (buttonLayoutOf(t) === "other") return "unsupported";
  return "approved";
}

/** The names to try for a stage, best first, ending with the older template that is already approved. */
export function templateCandidates(stage: ChaseStage, env: { request?: string; followup?: string; final?: string }): string[] {
  const legacy = "document_request";
  const list =
    stage === "request"
      ? [env.request ?? "document_request_v2", legacy, env.followup ?? "document_followup_v2", env.final ?? "document_final_v2"]
      : stage === "followup"
        ? [env.followup ?? "document_followup_v2", env.request ?? "document_request_v2", legacy]
        : [env.final ?? "document_final_v2", env.followup ?? "document_followup_v2", env.request ?? "document_request_v2", legacy];
  return [...new Set(list)];
}

/** The first usable candidate, with the button layout to send it with. Null when none is approved. */
export function pickTemplate(templates: MetaTemplate[], candidates: string[], language: string): { name: string; layout: ButtonLayout | null; /** The language code Meta approved it in, which is the one a send must use ("en" and "en_US" are different to Meta). */ language: string } | null {
  for (const name of candidates) {
    const t = templates.find((x) => x.name === name && x.language === language) ?? templates.find((x) => x.name === name && x.language.startsWith(language));
    if (templateStatus(t) !== "approved") continue;
    const layout = buttonLayoutOf(t!);
    return { name, layout: layout === "none" || layout === "other" ? null : layout, language: t!.language };
  }
  return null;
}

/**
 * A WhatsApp Business Account ID (or phone number ID) is only digits. People paste them from chats and documents
 * with extra characters around them ("$$\\mathbf{2457752908089073}$$", spaces, quotes), which Meta rejects. Keep
 * the digits; anything that is not 6 to 20 digits is no ID at all.
 */
export function cleanMetaId(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 6 && d.length <= 20 ? d : null;
}
