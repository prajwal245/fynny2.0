
-- Grant anon SELECT on hsn_master (missing, causing 401 on /demo/gst)
GRANT SELECT ON public.hsn_master TO anon;

-- Add anon-role SELECT policies for demo public read on GST tab tables.
-- Existing "demo public read" policies target only authenticated; demo pages
-- query via the anon key, so we mirror the same is_demo + DEMO_BIZ predicate
-- for the anon role.
CREATE POLICY "hsn demo anon read"
  ON public.hsn_master
  FOR SELECT
  TO anon
  USING ((is_demo = true) AND (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid));

CREATE POLICY "gst_filings_demo anon public read"
  ON public.gst_filings_demo
  FOR SELECT
  TO anon
  USING ((is_demo = true) AND (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid));

CREATE POLICY "invoices demo anon read"
  ON public.invoices
  FOR SELECT
  TO anon
  USING ((is_demo = true) AND (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid));

CREATE POLICY "expenses demo anon read"
  ON public.expenses
  FOR SELECT
  TO anon
  USING ((is_demo = true) AND (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid));
