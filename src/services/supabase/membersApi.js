import { supabase } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";

// Club membership & loyalty. Everything that changes sessions, visits or
// points goes through a database function so the ledger stays consistent;
// see section 6 of supabase/schema.sql.

export const BRANCH_ID = import.meta.env.VITE_BRANCH_ID || "main";

// Database errors are raised as CODE or CODE:detail — turn them into text
// reception staff can act on.
const ERROR_MESSAGES = {
  NOT_ALLOWED: "You don't have permission to do that.",
  NAME_REQUIRED: "First and last name are required.",
  PERSONAL_ID_REQUIRED: "Personal ID number is required.",
  INVALID_PHONE: "Enter a valid phone number.",
  DUPLICATE_PHONE: "A member with this phone number already exists",
  DUPLICATE_EMAIL: "A member with this email already exists",
  MEMBER_NOT_FOUND: "Member not found.",
  MEMBER_NOT_ACTIVE: "This membership isn't active.",
  SESSION_NOT_FOUND: "Session not found.",
  SESSION_CANCELLED: "This session was cancelled.",
  INVALID_TIMES: "End time must be after start time.",
  POINTS_REQUIRED: "Enter a non-zero number of points.",
  REASON_REQUIRED: "A reason is required.",
  REWARD_NOT_AVAILABLE: "This reward isn't available.",
  REWARD_LIMIT_REACHED: "This member has already used this reward the maximum number of times.",
  NOT_ENOUGH_POINTS: "Not enough points for this reward.",
};

export function memberErrorMessage(error) {
  const message = error?.message || String(error || "");
  const match = message.match(/([A-Z_]{4,})(?::\s*(\S+))?/);
  if (match && ERROR_MESSAGES[match[1]]) {
    return match[2] ? `${ERROR_MESSAGES[match[1]]} (${match[2]}).` : ERROR_MESSAGES[match[1]];
  }
  if (error?.code === "23505") return "That phone number or email is already used by another member.";
  return "Something went wrong. Please try again.";
}

