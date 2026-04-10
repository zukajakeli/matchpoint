import React, { useEffect, useState, useMemo } from "react";
import BookingForm from "../components/bookings/BookingForm";
import BookingList from "../components/bookings/BookingList";
import { AdminLogoutButton } from "../components/admin/AdminAuthGate";
import {
  createBooking,
  deleteBooking,
  fetchBookings,
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
        bookingAt: bookingDateTime ? new Date(bookingDateTime).toISOString() : null,
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

  const handleMarkDone = async (id) => {
    try {
      await markBookingAsDone(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
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
        <AdminLogoutButton />
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
    </div>
  );
}
