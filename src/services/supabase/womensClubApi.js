// Women's Social Club: one application per person, for one of the fixed
// weekly time slots (no booking, no payment, not linked to club
// membership). The public page only calls wc_slot_list() and wc_apply();
// the admin reads the tables directly (RLS: staff read, superadmin write).

import { supabase } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

export const WC_LEVELS = ["never", "beginner", "intermediate", "advanced"];
export const WC_DEFAULT_CAPACITY = 16;

// Database errors arrive as "CODE"; keep only the code.
export function wcErrorCode(error) {
  const match = String(error?.message || "").match(/[A-Z_]{5,}/);
  if (match) return match[0];
  if (error?.code === "23505") return "ALREADY_APPLIED";
  return "UNKNOWN";
}

// ── Public ───────────────────────────────────────────────────────────
export async function fetchWcSlots() {
  assertSupabase();
  const { data, error } = await supabase.rpc("wc_slot_list");
  if (error) throw error;
  return data || [];
}

export async function applyWc({ slotId, firstName, lastName, phone, email, level }) {
  assertSupabase();
  const { data, error } = await supabase.rpc("wc_apply", {
    p_slot_id: slotId,
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
export async function fetchWcSlotsAdmin() {
  assertSupabase();
  const { data, error } = await supabase
    .from("wc_slots")
    .select("id, weekday, start_time, end_time, capacity, is_open, display_order, wc_applications(count)")
    .order("display_order", { ascending: true })
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data || []).map(({ wc_applications: apps, ...s }) => ({ ...s, taken: apps?.[0]?.count || 0 }));
}

export async function createWcSlot(fields) {
  assertSupabase();
  const { error } = await supabase.from("wc_slots").insert(fields);
  if (error) throw error;
}

export async function updateWcSlot(id, fields) {
  assertSupabase();
  const { error } = await supabase
    .from("wc_slots")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWcSlot(id) {
  assertSupabase();
  const { error } = await supabase.from("wc_slots").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchWcApplications(slotId) {
  assertSupabase();
  const { data, error } = await supabase
    .from("wc_applications")
    .select("id, slot_id, first_name, last_name, phone, email, level, source, created_at")
    .eq("slot_id", slotId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminAddWcApplicant(slotId, { firstName, lastName, phone, email, level }) {
  assertSupabase();
  const { error } = await supabase.rpc("wc_admin_add", {
    p_slot_id: slotId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
    p_email: email || null,
    p_level: level,
  });
  if (error) throw error;
}

export async function moveWcApplicant(applicationId, slotId) {
  assertSupabase();
  const { error } = await supabase.rpc("wc_admin_move", { p_application_id: applicationId, p_slot_id: slotId });
  if (error) throw error;
}

export async function removeWcApplicant(id) {
  assertSupabase();
  const { error } = await supabase.from("wc_applications").delete().eq("id", id);
  if (error) throw error;
}
