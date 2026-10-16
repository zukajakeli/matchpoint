import { describe, it, expect } from "vitest";
import { normalizePhone, validateWcForm, slotState, weekdayName, slotTime, hhmm } from "../utils/womensClub.js";

const valid = {
  firstName: "ნინო",
  lastName: "ბერიძე",
  phone: "555 12 34 56",
  email: "nino@example.com",
  level: "beginner",
  slotId: "abc",
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
    const errors = validateWcForm({ firstName: " ", lastName: "", phone: "12", email: "x", level: "pro", slotId: "" });
    expect(errors).toEqual({
      firstName: "wc_err_required",
      lastName: "wc_err_required",
      phone: "wc_err_phone",
      email: "wc_err_email",
      level: "wc_err_level",
      slotId: "wc_err_slot",
    });
  });

  it("rejects letters in the phone number", () => {
    expect(validateWcForm({ ...valid, phone: "555 12 34 5a6" }).phone).toBe("wc_err_phone");
  });

  it("lets the admin leave the email empty but not invalid", () => {
    expect(validateWcForm({ ...valid, email: "" }, { requireEmail: false, requireSlot: false })).toEqual({});
    expect(validateWcForm({ ...valid, email: "bad" }, { requireEmail: false }).email).toBe("wc_err_email");
  });
});

describe("slots", () => {
  it("knows open, full and closed", () => {
    expect(slotState({ is_open: true, spots_left: 3 })).toBe("open");
    expect(slotState({ is_open: true, spots_left: 0 })).toBe("full");
    expect(slotState({ is_open: false, spots_left: 5 })).toBe("closed");
  });

  it("names weekdays Monday-first", () => {
    expect(weekdayName(1)).toBe("ორშაბათი");
    expect(weekdayName(7)).toBe("კვირა");
    expect(weekdayName(6, "en")).toBe("Saturday");
  });

  it("formats the time range", () => {
    expect(hhmm("19:30:00")).toBe("19:30");
    expect(slotTime({ start_time: "12:30:00", end_time: "14:00:00" })).toBe("12:30–14:00");
  });
});
