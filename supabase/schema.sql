-- ================================================================
-- MatchPoint — complete database schema (single source of truth)
--
-- Run the whole file in the Supabase SQL Editor:
--   * on a NEW project  → creates everything
--   * on the EXISTING project → upgrades it in place
-- Every statement is idempotent, so re-running it is safe.
--
-- After running it, create staff logins (see "STAFF ACCOUNTS" at the
-- bottom of this file).
-- ================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------

-- Bar/POS menu items
create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  image text not null, -- typically a base64 data URL
  created_at timestamptz not null default now()
);

-- One completed session per "Pay & Clear"
create table if not exists public.session_history (
  id uuid primary key default gen_random_uuid(),
  table_id integer not null,
  table_name text not null,
  end_time timestamptz not null,
  duration_played numeric not null default 0, -- seconds
  amount_paid numeric(10, 2) not null default 0,
  session_type text not null, -- 'standard' | 'countdown'
  created_at timestamptz not null default now()
);

-- Bar/POS sales
create table if not exists public.bar_sales (
  id uuid primary key default gen_random_uuid(),
  "timestamp" timestamptz not null,
  items text not null, -- JSON array of { name, quantity, price }
  total_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- Live timer state, one row per table slot (1–10 ping-pong, 11–14 specials).
-- Multi-device sync source of truth.
create table if not exists public.live_timers (
  table_id integer primary key,
  name text not null,
  is_available boolean not null default true,
  timer_start_time bigint null, -- Unix ms when last started
  elapsed_time_in_seconds numeric not null default 0,
  is_running boolean not null default false,
  timer_mode text not null default 'standard', -- 'standard' | 'countdown'
  initial_countdown_seconds numeric null,
  session_start_time bigint null,
  session_end_time bigint null,
  fit_pass boolean not null default false,
  game_type text not null default 'pingpong',
  hourly_rate numeric null,
  sync_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Club member playing on the table (set when staff identifies the member)
alter table public.live_timers add column if not exists member_id uuid null;
alter table public.live_timers add column if not exists member_session_id uuid null;
alter table public.live_timers add column if not exists member_name text null;

-- Bookings — staff-entered and online (customer + Flitt payment)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text null,
  customer_phone text null,
  tables_count integer not null check (tables_count > 0),
  hours_count numeric null check (hours_count is null or hours_count > 0),
  table_ids integer[] not null default '{}', -- tables assigned in Table View
  booking_at timestamptz null,
  game_type text default 'pingpong', -- 'pingpong' | 'foosball' | 'airhockey' | 'playstation'
  is_done boolean not null default false,
  done_at timestamptz null,
  booking_source text default 'staff', -- 'staff' | 'online'
  payment_status text default 'none', -- 'none' | 'pending' | 'paid' | 'failed'
  flitt_order_id text unique,
  flitt_payment_id text null,
  amount_charged numeric(10, 2) null,
  masked_card text null,
  created_at timestamptz not null default now()
);

-- Columns added after the first release (no-ops on a new project)
alter table public.bookings add column if not exists customer_email text;
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists game_type text default 'pingpong';
alter table public.bookings add column if not exists booking_source text default 'staff';
alter table public.bookings add column if not exists payment_status text default 'none';
alter table public.bookings add column if not exists flitt_order_id text;
alter table public.bookings add column if not exists flitt_payment_id text;
alter table public.bookings add column if not exists amount_charged numeric(10, 2);
alter table public.bookings add column if not exists masked_card text;
alter table public.bookings add column if not exists table_ids integer[] not null default '{}';
-- Set when the paid-booking confirmation email is sent (flitt-callback)
alter table public.bookings add column if not exists confirmation_email_sent_at timestamptz null;

-- Products / services shown on the public site
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  image text, -- base64 or URL
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Blog posts
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null, -- HTML from the rich text editor
  cover_image text, -- base64 or URL
  is_published boolean not null default false,
  published_at timestamptz,
  author text default 'MatchPoint',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Events / tournaments
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image text, -- base64 or URL
  event_date timestamptz not null,
  registration_deadline timestamptz,
  max_participants integer,
  entry_fee numeric(10, 2) default 0,
  allow_offline_payment boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_name text not null,
  participant_email text,
  participant_phone text,
  payment_method text not null default 'offline', -- 'online' | 'offline'
  payment_status text not null default 'pending', -- 'pending' | 'paid' | 'failed'
  flitt_order_id text unique,
  flitt_payment_id text,
  amount_charged numeric(10, 2),
  masked_card text,
  created_at timestamptz not null default now()
);

-- Who may use the staff portal. One row per Supabase Auth user.
--   'staff'      → /staff      (tables, bar, bookings, table view, analytics)
--   'superadmin' → /superadmin (everything, incl. products/blog/events/sales)
create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('staff', 'superadmin')),
  created_at timestamptz not null default now()
);

-- Venue-wide settings (single row, id = 1). The online booking price is
-- computed from game_rates inside the database, never taken from the browser.
--   game_rates:  GEL per table per hour, plus equipmentBonus (staff billing)
--   venue_hours: opening hours per weekday, "0" = Sunday … "6" = Saturday,
--                in venue local time (Asia/Tbilisi)
--   sale_window: discounted-hours window used by staff billing
-- updated_at stays null until a superadmin saves from the Settings page.
create table if not exists public.venue_settings (
  id smallint primary key default 1 check (id = 1),
  game_rates jsonb not null default
    '{"pingpong": 16, "foosball": 12, "airhockey": 12, "playstation": 20, "equipmentBonus": 5}',
  venue_hours jsonb not null default
    '{"0": {"open": 15, "close": 24}, "1": {"open": 17, "close": 24}, "2": {"open": 17, "close": 24},
      "3": {"open": 17, "close": 24}, "4": {"open": 17, "close": 24}, "5": {"open": 17, "close": 24},
      "6": {"open": 15, "close": 24}}',
  sale_window jsonb not null default '{"fromHour": 12, "toHour": 15, "hourlyRate": 12}',
  updated_at timestamptz null
);
insert into public.venue_settings (id) values (1) on conflict (id) do nothing;

-- ── Club membership & loyalty ──────────────────────────────────────
-- Normal operations build the CRM data: staff identify a member when
-- starting a timer, Pay & Clear completes the session, points are
-- awarded from loyalty_settings, and visits are grouped from sessions.
-- All analytics are computed from sessions/visits, never from counters.

-- Physical locations. Every session and visit records its branch.
create table if not exists public.branches (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.branches (id, name) values ('main', 'MatchPoint') on conflict (id) do nothing;

create sequence if not exists public.member_code_seq;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique
    default ('MP-' || lpad(nextval('public.member_code_seq')::text, 5, '0')),
  first_name text not null,
  last_name text not null,
  phone text not null unique, -- normalised digits with country code, e.g. 995555123456
  email text null, -- lower-cased
  personal_id text null,
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  notes text null,
  auth_user_id uuid null unique references auth.users(id) on delete set null, -- website login
  home_branch_id text null references public.branches(id),
  registered_at timestamptz not null default now(),
  registered_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists members_email_unique on public.members (lower(email)) where email is not null;

-- A physical visit to a branch: one or more sessions on the same day with
-- gaps no longer than loyalty_settings.visit_gap_minutes. Maintained by
-- regroup_member_visits(); never edited by hand.
create table if not exists public.member_visits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  branch_id text not null default 'main' references public.branches(id),
  started_at timestamptz not null,
  ended_at timestamptz null, -- null while a session of the visit is still playing
  created_at timestamptz not null default now()
);
create index if not exists member_visits_member_idx on public.member_visits (member_id, started_at desc);

