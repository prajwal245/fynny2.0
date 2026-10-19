-- Opening and closing stock for a Tally snapshot. Tally works stock out when a
-- report runs, so it is not in any ledger; the agent reads it from the
-- Stock-in-Hand group and the statements use it for Inventories, the change in
-- inventories, and the opening-stock line of the trial balance.
alter table public.ca_tally_snapshots add column if not exists opening_stock numeric(16,2) not null default 0;
alter table public.ca_tally_snapshots add column if not exists closing_stock numeric(16,2) not null default 0;