async function rpc(name, params) {
  assertSupabase();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

// ── Reception ─────────────────────────────────────────────────────────
export function findMembers(query) {
  return rpc("find_members", { p_query: query });
}

export function registerMember({ firstName, lastName, phone, email, personalId }) {
  return rpc("register_member", {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
    p_email: email || null,
    p_personal_id: personalId || null,
    p_branch_id: BRANCH_ID,
  });
}

// ── Timer integration ────────────────────────────────────────────────
export function startMemberSession({ memberId, table, startedAt, purchasedSeconds }) {
  return rpc("start_member_session", {
    p_member_id: memberId,
    p_table_id: table.id,
    p_table_name: table.name,
    p_game_type: table.gameType,
    p_session_type: table.timerMode === "countdown" ? "countdown" : "standard",
    p_started_at: new Date(startedAt || Date.now()).toISOString(),
    p_purchased_seconds: purchasedSeconds ?? null,
    p_branch_id: BRANCH_ID,
  });
}

export function updateMemberSessionTimer({ sessionId, table }) {
  return rpc("update_member_session_timer", {
    p_session_id: sessionId,
    p_table_id: table.id,
    p_table_name: table.name,
    p_session_type: table.timerMode === "countdown" ? "countdown" : "standard",
    p_purchased_seconds:
      table.timerMode === "countdown" ? Math.round(table.initialCountdownSeconds || 0) : null,
  });
}

export function completeMemberSession({ sessionId, endedAt, durationSeconds, amount }) {
  return rpc("complete_member_session", {
    p_session_id: sessionId,
    p_ended_at: new Date(endedAt).toISOString(),
    p_duration_seconds: Math.round(durationSeconds),
    p_rental_amount: amount,
    p_amount_paid: amount,
  });
}

// Pay & Clear when the session was never opened on the server (offline start).
export function recordMemberSession({ memberId, table, startedAt, endedAt, durationSeconds, amount }) {
  return rpc("record_member_session", {
    p_member_id: memberId,
    p_table_id: table.id,
    p_table_name: table.name,
    p_game_type: table.gameType,
    p_session_type: table.timerMode === "countdown" ? "countdown" : "standard",
    p_started_at: new Date(startedAt).toISOString(),
    p_ended_at: new Date(endedAt).toISOString(),
    p_duration_seconds: Math.round(durationSeconds),
    p_purchased_seconds:
      table.timerMode === "countdown" ? Math.round(table.initialCountdownSeconds || 0) : null,
    p_rental_amount: amount,
    p_amount_paid: amount,
    p_branch_id: BRANCH_ID,
  });
}

export function reassignMemberSession(sessionId, memberId) {
  return rpc("reassign_member_session", { p_session_id: sessionId, p_member_id: memberId });
}

export function cancelMemberSession(sessionId, reason) {
  return rpc("cancel_member_session", { p_session_id: sessionId, p_reason: reason || null });
}

export function adminSaveMemberSession({
  sessionId,
  memberId,
  tableId,
  tableName,
  startedAt,
  endedAt,
  amountPaid,
  reason,
}) {
  return rpc("admin_save_member_session", {
    p_session_id: sessionId || null,
    p_member_id: memberId,
    p_table_id: tableId ?? null,
    p_table_name: tableName || null,
    p_started_at: new Date(startedAt).toISOString(),
    p_ended_at: new Date(endedAt).toISOString(),
    p_amount_paid: Number(amountPaid) || 0,
    p_rental_amount: null,
    p_duration_seconds: null,
    p_branch_id: BRANCH_ID,
    p_reason: reason || null,
  });
}

// ── Points & rewards ─────────────────────────────────────────────────
export function adjustMemberPoints(memberId, points, reason) {
  return rpc("adjust_member_points", { p_member_id: memberId, p_points: points, p_reason: reason });
}

export function redeemReward(memberId, rewardId, note) {
  return rpc("redeem_reward", { p_member_id: memberId, p_reward_id: rewardId, p_note: note || null });
}

export async function fetchRewards({ includeInactive = false } = {}) {
  assertSupabase();
  let query = supabase
    .from("rewards")
    .select("id, name, description, points_required, is_active, expires_at, limitations, max_per_member, display_order")
    .order("points_required", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveReward(reward) {
  assertSupabase();
  const payload = {
    name: reward.name.trim(),
    description: reward.description?.trim() || null,
    points_required: Number(reward.points_required),
    is_active: Boolean(reward.is_active),
    expires_at: reward.expires_at || null,
    limitations: reward.limitations?.trim() || null,
    max_per_member: reward.max_per_member ? Number(reward.max_per_member) : null,
    updated_at: new Date().toISOString(),
  };
  const query = reward.id
    ? supabase.from("rewards").update(payload).eq("id", reward.id)
    : supabase.from("rewards").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteReward(id) {
  assertSupabase();
  const { error } = await supabase.from("rewards").delete().eq("id", id);
  if (error) throw error;
}

// ── Member database & profile ────────────────────────────────────────
export function fetchMemberDirectory(period = "month") {
  return rpc("member_directory", { p_period: period });
}

export async function fetchMemberProfile(memberId) {
  assertSupabase();
  const [member, sessions, visits, transactions, redemptions] = await Promise.all([
    supabase.from("members").select("*").eq("id", memberId).single(),
    supabase
      .from("member_sessions")
      .select("*")
      .eq("member_id", memberId)
      .order("started_at", { ascending: false }),
    supabase
      .from("member_visits")
      .select("id, branch_id, started_at, ended_at")
      .eq("member_id", memberId)
      .order("started_at", { ascending: false }),
    supabase
      .from("point_transactions")
      .select("id, points, kind, reason, created_at, session_id, redemption_id")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reward_redemptions")
      .select("id, reward_name, points_deducted, note, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [member, sessions, visits, transactions, redemptions]) {
    if (result.error) throw result.error;
  }
  return {
    member: member.data,
    sessions: sessions.data || [],
    visits: visits.data || [],
    transactions: transactions.data || [],
    redemptions: redemptions.data || [],
  };
}

export async function updateMember(memberId, fields) {
  assertSupabase();
  const { data, error } = await supabase
    .from("members")
    .update({
      first_name: fields.first_name,
      last_name: fields.last_name,
      phone: fields.phone,
      email: fields.email || null,
      personal_id: fields.personal_id || null,
      status: fields.status,
      notes: fields.notes || null,
    })
    .eq("id", memberId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Settings, analytics, audit ───────────────────────────────────────
export async function fetchLoyaltySettings() {
  assertSupabase();
  const { data, error } = await supabase
    .from("loyalty_settings")
    .select("points_rules, visit_gap_minutes, segments, require_personal_id, updated_at")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

export async function saveLoyaltySettings(settings) {
  assertSupabase();
  const { data, error } = await supabase
    .from("loyalty_settings")
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("points_rules, visit_gap_minutes, segments, require_personal_id, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export function fetchClubAnalytics() {
  return rpc("club_analytics", {});
}

export async function fetchAuditLog({ limit = 200, entity } = {}) {
  assertSupabase();
  let query = supabase
    .from("audit_log")
    .select("id, created_at, actor_email, action, entity, entity_id, old_data, new_data")
    .order("id", { ascending: false })
    .limit(limit);
  if (entity) query = query.eq("entity", entity);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Member website account ───────────────────────────────────────────
export function claimMemberAccount() {
  return rpc("claim_member_account", {});
}
