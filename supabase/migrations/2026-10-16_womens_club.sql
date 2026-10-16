-- Women's Social Club: sessions, registrations, members.tags, and tags in
-- member_directory(). Same statements as supabase/schema.sql. Safe to re-run.

-- ── Women's Social Club ─────────────────────────────────────────────
-- Weekly sessions with limited places, registered from the unlisted
-- /womens-club page. Every registration is linked to a club member
-- (matched by phone, then email; created when there is none) and the
-- member gets the 'womens_club' tag. Availability is always counted from
-- the registrations, so removing someone frees the place right away.

-- Free-form labels on members, e.g. 'womens_club'
alter table public.members add column if not exists tags text[] not null default '{}';
create index if not exists members_tags_idx on public.members using gin (tags);

create table if not exists public.wc_sessions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  capacity integer not null default 16 check (capacity between 1 and 500),
  is_open boolean not null default true, -- false: closed to new web registrations
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wc_sessions_starts_at on public.wc_sessions (starts_at);

create table if not exists public.wc_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wc_sessions(id) on delete cascade,
  member_id uuid null references public.members(id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text not null, -- normalised like members.phone
  email text,
  level text not null check (level in ('never', 'beginner', 'intermediate', 'advanced')),
  source text not null default 'web' check (source in ('web', 'admin')),
  ip_hash text, -- for the per-connection rate limit only
  created_at timestamptz not null default now(),
  unique (session_id, phone)
);
create index if not exists wc_registrations_session on public.wc_registrations (session_id);
create index if not exists wc_registrations_ip_recent on public.wc_registrations (ip_hash, created_at desc);

alter table public.wc_sessions enable row level security;
alter table public.wc_registrations enable row level security;

-- Staff see the schedule and the lists; the superadmin manages them.
-- The public page goes through wc_schedule() / wc_register() only.
drop policy if exists "staff_read" on public.wc_sessions;
drop policy if exists "superadmin_write" on public.wc_sessions;
drop policy if exists "staff_read" on public.wc_registrations;
drop policy if exists "superadmin_delete" on public.wc_registrations;
create policy "staff_read" on public.wc_sessions
  for select to authenticated using (public.is_staff());
create policy "superadmin_write" on public.wc_sessions
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "staff_read" on public.wc_registrations
  for select to authenticated using (public.is_staff());
create policy "superadmin_delete" on public.wc_registrations
  for delete to authenticated using (public.is_superadmin());

-- Upcoming sessions with the places left. No personal data.
create or replace function public.wc_schedule()
returns table (id uuid, starts_at timestamptz, capacity integer, spots_left integer, is_open boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.capacity,
         greatest(s.capacity - (select count(*) from public.wc_registrations r where r.session_id = s.id), 0)::integer,
         s.is_open
  from public.wc_sessions s
  where s.starts_at > now()
  order by s.starts_at
  limit 40;
$$;

-- Shared by the public form and the admin. The session row is locked
-- first, so registrations for one session run one at a time and the
-- capacity check can't be raced, however many people submit at once.
create or replace function public.wc_add_registration(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text,
  p_source text,
  p_ip_hash text
) returns public.wc_registrations
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.wc_sessions;
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_phone text := public.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_member_id uuid;
  v_taken integer;
  v_reg public.wc_registrations;
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

  select * into v_session from public.wc_sessions where id = p_session_id for update;
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
  if exists (
    select 1 from public.wc_registrations r
    where r.session_id = p_session_id
      and (r.phone = v_phone or (v_email is not null and r.email = v_email))
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;
  select count(*) into v_taken from public.wc_registrations where session_id = p_session_id;
  if v_taken >= v_session.capacity then
    raise exception 'SESSION_FULL';
  end if;

  -- The club member with this phone, or else this email
  select id into v_member_id from public.members where phone = v_phone;
  if v_member_id is null and v_email is not null then
    select id into v_member_id from public.members where email = v_email order by registered_at limit 1;
  end if;

  if v_member_id is null then
    begin
      insert into public.members (first_name, last_name, phone, email, home_branch_id, tags)
      values (v_first, v_last, v_phone, v_email, 'main', array['womens_club'])
      returning id into v_member_id;
    exception when unique_violation then
      -- registered a moment ago from another session's form
      select id into v_member_id from public.members where phone = v_phone;
    end;
  end if;

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

  insert into public.wc_registrations (session_id, member_id, first_name, last_name, phone, email, level, source, ip_hash)
  values (p_session_id, v_member_id, v_first, v_last, v_phone, v_email, p_level, p_source, p_ip_hash)
  returning * into v_reg;
  return v_reg;
end;
$$;

-- Public registration (anon). Email is required here, optional for the
-- admin. At most 20 registrations per connection per hour, which still
-- leaves room for many phones behind one mobile network address.
create or replace function public.wc_register(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text
) returns table (starts_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := trim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1));
  v_hash text := case when v_ip <> '' then md5('wc-rate:' || v_ip) end;
  v_reg public.wc_registrations;
begin
  if v_hash is not null and (
    select count(*) from public.wc_registrations r
    where r.ip_hash = v_hash and r.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'RATE_LIMITED';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'INVALID_EMAIL';
  end if;
  v_reg := public.wc_add_registration(p_session_id, p_first_name, p_last_name, p_phone, p_email, p_level, 'web', v_hash);
  return query select s.starts_at from public.wc_sessions s where s.id = v_reg.session_id;
end;
$$;

-- Admin: add someone by hand. Works on closed and past sessions; the
-- capacity still applies (raise it first to squeeze someone in).
create or replace function public.wc_admin_add(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text
) returns public.wc_registrations
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.wc_add_registration(p_session_id, p_first_name, p_last_name, p_phone, p_email, p_level, 'admin', null);
end;
$$;

revoke all on function public.wc_add_registration(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.wc_schedule() from public;
revoke all on function public.wc_register(uuid, text, text, text, text, text) from public;
revoke all on function public.wc_admin_add(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.wc_schedule() to anon, authenticated;
grant execute on function public.wc_register(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.wc_admin_add(uuid, text, text, text, text, text) to authenticated;

-- Dropped first because its result columns changed (tags was added).
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
