-- ================================================================
-- One-time data move for the 10 ping-pong table layout (Table View).
--
-- Before: ids 1–8 ping-pong, 9 foosball, 10 air hockey,
--         11 PlayStation, 12 blank timer.
-- After:  ids 1–10 ping-pong, 11 foosball, 12 air hockey,
--         13 PlayStation, 14 blank timer.
--
-- Run it right before deploying the frontend that has TABLE_COUNT = 14,
-- while no timers are running. Safe to re-run: it does nothing once the
-- specials are already at 11–14.
-- ================================================================
do $$
begin
  -- Old layout detected by a special game still sitting at id 9 or 10.
  if exists (
    select 1 from public.live_timers
    where table_id in (9, 10) and game_type <> 'pingpong'
  ) then
    -- Two hops so the primary key never collides mid-update.
    update public.live_timers set table_id = table_id + 100
    where table_id between 9 and 12 and game_type <> 'pingpong';
    update public.live_timers set table_id = table_id - 98
    where table_id between 109 and 112;
  end if;

  insert into public.live_timers (table_id, name, game_type, sync_revision)
  values (9, 'Table 9', 'pingpong', 0), (10, 'Table 10', 'pingpong', 0)
  on conflict (table_id) do nothing;
end $$;
