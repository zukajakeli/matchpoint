-- Women's Social Club: weekly time slots, club sessions created from them
-- automatically, and registrations, linked only to the membership database
-- (members.tags 'womens_club'), plus tags in member_directory(). Nothing
-- here touches bookings, tables, timers or payments. Same statements as
-- supabase/schema.sql. Safe to re-run.

-- ── Women's Social Club ─────────────────────────────────────────────
-- Free weekly club sessions, registered from /womens-club. Completely
-- separate from table bookings: own sessions, capacities and
-- registrations; nothing here touches bookings, tables, timers, member
-- sessions/visits or payments.
--
-- The only shared data is the membership database. Each registration
-- points at a club member (matched by phone, then email; created when
-- there is none) and the member gets the 'womens_club' label. Names and
-- contact details are read from members, so they stay in sync; the
-- playing level and the session live only in the club tables.

-- Membership labels, e.g. 'womens_club'
alter table public.members add column if not exists tags text[] not null default '{}';
create index if not exists members_tags_idx on public.members using gin (tags);

-- Leftovers of earlier versions of this feature
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

create table if not exists public.womens_club_sessions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  capacity integer not null default 16 check (capacity between 1 and 500),
  is_open boolean not null default true, -- false: closed to new web registrations
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists womens_club_sessions_starts_at on public.womens_club_sessions (starts_at);
alter table public.womens_club_sessions add column if not exists ends_at timestamptz;

