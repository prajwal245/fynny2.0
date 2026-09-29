-- Resources table for admin-managed downloadable templates
CREATE TABLE public.resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'Excel',
  icon_url TEXT,
  file_url TEXT,
  file_path TEXT,
  icon_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Public can read published resources
CREATE POLICY "Public can view published resources"
ON public.resources FOR SELECT
USING (is_published = true);

-- Admins can do everything
CREATE POLICY "Admins can view all resources"
ON public.resources FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert resources"
ON public.resources FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update resources"
ON public.resources FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete resources"
ON public.resources FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_resources_updated_at
BEFORE UPDATE ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for resource files (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, admin write
CREATE POLICY "Public can read resource files"
ON storage.objects FOR SELECT
USING (bucket_id = 'resources');

CREATE POLICY "Admins can upload resource files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'resources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update resource files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'resources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete resource files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'resources' AND public.has_role(auth.uid(), 'admin'));

-- Seed the existing 8 templates so the Resources page keeps working
INSERT INTO public.resources (id, title, description, format, sort_order, icon_url, file_url) VALUES
('gst-reconciliation', 'GSTR-2B Reconciliation Tracker', 'Match purchase register with GSTR-2B and flag mismatches.', 'Excel', 10,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_1_gstr2b.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/1_GSTR2B_Reconciliation_Tracker.xlsx'),
('tds-calculator', 'TDS Rate Card & Calculator', 'All TDS sections, thresholds, and a quick calculator.', 'Excel', 20,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_2_tds.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/2_TDS_Rate_Card_Calculator.xlsx'),
('cashflow-template', '13-Week Cash Flow Forecast', 'Plan inflows and outflows week by week.', 'Excel', 30,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_3_cashflow.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/3_13Week_CashFlow_Forecast.xlsx'),
('vendor-checklist', 'Vendor GST Compliance Checklist', 'Verify vendor GSTIN, filing status, and ITC eligibility.', 'PDF', 40,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_4_vendor.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/4_Vendor_GST_Compliance_Checklist.pdf'),
('invoice-template', 'GST Invoice Template', 'Compliant invoice template with HSN, CGST/SGST/IGST.', 'Excel', 50,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_5_invoice.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/5_GST_Invoice_Template.xlsx'),
('payroll-template', 'Payroll & Salary Register', 'Monthly salary register with PF, ESI, and TDS.', 'Excel', 60,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_6_payroll.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/6_Payroll_Salary_Register.xlsx'),
('board-deck', 'Investor Board Deck Template', 'Monthly board update template for founders.', 'PPT', 70,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_7_board.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/7_Investor_Board_Deck_Template.pptx'),
('cfo-checklist', 'Monthly CFO Close Checklist', 'Month-end close checklist for finance teams.', 'Word', 80,
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/icon_8_cfo.svg',
  'https://wiknwxniwqvsxgyzqqxu.supabase.co/storage/v1/object/public/fynhelp-resources/8_Monthly_CFO_Close_Checklist.docx');