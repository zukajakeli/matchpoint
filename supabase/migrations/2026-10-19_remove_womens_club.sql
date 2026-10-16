-- Removes the Women's Social Club completely: its tables (with any
-- applications in them), functions, and the members.tags column.
-- Restores member_directory() to its original columns. Safe to re-run,
-- and harmless on a database that never had the feature.

drop function if exists public.wc_slot_list();
drop function if exists public.wc_apply(uuid, text, text, text, text, text);
drop function if exists public.wc_admin_add(uuid, text, text, text, text, text);
drop function if exists public.wc_admin_move(uuid, uuid);
drop function if exists public.wc_add_application(uuid, text, text, text, text, text, text, text);
drop function if exists public.wc_schedule();
drop function if exists public.wc_register(uuid, text, text, text, text, text);
drop function if exists public.wc_add_registration(uuid, text, text, text, text, text, text, text);
drop table if exists public.wc_applications;
drop table if exists public.wc_slots;
drop table if exists public.wc_registrations;
drop table if exists public.wc_sessions;
drop index if exists public.members_tags_idx;
alter table public.members drop column if exists tags;

-- Dropped first so an older version with different columns is replaced.
drop function if exists public.member_directory(text);
create or replace function public.member_directory(p_period text default 'month')
returns table (
  id uuid, member_code text, first_name text, last_name text, phone text, email text,
  status text, registered_at timestamptz,
  visits_period integer, visits_month integer, visits_year integer, visits_total integer,
  hours_period numeric, hours_total numeric, last_visit_at timestamptz,
  points_balance integer, lifetime_points integer, segment text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'Asia/Tbilisi';
  v_from timestamptz;
  v_month timestamptz := date_trunc('month', v_local) at time zone 'Asia/Tbilisi';
  v_year timestamptz := date_trunc('year', v_local) at time zone 'Asia/Tbilisi';
  g jsonb;
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  v_from := case p_period
    when 'week' then date_trunc('week', v_local) at time zone 'Asia/Tbilisi'
    when 'month' then v_month
    when '30d' then now() - interval '30 days'
    when 'year' then v_year
    else '-infinity'::timestamptz
  end;
  select ls.segments into g from public.loyalty_settings ls where ls.id = 1;
  g := coalesce(g, '{}'::jsonb);

  return query
  select
    m.id, m.member_code, m.first_name, m.last_name, m.phone, m.email, m.status, m.registered_at,
    vs.vp, vs.vm, vs.vy, vs.vt,
    round(ss.sp / 3600.0, 2), round(ss.st / 3600.0, 2),
    vs.last_v, pts.balance, pts.lifetime,
    case
      when m.registered_at >= now() - make_interval(days => coalesce((g ->> 'new_days')::int, 30))
           and vs.vt <= 1 then 'new'
      when vs.v_high >= coalesce((g ->> 'highly_active_min_visits')::int, 8) then 'highly_active'
      when vs.v_regular >= coalesce((g ->> 'regular_min_visits')::int, 4) then 'regular'
      when vs.v_prior >= coalesce((g ->> 'at_risk_prior_min_visits')::int, 3) and vs.v_silent = 0 then 'at_risk'
      when vs.last_v is null
           or vs.last_v < now() - make_interval(days => coalesce((g ->> 'inactive_days')::int, 30)) then 'inactive'
      when vs.vt >= 2 then 'returning'
      else 'one_time'
    end
  from public.members m
  cross join lateral (
    select
      count(*) filter (where v.started_at >= v_from)::integer as vp,
      count(*) filter (where v.started_at >= v_month)::integer as vm,
      count(*) filter (where v.started_at >= v_year)::integer as vy,
      count(*)::integer as vt,
      max(v.started_at) as last_v,
      count(*) filter (where v.started_at >= now()
        - make_interval(days => coalesce((g ->> 'highly_active_window_days')::int, 30))) as v_high,
      count(*) filter (where v.started_at >= now()
        - make_interval(days => coalesce((g ->> 'regular_window_days')::int, 60))) as v_regular,
      count(*) filter (where v.started_at >= now()
        - make_interval(days => coalesce((g ->> 'at_risk_silent_days')::int, 21))) as v_silent,
      count(*) filter (where
        v.started_at < now() - make_interval(days => coalesce((g ->> 'at_risk_silent_days')::int, 21))
        and v.started_at >= now() - make_interval(days =>
          coalesce((g ->> 'at_risk_silent_days')::int, 21)
          + coalesce((g ->> 'at_risk_prior_window_days')::int, 60))) as v_prior
    from public.member_visits v
    where v.member_id = m.id
  ) vs
  cross join lateral (
    select
      coalesce(sum(s.duration_seconds) filter (where s.started_at >= v_from), 0) as sp,
      coalesce(sum(s.duration_seconds), 0) as st
    from public.member_sessions s
    where s.member_id = m.id and s.status = 'completed'
  ) ss
  cross join lateral public.member_points(m.id) pts;
end;
$$;
revoke all on function public.member_directory(text) from public, anon;
grant execute on function public.member_directory(text) to authenticated;
