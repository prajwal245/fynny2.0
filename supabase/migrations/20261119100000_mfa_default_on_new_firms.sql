-- Two-step sign-in is expected for every new CA firm. Existing firms keep the setting they have;
-- a partner can still switch it off for the firm in Settings. The portal shows a banner (CAMfaBanner)
-- to members who have no verified authenticator yet.
ALTER TABLE public.ca_firms ALTER COLUMN require_mfa SET DEFAULT true;
