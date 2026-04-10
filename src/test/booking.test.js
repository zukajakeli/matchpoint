/**
 * Unit tests for the booking system.
 *
 * These test the pure-logic functions that run in the browser (time-slot
 * generation, availability calculation, pricing, input validation) as well
 * as the server-side Edge-Function validation rules re-implemented here so
 * the same invariants can be checked without a real Supabase instance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ───── helpers extracted / mirrored from BookingPublicPage.jsx ─────────────

const TABLE_COUNT = 12;

const GAME_TYPES = [
  { value: "pingpong", label: "Ping-Pong", rate: 16 },
  { value: "foosball", label: "Foosball", rate: 12 },
  { value: "airhockey", label: "Air Hockey", rate: 12 },
  { value: "playstation", label: "PlayStation", rate: 16 },
];

const DEFAULT_VENUE_HOURS = {
  0: { open: 15, close: 24 },
  1: { open: 17, close: 24 },
  2: { open: 17, close: 24 },
  3: { open: 17, close: 24 },
  4: { open: 17, close: 24 },
  5: { open: 17, close: 24 },
  6: { open: 15, close: 24 },
};

function buildTimeSlots(selectedDate, venueHours, nowOverride) {
  const slots = [];
  const now = nowOverride ?? Date.now();
  const minLeadMs = 60 * 60 * 1000;
  const dayOfWeek = selectedDate.getDay();
  const { open = 17, close = 24 } = venueHours[dayOfWeek] || {};

  for (let h = open; h < close; h++) {
    for (const m of [0, 15, 30, 45]) {
      const slotDate = new Date(selectedDate);
      slotDate.setHours(h, m, 0, 0);
      const tooSoon = slotDate.getTime() - now < minLeadMs;
      const minutesToClose = close * 60 - (h * 60 + m);
      const tooCloseToClose = minutesToClose < 60;
      const hStr = String(h).padStart(2, "0");
      const mStr = String(m).padStart(2, "0");
      slots.push({
        value: `${hStr}:${mStr}`,
        label: `${hStr}:${mStr}`,
        disabled: tooSoon || tooCloseToClose,
        minutesToClose,
      });
    }
  }
  return slots;
}

function calculateAvailableTables(existingBookings, newStart, newEnd) {
  const booked = existingBookings.reduce((sum, b) => {
    if (!b.booking_at || !b.hours_count) return sum;
    const bStart = new Date(b.booking_at);
    const bEnd = new Date(bStart.getTime() + b.hours_count * 3600 * 1000);
    if (bStart < newEnd && bEnd > newStart) return sum + (b.tables_count || 0);
    return sum;
  }, 0);
  return Math.max(0, TABLE_COUNT - booked);
}

function calculatePrice(tablesCount, hoursCount, gameType) {
  const game = GAME_TYPES.find((g) => g.value === gameType) || GAME_TYPES[0];
  return tablesCount * hoursCount * game.rate;
}

function isQuarterHour(date) {
  return [0, 15, 30, 45].includes(date.getMinutes());
}

function validateBookingInput({
  customerName,
  customerEmail,
  customerPhone,
  tablesCount,
  hoursCount,
  bookingAt,
}) {
  const errors = [];
  if (!customerName || !customerName.trim()) errors.push("customerName is required");
  if (!customerEmail || !customerEmail.trim()) errors.push("customerEmail is required");
  if (!customerPhone || !customerPhone.trim()) errors.push("customerPhone is required");
  if (!tablesCount || tablesCount < 1) errors.push("tablesCount must be >= 1");
  if (!hoursCount || hoursCount <= 0) errors.push("hoursCount must be > 0");
  if (!bookingAt) {
    errors.push("bookingAt is required");
  } else {
    const d = new Date(bookingAt);
    if (isNaN(d.getTime())) errors.push("bookingAt is not a valid date");
    else if (!isQuarterHour(d)) errors.push("Booking time must be on quarter-hour");
    else if (d.getTime() - Date.now() < 3600000) errors.push("Must be >= 1 hour in advance");
  }
  return errors;
}

// ─── Availability / overlap helper (mirrors create_online_booking RPC) ────

function checkSlotAvailability(existingBookings, newBooking) {
  const start = new Date(newBooking.booking_at);
  const end = new Date(start.getTime() + newBooking.hours_count * 3600 * 1000);
  const twentyMinAgo = Date.now() - 20 * 60 * 1000;

  const booked = existingBookings.reduce((sum, b) => {
    if (b.is_done) return sum;
    const isPaidOrRecentPending =
      b.payment_status === "paid" ||
      (b.payment_status === "pending" && new Date(b.created_at).getTime() > twentyMinAgo);
    if (!isPaidOrRecentPending) return sum;
    if (!b.booking_at || !b.hours_count) return sum;

    const bStart = new Date(b.booking_at);
    const bEnd = new Date(bStart.getTime() + b.hours_count * 3600 * 1000);
    if (bStart < end && bEnd > start) return sum + (b.tables_count || 0);
    return sum;
  }, 0);

  return { booked, available: Math.max(0, TABLE_COUNT - booked) };
}

// ════════════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════════════

describe("Time slot generation", () => {
  it("generates slots only within venue hours for a weekday", () => {
    const monday = new Date("2026-04-13T00:00:00"); // Monday
    const farPast = new Date("2025-01-01T00:00:00").getTime();
    const slots = buildTimeSlots(monday, DEFAULT_VENUE_HOURS, farPast);

    expect(slots[0].value).toBe("17:00");
    expect(slots[slots.length - 1].value).toBe("23:45");
    expect(slots.length).toBe(7 * 4); // 17-24 = 7 hours, 4 slots/hour
  });

  it("generates earlier slots on weekends (15:00 start)", () => {
    const saturday = new Date("2026-04-11T00:00:00"); // Saturday
    const farPast = new Date("2025-01-01T00:00:00").getTime();
    const slots = buildTimeSlots(saturday, DEFAULT_VENUE_HOURS, farPast);

    expect(slots[0].value).toBe("15:00");
    expect(slots.length).toBe(9 * 4); // 15-24 = 9 hours
  });

  it("disables slots less than 1 hour from now", () => {
    const today = new Date("2026-04-13T18:30:00"); // Monday 18:30
    const now = new Date("2026-04-13T18:30:00").getTime();
    const slots = buildTimeSlots(today, DEFAULT_VENUE_HOURS, now);

    // 18:30 and 19:00 are <= 30 min from now → disabled
    // 19:15 is 45 min from now → disabled
    // 19:30 is 60 min from now → should be the first enabled (exactly 1h lead)
    const slot1830 = slots.find((s) => s.value === "18:30");
    const slot1900 = slots.find((s) => s.value === "19:00");
    const slot1930 = slots.find((s) => s.value === "19:30");

    expect(slot1830.disabled).toBe(true);
    expect(slot1900.disabled).toBe(true);
    expect(slot1930.disabled).toBe(false);
  });

  it("disables slots with less than 60 min before close", () => {
    const monday = new Date("2026-04-13T00:00:00");
    const farPast = new Date("2025-01-01T00:00:00").getTime();
    const slots = buildTimeSlots(monday, DEFAULT_VENUE_HOURS, farPast);

    // close=24; 23:00 has 60 min → NOT disabled
    // 23:15 has 45 min → disabled
    const slot2300 = slots.find((s) => s.value === "23:00");
    const slot2315 = slots.find((s) => s.value === "23:15");
    const slot2345 = slots.find((s) => s.value === "23:45");

    expect(slot2300.disabled).toBe(false);
    expect(slot2315.disabled).toBe(true);
    expect(slot2345.disabled).toBe(true);
  });

  it("returns empty slots if venue is closed all day (custom hours)", () => {
    const closedHours = { ...DEFAULT_VENUE_HOURS, 1: { open: 20, close: 20 } };
    const monday = new Date("2026-04-13T00:00:00");
    const farPast = new Date("2025-01-01T00:00:00").getTime();
    const slots = buildTimeSlots(monday, closedHours, farPast);
    expect(slots.length).toBe(0);
  });
});

describe("Pricing calculations", () => {
  it("calculates ping-pong at 16 GEL/hr", () => {
    expect(calculatePrice(1, 1, "pingpong")).toBe(16);
    expect(calculatePrice(2, 1.5, "pingpong")).toBe(48);
  });

  it("calculates foosball at 12 GEL/hr", () => {
    expect(calculatePrice(1, 1, "foosball")).toBe(12);
    expect(calculatePrice(3, 2, "foosball")).toBe(72);
  });

  it("calculates air hockey at 12 GEL/hr", () => {
    expect(calculatePrice(1, 2, "airhockey")).toBe(24);
  });

  it("calculates PlayStation at 16 GEL/hr", () => {
    expect(calculatePrice(1, 1, "playstation")).toBe(16);
  });

  it("defaults to pingpong rate for unknown game type", () => {
    expect(calculatePrice(1, 1, "unknown_game")).toBe(16);
  });

  it("handles fractional hours correctly", () => {
    expect(calculatePrice(2, 2.5, "pingpong")).toBe(80);
    expect(calculatePrice(1, 0.5, "foosball")).toBe(6);
  });
});

describe("Input validation (mirrors Edge Function rules)", () => {
  const validBase = {
    customerName: "Test User",
    customerEmail: "test@example.com",
    customerPhone: "+995555123456",
    tablesCount: 1,
    hoursCount: 1,
    bookingAt: (() => {
      const d = new Date(Date.now() + 2 * 3600 * 1000);
      d.setMinutes(0, 0, 0); // snap to quarter-hour (:00)
      return d.toISOString();
    })(),
  };

  it("passes for valid input", () => {
    const errors = validateBookingInput(validBase);
    expect(errors).toHaveLength(0);
  });

  it("requires customerName", () => {
    const errors = validateBookingInput({ ...validBase, customerName: "" });
    expect(errors).toContain("customerName is required");
  });

  it("requires customerEmail", () => {
    const errors = validateBookingInput({ ...validBase, customerEmail: "" });
    expect(errors).toContain("customerEmail is required");
  });

  it("requires customerPhone", () => {
    const errors = validateBookingInput({ ...validBase, customerPhone: null });
    expect(errors).toContain("customerPhone is required");
  });

  it("rejects tablesCount < 1", () => {
    const errors = validateBookingInput({ ...validBase, tablesCount: 0 });
    expect(errors).toContain("tablesCount must be >= 1");
  });

  it("rejects hoursCount <= 0", () => {
    const errors = validateBookingInput({ ...validBase, hoursCount: -1 });
    expect(errors).toContain("hoursCount must be > 0");
  });

  it("rejects missing bookingAt", () => {
    const errors = validateBookingInput({ ...validBase, bookingAt: null });
    expect(errors).toContain("bookingAt is required");
  });

  it("rejects invalid date string", () => {
    const errors = validateBookingInput({ ...validBase, bookingAt: "not-a-date" });
    expect(errors).toContain("bookingAt is not a valid date");
  });

  it("rejects non-quarter-hour times", () => {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    d.setMinutes(7);
    const errors = validateBookingInput({ ...validBase, bookingAt: d.toISOString() });
    expect(errors).toContain("Booking time must be on quarter-hour");
  });

  it("rejects bookings less than 1 hour from now", () => {
    const d = new Date(Date.now() + 30 * 60 * 1000); // 30 min ahead
    d.setMinutes(0); // ensure quarter-hour
    const errors = validateBookingInput({ ...validBase, bookingAt: d.toISOString() });
    expect(errors).toContain("Must be >= 1 hour in advance");
  });
});

describe("Availability & overlap detection", () => {
  const now = new Date("2026-04-13T16:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it("returns full capacity when no bookings exist", () => {
    const result = checkSlotAvailability([], {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.available).toBe(12);
    expect(result.booked).toBe(0);
  });

  it("counts overlapping paid bookings", () => {
    const existing = [
      {
        booking_at: "2026-04-13T17:00:00Z",
        hours_count: 2,
        tables_count: 3,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    // 18:00–19:00 overlaps with 17:00–19:00
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(3);
    expect(result.available).toBe(9);
  });

  it("does NOT count non-overlapping bookings", () => {
    const existing = [
      {
        booking_at: "2026-04-13T15:00:00Z",
        hours_count: 1, // 15:00–16:00
        tables_count: 5,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    // 18:00–19:00 does NOT overlap with 15:00–16:00
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(0);
    expect(result.available).toBe(12);
  });

  it("correctly handles boundary case — end of one == start of next (no overlap)", () => {
    const existing = [
      {
        booking_at: "2026-04-13T17:00:00Z",
        hours_count: 1, // 17:00–18:00
        tables_count: 4,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    // 18:00–19:00 starts exactly when previous ends → NO overlap
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(0);
    expect(result.available).toBe(12);
  });

  it("counts recent pending bookings (< 20 min old)", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 2,
        payment_status: "pending",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(), // 5 min ago
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(2);
  });

  it("ignores stale pending bookings (> 20 min old)", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 2,
        payment_status: "pending",
        is_done: false,
        created_at: new Date(now - 25 * 60000).toISOString(), // 25 min ago
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(0);
  });

  it("ignores done bookings", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 5,
        payment_status: "paid",
        is_done: true,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(0);
  });

  it("rejects booking when tables would exceed capacity", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 2,
        tables_count: 10,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 3,
    });
    expect(result.booked).toBe(10);
    expect(result.available).toBe(2);
    // Would need 3 but only 2 available → caller should reject
    expect(result.available < 3).toBe(true);
  });

  it("sums overlapping bookings from multiple users", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 3,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 2,
        tables_count: 4,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 3 * 60000).toISOString(),
      },
      {
        booking_at: "2026-04-13T17:30:00Z",
        hours_count: 1,
        tables_count: 2,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 10 * 60000).toISOString(),
      },
    ];
    // 18:00–19:00 overlaps with all three (17:30-18:30 overlaps too)
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(9);
    expect(result.available).toBe(3);
  });

  it("handles exactly 12 tables booked (fully booked slot)", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 12,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.available).toBe(0);
  });

  it("ignores failed payment status bookings", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 5,
        payment_status: "failed",
        is_done: false,
        created_at: new Date(now - 5 * 60000).toISOString(),
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 1,
    });
    expect(result.booked).toBe(0);
    expect(result.available).toBe(12);
  });
});

describe("Simple availability calculator (used by frontend soft check)", () => {
  it("works with no bookings", () => {
    const start = new Date("2026-04-13T18:00:00Z");
    const end = new Date("2026-04-13T19:00:00Z");
    expect(calculateAvailableTables([], start, end)).toBe(12);
  });

  it("subtracts overlapping bookings", () => {
    const bookings = [
      { booking_at: "2026-04-13T17:00:00Z", hours_count: 2, tables_count: 4 },
    ];
    const start = new Date("2026-04-13T18:00:00Z");
    const end = new Date("2026-04-13T19:00:00Z");
    expect(calculateAvailableTables(bookings, start, end)).toBe(8);
  });

  it("never returns negative", () => {
    const bookings = [
      { booking_at: "2026-04-13T18:00:00Z", hours_count: 1, tables_count: 15 }, // theoretically over 12
    ];
    const start = new Date("2026-04-13T18:00:00Z");
    const end = new Date("2026-04-13T19:00:00Z");
    expect(calculateAvailableTables(bookings, start, end)).toBe(0);
  });

  it("handles bookings with null booking_at gracefully", () => {
    const bookings = [
      { booking_at: null, hours_count: 1, tables_count: 4 },
    ];
    const start = new Date("2026-04-13T18:00:00Z");
    const end = new Date("2026-04-13T19:00:00Z");
    expect(calculateAvailableTables(bookings, start, end)).toBe(12);
  });
});

describe("Quarter-hour validation", () => {
  it("accepts :00, :15, :30, :45", () => {
    expect(isQuarterHour(new Date("2026-04-13T18:00:00Z"))).toBe(true);
    expect(isQuarterHour(new Date("2026-04-13T18:15:00Z"))).toBe(true);
    expect(isQuarterHour(new Date("2026-04-13T18:30:00Z"))).toBe(true);
    expect(isQuarterHour(new Date("2026-04-13T18:45:00Z"))).toBe(true);
  });

  it("rejects non-quarter-hour minutes", () => {
    expect(isQuarterHour(new Date("2026-04-13T18:07:00Z"))).toBe(false);
    expect(isQuarterHour(new Date("2026-04-13T18:22:00Z"))).toBe(false);
    expect(isQuarterHour(new Date("2026-04-13T18:59:00Z"))).toBe(false);
    expect(isQuarterHour(new Date("2026-04-13T18:01:00Z"))).toBe(false);
  });
});

describe("Edge case: concurrent booking race conditions", () => {
  const now = new Date("2026-04-13T16:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it("two simultaneous bookings that together exceed capacity", () => {
    // Simulates: 2 users both see 12 available, each try to book 7
    // The slot check should show that after the first goes through,
    // only 5 remain for the second
    const afterFirst = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 7,
        payment_status: "pending",
        is_done: false,
        created_at: new Date(now).toISOString(),
      },
    ];

    const result = checkSlotAvailability(afterFirst, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 7,
    });

    expect(result.available).toBe(5);
    expect(result.available < 7).toBe(true); // second user's 7 doesn't fit
  });

  it("mixed pending + paid bookings in same slot", () => {
    const existing = [
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 5,
        payment_status: "paid",
        is_done: false,
        created_at: new Date(now - 60000).toISOString(),
      },
      {
        booking_at: "2026-04-13T18:00:00Z",
        hours_count: 1,
        tables_count: 3,
        payment_status: "pending",
        is_done: false,
        created_at: new Date(now - 60000).toISOString(), // 1 min ago
      },
    ];
    const result = checkSlotAvailability(existing, {
      booking_at: "2026-04-13T18:00:00Z",
      hours_count: 1,
      tables_count: 5,
    });
    expect(result.booked).toBe(8);
    expect(result.available).toBe(4);
  });
});

describe("Duration-to-close filtering", () => {
  it("filters durations that don't fit before close", () => {
    const DURATIONS = [
      { value: 1, label: "1 hour" },
      { value: 1.5, label: "1.5 hours" },
      { value: 2, label: "2 hours" },
      { value: 2.5, label: "2.5 hours" },
      { value: 3, label: "3 hours" },
    ];

    // 22:00 slot, close at 24 → 120 min to close
    const minutesToClose = 120;
    const available = DURATIONS.filter((d) => d.value * 60 <= minutesToClose);
    expect(available.map((d) => d.value)).toEqual([1, 1.5, 2]);

    // 23:00 → 60 min to close
    const available2 = DURATIONS.filter((d) => d.value * 60 <= 60);
    expect(available2.map((d) => d.value)).toEqual([1]);
  });
});
