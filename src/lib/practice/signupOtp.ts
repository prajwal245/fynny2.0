/**
 * Sign-up verification of the mobile number by a code sent on WhatsApp. Pure and stateless: the code is derived
 * from a server secret, the number and a 10-minute slot, so nothing is stored and a code cannot be guessed
 * without the secret. The caller limits how often codes are asked for and tried.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const OTP_SLOT_MS = 10 * 60_000;
export const PROOF_TTL_MS = 30 * 60_000;

const hmac = (secret: string, text: string) => createHmac("sha256", secret).update(text).digest();

/** The 6-digit code for a number in the slot containing `now`. */
export function otpCode(secret: string, digits: string, now: number): string {
  const slot = Math.floor(now / OTP_SLOT_MS);
  return String(hmac(secret, `otp:${digits}:${slot}`).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** True for the current slot's code and the one before it (so a code typed just after the change still works). */
export function otpMatches(secret: string, digits: string, typed: string, now: number): boolean {
  const t = typed.replace(/\D/g, "");
  if (t.length !== 6) return false;
  return same(t, otpCode(secret, digits, now)) || same(t, otpCode(secret, digits, now - OTP_SLOT_MS));
}

/** Proof that a number was verified, handed back to the browser and checked when the account is created. */
export function makeProof(secret: string, digits: string, now: number): string {
  const exp = now + PROOF_TTL_MS;
  return `${exp}.${hmac(secret, `proof:${digits}:${exp}`).toString("hex")}`;
}

export function proofValid(secret: string, digits: string, proof: string | null | undefined, now: number): boolean {
  const [exp, sig] = String(proof ?? "").split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return same(sig, hmac(secret, `proof:${digits}:${exp}`).toString("hex"));
}

/** Numbers no real person has: 9999999999, 9876543210, 1111122222 and the like. */
export function looksFake(digits10: string): boolean {
  if (/^(\d)\1{9}$/.test(digits10)) return true;
  if (/^(0123456789|1234567890|9876543210|0987654321)$/.test(digits10)) return true;
  return new Set(digits10).size <= 2;
}
