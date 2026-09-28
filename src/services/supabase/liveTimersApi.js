import { supabase, isSupabaseConfigured } from "../supabaseClient";

let hasWarnedMissingGuardedRpc = false;

function toLiveTimerRow(table) {
  return {
    table_id: table.id,
    name: table.name,
    is_available: Boolean(table.isAvailable),
    timer_start_time: table.timerStartTime ?? null,
    elapsed_time_in_seconds: Number(table.elapsedTimeInSeconds || 0),
    is_running: Boolean(table.isRunning),
    timer_mode: table.timerMode || "standard",
    initial_countdown_seconds: table.initialCountdownSeconds ?? null,
    session_start_time: table.sessionStartTime ?? null,
    session_end_time: table.sessionEndTime ?? null,
    fit_pass: Boolean(table.fitPass),
    game_type: table.gameType || "pingpong",
    hourly_rate: typeof table.hourlyRate === "number" ? table.hourlyRate : null,
    member_id: table.memberId ?? null,
    member_session_id: table.memberSessionId ?? null,
    member_name: table.memberName ?? null,
    sync_revision: Number(table.syncRevision || 0),
  };
}

function fromLiveTimerRow(row) {
  return {
    id: Number(row.table_id),
    name: row.name,
    isAvailable: Boolean(row.is_available),
    timerStartTime: row.timer_start_time ?? null,
    elapsedTimeInSeconds: Number(row.elapsed_time_in_seconds || 0),
    isRunning: Boolean(row.is_running),
    timerMode: row.timer_mode || "standard",
    initialCountdownSeconds: row.initial_countdown_seconds ?? null,
    sessionStartTime: row.session_start_time ?? null,
    sessionEndTime: row.session_end_time ?? null,
    fitPass: Boolean(row.fit_pass),
    gameType: row.game_type || "pingpong",
    hourlyRate:
      typeof row.hourly_rate === "number"
        ? row.hourly_rate
        : row.hourly_rate
        ? Number(row.hourly_rate)
        : null,
    memberId: row.member_id ?? null,
    memberSessionId: row.member_session_id ?? null,
    memberName: row.member_name ?? null,
    syncRevision: Number(row.sync_revision || 0),
  };
}

export async function fetchLiveTimers() {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("live_timers")
    .select(
      "table_id, name, is_available, timer_start_time, elapsed_time_in_seconds, is_running, timer_mode, initial_countdown_seconds, session_start_time, session_end_time, fit_pass, game_type, hourly_rate, member_id, member_session_id, member_name, sync_revision"
    )
    .order("table_id", { ascending: true });

  if (error) throw error;
  return (data || []).map(fromLiveTimerRow);
}

export async function upsertLiveTimers(tables, syncRevision = Date.now()) {
  if (!isSupabaseConfigured || !supabase) return;
  const rows = (tables || []).map((table) =>
    toLiveTimerRow({ ...table, syncRevision })
  );
  if (!rows.length) return;
  const { error: rpcError } = await supabase.rpc("upsert_live_timers_guarded", {
    payload: rows,
  });
  if (!rpcError) return;

  const isMissingFunction =
    rpcError?.code === "42883" ||
    /upsert_live_timers_guarded/i.test(rpcError?.message || "");

  if (isMissingFunction) {
    if (!hasWarnedMissingGuardedRpc) {
      hasWarnedMissingGuardedRpc = true;
      console.warn(
        "Supabase function upsert_live_timers_guarded is missing. Falling back to legacy upsert; run supabase/schema.sql for guarded sync."
      );
    }
    const { error } = await supabase
      .from("live_timers")
      .upsert(rows, { onConflict: "table_id" });
    if (error) throw error;
    return;
  }

  throw rpcError;
}

export function subscribeToLiveTimerChanges(onRow) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel("live-timers-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_timers" },
      (payload) => {
        const next = payload.new || payload.old;
        if (!next) return;
        onRow(fromLiveTimerRow(next));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

