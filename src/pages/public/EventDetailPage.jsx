import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import "./EventDetailPage.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export default function EventDetailPage() {
  const { id } = useParams();
  const { t, lang } = useTranslation();
  const [event, setEvent] = useState(null);
  const [regCount, setRegCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Registration form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !id) return;
    Promise.all([
      supabase.from("events").select("*").eq("id", id).single(),
      supabase
        .from("event_registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id)
        .in("payment_status", ["paid", "pending"]),
    ]).then(([eventRes, countRes]) => {
      if (!eventRes.error) setEvent(eventRes.data);
      setRegCount(countRes.count || 0);
      setLoading(false);
    });
  }, [id]);

  const isFull = event?.max_participants && regCount >= event.max_participants;
  const isPast = event && new Date(event.event_date) < new Date();
  const deadlinePassed = event?.registration_deadline && new Date(event.registration_deadline) < new Date();
  const canRegister = event && !isPast && !deadlinePassed && !isFull && event.is_active;
  const isFree = !event?.entry_fee || event.entry_fee <= 0;
  const dateLang = lang === "ka" ? "ka-GE" : "en-GB";

  const handleRegister = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      setIsSubmitting(true);
      setSubmitError("");

      try {
        const origin = window.location.origin;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-event-registration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            eventId: id,
            participantName: name.trim(),
            participantEmail: email.trim(),
            participantPhone: phone.trim(),
            paymentMethod: isFree ? "offline" : paymentMethod,
            responseUrl: `${origin}/events/${id}?registered=true`,
            cancelUrl: `${origin}/events/${id}?cancelled=true`,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setSubmitError(json.error || "Something went wrong.");
          setIsSubmitting(false);
          return;
        }

        if (json.checkoutUrl) {
          window.location.href = json.checkoutUrl;
        } else {
          setSubmitSuccess(true);
          setIsSubmitting(false);
        }
      } catch {
        setSubmitError("Network error. Please try again.");
        setIsSubmitting(false);
      }
    },
    [isSubmitting, id, name, email, phone, paymentMethod, isFree]
  );

  // Check for return from payment
  const urlParams = new URLSearchParams(window.location.search);
  const justRegistered = urlParams.get("registered") === "true";
  const wasCancelled = urlParams.get("cancelled") === "true";

  if (loading) {
    return <PublicLayout><div className="mp-event-detail-page"><p className="mp-event-detail-loading">{t("loading")}</p></div></PublicLayout>;
  }

  if (!event) {
    return (
      <PublicLayout>
        <div className="mp-event-detail-page">
          <div className="mp-event-detail-empty">
            <h2>Event not found</h2>
            <Link to="/events" className="mp-btn mp-btn-secondary">{t("events_back")}</Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mp-event-detail-page">
        {event.image && (
          <div className="mp-event-detail-cover">
            <img src={event.image} alt={event.title} />
          </div>
        )}

        <div className="mp-event-detail-content">
          <div className="mp-event-detail-main">
            <Link to="/events" className="mp-event-detail-back">{t("events_back")}</Link>
            <h1>{event.title}</h1>
            <div className="mp-event-detail-meta">
              <span className="mp-event-detail-date-tag">
                {new Date(event.event_date).toLocaleDateString(dateLang, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {event.entry_fee > 0 && <span className="mp-event-detail-fee">{event.entry_fee} ₾ {t("events_entry")}</span>}
              {event.max_participants && (
                <span className="mp-event-detail-spots">
                  {Math.max(0, event.max_participants - regCount)} / {event.max_participants} {t("events_spots_left")}
                </span>
              )}
            </div>

            {event.description && (
              <div className="mp-event-detail-desc">
                <p>{event.description}</p>
              </div>
            )}
          </div>

          <div className="mp-event-detail-sidebar">
            {justRegistered && (
              <div className="mp-event-detail-success-box">
                <h3>{t("events_registered")}</h3>
                <p>{t("events_registered_msg")}</p>
              </div>
            )}

            {wasCancelled && (
              <div className="mp-event-detail-error-box">
                <p>{t("events_cancelled_msg")}</p>
              </div>
            )}

            {submitSuccess && (
              <div className="mp-event-detail-success-box">
                <h3>{t("events_registered")}</h3>
                <p>
                  {isFree
                    ? t("events_registered_msg")
                    : t("events_registered_offline")}
                </p>
              </div>
            )}

            {canRegister && !submitSuccess && !justRegistered && (
              <div className="mp-event-detail-reg-card">
                <h3>{t("events_register")}</h3>
                <form onSubmit={handleRegister}>
                  <div className="mp-event-field">
                    <label>{t("events_full_name")}</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder={t("events_full_name")} />
                  </div>
                  <div className="mp-event-field">
                    <label>{t("events_email")}</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                  </div>
                  <div className="mp-event-field">
                    <label>{t("events_phone")}</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+995 5xx xxx xxx" />
                  </div>

                  {!isFree && event.allow_offline_payment && (
                    <div className="mp-event-field">
                      <label>{t("events_payment_method")}</label>
                      <div className="mp-event-payment-options">
                        <button type="button" className={`mp-event-pay-btn ${paymentMethod === "online" ? "selected" : ""}`} onClick={() => setPaymentMethod("online")}>
                          {t("events_pay_online")} ({event.entry_fee} ₾)
                        </button>
                        <button type="button" className={`mp-event-pay-btn ${paymentMethod === "offline" ? "selected" : ""}`} onClick={() => setPaymentMethod("offline")}>
                          {t("events_pay_venue")}
                        </button>
                      </div>
                    </div>
                  )}

                  {submitError && <p className="mp-event-error">{submitError}</p>}

                  <button type="submit" className="mp-btn mp-btn-primary mp-event-submit" disabled={isSubmitting}>
                    {isSubmitting ? t("events_submitting") : t("events_submit_register")}
                  </button>
                </form>
              </div>
            )}

            {isPast && <div className="mp-event-detail-closed">{t("events_ended")}</div>}
            {deadlinePassed && !isPast && <div className="mp-event-detail-closed">{t("events_closed")}</div>}
            {isFull && !isPast && <div className="mp-event-detail-closed">{t("events_full")}</div>}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
