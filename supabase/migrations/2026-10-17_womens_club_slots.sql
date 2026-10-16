-- Women's Social Club v2: fixed weekly time slots and one application per
-- person, replacing the dated sessions of 2026-10-16. Same statements as
-- supabase/schema.sql. Safe to re-run.

-- ── Women's Social Club ─────────────────────────────────────────────
-- Applications from the unlisted /womens-club page. There is no booking
-- and no payment: a woman applies once, choosing one of the fixed weekly
-- time slots. Each slot takes a limited number of applications (16 by
-- default); a full slot can't be chosen. Every application is linked to
-- a club member (matched by phone, then email; created when there is
-- none) and the member gets the 'womens_club' tag. Places are counted
-- from the applications, so removing someone frees her place right away.

-- Free-form labels on members, e.g. 'womens_club'
alter table public.members add column if not exists tags text[] not null default '{}';
create index if not exists members_tags_idx on public.members using gin (tags);

-- The first version used dated sessions (wc_sessions / wc_registrations).
-- Remove them if they hold no registrations; otherwise leave them alone.
drop function if exists public.wc_schedule();
drop function if exists public.wc_register(uuid, text, text, text, text, text);
drop function if exists public.wc_admin_add(uuid, text, text, text, text, text);
drop function if exists public.wc_add_registration(uuid, text, text, text, text, text, text, text);
do $$
declare
  v_has_rows boolean := false;
begin
  if to_regclass('public.wc_registrations') is not null then
    execute 'select exists (select 1 from public.wc_registrations)' into v_has_rows;
  end if;
  if v_has_rows then
    raise notice 'wc_registrations has rows; kept the old tables. Drop them by hand when no longer needed.';
  else
    drop table if exists public.wc_registrations;
    drop table if exists public.wc_sessions;
  end if;
end $$;

