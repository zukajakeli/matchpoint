import React from "react";
import { BOOKABLE_TABLES } from "../../utils/bookableTables";

export default function BookingForm({
  bookingName,
  setBookingName,
  hoursCount,
  setHoursCount,
  bookingDateTime,
  setBookingDateTime,
  selectedTableIds,
  setSelectedTableIds,
  onSubmit,
  isSubmitting,
}) {
  const toggleTable = (id) => {
    setSelectedTableIds((prev) => {
      const set = new Set(prev || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  return (
    <div className="booking-card">
      <h2>Add Booking</h2>
      <form onSubmit={onSubmit} className="booking-form">
        <input
          type="text"
          value={bookingName}
          onChange={(e) => setBookingName(e.target.value)}
          placeholder="Customer Name"
          required
        />
        <input
          type="number"
          min="0"
          step="0.5"
          value={hoursCount}
          onChange={(e) => setHoursCount(e.target.value)}
          placeholder="Number of Hours (optional)"
        />
        <input
          type="datetime-local"
          value={bookingDateTime}
          onChange={(e) => setBookingDateTime(e.target.value)}
          required
        />
        <div className="booking-tables-picker">
          <span className="booking-tables-picker-label">Assign Tables</span>
          <div className="booking-tables-picker-options">
            {BOOKABLE_TABLES.map(({ id, label }) => {
              const isSelected = (selectedTableIds || []).includes(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={`booking-table-chip ${isSelected ? "selected" : ""}`}
                  onClick={() => toggleTable(id)}
                  aria-pressed={isSelected}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <button className="admin-btn admin-btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
          {isSubmitting ? "Saving..." : "Create Booking"}
        </button>
      </form>
    </div>
  );
}

