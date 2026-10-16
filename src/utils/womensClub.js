// Women's Social Club helpers shared by the public page and the admin.
// Validation mirrors wc_add_application() in supabase/schema.sql so most
// mistakes are caught before the request is sent.

const LEVELS = ["never", "beginner", "intermediate", "advanced"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

// Same rule as public.normalize_phone(): digits only, 00 prefix dropped,
// a 9-digit Georgian number gets 995 in front.
export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 9) return `995${digits}`;
  return digits;
}

export function validateWcForm(form, { requireEmail = true, requireSlot = true } = {}) {
  const errors = {};
  const first = String(form.firstName || "").trim();
  const last = String(form.lastName || "").trim();
  if (!first || first.length > 80) errors.firstName = "wc_err_required";
  if (!last || last.length > 80) errors.lastName = "wc_err_required";
  const phone = normalizePhone(form.phone);
  if (phone.length < 8 || phone.length > 15 || !/^[+\d\s()-]+$/.test(String(form.phone || "").trim())) {
    errors.phone = "wc_err_phone";
  }
  const email = String(form.email || "").trim();
  if ((requireEmail || email) && (!EMAIL_RE.test(email) || email.length > 200)) errors.email = "wc_err_email";
  if (!LEVELS.includes(form.level)) errors.level = "wc_err_level";
  if (requireSlot && !form.slotId) errors.slotId = "wc_err_slot";
  return errors;
}

export function slotState(slot) {
  if (!slot.is_open) return "closed";
  if (slot.spots_left <= 0) return "full";
  return "open";
}

// weekday: 1 = Monday … 7 = Sunday (ISO, as stored in wc_slots)
export const WEEKDAY_NAMES = {
  ka: ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი", "კვირა"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

export function weekdayName(weekday, lang = "ka") {
  return (WEEKDAY_NAMES[lang] || WEEKDAY_NAMES.ka)[weekday - 1] || "";
}

// "19:30:00" → "19:30"
export function hhmm(time) {
  return String(time || "").slice(0, 5);
}

export function slotTime(slot) {
  return `${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`;
}
