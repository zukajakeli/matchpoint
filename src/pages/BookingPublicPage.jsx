import React, { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../services/supabaseClient";
import { loadVenueHours, DAY_NAMES } from "../utils/venueHours";
import "./BookingPublicPage.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const TABLE_COUNT = 12;

const GAME_TYPES = [
  { value: "pingpong", label: "Ping-Pong", rate: 16 },
  { value: "foosball", label: "Foosball", rate: 12 },
  { value: "airhockey", label: "Air Hockey", rate: 12 },
  { value: "playstation", label: "PlayStation", rate: 16 },
];

const DURATIONS = [
  { value: 1, label: "1 hour" },
  { value: 1.5, label: "1.5 hours" },
  { value: 2, label: "2 hours" },
  { value: 2.5, label: "2.5 hours" },
  { value: 3, label: "3 hours" },
];

// Build quarter-hour time slots for a given Date using the per-day venue hours.
// A slot is disabled if:
//   - it is less than 1 hour from now (lead time), OR
//   - it has fewer than 60 minutes before venue close (can't fit minimum booking)
function buildTimeSlots(selectedDate, venueHours) {
  const slots = [];
  const now = Date.now();
  const minLeadMs = 60 * 60 * 1000;
  const dayOfWeek = selectedDate.getDay();
  const { open = 17, close = 24 } = venueHours[dayOfWeek] || {};

  for (let h = open; h < close; h++) {
    for (const m of [0, 15, 30, 45]) {
      const slotDate = new Date(selectedDate);
      slotDate.setHours(h, m, 0, 0);
      const tooSoon = slotDate.getTime() - now < minLeadMs;
      // minutes remaining from this slot until venue close
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

// Use LOCAL date components to avoid UTC-offset shifting the date string.
function buildDateOptions() {
  const options = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    options.push({
      value: `${y}-${mo}-${dy}`,
      label:
        i === 0
          ? "Today"
          : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return options;
}

// Soft availability check — not authoritative; Edge Function does the final lock.
async function checkAvailability(bookingAtISO, hoursCount) {
  if (!isSupabaseConfigured || !supabase) return TABLE_COUNT;
  const start = new Date(bookingAtISO);
  const end = new Date(start.getTime() + hoursCount * 3600 * 1000);

  const { data, error } = await supabase
    .from("bookings")
    .select("tables_count, booking_at, hours_count")
    .eq("is_done", false)
    .in("payment_status", ["paid", "pending"]);

  if (error || !data) return TABLE_COUNT;

  const booked = data.reduce((sum, b) => {
    if (!b.booking_at || !b.hours_count) return sum;
    const bStart = new Date(b.booking_at);
    const bEnd = new Date(bStart.getTime() + b.hours_count * 3600 * 1000);
    if (bStart < end && bEnd > start) return sum + (b.tables_count || 0);
    return sum;
  }, 0);

  return Math.max(0, TABLE_COUNT - booked);
}

export default function BookingPublicPage() {
  const venueHours = loadVenueHours();
  const dateOptions = buildDateOptions();

  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [selectedTime, setSelectedTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [tablesCount, setTablesCount] = useState(1);
  const [gameType, setGameType] = useState("pingpong");
  const [availableTables, setAvailableTables] = useState(TABLE_COUNT);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Parse the selected date as LOCAL midnight to avoid UTC-offset issues
  const selectedDateObj = selectedDate
    ? new Date(selectedDate + "T00:00:00")
    : new Date();

  const timeSlots = buildTimeSlots(selectedDateObj, venueHours);

  const dayOfWeek = selectedDateObj.getDay();
  const { open: openHour = 17, close: closeHour = 24 } = venueHours[dayOfWeek] || {};
  const closeLabel = closeHour === 24 ? "midnight" : `${String(closeHour).padStart(2, "0")}:00`;

  // Auto-select first available time when date changes
  useEffect(() => {
    const firstAvailable = timeSlots.find((s) => !s.disabled);
    setSelectedTime(firstAvailable?.value || "");
  }, [selectedDate]);

  // If the selected duration no longer fits the chosen slot, reset to the largest that fits
  useEffect(() => {
    if (availableDurations.length > 0 && !availableDurations.find((d) => d.value === duration)) {
      setDuration(availableDurations[availableDurations.length - 1].value);
    }
  }, [selectedTime]);

  // Soft availability check whenever slot or duration changes
  useEffect(() => {
    if (!selectedDate || !selectedTime) return;
    const bookingAt = `${selectedDate}T${selectedTime}:00`;
    setAvailabilityLoading(true);
    checkAvailability(bookingAt, duration).then((n) => {
      setAvailableTables(n);
      if (tablesCount > n) setTablesCount(Math.max(1, n));
      setAvailabilityLoading(false);
    });
  }, [selectedDate, selectedTime, duration]);

  const selectedGame = GAME_TYPES.find((g) => g.value === gameType) || GAME_TYPES[0];
  const totalGel = tablesCount * duration * selectedGame.rate;

  // Only show durations that fit before venue close for the selected time slot
  const selectedSlot = timeSlots.find((s) => s.value === selectedTime);
  const minutesToClose = selectedSlot?.minutesToClose ?? 60;
  const availableDurations = DURATIONS.filter((d) => d.value * 60 <= minutesToClose);

  const handleProceedToDetails = (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) return;
    if (availableTables < 1) return;
    setStep(2);
  };

  const handlePayment = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      setIsSubmitting(true);
      setSubmitError("");

      const bookingAt = `${selectedDate}T${selectedTime}:00`;
      const origin = window.location.origin;

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            customerName: name.trim(),
            customerEmail: email.trim(),
            customerPhone: phone.trim(),
            tablesCount: Number(tablesCount),
            hoursCount: Number(duration),
            bookingAt,
            gameType,
            responseUrl: `${origin}/book/success`,
            cancelUrl: `${origin}/book/cancelled`,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setSubmitError(json.error || "Something went wrong. Please try again.");
          setIsSubmitting(false);
          return;
        }

        sessionStorage.setItem("mp_flitt_order_id", json.flittOrderId);
        window.location.href = json.checkoutUrl;
      } catch {
        setSubmitError("Network error. Please check your connection and try again.");
        setIsSubmitting(false);
      }
    },
    [isSubmitting, selectedDate, selectedTime, name, email, phone, tablesCount, duration, gameType]
  );

  return (
    <div className="booking-public-page">
      <header className="booking-public-header">
        <a href="/book" className="booking-public-logo">
          <img src="/matchpoint-logo.png" alt={VENUE_NAME} />
          <span>{VENUE_NAME}</span>
        </a>
      </header>

      <main className="booking-public-main">
        <div className="booking-public-card">
          <h1>Book a Table</h1>
          <p className="booking-public-subtitle">
            Reserve your spot online and pay securely.
            Open {String(openHour).padStart(2, "0")}:00 – {closeLabel} on {DAY_NAMES[dayOfWeek]}s.
          </p>

          {/* Step indicators */}
          <div className="booking-steps">
            <div className={`booking-step ${step >= 1 ? "active" : ""}`}>
              <span>1</span> Slot
            </div>
            <div className="booking-step-divider" />
            <div className={`booking-step ${step >= 2 ? "active" : ""}`}>
              <span>2</span> Details
            </div>
            <div className="booking-step-divider" />
            <div className={`booking-step ${step >= 3 ? "active" : ""}`}>
              <span>3</span> Payment
            </div>
          </div>

          {step === 1 && (
            <form onSubmit={handleProceedToDetails} className="booking-form-grid">
              {/* Date */}
              <div className="booking-field">
                <label>Date</label>
                <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
                  {dateOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time */}
              <div className="booking-field">
                <label>Start Time</label>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select time
                  </option>
                  {timeSlots.map((s) => (
                    <option key={s.value} value={s.value} disabled={s.disabled}>
                      {s.label}
                      {s.disabled ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Duration */}
              <div className="booking-field">
                <label>Duration</label>
                <div className="booking-chip-group">
                  {availableDurations.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      className={`booking-chip ${duration === d.value ? "selected" : ""}`}
                      onClick={() => setDuration(d.value)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Game type */}
              <div className="booking-field">
                <label>Game Type</label>
                <div className="booking-chip-group">
                  {GAME_TYPES.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      className={`booking-chip ${gameType === g.value ? "selected" : ""}`}
                      onClick={() => setGameType(g.value)}
                    >
                      {g.label}
                      <small>{g.rate} ₾/hr</small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tables count */}
              <div className="booking-field">
                <label>
                  Number of Tables
                  {availabilityLoading ? (
                    <span className="availability-tag loading">Checking…</span>
                  ) : (
                    <span className={`availability-tag ${availableTables > 0 ? "available" : "full"}`}>
                      {availableTables} available
                    </span>
                  )}
                </label>
                <div className="booking-chip-group">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`booking-chip ${tablesCount === n ? "selected" : ""} ${n > availableTables ? "disabled" : ""}`}
                      disabled={n > availableTables}
                      onClick={() => setTablesCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price preview */}
              <div className="booking-price-preview">
                <div className="booking-price-row">
                  <span>
                    {tablesCount} table{tablesCount > 1 ? "s" : ""} × {duration}h × {selectedGame.rate} ₾/hr
                  </span>
                  <span className="booking-price-total">{totalGel} ₾</span>
                </div>
              </div>

              {availableTables === 0 && (
                <p className="booking-no-avail">
                  No tables available for this slot. Please choose a different time.
                </p>
              )}

              <button
                type="submit"
                className="booking-cta-btn"
                disabled={!selectedTime || availableTables === 0}
              >
                Continue →
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handlePayment} className="booking-form-grid">
              <div className="booking-summary-box">
                <p>
                  <strong>{selectedGame.label}</strong> · {tablesCount} table
                  {tablesCount > 1 ? "s" : ""} · {duration}h · {selectedDate} at {selectedTime}
                </p>
                <p className="booking-summary-price">{totalGel} ₾</p>
                <button type="button" className="booking-edit-btn" onClick={() => setStep(1)}>
                  ← Edit slot
                </button>
              </div>

              <div className="booking-field">
                <label>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              <div className="booking-field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="booking-field">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+995 5xx xxx xxx"
                  required
                />
              </div>

              {submitError && <p className="booking-submit-error">{submitError}</p>}

              <button type="submit" className="booking-cta-btn" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" /> Redirecting to payment…
                  </>
                ) : (
                  `Pay ${totalGel} ₾ →`
                )}
              </button>

              <p className="booking-secure-note">
                Secured by Flitt · Your card data never touches our servers
              </p>
            </form>
          )}
        </div>
      </main>

      <footer className="booking-public-footer">
        © {new Date().getFullYear()} {VENUE_NAME}
      </footer>
    </div>
  );
}
