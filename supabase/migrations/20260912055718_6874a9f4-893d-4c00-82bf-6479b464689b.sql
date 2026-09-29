DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ca_firm_members'::regclass
      AND conname = 'ca_firm_members_firm_user_unique'
  ) THEN
    ALTER TABLE public.ca_firm_members
      ADD CONSTRAINT ca_firm_members_firm_user_unique
      UNIQUE (ca_firm_id, user_id);
  END IF;
END
$$;