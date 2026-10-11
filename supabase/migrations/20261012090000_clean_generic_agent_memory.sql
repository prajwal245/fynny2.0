-- Retest round 2 (P1-1): memories and aliases learned before the guard was in
-- place keyed on generic words only ("against inv", "against po", "salary sep").
-- They matched unrelated lines, so they are removed. A real party name keeps
-- at least one word of 4+ letters that is not a banking or month word; this
-- is the same rule as isDistinctiveName() in src/lib/practice/memory.ts.
CREATE OR REPLACE FUNCTION public.fh_is_distinctive_name(name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM regexp_split_to_table(lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z[:space:]]', ' ', 'g')), '[[:space:]]+') AS w
    WHERE length(w) >= 4
      AND NOT (w = ANY (ARRAY['against','inv','invoice','bill','payment','pmt','paid','transfer','trf','salary','salaries','staff','neft','rtgs','imps','upi','chq','cheque','cash','deposit','withdrawal','misc','miscellaneous','bank','charges','charge','fees','fee','refund','advance','receipt','received','credit','debit','cr','dr','to','from','by','for','the','and','of','on','a','ac','acct','account','ref','no','being','towards','january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec','month','monthly','tax','gst','tds','pf','esi','rent','interest']::text[]))
  );
$$;

DELETE FROM public.ca_counterparty_aliases
WHERE NOT public.fh_is_distinctive_name(alias);

DELETE FROM public.ca_agent_memory
WHERE kind = 'extract_correction'
  AND NOT public.fh_is_distinctive_name(pattern);

-- The Recon agent also learns from Exception Queue decisions (ignore /
-- reconciled elsewhere) and proposes the same decision next month, with who
-- decided it and why. A person always confirms.
ALTER TABLE public.ca_agent_memory DROP CONSTRAINT IF EXISTS ca_agent_memory_kind_check;
ALTER TABLE public.ca_agent_memory
  ADD CONSTRAINT ca_agent_memory_kind_check CHECK (kind IN ('extract_correction', 'recon_decision'));
