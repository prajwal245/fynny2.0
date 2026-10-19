/**
 * Tally Prime, read-only. A partner pairs the small FynHelp agent on the
 * client's Windows PC with a one-time code; the agent then pushes ledger
 * snapshots from Tally (which only listens on that PC) out over HTTPS. Each
 * Tally company is linked to one client, and the snapshots become the Trial
 * Balance, Schedule III P&L and Balance Sheet, with the Books agent's review.
 * FynHelp never writes to Tally.
 */
import { PracticeError, sha256Hex } from "./core";
import { logActivity, type Db, type FirmContext } from "./db.server";
import { BUCKET, processExtraction, registerDocument } from "./documents.server";
import { LATEST_AGENT_VERSION, isOlder } from "./tally/limits";
import { fyStartOf, newAgentToken, newPairingCode, normaliseCode, normaliseSnapshot, sha256, type DaybookPayload, type SnapshotPayload } from "./tally/payload";
import {
  balanceSheet,
  monthlySeries,
  parties,
  plMovement,
  profitAndLoss,
  resolveLedgers,
  reviewBooks,
  stockFromGroups,
  trialBalance,
  type Stock,
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
  return { companies: rows.length, latestAgentVersion: LATEST_AGENT_VERSION };
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
  const stock = stockFromGroups(groups, resolveLedgers(groups, ledgers));
  const hash = await sha256(JSON.stringify([groups, ledgers]));
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
    opening_stock: stock?.opening ?? 0,
    closing_stock: stock?.closing ?? 0,
  };
  const { error } = await db.from("ca_tally_snapshots").upsert(row, { onConflict: "company_id,fy_start,as_on" });
  if (error) throw new PracticeError("db_error", error.message);

  const res = resolveLedgers(groups, ledgers);
  const findings = reviewBooks(res, stock);
  const high = findings.filter((f) => f.severity === "high").length;
  const note = `${ledgers.length} ledgers as on ${p.asOn}${findings.length ? `; Books agent flagged ${findings.length}${high ? `, ${high} needing action` : ""}` : "; nothing flagged"}.`;
  await db.from("ca_tally_companies").update({ fy_start: p.fyStart, last_synced_at: now, last_as_on: p.asOn, last_sync_note: note }).eq("id", company.id);
  if (company.business_id) await logActivity(db, agent.ca_firm_id, company.business_id, "narrate", `Tally sync: ${note}`);
  return { status: "synced" as const, note, findings: findings.length };
}

/**
 * Agent: a range of the Day Book. For a linked company it becomes the client's
 * books-side document, read by the same Tally parser as an uploaded export, so
 * Recon has the books without anyone exporting Tally. Re-sent ranges are read
 * in place; lines already matched stay matched.
 */
