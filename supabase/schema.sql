-- Run this in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  image text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.session_history (
  id uuid primary key default gen_random_uuid(),
  table_id integer not null,
  table_name text not null,
  end_time timestamptz not null,
  duration_played numeric not null default 0,
  amount_paid numeric(10,2) not null default 0,
  session_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bar_sales (
  id uuid primary key default gen_random_uuid(),
  "timestamp" timestamptz not null,
  items text not null,
  total_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.live_timers (
  table_id integer primary key,
  name text not null,
  is_available boolean not null default true,
  timer_start_time bigint null,
  elapsed_time_in_seconds numeric not null default 0,
  is_running boolean not null default false,
  timer_mode text not null default 'standard',
  initial_countdown_seconds numeric null,
  session_start_time bigint null,
  session_end_time bigint null,
  fit_pass boolean not null default false,
  game_type text not null default 'pingpong',
  hourly_rate numeric null,
  sync_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  tables_count integer not null check (tables_count > 0),
  hours_count numeric null check (hours_count is null or hours_count > 0),
  booking_at timestamptz null,
  is_done boolean not null default false,
  done_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.menu_items enable row level security;
alter table public.session_history enable row level security;
alter table public.bar_sales enable row level security;
alter table public.live_timers enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "menu_items_public_rw" on public.menu_items;
create policy "menu_items_public_rw"
on public.menu_items
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "session_history_public_rw" on public.session_history;
create policy "session_history_public_rw"
on public.session_history
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "bar_sales_public_rw" on public.bar_sales;
create policy "bar_sales_public_rw"
on public.bar_sales
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "live_timers_public_rw" on public.live_timers;
create policy "live_timers_public_rw"
on public.live_timers
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "bookings_public_rw" on public.bookings;
create policy "bookings_public_rw"
on public.bookings
for all
to anon, authenticated
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.live_timers;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.bookings;
exception
  when duplicate_object then null;
end
$$;

alter table public.live_timers
add column if not exists sync_revision bigint not null default 0;

alter table public.bookings
add column if not exists is_done boolean not null default false;

alter table public.bookings
add column if not exists done_at timestamptz null;

alter table public.bookings
add column if not exists booking_at timestamptz null;

create or replace function public.upsert_live_timers_guarded(payload jsonb)
returns void
language plpgsql
as $$
begin
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
  select
    row_data.table_id,
    row_data.name,
    coalesce(row_data.is_available, true),
    row_data.timer_start_time,
    coalesce(row_data.elapsed_time_in_seconds, 0),
    coalesce(row_data.is_running, false),
    coalesce(row_data.timer_mode, 'standard'),
    row_data.initial_countdown_seconds,
    row_data.session_start_time,
    row_data.session_end_time,
    coalesce(row_data.fit_pass, false),
    coalesce(row_data.game_type, 'pingpong'),
    row_data.hourly_rate,
    coalesce(row_data.sync_revision, 0),
    now()
  from jsonb_to_recordset(coalesce(payload, '[]'::jsonb)) as row_data(
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
    sync_revision = excluded.sync_revision,
    updated_at = now()
  where excluded.sync_revision > public.live_timers.sync_revision;
end;
$$;

grant execute on function public.upsert_live_timers_guarded(jsonb) to anon, authenticated;

alter table public.bookings
alter column hours_count drop not null;

do $$
begin
  alter table public.bookings drop constraint bookings_hours_count_check;
exception
  when undefined_object then null;
end
$$;

alter table public.bookings
add constraint bookings_hours_count_check
check (hours_count is null or hours_count > 0);

-- ============================================================
-- Online Booking + Payment additions
-- ============================================================

alter table public.bookings add column if not exists customer_email text;
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists game_type text default 'pingpong';
-- 'staff' = created by staff in admin, 'online' = customer self-service
alter table public.bookings add column if not exists booking_source text default 'staff';
-- 'none' = staff entry, 'pending' = awaiting Flitt payment,
-- 'paid' = confirmed, 'failed' = declined/expired
alter table public.bookings add column if not exists payment_status text default 'none';
alter table public.bookings add column if not exists flitt_order_id text;
alter table public.bookings add column if not exists flitt_payment_id text;
alter table public.bookings add column if not exists amount_charged numeric(10,2);
alter table public.bookings add column if not exists masked_card text;

-- Unique constraint on flitt_order_id (skip if already exists)
do $$
begin
  alter table public.bookings add constraint bookings_flitt_order_id_unique unique (flitt_order_id);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end
$$;

-- Atomic availability-check + insert to prevent double-booking race conditions.
-- Uses FOR UPDATE row lock so two concurrent transactions cannot both see
-- the same available slot and both succeed.
create or replace function public.create_online_booking(
  p_customer_name    text,
  p_customer_email   text,
  p_customer_phone   text,
  p_tables_count     integer,
  p_hours_count      numeric,
  p_booking_at       timestamptz,
  p_game_type        text,
  p_flitt_order_id   text,
  p_amount_charged   numeric
) returns uuid
language plpgsql
as $$
declare
  v_booked integer;
  v_id     uuid;
  v_end    timestamptz;
begin
  v_end := p_booking_at + (p_hours_count * interval '1 hour');

  -- Lock conflicting rows; counts how many tables are already reserved
  select coalesce(sum(tables_count), 0) into v_booked
  from public.bookings
  where is_done = false
    and (
      payment_status = 'paid'
      or (payment_status = 'pending' and created_at > now() - interval '20 minutes')
    )
    and booking_at < v_end
    and (booking_at + (hours_count * interval '1 hour')) > p_booking_at
  for update;

  if (v_booked + p_tables_count) > 12 then
    raise exception 'SLOT_UNAVAILABLE: % tables already booked in this window', v_booked;
  end if;

  insert into public.bookings (
    customer_name, customer_email, customer_phone,
    tables_count, hours_count, booking_at, game_type,
    flitt_order_id, payment_status, booking_source, amount_charged
  ) values (
    p_customer_name, p_customer_email, p_customer_phone,
    p_tables_count, p_hours_count, p_booking_at, p_game_type,
    p_flitt_order_id, 'pending', 'online', p_amount_charged
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_online_booking(text, text, text, integer, numeric, timestamptz, text, text, numeric)
  to anon, authenticated;

