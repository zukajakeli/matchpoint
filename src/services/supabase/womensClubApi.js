// Women's Social Club: weekly sessions with limited places.
// The public page only calls wc_schedule() and wc_register(); the admin
// reads the tables directly (RLS: staff read, superadmin write).

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
  const { data, error } = await supabase.rpc("wc_schedule");
  if (error) throw error;
  return data || [];
}

export async function registerWc({ sessionId, firstName, lastName, phone, email, level }) {
  assertSupabase();
  const { data, error } = await supabase.rpc("wc_register", {
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
    .from("wc_sessions")
    .select("id, starts_at, capacity, is_open, note, wc_registrations(count)")
    .order("starts_at", { ascending: true });
  if (from) query = query.gte("starts_at", from);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(({ wc_registrations: regs, ...s }) => ({ ...s, taken: regs?.[0]?.count || 0 }));
}

export async function createWcSessions(rows) {
  assertSupabase();
  const { error } = await supabase.from("wc_sessions").insert(rows);
  if (error) throw error;
}

export async function updateWcSession(id, fields) {
  assertSupabase();
  const { error } = await supabase
    .from("wc_sessions")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWcSession(id) {
  assertSupabase();
  const { error } = await supabase.from("wc_sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchWcRegistrations(sessionId) {
  assertSupabase();
  const { data, error } = await supabase
    .from("wc_registrations")
    .select("id, first_name, last_name, phone, email, level, source, created_at, member_id, members(member_code)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminAddWcParticipant(sessionId, { firstName, lastName, phone, email, level }) {
  assertSupabase();
  const { error } = await supabase.rpc("wc_admin_add", {
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
  const { error } = await supabase.from("wc_registrations").delete().eq("id", id);
  if (error) throw error;
}
