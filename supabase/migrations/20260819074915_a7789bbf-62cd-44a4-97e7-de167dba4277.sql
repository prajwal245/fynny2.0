DO $$
DECLARE v_uid uuid; v_biz uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email ILIKE 'adireddytarun@fynhelp.com' LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'pilot user not found'; END IF;
  SELECT business_id INTO v_biz FROM public.profiles WHERE user_id = v_uid;

  UPDATE public.profiles SET role = 'owner' WHERE user_id = v_uid;

  UPDATE public.businesses
     SET onboarding_completed = true,
         trial_ends_at = now() + interval '10 years',
         subscription_status = 'active',
         plan = 'enterprise'
   WHERE id = v_biz;

  INSERT INTO public.ai_usage_limits (business_id, daily_request_limit)
  VALUES (v_biz, 100000)
  ON CONFLICT (business_id) DO UPDATE SET daily_request_limit = 100000;
END $$;