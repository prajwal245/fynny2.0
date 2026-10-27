-- Money coupons no longer need an Offer made by hand in Razorpay. FynHelp creates the discounted Razorpay plan itself
-- (Razorpay lets plans be created through its API, but not offers) and, for "first payment only" codes, moves the
-- subscription back to the normal plan after the first period. Older coupons that carry a Razorpay offer keep working.
ALTER TABLE public.ca_coupons DROP CONSTRAINT IF EXISTS ca_coupons_offer;

-- first: the discount applies to the first payment only. forever: to every payment of the plan.
ALTER TABLE public.ca_coupons ADD COLUMN IF NOT EXISTS duration text NOT NULL DEFAULT 'first';
ALTER TABLE public.ca_coupons DROP CONSTRAINT IF EXISTS ca_coupons_duration;
ALTER TABLE public.ca_coupons ADD CONSTRAINT ca_coupons_duration CHECK (duration IN ('first', 'forever'));

-- The firm paid on a discounted plan that still has to be moved back to the normal one after the first period.
ALTER TABLE public.ca_billing ADD COLUMN IF NOT EXISTS coupon_revert_pending boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ca_billing_coupon_revert_idx ON public.ca_billing (ca_firm_id) WHERE coupon_revert_pending;
