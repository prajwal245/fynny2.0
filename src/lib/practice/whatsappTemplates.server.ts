/**
 * Reads the firm's message templates from Meta and decides which one each reminder uses.
 * The list is kept for a few minutes (it is small and changes rarely), per WhatsApp Business Account.
 * If Meta cannot be asked (no account id, no token, network), the older behaviour applies: the template
 * named in the settings, and buttons only when WHATSAPP_CHASE_BUTTONS says so.
 */
import {
  buttonLayoutOf,
  pickTemplate,
  stageForStep,
  templateCandidates,
  templateStatus,
  type ButtonLayout,
  type ChaseStage,
  type MetaTemplate,
  type TemplateStatus,
} from "./whatsappFlow";
import type { Sender } from "./whatsappSend.server";

const GRAPH = process.env["WHATSAPP_GRAPH_BASE"] || "https://graph.facebook.com/v21.0";
const env = (n: string) => (process.env[n] ?? "").trim() || undefined;
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; list: MetaTemplate[] }>();

export const templateEnv = () => ({ request: env("WHATSAPP_CHASE_TEMPLATE"), followup: env("WHATSAPP_FOLLOWUP_TEMPLATE"), final: env("WHATSAPP_FINAL_TEMPLATE") });
const language = () => env("WHATSAPP_TEMPLATE_LANG") ?? "en";

/** Clears the kept list (tests, and after a firm changes its number). */
export const forgetTemplates = () => cache.clear();

export async function listTemplates(sender: Pick<Sender, "wabaId" | "token">, now = Date.now()): Promise<MetaTemplate[] | null> {
  if (!sender.wabaId) return null;
  const hit = cache.get(sender.wabaId);
  if (hit && now - hit.at < TTL_MS) return hit.list;
  try {
    const res = await fetch(`${GRAPH}/${sender.wabaId}/message_templates?fields=name,status,language,category,components&limit=200`, {
      headers: { Authorization: `Bearer ${sender.token}` },
    });
    if (!res.ok) return hit?.list ?? null;
    const body = (await res.json()) as { data?: MetaTemplate[] };
    const list = body.data ?? [];
    cache.set(sender.wabaId, { at: now, list });
    return list;
  } catch {
    return hit?.list ?? null;
  }
}

export interface ResolvedTemplate {
  name: string;
  layout: ButtonLayout | null;
  /** The language code to send with: the one Meta approved it in. */
  language: string;
  /** Meta was asked and none of the candidate templates is approved: sending one would only fail. */
  none?: boolean;
}

/** The legacy rule, used when Meta cannot be asked. */
function legacy(step: number): ResolvedTemplate {
  const e = templateEnv();
  const stage = stageForStep(step);
  const name = stage === "request" ? (e.request ?? "document_request") : stage === "followup" ? (e.followup ?? e.request ?? "document_request") : (e.final ?? e.followup ?? e.request ?? "document_request");
  const v = (env("WHATSAPP_CHASE_BUTTONS") ?? "").toLowerCase();
  return { name, layout: v === "qr_first" ? "qr_first" : v === "on" || v === "url_first" ? "url_first" : null, language: language() };
}

/**
 * The template and buttons for a reminder. WHATSAPP_CHASE_BUTTONS=off forces body-only; any other value
 * forces that button order; otherwise the order is read from the approved template itself.
 */
export async function resolveTemplate(sender: Pick<Sender, "wabaId" | "token">, step: number): Promise<ResolvedTemplate> {
  const list = await listTemplates(sender);
  const picked = list ? pickTemplate(list, templateCandidates(stageForStep(step), templateEnv()), language()) : null;
  if (!picked) return { ...legacy(step), ...(list ? { none: true } : {}) };
  const forced = (env("WHATSAPP_CHASE_BUTTONS") ?? "").toLowerCase();
  if (forced === "off") return { name: picked.name, layout: null, language: picked.language };
  if (picked.layout && (forced === "qr_first" || forced === "url_first")) return { name: picked.name, layout: forced, language: picked.language };
  return picked;
}

export interface StageView {
  stage: ChaseStage;
  label: string;
  /** What a client gets for this stage right now. */
  using: string | null;
  status: TemplateStatus | "unknown";
  buttons: boolean;
  /** One plain sentence for the person looking at Settings. */
  note: string;
}

const LABEL: Record<ChaseStage, string> = { request: "First request", followup: "Gentle reminder", final: "Final reminder" };
const STEP: Record<ChaseStage, number> = { request: 1, followup: 2, final: 3 };

/** What each stage of a chase will send, for the Settings panel. */
export async function stagesView(sender: Pick<Sender, "wabaId" | "token"> | null): Promise<StageView[]> {
  const list = sender ? await listTemplates(sender) : null;
  return (["request", "followup", "final"] as ChaseStage[]).map((stage) => {
    if (!list) {
      const l = legacy(STEP[stage]);
      return { stage, label: LABEL[stage], using: l.name, status: "unknown", buttons: Boolean(l.layout), note: "FynHelp cannot read your templates from Meta yet. Add the WhatsApp Business Account ID (WHATSAPP_WABA_ID) so it can pick the right one on its own." };
    }
    const wanted = templateCandidates(stage, templateEnv())[0];
    const wantedT = list.find((t) => t.name === wanted && (t.language === language() || t.language.startsWith(language())));
    const st = templateStatus(wantedT);
    const picked = pickTemplate(list, templateCandidates(stage, templateEnv()), language());
    const usingWanted = picked?.name === wanted;
    const note =
      st === "approved" && usingWanted
        ? picked?.layout
          ? "Ready. Clients get the Upload documents button and three quick replies."
          : "Ready. This template has no buttons yet, so clients reply with text."
        : st === "review"
          ? `"${wanted}" is in review with Meta. ${picked ? `Until it is approved, "${picked.name}" is used.` : "Nothing can be sent as a template until a template is approved."}`
          : st === "rejected"
            ? `Meta rejected "${wanted}". Reword it and submit it again.${picked ? ` "${picked.name}" is used meanwhile.` : ""}`
            : st === "marketing"
              ? `Meta classed "${wanted}" as Marketing, which costs far more per message. Reword it plainly and resubmit as Utility.${picked ? ` "${picked.name}" is used meanwhile.` : ""}`
              : st === "unsupported"
                ? `"${wanted}" has buttons FynHelp cannot fill in. It needs one Upload documents link and three quick replies.`
                : st === "paused"
                  ? `Meta has paused "${wanted}" because of low quality. ${picked ? `"${picked.name}" is used meanwhile.` : ""}`
                  : `"${wanted}" does not exist in WhatsApp Manager yet.${picked ? ` "${picked.name}" is used meanwhile.` : ""}`;
    return { stage, label: LABEL[stage], using: picked?.name ?? null, status: st, buttons: Boolean(picked?.layout), note };
  });
}

export { buttonLayoutOf };

/**
 * One line of the connection check for a stage. Red only when the stage has nothing it can send. A template still
 * in review with an older approved one in use, or a final reminder that borrows the follow-up, is working as designed.
 */
export function stageHealth(st: StageView): { ok: boolean | null; detail: string } {
  const ok = st.status === "approved" ? true : st.using ? null : st.status === "unknown" ? null : false;
  return { ok, detail: st.note };
}
