"""
Builds a throwaway Postgres schema for the practice integration test from the
generated Supabase types (src/integrations/supabase/types.ts), so the test runs
the real migration against the real column set without a Supabase project.
Usage: python3 tests/integration/stub-schema.py > /tmp/stubs.sql
"""
import re, sys, pathlib

TABLES = ["businesses", "ca_firms", "ca_firm_members", "ca_clients", "ca_client_access", "ca_client_documents",
          "ca_document_requests", "ca_document_extractions", "ca_exceptions", "ca_chaser_events", "ca_recon_runs",
          "ca_reports_log", "ca_activity_log", "ca_notifications"]
types = pathlib.Path(__file__).resolve().parents[2].joinpath("src/integrations/supabase/types.ts").read_text()

def col_type(name, ts):
    ts = ts.replace(" | null", "").strip()
    if ts == "Json": return "jsonb"
    if ts == "boolean": return "boolean"
    if ts == "number": return "numeric"
    if ts == "string[]": return "text[]"
    if ts == "number[]": return "int[]"
    if name == "id" or name.endswith("_id") or name in ("user_id", "owner_id", "resolved_by", "reviewed_by", "uploaded_by", "requested_by", "run_by", "actor_id", "signed_off_by", "granted_by", "assigned_to"):
        return "uuid"
    if name.endswith("_at") or name in ("token_expiry",): return "timestamptz"
    if name.endswith("_date") or name in ("period_start", "period_end"): return "date"
    return "text"

out = ["CREATE EXTENSION IF NOT EXISTS pgcrypto;",
       "DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
       "DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
       "DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
       "ALTER ROLE service_role BYPASSRLS;",
       "CREATE SCHEMA IF NOT EXISTS auth;",
       "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $f$;"]
for t in TABLES:
    m = re.search(r"\n      " + t + r": \{\n        Row: \{\n(.*?)\n        \}", types, re.S)
    if not m: sys.exit(f"table {t} not in types")
    cols = []
    for line in m.group(1).split("\n"):
        name, ts = line.strip().split(": ", 1)
        ctype = col_type(name, ts)
        nullable = "| null" in ts
        default = ""
        if name == "id": default = " PRIMARY KEY DEFAULT gen_random_uuid()"
        elif name in ("created_at", "updated_at"): default = " DEFAULT now()"
        elif not nullable:
            default = {"boolean": " NOT NULL DEFAULT false", "numeric": " NOT NULL DEFAULT 0", "jsonb": " NOT NULL DEFAULT '{}'::jsonb",
                       "text[]": " NOT NULL DEFAULT '{}'", "int[]": " NOT NULL DEFAULT '{}'"}.get(ctype, "")
        cols.append(f"  {name} {ctype}{default}")
    out.append(f"CREATE TABLE public.{t} (\n" + ",\n".join(cols) + "\n);")
# Constraints the migration relies on.
out.append("""ALTER TABLE public.ca_chaser_events ADD CONSTRAINT ca_chaser_events_event_type_check CHECK (event_type IN ('created','sent','replied','escalated','resolved','skipped','auto_resolved','auto_escalated'));
ALTER TABLE public.ca_document_extractions ALTER COLUMN review_state SET DEFAULT 'pending', ALTER COLUMN source_type SET DEFAULT 'upload', ALTER COLUMN classification SET DEFAULT 'unknown';
ALTER TABLE public.ca_document_requests ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE public.ca_exceptions ALTER COLUMN status SET DEFAULT 'open', ALTER COLUMN severity SET DEFAULT 'medium', ALTER COLUMN source SET DEFAULT 'reconciliation';
ALTER TABLE public.ca_clients ALTER COLUMN entity_type SET DEFAULT 'Private Limited';
ALTER TABLE public.ca_reports_log ADD FOREIGN KEY (business_id) REFERENCES public.businesses(id);
ALTER TABLE public.ca_recon_runs ALTER COLUMN recon_type SET NOT NULL;
CREATE OR REPLACE FUNCTION public.user_in_ca_firm(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT _firm_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.ca_firms f WHERE f.id = _firm_id AND f.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.ca_firm_members m WHERE m.ca_firm_id = _firm_id AND m.user_id = auth.uid() AND m.status = 'active')) $f$;""")
print("\n".join(out))
