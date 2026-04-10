// src/components/StartModal.jsx
import React, { useEffect, useState, useMemo } from "react";
import "./StartModal.css";
import StartModalContentFields from "./start-modal/StartModalContentFields";

// Check if starting this timer would overlap with any upcoming paid booking.
// Returns an array of conflicting bookings (empty = no conflict).
function getConflictingBookings(table, mode, durationMinutes, upcomingBookings) {
  if (!upcomingBookings || upcomingBookings.length === 0) return [];

  // Estimate when this session would end
  const now = Date.now();
  // For standard mode, assume 2 hours; for countdown, use the selected duration
  const estimatedDurationMs =
    mode === "countdown" && durationMinutes > 0
      ? durationMinutes * 60 * 1000
      : 2 * 60 * 60 * 1000;
  const estimatedEnd = now + estimatedDurationMs;

  // Find bookings for this game type that start before our estimated end
  return upcomingBookings.filter((b) => {
    if (!b.booking_at) return false;
    const bookingStart = new Date(b.booking_at).getTime();
    // If booking is in the past, ignore
    if (bookingStart < now) return false;
    // If the booking starts before our timer would end, it's a potential conflict
    if (bookingStart >= estimatedEnd) return false;
    // Match game type (if booking specifies one)
    if (b.game_type && b.game_type !== table.gameType && table.gameType !== "custom") return false;
    return true;
  });
}

function formatBookingTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const StartModal = ({ table, isOpen, onClose, onStart, upcomingBookings }) => {
  const isFoosOrHockey = table?.gameType === 'foosball' || table?.gameType === 'airhockey';
  const isPlayStation = table?.gameType === "playstation";
  const isCustomTimer = table?.gameType === "custom";
  const isPingPong = table?.gameType === "pingpong";
  const [mode, setMode] = useState("countdown"); // 'standard' or 'countdown'
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [fitPass, setFitPass] = useState(false);
  const [extraEquipment, setExtraEquipment] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHourlyRate, setCustomHourlyRate] = useState("");
  const [validationError, setValidationError] = useState("");
  const [overrideWarning, setOverrideWarning] = useState(false);
  const [linkedBookingId, setLinkedBookingId] = useState("");

  // Bookings that match this table's game type (for linking)
  const matchingBookings = useMemo(() => {
    if (!upcomingBookings?.length || !table) return [];
    return upcomingBookings.filter((b) => {
      if (!b.booking_at) return false;
      if (b.game_type && b.game_type !== table.gameType && table.gameType !== "custom") return false;
      return true;
    });
  }, [upcomingBookings, table]);

  const conflicts = useMemo(
    () => (table && isOpen ? getConflictingBookings(table, mode, durationMinutes, upcomingBookings) : []),
    [table, isOpen, mode, durationMinutes, upcomingBookings]
  );

  // When a booking is selected, auto-fill duration
  useEffect(() => {
    if (!linkedBookingId) return;
    const booking = matchingBookings.find((b) => b.id === linkedBookingId);
    if (booking?.hours_count) {
      setMode("countdown");
      setDurationMinutes(booking.hours_count * 60);
    }
  }, [linkedBookingId, matchingBookings]);

  useEffect(() => {
    if (!table || !isOpen) return;
    setMode("countdown");
    setDurationMinutes(60);
    setFitPass(false);
    setExtraEquipment(false);
    setCustomName(isCustomTimer ? (table.name === "Blank Timer" ? "" : table.name || "") : table.name || "");
    setCustomHourlyRate(
      typeof table.hourlyRate === "number" && table.hourlyRate > 0
        ? String(table.hourlyRate)
        : ""
    );
    setValidationError("");
    setOverrideWarning(false);
    setLinkedBookingId("");
  }, [table, isOpen, isCustomTimer]);

  if (!isOpen) return null;

  const handleStart = () => {
    if (isCustomTimer) {
      const trimmedName = customName.trim();
      const parsedRate = parseFloat(customHourlyRate);
      if (!trimmedName) {
        setValidationError("Please enter a timer name.");
        return;
      }
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        setValidationError("Please enter a valid hourly rate.");
        return;
      }
    }

    // If there are conflicts and no booking is linked and staff hasn't acknowledged, warn
    if (conflicts.length > 0 && !linkedBookingId && !overrideWarning) {
      setOverrideWarning(true);
      return;
    }

    const customOptions = isCustomTimer
      ? {
          customName: customName.trim(),
          customHourlyRate: parseFloat(customHourlyRate),
        }
      : isPlayStation
      ? { customHourlyRate: 20 }
      : {};

    onStart(
      table.id,
      mode,
      mode === "countdown" ? parseInt(durationMinutes, 10) : null,
      {
        fitPass: isFoosOrHockey || isPlayStation || isCustomTimer ? false : fitPass,
        extraEquipment: (isPingPong || isPlayStation) ? extraEquipment : false,
        ...customOptions,
      },
      linkedBookingId || null
    );
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h4>Start Timer for {table.name}</h4>

        {/* Link to existing booking */}
        {matchingBookings.length > 0 && (
          <div className="booking-link-section">
            <label className="booking-link-label">Start for a booking:</label>
            <select
              className="booking-link-select"
              value={linkedBookingId}
              onChange={(e) => {
                setLinkedBookingId(e.target.value);
                setOverrideWarning(false);
              }}
            >
              <option value="">— No booking (walk-in) —</option>
              {matchingBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.customer_name} · {formatBookingTime(b.booking_at)}
                  {b.hours_count ? ` · ${b.hours_count}h` : ""}
                  {b.tables_count > 1 ? ` · ${b.tables_count} tbl` : ""}
                </option>
              ))}
            </select>
            {linkedBookingId && (
              <div className="booking-link-note">
                Booking will be marked as done when timer starts.
              </div>
            )}
          </div>
        )}

        {/* Booking conflict warning — only when NOT linking a booking */}
        {conflicts.length > 0 && !linkedBookingId && (
          <div className="booking-conflict-warning">
            <div className="conflict-icon">⚠️</div>
            <div className="conflict-text">
              <strong>Upcoming booking conflict!</strong>
              {conflicts.map((b, i) => (
                <div key={b.id || i} className="conflict-detail">
                  {b.customer_name} — {formatBookingTime(b.booking_at)}
                  {b.hours_count ? ` (${b.hours_count}h)` : ""}
                  {b.tables_count > 1 ? ` · ${b.tables_count} tables` : ""}
                </div>
              ))}
              <div className="conflict-note">
                Starting this timer may overlap with {conflicts.length === 1 ? "this booking" : "these bookings"}.
              </div>
            </div>
          </div>
        )}

        <StartModalContentFields
          table={table}
          mode={mode}
          setMode={setMode}
          durationMinutes={durationMinutes}
          setDurationMinutes={setDurationMinutes}
          isPlayStation={isPlayStation}
          isPingPong={isPingPong}
          isCustomTimer={isCustomTimer}
          customName={customName}
          setCustomName={setCustomName}
          customHourlyRate={customHourlyRate}
          setCustomHourlyRate={setCustomHourlyRate}
          isFoosOrHockey={isFoosOrHockey}
          fitPass={fitPass}
          setFitPass={setFitPass}
          extraEquipment={extraEquipment}
          setExtraEquipment={setExtraEquipment}
          validationError={validationError}
        />

        <div className="modal-actions">
          {overrideWarning && !linkedBookingId ? (
            <button onClick={handleStart} className="confirm-start-btn override-btn">
              Start Anyway
            </button>
          ) : (
            <button onClick={handleStart} className="confirm-start-btn">
              {linkedBookingId ? "Start & Fulfill Booking" : "Confirm Start"}
            </button>
          )}
          <button onClick={onClose} className="cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartModal;
