/**
 * Tally Prime, read-only. A partner pairs the small FynHelp agent on the
 * client's Windows PC with a one-time code; the agent then pushes ledger
 * snapshots from Tally (which only listens on that PC) out over HTTPS. Each
 * Tally company is linked to one client, and the snapshots become the Trial
 * Balance, Schedule III P&L and Balance Sheet, with the Books agent's review.
 * FynHelp never writes to Tally.
 */
import { PracticeError } from "./core";
import { logActivity, type Db, type FirmContext } from "./db.server";
import { fyStartOf, newAgentToken, newPairingCode, normaliseCode, normaliseSnapshot, sha256, type SnapshotPayload } from "./tally/payload";
import {
  balanceSheet,
  monthlySeries,
  parties,
  profitAndLoss,
  resolveLedgers,
  reviewBooks,
  trialBalance,
  type GroupMaster,
  type LedgerBalance,
} from "./tally/statements";

const PAIRING_MINUTES = 30;
/** An agent that has not reported for this long is shown as offline. */
export const OFFLINE_AFTER_MS = 36 * 3600_000;

/* ── pairing ───────────────────────────────────────────── */

/** Partner: a code to type into the agent on the client's PC. Shown once. */
export async function createPairing(db: Db, ctx: FirmContext) {
  const code = newPairingCode();
  const expires = new Date(Date.now() + PAIRING_MINUTES * 60_000).toISOString();
  const { error } = await db.from("ca_tally_pairings").insert({
    ca_firm_id: ctx.firmId,
    created_by: ctx.userId,
    code_hash: await sha256(normaliseCode(code)),
    expires_at: expires,
  });
  if (error) throw new PracticeError("db_error", error.message);
  return { code, expiresAt: expires };
}

