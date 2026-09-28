-- ================================================================
-- One-time backfill: give upcoming bookings that have no table numbers
-- (every online booking made before table assignment existed) real
-- tables, so they show up in Table View.
--
-- Run AFTER supabase/schema.sql and 2026-09-28_ten_pingpong_tables.sql.
-- Safe to re-run: only touches bookings whose table_ids is still empty.
-- Bookings that can't be placed (not enough free tables) are left
-- unassigned and listed in Table View's "Needs a table" tray.
-- ================================================================
do $$
declare
  b public.bookings;
  v_tables integer[];
begin
  for b in
    select * from public.bookings
    where is_done = false
      and cardinality(table_ids) = 0
      and booking_at is not null
      and booking_at + coalesce(hours_count, 1) * interval '1 hour' > now()
      and (
        payment_status is null
        or payment_status in ('none', 'paid')
        or (payment_status = 'pending' and created_at > now() - interval '20 minutes')
      )
    order by booking_at, created_at
  loop
    v_tables := public.pick_tables(
      public.free_table_ids(
        b.booking_at,
        b.booking_at + coalesce(b.hours_count, 1) * interval '1 hour',
        coalesce(b.game_type, 'pingpong'),
        b.id
      ),
      b.tables_count
    );
    if v_tables is not null then
      update public.bookings set table_ids = v_tables where id = b.id;
      raise notice 'Booking % (%) → tables %', b.id, b.customer_name, v_tables;
    else
      raise notice 'Booking % (%) left unassigned: not enough free tables', b.id, b.customer_name;
    end if;
  end loop;
end $$;
