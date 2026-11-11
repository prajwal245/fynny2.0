-- Zoho Books: a third approved entry (a payment against one open bill) and a two-way check.
--  * kind / zoho_type accept the new 'vendor_payment' / 'vendorpayment'.
--  * drift / drift_checked_at record whether an entry FynHelp created still matches Zoho.
-- Everything stays off by default; existing rows are untouched. Safe to run twice.

alter table public.ca_zoho_postings drop constraint if exists ca_zoho_postings_kind_check;
alter table public.ca_zoho_postings add constraint ca_zoho_postings_kind_check
  check (kind in ('bank_charge', 'receipt', 'vendor_payment'));

alter table public.ca_zoho_postings drop constraint if exists ca_zoho_postings_zoho_type_check;
alter table public.ca_zoho_postings add constraint ca_zoho_postings_zoho_type_check
  check (zoho_type in ('expense', 'customerpayment', 'vendorpayment'));

alter table public.ca_zoho_postings add column if not exists drift text;
alter table public.ca_zoho_postings drop constraint if exists ca_zoho_postings_drift_check;
alter table public.ca_zoho_postings add constraint ca_zoho_postings_drift_check
  check (drift is null or drift in ('ok', 'changed', 'removed'));
alter table public.ca_zoho_postings add column if not exists drift_checked_at timestamptz;

notify pgrst, 'reload schema';
