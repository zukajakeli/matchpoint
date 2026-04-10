-- ================================================================
-- MatchPoint Table Manager — Complete Fresh Schema
-- Run this ONCE in the Supabase SQL Editor on a new project.
-- All statements are safe to re-run (idempotent).
-- ================================================================
create extension if not exists "pgcrypto";
-- ----------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------
-- Menu items shown in the bar/POS sidebar
create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  image text not null,
  -- typically a base64 data URL
  created_at timestamptz not null default now()
);
-- One completed session per "Pay & Clear" action
create table if not exists public.session_history (
  id uuid primary key default gen_random_uuid(),
  table_id integer not null,
  table_name text not null,
  end_time timestamptz not null,
  duration_played numeric not null default 0,
  -- seconds
  amount_paid numeric(10, 2) not null default 0,
  session_type text not null,
  -- 'standard' | 'countdown'
  created_at timestamptz not null default now()
);
-- Bar/POS sale records
create table if not exists public.bar_sales (
  id uuid primary key default gen_random_uuid(),
  "timestamp" timestamptz not null,
  items text not null,
  -- JSON array of { name, quantity, price }
  total_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);
-- Live timer state — one row per table slot (1–12).
-- This is the multi-device sync source of truth.
create table if not exists public.live_timers (
  table_id integer primary key,
  name text not null,
  is_available boolean not null default true,
  timer_start_time bigint null,
  -- Unix ms when last started
  elapsed_time_in_seconds numeric not null default 0,
  is_running boolean not null default false,
  timer_mode text not null default 'standard',
  -- 'standard' | 'countdown'
  initial_countdown_seconds numeric null,
  session_start_time bigint null,
  session_end_time bigint null,
  fit_pass boolean not null default false,
  game_type text not null default 'pingpong',
  hourly_rate numeric null,
  sync_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
-- Bookings — both staff-entered and online (customer + payment).
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- Customer identity
  customer_name text not null,
  customer_email text null,
  customer_phone text null,
  -- Booking details
  tables_count integer not null check (tables_count > 0),
  hours_count numeric null check (
    hours_count is null
    or hours_count > 0
  ),
  booking_at timestamptz null,
  game_type text default 'pingpong',
  -- 'pingpong' | 'foosball' | 'airhockey' | 'playstation'
  -- Status
  is_done boolean not null default false,
  done_at timestamptz null,
  -- Source & payment
  booking_source text default 'staff',
  -- 'staff' | 'online'
  payment_status text default 'none',
  -- 'none' | 'pending' | 'paid' | 'failed'
  flitt_order_id text unique,
  -- UUID sent to Flitt as order_id
  flitt_payment_id text null,
  amount_charged numeric(10, 2) null,
  masked_card text null,
  created_at timestamptz not null default now()
);
-- ----------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- All tables use open read/write for anon + authenticated.
-- This is safe for a private in-venue kiosk on a controlled network.
-- If the app is ever publicly exposed, add proper auth policies.
-- ----------------------------------------------------------------
alter table public.menu_items enable row level security;
alter table public.session_history enable row level security;
alter table public.bar_sales enable row level security;
alter table public.live_timers enable row level security;
alter table public.bookings enable row level security;
drop policy if exists "menu_items_public_rw" on public.menu_items;
drop policy if exists "session_history_public_rw" on public.session_history;
drop policy if exists "bar_sales_public_rw" on public.bar_sales;
drop policy if exists "live_timers_public_rw" on public.live_timers;
drop policy if exists "bookings_public_rw" on public.bookings;
create policy "menu_items_public_rw" on public.menu_items for all to anon,
authenticated using (true) with check (true);
create policy "session_history_public_rw" on public.session_history for all to anon,
authenticated using (true) with check (true);
create policy "bar_sales_public_rw" on public.bar_sales for all to anon,
authenticated using (true) with check (true);
create policy "live_timers_public_rw" on public.live_timers for all to anon,
authenticated using (true) with check (true);
create policy "bookings_public_rw" on public.bookings for all to anon,
authenticated using (true) with check (true);
-- ----------------------------------------------------------------
-- 3. REALTIME
-- live_timers and bookings use WebSocket push for multi-device sync.
-- ----------------------------------------------------------------
do $$ begin alter publication supabase_realtime
add table public.live_timers;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table public.bookings;
exception
when duplicate_object then null;
end $$;
-- ----------------------------------------------------------------
-- 4. FUNCTIONS
-- ----------------------------------------------------------------
-- upsert_live_timers_guarded
-- Bulk-upserts timer rows. Only applies an update if the incoming
-- sync_revision is strictly greater than the stored one, preventing
-- a stale client from overwriting newer state written by another device.
create or replace function public.upsert_live_timers_guarded(payload jsonb) returns void language plpgsql as $$ begin
insert into public.live_timers (
    table_id,
    name,
    is_available,
    timer_start_time,
    elapsed_time_in_seconds,
    is_running,
    timer_mode,
    initial_countdown_seconds,
    session_start_time,
    session_end_time,
    fit_pass,
    game_type,
    hourly_rate,
    sync_revision,
    updated_at
  )
