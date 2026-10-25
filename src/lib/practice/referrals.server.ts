/**
 * Referrals, server side. A firm shares its code; a new firm that joins with it and adds a first
 * client earns both firms one extra month. Every step is recorded once (unique keys in the
 * database), so a retry or a double click can never reward twice.
 */
import { PracticeError } from "./core";
import type { Db, FirmContext } from "./db.server";
import { logActivity } from "./db.server";
import { sendEmail } from "./email.server";
import { PLANS } from "./billing/plans";
import {
  eligibleToRefer,
  extendTrial,
  MAX_REWARD_MONTHS_PER_YEAR,
  monthlyValue,
  newReferralCode,
  parseReferralCode,
  referrerHasRoom,
  REFERRAL_REWARD_MONTHS,
  REFUSAL_TEXT,
  REWARD_DAYS,
  rewardMode,
  type FirmFacts,
} from "./referrals";

const firmFacts = async (db: Db, id: string): Promise<(FirmFacts & { name: string }) | null> => {
  const { data } = await db.from("ca_firms").select("id, user_id, email, created_at, is_demo, firm_name").eq("id", id).maybeSingle();
  return data
    ? { id: data.id as string, userId: (data.user_id as string | null) ?? null, email: (data.email as string | null) ?? null, createdAt: String(data.created_at), isDemo: Boolean(data.is_demo), name: (data.firm_name as string) ?? "A firm" }
    : null;
};

/** The firm's own code, created the first time it is needed. */
export async function ensureReferralCode(db: Db, firmId: string): Promise<string> {
  const { data } = await db.from("ca_firms").select("referral_code").eq("id", firmId).maybeSingle();
  if (data?.referral_code) return data.referral_code as string;
  for (let i = 0; i < 6; i++) {
    const code = newReferralCode();
    // The unique index turns a clash into an error: just try another code.
    await db.from("ca_firms").update({ referral_code: code }).eq("id", firmId).is("referral_code", null);
    const { data: again } = await db.from("ca_firms").select("referral_code").eq("id", firmId).maybeSingle();
    if (again?.referral_code) return again.referral_code as string;
  }
  throw new PracticeError("db_error", "Could not create a referral code. Try again in a moment.");
}

export type ApplyResult = { ok: true; referrerName: string } | { ok: false; message: string };

/** The new firm uses someone's code. Nothing is rewarded yet: that happens at the first client. */
export async function applyReferral(db: Db, ctx: FirmContext, rawCode: string): Promise<ApplyResult> {
  const code = parseReferralCode(rawCode);
  if (!code) return { ok: false, message: "That referral code does not look right. It starts with FH and has 8 characters." };
  const { data: owner } = await db.from("ca_firms").select("id").eq("referral_code", code).maybeSingle();
  if (!owner) return { ok: false, message: "We could not find that referral code. Check it and try again." };
  const [referrer, referred, { data: existing }] = await Promise.all([
    firmFacts(db, owner.id as string),
    firmFacts(db, ctx.firmId),
    db.from("ca_referrals").select("id").eq("referred_firm_id", ctx.firmId).maybeSingle(),
  ]);
  if (!referrer || !referred) return { ok: false, message: "We could not find that referral code." };
  const verdict = eligibleToRefer(referrer, referred, Boolean(existing));
  if (!verdict.ok) {
    // Already referred is not an error worth shouting about; the rest are explained.
    return { ok: false, message: REFUSAL_TEXT[verdict.reason] };
  }
  const { error } = await db.from("ca_referrals").insert({ referrer_firm_id: referrer.id, referred_firm_id: referred.id, code_used: code });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { ok: false, message: REFUSAL_TEXT.already_referred };
    throw new PracticeError("db_error", error.message);
  }
  await logActivity(db, referred.id, null, "system", `Joined with ${referrer.name}'s referral code. Both firms earn a free month when you add your first client.`);
  return { ok: true, referrerName: referrer.name };
}

interface RewardResult {
  mode: "trial_extension" | "billing_credit";
}