/** Agent: swap the code for a long-lived bearer token. */
export async function redeemPairing(db: Db, code: string, meta: { label: string; agentVersion?: string; tallyVersion?: string }) {
  const hash = await sha256(normaliseCode(code));
  const { data: p } = await db.from("ca_tally_pairings").select("id, ca_firm_id, created_by, expires_at, used_at").eq("code_hash", hash).maybeSingle();
  if (!p || p.used_at || new Date(p.expires_at).getTime() < Date.now()) {
    throw new PracticeError("bad_code", "That pairing code is wrong or has expired. Ask your CA for a new one.");
  }
  // Claim the code first; if two PCs race, only one update sees used_at null.
  const { data: claimed } = await db
    .from("ca_tally_pairings")
    .update({ used_at: new Date().toISOString() })
    .eq("id", p.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) throw new PracticeError("bad_code", "That pairing code was already used.");
  const token = newAgentToken();
  const { data: agent, error } = await db
    .from("ca_tally_agents")
    .insert({
      ca_firm_id: p.ca_firm_id,
      label: meta.label.slice(0, 80) || "Windows PC",
      token_hash: await sha256(token),
      agent_version: meta.agentVersion ?? null,
      tally_version: meta.tallyVersion ?? null,
      paired_by: p.created_by,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !agent) throw new PracticeError("db_error", error?.message ?? "Could not register the agent.");
  await logActivity(db, p.ca_firm_id, null, "system", `Tally agent paired: ${meta.label.slice(0, 80) || "Windows PC"}.`);
  return { token, agentId: agent.id as string };
}

export interface AgentRow {
  id: string;
  ca_firm_id: string;
  label: string;
}

/** Agent: the bearer token it was given at pairing. */
export async function authAgent(db: Db, bearer: string | null): Promise<AgentRow> {
  const token = (bearer ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^fhta_[0-9a-f]{64}$/.test(token)) throw new PracticeError("unauthorised", "Missing or malformed agent token.");
  const { data } = await db.from("ca_tally_agents").select("id, ca_firm_id, label, status").eq("token_hash", await sha256(token)).maybeSingle();
  if (!data || data.status !== "active") throw new PracticeError("unauthorised", "This agent has been removed. Pair it again from Settings.");
  return { id: data.id, ca_firm_id: data.ca_firm_id, label: data.label };
}

/* ── ingest ────────────────────────────────────────────── */

async function touchAgent(db: Db, agent: AgentRow, agentVersion?: string, tallyVersion?: string) {
  await db
    .from("ca_tally_agents")
    .update({ last_seen_at: new Date().toISOString(), ...(agentVersion ? { agent_version: agentVersion } : {}), ...(tallyVersion ? { tally_version: tallyVersion } : {}) })
    .eq("id", agent.id);
}

/** Agent heartbeat: which companies are open in Tally. */
export async function ingestCompanies(db: Db, agent: AgentRow, p: { companies: { name: string }[]; agentVersion?: string; tallyVersion?: string }) {
  await touchAgent(db, agent, p.agentVersion, p.tallyVersion);
  const rows = [...new Set(p.companies.map((c) => c.name))].map((name) => ({ ca_firm_id: agent.ca_firm_id, agent_id: agent.id, name }));
  if (rows.length) await db.from("ca_tally_companies").upsert(rows, { onConflict: "agent_id,name", ignoreDuplicates: true });
  return { companies: rows.length };
}

async function companyFor(db: Db, agent: AgentRow, name: string) {
  const { data: existing } = await db.from("ca_tally_companies").select("id, business_id, sync_enabled").eq("agent_id", agent.id).eq("name", name).maybeSingle();
  if (existing) return existing as { id: string; business_id: string | null; sync_enabled: boolean };
  const { data, error } = await db
    .from("ca_tally_companies")
    .insert({ ca_firm_id: agent.ca_firm_id, agent_id: agent.id, name })
    .select("id, business_id, sync_enabled")
    .single();
  if (error || !data) throw new PracticeError("db_error", error?.message ?? "Could not register the company.");
  return data as { id: string; business_id: string | null; sync_enabled: boolean };
}

/** Agent: one dated snapshot of a company's ledgers. */
export async function ingestSnapshot(db: Db, agent: AgentRow, p: SnapshotPayload) {
  await touchAgent(db, agent, p.agentVersion, p.tallyVersion);
  const company = await companyFor(db, agent, p.company);
  if (!company.sync_enabled) return { status: "paused" as const, note: "Sync is switched off for this company in FynHelp." };
  if (p.fyStart !== fyStartOf(p.asOn)) {
    throw new PracticeError("bad_period", `fyStart ${p.fyStart} does not match an April to March year containing ${p.asOn}.`);
  }
  const { groups, ledgers } = normaliseSnapshot(p);
  const hash = await sha256(JSON.stringify([groups, ledgers, p.stockAdjustment ?? 0]));
  const { data: prev } = await db.from("ca_tally_snapshots").select("id, content_hash").eq("company_id", company.id).eq("fy_start", p.fyStart).eq("as_on", p.asOn).maybeSingle();
  const now = new Date().toISOString();
  if (prev?.content_hash === hash) {
    await db.from("ca_tally_companies").update({ last_synced_at: now, last_sync_note: `No changes in Tally as on ${p.asOn}.` }).eq("id", company.id);
    return { status: "unchanged" as const, note: "No changes since the last sync." };
  }
  const row = {
    company_id: company.id,
    ca_firm_id: agent.ca_firm_id,
    fy_start: p.fyStart,
    as_on: p.asOn,
    content_hash: hash,
    groups,
    ledgers,
    ledger_count: ledgers.length,
    stock_adjustment: p.stockAdjustment ?? 0,
  };
  const { error } = await db.from("ca_tally_snapshots").upsert(row, { onConflict: "company_id,fy_start,as_on" });
  if (error) throw new PracticeError("db_error", error.message);

  const res = resolveLedgers(groups, ledgers);
  const findings = reviewBooks(res, p.stockAdjustment ?? 0);
  const high = findings.filter((f) => f.severity === "high").length;
  const note = `${ledgers.length} ledgers as on ${p.asOn}${findings.length ? `; Books agent flagged ${findings.length}${high ? `, ${high} needing action` : ""}` : "; nothing flagged"}.`;
  await db.from("ca_tally_companies").update({ fy_start: p.fyStart, last_synced_at: now, last_as_on: p.asOn, last_sync_note: note }).eq("id", company.id);
  if (company.business_id) await logActivity(db, agent.ca_firm_id, company.business_id, "narrate", `Tally sync: ${note}`);
  return { status: "synced" as const, note, findings: findings.length };
}

/* ── settings screen ───────────────────────────────────── */

export async function status(db: Db, ctx: FirmContext) {
  const [{ data: agents }, { data: companies }] = await Promise.all([
    db.from("ca_tally_agents").select("id, label, agent_version, tally_version, status, last_seen_at, created_at").eq("ca_firm_id", ctx.firmId).eq("status", "active").order("created_at"),
    db.from("ca_tally_companies").select("id, agent_id, name, business_id, fy_start, sync_enabled, last_synced_at, last_as_on, last_sync_note").eq("ca_firm_id", ctx.firmId).order("name"),
  ]);
  const now = Date.now();
  return {
    agents: (agents ?? []).map((a) => ({
      ...a,
      online: !!a.last_seen_at && now - new Date(a.last_seen_at).getTime() < OFFLINE_AFTER_MS,
    })),
    companies: companies ?? [],
  };
}

export async function linkCompany(db: Db, ctx: FirmContext, companyId: string, businessId: string | null) {
  if (businessId) {
    // One Tally company per client keeps the statements unambiguous.
    const { data: taken } = await db.from("ca_tally_companies").select("id").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).neq("id", companyId).limit(1);
    if (taken?.length) throw new PracticeError("conflict", "That client is already linked to another Tally company. Unlink it first.");
  }
  const { data, error } = await db.from("ca_tally_companies").update({ business_id: businessId }).eq("id", companyId).eq("ca_firm_id", ctx.firmId).select("id");
  if (error) throw new PracticeError("db_error", error.message);
  if (!data?.length) throw new PracticeError("not_found", "Company not found.");
  return { ok: true };
}

