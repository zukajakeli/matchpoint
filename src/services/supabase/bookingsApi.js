import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

function emitBookingsChanged() {
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("bookings:changed"));
  }
}

function normalizeBooking(row) {
  return {
    ...row,
    is_done: Boolean(row?.is_done),
    done_at: row?.done_at ?? null,
    booking_at: row?.booking_at ?? null,
  };
}

const BOOKINGS_SELECT =
  "id, customer_name, customer_email, customer_phone, tables_count, hours_count, booking_at, is_done, done_at, created_at, game_type, booking_source, payment_status, flitt_order_id, flitt_payment_id, amount_charged, masked_card";

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

export async function createBooking({ customerName, tablesCount, hoursCount, bookingAt }) {
  assertSupabase();
  const normalizedHours =
    hoursCount === null || hoursCount === undefined || hoursCount === ""
      ? null
      : Number(hoursCount);
  const payload = {
    customer_name: customerName,
    tables_count: Number(tablesCount),
    hours_count: Number.isFinite(normalizedHours) && normalizedHours > 0 ? normalizedHours : null,
    booking_at: bookingAt || null,
    booking_source: "staff",
    payment_status: "none",
  };

  const { data, error } = await supabase
    .from("bookings")
    .insert(payload)
    .select(BOOKINGS_SELECT)
    .single();

  if (!error) {
    emitBookingsChanged();
    return normalizeBooking(data);
  }

  // Fallback for old schema
  const fallback = await supabase
    .from("bookings")
    .insert({ customer_name: customerName, tables_count: Number(tablesCount), hours_count: normalizedHours, booking_at: bookingAt || null })
    .select("id, customer_name, tables_count, hours_count, created_at")
    .single();

  if (fallback.error) throw fallback.error;
  emitBookingsChanged();
  return normalizeBooking(fallback.data);
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
        onChange(payload);
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

