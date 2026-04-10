-- ============================================================
-- Schema additions for: Products, Blog, Events/Tournaments
-- Run this in Supabase SQL Editor after the base schema.
-- ============================================================

-- ─── Products / Services (admin-managed) ──────────────────────────────────

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  image text,                       -- base64 or URL
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "products_public_rw" on public.products;
create policy "products_public_rw"
on public.products
for all
to anon, authenticated
using (true)
with check (true);

-- ─── Blog Posts (admin-managed, rich text) ────────────────────────────────

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null,            -- HTML from rich text editor
  cover_image text,                 -- base64 or URL
  is_published boolean not null default false,
  published_at timestamptz,
  author text default 'MatchPoint',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_posts enable row level security;

drop policy if exists "blog_posts_public_rw" on public.blog_posts;
create policy "blog_posts_public_rw"
on public.blog_posts
for all
to anon, authenticated
using (true)
with check (true);

-- ─── Events / Tournaments (admin-managed) ─────────────────────────────────

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image text,                        -- base64 or URL
  event_date timestamptz not null,
  registration_deadline timestamptz,
  max_participants integer,
  entry_fee numeric(10,2) default 0,
  allow_offline_payment boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists "events_public_rw" on public.events;
create policy "events_public_rw"
on public.events
for all
to anon, authenticated
using (true)
with check (true);

-- ─── Event Registrations ──────────────────────────────────────────────────

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_name text not null,
  participant_email text,
  participant_phone text,
  payment_method text not null default 'offline',  -- 'online' or 'offline'
  payment_status text not null default 'pending',   -- 'pending', 'paid', 'failed'
  flitt_order_id text unique,
  flitt_payment_id text,
  amount_charged numeric(10,2),
  masked_card text,
  created_at timestamptz not null default now()
);

alter table public.event_registrations enable row level security;

drop policy if exists "event_registrations_public_rw" on public.event_registrations;
create policy "event_registrations_public_rw"
on public.event_registrations
for all
to anon, authenticated
using (true)
with check (true);

-- Enable realtime for events
do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.event_registrations;
exception
  when duplicate_object then null;
end
$$;

-- ─── Edge Function for event registration payment ─────────────────────────

create or replace function public.create_event_registration(
  p_event_id       uuid,
  p_name           text,
  p_email          text,
  p_phone          text,
  p_payment_method text,
  p_flitt_order_id text,
  p_amount         numeric
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_event record;
  v_count integer;
begin
  select * into v_event from public.events where id = p_event_id and is_active = true;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_event.registration_deadline is not null and now() > v_event.registration_deadline then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  select count(*) into v_count
  from public.event_registrations
  where event_id = p_event_id
    and payment_status in ('paid', 'pending')
  for update;

  if v_event.max_participants is not null and v_count >= v_event.max_participants then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.event_registrations (
    event_id, participant_name, participant_email, participant_phone,
    payment_method, payment_status, flitt_order_id, amount_charged
  ) values (
    p_event_id, p_name, p_email, p_phone,
    p_payment_method,
    case when p_payment_method = 'offline' then 'pending' else 'pending' end,
    p_flitt_order_id, p_amount
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_event_registration(uuid, text, text, text, text, text, numeric)
  to anon, authenticated;
