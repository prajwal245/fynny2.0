
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_client_access ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_compliance_events ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_itc_records ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_tds_records ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_client_health_scores ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_notifications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

DELETE FROM public.ca_notifications WHERE is_demo = true;
DELETE FROM public.ca_tds_records WHERE is_demo = true;
DELETE FROM public.ca_itc_records WHERE is_demo = true;
DELETE FROM public.ca_compliance_events WHERE is_demo = true;
DELETE FROM public.ca_client_health_scores WHERE is_demo = true;
DELETE FROM public.ca_client_access WHERE is_demo = true;
DELETE FROM public.businesses WHERE is_demo = true;
DELETE FROM public.ca_firms WHERE is_demo = true;

INSERT INTO public.ca_firms (id, user_id, firm_name, phone, email, city, state, icai_membership_number, icai_membership_type, years_of_practice, is_verified, is_active, verification_status, onboarding_step, is_demo)
VALUES ('a0000000-ca00-de00-0000-000000000001', NULL, 'Mehta and Associates', '9876543210', 'demo@fynhelp.com', 'Bengaluru', 'Karnataka', '123456', 'FCA', 12, true, true, 'approved', 4, true);

ALTER TABLE public.businesses DISABLE TRIGGER USER;
INSERT INTO public.businesses (id, business_name, gstin, industry, turnover_range, is_demo) VALUES
('b0000001-de00-0000-0000-000000000001', 'Sunrise Textiles Pvt Ltd', '29AADCS1234A1ZV', 'Textiles and Apparel', '1Cr-5Cr', true),
('b0000001-de00-0000-0000-000000000002', 'TechNova Solutions LLP', '29AADCT5678B2ZW', 'Software and IT Services', '50L-1Cr', true),
('b0000001-de00-0000-0000-000000000003', 'Green Harvest Agro', '29AADCG9012C3ZX', 'Agriculture and Food Processing', '25L-50L', true),
('b0000001-de00-0000-0000-000000000004', 'SwiftMove Logistics', '29AADCM3456D4ZY', 'Logistics and Transportation', '5Cr-10Cr', true),
('b0000001-de00-0000-0000-000000000005', 'CityBite Foods', '29AADCF7890E5ZZ', 'Food and Beverage', '1Cr-5Cr', true),
('b0000001-de00-0000-0000-000000000006', 'Prakash Steel Works', '29AADCP2345F6ZA', 'Manufacturing', '10Cr-25Cr', true),
('b0000001-de00-0000-0000-000000000007', 'BlueSky Pharma', '29AADCB6789G7ZB', 'Pharmaceuticals', '5Cr-10Cr', true),
('b0000001-de00-0000-0000-000000000008', 'Design Studio Riya', '29AADCD1234H8ZC', 'Creative Services', '10L-25L', true);
ALTER TABLE public.businesses ENABLE TRIGGER USER;