-- Weekly time slots: the template every week's sessions are made from.
-- weekday: 1 = Monday … 7 = Sunday. Times are Tbilisi time.
create table if not exists public.womens_club_slots (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  capacity integer not null default 16 check (capacity between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.womens_club_slots (weekday, start_time, end_time)
select * from (values
  (1, time '19:30', time '21:00'),
  (2, time '19:30', time '21:00'),
  (3, time '19:30', time '21:00'),
  (4, time '19:30', time '21:00'),
  (5, time '19:30', time '21:00'),
  (6, time '17:30', time '19:00'),
  (7, time '12:30', time '14:00')
) as seed(weekday, start_time, end_time)
where not exists (select 1 from public.womens_club_slots);

-- Weeks whose sessions were already created from the template, so a
-- session the admin deletes isn't recreated.
create table if not exists public.womens_club_weeks (
  monday date primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.womens_club_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.womens_club_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  level text not null check (level in ('never', 'beginner', 'intermediate', 'advanced')),
  source text not null default 'web' check (source in ('web', 'admin')),
  ip_hash text, -- for the per-connection rate limit only
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);
create index if not exists womens_club_registrations_member on public.womens_club_registrations (member_id);
create index if not exists womens_club_registrations_ip_recent on public.womens_club_registrations (ip_hash, created_at desc);

alter table public.womens_club_sessions enable row level security;
alter table public.womens_club_registrations enable row level security;
alter table public.womens_club_slots enable row level security;
alter table public.womens_club_weeks enable row level security;

-- Staff see the schedule and the lists; the superadmin manages them.
-- The public page goes through womens_club_schedule() / womens_club_register() only.
drop policy if exists "staff_read" on public.womens_club_sessions;
drop policy if exists "superadmin_write" on public.womens_club_sessions;
drop policy if exists "staff_read" on public.womens_club_registrations;
drop policy if exists "superadmin_delete" on public.womens_club_registrations;
create policy "staff_read" on public.womens_club_sessions
  for select to authenticated using (public.is_staff());
create policy "superadmin_write" on public.womens_club_sessions
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "staff_read" on public.womens_club_registrations
  for select to authenticated using (public.is_staff());
create policy "superadmin_delete" on public.womens_club_registrations
  for delete to authenticated using (public.is_superadmin());
drop policy if exists "staff_read" on public.womens_club_slots;
drop policy if exists "superadmin_write" on public.womens_club_slots;
drop policy if exists "staff_read" on public.womens_club_weeks;
create policy "staff_read" on public.womens_club_slots
  for select to authenticated using (public.is_staff());
create policy "superadmin_write" on public.womens_club_slots
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "staff_read" on public.womens_club_weeks
  for select to authenticated using (public.is_staff());

-- Creates a week's sessions from the active time slots, once per week.
-- Weeks that already have sessions (made by hand) are left alone.
create or replace function public.womens_club_fill_week(p_monday date, p_force boolean default false)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.womens_club_weeks (monday) values (p_monday) on conflict do nothing;
  if not found and not p_force then
    return 0;
  end if;
  if not p_force and exists (
    select 1 from public.womens_club_sessions s
    where (s.starts_at at time zone 'Asia/Tbilisi')::date between p_monday and p_monday + 6
  ) then
    return 0;
  end if;
  insert into public.womens_club_sessions (starts_at, ends_at, capacity)
  select (p_monday + (t.weekday - 1) + t.start_time) at time zone 'Asia/Tbilisi',
         (p_monday + (t.weekday - 1) + t.end_time) at time zone 'Asia/Tbilisi',
         t.capacity
  from public.womens_club_slots t
  where t.is_active
    and not exists (
      select 1 from public.womens_club_sessions s
      where s.starts_at = (p_monday + (t.weekday - 1) + t.start_time) at time zone 'Asia/Tbilisi'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One week of sessions for the public page: the next 7 days. This week's
-- and next week's sessions are created from the time slots on first use.
-- Places left only, no personal data.
drop function if exists public.womens_club_schedule();
create or replace function public.womens_club_schedule()
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, capacity integer, spots_left integer, is_open boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_monday date := date_trunc('week', now() at time zone 'Asia/Tbilisi')::date;
begin
  perform public.womens_club_fill_week(v_monday);
  perform public.womens_club_fill_week(v_monday + 7);
  return query
  select s.id, s.starts_at, s.ends_at, s.capacity,
         greatest(s.capacity - (select count(*) from public.womens_club_registrations r where r.session_id = s.id), 0)::integer,
         s.is_open
  from public.womens_club_sessions s
  where s.starts_at > now()
    and s.starts_at < now() + interval '7 days'
  order by s.starts_at;
end;
$$;

-- Shared by the public form and the admin. The session row is locked
-- first, so registrations for one session run one at a time and the
-- capacity check can't be raced, however many people submit at once.
create or replace function public.womens_club_add_registration(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text,
  p_source text,
  p_ip_hash text
) returns public.womens_club_registrations
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.womens_club_sessions;
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_phone text := public.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_member_id uuid;
  v_taken integer;
  v_reg public.womens_club_registrations;
begin
  if v_first = '' or v_last = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if length(v_first) > 80 or length(v_last) > 80 then
    raise exception 'NAME_TOO_LONG';
  end if;
  if v_phone is null or length(v_phone) < 8 or length(v_phone) > 15 then
    raise exception 'INVALID_PHONE';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$') then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_level is null or p_level not in ('never', 'beginner', 'intermediate', 'advanced') then
    raise exception 'INVALID_LEVEL';
  end if;

  select * into v_session from public.womens_club_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if p_source = 'web' then
    if v_session.starts_at <= now() then
      raise exception 'SESSION_STARTED';
    end if;
    if not v_session.is_open then
      raise exception 'SESSION_CLOSED';
    end if;
  end if;

  -- The club member with this phone, or else this email
  select id into v_member_id from public.members where phone = v_phone;
  if v_member_id is null and v_email is not null then
    select id into v_member_id from public.members where email = v_email order by registered_at limit 1;
  end if;

  if v_member_id is not null and exists (
    select 1 from public.womens_club_registrations r where r.session_id = p_session_id and r.member_id = v_member_id
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;
  select count(*) into v_taken from public.womens_club_registrations where session_id = p_session_id;
  if v_taken >= v_session.capacity then
    raise exception 'SESSION_FULL';
  end if;

  begin
    if v_member_id is null then
      insert into public.members (first_name, last_name, phone, email, home_branch_id, tags)
      values (v_first, v_last, v_phone, v_email, 'main', array['womens_club'])
      returning id into v_member_id;
    end if;

    -- Existing members keep their details; they get the label, and an
    -- email if they had none (and nobody else uses it).
    update public.members m set
      tags = case when 'womens_club' = any(m.tags) then m.tags else array_append(m.tags, 'womens_club') end,
      email = case
        when m.email is null and v_email is not null
             and not exists (select 1 from public.members o where o.email = v_email and o.id <> m.id)
          then v_email
        else m.email
      end
    where m.id = v_member_id
      and (not ('womens_club' = any(m.tags)) or (m.email is null and v_email is not null));

    insert into public.womens_club_registrations (session_id, member_id, level, source, ip_hash)
    values (p_session_id, v_member_id, p_level, p_source, p_ip_hash)
    returning * into v_reg;
  exception when unique_violation then
    -- the same person submitted a moment ago (another tab)
    raise exception 'ALREADY_REGISTERED';
  end;
  return v_reg;
end;
$$;

-- Public registration (anon). Email is required here, optional for the
-- admin. At most 20 registrations per connection per hour, which still
-- leaves room for many phones behind one mobile network address.
drop function if exists public.womens_club_register(uuid, text, text, text, text, text);
create or replace function public.womens_club_register(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text
) returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := trim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1));
  v_hash text := case when v_ip <> '' then md5('wc-rate:' || v_ip) end;
  v_reg public.womens_club_registrations;
begin
  if v_hash is not null and (
    select count(*) from public.womens_club_registrations r
    where r.ip_hash = v_hash and r.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'RATE_LIMITED';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'INVALID_EMAIL';
  end if;
  v_reg := public.womens_club_add_registration(p_session_id, p_first_name, p_last_name, p_phone, p_email, p_level, 'web', v_hash);
  return query select s.starts_at, s.ends_at from public.womens_club_sessions s where s.id = v_reg.session_id;
end;
$$;

-- Admin: add someone by hand. Works on closed and past sessions; the
-- capacity still applies (raise it first to squeeze someone in).
create or replace function public.womens_club_admin_add(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text
) returns public.womens_club_registrations
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.womens_club_add_registration(p_session_id, p_first_name, p_last_name, p_phone, p_email, p_level, 'admin', null);
end;
$$;

-- Admin: create a week's sessions from the time slots on demand
create or replace function public.womens_club_admin_fill_week(p_monday date)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.womens_club_fill_week(p_monday, true);
end;
$$;

revoke all on function public.womens_club_fill_week(date, boolean) from public, anon, authenticated;
revoke all on function public.womens_club_admin_fill_week(date) from public, anon;
grant execute on function public.womens_club_admin_fill_week(date) to authenticated;
revoke all on function public.womens_club_add_registration(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.womens_club_schedule() from public;
revoke all on function public.womens_club_register(uuid, text, text, text, text, text) from public;
revoke all on function public.womens_club_admin_add(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.womens_club_schedule() to anon, authenticated;
grant execute on function public.womens_club_register(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.womens_club_admin_add(uuid, text, text, text, text, text) to authenticated;

-- Dropped first so an older version with different columns is replaced.
drop function if exists public.member_directory(text);
create or replace function public.member_directory(p_period text default 'month')
returns table (
  id uuid, member_code text, first_name text, last_name text, phone text, email text,
  status text, registered_at timestamptz,
  visits_period integer, visits_month integer, visits_year integer, visits_total integer,
  hours_period numeric, hours_total numeric, last_visit_at timestamptz,
  points_balance integer, lifetime_points integer, segment text, tags text[]
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
    end,
    m.tags
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
