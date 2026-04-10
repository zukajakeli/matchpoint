import React, { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../services/supabaseClient";
import "./BookingResultPage.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

const GAME_LABELS = {
  pingpong: "Ping-Pong",
  foosball: "Foosball",
  airhockey: "Air Hockey",
  playstation: "PlayStation",
};

function formatLocalDateTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookingSuccessPage() {
  const [booking, setBooking] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | paid | pending | failed | notfound

  useEffect(() => {
    // Try to get order id from URL params first, then sessionStorage
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get("order_id");
    const orderIdSession = sessionStorage.getItem("mp_flitt_order_id");
    const orderId = orderIdParam || orderIdSession;

    if (!orderId || !isSupabaseConfigured || !supabase) {
      setStatus("notfound");
      return;
    }

    // Initial fetch
    const fetchBooking = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, customer_name, tables_count, hours_count, booking_at, game_type, payment_status, amount_charged, masked_card"
        )
        .eq("flitt_order_id", orderId)
        .single();

      if (error || !data) {
        setStatus("notfound");
        return;
      }

      setBooking(data);
      setStatus(data.payment_status === "paid" ? "paid" : data.payment_status === "failed" ? "failed" : "pending");
    };

    fetchBooking();

    // Subscribe to Realtime updates for this booking
    const channel = supabase
      .channel(`booking-success-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `flitt_order_id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new;
          setBooking((prev) => ({ ...prev, ...updated }));
          setStatus(
            updated.payment_status === "paid"
              ? "paid"
              : updated.payment_status === "failed"
              ? "failed"
              : "pending"
          );
          if (updated.payment_status === "paid") {
            sessionStorage.removeItem("mp_flitt_order_id");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="booking-result-page">
      <header className="booking-public-header">
        <a href="/" className="booking-public-logo">
          <img src="/matchpoint-logo.png" alt={VENUE_NAME} />
          <span>{VENUE_NAME}</span>
        </a>
      </header>

      <main className="booking-result-main">
        {status === "loading" && (
          <div className="booking-result-card">
            <div className="result-spinner" />
            <p>Checking your booking…</p>
          </div>
        )}

        {status === "paid" && booking && (
          <div className="booking-result-card success">
            <div className="result-icon">✓</div>
            <h1>Booking Confirmed!</h1>
            <p className="result-subtext">
              Your payment was successful. See you at {VENUE_NAME}!
            </p>
            <div className="result-details">
              <div className="result-detail-row">
                <span>Name</span>
                <strong>{booking.customer_name}</strong>
              </div>
              <div className="result-detail-row">
                <span>Game</span>
                <strong>{GAME_LABELS[booking.game_type] || booking.game_type}</strong>
              </div>
              <div className="result-detail-row">
                <span>Tables</span>
                <strong>{booking.tables_count}</strong>
              </div>
              <div className="result-detail-row">
                <span>Duration</span>
                <strong>{booking.hours_count} hour{booking.hours_count !== 1 ? "s" : ""}</strong>
              </div>
              <div className="result-detail-row">
                <span>Start Time</span>
                <strong>{formatLocalDateTime(booking.booking_at)}</strong>
              </div>
              <div className="result-detail-row">
                <span>Amount Paid</span>
                <strong>{booking.amount_charged} ₾</strong>
              </div>
              {booking.masked_card && (
                <div className="result-detail-row">
                  <span>Card</span>
                  <strong>{booking.masked_card}</strong>
                </div>
              )}
            </div>
            <a href="/book" className="result-cta-btn">
              Make Another Booking
            </a>
          </div>
        )}

        {status === "pending" && (
          <div className="booking-result-card pending">
            <div className="result-icon pending-icon">⏳</div>
            <h1>Payment Processing…</h1>
            <p className="result-subtext">
              Your payment is being processed. This page will update automatically.
            </p>
            <div className="result-spinner" style={{ marginTop: 16 }} />
          </div>
        )}

        {status === "failed" && (
          <div className="booking-result-card failed">
            <div className="result-icon failed-icon">✕</div>
            <h1>Payment Not Completed</h1>
            <p className="result-subtext">
              Your payment was declined or the order expired. No charge was made.
            </p>
            <a href="/book" className="result-cta-btn">
              Try Again
            </a>
          </div>
        )}

        {status === "notfound" && (
          <div className="booking-result-card failed">
            <div className="result-icon failed-icon">?</div>
            <h1>Booking Not Found</h1>
            <p className="result-subtext">
              We couldn&apos;t find a booking associated with this session.
            </p>
            <a href="/book" className="result-cta-btn">
              Back to Booking
            </a>
          </div>
        )}
      </main>

      <footer className="booking-public-footer">
        © {new Date().getFullYear()} {VENUE_NAME}
      </footer>
    </div>
  );
}
