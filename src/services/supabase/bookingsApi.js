import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";
import { gameTypeForTables } from "../../utils/bookableTables";

function emitBookingsChanged() {
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("bookings:changed"));
  }
}

function normalizeTableIds(rawIds) {
  if (!Array.isArray(rawIds)) return [];
  return rawIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function normalizeHours(hoursCount) {
  if (hoursCount === null || hoursCount === undefined || hoursCount === "") return null;
  const hours = Number(hoursCount);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function normalizeBooking(row) {
  return {
    ...row,
    is_done: Boolean(row?.is_done),
    done_at: row?.done_at ?? null,
    booking_at: row?.booking_at ?? null,
    table_ids: normalizeTableIds(row?.table_ids),
  };
}

const BOOKINGS_SELECT =
  "id, customer_name, customer_email, customer_phone, tables_count, hours_count, booking_at, table_ids, is_done, done_at, created_at, game_type, booking_source, payment_status, flitt_order_id, flitt_payment_id, amount_charged, masked_card";

export async function fetchBookings() {
  assertSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKINGS_SELECT)
    .or("is_done.is.false,is_done.is.null")
    .order("created_at", { ascending: false });

  if (!error) return (data || []).map(normalizeBooking);

  // Fallback for legacy schema
  const fallback = await supabase
    .from("bookings")
    .select("id, customer_name, tables_count, hours_count, created_at")
    .order("created_at", { ascending: false });

  if (fallback.error) throw fallback.error;
  return (fallback.data || []).map(normalizeBooking);
}

export async function fetchUpcomingPaidBookings() {
  if (!isSupabaseConfigured || !supabase) return [];
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("bookings")
    .select(BOOKINGS_SELECT)
    .eq("payment_status", "paid")
    .eq("is_done", false)
    .gte("booking_at", now)
    .order("booking_at", { ascending: true });
  return (data || []).map(normalizeBooking);
}

export async function createBooking({ customerName, tablesCount, hoursCount, bookingAt, tableIds }) {
  assertSupabase();
  const cleanedTableIds = normalizeTableIds(tableIds);
  const fallbackTablesCount = Number(tablesCount);
  const payload = {
    customer_name: customerName,
    tables_count:
      cleanedTableIds.length ||
      (Number.isFinite(fallbackTablesCount) && fallbackTablesCount > 0 ? fallbackTablesCount : 1),
    hours_count: normalizeHours(hoursCount),
    booking_at: bookingAt || null,
    table_ids: cleanedTableIds,
    game_type: gameTypeForTables(cleanedTableIds),
    booking_source: "staff",
    payment_status: "none",
  };

  const { data, error } = await supabase
    .from("bookings")
    .insert(payload)
    .select(BOOKINGS_SELECT)
    .single();

  if (error) throw error;
  emitBookingsChanged();
  return normalizeBooking(data);
}

// Partial update: only the fields passed are written, so a drag-to-reschedule
// (bookingAt + tableIds) leaves the name and duration untouched.
export async function updateBooking(id, { customerName, hoursCount, bookingAt, tableIds }) {
  assertSupabase();
  const payload = {};
  if (customerName !== undefined) payload.customer_name = customerName;
  if (hoursCount !== undefined) payload.hours_count = normalizeHours(hoursCount);
  if (bookingAt !== undefined) payload.booking_at = bookingAt || null;
  if (tableIds !== undefined) {
    const cleanedTableIds = normalizeTableIds(tableIds);
    payload.table_ids = cleanedTableIds;
    if (cleanedTableIds.length > 0) {
      payload.tables_count = cleanedTableIds.length;
      payload.game_type = gameTypeForTables(cleanedTableIds);
    }
  }

  const { data, error } = await supabase
    .from("bookings")
    .update(payload)
    .eq("id", id)
    .select(BOOKINGS_SELECT)
    .single();

  if (error) throw error;
  emitBookingsChanged();
  return normalizeBooking(data);
}

// Let the database pick the best free tables (side by side when possible)
// for a booking that has none yet. Returns the assigned table ids.
export async function autoAssignBookingTables(id) {
  assertSupabase();
  const { data, error } = await supabase.rpc("auto_assign_booking_tables", { p_booking_id: id });
  if (error) throw error;
  emitBookingsChanged();
  return normalizeTableIds(data);
}

export async function markBookingAsDone(id) {
  assertSupabase();
  const primary = await supabase
    .from("bookings")
    .update({ is_done: true, done_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, customer_name, tables_count, hours_count, booking_at, is_done, done_at, created_at")
    .single();

  if (!primary.error) {
    emitBookingsChanged();
    return normalizeBooking(primary.data);
  }

  // Fallback for old schema: treat "done" as remove from active list
  const fallback = await supabase.from("bookings").delete().eq("id", id);
  if (fallback.error) throw fallback.error;
  emitBookingsChanged();
  return { id, is_done: true, done_at: new Date().toISOString() };
}

export async function fetchDoneBookings(limit = 50) {
  assertSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKINGS_SELECT)
    .eq("is_done", true)
    .order("done_at", { ascending: false })
    .limit(limit);

  if (!error) return (data || []).map(normalizeBooking);

  // Fallback: if done_at column doesn't exist, return empty
  return [];
}

export async function deleteBooking(id) {
  assertSupabase();
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;
  emitBookingsChanged();
}

export async function fetchActiveBookingsCount() {
  assertSupabase();
  const primary = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .or("is_done.is.false,is_done.is.null");

  if (!primary.error) return primary.count || 0;

  // Fallback for old schema
  const fallback = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true });
  if (fallback.error) throw fallback.error;
  return fallback.count || 0;
}

export function subscribeToBookingsChanges(onChange) {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel("bookings-change-notifications")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bookings" },
      (payload) => {
        const { new: newRow, old: oldRow } = payload || {};
        onChange({
          ...payload,
          new: newRow ? normalizeBooking(newRow) : newRow,
          old: oldRow ? normalizeBooking(oldRow) : oldRow,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToBookingInserts(onInsert) {
  return subscribeToBookingsChanges((payload) => {
    if (payload.eventType === "INSERT" && payload?.new) {
      onInsert(payload.new);
    }
  });
}

