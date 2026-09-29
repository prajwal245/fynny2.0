create table if not exists public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  action text not null,
  attempt_count integer not null default 1,
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  ip_address text,
  created_at timestamptz not null default now()
);

create unique index if not exists auth_rate_limits_identifier_action_idx
  on public.auth_rate_limits (identifier, action);

grant all on public.auth_rate_limits to service_role;

alter table public.auth_rate_limits enable row level security;

create policy "Service role only"
  on public.auth_rate_limits for all to service_role
  using (true) with check (true);

create or replace function public.check_and_increment_rate_limit(
  p_identifier text,
  p_action text,
  p_max_attempts integer default 5,
  p_window_seconds integer default 900,
  p_lockout_seconds integer default 1800
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_record public.auth_rate_limits%rowtype;
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - (p_window_seconds || ' seconds')::interval;
begin
  select * into v_record
  from public.auth_rate_limits
  where identifier = p_identifier and action = p_action for update;

  if not found then
    insert into public.auth_rate_limits (identifier, action, attempt_count, first_attempt_at, last_attempt_at)
    values (p_identifier, p_action, 1, v_now, v_now);
    return jsonb_build_object('allowed', true, 'attempts_remaining', p_max_attempts - 1);
  end if;

  if v_record.locked_until is not null and v_record.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'locked_until', v_record.locked_until,
      'retry_after_seconds', extract(epoch from (v_record.locked_until - v_now))::integer
    );
  end if;

  if v_record.first_attempt_at < v_window_start then
    update public.auth_rate_limits
    set attempt_count = 1, first_attempt_at = v_now, last_attempt_at = v_now, locked_until = null
    where identifier = p_identifier and action = p_action;
    return jsonb_build_object('allowed', true, 'attempts_remaining', p_max_attempts - 1);
  end if;

  if v_record.attempt_count >= p_max_attempts then
    update public.auth_rate_limits
    set attempt_count = v_record.attempt_count + 1,
        last_attempt_at = v_now,
        locked_until = v_now + (p_lockout_seconds || ' seconds')::interval
    where identifier = p_identifier and action = p_action;
    return jsonb_build_object(
      'allowed', false,
      'locked_until', v_now + (p_lockout_seconds || ' seconds')::interval,
      'retry_after_seconds', p_lockout_seconds
    );
  end if;

  update public.auth_rate_limits
  set attempt_count = v_record.attempt_count + 1, last_attempt_at = v_now
  where identifier = p_identifier and action = p_action;

  return jsonb_build_object(
    'allowed', true,
    'attempts_remaining', p_max_attempts - v_record.attempt_count - 1
  );
end;
$$;

grant execute on function public.check_and_increment_rate_limit to service_role;

create or replace function public.reset_rate_limit(p_identifier text, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.auth_rate_limits where identifier = p_identifier and action = p_action;
end;
$$;

grant execute on function public.reset_rate_limit to service_role;