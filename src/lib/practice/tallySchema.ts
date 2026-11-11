/**
 * The columns the Tally code reads and writes, per table. The check-in uses this to say exactly which column is missing
 * in the live database instead of a vague "ask support", and a test keeps it in step with the migrations.
 */
export const TALLY_SCHEMA: Record<string, string[]> = {
  ca_tally_connectors: ["id", "ca_firm_id", "name", "token_hash", "is_active", "created_by", "created_at", "last_seen_at", "agent_version", "host_name", "last_error", "sync_requested_at"],
  ca_tally_companies: ["id", "ca_firm_id", "connector_id", "company_name", "business_id", "last_synced_at", "last_sync_note", "created_at"],
  ca_tally_ledgers: ["id", "ca_firm_id", "company_id", "name", "parent", "synced_at"],
  ca_tally_postings: [
    "id", "ca_firm_id", "business_id", "company_id", "txn_id", "line_key", "direction", "amount", "txn_date", "bank_ledger", "party_ledger",
    "narration", "reference", "status", "attempts", "claimed_at", "last_error", "tally_reply", "approved_by", "approved_at", "posted_at",
    "created_at", "updated_at",
  ],
};

/** Words in a database error that mean the table shape is wrong, as opposed to a network or permission problem. */
export function looksLikeSchemaError(message: string): boolean {
  return /schema cache|could not find the '[^']+' column|column "[^"]+" (of relation "[^"]+" )?does not exist|violates not-null constraint|no unique or exclusion constraint/i.test(message);
}

/** One sentence a person at a firm can read, plus the database's own words for support. */
export function companiesSaveProblem(count: number, dbMessage: string, missing: string[]): string {
  const detail = dbMessage.replace(/\s+/g, " ").slice(0, 160);
  if (missing.length) return `FynHelp's database is missing ${missing.slice(0, 4).join(", ")}. Ask FynHelp support to run the Tally tables repair. (${detail})`;
  if (looksLikeSchemaError(dbMessage)) return `FynHelp's database does not match what the connector saves (ca_tally_companies). Ask FynHelp support to run the Tally tables repair. (${detail})`;
  return `FynHelp could not save the ${count} compan${count === 1 ? "y" : "ies"} Tally reported. Tell FynHelp support. (${detail})`;
}
