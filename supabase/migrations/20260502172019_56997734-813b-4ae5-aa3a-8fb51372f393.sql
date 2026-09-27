CREATE TABLE public.roadmap_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_number integer NOT NULL UNIQUE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#8B6914',
  status text NOT NULL DEFAULT 'coming_soon',
  description text NOT NULL DEFAULT '',
  widget text NOT NULL DEFAULT 'generic',
  href text NOT NULL DEFAULT '/roadmap',
  x_pct numeric NOT NULL DEFAULT 50,
  y_pct numeric NOT NULL DEFAULT 50,
  side text NOT NULL DEFAULT 'left',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view roadmap stops"
  ON public.roadmap_stops FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert roadmap stops"
  ON public.roadmap_stops FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roadmap stops"
  ON public.roadmap_stops FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roadmap stops"
  ON public.roadmap_stops FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER roadmap_stops_updated_at
  BEFORE UPDATE ON public.roadmap_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.roadmap_stops (stop_number, name, emoji, color, status, description, widget, href, x_pct, y_pct, side, sort_order) VALUES
  (1,  '💧 Liquidity Intelligence',  '💧', '#3B82F6', 'live',         'Cash flow tracking, runway forecast, burn rate alerts.',                'liquidity', '/dashboard/runway',      26, 84, 'left',  1),
  (2,  '🤖 AI CFO Nidhi',            '🤖', '#F43F5E', 'live',         'Conversational AI — ask any financial question, instantly.',           'nidhi',     '/dashboard/nidhi',       72, 77, 'right', 2),
  (3,  '📄 CSV Upload',              '📄', '#10B981', 'live',         'Bulk import bank statements, invoices, and ledgers.',                  'generic',   '/dashboard/data-import', 28, 69, 'left',  3),
  (4,  '📊 Revenue Intelligence',    '📊', '#14B8A6', 'coming_soon',  'MRR/ARR dashboards, cohort analysis, churn signals.',                  'revenue',   '/roadmap#revenue',       70, 62, 'right', 4),
  (5,  '💰 Cost Intelligence',       '💰', '#F97316', 'coming_soon',  'Expense categorization, vendor spend optimization.',                   'cost',      '/roadmap#cost',          31, 55, 'left',  5),
  (6,  '⚡ Razorpay Sync',           '⚡', '#6366F1', 'coming_soon',  'Payment sync, settlement tracking, refund reconciliation.',            'generic',   '/roadmap#razorpay',      67, 48, 'right', 6),
  (7,  '🏛️ GST & Tax Intelligence', '🏛️', '#F59E0B', 'coming_soon',  'GST/TDS compliance, audit readiness, deadline alerts.',                'gst',       '/roadmap#gst',           34, 42, 'left',  7),
  (8,  '👥 Workforce Intelligence',  '👥', '#8B5CF6', 'coming_soon',  'Payroll analytics, cost-per-employee, headcount ROI.',                 'generic',   '/roadmap#hr',            64, 36, 'right', 8),
  (9,  '📚 Zoho Books Sync',         '📚', '#06B6D4', 'coming_soon',  'Auto-pull invoices, expenses, and contacts from Zoho.',                'generic',   '/roadmap#zoho',          37, 30, 'left',  9),
  (10, '🤝 CA Partner Ecosystem',    '🤝', '#EC4899', 'coming_soon',  '800K CAs in India — partner portal & distribution.',                   'generic',   '/roadmap#ca-partner',    61, 24, 'right', 10),
  (11, '🌍 Market & Growth',         '🌍', '#10B981', 'coming_soon',  'Market intelligence, competitive benchmarking.',                       'generic',   '/roadmap#market',        40, 18, 'left',  11),
  (12, '🏦 Banking & Fintech',       '🏦', '#6366F1', 'coming_soon',  'Account Aggregator, open banking, credit insights.',                   'generic',   '/roadmap#banking',       56, 12, 'right', 12);