export async function setCompanySync(db: Db, ctx: FirmContext, companyId: string, enabled: boolean) {
  await db.from("ca_tally_companies").update({ sync_enabled: enabled }).eq("id", companyId).eq("ca_firm_id", ctx.firmId);
  return { ok: true };
}

export async function revokeAgent(db: Db, ctx: FirmContext, agentId: string) {
  await db.from("ca_tally_agents").update({ status: "revoked" }).eq("id", agentId).eq("ca_firm_id", ctx.firmId);
  return { ok: true };
}

/* ── statements for a client ───────────────────────────── */

type SnapRow = { as_on: string; fy_start: string; groups: GroupMaster[]; ledgers: LedgerBalance[]; stock_adjustment: number; created_at: string };

/** The client's Books: statements as on the latest (or a chosen) snapshot. */
export async function statements(db: Db, ctx: FirmContext, businessId: string, asOn?: string) {
  const { data: company } = await db
    .from("ca_tally_companies")
    .select("id, name, last_synced_at")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!company) return { linked: false as const };

  const { data: dates } = await db.from("ca_tally_snapshots").select("as_on").eq("company_id", company.id).order("as_on", { ascending: false }).limit(48);
  const available = (dates ?? []).map((d) => d.as_on as string);
  if (!available.length) return { linked: true as const, company: { name: company.name, lastSyncedAt: company.last_synced_at }, snapshot: null, available };
  const chosen = asOn && available.includes(asOn) ? asOn : available[0];

  const { data: cur } = await db.from("ca_tally_snapshots").select("as_on, fy_start, groups, ledgers, stock_adjustment, created_at").eq("company_id", company.id).eq("as_on", chosen).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!cur) return { linked: true as const, company: { name: company.name, lastSyncedAt: company.last_synced_at }, snapshot: null, available };
  const snap = cur as SnapRow;
  const stock = Number(snap.stock_adjustment) || 0;
  const res = resolveLedgers(snap.groups, snap.ledgers);

  // Year-to-date snapshots of the same year give the month-by-month trend.
  const { data: year } = await db.from("ca_tally_snapshots").select("as_on, groups, ledgers, stock_adjustment").eq("company_id", company.id).eq("fy_start", snap.fy_start).lte("as_on", chosen).order("as_on").limit(13);
  const monthly = monthlySeries(
    ((year ?? []) as Pick<SnapRow, "as_on" | "groups" | "ledgers" | "stock_adjustment">[]).map((y) => ({
      asOn: y.as_on,
      pl: profitAndLoss(resolveLedgers(y.groups, y.ledgers), Number(y.stock_adjustment) || 0),
    })),
  );

  return {
    linked: true as const,
    company: { name: company.name, lastSyncedAt: company.last_synced_at },
    available,
    snapshot: {
      asOn: snap.as_on,
      fyStart: snap.fy_start,
      ledgerCount: snap.ledgers.length,
      trialBalance: trialBalance(res),
      pl: profitAndLoss(res, stock),
      balanceSheet: balanceSheet(res, stock),
      parties: parties(res),
      findings: reviewBooks(res, stock),
      monthly,
    },
  };
}
