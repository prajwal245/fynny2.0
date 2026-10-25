/**
 * Test firms, server side: who is one, and a mailer that cannot reach real people from one.
 */
import type { Db } from "./db.server";
import { PracticeError } from "./core";
import { sendEmail, type SendResult } from "./email.server";
import { emailAllowedInTest } from "./testMode";

export async function isTestFirm(db: Db, firmId: string): Promise<boolean> {
  const { data } = await db.from("ca_firms").select("is_test").eq("id", firmId).maybeSingle();
  return Boolean(data?.is_test);
}

/** Money and plan actions are refused on a test firm: it has every feature and is never charged. */
export async function assertNotTest(db: Db, firmId: string): Promise<void> {
  if (await isTestFirm(db, firmId))
    throw new PracticeError("test_firm", "This is a test account. It already has every feature switched on and is never billed.");
}

type Mail = Parameters<typeof sendEmail>[0];

/**
 * Sends an email on a firm's behalf. A test firm reaches only the team's own addresses (and TEST_RECIPIENTS);
 * every other recipient is recorded as sent but nothing leaves the server.
 */
export async function sendFirmEmail(db: Db, firmId: string, msg: Mail): Promise<SendResult> {
  if ((await isTestFirm(db, firmId)) && !emailAllowedInTest(msg.to, process.env["TEST_RECIPIENTS"]))
    return { sent: false, simulated: true, sandbox: true, provider_id: null, error: null };
  return sendEmail(msg);
}