-- One timer session on one table. Extensions update the same row.
create table if not exists public.member_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  visit_id uuid null references public.member_visits(id) on delete set null,
  branch_id text not null default 'main' references public.branches(id),
  table_id integer null,
  table_name text null,
  game_type text null,
  session_type text not null default 'standard' check (session_type in ('standard', 'countdown')),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_seconds integer null,
  purchased_seconds integer null, -- fixed-time sessions: total bought, incl. extensions
  rental_amount numeric(10, 2) null,
  amount_paid numeric(10, 2) null,
  started_by uuid null references auth.users(id) on delete set null,
  ended_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists member_sessions_member_idx on public.member_sessions (member_id, started_at desc);
create index if not exists member_sessions_visit_idx on public.member_sessions (visit_id);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  points_required integer not null check (points_required > 0),
  is_active boolean not null default true,
  expires_at timestamptz null,
  limitations text null, -- free text shown to staff and members
  max_per_member integer null check (max_per_member is null or max_per_member > 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  reward_id uuid null references public.rewards(id) on delete set null,
  reward_name text not null, -- snapshot, survives reward edits
  points_deducted integer not null check (points_deducted > 0),
  note text null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);

-- Points ledger. Balance = sum(points); nothing else stores a balance.
--   earn     — from a completed session (recalculated via reversal + earn)
--   manual   — admin adjustment, reason required
--   redeem   — reward redemption (negative)
--   reversal — undoes an earlier earn when a session is corrected
create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  session_id uuid null references public.member_sessions(id) on delete set null,
  visit_id uuid null references public.member_visits(id) on delete set null,
  redemption_id uuid null references public.reward_redemptions(id) on delete set null,
  points integer not null check (points <> 0),
  kind text not null check (kind in ('earn', 'manual', 'redeem', 'reversal')),
  reason text null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);
create index if not exists point_transactions_member_idx on public.point_transactions (member_id, created_at desc);
create index if not exists point_transactions_session_idx on public.point_transactions (session_id);

-- Loyalty configuration (single row). Nothing here is hard-coded in code.
--   points_rules: per_gel, per_visit, per_30_minutes, per_hour, and
--     bonuses: [{ name, active, days: [0-6, 0 = Sunday], from_hour, to_hour,
--                 starts_on, ends_on, multiplier, extra_points }]
--   visit_gap_minutes: sessions on the same day closer than this = one visit
--   segments: thresholds for member segmentation (see member_directory)
create table if not exists public.loyalty_settings (
  id smallint primary key default 1 check (id = 1),
  points_rules jsonb not null default
    '{"per_gel": 1, "per_visit": 0, "per_30_minutes": 0, "per_hour": 0, "bonuses": []}',
  visit_gap_minutes integer not null default 120 check (visit_gap_minutes >= 0),
  segments jsonb not null default
    '{"new_days": 30, "inactive_days": 30,
      "regular_window_days": 60, "regular_min_visits": 4,
      "highly_active_window_days": 30, "highly_active_min_visits": 8,
      "at_risk_prior_window_days": 60, "at_risk_prior_min_visits": 3, "at_risk_silent_days": 21}',
  require_personal_id boolean not null default false,
  updated_at timestamptz null
);
insert into public.loyalty_settings (id) values (1) on conflict (id) do nothing;

-- Who changed what and when (membership, loyalty, prices, staff roles).
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid null,
  actor_email text null,
  action text not null, -- INSERT | UPDATE | DELETE
  entity text not null, -- table name
  entity_id text null,
  old_data jsonb null,
  new_data jsonb null
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ----------------------------------------------------------------
-- 2. ROLE HELPERS (used by the policies below and by the frontend)
-- security definer so they can read staff_members regardless of RLS.
-- ----------------------------------------------------------------
create or replace function public.current_staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.staff_members where user_id = auth.uid();
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid());
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members
    where user_id = auth.uid() and role = 'superadmin'
  );
$$;

-- The club member linked to the signed-in website account, if any.
create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where auth_user_id = auth.uid();
$$;

revoke all on function public.current_staff_role() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_superadmin() from public;
grant execute on function public.current_staff_role() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_superadmin() to anon, authenticated;
revoke all on function public.current_member_id() from public;
grant execute on function public.current_member_id() to anon, authenticated;

-- ----------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- Every public table has RLS on. Existing policies are dropped first
-- (including the old wide-open "*_public_rw" ones) and rebuilt, so
-- the result is exactly what this section says. Tables with no policy
-- are reachable only by the service role (edge functions).
-- ----------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Staff-only operational data
create policy "staff_all" on public.menu_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_all" on public.session_history
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_all" on public.bar_sales
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_all" on public.live_timers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- Bookings hold customer emails/phones: staff only. The public site
-- reaches them only through the narrow functions in section 5.
create policy "staff_all" on public.bookings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Public content: everyone reads what is live, superadmin manages it
create policy "public_read_active" on public.products
  for select to anon, authenticated using (is_active or public.is_superadmin());
create policy "superadmin_write" on public.products
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "public_read_published" on public.blog_posts
  for select to anon, authenticated using (is_published or public.is_superadmin());
create policy "superadmin_write" on public.blog_posts
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "public_read_active" on public.events
  for select to anon, authenticated using (is_active or public.is_staff());
create policy "superadmin_write" on public.events
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- Registrations hold participant contact details: staff read, superadmin manage.
-- Customers register through the create-event-registration edge function.
create policy "staff_read" on public.event_registrations
  for select to authenticated using (public.is_staff());
create policy "superadmin_write" on public.event_registrations
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- A signed-in user can see their own role row; superadmin sees all.
-- Rows are added/removed from the SQL editor, never from the app.
create policy "self_or_superadmin_read" on public.staff_members
  for select to authenticated using (user_id = auth.uid() or public.is_superadmin());

-- Rates and opening hours are public information (shown on /book).
create policy "public_read" on public.venue_settings
  for select to anon, authenticated using (true);
create policy "superadmin_update" on public.venue_settings
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- Club membership. Staff read everything (reception needs lookups);
-- writes go through the functions in section 5 so sessions, visits and
-- points stay consistent. Members see only their own rows.
create policy "staff_read" on public.members
  for select to authenticated using (public.is_staff());
create policy "self_read" on public.members
  for select to authenticated using (auth_user_id = auth.uid());
create policy "superadmin_update" on public.members
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "staff_read" on public.member_visits
  for select to authenticated using (public.is_staff());
create policy "self_read" on public.member_visits
  for select to authenticated using (member_id = public.current_member_id());

create policy "staff_read" on public.member_sessions
  for select to authenticated using (public.is_staff());
create policy "self_read" on public.member_sessions
  for select to authenticated using (member_id = public.current_member_id());

create policy "staff_read" on public.point_transactions
  for select to authenticated using (public.is_staff());
create policy "self_read" on public.point_transactions
  for select to authenticated using (member_id = public.current_member_id());

create policy "staff_read" on public.reward_redemptions
  for select to authenticated using (public.is_staff());
create policy "self_read" on public.reward_redemptions
  for select to authenticated using (member_id = public.current_member_id());

create policy "public_read_active" on public.rewards
  for select to anon, authenticated using (is_active or public.is_staff());
