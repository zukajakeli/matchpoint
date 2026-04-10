import React, { useEffect, useState, useMemo, useCallback } from "react";
import BookingForm from "../components/bookings/BookingForm";
import BookingList from "../components/bookings/BookingList";
import {
  createBooking,
  deleteBooking,
  fetchBookings,
  fetchDoneBookings,
  markBookingAsDone,
  subscribeToBookingsChanges,
} from "../services/supabaseData";
import "./BookingsPage.css";

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "online_paid", label: "Online — Paid" },
  { id: "staff", label: "Staff" },
  { id: "pending", label: "Pending" },
];

const GAME_LABELS = {
  pingpong: "Ping-Pong",
  foosball: "Foosball",
  airhockey: "Air Hockey",
  playstation: "PlayStation",
};

function formatHistoryDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Tbilisi",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function BookingsPage() {
  const [bookingName, setBookingName] = useState("");
  const [tablesCount, setTablesCount] = useState("");
  const [hoursCount, setHoursCount] = useState("");
  const [bookingDateTime, setBookingDateTime] = useState("");
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showHistory, setShowHistory] = useState(false);
  const [doneBookings, setDoneBookings] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const loadBookings = async () => {
      try {
        setIsLoading(true);
        const rows = await fetchBookings();
        setBookings(rows);
      } catch (error) {
        console.error("Failed to load bookings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadBookings();

    const unsubscribe = subscribeToBookingsChanges((payload) => {
      const { eventType, new: newBooking, old: oldBooking } = payload;
      if (eventType === "INSERT" && newBooking && !newBooking.is_done) {
        setBookings((prev) => {
          if (prev.some((b) => b.id === newBooking.id)) return prev;
          return [newBooking, ...prev];
        });
      }
      if (eventType === "UPDATE" && newBooking) {
        if (newBooking.is_done) {
          setBookings((prev) => prev.filter((b) => b.id !== newBooking.id));
        } else {
          setBookings((prev) =>
            prev.map((b) => (b.id === newBooking.id ? { ...b, ...newBooking } : b))
          );
        }
      }
      if (eventType === "DELETE" && oldBooking) {
        setBookings((prev) => prev.filter((b) => b.id !== oldBooking.id));
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const created = await createBooking({
        customerName: bookingName.trim(),
        tablesCount: Number(tablesCount),
        hoursCount: hoursCount === "" ? null : Number(hoursCount),
        // Pin datetime-local value to Tbilisi timezone (UTC+4)
        bookingAt: bookingDateTime ? `${bookingDateTime}:00+04:00` : null,
      });
      setBookings((prev) => {
        if (prev.some((b) => b.id === created.id)) return prev;
        return [created, ...prev];
      });
      setBookingName("");
      setTablesCount("");
      setHoursCount("");
      setBookingDateTime("");
    } catch (error) {
      console.error("Failed to create booking:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchDoneBookings(50);
      setDoneBookings(rows);
    } catch (error) {
      console.error("Failed to load booking history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Load history when section is first opened
  useEffect(() => {
    if (showHistory && doneBookings.length === 0 && !historyLoading) {
      loadHistory();
    }
  }, [showHistory, doneBookings.length, historyLoading, loadHistory]);

  const handleMarkDone = async (id) => {
    try {
      const doneBooking = bookings.find((b) => b.id === id);
      await markBookingAsDone(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      // Add to history if visible
      if (doneBooking && showHistory) {
        setDoneBookings((prev) => [{ ...doneBooking, is_done: true, done_at: new Date().toISOString() }, ...prev]);
      }
    } catch (error) {
      console.error("Failed to mark booking as done:", error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } catch (error) {
      console.error("Failed to delete booking:", error);
    }
  };

  // Stats derived from current bookings list
  const stats = useMemo(() => {
    const start = todayStart();
    const todayOnlinePaid = bookings.filter(
      (b) =>
        b.booking_source === "online" &&
        b.payment_status === "paid" &&
        new Date(b.created_at) >= start
    );
    const todayRevenue = todayOnlinePaid.reduce(
      (sum, b) => sum + (Number(b.amount_charged) || 0),
      0
    );
    const pendingCount = bookings.filter((b) => b.payment_status === "pending").length;
    return {
      todayPaidCount: todayOnlinePaid.length,
      todayRevenue: todayRevenue.toFixed(2),
      pendingCount,
    };
  }, [bookings]);

  const filterCounts = useMemo(() => {
    return {
      all: bookings.length,
      online_paid: bookings.filter((b) => b.booking_source === "online" && b.payment_status === "paid").length,
      staff: bookings.filter((b) => b.booking_source === "staff" || !b.booking_source).length,
      pending: bookings.filter((b) => b.payment_status === "pending").length,
    };
  }, [bookings]);

  return (
    <div className="bookings-page">
      <div className="bookings-page-header">
        <h1>Bookings</h1>
      </div>

      {/* Stats bar */}
      <div className="bookings-stats-bar">
        <div className="bookings-stat">
          <span className="stat-value">{stats.todayPaidCount}</span>
          <span className="stat-label">Online paid today</span>
        </div>
        <div className="bookings-stat">
          <span className="stat-value">{stats.todayRevenue} ₾</span>
          <span className="stat-label">Online revenue today</span>
        </div>
        <div className="bookings-stat">
          <span className="stat-value">{stats.pendingCount}</span>
          <span className="stat-label">Pending payments</span>
        </div>
        <a href="/book" target="_blank" rel="noopener noreferrer" className="bookings-public-link">
          Public Booking Page ↗
        </a>
      </div>

      <BookingForm
        bookingName={bookingName}
        setBookingName={setBookingName}
        tablesCount={tablesCount}
        setTablesCount={setTablesCount}
        hoursCount={hoursCount}
        setHoursCount={setHoursCount}
        bookingDateTime={bookingDateTime}
        setBookingDateTime={setBookingDateTime}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Filter tabs */}
      <div className="booking-filter-tabs">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`booking-filter-tab ${activeFilter === tab.id ? "active" : ""}`}
            onClick={() => setActiveFilter(tab.id)}
          >
            {tab.label}
            <span className="filter-count">{filterCounts[tab.id]}</span>
          </button>
        ))}
      </div>

      <BookingList
        bookings={bookings}
        isLoading={isLoading}
        onMarkDone={handleMarkDone}
        onDelete={handleDelete}
        activeFilter={activeFilter}
      />

      {/* Booking History */}
      <div className="booking-history-section">
        <button
          className="booking-history-toggle"
          onClick={() => setShowHistory((prev) => !prev)}
        >
          {showHistory ? "Hide" : "Show"} Booking History
          <span className="history-toggle-arrow">{showHistory ? "▲" : "▼"}</span>
        </button>

        {showHistory && (
          <div className="booking-history-list">
            {historyLoading && (
              <div className="menu-items-loading">
                <span className="btn-spinner" aria-hidden="true" />
                <span>Loading history...</span>
              </div>
            )}
            {!historyLoading && doneBookings.length === 0 && (
              <p className="booking-empty">No completed bookings yet.</p>
            )}
            {!historyLoading && doneBookings.length > 0 && (
              <table className="booking-history-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Source</th>
                    <th>Tables</th>
                    <th>Duration</th>
                    <th>Game</th>
                    <th>Booked For</th>
                    <th>Completed</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {doneBookings.map((b) => (
                    <tr key={b.id}>
                      <td className="history-name">{b.customer_name}</td>
                      <td>
                        <span className={`source-badge ${b.booking_source === "online" ? "online" : "staff"}`}>
                          {b.booking_source === "online" ? "Online" : "Staff"}
                        </span>
                      </td>
                      <td>{b.tables_count}</td>
                      <td>{b.hours_count ? `${b.hours_count}h` : "—"}</td>
                      <td>{GAME_LABELS[b.game_type] || "—"}</td>
                      <td>{formatHistoryDate(b.booking_at)}</td>
                      <td>{formatHistoryDate(b.done_at)}</td>
                      <td className="history-amount">
                        {b.amount_charged != null ? `${Number(b.amount_charged).toFixed(2)} ₾` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!historyLoading && doneBookings.length > 0 && (
              <button className="history-refresh-btn" onClick={loadHistory}>
                Refresh
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
