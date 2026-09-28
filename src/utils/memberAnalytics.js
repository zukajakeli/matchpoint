// Per-member playing behaviour, computed from the member's own sessions
// and visits (never from stored counters). Times are venue local time.

const VENUE_TIME_ZONE = "Asia/Tbilisi";
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// { year, month (0-11), day, weekday (0 = Sunday), hour } in venue time.
export function venueParts(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    year: Number(get("year")),
    month: Number(get("month")) - 1,
    day: Number(get("day")),
    weekday,
    hour: Number(get("hour")) % 24,
  };
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  let best = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round((seconds || 0) / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatHourRange(startHour, span = 2) {
  const pad = (h) => `${String(h % 24).padStart(2, "0")}:00`;
  return `${pad(startHour)}–${pad(startHour + span)}`;
}

// The 2-hour window that contains the most session starts.
function busiestWindow(hours, span = 2) {
  if (hours.length === 0) return null;
  let bestStart = null;
  let bestCount = 0;
  for (let start = 0; start < 24; start++) {
    const count = hours.filter((h) => (h - start + 24) % 24 < span).length;
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }
  return bestStart;
}

/**
 * @param {Array} sessions member_sessions rows (any status)
 * @param {Array} visits   member_visits rows
 * @param {number} nowMs
 */
export function computeMemberStats(sessions, visits, nowMs = Date.now()) {
  const completed = sessions.filter((s) => s.status === "completed");
  const now = venueParts(new Date(nowMs).toISOString());
  const inThisMonth = (iso) => {
    const p = venueParts(iso);
    return p.year === now.year && p.month === now.month;
  };
  const inThisYear = (iso) => venueParts(iso).year === now.year;

  const visitStarts = visits.map((v) => new Date(v.started_at).getTime()).sort((a, b) => a - b);
  const lastVisitMs = visitStarts.length ? visitStarts[visitStarts.length - 1] : null;

  const totalSeconds = completed.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const monthSeconds = completed
    .filter((s) => inThisMonth(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  const startParts = completed.map((s) => venueParts(s.started_at));
  const weekdayVisits = visits.filter((v) => {
    const d = venueParts(v.started_at).weekday;
    return d >= 1 && d <= 5;
  }).length;

  const gaps = [];
  for (let i = 1; i < visitStarts.length; i++) {
    gaps.push((visitStarts[i] - visitStarts[i - 1]) / DAY_MS);
  }

  const firstVisitMs = visitStarts[0] ?? null;
  const monthsActive = firstVisitMs
    ? Math.max(1, (nowMs - firstVisitMs) / (30.44 * DAY_MS))
    : null;

  const commonDay = mostCommon(startParts.map((p) => p.weekday));
  const commonHour = mostCommon(startParts.map((p) => p.hour));
  const windowStart = busiestWindow(startParts.map((p) => p.hour));

  return {
    visitsThisMonth: visits.filter((v) => inThisMonth(v.started_at)).length,
    visitsThisYear: visits.filter((v) => inThisYear(v.started_at)).length,
    lifetimeVisits: visits.length,
    sessionsCompleted: completed.length,
    hoursThisMonth: monthSeconds / 3600,
    lifetimeHours: totalSeconds / 3600,
    lastVisitAt: lastVisitMs ? new Date(lastVisitMs).toISOString() : null,
    daysSinceLastVisit: lastVisitMs ? Math.floor((nowMs - lastVisitMs) / DAY_MS) : null,
    mostCommonDay: commonDay === null ? null : WEEKDAY_NAMES[commonDay],
    mostCommonHour: commonHour === null ? null : `${String(commonHour).padStart(2, "0")}:00`,
    mostCommonTimeRange: windowStart === null ? null : formatHourRange(windowStart),
    weekdayVisits,
    weekendVisits: visits.length - weekdayVisits,
    averageSessionSeconds: completed.length ? totalSeconds / completed.length : null,
    averageVisitsPerMonth: monthsActive ? visits.length / monthsActive : null,
    averageDaysBetweenVisits: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    monthlyTrend: monthlyTrend(visits, completed, nowMs),
  };
}

// Last 12 months, oldest first: { key: "2026-09", label, visits, hours }.
export function monthlyTrend(visits, completedSessions, nowMs = Date.now()) {
  const now = venueParts(new Date(nowMs).toISOString());
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.year, now.month - i, 1));
    months.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
      visits: 0,
      hours: 0,
    });
  }
  const find = (iso) => {
    const p = venueParts(iso);
    return months.find((m) => m.year === p.year && m.month === p.month);
  };
  visits.forEach((v) => {
    const m = find(v.started_at);
    if (m) m.visits += 1;
  });
  completedSessions.forEach((s) => {
    const m = find(s.started_at);
    if (m) m.hours += (s.duration_seconds || 0) / 3600;
  });
  return months;
}

// Balance, lifetime points, and the next reward to aim for.
export function loyaltySummary(transactions, rewards) {
  const balance = transactions.reduce((sum, t) => sum + t.points, 0);
  const lifetime = transactions
    .filter((t) => t.kind === "earn" || t.kind === "reversal" || (t.kind === "manual" && t.points > 0))
    .reduce((sum, t) => sum + t.points, 0);
  const sorted = [...rewards].sort((a, b) => a.points_required - b.points_required);
  const available = sorted.filter((r) => r.points_required <= balance);
  const nextReward = sorted.find((r) => r.points_required > balance) || null;
  return { balance, lifetime, available, nextReward };
}

// Same rule as public.normalize_phone(): digits with the country code.
export function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `995${digits}`;
  return digits;
}

// 995555123456 → "+995 555 12 34 56"
export function formatPhone(value) {
  const digits = normalizePhone(value);
  const m = digits.match(/^995(\d{3})(\d{2})(\d{2})(\d{2})$/);
  if (m) return `+995 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  return digits ? `+${digits}` : "";
}

export const SEGMENT_LABELS = {
  new: "New",
  highly_active: "Highly active",
  regular: "Regular",
  at_risk: "At risk",
  inactive: "Inactive",
  returning: "Returning",
  one_time: "One-time",
};

export const PERIODS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: VENUE_TIME_ZONE,
  });
}
