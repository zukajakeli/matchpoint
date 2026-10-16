// Women's Social Club: free weekly club sessions with limited places.
// Separate from table bookings; shares only the membership database
// (registrations point at members, who get the 'womens_club' label).
// The public page only calls womens_club_schedule() and
// womens_club_register(); the admin reads the tables directly
// (RLS: staff read, superadmin write).

import { supabase } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

export const WC_LEVELS = ["never", "beginner", "intermediate", "advanced"];
export const WC_TAG = "womens_club";
export const WC_DEFAULT_CAPACITY = 16;

// Database errors arrive as "CODE"; keep only the code.
export function wcErrorCode(error) {
  const match = String(error?.message || "").match(/[A-Z_]{5,}/);
  if (match) return match[0];
  if (error?.code === "23505") return "ALREADY_REGISTERED";
  return "UNKNOWN";
}

// ── Public ───────────────────────────────────────────────────────────
export async function fetchWcSchedule() {
  assertSupabase();
  const { data, error } = await supabase.rpc("womens_club_schedule");
  if (error) throw error;
  return data || [];
}

export async function registerWc({ sessionId, firstName, lastName, phone, email, level }) {
  assertSupabase();
  const { data, error } = await supabase.rpc("womens_club_register", {
    p_session_id: sessionId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
    p_email: email,
    p_level: level,
  });
  if (error) throw error;
  return data?.[0] || null;
}

// ── Admin ────────────────────────────────────────────────────────────
export async function fetchWcSessions({ from } = {}) {
  assertSupabase();
  let query = supabase
    .from("womens_club_sessions")
    .select("id, starts_at, ends_at, capacity, is_open, note, womens_club_registrations(count)")
    .order("starts_at", { ascending: true });
  if (from) query = query.gte("starts_at", from);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(({ womens_club_registrations: regs, ...s }) => ({ ...s, taken: regs?.[0]?.count || 0 }));
}

export async function createWcSessions(rows) {
  assertSupabase();
  const { error } = await supabase.from("womens_club_sessions").insert(rows);
  if (error) throw error;
}

export async function updateWcSession(id, fields) {
  assertSupabase();
  const { error } = await supabase
    .from("womens_club_sessions")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWcSession(id) {
  assertSupabase();
  const { error } = await supabase.from("womens_club_sessions").delete().eq("id", id);
  if (error) throw error;
}

// Names and contact details come from the member profile, so edits made
// in the membership database show here too.
export async function fetchWcRegistrations(sessionId) {
  assertSupabase();
  const { data, error } = await supabase
    .from("womens_club_registrations")
    .select("id, level, source, created_at, member_id, members(member_code, first_name, last_name, phone, email)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(({ members: m, ...r }) => ({
    ...r,
    member_code: m?.member_code,
    first_name: m?.first_name,
    last_name: m?.last_name,
    phone: m?.phone,
    email: m?.email,
  }));
}

export async function adminAddWcParticipant(sessionId, { firstName, lastName, phone, email, level }) {
  assertSupabase();
  const { error } = await supabase.rpc("womens_club_admin_add", {
    p_session_id: sessionId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
    p_email: email || null,
    p_level: level,
  });
  if (error) throw error;
}

export async function removeWcParticipant(id) {
  assertSupabase();
  const { error } = await supabase.from("womens_club_registrations").delete().eq("id", id);
  if (error) throw error;
}

// ── Weekly time slots (template for each week's sessions) ────────────
export async function fetchWcSlots() {
  assertSupabase();
  const { data, error } = await supabase
    .from("womens_club_slots")
    .select("id, weekday, start_time, end_time, capacity, is_active")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveWcSlot(id, fields) {
  assertSupabase();
  const query = id
    ? supabase.from("womens_club_slots").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id)
    : supabase.from("womens_club_slots").insert(fields);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteWcSlot(id) {
  assertSupabase();
  const { error } = await supabase.from("womens_club_slots").delete().eq("id", id);
  if (error) throw error;
}

// Creates the sessions of one week (its Monday, YYYY-MM-DD) from the
// active time slots. Returns how many were added.
export async function fillWcWeek(monday) {
  assertSupabase();
  const { data, error } = await supabase.rpc("womens_club_admin_fill_week", { p_monday: monday });
  if (error) throw error;
  return data || 0;
}
