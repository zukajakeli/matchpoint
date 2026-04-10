import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

const EVENTS_SELECT = "id, title, description, image, event_date, registration_deadline, max_participants, entry_fee, allow_offline_payment, is_active, created_at, updated_at";
const REG_SELECT = "id, event_id, participant_name, participant_email, participant_phone, payment_method, payment_status, flitt_order_id, amount_charged, masked_card, created_at";

// ─── Events CRUD ──────────────────────────────────────────────────────────

export async function fetchEvents(onlyActive = false) {
  assertSupabase();
  let query = supabase.from("events").select(EVENTS_SELECT).order("event_date", { ascending: true });
  if (onlyActive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchEventById(id) {
  assertSupabase();
  const { data, error } = await supabase.from("events").select(EVENTS_SELECT).eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createEvent(payload) {
  assertSupabase();
  const { data, error } = await supabase.from("events").insert(payload).select(EVENTS_SELECT).single();
  if (error) throw error;
  return data;
}

export async function updateEvent(id, updates) {
  assertSupabase();
  const { data, error } = await supabase
    .from("events")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(EVENTS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id) {
  assertSupabase();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

// ─── Event Registrations ──────────────────────────────────────────────────

export async function fetchEventRegistrations(eventId) {
  assertSupabase();
  const { data, error } = await supabase
    .from("event_registrations")
    .select(REG_SELECT)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchRegistrationCount(eventId) {
  assertSupabase();
  const { count, error } = await supabase
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("payment_status", ["paid", "pending"]);
  if (error) throw error;
  return count || 0;
}

export async function markRegistrationPaid(id) {
  assertSupabase();
  const { data, error } = await supabase
    .from("event_registrations")
    .update({ payment_status: "paid" })
    .eq("id", id)
    .select(REG_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRegistration(id) {
  assertSupabase();
  const { error } = await supabase.from("event_registrations").delete().eq("id", id);
  if (error) throw error;
}
