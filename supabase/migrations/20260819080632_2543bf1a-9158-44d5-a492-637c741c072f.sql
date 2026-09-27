
ALTER TABLE public.ca_firms DISABLE TRIGGER trg_prevent_ca_firm_verification_self_update;
ALTER TABLE public.businesses DISABLE TRIGGER trg_link_business_to_creator;

DO $$
DECLARE
  v_user uuid := '1d05abac-e892-41fb-a3d8-870874ad92d9';
  v_firm uuid;
  v_biz uuid;
  v_bank uuid;
  v_cust uuid;
  v_vend uuid;
  r record;
  i int;
BEGIN
  -- Demo data for the original pilot account only; skip on a fresh project.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN RAISE NOTICE 'pilot user not found, skipping demo seed'; RETURN; END IF;
  SELECT id INTO v_firm FROM public.ca_firms WHERE user_id = v_user LIMIT 1;

  UPDATE public.ca_firms SET
    firm_name = 'Adireddy & Associates, Chartered Accountants',
    ca_name = 'CA Sai Tarun Adireddy',
    email = 'adireddytarun@fynhelp.com',
    phone = '+919876543210',
    whatsapp_phone = '+919876543210',
    city = 'Bengaluru',
    state = 'karnataka',
    membership_number = '245981',
    icai_membership_number = '245981',
    icai_membership_type = 'FCA',
    firm_registration_number = '012345S',
    pan_number = 'AAKCA1234F',
    years_of_practice = 11,
    specializations = ARRAY['GST','Direct Tax','Audit & Assurance','Startup Advisory'],
    plan_type = 'ca_partner',
    max_clients = 500,
    is_verified = true,
    is_active = true,
    verification_status = 'approved',
    verification_submitted_at = now() - interval '30 days',
    verification_reviewed_at = now() - interval '28 days',
    onboarding_step = 5,
    is_demo = false
  WHERE id = v_firm;

  INSERT INTO public.ca_firm_members (ca_firm_id, user_id, invited_email, role, status)
  SELECT v_firm, v_user, 'adireddytarun@fynhelp.com', 'partner', 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.ca_firm_members WHERE ca_firm_id = v_firm AND user_id = v_user);

  FOR r IN
    SELECT * FROM (VALUES
      ('Sundara Textiles Pvt Ltd','29AABCS1429B1ZL','Textiles','Bengaluru','karnataka','Ramesh Sundaram','ramesh@sundaratextiles.in','+919845012345', 1.0),
      ('Vireo Foods & Beverages LLP','29AAFCV8821K1Z3','Food Processing','Mysuru','karnataka','Anita Nair','anita@vireofoods.in','+919845098761', 0.65),
      ('Northline Logistics Pvt Ltd','27AACCN5567P1ZQ','Logistics','Pune','maharashtra','Vikram Joshi','vikram@northlinelogistics.in','+919820011223', 1.4)
    ) AS t(bname, gstin, industry, city, state, contact, cemail, cphone, scale)
  LOOP
    SELECT id INTO v_biz FROM public.businesses WHERE business_name = r.bname LIMIT 1;
    IF v_biz IS NULL THEN
      INSERT INTO public.businesses (business_name, gstin, industry, state, turnover_range, business_type, employee_count,
        plan, subscription_status, onboarding_completed, onboarding_step, is_demo, trial_ends_at)
      VALUES (r.bname, r.gstin, r.industry, r.state, '5-25 Cr', 'private_limited', (25 * r.scale)::int,
        'growth', 'active', true, 99, false, now() + interval '2 years')
      RETURNING id INTO v_biz;
    END IF;

    INSERT INTO public.ca_clients (ca_firm_id, business_id, client_name, client_email, client_phone, gstin, pan,
      client_status, onboarded_at, last_activity_at, notes, is_demo)
    SELECT v_firm, v_biz, r.bname, r.cemail, r.cphone, r.gstin, substr(r.gstin,3,10),
      'active', now() - interval '9 months', now() - interval '2 days', 'Retainer client — monthly GST + quarterly TDS + annual audit.', false
    WHERE NOT EXISTS (SELECT 1 FROM public.ca_clients WHERE ca_firm_id = v_firm AND business_id = v_biz);

    INSERT INTO public.ca_client_access (ca_firm_id, business_id, access_level, granted_by, is_active, notes, is_demo)
    SELECT v_firm, v_biz, 'full_read', v_user, true, 'Engagement letter signed.', false
    WHERE NOT EXISTS (SELECT 1 FROM public.ca_client_access WHERE ca_firm_id = v_firm AND business_id = v_biz);

    IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE business_id = v_biz) THEN
      INSERT INTO public.bank_accounts (business_id, bank_name, account_number, balance, connected, last_sync)
      VALUES (v_biz, 'HDFC Bank', 'XXXX' || lpad((floor(random()*9999))::text, 4, '0'), (4200000 * r.scale)::numeric, true, now() - interval '6 hours')
      RETURNING id INTO v_bank;

      FOR i IN 0..89 LOOP
        INSERT INTO public.transactions (business_id, bank_account_id, date, transaction_date, amount, direction, category, description, counterparty, balance_after)
        VALUES (v_biz, v_bank, (current_date - i), (current_date - i),
          CASE WHEN i % 3 = 0 THEN (185000 + (i*1900)) * r.scale ELSE (62000 + (i*850)) * r.scale END,
          CASE WHEN i % 3 = 0 THEN 'in' ELSE 'out' END,
          CASE i % 6 WHEN 0 THEN 'Sales Receipt' WHEN 1 THEN 'Vendor Payment' WHEN 2 THEN 'Salary' WHEN 3 THEN 'Rent' WHEN 4 THEN 'GST Payment' ELSE 'Utilities' END,
          CASE i % 6 WHEN 0 THEN 'Customer collection' WHEN 1 THEN 'Supplier settlement' WHEN 2 THEN 'Monthly payroll' WHEN 3 THEN 'Office rent' WHEN 4 THEN 'GSTR-3B challan' ELSE 'Electricity & internet' END,
          CASE i % 6 WHEN 0 THEN 'Metro Retail Chain' WHEN 1 THEN 'Kaveri Supplies' WHEN 2 THEN 'Payroll Batch' WHEN 3 THEN 'Prestige Estates' WHEN 4 THEN 'GSTN' ELSE 'BESCOM' END,
          (4200000 * r.scale) - (i * 24000 * r.scale));
      END LOOP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE business_id = v_biz) THEN
      FOR i IN 1..6 LOOP
        INSERT INTO public.customers (business_id, customer_name, contact_person, email, phone, gstin, city, state,
          payment_terms_days, customer_category, is_active, total_receivable, is_demo)
        VALUES (v_biz,
          (ARRAY['Metro Retail Chain','Greenfield Distributors','Ashoka Enterprises','Coastal Traders','Nova Mart Pvt Ltd','Sriram & Sons'])[i],
          (ARRAY['Deepak Rao','Farah Khan','Suresh Menon','Joel Dsouza','Priya Iyer','Mahesh Gupta'])[i],
          'accounts' || i || '@client' || i || '.in', '+9198450' || lpad((10000 + i*7)::text, 5, '0'),
          '29AAACM' || lpad((1000 + i)::text,4,'0') || 'B1Z' || i, r.city, r.state,
          (ARRAY[30,45,15,60,30,45])[i], CASE WHEN i <= 2 THEN 'key_account' ELSE 'standard' END, true,
          (350000 * i * r.scale)::numeric, false)
        RETURNING id INTO v_cust;

        INSERT INTO public.invoices (business_id, customer_id, invoice_number, invoice_date, due_date, subtotal, tax_amount,
          total_amount, paid_amount, outstanding_amount, status, payment_date, is_demo)
        VALUES (v_biz, v_cust, 'INV-2026-' || lpad((100+i)::text,4,'0'), current_date - (i*12), current_date - (i*12) + 30,
          (420000 * i * r.scale), (420000 * i * r.scale) * 0.18, (420000 * i * r.scale) * 1.18,
          CASE WHEN i % 2 = 0 THEN (420000 * i * r.scale) * 1.18 ELSE 0 END,
          CASE WHEN i % 2 = 0 THEN 0 ELSE (420000 * i * r.scale) * 1.18 END,
          CASE WHEN i % 2 = 0 THEN 'paid' WHEN i = 5 THEN 'overdue' ELSE 'sent' END,
          CASE WHEN i % 2 = 0 THEN current_date - (i*12) + 20 ELSE NULL END, false);

        IF i % 2 = 1 THEN
          INSERT INTO public.receivables (business_id, customer_name, invoice_number, invoice_date, due_date, amount, received, outstanding, risk_score, status)
          VALUES (v_biz, (ARRAY['Metro Retail Chain','Greenfield Distributors','Ashoka Enterprises','Coastal Traders','Nova Mart Pvt Ltd','Sriram & Sons'])[i],
            'INV-2026-' || lpad((100+i)::text,4,'0'), current_date - (i*12), current_date - (i*12) + 30,
            (420000 * i * r.scale) * 1.18, 0, (420000 * i * r.scale) * 1.18, 30 + (i*9),
            CASE WHEN current_date > (current_date - (i*12) + 30) THEN 'overdue' ELSE 'pending' END);
        END IF;
      END LOOP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE business_id = v_biz) THEN
      FOR i IN 1..5 LOOP
        INSERT INTO public.vendors (business_id, vendor_name, contact_person, email, phone, gstin, city,
          payment_terms_days, vendor_category, is_active, total_outstanding, is_demo)
        VALUES (v_biz, (ARRAY['Kaveri Supplies','Prestige Estates','BluePeak Logistics','Sysnet IT Services','Ravi Packaging'])[i],
          (ARRAY['Nagaraj S','Aman Verma','Kiran Bhat','Tanya Roy','Ravi Kumar'])[i],
          'vendor' || i || '@supplier' || i || '.in', '+9199860' || lpad((20000 + i*3)::text,5,'0'),
          '29AAECK' || lpad((2000 + i)::text,4,'0') || 'D1Z' || i, r.city, (ARRAY[30,15,45,30,20])[i],
          (ARRAY['raw_material','rent','logistics','software','packaging'])[i], true, (180000 * i * r.scale)::numeric, false)
        RETURNING id INTO v_vend;

        INSERT INTO public.expenses (business_id, vendor_id, category, subcategory, amount, date, due_date, description, payment_status, payment_method, is_demo)
        VALUES (v_biz, v_vend, (ARRAY['Cost of Goods','Rent','Logistics','Software','Packaging'])[i],
          (ARRAY['Raw material','Office rent','Freight','SaaS licences','Cartons'])[i],
          (210000 * i * r.scale), current_date - (i*8), current_date - (i*8) + 30,
          'Monthly billing from ' || (ARRAY['Kaveri Supplies','Prestige Estates','BluePeak Logistics','Sysnet IT Services','Ravi Packaging'])[i],
          CASE WHEN i % 2 = 0 THEN 'Paid' ELSE 'Pending' END, 'bank_transfer', false);

        IF i % 2 = 1 THEN
          INSERT INTO public.payables (business_id, vendor_name, invoice_number, due_date, amount, paid, outstanding, status)
          VALUES (v_biz, (ARRAY['Kaveri Supplies','Prestige Estates','BluePeak Logistics','Sysnet IT Services','Ravi Packaging'])[i],
            'BILL-2026-' || lpad((300+i)::text,4,'0'), current_date - (i*8) + 30, (210000 * i * r.scale), 0, (210000 * i * r.scale), 'pending');
        END IF;
      END LOOP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.employees WHERE business_id = v_biz) THEN
      FOR i IN 1..8 LOOP
        INSERT INTO public.employees (business_id, name, email, department, designation, status, date_of_joining, ctc_annual, salary_monthly, pf_number, esic_number)
        VALUES (v_biz, (ARRAY['Arjun Rao','Neha Sharma','Imran Sheikh','Lakshmi Prasad','Rohit Nair','Divya Menon','Sanjay Patil','Meera Krishnan'])[i],
          'emp' || i || '@' || lower(replace(split_part(r.bname,' ',1),'.','')) || '.in',
          (ARRAY['Operations','Finance','Sales','Operations','Engineering','HR','Logistics','Finance'])[i],
          (ARRAY['Plant Manager','Accountant','Sales Lead','Supervisor','Systems Engineer','HR Executive','Dispatch Head','AP Executive'])[i],
          'active', current_date - (i * 95), (720000 + i*115000) * r.scale, ((720000 + i*115000) * r.scale)/12,
          'KN/BNG/' || (10000+i)::text, '31' || lpad((45000+i)::text,7,'0'));
      END LOOP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.gst_filings WHERE business_id = v_biz) THEN
      FOR i IN 1..6 LOOP
        INSERT INTO public.gst_filings (business_id, return_type, filing_period, due_date, filed_date, status,
          taxable_sales, output_tax, input_tax_credit, tax_payable, arn_number)
        VALUES (v_biz, CASE WHEN i % 2 = 0 THEN 'GSTR-1' ELSE 'GSTR-3B' END,
          to_char(current_date - (i || ' months')::interval, 'MM-YYYY'),
          date_trunc('month', current_date - (i || ' months')::interval)::date + 19,
          CASE WHEN i > 1 THEN date_trunc('month', current_date - (i || ' months')::interval)::date + 17 ELSE NULL END,
          CASE WHEN i > 1 THEN 'filed' ELSE 'pending' END,
          (3800000 * r.scale), (3800000 * r.scale)*0.18, (3800000 * r.scale)*0.12, (3800000 * r.scale)*0.06,
          CASE WHEN i > 1 THEN 'AA29' || lpad((i*7777)::text, 11, '0') ELSE NULL END);
      END LOOP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.ca_compliance_events WHERE ca_firm_id = v_firm AND business_id = v_biz) THEN
      INSERT INTO public.ca_compliance_events (business_id, ca_firm_id, event_type, filing_period, due_date, filing_date, status, penalty_amount, late_fee_amount, notes, is_demo) VALUES
        (v_biz, v_firm, 'GSTR3B', to_char(current_date, 'MM-YYYY'), date_trunc('month', current_date)::date + 19, NULL, 'pending', 0, 0, 'Awaiting purchase register from client.', false),
        (v_biz, v_firm, 'GSTR1', to_char(current_date, 'MM-YYYY'), date_trunc('month', current_date)::date + 10, NULL, 'pending', 0, 0, 'Sales data reconciled.', false),
        (v_biz, v_firm, 'TDS_QUARTERLY', 'Q1-FY27', current_date + 22, NULL, 'pending', 0, 0, 'Salary TDS return.', false),
        (v_biz, v_firm, 'GSTR3B', to_char(current_date - interval '1 month','MM-YYYY'), date_trunc('month', current_date - interval '1 month')::date + 19, date_trunc('month', current_date - interval '1 month')::date + 17, 'filed', 0, 0, 'Filed on time.', false),
        (v_biz, v_firm, 'ROC_ANNUAL', 'FY26', current_date - 12, NULL, 'overdue', 0, 5000, 'Auditor appointment filing pending with MCA.', false);
    END IF;

    INSERT INTO public.ca_client_health_scores (business_id, ca_firm_id, computed_at, overall_score, cash_runway_days, cash_status,
      compliance_score, revenue_trend, itc_risk_amount, overdue_filings, pending_tds, score_breakdown, is_demo)
    SELECT v_biz, v_firm, now(), (68 + (r.scale*12))::int, (95 * r.scale)::int,
      CASE WHEN r.scale >= 1 THEN 'safe' ELSE 'watch' END,
      (74 + (r.scale*10))::int, CASE WHEN r.scale >= 1 THEN 'growing' ELSE 'stable' END,
      (145000 * r.scale)::numeric, 1, (86000 * r.scale)::numeric,
      jsonb_build_object('cash', 72, 'compliance', 80, 'receivables', 66, 'profitability', 71), false
    WHERE NOT EXISTS (SELECT 1 FROM public.ca_client_health_scores WHERE business_id = v_biz AND ca_firm_id = v_firm);

    INSERT INTO public.ca_notifications (ca_firm_id, business_id, type, title, message, severity, is_read, is_demo)
    SELECT v_firm, v_biz, 'compliance', 'GSTR-3B due for ' || r.bname,
      'GSTR-3B for the current period is due on the 20th. Purchase register still pending.', 'warning', false, false
    WHERE NOT EXISTS (SELECT 1 FROM public.ca_notifications WHERE ca_firm_id = v_firm AND business_id = v_biz);

    INSERT INTO public.ca_activity_log (ca_firm_id, business_id, action_type, description, created_at)
    SELECT v_firm, v_biz, x.a, x.d, now() - (x.h || ' hours')::interval
    FROM (VALUES ('client_onboarded','Client onboarded and engagement letter signed', 6000),
                 ('report_generated','MIS report generated for last month', 72),
                 ('filing_completed','GSTR-3B filed for previous period', 30),
                 ('document_uploaded','GSTR-2B uploaded and ITC matched', 8)) AS x(a,d,h)
    WHERE NOT EXISTS (SELECT 1 FROM public.ca_activity_log WHERE ca_firm_id = v_firm AND business_id = v_biz);
  END LOOP;
END $$;

ALTER TABLE public.ca_firms ENABLE TRIGGER trg_prevent_ca_firm_verification_self_update;
ALTER TABLE public.businesses ENABLE TRIGGER trg_link_business_to_creator;
