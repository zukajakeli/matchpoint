-- Homepage redesign: hero slider, gallery, editable page content and
-- corporate inquiries. Same statements as supabase/schema.sql. Safe to re-run.


-- ── Website content (homepage + corporate page) ───────────────────
-- Everything below is edited from /superadmin/website. Text fields come
-- in Georgian (_ka) and English (_en); an empty English field falls back
-- to Georgian. image is a base64 data URL, an https URL, or a site path
-- such as /hero-tables.jpg (served through /api/image).

-- Show a service in the homepage scroller (it stays on its own page either way)
alter table public.products add column if not exists show_on_home boolean not null default true;

-- Homepage hero slider. kind decides the defaults the site falls back to:
--   brand | events | book | corporate | custom
-- An events slide shows the next upcoming event's title and date, and its
-- photo when the slide has no image of its own.
create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'custom' check (kind in ('brand', 'events', 'book', 'corporate', 'custom')),
  title_ka text,
  title_en text,
  subtitle_ka text,
  subtitle_en text,
  cta_ka text,
  cta_en text,
  link_url text,
  image text,
  image_alt text,
  image_position text not null default 'center',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Starter slides so the slider works before anything is uploaded. They
-- use the venue photo already in /public; replace it from the admin.
insert into public.hero_slides (kind, title_ka, title_en, subtitle_ka, subtitle_en, cta_ka, cta_en, link_url, image, image_alt, image_position, display_order)
select * from (values
  ('brand', 'წამო, რამე ვითამაშოთ', 'Come on, let''s play something',
   'მატჩ ფოინთში დაგხვდება 10 ჩოგბურთ მაგიდა, ბარი, მაგიდის ფეხბურთი & ჰოკეი, ბიერ პონგი და PS5. ჩვენს ეზოში შეგიძლია ითამაშო ჭადრაკი და სხვადასხვა ქარდ და ბორდ გეიმები.',
   'At MatchPoint you''ll find 10 ping pong tables, a bar, foosball & air hockey, beer pong and PS5. In our yard you can play chess and all kinds of card and board games.',
   'გაიცანი მატჩ ფოინთი', 'Explore MatchPoint', '/#services', '/hero-tables.jpg', 'MatchPoint ping pong hall with players at the tables', 'center', 0),
  ('events', 'მომავალი ივენთები', 'Upcoming events', null, null,
   'ივენთების ნახვა', 'Explore Events', '/events', null, 'Table tennis tournament at MatchPoint', 'left center', 1),
  ('book', 'დაჯავშნე მაგიდა', 'Book your table', 'აირჩიე დრო და დაჯავშნე ონლაინ.', 'Pick a time and book online.',
   'დაჯავშნე ახლა', 'Book Now', '/book', '/hero-tables.jpg', 'Ping pong tables ready to play at MatchPoint', 'center bottom', 2),
  ('corporate', 'კორპორატიული ივენთები მატჩ ფოინთში', 'Corporate events at MatchPoint',
   'ტურნირები, თიმბილდინგი და კერძო ღონისძიებები შენი გუნდისთვის.', 'Tournaments, team building and private events for your team.',
   'დაგეგმე ივენთი', 'Plan Your Event', '/corporate-events', '/hero-tables.jpg', 'Group of friends playing table tennis at MatchPoint', 'right center', 3)
) as seed(kind, title_ka, title_en, subtitle_ka, subtitle_en, cta_ka, cta_en, link_url, image, image_alt, image_position, display_order)
where not exists (select 1 from public.hero_slides);

-- Venue gallery on the homepage
create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  image text not null,
  alt_ka text,
  alt_en text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Editable page text, one JSON document per key:
--   'corporate' → intro + event options for /corporate-events
--   'contact'   → phone, email, address shown on /corporate-events
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Corporate inquiries sent from /corporate-events. Written only by the
-- corporate-inquiry edge function (service role), so a lead is kept even
-- if the notification email fails.
create table if not exists public.corporate_inquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  email text not null,
  phone text not null,
  event_date date,
  participants integer,
  message text not null,
  ip_hash text,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);
create index if not exists corporate_inquiries_ip_recent on public.corporate_inquiries (ip_hash, created_at desc);

alter table public.hero_slides enable row level security;
alter table public.gallery_images enable row level security;
alter table public.site_content enable row level security;
alter table public.corporate_inquiries enable row level security;

drop policy if exists "public_read_active" on public.hero_slides;
drop policy if exists "superadmin_write" on public.hero_slides;
drop policy if exists "public_read_active" on public.gallery_images;
drop policy if exists "superadmin_write" on public.gallery_images;
drop policy if exists "public_read" on public.site_content;
drop policy if exists "superadmin_write" on public.site_content;
drop policy if exists "superadmin_read" on public.corporate_inquiries;
drop policy if exists "superadmin_delete" on public.corporate_inquiries;

-- Website content: public reads what is live, superadmin manages it
create policy "public_read_active" on public.hero_slides
  for select to anon, authenticated using (is_active or public.is_superadmin());
create policy "superadmin_write" on public.hero_slides
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "public_read_active" on public.gallery_images
  for select to anon, authenticated using (is_active or public.is_superadmin());
create policy "superadmin_write" on public.gallery_images
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "public_read" on public.site_content
  for select to anon, authenticated using (true);
create policy "superadmin_write" on public.site_content
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
-- Inquiries hold contact details: superadmin reads and deletes; inserts
-- come only from the edge function.
create policy "superadmin_read" on public.corporate_inquiries
  for select to authenticated using (public.is_superadmin());
create policy "superadmin_delete" on public.corporate_inquiries
  for delete to authenticated using (public.is_superadmin());

