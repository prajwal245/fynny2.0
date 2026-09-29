
-- Add missing columns to existing blog_posts table
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS author_name text NOT NULL DEFAULT 'FYNHelp Editorial',
  ADD COLUMN IF NOT EXISTS author_role text NOT NULL DEFAULT 'Editorial',
  ADD COLUMN IF NOT EXISTS reading_time_minutes integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Ensure defaults on existing columns
ALTER TABLE public.blog_posts
  ALTER COLUMN category SET DEFAULT 'Startup finance',
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN tags SET DEFAULT '{}',
  ALTER COLUMN views SET DEFAULT 0;

-- Add check constraints (drop if exist to be idempotent)
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_status_check;
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_category_check;
ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_status_check CHECK (status IN ('draft','published','archived')),
  ADD CONSTRAINT blog_posts_category_check CHECK (category IN ('GST','Cash flow','MSME','Startup finance','Compliance','CA resources','Hiring'));

CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON public.blog_posts (category);

-- Grants (Data API needs these explicitly)
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;

-- RLS policies
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admin can do everything on blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins manage blog posts" ON public.blog_posts;

CREATE POLICY "Anyone can read published posts"
  ON public.blog_posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Admins manage blog posts"
  ON public.blog_posts FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- View increment function
CREATE OR REPLACE FUNCTION public.increment_blog_views(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_posts SET views = views + 1 WHERE slug = p_slug AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_blog_views(text) TO anon, authenticated;

-- Seed 6 published blog posts
INSERT INTO public.blog_posts (slug, title, excerpt, content, category, author_name, author_role, tags, reading_time_minutes, status, published_at, views) VALUES
('5-signs-you-need-ai-cfo',
 '5 signs you need an AI CFO before your next funding round',
 'Financial intelligence is no longer a luxury for Indian startups. Here is how to know it is time to upgrade from spreadsheets before your next investor meeting.',
 E'Investors ask hard financial questions. Most Indian SME founders cannot answer them in real time. If you find yourself scrambling for data during due diligence, that is the clearest signal you need better financial infrastructure.\n\nHere are five concrete signs your business has outgrown spreadsheets.\n\nSign 1: You cannot answer runway questions in under 60 seconds\n\nYour burn rate changes every month. Headcount costs go up, a big vendor invoice lands, a customer delays payment. If you need to open three spreadsheets and do manual calculations before you can tell an investor how many months of runway you have, you are already behind. An AI CFO should give you this number in real time, updated every day.\n\nSign 2: Your GST reconciliation takes more than one working day per month\n\nGSTR-2B matching against your purchase register is a mechanical task. If your team is spending time on this, you are paying human intelligence to do machine work. Automated ITC reconciliation catches mismatches instantly and flags vendors who filed late, giving you the data before the 20th of every month.\n\nSign 3: You discovered a cash flow problem after it happened\n\nProactive financial intelligence means knowing about a problem before it becomes a crisis. If you have ever been surprised by a low bank balance, a bounced payment, or a customer who has not paid in 90 days, your financial visibility has a gap. Real-time alerts on receivables aging and burn rate changes give you time to act.\n\nSign 4: You have more than one entity or bank account and they are not consolidated\n\nMulti-account businesses run the highest risk of invisible cash flow problems. Money sits in a current account while a vendor payment bounces from another account. A unified cash position view across all accounts and entities is not optional once you have two or more bank accounts.\n\nSign 5: Your CA gives you financial reports, not financial decisions\n\nChartered accountants are trained in compliance. Their job is accurate reporting. The question of what you should do with that data, whether to hire, whether to take on debt, whether a customer is worth the margin, is a different skill set entirely. If you are using compliance reports to make growth decisions, you are operating with a structural disadvantage.',
 'Startup finance','FYNHelp Editorial','CFO insights',ARRAY['AI CFO','Funding','Startup'],5,'published',now()-interval '33 days',1200),
('section-43b-h-msme-payment-law',
 'Section 43B(h): The MSME payment law every founder must know',
 'A change in the Income Tax Act now gives MSMEs unprecedented leverage over delayed payments from large buyers. Here is what it means and how to use it.',
 E'In the Finance Act 2023, Parliament inserted clause (h) into Section 43B of the Income Tax Act. This single provision changed the power dynamic between Indian MSMEs and their large corporate buyers.\n\nWhat the law says\n\nAny payment due to a registered MSME supplier must be made within the time specified under the MSMED Act 2006. If the buyer delays beyond this period, they cannot claim that expense as a deduction under their income tax return for that financial year. The deduction is only available in the year when payment is actually made.\n\nIn plain language: if a large company owes your MSME money and does not pay within the legal deadline, they pay higher taxes. This creates a direct financial incentive for on-time payment.\n\nWhat the MSMED Act says about timelines\n\nIf there is no written agreement between buyer and supplier, payment must be made within 15 days of delivery. If there is a written agreement, the maximum permitted credit period is 45 days. Anything beyond 45 days is a violation regardless of what the contract says.\n\nWho it applies to\n\nSection 43B(h) applies to buyers who are companies or individuals with auditable accounts. The MSME supplier must be registered under the Udyam portal. Both conditions must be met for the protection to apply.\n\nHow to use this as leverage\n\nFirst, ensure your Udyam registration is active and up to date. Second, include the 45-day payment term explicitly in all purchase orders and agreements. Third, follow up at day 30 with a written reminder citing Section 43B(h). The reminder does not need to be threatening. A simple note that payment beyond 45 days creates a tax deduction issue for the buyer is usually sufficient.\n\nWhere FYNHelp helps\n\nThe receivables aging dashboard flags every outstanding invoice by days outstanding. When an invoice crosses 30 days from a buyer who is likely a large company, FYNHelp surfaces a reminder with the Section 43B(h) context. You do not need to track this manually.',
 'MSME','FYNHelp Editorial','Legal',ARRAY['MSME','Tax law','Receivables'],5,'published',now()-interval '35 days',2400),
('how-we-cut-dso-67-to-41-days',
 'How we cut DSO from 67 days to 41 in 90 days',
 'A founder playbook for tightening receivables without alienating your best customers. Three tactical changes that moved the number.',
 E'DSO is Days Sales Outstanding. It measures how long, on average, it takes you to collect payment after a sale. The Indian SME average is around 42 days. Many product and service businesses run at 60 to 90 days without realising the cash flow cost.\n\nWhy DSO matters more than revenue\n\nA business with 5 crore in annual revenue and 90-day DSO has roughly 1.25 crore in working capital permanently locked in receivables. Cutting DSO to 45 days frees 62.5 lakhs of cash with zero new revenue. That is money available for payroll, vendor payments, or investment without taking on debt.\n\nThe three changes that worked\n\nChange 1: Move the invoice date to delivery date, not end of month\n\nMany businesses batch invoices on the last day of the month. This artificially inflates DSO by up to 30 days because the payment clock starts at invoice date, not delivery date. Invoicing the moment goods are delivered or services are signed off moves the starting clock forward immediately.\n\nChange 2: Add a 2% early payment discount for settlement within 10 days\n\nFor customers paying between 60 and 90 days, a 2% discount for paying in 10 days costs less than the equivalent working capital borrowing cost. A customer paying 5 lakhs in 10 days instead of 75 days saves you 65 days of float. At a working capital loan rate of 14% annually, 65 days on 5 lakhs costs roughly 12,600 rupees. A 2% discount costs 10,000. The math works.\n\nChange 3: Assign a collections owner and set a weekly review cadence\n\nReceivables without a named owner drift. Assigning one person, even part time, to review aging every week and send follow-ups on day 30, day 45, and day 60 moved more than any process change. The FYNHelp receivables dashboard shows the aging by customer and sends automated alerts, making this review a 10-minute task instead of a 2-hour one.',
 'Cash flow','FYNHelp Editorial','Operations',ARRAY['Cash flow','Receivables','DSO'],4,'published',now()-interval '41 days',890),
('gst-rate-rationalisation-2026',
 'GST 2.0: What the new rate rationalisation means for you',
 'The biggest GST overhaul in five years is here. A plain English breakdown of what changed, what stayed, and what Indian SME owners need to do now.',
 E'The GST Council approved a significant rate rationalisation in 2025. The changes took effect from 1 April 2026. This is not a minor adjustment. For many product categories, the effective tax burden changed by 4 to 6 percentage points.\n\nWhat changed\n\nThe 12% slab has been largely eliminated. Items that were at 12% have moved either to 5% or 18% depending on the category. Items considered essential moved down. Items considered discretionary moved up. The number of line items in the 28% slab did not change significantly.\n\nServices saw a parallel rationalisation. B2B professional services remain at 18%. B2C personal services, including beauty, fitness, and food delivery, moved from 18% to 12% for registered suppliers below 1.5 crore turnover.\n\nWhat it means for your pricing\n\nIf your input costs were taxed at 12% and your outputs were also at 12%, your ITC claimed exactly offset your output tax. If inputs moved to 5% and outputs moved to 18%, you have a net tax increase on the delta. Many mixed-category businesses will need to recompute their effective tax burden and adjust pricing accordingly.\n\nWhat to do now\n\nPull your purchase register for the last 6 months. Identify the top 10 input categories by value. Check whether each moved up or down in the rationalisation. Compute the net change in ITC available. Compare to the change in output tax liability on your main product or service category. The difference is either a benefit or a cost that flows directly to your margins.',
 'GST','FYNHelp Editorial','Tax',ARRAY['GST','Tax','Compliance'],5,'published',now()-interval '48 days',3100),
('compliance-calendar-fy-2026-27',
 'The compliance calendar every Indian SME should run',
 '20 filings across 12 months. The complete GST, TDS, and ROC deadline map for FY 2026-27 with due dates and penalty amounts.',
 E'Indian SMEs face over 20 mandatory filings per financial year across GST, TDS, and corporate law. Missing a deadline costs money in penalties. Missing multiple deadlines creates audit exposure.\n\nThis is the complete calendar for FY 2026-27 for a company registered under GST with employees and basic corporate structure.\n\nMonthly filings\n\nGSTR-1 is due on the 11th of the following month for taxpayers with turnover above 5 crore, or the 13th for quarterly filers. Late fee is 200 rupees per day capped at 5,000.\n\nGSTR-3B is due on the 20th, 22nd, or 24th depending on your state category. Late fee is 50 rupees per day, or 20 rupees per day for nil returns.\n\nTDS must be deposited by the 7th of the following month for deductions made during the month. Late deposit attracts interest at 1.5% per month.\n\nQuarterly filings\n\nTDS returns (Form 24Q for salary, Form 26Q for non-salary) are due on the 31st of the month following each quarter. Q1 is 31 July. Q2 is 31 October. Q3 is 31 January. Q4 is 31 May.\n\nAdvance tax installments are due on 15 June, 15 September, 15 December, and 15 March.\n\nAnnual filings\n\nGSTR-9 annual return is due 31 December of the assessment year. GSTR-9C reconciliation statement is due on the same date for taxpayers above 5 crore turnover.\n\nForm 16 must be issued to employees by 15 June.\n\nITR filing deadline for companies is 31 October. For individuals and firms not requiring audit, 31 July.',
 'Compliance','FYNHelp Editorial','Deadlines',ARRAY['GST','TDS','Compliance','Calendar'],6,'published',now()-interval '55 days',1800),
('ca-vs-cfo-for-indian-sme',
 'Why your CA should not also be your CFO',
 'Compliance and financial strategy are two completely different skill sets. Here is why conflating them is costing Indian SME founders money and clarity.',
 E'Most Indian SMEs rely on their chartered accountant for financial guidance. This makes sense at the beginning. A CA is already handling your GST filings, your TDS returns, your audit, and your ITR. They know your numbers. It feels natural to ask them what those numbers mean for the business.\n\nThe problem is that compliance training and strategic financial thinking are different disciplines. One looks backward. The other looks forward.\n\nWhat a CA is trained to do\n\nA chartered accountant is trained in accurate historical recording, regulatory compliance, tax optimisation within the law, and audit defence. These are backward-looking activities. They answer the question: did we record and report our financial activity correctly?\n\nWhat a CFO does\n\nA CFO answers a different set of questions. Should we hire before the next revenue milestone or after? What is the minimum cash reserve we need to survive a 3-month payment delay from our largest customer? If we add one more product line, what happens to our gross margin and working capital requirement? These are forward-looking questions that require modelling, not recording.\n\nWhy conflating the two is expensive\n\nWhen a CA is asked to play CFO, they typically answer through the lens of compliance. They will tell you that hiring a new employee will increase your salary TDS obligation. They will not model the revenue impact, the break-even timeline, or the effect on burn rate and runway. You get the tax angle and miss the business angle.\n\nThe practical solution\n\nYou do not need a full-time CFO at 1.5 to 3 lakh per month to get CFO-level thinking. You need your historical data to be clean and current, a tool that can model scenarios based on that data, and alerts when the data signals a problem. That is what AI-driven financial intelligence provides. Your CA stays on compliance. The AI CFO layer handles strategy, forecasting, and alerting.',
 'Startup finance','FYNHelp Editorial','Strategy',ARRAY['CA','CFO','Startup','Strategy'],5,'published',now()-interval '62 days',1400)
ON CONFLICT (slug) DO NOTHING;
