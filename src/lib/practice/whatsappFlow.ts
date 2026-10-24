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

export function buildTemplateMessage(to: string, template: string, language: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: language },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  };
}

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
      return { permanent: true, message: "The template's fields do not match what FynHelp sends. The template needs four body fields." };
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
