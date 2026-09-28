import React, { useEffect, useState } from "react";
import "./TableViewBookingModal.css";

export default function TableViewBookingModal({
  initialState,
  isSubmitting,
  isEditing = false,
  tableOptions,
  onSubmit,
  onDelete,
  onClose,
}) {
  const [bookingName, setBookingName] = useState(initialState.bookingName || "");
  const [hoursCount, setHoursCount] = useState(initialState.hoursCount ?? "1");
  const [bookingDateTime, setBookingDateTime] = useState(
    initialState.bookingDateTime || ""
  );
  const [tableIds, setTableIds] = useState(initialState.tableIds || []);
  const online = initialState.booking?.booking_source === "online" ? initialState.booking : null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleTable = (id) => {
    setTableIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!bookingName.trim() || !bookingDateTime) return;
    onSubmit({
      bookingName,
      hoursCount,
      bookingDateTime,
      tableIds,
    });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (window.confirm("Delete this booking? This cannot be undone.")) {
      onDelete();
    }
  };

  return (
    <div className="table-view-modal-backdrop" onClick={handleBackdropClick}>
      <div className="table-view-modal-card">
        <div className="table-view-modal-header">
          <h2>{isEditing ? "Edit Booking" : "New Booking"}</h2>
          <button
            type="button"
            className="table-view-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {online && (
          <div className="table-view-modal-online">
            <span className={`table-view-modal-online-status ${online.payment_status || ""}`}>
              {online.payment_status === "paid"
                ? `Paid online${online.amount_charged != null ? ` · ${Number(online.amount_charged).toFixed(2)} ₾` : ""}`
                : online.payment_status === "pending"
                ? "Online · awaiting payment"
                : "Online booking"}
            </span>
            {online.customer_phone && <a href={`tel:${online.customer_phone}`}>{online.customer_phone}</a>}
            {online.customer_email && <a href={`mailto:${online.customer_email}`}>{online.customer_email}</a>}
          </div>
        )}
        <form className="table-view-modal-form" onSubmit={handleSubmit}>
          <label className="table-view-modal-field">
            <span>Customer Name</span>
            <input
              type="text"
              value={bookingName}
              onChange={(e) => setBookingName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="table-view-modal-field">
            <span>Date &amp; Time</span>
            <input
              type="datetime-local"
              value={bookingDateTime}
              onChange={(e) => setBookingDateTime(e.target.value)}
              step="3600"
              required
            />
          </label>
          <label className="table-view-modal-field">
            <span>Hours (optional)</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={hoursCount}
              onChange={(e) => setHoursCount(e.target.value)}
              placeholder="e.g. 1"
            />
          </label>
          <div className="table-view-modal-field">
            <span>Assign Tables</span>
            <div className="table-view-modal-tables">
              {tableOptions.map(({ id, label }) => {
                const isSelected = tableIds.includes(id);
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
          <div className="table-view-modal-actions">
            {isEditing && onDelete && (
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Delete
              </button>
            )}
            <div className="table-view-modal-actions-right">
              <button
                type="button"
                className="admin-btn"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
                {isSubmitting
                  ? "Saving..."
                  : isEditing
                  ? "Save Changes"
                  : "Create Booking"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
