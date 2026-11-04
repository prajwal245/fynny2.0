/**
 * Sign-up mobile verification on WhatsApp (server side). On only when WHATSAPP_OTP_TEMPLATE names an approved
 * Authentication template and FynHelp's WhatsApp number is set up; otherwise sign-up works as before, so nobody is
 * locked out before Meta approves the template. Meta bills a delivered message only, and a number that is not on
 * WhatsApp fails at once, which is how a wrong number is caught while the person is still on the form.
 */
import { buildTemplateMessage, explainWaError } from "./whatsappFlow";
import { post } from "./whatsappSend.server";
import { touchSender } from "./touchpoints/whatsapp.server";
import { makeProof, otpCode, otpMatches, proofValid, looksFake } from "./signupOtp";
import { parseMobile } from "./mobile";
import { checkRateLimit, POLICIES } from "../rateLimit.server";

const env = (n: string) => (process.env[n] ?? "").trim() || undefined;
const secret = () => env("SIGNUP_OTP_SECRET") ?? env("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const otpRequired = () => Boolean(env("WHATSAPP_OTP_TEMPLATE") && touchSender() && secret());

export type SendResult = { ok: true; required: boolean; display?: string } | { ok: false; message: string };

export async function sendSignupOtp(phone: string, ip: string): Promise<SendResult> {
  const mobile = parseMobile(phone);
  if (!mobile) return { ok: false, message: "Enter a valid mobile number, for example 98200 11223." };
  if (mobile.digits.startsWith("91") && looksFake(mobile.digits.slice(2))) return { ok: false, message: "That does not look like a real mobile number. Please check it." };
  if (!otpRequired()) return { ok: true, required: false };
  for (const [p, subject, msg] of [
    [POLICIES.otpGap, mobile.digits, "A code was just sent. Please wait 30 seconds before asking again."],
    [POLICIES.otpPhone, mobile.digits, "Too many codes were requested for this number today. Please try again tomorrow or contact support@fynhelp.com."],
    [POLICIES.otpIp, ip, "Too many requests from this network. Please try again later."],
  ] as const) {
    const d = await checkRateLimit(p, subject);
    if (!d.allowed) return { ok: false, message: msg };
  }
  const code = otpCode(secret(), mobile.digits, Date.now());
  const sender = touchSender()!;
  // Authentication templates carry the code in the body and in the Copy code button.
  const message = buildTemplateMessage(mobile.digits, env("WHATSAPP_OTP_TEMPLATE")!, env("WHATSAPP_TEMPLATE_LANG") ?? "en", [code], [
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] } as never,
  ]);
  try {
    const res = await post(sender, message);
    if (res.ok) return { ok: true, required: true, display: mobile.display };
    const why = explainWaError(res.body.error?.code, res.body.error?.error_data?.details ?? res.body.error?.message);
    if (res.body.error?.code === 131026) return { ok: false, message: "This number is not on WhatsApp. Please check it, or use the number that has WhatsApp." };
    console.error(`[signup-otp] send failed: ${why.internal ?? why.message}`);
    return { ok: false, message: "We could not send the code just now. Please try again in a minute." };
  } catch (e) {
    console.error(`[signup-otp] send error: ${(e as Error).message}`);
    return { ok: false, message: "We could not send the code just now. Please try again in a minute." };
  }
}

export async function verifySignupOtp(phone: string, code: string): Promise<{ ok: true; proof: string } | { ok: false; message: string }> {
  const mobile = parseMobile(phone);
  if (!mobile || !otpRequired()) return { ok: false, message: "Enter your mobile number again." };
  const d = await checkRateLimit(POLICIES.otpVerify, mobile.digits);
  if (!d.allowed) return { ok: false, message: "Too many wrong codes. Please ask for a new code in a few minutes." };
  if (!otpMatches(secret(), mobile.digits, code, Date.now())) return { ok: false, message: "That code is not right. Check the WhatsApp message and try again." };
  return { ok: true, proof: makeProof(secret(), mobile.digits, Date.now()) };
}

/** At account creation: true when verification is off, or the proof is for this number. */
export function phoneProofOk(digits: string, proof: string | undefined): boolean {
  return !otpRequired() || proofValid(secret(), digits, proof, Date.now());
}