select r.table_id,
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
    sync_revision bigint
  ) on conflict (table_id) do
update
set name = excluded.name,
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
  sync_revision = excluded.sync_revision,
  updated_at = now()
where excluded.sync_revision > public.live_timers.sync_revision;
end;
$$;
grant execute on function public.upsert_live_timers_guarded(jsonb) to anon,
  authenticated;
-- create_online_booking
-- Atomically checks slot availability and inserts a pending booking.
-- Uses FOR UPDATE row lock so two simultaneous requests for the same
-- slot cannot both see "available" and both succeed.
--
-- Raises 'SLOT_UNAVAILABLE' if requested tables_count would exceed
-- the 12-table maximum for the chosen time window.
-- Pending bookings older than 20 minutes are ignored (they expired
-- because the customer never completed payment).
create or replace function public.create_online_booking(
    p_customer_name text,
    p_customer_email text,
    p_customer_phone text,
    p_tables_count integer,
    p_hours_count numeric,
    p_booking_at timestamptz,
    p_game_type text,
    p_flitt_order_id text,
    p_amount_charged numeric
  ) returns uuid language plpgsql as $$
declare
  v_booked integer;
  v_id uuid;
  v_end timestamptz;
begin
  v_end := p_booking_at + (p_hours_count * interval '1 hour');

  -- Step 1: lock conflicting rows (FOR UPDATE cannot be combined with aggregates)
  perform id
  from public.bookings
  where is_done = false
    and (
      payment_status = 'paid'
      or (payment_status = 'pending' and created_at > now() - interval '20 minutes')
    )
    and booking_at < v_end
    and (booking_at + (hours_count * interval '1 hour')) > p_booking_at
  for update;

  -- Step 2: count already-reserved tables in the window
  select coalesce(sum(tables_count), 0) into v_booked
  from public.bookings
  where is_done = false
    and (
      payment_status = 'paid'
      or (payment_status = 'pending' and created_at > now() - interval '20 minutes')
    )
    and booking_at < v_end
    and (booking_at + (hours_count * interval '1 hour')) > p_booking_at;

  if (v_booked + p_tables_count) > 12 then
    raise exception 'SLOT_UNAVAILABLE: % tables already booked in this window', v_booked;
  end if;
insert into public.bookings (
    customer_name,
    customer_email,
    customer_phone,
    tables_count,
    hours_count,
    booking_at,
    game_type,
    flitt_order_id,
    payment_status,
    booking_source,
    amount_charged
  )
values (
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_tables_count,
    p_hours_count,
    p_booking_at,
    p_game_type,
    p_flitt_order_id,
    'pending',
    'online',
    p_amount_charged
  )
returning id into v_id;
return v_id;
end;
$$;
grant execute on function public.create_online_booking(
    text,
    text,
    text,
    integer,
    numeric,
    timestamptz,
    text,
    text,
    numeric
  ) to anon,
  authenticated;