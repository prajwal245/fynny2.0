-- Tester accounts: a firm flagged is_test is a sandbox. It is invisible to every other firm (the existing
-- firm-scoped row security already does that), and it can never be mixed with real data:
--   * only the platform (service role or a senior admin) can create or change the flag;
--   * a user can never belong to both a test firm and a real firm;
--   * reports for the business read production_firms, which leaves test (and demo) firms out.

ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ca_firms_is_test_idx ON public.ca_firms (id) WHERE is_test;

-- 1. A firm's own users cannot flag (or unflag) their firm as a test firm.
CREATE OR REPLACE FUNCTION public.guard_ca_firm_test_flag()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.is_senior_admin() THEN
    IF TG_OP = 'INSERT' AND NEW.is_test THEN
      RAISE EXCEPTION 'Only the platform can create a test firm.' USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test THEN
      RAISE EXCEPTION 'Only the platform can change whether a firm is a test firm.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_ca_firm_test_flag ON public.ca_firms;
CREATE TRIGGER trg_guard_ca_firm_test_flag
  BEFORE INSERT OR UPDATE OF is_test ON public.ca_firms
  FOR EACH ROW EXECUTE FUNCTION public.guard_ca_firm_test_flag();
REVOKE EXECUTE ON FUNCTION public.guard_ca_firm_test_flag() FROM PUBLIC, anon, authenticated;

-- 2. One user, one world: test firms and real firms never share a person. Holds for everyone, service role included.
CREATE OR REPLACE FUNCTION public.assert_no_test_mixing(_user uuid, _firm uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target_is_test boolean;
BEGIN
  IF _user IS NULL OR _firm IS NULL THEN RETURN; END IF;
  SELECT f.is_test INTO target_is_test FROM public.ca_firms f WHERE f.id = _firm;
  IF target_is_test IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ca_firms f
    WHERE f.id <> _firm AND f.is_test <> target_is_test
      AND (f.user_id = _user
           OR EXISTS (SELECT 1 FROM public.ca_firm_members m
                      WHERE m.ca_firm_id = f.id AND m.user_id = _user AND m.status <> 'revoked'))
  ) THEN
    RAISE EXCEPTION 'A tester account cannot be part of a real firm, and a real account cannot be part of a test firm.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_no_test_mixing(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_firm_owner_no_test_mixing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.assert_no_test_mixing(NEW.user_id, NEW.id); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.trg_member_no_test_mixing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.assert_no_test_mixing(NEW.user_id, NEW.ca_firm_id); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.trg_firm_owner_no_test_mixing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_member_no_test_mixing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_firm_owner_no_test_mixing ON public.ca_firms;
CREATE TRIGGER trg_firm_owner_no_test_mixing
  AFTER INSERT OR UPDATE OF user_id, is_test ON public.ca_firms
  FOR EACH ROW EXECUTE FUNCTION public.trg_firm_owner_no_test_mixing();
DROP TRIGGER IF EXISTS trg_member_no_test_mixing ON public.ca_firm_members;
CREATE TRIGGER trg_member_no_test_mixing
  AFTER INSERT OR UPDATE OF user_id, ca_firm_id, status ON public.ca_firm_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_member_no_test_mixing();

-- 3. The firms that count in reports, billing runs and dashboards: no test firms, no demo firms.
-- Read with the service role only; it is not exposed to the browser.
CREATE OR REPLACE VIEW public.production_firms WITH (security_invoker = true) AS
  SELECT * FROM public.ca_firms WHERE NOT is_test AND NOT is_demo;
REVOKE ALL ON public.production_firms FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_firms TO service_role;