/** Gives one side its month. Safe to call twice: the second insert is refused by the database and nothing changes. */
async function reward(db: Db, referralId: string, firmId: string, role: "referrer" | "referred"): Promise<RewardResult | null> {
  const { data: billing } = await db.from("ca_billing").select("status, plan, cycle, trial_ends_at, trial_started_at, trial_bonus_days").eq("ca_firm_id", firmId).maybeSingle();
  const mode = rewardMode((billing?.status as string | undefined) ?? "trialing");
  const { error } = await db.from("ca_referral_rewards").insert({
    referral_id: referralId,
    ca_firm_id: firmId,
    role,
    months: REFERRAL_REWARD_MONTHS,
    mode,
    status: mode === "trial_extension" ? "applied" : "pending_billing",
  });
  if (error) return null; // already rewarded (unique key), or the insert failed: do not apply twice
  if (mode === "trial_extension") {
    const now = new Date();
    await db
      .from("ca_billing")
      .update({
        trial_ends_at: extendTrial(billing?.trial_ends_at as string | undefined, now),
        trial_bonus_days: ((billing?.trial_bonus_days as number | null) ?? 0) + REWARD_DAYS,
        updated_at: now.toISOString(),
      })
      .eq("ca_firm_id", firmId);
  }
  return { mode };
}

async function tell(db: Db, firmId: string, otherName: string, role: "referrer" | "referred", mode: RewardResult["mode"]) {
  const title = "You earned a free month";
  const message =
    mode === "trial_extension"
      ? `${role === "referrer" ? `${otherName} added their first client.` : `You added your first client, thanks to ${otherName}.`} Your free trial now runs 30 days longer.`
      : `${role === "referrer" ? `${otherName} added their first client.` : `You added your first client, thanks to ${otherName}.`} One month's fee will be credited to your next invoice by our billing team within 3 business days.`;
  await db.from("ca_notifications").insert({ ca_firm_id: firmId, type: "referral_reward", severity: "info", title, message, is_read: false, metadata: { role } });
  const { data: f } = await db.from("ca_firms").select("email, firm_name").eq("id", firmId).maybeSingle();
  if (f?.email)
    await sendEmail({
      to: f.email as string,
      subject: "You earned a free month on FynHelp",
      text: `Hello ${f.firm_name},\n\n${message}\n\nThank you for spreading the word.\n\nFynHelp`,
      html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414"><p>Hello ${String(f.firm_name).replace(/[<&]/g, "")},</p><p>${message.replace(/[<&]/g, "")}</p><p>Thank you for spreading the word.</p><p>FynHelp</p></div>`,
    }).catch(() => undefined);
}

/**
 * Called after a client is added. For a firm that joined with a referral code, the first real client
 * qualifies the referral and rewards both firms. Cheap and silent for everyone else.
 */
