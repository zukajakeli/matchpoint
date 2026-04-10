import React from "react";

const GAME_LABELS = {
  pingpong: "Ping-Pong",
  foosball: "Foosball",
  airhockey: "Air Hockey",
  playstation: "PlayStation",
};

function PaymentBadge({ status, source }) {
  if (source === "staff" || !source || status === "none" || !status) {
    return <span className="payment-badge staff">Staff</span>;
  }
  if (status === "paid") return <span className="payment-badge paid">Paid</span>;
  if (status === "pending") return <span className="payment-badge pending">Pending</span>;
  if (status === "failed") return <span className="payment-badge failed">Failed</span>;
  return null;
}

function SourceBadge({ source }) {
  if (source === "online") return <span className="source-badge online">Online</span>;
  return <span className="source-badge staff">Staff</span>;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookingList({ bookings, isLoading, onMarkDone, onDelete, activeFilter }) {
  const filtered = bookings.filter((b) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "online_paid") return b.booking_source === "online" && b.payment_status === "paid";
    if (activeFilter === "staff") return b.booking_source === "staff" || !b.booking_source;
    if (activeFilter === "pending") return b.payment_status === "pending";
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(a.booking_at || a.created_at) - new Date(b.booking_at || b.created_at)
  );

  return (
    <div className="booking-card">
      <h2>Bookings {filtered.length > 0 && <span className="booking-count-chip">{filtered.length}</span>}</h2>
      {isLoading && (
        <div className="menu-items-loading">
          <span className="btn-spinner" aria-hidden="true" />
          <span>Loading bookings...</span>
        </div>
      )}
      {!isLoading && sorted.length === 0 && (
        <p className="booking-empty">No bookings match this filter.</p>
      )}
      {sorted.map((booking) => (
        <div className="booking-row" key={booking.id}>
          <div className="booking-main-info">
            <span className="booking-name">{booking.customer_name}</span>
            <div className="booking-badges">
              <SourceBadge source={booking.booking_source} />
              <PaymentBadge status={booking.payment_status} source={booking.booking_source} />
            </div>
          </div>
          <div className="booking-meta">
            {booking.tables_count} table{booking.tables_count > 1 ? "s" : ""}
            {booking.hours_count ? ` · ${booking.hours_count}h` : ""}
            {booking.game_type && GAME_LABELS[booking.game_type]
              ? ` · ${GAME_LABELS[booking.game_type]}`
              : ""}
          </div>
          <div className="booking-time">
            {formatDateTime(booking.booking_at || booking.created_at)}
          </div>
          {booking.amount_charged != null && (
            <div className="booking-amount">{Number(booking.amount_charged).toFixed(2)} ₾</div>
          )}
          {booking.masked_card && (
            <div className="booking-card-info">····{booking.masked_card.slice(-4)}</div>
          )}
          <div className="booking-actions">
            <button
              type="button"
              className="admin-btn admin-btn-primary booking-action-btn"
              onClick={() => onMarkDone(booking.id)}
            >
              Done
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-danger booking-action-btn"
              onClick={() => onDelete(booking.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