INSERT INTO public.ca_client_access (id, ca_firm_id, business_id, access_level, is_active, client_reference_code, storage_namespace, granted_at, is_demo) VALUES
('ac00de01-0000-0000-0000-000000000001', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000001', 'full_read', true, 'FYN-09001', 'demo/b001', now() - interval '45 days', true),
('ac00de01-0000-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000002', 'full_read', true, 'FYN-09002', 'demo/b002', now() - interval '32 days', true),
('ac00de01-0000-0000-0000-000000000003', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000003', 'full_read', true, 'FYN-09003', 'demo/b003', now() - interval '28 days', true),
('ac00de01-0000-0000-0000-000000000004', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000004', 'full_read', true, 'FYN-09004', 'demo/b004', now() - interval '20 days', true),
('ac00de01-0000-0000-0000-000000000005', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000005', 'full_read', true, 'FYN-09005', 'demo/b005', now() - interval '15 days', true),
('ac00de01-0000-0000-0000-000000000006', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000006', 'full_read', true, 'FYN-09006', 'demo/b006', now() - interval '12 days', true),
('ac00de01-0000-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000007', 'full_read', true, 'FYN-09007', 'demo/b007', now() - interval '8 days', true),
('ac00de01-0000-0000-0000-000000000008', 'a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000008', 'full_read', true, 'FYN-09008', 'demo/b008', now() - interval '3 days', true);

INSERT INTO public.ca_client_health_scores (business_id, ca_firm_id, overall_score, cash_status, compliance_score, itc_risk_amount, overdue_filings, pending_tds, is_demo) VALUES
('b0000001-de00-0000-0000-000000000001', 'a0000000-ca00-de00-0000-000000000001', 82, 'safe', 88, 0, 0, 0, true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 34, 'critical', 40, 85000, 2, 12400, true),
('b0000001-de00-0000-0000-000000000003', 'a0000000-ca00-de00-0000-000000000001', 65, 'watch', 72, 18000, 1, 0, true),
('b0000001-de00-0000-0000-000000000004', 'a0000000-ca00-de00-0000-000000000001', 78, 'safe', 85, 5000, 0, 8200, true),
('b0000001-de00-0000-0000-000000000005', 'a0000000-ca00-de00-0000-000000000001', 51, 'watch', 55, 42000, 1, 0, true),
('b0000001-de00-0000-0000-000000000006', 'a0000000-ca00-de00-0000-000000000001', 91, 'safe', 95, 0, 0, 0, true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 44, 'watch', 50, 67000, 1, 31000, true),
('b0000001-de00-0000-0000-000000000008', 'a0000000-ca00-de00-0000-000000000001', 76, 'safe', 80, 0, 0, 0, true);

INSERT INTO public.ca_compliance_events (business_id, ca_firm_id, event_type, filing_period, due_date, status, penalty_amount, is_demo) VALUES
('b0000001-de00-0000-0000-000000000001', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000001', 'a0000000-ca00-de00-0000-000000000001', 'GSTR1', 'Jun 2026', current_date + 11, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000001', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'May 2026', current_date - 12, 'filed', 0, true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'May 2026', current_date - 12, 'overdue', 1000, true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'TDS_QUARTERLY', 'Q1 2026-27', current_date - 5, 'overdue', 2500, true),
('b0000001-de00-0000-0000-000000000003', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000003', 'a0000000-ca00-de00-0000-000000000001', 'GSTR1', 'May 2026', current_date - 22, 'overdue', 500, true),
('b0000001-de00-0000-0000-000000000004', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000004', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'May 2026', current_date - 12, 'filed', 0, true),
('b0000001-de00-0000-0000-000000000005', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000005', 'a0000000-ca00-de00-0000-000000000001', 'TDS_QUARTERLY', 'Q1 2026-27', current_date + 28, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000006', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'filed', 0, true),
('b0000001-de00-0000-0000-000000000006', 'a0000000-ca00-de00-0000-000000000001', 'GSTR9', 'FY 2025-26', '2026-12-31', 'pending', 0, true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 'TDS_QUARTERLY', 'Q1 2026-27', current_date - 3, 'overdue', 1800, true),
('b0000001-de00-0000-0000-000000000008', 'a0000000-ca00-de00-0000-000000000001', 'GSTR3B', 'Jun 2026', current_date + 4, 'pending', 0, true),
('b0000001-de00-0000-0000-000000000008', 'a0000000-ca00-de00-0000-000000000001', 'GSTR1', 'Jun 2026', current_date + 11, 'pending', 0, true);

INSERT INTO public.ca_itc_records (business_id, ca_firm_id, filing_period, gstin_supplier, supplier_name, invoice_number, invoice_date, taxable_value, igst_amount, cgst_amount, sgst_amount, gstr2b_matched, match_status, mismatch_amount, source, is_demo) VALUES
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AAACR5055K1ZK', 'Reliance Industries Ltd', 'INV-2026-00142', '2026-05-03', 120000, 0, 10800, 10800, true, 'matched', null, 'manual', true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AABCT3518Q1ZV', 'Tata Steel Ltd', 'TSL-MAY-0089', '2026-05-08', 85000, 15300, 0, 0, false, 'mismatch', 2700, 'manual', true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AAHCM5676E1ZE', 'Mahindra Logistics', 'ML-2026-0334', '2026-05-14', 42000, 7560, 0, 0, false, 'missing_in_2b', null, 'manual', true),
('b0000001-de00-0000-0000-000000000005', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AABCP9897E1ZG', 'Packaging World Pvt Ltd', 'PW-0567', '2026-05-06', 28000, 0, 2520, 2520, true, 'matched', null, 'manual', true),
('b0000001-de00-0000-0000-000000000005', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AADCF1234K1ZX', 'Fresh Farms Supplies', 'FFS-2026-112', '2026-05-19', 65000, 0, 5850, 5850, false, 'mismatch', 1800, 'manual', true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AABCI5678M1ZR', 'Cipla Ltd', 'CIP-B2B-0921', '2026-05-02', 210000, 37800, 0, 0, true, 'matched', null, 'manual', true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AABCD4567N1ZS', 'Dr Reddys Labs', 'DRL-INV-0445', '2026-05-11', 95000, 17100, 0, 0, false, 'missing_in_2b', null, 'manual', true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', 'May 2026', '29AAACL1234P1ZT', 'Lupin Pharma', 'LUP-2026-0089', '2026-05-22', 78000, 14040, 0, 0, false, 'mismatch', 3200, 'manual', true);

INSERT INTO public.ca_tds_records (business_id, ca_firm_id, financial_year, quarter, section_code, deductee_name, deductee_pan, payment_date, payment_amount, tds_rate, tds_amount, deposited_amount, challan_number, challan_date, return_filed, status, is_demo) VALUES
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', '2026-27', 'Q1', '194J', 'Kapoor IT Consultants', 'AABPK1234A', '2026-04-15', 150000, 10, 15000, 0, null, null, false, 'overdue', true),
('b0000001-de00-0000-0000-000000000002', 'a0000000-ca00-de00-0000-000000000001', '2026-27', 'Q1', '194C', 'Swift Transport Co', 'AACPS5678B', '2026-05-10', 85000, 1, 850, 850, 'CHL20260510', '2026-05-20', false, 'deposited', true),
('b0000001-de00-0000-0000-000000000004', 'a0000000-ca00-de00-0000-000000000001', '2026-27', 'Q1', '194I', 'Prestige Properties', 'AABPP9012C', '2026-04-01', 240000, 10, 24000, 24000, 'CHL20260401', '2026-04-07', true, 'return_filed', true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', '2026-27', 'Q1', '194J', 'MedResearch Labs', 'AACPM3456D', '2026-04-20', 320000, 10, 32000, 0, null, null, false, 'overdue', true),
('b0000001-de00-0000-0000-000000000007', 'a0000000-ca00-de00-0000-000000000001', '2026-27', 'Q1', '194C', 'Biocare Packaging', 'AABPB7890E', '2026-05-05', 45000, 2, 900, 900, 'CHL20260510B', '2026-05-12', false, 'deposited', true);

INSERT INTO public.ca_notifications (ca_firm_id, business_id, type, title, message, severity, is_read, is_demo) VALUES
('a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000002', 'filing_overdue', 'GSTR-3B overdue', 'TechNova Solutions has an overdue GSTR-3B for May 2026. Penalty accumulating at Rs 50 per day.', 'critical', false, true),
('a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000007', 'tds_overdue', 'TDS deposit overdue', 'BlueSky Pharma TDS under 194J of Rs 32,000 is overdue. Interest will apply from due date.', 'critical', false, true),
('a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000003', 'filing_overdue', 'GSTR-1 overdue', 'Green Harvest Agro GSTR-1 for May 2026 was not filed. Rs 500 late fee applies.', 'warning', false, true),
('a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000005', 'itc_mismatch', 'ITC mismatch detected', 'CityBite Foods has 2 ITC mismatches totalling Rs 7,650 in May 2026. Review before GSTR-3B filing.', 'warning', true, true),
('a0000000-ca00-de00-0000-000000000001', 'b0000001-de00-0000-0000-000000000001', 'filing_due_soon', 'GSTR-3B due in 4 days', 'Sunrise Textiles GSTR-3B for Jun 2026 is due soon. Prepare and file in time.', 'info', true, true);

CREATE OR REPLACE FUNCTION public.clear_ca_demo_data()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.ca_notifications WHERE is_demo = true;
  DELETE FROM public.ca_tds_records WHERE is_demo = true;
  DELETE FROM public.ca_itc_records WHERE is_demo = true;
  DELETE FROM public.ca_compliance_events WHERE is_demo = true;
  DELETE FROM public.ca_client_health_scores WHERE is_demo = true;
  DELETE FROM public.ca_client_access WHERE is_demo = true;
  DELETE FROM public.businesses WHERE is_demo = true;
  DELETE FROM public.ca_firms WHERE is_demo = true;
  RETURN 'All CA demo data cleared.';
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_ca_demo_data TO service_role;
