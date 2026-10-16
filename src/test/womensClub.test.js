import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  validateWcForm,
  sessionState,
  sessionParts,
  tbilisiToIso,
  isoToTbilisi,
  buildWeek,
  nextMonday,
} from "../utils/womensClub.js";

const valid = {
  firstName: "ნინო",
  lastName: "ბერიძე",
  phone: "555 12 34 56",
  email: "nino@example.com",
  level: "beginner",
  sessionId: "abc",
};

describe("normalizePhone", () => {
  it("matches the database rule", () => {
    expect(normalizePhone("555 12 34 56")).toBe("995555123456");
    expect(normalizePhone("+995 555 12-34-56")).toBe("995555123456");
    expect(normalizePhone("00995555123456")).toBe("995555123456");
    expect(normalizePhone("")).toBe("");
  });
});

describe("validateWcForm", () => {
  it("accepts a complete form", () => {
    expect(validateWcForm(valid)).toEqual({});
  });

  it("flags each missing or invalid field", () => {
    const errors = validateWcForm({ firstName: " ", lastName: "", phone: "12", email: "x", level: "pro", sessionId: "" });
    expect(errors).toEqual({
      firstName: "wc_err_required",
      lastName: "wc_err_required",
      phone: "wc_err_phone",
      email: "wc_err_email",
      level: "wc_err_level",
      sessionId: "wc_err_session",
    });
  });

  it("rejects letters in the phone number", () => {
    expect(validateWcForm({ ...valid, phone: "555 12 34 5a6" }).phone).toBe("wc_err_phone");
  });

  it("lets the admin leave the email empty but not invalid", () => {
    expect(validateWcForm({ ...valid, email: "" }, { requireEmail: false, requireSession: false })).toEqual({});
    expect(validateWcForm({ ...valid, email: "bad" }, { requireEmail: false }).email).toBe("wc_err_email");
  });
});

describe("sessions", () => {
  it("knows open, full and closed", () => {
    expect(sessionState({ is_open: true, spots_left: 3 })).toBe("open");
    expect(sessionState({ is_open: true, spots_left: 0 })).toBe("full");
    expect(sessionState({ is_open: false, spots_left: 5 })).toBe("closed");
  });

  it("formats in Tbilisi time", () => {
    // 15:30 UTC = 19:30 in Tbilisi
    expect(sessionParts("2026-10-19T15:30:00Z", "en")).toEqual({ weekday: "Monday", day: "19 October", time: "19:30" });
    expect(sessionParts("2026-10-19T15:30:00Z", "ka")).toEqual({ weekday: "ორშაბათი", day: "19 ოქტომბერი", time: "19:30" });
    // 21:00 UTC Saturday is already Sunday 01:00 in Tbilisi
    expect(sessionParts("2026-10-24T21:00:00Z", "ka")).toEqual({ weekday: "კვირა", day: "25 ოქტომბერი", time: "01:00" });
  });

  it("converts admin input to and from UTC", () => {
    expect(tbilisiToIso("2026-10-19", "19:30")).toBe("2026-10-19T15:30:00.000Z");
    expect(isoToTbilisi("2026-10-19T21:30:00Z")).toEqual({ date: "2026-10-20", time: "01:30" });
  });

  it("builds a Monday–Friday week", () => {
    const week = buildWeek("2026-10-19", [4, 0, 1, 2, 3], "19:30", 16);
    expect(week.map((s) => s.starts_at)).toEqual([
      "2026-10-19T15:30:00.000Z",
      "2026-10-20T15:30:00.000Z",
      "2026-10-21T15:30:00.000Z",
      "2026-10-22T15:30:00.000Z",
      "2026-10-23T15:30:00.000Z",
    ]);
    expect(week.every((s) => s.capacity === 16)).toBe(true);
  });

  it("finds the next Monday in Tbilisi", () => {
    expect(nextMonday(new Date("2026-10-16T10:00:00Z"))).toBe("2026-10-19"); // Friday
    expect(nextMonday(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-19"); // Monday itself
    expect(nextMonday(new Date("2026-10-18T21:00:00Z"))).toBe("2026-10-19"); // Sunday 23:00 UTC = Monday 01:00 Tbilisi
  });
});