export async function onClientAdded(db: Db, firmId: string): Promise<void> {
  const { data: ref } = await db.from("ca_referrals").select("id, referrer_firm_id, status").eq("referred_firm_id", firmId).maybeSingle();
  if (!ref || ref.status !== "signed_up") return;
  // Claim the referral first: only one caller moves it to "qualified".
  const { data: claimed } = await db
    .from("ca_referrals")
    .update({ status: "qualified", qualified_at: new Date().toISOString() })
    .eq("id", ref.id)
    .eq("status", "signed_up")
    .select("id")
    .maybeSingle();
  if (!claimed) return;
  const [referrer, referred] = await Promise.all([firmFacts(db, ref.referrer_firm_id as string), firmFacts(db, firmId)]);
  if (!referrer || !referred) return;

  // The referred firm always gets its month; the referrer's yearly limit only stops the referrer's reward.
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { data: earned } = await db.from("ca_referral_rewards").select("months").eq("ca_firm_id", referrer.id).eq("role", "referrer").gte("created_at", since);
  const months = (earned ?? []).reduce((s, r) => s + Number(r.months ?? 0), 0);

  const got = await reward(db, ref.id as string, firmId, "referred");
  if (got) await tell(db, firmId, referrer.name, "referred", got.mode);
  if (referrerHasRoom(months)) {
    const r = await reward(db, ref.id as string, referrer.id, "referrer");
    if (r) await tell(db, referrer.id, referred.name, "referrer", r.mode);
  }

  // Money credits are given by people: tell the billing team exactly what to do.
  const { data: pending } = await db.from("ca_referral_rewards").select("id, ca_firm_id, role").eq("referral_id", ref.id).eq("status", "pending_billing");
  for (const p of pending ?? []) {
    const { data: b } = await db.from("ca_billing").select("plan, cycle").eq("ca_firm_id", p.ca_firm_id).maybeSingle();
    const plan = PLANS[(b?.plan as keyof typeof PLANS) ?? "starter"] ?? PLANS.starter;
    const value = monthlyValue(plan, (b?.cycle as "monthly" | "annual") ?? "monthly");
    const f = p.ca_firm_id === referrer.id ? referrer : referred;
    await sendEmail({
      to: "billing@fynhelp.com",
      subject: `Referral credit due: ${f.name}`,
      text: `Credit one month (about Rs ${value} plus GST on the ${b?.plan ?? "current"} ${b?.cycle ?? "monthly"} plan) to ${f.name} (firm ${f.id}). Referral ${ref.id}, role ${p.role}.\nWhen done, mark it: update ca_referral_rewards set status='done', done_at=now() where id='${p.id}';`,
      html: `<p>Credit one month (about Rs ${value} plus GST on the ${b?.plan ?? "current"} ${b?.cycle ?? "monthly"} plan) to <b>${f.name}</b> (firm ${f.id}).</p><p>Referral ${ref.id}, role ${p.role}. When done, run: <code>update ca_referral_rewards set status='done', done_at=now() where id='${p.id}';</code></p>`,
    }).catch(() => undefined);
  }
  await logActivity(db, firmId, null, "system", `First client added: ${referrer.name} and you each earned a free month.`);
}

export interface ReferralView {
  code: string;
  /** Reward months earned by this firm, and how many are still waiting for our billing team. */
  monthsEarned: number;
  monthsPending: number;
  yearlyLimit: number;
  referrals: { id: string; firmName: string; status: "signed_up" | "qualified" | "void"; joinedAt: string; qualifiedAt: string | null }[];
  /** Set when this firm itself joined with someone's code. */
  referredBy: { firmName: string; status: "signed_up" | "qualified" | "void" } | null;
}

export async function referralView(db: Db, ctx: FirmContext): Promise<ReferralView> {
  const code = await ensureReferralCode(db, ctx.firmId);
  const [{ data: out }, { data: inn }, { data: rewards }] = await Promise.all([
    db.from("ca_referrals").select("id, referred_firm_id, status, created_at, qualified_at").eq("referrer_firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(100),
    db.from("ca_referrals").select("referrer_firm_id, status").eq("referred_firm_id", ctx.firmId).maybeSingle(),
    db.from("ca_referral_rewards").select("months, status").eq("ca_firm_id", ctx.firmId),
  ]);
  const ids = [...new Set([...(out ?? []).map((r) => r.referred_firm_id as string), ...(inn ? [inn.referrer_firm_id as string] : [])])];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: firms } = await db.from("ca_firms").select("id, firm_name").in("id", ids);
    for (const f of firms ?? []) names.set(f.id as string, (f.firm_name as string) || "A firm");
  }
  return {
    code,
    monthsEarned: (rewards ?? []).reduce((s, r) => s + Number(r.months ?? 0), 0),
    monthsPending: (rewards ?? []).filter((r) => r.status === "pending_billing").reduce((s, r) => s + Number(r.months ?? 0), 0),
    yearlyLimit: MAX_REWARD_MONTHS_PER_YEAR,
    referrals: (out ?? []).map((r) => ({
      id: r.id as string,
      firmName: names.get(r.referred_firm_id as string) ?? "A firm",
      status: r.status as "signed_up" | "qualified" | "void",
      joinedAt: String(r.created_at),
      qualifiedAt: (r.qualified_at as string | null) ?? null,
    })),
    referredBy: inn ? { firmName: names.get(inn.referrer_firm_id as string) ?? "A firm", status: inn.status as "signed_up" | "qualified" | "void" } : null,
  };
}
