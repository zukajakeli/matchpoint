import React from "react";
import PublicLayout from "../components/landing/PublicLayout";
import "./BookingResultPage.css";

export default function BookingCancelledPage() {
  return (
    <PublicLayout>
      <div className="mp-result-page">
        <div className="mp-result-content">
          <div className="mp-result-card cancelled">
            <div className="mp-result-icon cancelled">←</div>
            <h1>Payment Cancelled</h1>
            <p className="mp-result-subtext">
              You cancelled the payment. No charge was made and your slot has been released.
            </p>
            <a href="/book" className="mp-btn mp-btn-primary mp-result-cta">
              Back to Booking
            </a>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