create policy "superadmin_write" on public.rewards
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "public_read" on public.loyalty_settings
  for select to anon, authenticated using (true);
create policy "superadmin_update" on public.loyalty_settings
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "public_read" on public.branches
  for select to anon, authenticated using (true);
create policy "superadmin_write" on public.branches
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "superadmin_read" on public.audit_log
  for select to authenticated using (public.is_superadmin());

-- ----------------------------------------------------------------
-- 4. REALTIME (multi-device sync; RLS applies to subscribers too)
-- ----------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['live_timers', 'bookings', 'events', 'event_registrations'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- ----------------------------------------------------------------
-- 5. FUNCTIONS
-- ----------------------------------------------------------------

-- upsert_live_timers_guarded — bulk upsert of timer rows. A row is only
-- overwritten when the incoming sync_revision is newer, so a stale
-- device cannot clobber state written by another one. Runs as the
-- caller, so the live_timers staff policy applies.
create or replace function public.upsert_live_timers_guarded(payload jsonb) returns void
language plpgsql as $$
begin
  insert into public.live_timers (
    table_id, name, is_available, timer_start_time, elapsed_time_in_seconds,
    is_running, timer_mode, initial_countdown_seconds, session_start_time,
    session_end_time, fit_pass, game_type, hourly_rate, member_id,
    member_session_id, member_name, sync_revision, updated_at
  )
  select
    r.table_id,
    r.name,
    coalesce(r.is_available, true),
    r.timer_start_time,
    coalesce(r.elapsed_time_in_seconds, 0),
    coalesce(r.is_running, false),
    coalesce(r.timer_mode, 'standard'),
    r.initial_countdown_seconds,
    r.session_start_time,
    r.session_end_time,
    coalesce(r.fit_pass, false),
    coalesce(r.game_type, 'pingpong'),
    r.hourly_rate,
    r.member_id,
    r.member_session_id,
    r.member_name,
    coalesce(r.sync_revision, 0),
    now()
  from jsonb_to_recordset(coalesce(payload, '[]'::jsonb)) as r(
    table_id integer,
    name text,
    is_available boolean,
    timer_start_time bigint,
    elapsed_time_in_seconds numeric,
    is_running boolean,
    timer_mode text,
    initial_countdown_seconds numeric,
    session_start_time bigint,
    session_end_time bigint,
    fit_pass boolean,
    game_type text,
    hourly_rate numeric,
    member_id uuid,
    member_session_id uuid,
    member_name text,
    sync_revision bigint
  )
  on conflict (table_id) do update
  set
    name = excluded.name,
    is_available = excluded.is_available,
    timer_start_time = excluded.timer_start_time,
    elapsed_time_in_seconds = excluded.elapsed_time_in_seconds,
    is_running = excluded.is_running,
    timer_mode = excluded.timer_mode,
    initial_countdown_seconds = excluded.initial_countdown_seconds,
    session_start_time = excluded.session_start_time,
    session_end_time = excluded.session_end_time,
    fit_pass = excluded.fit_pass,
    game_type = excluded.game_type,
    hourly_rate = excluded.hourly_rate,
    member_id = excluded.member_id,
    member_session_id = excluded.member_session_id,
    member_name = excluded.member_name,
    sync_revision = excluded.sync_revision,
    updated_at = now()
  where excluded.sync_revision > public.live_timers.sync_revision;
end;
$$;

revoke all on function public.upsert_live_timers_guarded(jsonb) from public, anon;
grant execute on function public.upsert_live_timers_guarded(jsonb) to authenticated;

-- ── Table assignment ───────────────────────────────────────────────
-- Tables a game can be booked on. Must match src/utils/bookableTables.js.
create or replace function public.bookable_table_ids(p_game_type text) returns integer[]
language sql immutable as $$
  select case p_game_type
    when 'pingpong' then array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    when 'foosball' then array[11]
    when 'airhockey' then array[12]
    when 'playstation' then array[13]
  end;
$$;

-- Bookings that hold tables during [p_start, p_end): staff bookings, paid
-- online bookings, and online bookings still inside their 20-minute
-- payment window. Missing hours count as 1 hour (as Table View draws them).
create or replace function public.active_bookings_between(p_start timestamptz, p_end timestamptz)
returns setof public.bookings
language sql stable as $$
  select *
  from public.bookings b
  where b.is_done = false
    and b.booking_at is not null
    and (
      b.payment_status is null
      or b.payment_status in ('none', 'paid')
      or (b.payment_status = 'pending' and b.created_at > now() - interval '20 minutes')
    )
    and b.booking_at < p_end
    and b.booking_at + coalesce(b.hours_count, 1) * interval '1 hour' > p_start;
$$;

-- Tables of a game type with no overlapping assigned booking.
create or replace function public.free_table_ids(
  p_start timestamptz, p_end timestamptz, p_game_type text, p_exclude_booking uuid default null
) returns integer[]
language sql stable as $$
  select coalesce(array_agg(t order by t), '{}')
  from unnest(public.bookable_table_ids(p_game_type)) as t
  where not exists (
    select 1 from public.active_bookings_between(p_start, p_end) b
    where t = any (b.table_ids)
      and b.id is distinct from p_exclude_booking
  );
$$;

-- Overlapping bookings of a game type that hold tables without a table
-- number yet (legacy rows, staff bookings entered without a table).
create or replace function public.unassigned_table_demand(
  p_start timestamptz, p_end timestamptz, p_game_type text, p_exclude_booking uuid default null
) returns integer
language sql stable as $$
  select coalesce(sum(b.tables_count), 0)::integer
  from public.active_bookings_between(p_start, p_end) b
  where cardinality(b.table_ids) = 0
    and coalesce(b.game_type, 'pingpong') = p_game_type
    and b.id is distinct from p_exclude_booking;
$$;

-- Pick p_count tables from p_free, preferring a side-by-side run so a
-- group plays next to each other. Falls back to the lowest free numbers.
create or replace function public.pick_tables(p_free integer[], p_count integer) returns integer[]
language plpgsql immutable as $$
declare
  i integer;
  n integer := coalesce(cardinality(p_free), 0);
begin
  if p_count < 1 or n < p_count then
    return null;
  end if;
  for i in 1 .. n - p_count + 1 loop
    if p_free[i + p_count - 1] - p_free[i] = p_count - 1 then
      return p_free[i : i + p_count - 1];
    end if;
  end loop;
  return p_free[1 : p_count];
end;
$$;

-- Internal helpers read customer rows: not callable from the API.
revoke all on function public.active_bookings_between(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.free_table_ids(timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.unassigned_table_demand(timestamptz, timestamptz, text, uuid) from public, anon, authenticated;

-- create_online_booking — validates the request, computes the price from
-- venue_settings, assigns real tables and inserts a pending booking, all in
-- one transaction. Called only by the create-booking-order edge function
-- (service role). The browser never supplies the price.
drop function if exists public.create_online_booking(
  text, text, text, integer, numeric, timestamptz, text, text, numeric
);
create or replace function public.create_online_booking(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_tables_count integer,
  p_hours_count numeric,
  p_booking_at timestamptz,
  p_game_type text,
  p_flitt_order_id text
) returns table (booking_id uuid, amount numeric, assigned_table_ids integer[])
language plpgsql as $$
declare
  v_settings public.venue_settings;
  v_rate numeric;
  v_local timestamp;
  v_open numeric;
  v_close numeric;
  v_start_hour numeric;
  v_end timestamptz;
  v_free integer[];
  v_capacity integer;
  v_tables integer[];
  v_amount numeric;
  v_id uuid;
begin
  if public.bookable_table_ids(p_game_type) is null then
    raise exception 'INVALID_GAME_TYPE';
  end if;
  if p_tables_count is null or p_tables_count < 1 then
    raise exception 'INVALID_TABLES_COUNT';
  end if;
  -- 1 to 3 hours in half-hour steps (the durations /book offers)
  if p_hours_count is null or p_hours_count < 1 or p_hours_count > 3
     or p_hours_count * 2 <> floor(p_hours_count * 2) then
    raise exception 'INVALID_DURATION';
  end if;

  select * into v_settings from public.venue_settings where id = 1;
  v_rate := (v_settings.game_rates ->> p_game_type)::numeric;
  if v_rate is null or v_rate <= 0 then
    raise exception 'INVALID_GAME_TYPE';
  end if;

  -- Must start and finish inside that day's opening hours (venue local time)
  v_local := p_booking_at at time zone 'Asia/Tbilisi';
  v_open := (v_settings.venue_hours -> extract(dow from v_local)::text ->> 'open')::numeric;
  v_close := (v_settings.venue_hours -> extract(dow from v_local)::text ->> 'close')::numeric;
  v_start_hour := extract(hour from v_local) + extract(minute from v_local) / 60.0;
  if v_open is null or v_close is null
     or v_start_hour < v_open or v_start_hour + p_hours_count > v_close then
    raise exception 'OUTSIDE_OPENING_HOURS';
  end if;

  -- One online booking at a time, so two customers can't take the same table.
  perform pg_advisory_xact_lock(hashtext('matchpoint.create_online_booking'));

  v_end := p_booking_at + p_hours_count * interval '1 hour';
  v_free := public.free_table_ids(p_booking_at, v_end, p_game_type);
  v_capacity := cardinality(v_free) - public.unassigned_table_demand(p_booking_at, v_end, p_game_type);
  if v_capacity < p_tables_count then
    raise exception 'SLOT_UNAVAILABLE: % table(s) free in this window', greatest(v_capacity, 0);
  end if;

  v_tables := public.pick_tables(v_free, p_tables_count);
  v_amount := round(v_rate * p_tables_count * p_hours_count, 2);

  insert into public.bookings (
    customer_name, customer_email, customer_phone, tables_count, hours_count,
    booking_at, game_type, table_ids, flitt_order_id, payment_status,
    booking_source, amount_charged
  ) values (
    p_customer_name, p_customer_email, p_customer_phone, p_tables_count, p_hours_count,
    p_booking_at, p_game_type, v_tables, p_flitt_order_id, 'pending',
    'online', v_amount
  )
  returning id into v_id;

  return query select v_id, v_amount, v_tables;
end;
$$;

revoke all on function public.create_online_booking(
  text, text, text, integer, numeric, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.create_online_booking(
  text, text, text, integer, numeric, timestamptz, text, text
) to service_role;

-- auto_assign_booking_tables — staff action in Table View: give a booking
-- that has no table numbers the best free tables for its time window.
create or replace function public.auto_assign_booking_tables(p_booking_id uuid)
returns integer[]
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_end timestamptz;
  v_tables integer[];
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if cardinality(v_booking.table_ids) > 0 then
    return v_booking.table_ids;
  end if;
  if v_booking.booking_at is null then
    raise exception 'BOOKING_HAS_NO_TIME';
  end if;

  v_end := v_booking.booking_at + coalesce(v_booking.hours_count, 1) * interval '1 hour';
  v_tables := public.pick_tables(
    public.free_table_ids(
      v_booking.booking_at, v_end, coalesce(v_booking.game_type, 'pingpong'), v_booking.id
    ),
    v_booking.tables_count
  );
  if v_tables is null then
    raise exception 'NOT_ENOUGH_FREE_TABLES';
  end if;

  update public.bookings set table_ids = v_tables where id = v_booking.id;
  return v_tables;
end;
$$;

revoke all on function public.auto_assign_booking_tables(uuid) from public, anon;
grant execute on function public.auto_assign_booking_tables(uuid) to authenticated;

-- create_event_registration — capacity/deadline check + insert.
-- Called only by the create-event-registration edge function (service role).
-- Locking the event row serialises concurrent registrations for it.
create or replace function public.create_event_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_payment_method text,
  p_flitt_order_id text,
  p_amount numeric
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_event record;
  v_count integer;
begin
  select * into v_event from public.events
  where id = p_event_id and is_active = true
  for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_event.registration_deadline is not null and now() > v_event.registration_deadline then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  select count(*) into v_count
  from public.event_registrations
  where event_id = p_event_id
    and payment_status in ('paid', 'pending');

  if v_event.max_participants is not null and v_count >= v_event.max_participants then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.event_registrations (
    event_id, participant_name, participant_email, participant_phone,
    payment_method, payment_status, flitt_order_id, amount_charged
  ) values (
    p_event_id, p_name, p_email, p_phone,
    p_payment_method, 'pending', p_flitt_order_id, p_amount
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_event_registration(
  uuid, text, text, text, text, text, numeric
) from public, anon, authenticated;
grant execute on function public.create_event_registration(
  uuid, text, text, text, text, text, numeric
) to service_role;

-- ── Narrow read functions for the public site ──────────────────────
-- These return only what the page needs, never contact details.

-- How many more tables of a game type can be booked in [p_start, p_end)
-- — the /book page's availability. Same rule create_online_booking enforces.
drop function if exists public.get_booked_tables_count(timestamptz, timestamptz);
create or replace function public.get_available_tables(
  p_start timestamptz, p_end timestamptz, p_game_type text
) returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(
    0,
    coalesce(cardinality(public.free_table_ids(p_start, p_end, p_game_type)), 0)
      - public.unassigned_table_demand(p_start, p_end, p_game_type)
  );
$$;

-- Booking status after the Flitt redirect. The random order id acts as
-- the customer's receipt token.
create or replace function public.get_booking_status(p_order_id text)
returns table (
  customer_name text,
  tables_count integer,
  hours_count numeric,
  booking_at timestamptz,
  game_type text,
  payment_status text,
  amount_charged numeric,
  masked_card text
)
language sql stable security definer set search_path = '' as $$
  select customer_name, tables_count, hours_count, booking_at, game_type,
         payment_status, amount_charged, masked_card
  from public.bookings
  where flitt_order_id = p_order_id;
$$;

-- Seats taken for an event (paid + pending registrations).
create or replace function public.get_event_registration_count(p_event_id uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.event_registrations
  where event_id = p_event_id
    and payment_status in ('paid', 'pending');
$$;

revoke all on function public.get_available_tables(timestamptz, timestamptz, text) from public;
revoke all on function public.get_booking_status(text) from public;
revoke all on function public.get_event_registration_count(uuid) from public;
grant execute on function public.get_available_tables(timestamptz, timestamptz, text) to anon, authenticated;
grant execute on function public.get_booking_status(text) to anon, authenticated;
grant execute on function public.get_event_registration_count(uuid) to anon, authenticated;

-- ================================================================
-- 6. CLUB MEMBERSHIP & LOYALTY — FUNCTIONS
-- Staff actions check is_staff()/is_superadmin() themselves and run as
-- security definer; internal helpers are not callable from the API.
-- ================================================================

-- Phone numbers are stored as digits with the country code. A 9-digit
-- Georgian mobile ("555 12 34 56") becomes 995555123456.
create or replace function public.normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when d = '' then null
    when left(d, 2) = '00' then substr(d, 3)
    when length(d) = 9 then '995' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s;
$$;

create or replace function public.members_before_write() returns trigger
language plpgsql as $$
begin
  new.phone := public.normalize_phone(new.phone);
  if new.phone is null or length(new.phone) < 8 then
    raise exception 'INVALID_PHONE';
  end if;
  new.email := nullif(lower(trim(new.email)), '');
  new.first_name := trim(new.first_name);
  new.last_name := trim(new.last_name);
  new.personal_id := nullif(trim(new.personal_id), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists members_before_write on public.members;
create trigger members_before_write before insert or update on public.members
  for each row execute function public.members_before_write();

-- ── Visit grouping ──────────────────────────────────────────────────
-- Rebuilds a member's visits for one local day at one branch from the
-- sessions: a new visit starts when a session begins more than
-- visit_gap_minutes after the previous one ended. Existing visit ids are
-- reused so point transactions keep pointing at them.
create or replace function public.regroup_member_visits(p_member uuid, p_branch text, p_day date)
returns void
language plpgsql as $$
declare
  v_gap interval;
  s record;
  v_current uuid := null;
  v_group_end timestamptz;
  v_group_active boolean;
  v_used uuid[] := '{}';
begin
  select make_interval(mins => visit_gap_minutes) into v_gap
  from public.loyalty_settings where id = 1;
  v_gap := coalesce(v_gap, interval '120 minutes');

  for s in
    select ms.id, ms.visit_id, ms.started_at, ms.status,
           coalesce(ms.ended_at, greatest(ms.started_at, now())) as end_at
    from public.member_sessions ms
    where ms.member_id = p_member
      and ms.branch_id = p_branch
      and ms.status <> 'cancelled'
      and (ms.started_at at time zone 'Asia/Tbilisi')::date = p_day
    order by ms.started_at, ms.id
  loop
    if v_current is null or s.started_at > v_group_end + v_gap then
      -- close the previous group
      if v_current is not null then
        update public.member_visits
        set ended_at = case when v_group_active then null else v_group_end end
        where id = v_current;
      end if;

      -- reuse this session's visit when it belongs to this member/day/branch
      v_current := null;
      if s.visit_id is not null and not (s.visit_id = any (v_used)) then
        select id into v_current from public.member_visits
        where id = s.visit_id and member_id = p_member and branch_id = p_branch
          and (started_at at time zone 'Asia/Tbilisi')::date = p_day;
      end if;
      if v_current is null then
        insert into public.member_visits (member_id, branch_id, started_at)
        values (p_member, p_branch, s.started_at)
        returning id into v_current;
      else
        update public.member_visits set started_at = s.started_at where id = v_current;
      end if;

      v_used := v_used || v_current;
      v_group_end := s.end_at;
      v_group_active := s.status = 'active';
    else
      v_group_end := greatest(v_group_end, s.end_at);
      v_group_active := v_group_active or s.status = 'active';
    end if;

    update public.member_sessions set visit_id = v_current
    where id = s.id and visit_id is distinct from v_current;
  end loop;

  if v_current is not null then
    update public.member_visits
    set ended_at = case when v_group_active then null else v_group_end end
    where id = v_current;
  end if;

  -- visits of this member/day/branch that no longer have sessions
  delete from public.member_visits v
  where v.member_id = p_member
    and v.branch_id = p_branch
    and (v.started_at at time zone 'Asia/Tbilisi')::date = p_day
    and not (v.id = any (v_used));
end;
$$;

-- ── Points ──────────────────────────────────────────────────────────
-- Points for one completed session under the current loyalty rules.
-- per_visit is awarded once, on the first session of a visit.
create or replace function public.compute_session_points(p_session public.member_sessions)
returns integer
language plpgsql stable as $$
declare
  r jsonb;
  b jsonb;
  v_minutes numeric := coalesce(p_session.duration_seconds, 0) / 60.0;
  v_local timestamp := p_session.started_at at time zone 'Asia/Tbilisi';
  v_first_in_visit boolean;
  v_points numeric;
  v_multiplier numeric := 1;
  v_extra numeric := 0;
begin
  select points_rules into r from public.loyalty_settings where id = 1;
  r := coalesce(r, '{}'::jsonb);

  select not exists (
    select 1 from public.member_sessions o
    where o.visit_id = p_session.visit_id
      and o.id <> p_session.id
      and o.status = 'completed'
      and (o.started_at, o.id) < (p_session.started_at, p_session.id)
  ) into v_first_in_visit;

  v_points :=
    coalesce((r ->> 'per_gel')::numeric, 0) * coalesce(p_session.amount_paid, 0)
    + coalesce((r ->> 'per_30_minutes')::numeric, 0) * floor(v_minutes / 30)
    + coalesce((r ->> 'per_hour')::numeric, 0) * floor(v_minutes / 60)
    + case when v_first_in_visit then coalesce((r ->> 'per_visit')::numeric, 0) else 0 end;

  for b in select * from jsonb_array_elements(coalesce(r -> 'bonuses', '[]'::jsonb)) loop
    continue when coalesce((b ->> 'active')::boolean, true) = false;
    continue when jsonb_typeof(b -> 'days') = 'array' and jsonb_array_length(b -> 'days') > 0
      and not ((b -> 'days') @> to_jsonb(extract(dow from v_local)::int));
    continue when nullif(b ->> 'from_hour', '') is not null
      and extract(hour from v_local) < (b ->> 'from_hour')::numeric;
    continue when nullif(b ->> 'to_hour', '') is not null
      and extract(hour from v_local) >= (b ->> 'to_hour')::numeric;
    continue when nullif(b ->> 'starts_on', '') is not null and v_local::date < (b ->> 'starts_on')::date;
    continue when nullif(b ->> 'ends_on', '') is not null and v_local::date > (b ->> 'ends_on')::date;
    v_multiplier := v_multiplier * coalesce(nullif(b ->> 'multiplier', '')::numeric, 1);
    v_extra := v_extra + coalesce(nullif(b ->> 'extra_points', '')::numeric, 0);
  end loop;

  return greatest(0, floor(v_points * v_multiplier + v_extra))::integer;
end;
$$;

-- Brings a session's earned points in line with its current state:
-- whatever it earned before (per member) is reversed, and a completed
-- session earns afresh. The ledger keeps the full history.
create or replace function public.sync_session_points(p_session_id uuid, p_reason text default null)
returns integer
language plpgsql as $$
declare
  v_session public.member_sessions;
  v_new integer := 0;
  prev record;
begin
  select * into v_session from public.member_sessions where id = p_session_id;
  if not found then
    return 0;
  end if;
  if v_session.status = 'completed' then
    v_new := public.compute_session_points(v_session);
  end if;

  -- Unchanged: same member already holds exactly this many points.
  if (
    select coalesce(sum(points), 0) from public.point_transactions
    where session_id = p_session_id and kind in ('earn', 'reversal')
      and member_id = v_session.member_id
  ) = v_new and not exists (
    select 1 from public.point_transactions
    where session_id = p_session_id and kind in ('earn', 'reversal')
      and member_id <> v_session.member_id
    group by member_id having sum(points) <> 0
  ) then
    return v_new;
  end if;

  for prev in
    select member_id, sum(points)::integer as net
    from public.point_transactions
    where session_id = p_session_id and kind in ('earn', 'reversal')
    group by member_id
    having sum(points) <> 0
  loop
    insert into public.point_transactions (member_id, session_id, visit_id, points, kind, reason, created_by)
    values (prev.member_id, p_session_id, v_session.visit_id, -prev.net, 'reversal',
            coalesce(p_reason, 'Session corrected'), auth.uid());
  end loop;

  if v_new > 0 then
    insert into public.point_transactions (member_id, session_id, visit_id, points, kind, reason, created_by)
    values (v_session.member_id, p_session_id, v_session.visit_id, v_new, 'earn',
            coalesce(v_session.table_name, 'Table session'), auth.uid());
  end if;
  return v_new;
end;
$$;

revoke all on function public.regroup_member_visits(uuid, text, date) from public, anon, authenticated;
revoke all on function public.compute_session_points(public.member_sessions) from public, anon, authenticated;
revoke all on function public.sync_session_points(uuid, text) from public, anon, authenticated;

create or replace function public.member_points(p_member uuid, out balance integer, out lifetime integer)
language sql stable as $$
  select
    coalesce(sum(points), 0)::integer,
    coalesce(sum(points) filter (where kind in ('earn', 'reversal') or (kind = 'manual' and points > 0)), 0)::integer
  from public.point_transactions
  where member_id = p_member;
$$;

revoke all on function public.member_points(uuid) from public, anon, authenticated;

-- ── Reception: find & register ──────────────────────────────────────

-- Phone (any 3+ digits), name, member code or email. Exact phone first.
create or replace function public.find_members(p_query text)
returns table (
  id uuid, member_code text, first_name text, last_name text, phone text, email text,
  status text, registered_at timestamptz, points_balance integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_text text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  return query
  select m.id, m.member_code, m.first_name, m.last_name, m.phone, m.email, m.status,
         m.registered_at, (public.member_points(m.id)).balance
  from public.members m
  where (length(v_digits) >= 3 and strpos(m.phone, v_digits) > 0)
     or (length(v_text) >= 2 and (
           strpos(lower(m.first_name || ' ' || m.last_name), v_text) > 0
           or lower(m.member_code) = v_text
           or m.email = v_text))
  order by (m.phone = public.normalize_phone(p_query)) desc, m.last_name, m.first_name
  limit 8;
end;
$$;

create or replace function public.register_member(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_personal_id text default null,
  p_branch_id text default 'main'
) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.members;
  v_member public.members;
  v_require_id boolean;
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  select require_personal_id into v_require_id from public.loyalty_settings where id = 1;
  if coalesce(v_require_id, false) and coalesce(trim(p_personal_id), '') = '' then
    raise exception 'PERSONAL_ID_REQUIRED';
  end if;

  select * into v_existing from public.members where phone = public.normalize_phone(p_phone);
  if found then
    raise exception 'DUPLICATE_PHONE:%', v_existing.member_code;
  end if;
  if nullif(trim(p_email), '') is not null then
    select * into v_existing from public.members where email = lower(trim(p_email));
    if found then
      raise exception 'DUPLICATE_EMAIL:%', v_existing.member_code;
    end if;
  end if;

  insert into public.members (first_name, last_name, phone, email, personal_id, home_branch_id, registered_by)
  values (p_first_name, p_last_name, p_phone, p_email, p_personal_id, p_branch_id, auth.uid())
  returning * into v_member;
  return v_member;
end;
$$;

-- ── Timer integration ───────────────────────────────────────────────

-- START TIMER (or "Attach member" on a running timer: pass its start time).
create or replace function public.start_member_session(
  p_member_id uuid,
  p_table_id integer,
  p_table_name text,
  p_game_type text,
  p_session_type text,
  p_started_at timestamptz default now(),
  p_purchased_seconds integer default null,
  p_branch_id text default 'main'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  select status into v_status from public.members where id = p_member_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if v_status <> 'active' then
    raise exception 'MEMBER_NOT_ACTIVE';
  end if;

  insert into public.member_sessions (
    member_id, branch_id, table_id, table_name, game_type, session_type,
    started_at, purchased_seconds, started_by
  ) values (
    p_member_id, coalesce(p_branch_id, 'main'), p_table_id, p_table_name, p_game_type,
    coalesce(p_session_type, 'standard'), coalesce(p_started_at, now()), p_purchased_seconds, auth.uid()
  )
  returning id into v_id;

  perform public.regroup_member_visits(
    p_member_id, coalesce(p_branch_id, 'main'),
    (coalesce(p_started_at, now()) at time zone 'Asia/Tbilisi')::date
  );
  return v_id;
end;
$$;

-- Table transfer, extension (+30 min) or mode change on a playing session.
create or replace function public.update_member_session_timer(
  p_session_id uuid,
  p_table_id integer,
  p_table_name text,
  p_session_type text,
  p_purchased_seconds integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.member_sessions
  set table_id = p_table_id,
      table_name = p_table_name,
      session_type = coalesce(p_session_type, session_type),
      purchased_seconds = p_purchased_seconds,
      updated_at = now()
  where id = p_session_id and status = 'active';
end;
$$;

-- PAY & CLEAR. Idempotent: completing twice returns the same points.
create or replace function public.complete_member_session(
  p_session_id uuid,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_rental_amount numeric,
  p_amount_paid numeric
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.member_sessions;
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_session from public.member_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if v_session.status = 'completed' then
    return coalesce((
      select sum(points) from public.point_transactions
      where session_id = p_session_id and kind in ('earn', 'reversal')
    ), 0);
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  end if;

  update public.member_sessions
  set status = 'completed',
      ended_at = coalesce(p_ended_at, now()),
      duration_seconds = greatest(0, coalesce(p_duration_seconds,
        extract(epoch from coalesce(p_ended_at, now()) - started_at)::integer)),
      rental_amount = round(coalesce(p_rental_amount, p_amount_paid, 0), 2),
      amount_paid = round(coalesce(p_amount_paid, p_rental_amount, 0), 2),
      ended_by = auth.uid(),
      updated_at = now()
  where id = p_session_id;

  perform public.regroup_member_visits(
    v_session.member_id, v_session.branch_id,
    (v_session.started_at at time zone 'Asia/Tbilisi')::date
  );
  return public.sync_session_points(p_session_id);
end;
$$;

-- Fallback when the START call didn't reach the server (offline):
-- Pay & Clear records the whole session in one go.
create or replace function public.record_member_session(
  p_member_id uuid,
  p_table_id integer,
  p_table_name text,
  p_game_type text,
  p_session_type text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_purchased_seconds integer,
  p_rental_amount numeric,
  p_amount_paid numeric,
  p_branch_id text default 'main'
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := public.start_member_session(
    p_member_id, p_table_id, p_table_name, p_game_type, p_session_type,
    p_started_at, p_purchased_seconds, p_branch_id
  );
  return public.complete_member_session(v_id, p_ended_at, p_duration_seconds, p_rental_amount, p_amount_paid);
end;
$$;

-- "Attach member" was the wrong person. Staff may fix a playing session;
-- a completed one needs a superadmin. Points move with the session.
create or replace function public.reassign_member_session(p_session_id uuid, p_member_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.member_sessions;
begin
  select * into v_session from public.member_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not (public.is_superadmin() or (public.is_staff() and v_session.status = 'active')) then
    raise exception 'NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if v_session.member_id = p_member_id then
    return;
  end if;

  update public.member_sessions
  set member_id = p_member_id, visit_id = null, updated_at = now()
  where id = p_session_id;

  perform public.regroup_member_visits(v_session.member_id, v_session.branch_id,
    (v_session.started_at at time zone 'Asia/Tbilisi')::date);
  perform public.regroup_member_visits(p_member_id, v_session.branch_id,
    (v_session.started_at at time zone 'Asia/Tbilisi')::date);
  perform public.sync_session_points(p_session_id, 'Session moved to another member');
end;
$$;

-- Detach a member from a playing timer (staff) or void a completed
-- session (superadmin). Its points are reversed.
create or replace function public.cancel_member_session(p_session_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.member_sessions;
begin
  select * into v_session from public.member_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not (public.is_superadmin() or (public.is_staff() and v_session.status = 'active')) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.member_sessions set status = 'cancelled', updated_at = now() where id = p_session_id;
  perform public.regroup_member_visits(v_session.member_id, v_session.branch_id,
    (v_session.started_at at time zone 'Asia/Tbilisi')::date);
  perform public.sync_session_points(p_session_id, coalesce(p_reason, 'Session cancelled'));
end;
$$;

-- Superadmin correction or back-dated entry (p_session_id null = new
-- completed session, e.g. staff forgot to identify the member).
create or replace function public.admin_save_member_session(
  p_session_id uuid,
  p_member_id uuid,
  p_table_id integer,
  p_table_name text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_amount_paid numeric,
  p_rental_amount numeric default null,
  p_duration_seconds integer default null,
  p_branch_id text default 'main',
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.member_sessions;
  v_id uuid := p_session_id;
  v_duration integer;
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_started_at is null or p_ended_at is null or p_ended_at < p_started_at then
    raise exception 'INVALID_TIMES';
  end if;
  v_duration := coalesce(p_duration_seconds, extract(epoch from p_ended_at - p_started_at)::integer);

  if v_id is null then
    insert into public.member_sessions (
      member_id, branch_id, table_id, table_name, session_type, status, started_at, ended_at,
      duration_seconds, rental_amount, amount_paid, started_by, ended_by
    ) values (
      p_member_id, coalesce(p_branch_id, 'main'), p_table_id, p_table_name, 'standard', 'completed',
      p_started_at, p_ended_at, v_duration, round(coalesce(p_rental_amount, p_amount_paid, 0), 2),
      round(coalesce(p_amount_paid, 0), 2), auth.uid(), auth.uid()
    )
    returning id into v_id;
  else
    select * into v_old from public.member_sessions where id = v_id for update;
    if not found then
      raise exception 'SESSION_NOT_FOUND';
    end if;
    update public.member_sessions
    set member_id = p_member_id,
        branch_id = coalesce(p_branch_id, branch_id),
        table_id = p_table_id,
        table_name = p_table_name,
        status = 'completed',
        started_at = p_started_at,
        ended_at = p_ended_at,
        duration_seconds = v_duration,
        rental_amount = round(coalesce(p_rental_amount, rental_amount, p_amount_paid, 0), 2),
        amount_paid = round(coalesce(p_amount_paid, 0), 2),
        visit_id = null,
        updated_at = now()
    where id = v_id;
    -- the day it used to belong to
    perform public.regroup_member_visits(v_old.member_id, v_old.branch_id,
      (v_old.started_at at time zone 'Asia/Tbilisi')::date);
  end if;

  perform public.regroup_member_visits(p_member_id, coalesce(p_branch_id, 'main'),
    (p_started_at at time zone 'Asia/Tbilisi')::date);
  perform public.sync_session_points(v_id, coalesce(p_reason, 'Session corrected by admin'));
  return v_id;
end;
$$;

-- ── Points & rewards ────────────────────────────────────────────────

create or replace function public.adjust_member_points(p_member_id uuid, p_points integer, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if coalesce(p_points, 0) = 0 then
    raise exception 'POINTS_REQUIRED';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  insert into public.point_transactions (member_id, points, kind, reason, created_by)
  values (p_member_id, p_points, 'manual', trim(p_reason), auth.uid());
  return (public.member_points(p_member_id)).balance;
end;
$$;

create or replace function public.redeem_reward(p_member_id uuid, p_reward_id uuid, p_note text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_reward public.rewards;
  v_balance integer;
  v_redemption uuid;
begin
  if not public.is_staff() then
    raise exception 'NOT_ALLOWED';
  end if;
  -- lock the member so two redemptions can't spend the same points
  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if v_member.status <> 'active' then
    raise exception 'MEMBER_NOT_ACTIVE';
  end if;
  select * into v_reward from public.rewards where id = p_reward_id;
  if not found or not v_reward.is_active or (v_reward.expires_at is not null and v_reward.expires_at < now()) then
    raise exception 'REWARD_NOT_AVAILABLE';
  end if;
  if v_reward.max_per_member is not null and (
    select count(*) from public.reward_redemptions
    where member_id = p_member_id and reward_id = p_reward_id
  ) >= v_reward.max_per_member then
    raise exception 'REWARD_LIMIT_REACHED';
  end if;
  v_balance := (public.member_points(p_member_id)).balance;
  if v_balance < v_reward.points_required then
    raise exception 'NOT_ENOUGH_POINTS';
  end if;

  insert into public.reward_redemptions (member_id, reward_id, reward_name, points_deducted, note, created_by)
  values (p_member_id, p_reward_id, v_reward.name, v_reward.points_required, nullif(trim(p_note), ''), auth.uid())
  returning id into v_redemption;
  insert into public.point_transactions (member_id, redemption_id, points, kind, reason, created_by)
  values (p_member_id, v_redemption, -v_reward.points_required, 'redeem', v_reward.name, auth.uid());

  return v_balance - v_reward.points_required;
end;
$$;

-- ── Member database & analytics ─────────────────────────────────────

-- One row per member with activity for the chosen period
-- ('week' | 'month' | '30d' | 'year' | 'all') and a segment:
--   new → highly_active → regular → at_risk → inactive → returning → one_time
-- (first match wins; thresholds come from loyalty_settings.segments).
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

-- Club-wide dashboard (superadmin). Counts come from sessions/visits.
create or replace function public.club_analytics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'Asia/Tbilisi';
  v_week timestamptz := date_trunc('week', v_local) at time zone 'Asia/Tbilisi';
  v_month timestamptz := date_trunc('month', v_local) at time zone 'Asia/Tbilisi';
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;

  with per_member as (
    select m.id, m.registered_at,
      (select count(*) from public.member_visits v where v.member_id = m.id) as visits,
      (select max(v.started_at) from public.member_visits v where v.member_id = m.id) as last_v,
      (select v.started_at from public.member_visits v where v.member_id = m.id
        order by v.started_at limit 1) as first_v,
      (select v.started_at from public.member_visits v where v.member_id = m.id
        order by v.started_at offset 1 limit 1) as second_v
    from public.members m
    where m.status <> 'cancelled'
  ),
  sessions as (
    select s.*, s.started_at at time zone 'Asia/Tbilisi' as local_start
    from public.member_sessions s
    where s.status = 'completed'
  ),
  gaps as (
    select extract(epoch from v.started_at - lag(v.started_at) over (
      partition by v.member_id order by v.started_at)) / 86400.0 as days
    from public.member_visits v
  )
  select jsonb_build_object(
    'members', jsonb_build_object(
      'total', (select count(*) from per_member),
      'new_this_week', (select count(*) from per_member where registered_at >= v_week),
      'new_this_month', (select count(*) from per_member where registered_at >= v_month),
      'active_30d', (select count(*) from per_member where last_v >= now() - interval '30 days'),
      'returning', (select count(*) from per_member where visits >= 2),
      'inactive_30d', (select count(*) from per_member
        where last_v is null or last_v < now() - interval '30 days')
    ),
    'frequency', jsonb_build_object(
      'never', (select count(*) from per_member where visits = 0),
      'once', (select count(*) from per_member where visits = 1),
      'two_plus', (select count(*) from per_member where visits >= 2),
      'five_plus', (select count(*) from per_member where visits >= 5),
      'ten_plus', (select count(*) from per_member where visits >= 10),
      'avg_visits_per_member', (select round(coalesce(avg(visits), 0), 2) from per_member)
    ),
    'activity', jsonb_build_object(
      'sessions', (select count(*) from sessions),
      'visits', (select count(*) from public.member_visits),
      'hours', (select round(coalesce(sum(duration_seconds), 0) / 3600.0, 1) from sessions),
      'avg_session_minutes', (select round(coalesce(avg(duration_seconds), 0) / 60.0) from sessions),
      'by_hour', (
        select jsonb_agg(jsonb_build_object('hour', h, 'sessions', coalesce(c.n, 0)) order by h)
        from generate_series(0, 23) h
        left join (select extract(hour from local_start)::int as hh, count(*) as n
                   from sessions group by 1) c on c.hh = h),
      'by_weekday', (
        select jsonb_agg(jsonb_build_object('dow', d, 'sessions', coalesce(c.n, 0)) order by d)
        from generate_series(0, 6) d
        left join (select extract(dow from local_start)::int as dd, count(*) as n
                   from sessions group by 1) c on c.dd = d),
      'by_branch', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'branch', b.name, 'sessions', coalesce(c.n, 0), 'hours', coalesce(c.h, 0)) order by b.name), '[]')
        from public.branches b
        left join (select branch_id, count(*) as n,
                          round(sum(duration_seconds) / 3600.0, 1) as h
                   from sessions group by 1) c on c.branch_id = b.id),
      'multi_branch_members', (
        select count(*) from (
          select member_id from public.member_visits group by member_id
          having count(distinct branch_id) > 1) x)
    ),
    'retention', jsonb_build_object(
      'returned_pct', (select round(100.0 * count(second_v) / nullif(count(first_v), 0), 1) from per_member),
      'avg_days_to_second_visit', (
        select round(avg(extract(epoch from second_v - first_v) / 86400.0)::numeric, 1)
        from per_member where second_v is not null),
      'avg_days_between_visits', (select round(avg(days)::numeric, 1) from gaps where days is not null),
      'inactive_30', (select count(*) from per_member
        where last_v < now() - interval '30 days'),
      'inactive_60', (select count(*) from per_member
        where last_v < now() - interval '60 days'),
      'inactive_90', (select count(*) from per_member
        where last_v < now() - interval '90 days')
    ),
    'monthly', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(mo, 'YYYY-MM'),
        'new_members', (select count(*) from public.members m
          where m.registered_at at time zone 'Asia/Tbilisi' >= mo
            and m.registered_at at time zone 'Asia/Tbilisi' < mo + interval '1 month'),
        'visits', (select count(*) from public.member_visits v
          where v.started_at at time zone 'Asia/Tbilisi' >= mo
            and v.started_at at time zone 'Asia/Tbilisi' < mo + interval '1 month'),
        'hours', (select round(coalesce(sum(duration_seconds), 0) / 3600.0, 1) from sessions s
          where s.local_start >= mo and s.local_start < mo + interval '1 month')
      ) order by mo)
      from generate_series(date_trunc('month', v_local) - interval '11 months',
                           date_trunc('month', v_local), interval '1 month') mo
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── Member website account ──────────────────────────────────────────
-- Links the signed-in account to the club member with the same verified
-- email or phone. Returns the member id, or null if there is none.
create or replace function public.claim_member_account() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_member uuid;
begin
  if v_uid is null then
    return null;
  end if;
  select id into v_member from public.members where auth_user_id = v_uid;
  if found then
    return v_member;
  end if;

  select case when u.email_confirmed_at is not null then lower(u.email) end,
         case when u.phone_confirmed_at is not null then public.normalize_phone(u.phone) end
  into v_email, v_phone
  from auth.users u where u.id = v_uid;

  update public.members m
  set auth_user_id = v_uid
  where m.id = (
    select c.id from public.members c
    where c.auth_user_id is null
      and ((v_email is not null and c.email = v_email) or (v_phone is not null and c.phone = v_phone))
    order by c.registered_at
    limit 1
  )
  returning m.id into v_member;
  return v_member;
end;
$$;

-- ── Audit log ───────────────────────────────────────────────────────
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  -- visit regrouping and timestamps alone aren't worth a log line
  if tg_op = 'UPDATE'
     and (v_old - 'visit_id' - 'updated_at') = (v_new - 'visit_id' - 'updated_at') then
    return new;
  end if;
  insert into public.audit_log (actor_id, actor_email, action, entity, entity_id, old_data, new_data)
  values (
    auth.uid(),
    (select u.email from auth.users u where u.id = auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id'),
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'member_sessions', 'point_transactions', 'rewards', 'reward_redemptions',
    'loyalty_settings', 'venue_settings', 'staff_members'
  ] loop
    execute format('drop trigger if exists audit_row_change on public.%I', t);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.find_members(text)',
    'public.register_member(text, text, text, text, text, text)',
    'public.start_member_session(uuid, integer, text, text, text, timestamptz, integer, text)',
    'public.update_member_session_timer(uuid, integer, text, text, integer)',
    'public.complete_member_session(uuid, timestamptz, integer, numeric, numeric)',
    'public.record_member_session(uuid, integer, text, text, text, timestamptz, timestamptz, integer, integer, numeric, numeric, text)',
    'public.reassign_member_session(uuid, uuid)',
    'public.cancel_member_session(uuid, text)',
    'public.admin_save_member_session(uuid, uuid, integer, text, timestamptz, timestamptz, numeric, numeric, integer, text, text)',
    'public.adjust_member_points(uuid, integer, text)',
    'public.redeem_reward(uuid, uuid, text)',
    'public.member_directory(text)',
    'public.club_analytics()',
    'public.claim_member_account()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- ================================================================
-- STAFF ACCOUNTS
-- 1. Supabase Dashboard → Authentication → Users → "Add user"
--    (email + password, tick "Auto Confirm User").
-- 2. Give that user a role (run in the SQL editor):
--
--    insert into public.staff_members (user_id, role)
--    select id, 'superadmin' from auth.users where email = 'owner@example.com'
--    on conflict (user_id) do update set role = excluded.role;
--
--    Use 'staff' instead of 'superadmin' for venue staff logins.
-- 3. To revoke access: delete from public.staff_members where user_id = ...;
--
-- Keep "Allow new users to sign up" ON: club members sign in on /account
-- with an emailed link, which creates their Auth user on first use.
-- A signed-in account sees nothing unless it has a staff_members row or
-- claim_member_account() links it to a member with the same verified
-- email/phone. Add https://<your-site>/account to Authentication →
-- URL Configuration → Redirect URLs.
-- ================================================================
