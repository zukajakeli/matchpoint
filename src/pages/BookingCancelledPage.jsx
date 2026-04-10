import React from "react";
import "./BookingResultPage.css";

const VENUE_NAME = import.meta.env.VITE_VENUE_NAME || "MatchPoint";

export default function BookingCancelledPage() {
  return (
    <div className="booking-result-page">
      <header className="booking-public-header">
        <a href="/" className="booking-public-logo">
          <img src="/matchpoint-logo.png" alt={VENUE_NAME} />
          <span>{VENUE_NAME}</span>
        </a>
      </header>

      <main className="booking-result-main">
        <div className="booking-result-card cancelled">
          <div className="result-icon cancelled-icon">←</div>
          <h1>Payment Cancelled</h1>
          <p className="result-subtext">
            You cancelled the payment. No charge was made and your slot has been released.
          </p>
          <a href="/book" className="result-cta-btn">
            Back to Booking
          </a>
        </div>
      </main>

      <footer className="booking-public-footer">
        © {new Date().getFullYear()} {VENUE_NAME}
      </footer>
    </div>
  );
}
