import { describe, it, expect } from "vitest";
import { buildBookingConfirmation } from "../../supabase/functions/_shared/bookingEmail.ts";

const booking = {
  customer_name: "Nino <b>Beridze</b>",
  customer_email: "nino@example.com",
  booking_at: "2026-10-02T15:00:00Z", // 19:00 in Tbilisi
  hours_count: 1.5,
  tables_count: 2,
  table_ids: [7, 6],
  game_type: "pingpong",
  amount_charged: 48,
  masked_card: "444455XXXXXX1111",
  flitt_order_id: "8c1f2a90-0000-4000-8000-000000000000",
};

describe("booking confirmation email", () => {
  const email = buildBookingConfirmation(booking, "https://www.matchpoint.ge");

  it("is bilingual", () => {
    expect(email.subject).toContain("ჯავშანი დადასტურებულია");
    expect(email.subject).toContain("Booking confirmed");
    expect(email.html).toContain("Your booking is confirmed");
    expect(email.html).toContain("თქვენი ჯავშანი დადასტურებულია");
  });

  it("shows venue-local time, tables, amount and card", () => {
    expect(email.html).toContain("19:00");
    expect(email.html).toContain("Table 6, Table 7");
    expect(email.html).toContain("მაგიდა 6, მაგიდა 7");
    expect(email.html).toContain("48.00 ₾");
    expect(email.html).toContain("···· 1111");
    expect(email.html).toContain("1.5 hours");
    expect(email.html).toContain("8C1F2A90");
  });

  it("escapes customer-provided text", () => {
    expect(email.html).toContain("Hi Nino!");
    expect(email.html).not.toContain("<b>Beridze</b>");
  });

  it("falls back to a table count when tables aren't assigned", () => {
    const e = buildBookingConfirmation({ ...booking, table_ids: [], game_type: "foosball" }, "https://x");
    expect(e.html).toContain("2 tables");
    expect(e.html).toContain("Foosball");
    expect(e.text).toContain("48.00 ₾");
  });
});