export async function ingestDaybook(db: Db, agent: AgentRow, p: DaybookPayload) {
  await touchAgent(db, agent, p.agentVersion);
  const company = await companyFor(db, agent, p.company);
  if (!company.business_id) return { status: "waiting" as const, note: "Waiting for your CA to link this company to a client." };
  if (!company.sync_enabled) return { status: "paused" as const, note: "Sync is switched off for this company in FynHelp." };
  if (p.to < p.from) throw new PracticeError("bad_period", "The Day Book range ends before it starts.");

  const bytes = new TextEncoder().encode(p.xml);
  const hash = await sha256Hex(bytes);
  const path = `${agent.ca_firm_id}/${company.business_id}/tally/${company.id}-${p.from}_${p.to}.xml`;
  const filename = `Tally Day Book - ${p.company.replace(/[\\/]/g, "-")} - ${p.from} to ${p.to}.xml`.replace(/[:*?"<>|]/g, " ");
  const { data: prev } = await db.from("ca_document_extractions").select("id, content_hash").eq("ca_firm_id", agent.ca_firm_id).eq("storage_path", path).maybeSingle();
  if (prev?.content_hash === hash) return { status: "unchanged" as const, note: "No changes since the last sync." };

  const note = `Day Book ${p.from} to ${p.to}`;
  const touch = () => db.from("ca_tally_companies").update({ last_synced_at: new Date().toISOString(), last_sync_note: `${note} received.` }).eq("id", company.id);
  try {
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/xml", upsert: true });
    if (upErr) throw new PracticeError("storage", upErr.message);
    if (prev) {
      await db.from("ca_document_extractions").update({ content_hash: hash, original_filename: filename, extract_status: "queued", error_message: null }).eq("id", prev.id);
      await processExtraction(db, prev.id, { trigger: "channel", userId: null });
    } else {
      await registerDocument(db, { firmId: agent.ca_firm_id, userId: null }, {
        storage_path: path,
        filename,
        mime: "application/xml",
        business_id: company.business_id,
        side: "books",
        channel: "Tally",
        source_metadata: { tally_company: p.company, from: p.from, to: p.to },
      });
    }
  } catch (e) {
    // A paused plan is not an error the agent can fix: say so and let it try again later.
    if ((e as { code?: string }).code === "billing_paused") return { status: "paused" as const, note: (e as Error).message };
    throw e;
  }
  await touch();
  await logActivity(db, agent.ca_firm_id, company.business_id, "extract", `Tally Day Book ${p.from} to ${p.to} arrived from the agent and is being read for Recon.`);
  return { status: "synced" as const, note };
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
      updateAvailable: isOlder(a.agent_version, LATEST_AGENT_VERSION),
    })),
    latestAgentVersion: LATEST_AGENT_VERSION,
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

type SnapRow = { as_on: string; fy_start: string; groups: GroupMaster[]; ledgers: LedgerBalance[]; opening_stock: number; closing_stock: number; created_at: string };

const stockOf = (r: Pick<SnapRow, "opening_stock" | "closing_stock">): Stock | undefined => {
  const opening = Number(r.opening_stock) || 0;
  const closing = Number(r.closing_stock) || 0;
  return opening || closing ? { opening, closing } : undefined;
};

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

  // Year-to-date snapshots of the same year, up to the chosen date: the month-by-month trend and the movement since the last one.
  const { data: cur } = await db.from("ca_tally_snapshots").select("as_on, fy_start, groups, ledgers, opening_stock, closing_stock, created_at").eq("company_id", company.id).eq("as_on", chosen).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!cur) return { linked: true as const, company: { name: company.name, lastSyncedAt: company.last_synced_at }, snapshot: null, available };
  const snap = cur as SnapRow;
  const stock = stockOf(snap);
  const res = resolveLedgers(snap.groups, snap.ledgers);

  const { data: year } = await db.from("ca_tally_snapshots").select("as_on, groups, ledgers, opening_stock, closing_stock").eq("company_id", company.id).eq("fy_start", snap.fy_start).lte("as_on", chosen).order("as_on").limit(13);
  const ytd = ((year ?? []) as Pick<SnapRow, "as_on" | "groups" | "ledgers" | "opening_stock" | "closing_stock">[]).map((y) => ({
    asOn: y.as_on,
    pl: profitAndLoss(resolveLedgers(y.groups, y.ledgers), stockOf(y)),
  }));
  const monthly = monthlySeries(ytd);
  const pl = profitAndLoss(res, stock);
  const before = ytd.length > 1 ? ytd[ytd.length - 2] : null;

  return {
    linked: true as const,
    company: { name: company.name, lastSyncedAt: company.last_synced_at },
    available,
    snapshot: {
      asOn: snap.as_on,
      fyStart: snap.fy_start,
      ledgerCount: snap.ledgers.length,
      trialBalance: trialBalance(res, stock),
      pl,
      /** Movement since the previous snapshot of the year; null for the first one. */
      plPeriod: before ? { from: before.asOn, pl: plMovement(pl, before.pl) } : null,
      balanceSheet: balanceSheet(res, stock),
      parties: parties(res),
      findings: reviewBooks(res, stock),
      monthly,
      stock: stock ?? null,
    },
  };
}