-- Weekly time slots. weekday: 1 = Monday … 7 = Sunday.
create table if not exists public.wc_slots (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  capacity integer not null default 16 check (capacity between 1 and 500),
  is_open boolean not null default true, -- false: no new applications from the website
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wc_slots (weekday, start_time, end_time, display_order)
select * from (values
  (1, time '19:30', time '21:00', 1),
  (2, time '19:30', time '21:00', 2),
  (3, time '19:30', time '21:00', 3),
  (4, time '19:30', time '21:00', 4),
  (5, time '19:30', time '21:00', 5),
  (6, time '17:30', time '19:00', 6),
  (7, time '12:30', time '14:00', 7)
) as seed(weekday, start_time, end_time, display_order)
where not exists (select 1 from public.wc_slots);

-- One application per person: a phone number or email can apply only once.
create table if not exists public.wc_applications (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.wc_slots(id) on delete restrict,
  member_id uuid null references public.members(id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text not null unique, -- normalised like members.phone
  email text, -- lower-cased
  level text not null check (level in ('never', 'beginner', 'intermediate', 'advanced')),
  source text not null default 'web' check (source in ('web', 'admin')),
  ip_hash text, -- for the per-connection rate limit only
  created_at timestamptz not null default now()
);
create unique index if not exists wc_applications_email_key on public.wc_applications (email) where email is not null;
create index if not exists wc_applications_slot on public.wc_applications (slot_id);
create index if not exists wc_applications_ip_recent on public.wc_applications (ip_hash, created_at desc);

alter table public.wc_slots enable row level security;
alter table public.wc_applications enable row level security;

-- Staff see the slots and the lists; the superadmin manages them.
-- The public page goes through wc_slot_list() / wc_apply() only.
drop policy if exists "staff_read" on public.wc_slots;
drop policy if exists "superadmin_write" on public.wc_slots;
drop policy if exists "staff_read" on public.wc_applications;
drop policy if exists "superadmin_delete" on public.wc_applications;
create policy "staff_read" on public.wc_slots
  for select to authenticated using (public.is_staff());
create policy "superadmin_write" on public.wc_slots
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "staff_read" on public.wc_applications
  for select to authenticated using (public.is_staff());
create policy "superadmin_delete" on public.wc_applications
  for delete to authenticated using (public.is_superadmin());

-- The slots with places left. No personal data.
create or replace function public.wc_slot_list()
returns table (id uuid, weekday smallint, start_time time, end_time time, capacity integer, spots_left integer, is_open boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.weekday, s.start_time, s.end_time, s.capacity,
         greatest(s.capacity - (select count(*) from public.wc_applications a where a.slot_id = s.id), 0)::integer,
         s.is_open
  from public.wc_slots s
  order by s.display_order, s.weekday, s.start_time;
$$;

-- Shared by the public form and the admin. The slot row is locked first,
-- so applications for one slot run one at a time and the capacity check
-- can't be raced. The unique phone/email indexes stop the same person
-- applying to two slots at the same moment.
create or replace function public.wc_add_application(
  p_slot_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text,
  p_source text,
  p_ip_hash text
) returns public.wc_applications
language plpgsql security definer set search_path = '' as $$
declare
  v_slot public.wc_slots;
  v_first text := trim(coalesce(p_first_name, ''));
  v_last text := trim(coalesce(p_last_name, ''));
  v_phone text := public.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_member_id uuid;
  v_taken integer;
  v_app public.wc_applications;
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

  select * into v_slot from public.wc_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;
  if p_source = 'web' and not v_slot.is_open then
    raise exception 'SLOT_CLOSED';
  end if;
  if exists (
    select 1 from public.wc_applications a
    where a.phone = v_phone or (v_email is not null and a.email = v_email)
  ) then
    raise exception 'ALREADY_APPLIED';
  end if;
  select count(*) into v_taken from public.wc_applications where slot_id = p_slot_id;
  if v_taken >= v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;

  -- The club member with this phone, or else this email
  select id into v_member_id from public.members where phone = v_phone;
  if v_member_id is null and v_email is not null then
    select id into v_member_id from public.members where email = v_email order by registered_at limit 1;
  end if;

  begin
    if v_member_id is null then
      insert into public.members (first_name, last_name, phone, email, home_branch_id, tags)
      values (v_first, v_last, v_phone, v_email, 'main', array['womens_club'])
      returning id into v_member_id;
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

    insert into public.wc_applications (slot_id, member_id, first_name, last_name, phone, email, level, source, ip_hash)
    values (p_slot_id, v_member_id, v_first, v_last, v_phone, v_email, p_level, p_source, p_ip_hash)
    returning * into v_app;
  exception when unique_violation then
    -- the same person applied a moment ago, from another tab or slot
    raise exception 'ALREADY_APPLIED';
  end;
  return v_app;
end;
$$;

-- Public application (anon). Email is required here, optional for the
-- admin. At most 20 applications per connection per hour, which still
-- leaves room for many phones behind one mobile network address.
create or replace function public.wc_apply(
  p_slot_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text
) returns table (weekday smallint, start_time time, end_time time)
language plpgsql security definer set search_path = '' as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := trim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1));
  v_hash text := case when v_ip <> '' then md5('wc-rate:' || v_ip) end;
  v_app public.wc_applications;
begin
  if v_hash is not null and (
    select count(*) from public.wc_applications a
    where a.ip_hash = v_hash and a.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'RATE_LIMITED';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'INVALID_EMAIL';
  end if;
  v_app := public.wc_add_application(p_slot_id, p_first_name, p_last_name, p_phone, p_email, p_level, 'web', v_hash);
  return query select s.weekday, s.start_time, s.end_time from public.wc_slots s where s.id = v_app.slot_id;
end;
$$;

-- Admin: add someone by hand. Works on closed slots; the capacity still
-- applies (raise it first to squeeze someone in).
create or replace function public.wc_admin_add(
  p_slot_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_level text
) returns public.wc_applications
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.wc_add_application(p_slot_id, p_first_name, p_last_name, p_phone, p_email, p_level, 'admin', null);
end;
$$;

-- Admin: move someone to another slot (capacity applies).
create or replace function public.wc_admin_move(p_application_id uuid, p_slot_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_slot public.wc_slots;
begin
  if not public.is_superadmin() then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_slot from public.wc_slots where id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;
  if (select count(*) from public.wc_applications where slot_id = p_slot_id and id <> p_application_id) >= v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;
  update public.wc_applications set slot_id = p_slot_id where id = p_application_id;
end;
$$;

revoke all on function public.wc_add_application(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.wc_slot_list() from public;
revoke all on function public.wc_apply(uuid, text, text, text, text, text) from public;
revoke all on function public.wc_admin_add(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.wc_admin_move(uuid, uuid) from public, anon;
grant execute on function public.wc_slot_list() to anon, authenticated;
grant execute on function public.wc_apply(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.wc_admin_add(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.wc_admin_move(uuid, uuid) to authenticated;
