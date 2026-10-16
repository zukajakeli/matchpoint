// Women's Social Club helpers shared by the public page and the admin.
// Validation mirrors wc_add_registration() in supabase/schema.sql so most
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

export function validateWcForm(form, { requireEmail = true, requireSession = true } = {}) {
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
  if (requireSession && !form.sessionId) errors.sessionId = "wc_err_session";
  return errors;
}

export function sessionState(session) {
  if (!session.is_open) return "closed";
  if (session.spots_left <= 0) return "full";
  return "open";
}

// Georgian names are spelled out: not every phone browser ships Georgian
// date data, and Intl then silently falls back to English.
const KA_WEEKDAYS = ["კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი"];
const KA_MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// { weekday: "ორშაბათი", day: "20 ოქტომბერი", time: "19:30" } in Tbilisi time
export function sessionParts(startsAt, lang = "ka") {
  const local = new Date(new Date(startsAt).getTime() + 4 * 3600 * 1000); // UTC+4, no DST
  const weekdays = lang === "ka" ? KA_WEEKDAYS : EN_WEEKDAYS;
  const months = lang === "ka" ? KA_MONTHS : EN_MONTHS;
  return {
    weekday: weekdays[local.getUTCDay()],
    day: `${local.getUTCDate()} ${months[local.getUTCMonth()]}`,
    time: local.toISOString().slice(11, 16),
  };
}

// "19:30–21:00" (or just "19:30" without an end time)
export function timeRange(startsAt, endsAt) {
  const start = sessionParts(startsAt, "en").time;
  return endsAt ? `${start}–${sessionParts(endsAt, "en").time}` : start;
}

// weekday 1 = Monday … 7 = Sunday (womens_club_slots)
const KA_WEEKDAYS_MON = ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი", "კვირა"];
const EN_WEEKDAYS_MON = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function weekdayName(weekday, lang = "en") {
  return (lang === "ka" ? KA_WEEKDAYS_MON : EN_WEEKDAYS_MON)[weekday - 1] || "";
}

// Admin: local Tbilisi date + time → ISO timestamp. Georgia is UTC+4 all
// year (no daylight saving).
export function tbilisiToIso(date, time) {
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

export function isoToTbilisi(iso) {
  const d = new Date(new Date(iso).getTime() + 4 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

// Sessions for one week: weekStart is the Monday (YYYY-MM-DD), days are
// 0 = Monday … 6 = Sunday.
export function buildWeek(weekStart, days, time, capacity) {
  const [y, m, d] = weekStart.split("-").map(Number);
  return [...days]
    .sort((a, b) => a - b)
    .map((offset) => {
      const day = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
      return { starts_at: tbilisiToIso(day, time), capacity };
    });
}

// The Monday on or after today (Tbilisi), as YYYY-MM-DD
export function nextMonday(now = new Date()) {
  const { date } = isoToTbilisi(now.toISOString());
  const [y, m, d] = date.split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const add = (8 - today.getUTCDay()) % 7;
  return new Date(Date.UTC(y, m - 1, d + add)).toISOString().slice(0, 10);
}
