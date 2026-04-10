import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../services/supabaseClient";
import { useTranslation } from "../../i18n/LanguageContext";
import PublicLayout from "../../components/landing/PublicLayout";
import "./EventsListPage.css";

export default function EventsListPage() {
  const { t, lang } = useTranslation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("event_date", { ascending: true })
      .then(({ data }) => {
        setEvents(data || []);
        setLoading(false);
      });
  }, []);

  const upcoming = events.filter((e) => new Date(e.event_date) > new Date());
  const past = events.filter((e) => new Date(e.event_date) <= new Date());
  const dateLang = lang === "ka" ? "ka-GE" : "en-GB";

  return (
    <PublicLayout>
      <div className="mp-events-list-page">
        <section className="mp-events-list-hero mp-dots-white mp-grain">
          <h1>{t("events_title")}</h1>
          <p>{t("events_subtitle")}</p>
        </section>

        <section className="mp-events-list-content">
          {loading ? (
            <p className="mp-events-list-loading">{t("loading")}</p>
          ) : upcoming.length === 0 && past.length === 0 ? (
            <p className="mp-events-list-empty">{t("events_empty")}</p>
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <h2 className="mp-events-list-subtitle">{t("events_upcoming")}</h2>
                  <div className="mp-events-list-grid">
                    {upcoming.map((ev) => (
                      <EventCard key={ev.id} event={ev} dateLang={dateLang} t={t} />
                    ))}
                  </div>
                </>
              )}
              {past.length > 0 && (
                <>
                  <h2 className="mp-events-list-subtitle mp-events-past">{t("events_past")}</h2>
                  <div className="mp-events-list-grid mp-events-list-grid-past">
                    {past.map((ev) => (
                      <EventCard key={ev.id} event={ev} isPast dateLang={dateLang} t={t} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}

function EventCard({ event: ev, isPast, dateLang, t }) {
  return (
    <Link to={`/events/${ev.id}`} className={`mp-events-list-card ${isPast ? "past" : ""}`}>
      {ev.image && (
        <div className="mp-events-list-card-image">
          <img src={ev.image} alt={ev.title} />
        </div>
      )}
      <div className="mp-events-list-card-info">
        <span className="mp-events-list-date">
          {new Date(ev.event_date).toLocaleDateString(dateLang, {
            timeZone: "Asia/Tbilisi",
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <h3>{ev.title}</h3>
        {ev.description && <p>{ev.description.slice(0, 120)}{ev.description.length > 120 ? "..." : ""}</p>}
        <div className="mp-events-list-card-footer">
          {ev.entry_fee > 0 && <span className="mp-events-list-fee">{ev.entry_fee} ₾</span>}
          {ev.max_participants && <span className="mp-events-list-slots">{ev.max_participants} {t("events_spots_left")}</span>}
        </div>
      </div>
    </Link>
  );
}
