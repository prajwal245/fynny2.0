ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (
  role IN ('super_admin', 'admin', 'ops_admin', 'support_agent', 'analyst', 'blog_admin', 'intern')
);

INSERT INTO public.user_roles (user_id, role)
VALUES ('41d80fca-a6ff-480b-b530-58e0bbb938ac', 'intern')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.resource_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  duration text NOT NULL DEFAULT '5 min',
  category text NOT NULL,
  video_url text,
  thumbnail_url text,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_videos_step_check CHECK (step IN ('DAY 1','WEEK 1','WEEK 2','WEEK 3','MONTH 1'))
);
GRANT SELECT ON public.resource_videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_videos TO authenticated;
GRANT ALL ON public.resource_videos TO service_role;
ALTER TABLE public.resource_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published videos" ON public.resource_videos FOR SELECT USING (is_published = true);
CREATE POLICY "Intern admin manage videos" ON public.resource_videos FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')));

CREATE TABLE IF NOT EXISTS public.resource_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL UNIQUE,
  short_definition text NOT NULL,
  full_definition text NOT NULL,
  related_terms text[] DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.resource_glossary TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_glossary TO authenticated;
GRANT ALL ON public.resource_glossary TO service_role;
ALTER TABLE public.resource_glossary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published glossary" ON public.resource_glossary FOR SELECT USING (is_published = true);
CREATE POLICY "Intern admin manage glossary" ON public.resource_glossary FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')));

ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS file_path text;

CREATE POLICY "Intern admin manage resources" ON public.resources FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')));

CREATE POLICY "Intern admin upload resource files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resource-files' AND auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('super_admin','admin','intern','blog_admin')));
CREATE POLICY "Public read resource files"
  ON storage.objects FOR SELECT USING (bucket_id = 'resource-files');

INSERT INTO public.resource_glossary (term, short_definition, full_definition, is_published, sort_order) VALUES
('ARR','Annual Recurring Revenue.','Annual Recurring Revenue, the predictable subscription revenue over 12 months. ARR = MRR x 12.',true,1),
('Burn Rate','Monthly cash spend rate.','The speed at which your business spends cash. Net burn = cash out minus cash in.',true,2),
('CAC','Customer Acquisition Cost.','Total sales and marketing spend divided by new customers acquired in the same period.',true,3),
('Churn','Customer or revenue loss rate.','Rate at which customers stop doing business, expressed as percentage per month or year.',true,4),
('DSO','Days Sales Outstanding.','Average days to collect payment after a sale. Indian SME average is around 42 days.',true,5),
('EBITDA','Earnings before interest, tax, depreciation, amortization.','Proxy for operating cash profitability that strips out financing and accounting effects.',true,6),
('Gross Margin','Revenue minus cost of goods sold.','Revenue minus direct cost of producing what you sold, as percentage of revenue.',true,7),
('GSTR-1','GST outward supply return.','Monthly or quarterly return listing every sale made by a registered taxpayer.',true,8),
('ITC','Input Tax Credit (GST).','GST paid on purchases offset against GST owed on sales, subject to GSTR-2B matching.',true,9),
('LTV','Lifetime Value of customer.','Total gross profit expected from a customer over the entire relationship.',true,10),
('MRR','Monthly Recurring Revenue.','Predictable revenue earned every month from active subscriptions or contracts.',true,11),
('NPS','Net Promoter Score.','Customer satisfaction metric 0 to 10. Promoters (9-10) minus Detractors (0-6) as percentage.',true,12),
('P&L','Profit and Loss statement.','Summary of revenue, costs and expenses over a period ending with net profit or loss.',true,13),
('Runway','Months until cash depletes.','Months business can operate at current net burn. Runway = cash on hand divided by monthly burn.',true,14),
('Working Capital','Current assets minus current liabilities.','Short-term liquidity cushion the business operates with day to day.',true,15)
ON CONFLICT (term) DO NOTHING;