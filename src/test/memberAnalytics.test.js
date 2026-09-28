import { describe, it, expect } from "vitest";
import {
  computeMemberStats,
  loyaltySummary,
  normalizePhone,
  formatPhone,
  formatDuration,
  venueParts,
  eligibleRewards,
} from "../utils/memberAnalytics";

// Tbilisi is UTC+4 all year.
const tbilisi = (date, time) => new Date(`${date}T${time}:00+04:00`).toISOString();

const NOW = new Date("2026-09-28T12:00:00+04:00").getTime();

function session(date, time, minutes, status = "completed") {
  return { status, started_at: tbilisi(date, time), duration_seconds: minutes * 60 };
}

describe("venueParts", () => {
  it("reads weekday and hour in venue time, not UTC", () => {
    // 01:30 Tbilisi on Saturday is 21:30 UTC on Friday
    const p = venueParts(tbilisi("2026-09-26", "01:30"));
    expect(p.weekday).toBe(6);
    expect(p.hour).toBe(1);
  });
});

describe("computeMemberStats", () => {
  const sessions = [
    session("2026-09-25", "19:00", 90), // Fri
    session("2026-09-25", "21:00", 30), // Fri, same visit
    session("2026-09-18", "19:30", 60), // Fri
    session("2026-09-13", "15:00", 120), // Sun
    session("2026-08-02", "20:00", 60), // Sun, last month
    session("2026-09-27", "18:00", 60, "active"), // still playing: not counted
  ];
  const visits = [
    { started_at: tbilisi("2026-09-25", "19:00") },
    { started_at: tbilisi("2026-09-18", "19:30") },
    { started_at: tbilisi("2026-09-13", "15:00") },
    { started_at: tbilisi("2026-08-02", "20:00") },
  ];
  const stats = computeMemberStats(sessions, visits, NOW);

  it("counts visits, not sessions", () => {
    expect(stats.visitsThisMonth).toBe(3);
    expect(stats.visitsThisYear).toBe(4);
    expect(stats.lifetimeVisits).toBe(4);
    expect(stats.sessionsCompleted).toBe(5);
  });

  it("sums hours from completed sessions only", () => {
    expect(stats.hoursThisMonth).toBeCloseTo(5, 5); // 90+30+60+120 min
    expect(stats.lifetimeHours).toBeCloseTo(6, 5);
  });

  it("finds the usual day and time", () => {
    expect(stats.mostCommonDay).toBe("Friday");
    expect(stats.mostCommonHour).toBe("19:00");
    expect(stats.mostCommonTimeRange).toBe("19:00–21:00");
  });

  it("splits weekday and weekend visits", () => {
    expect(stats.weekdayVisits).toBe(2);
    expect(stats.weekendVisits).toBe(2);
  });

  it("reports recency and averages", () => {
    expect(stats.daysSinceLastVisit).toBe(2);
    expect(stats.averageSessionSeconds).toBe((360 * 60) / 5);
    // first → last visit spread over 3 gaps
    const spanDays =
      (new Date(tbilisi("2026-09-25", "19:00")) - new Date(tbilisi("2026-08-02", "20:00"))) / 86400000;
    expect(stats.averageDaysBetweenVisits).toBeCloseTo(spanDays / 3, 5);
  });

  it("builds a 12-month trend ending this month", () => {
    expect(stats.monthlyTrend).toHaveLength(12);
    const last = stats.monthlyTrend[11];
    expect(last.key).toBe("2026-09");
    expect(last.visits).toBe(3);
    expect(stats.monthlyTrend[10].visits).toBe(1);
  });

  it("handles a member with no history", () => {
    const empty = computeMemberStats([], [], NOW);
    expect(empty.lifetimeVisits).toBe(0);
    expect(empty.lastVisitAt).toBeNull();
    expect(empty.mostCommonDay).toBeNull();
    expect(empty.averageVisitsPerMonth).toBeNull();
  });
});

describe("loyaltySummary", () => {
  const rewards = [
    { id: "a", points_required: 100 },
    { id: "b", points_required: 500 },
    { id: "c", points_required: 300 },
  ];

  it("derives balance, lifetime and the next reward from the ledger", () => {
    const tx = [
      { kind: "earn", points: 400 },
      { kind: "earn", points: 50 },
      { kind: "reversal", points: -50 },
      { kind: "manual", points: 20 },
      { kind: "manual", points: -10 },
      { kind: "redeem", points: -100 },
    ];
    const s = loyaltySummary(tx, rewards);
    expect(s.balance).toBe(310);
    expect(s.lifetime).toBe(420);
    expect(s.available.map((r) => r.id)).toEqual(["a", "c"]);
    expect(s.nextReward.id).toBe("b");
  });

  it("has no next reward once every reward is affordable", () => {
    expect(loyaltySummary([{ kind: "earn", points: 900 }], rewards).nextReward).toBeNull();
  });
});

describe("phone numbers", () => {
  it("normalises like the database", () => {
    expect(normalizePhone("555 12 34 56")).toBe("995555123456");
    expect(normalizePhone("+995 555-12-34-56")).toBe("995555123456");
    expect(normalizePhone("00995555123456")).toBe("995555123456");
    expect(normalizePhone("+44 7700 900123")).toBe("447700900123");
  });

  it("formats Georgian mobiles for display", () => {
    expect(formatPhone("995555123456")).toBe("+995 555 12 34 56");
  });
});

describe("formatDuration", () => {
  it("prints hours and minutes", () => {
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(1500)).toBe("25m");
  });
});

describe("eligibleRewards", () => {
  const rewards = [
    { id: "drink", points_required: 100, is_active: true },
    { id: "half", points_required: 300, is_active: true, max_per_member: 1 },
    { id: "hour", points_required: 500, is_active: true },
    { id: "old", points_required: 50, is_active: true, expires_at: "2026-01-01T00:00:00Z" },
  ];
  const member = { status: "active", points_balance: 340 };

  it("lists affordable, unexpired rewards under their limit", () => {
    expect(eligibleRewards(member, rewards, {}, NOW).map((r) => r.id)).toEqual(["drink", "half"]);
  });

  it("drops rewards the member already used up", () => {
    expect(eligibleRewards(member, rewards, { half: 1 }, NOW).map((r) => r.id)).toEqual(["drink"]);
  });

  it("offers nothing to inactive members or without a known balance", () => {
    expect(eligibleRewards({ ...member, status: "suspended" }, rewards, {}, NOW)).toEqual([]);
    expect(eligibleRewards({ status: "active" }, rewards, {}, NOW)).toEqual([]);
  });
});
